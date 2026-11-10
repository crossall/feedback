import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "tmp", "pdfs", "platform-captures");
const PROFILE = path.join(OUT, "profile-project4-report");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333;
const BASE = "https://feedforward.kr/project4";

await fs.mkdir(OUT, { recursive: true });
await fs.mkdir(PROFILE, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  "--window-size=1440,1200",
  "about:blank",
], { stdio: "ignore", windowsHide: true });

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJson(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {}
    await pause(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class Cdp {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (!payload.id) return;
      const item = this.pending.get(payload.id);
      if (!item) return;
      this.pending.delete(payload.id);
      if (payload.error) item.reject(new Error(payload.error.message));
      else item.resolve(payload.result);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return result;
  }

  close() {
    this.ws.close();
  }
}

async function evaluate(cdp, expression, awaitPromise = true) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  }
  return result.result?.value;
}

async function waitFor(cdp, expression, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(cdp, `Boolean(${expression})`)) return;
    await pause(250);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function navigate(cdp, url) {
  await cdp.send("Page.navigate", { url });
  await waitFor(cdp, "document.readyState === 'complete'", 20000);
  await pause(1200);
}

async function writeScreenshot(cdp, filename, clip = null) {
  const params = { format: "png", captureBeyondViewport: true, fromSurface: true };
  if (clip) params.clip = { ...clip, scale: 1 };
  const { data } = await cdp.send("Page.captureScreenshot", params);
  await fs.writeFile(path.join(OUT, filename), Buffer.from(data, "base64"));
}

async function clickByText(cdp, text) {
  const found = await evaluate(cdp, `(() => {
    const el = [...document.querySelectorAll('button')].find((node) => node.textContent.includes(${JSON.stringify(text)}));
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!found) throw new Error(`Button not found: ${text}`);
}

async function chooseSelect(cdp, index, matcher) {
  const value = await evaluate(cdp, `(() => {
    const select = document.querySelectorAll('select')[${index}];
    if (!select) return null;
    const option = [...select.options].find((item) => item.textContent.includes(${JSON.stringify(matcher)}));
    if (!option) return null;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, option.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return option.value;
  })()`);
  if (!value) throw new Error(`Select option not found: ${matcher}`);
  await pause(500);
}

let cdp;
try {
  const targets = await waitForJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = targets.find((item) => item.type === "page");
  if (!page) throw new Error("No Chrome page target available");
  cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Teacher stage controls: logging in and switching tabs are read-only.
  await navigate(cdp, BASE);
  await clickByText(cdp, "평가 운영하기");
  await waitFor(cdp, "document.querySelector('input[type=password]')");
  await evaluate(cdp, `(() => {
    const input = document.querySelector('input[type=password]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '4523');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.closest('form').requestSubmit();
  })()`);
  await waitFor(cdp, "[...document.querySelectorAll('button')].some((node) => node.textContent.includes('단계 열기'))", 20000);
  await clickByText(cdp, "단계 열기");
  await waitFor(cdp, "document.body.textContent.includes('학생 단계 열기')");
  await pause(800);
  const teacherClip = await evaluate(cdp, `(() => {
    const target = [...document.querySelectorAll('h2')].find((el) => el.textContent.includes('학생 단계 열기'))?.closest('div[class]')?.parentElement;
    const studio = document.querySelector('main section');
    const rect = (target || studio).getBoundingClientRect();
    return { x: Math.max(0, rect.left - 24), y: Math.max(0, rect.top + scrollY - 20), width: Math.min(document.documentElement.scrollWidth, rect.width + 48), height: Math.min(820, rect.height + 40) };
  })()`);
  await writeScreenshot(cdp, "project4-stage-controls.png", teacherClip);

  // Student AI cards: selecting an identity and viewing a stage do not alter records.
  await navigate(cdp, BASE);
  await clickByText(cdp, "프로젝트 평가 시작");
  await waitFor(cdp, "document.querySelectorAll('select').length >= 3");
  await chooseSelect(cdp, 0, "6학년 2반");
  await chooseSelect(cdp, 1, "2모둠");
  const pickedStudent = await evaluate(cdp, `(() => {
    const select = document.querySelectorAll('select')[2];
    const option = [...select.options].find((item) => item.value);
    if (!option) return null;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, option.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return option.value;
  })()`);
  if (!pickedStudent) throw new Error("No student option available");
  await pause(400);
  await clickByText(cdp, "평가 시작");
  await waitFor(cdp, "document.querySelector('[class*=journey]')", 20000);
  await clickByText(cdp, "AI 피드백 판단");
  await waitFor(cdp, "document.querySelectorAll('[class*=aiFeedbackList] article').length >= 5", 20000);
  await evaluate(cdp, `(() => {
    const title = document.querySelector('[class*=studentHead] h1');
    if (title) title.textContent = '익명 학생의 평가 여정';
    const studentMeta = document.querySelector('[class*=studentHead] p');
    if (studentMeta) studentMeta.textContent = '6학년 · 익명 모둠';
    const file = document.querySelector('[class*=groupFeedbackMeta] span');
    if (file) file.textContent = '익명 모둠 대본.pdf';
  })()`);
  await pause(500);

  for (const [index, filename] of [[0, "project4-ai-accept.png"], [2, "project4-ai-reject.png"]]) {
    const clip = await evaluate(cdp, `(() => {
      const article = document.querySelectorAll('[class*=aiFeedbackList] article')[${index}];
      const rect = article.getBoundingClientRect();
      return { x: Math.max(0, rect.left - 12), y: Math.max(0, rect.top + scrollY - 12), width: rect.width + 24, height: rect.height + 24 };
    })()`);
    await writeScreenshot(cdp, filename, clip);
  }

  process.stdout.write(`${OUT}\n`);
} finally {
  if (cdp) cdp.close();
  chrome.kill();
}
