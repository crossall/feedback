import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "output", "screenshots", "feedforward-pages");
const PROFILE = path.join(ROOT, "tmp", `capture-report-page-catalog-profile-${process.pid}-${Date.now()}`);
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9441;
const HOST = "https://feedforward.kr";
const WIDTH = 1440;
const HEIGHT = 1100;

await fs.mkdir(OUT, { recursive: true });
await fs.mkdir(PROFILE, { recursive: true });

const categories = {
  entry: "01-entry",
  general: "02-general-evaluation",
  student: "03-project-student",
  results: "04-results-dashboard",
  teacher: "05-teacher-operation",
};

for (const category of Object.values(categories)) {
  await fs.mkdir(path.join(OUT, category), { recursive: true });
}

// Remove an obsolete animation-frame capture from older runs of this catalog.
await fs.rm(path.join(OUT, categories.results, "02-teacher-class-average-chart.png"), { force: true });

const manifest = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJson(url, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
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
      const pending = this.pending.get(payload.id);
      if (!pending) return;
      this.pending.delete(payload.id);
      if (payload.error) pending.reject(new Error(payload.error.message));
      else pending.resolve(payload.result);
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

async function evaluate(cdp, expression) {
  const response = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || "Runtime evaluation failed");
  }
  return response.result?.value;
}

async function waitFor(cdp, expression, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(cdp, `Boolean(${expression})`)) return;
    await pause(250);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function waitForText(cdp, text, timeoutMs = 20000) {
  await waitFor(cdp, `document.body?.innerText.includes(${JSON.stringify(text)})`, timeoutMs);
}

async function navigate(cdp, url, settleMs = 1400) {
  await cdp.send("Page.navigate", { url });
  await waitFor(cdp, "document.readyState === 'complete'", 25000);
  await pause(settleMs);
  await evaluate(cdp, "window.scrollTo(0, 0)");
}

async function writeScreenshot(cdp, relativePath, clip = null) {
  const outputPath = path.join(OUT, relativePath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await evaluate(cdp, `(() => {
    const guideButton = [...document.querySelectorAll('button, [role=button]')]
      .find((node) => node.textContent.replace(/\\s+/g, ' ').trim() === '관람 안내');
    if (guideButton) guideButton.style.display = 'none';
  })()`);
  await pause(120);
  const params = {
    format: "png",
    captureBeyondViewport: true,
    fromSurface: true,
  };
  if (clip) params.clip = { ...clip, scale: 1 };
  const { data } = await cdp.send("Page.captureScreenshot", params);
  await fs.writeFile(outputPath, Buffer.from(data, "base64"));
  process.stdout.write(`captured ${relativePath}\n`);
}

async function captureViewport(cdp, relativePath, {
  title,
  category,
  source,
  description,
  height = HEIGHT,
  scrollY = 0,
} = {}) {
  await evaluate(cdp, `window.scrollTo(0, ${Math.max(0, scrollY)})`);
  await pause(250);
  const documentHeight = await evaluate(cdp, "Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0)");
  const clip = {
    x: 0,
    y: Math.max(0, scrollY),
    width: WIDTH,
    height: Math.max(300, Math.min(height, documentHeight - Math.max(0, scrollY))),
  };
  await writeScreenshot(cdp, relativePath, clip);
  manifest.push({ file: relativePath.replaceAll("\\", "/"), title, category, source, description });
}

async function captureElement(cdp, relativePath, elementExpression, {
  title,
  category,
  source,
  description,
  margin = 20,
  maxHeight = 1100,
  minWidth = 0,
} = {}) {
  const rect = await evaluate(cdp, `(() => {
    const element = (${elementExpression});
    if (!element) return null;
    const box = element.getBoundingClientRect();
    const x = Math.max(0, box.left + window.scrollX - ${margin});
    const y = Math.max(0, box.top + window.scrollY - ${margin});
    const availableWidth = Math.max(1, document.documentElement.scrollWidth - x);
    const width = Math.min(availableWidth, Math.max(box.width + ${margin * 2}, ${minWidth}));
    const availableHeight = Math.max(1, Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0) - y);
    const height = Math.min(availableHeight, Math.min(box.height + ${margin * 2}, ${maxHeight}));
    return { x, y, width, height };
  })()`);
  if (!rect) throw new Error(`Element not found for ${relativePath}`);
  await writeScreenshot(cdp, relativePath, rect);
  manifest.push({ file: relativePath.replaceAll("\\", "/"), title, category, source, description });
}

async function clickByText(cdp, text, selector = "button, [role=button], .role, .node") {
  const clicked = await evaluate(cdp, `(() => {
    const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const element = nodes.find((node) => node.textContent.replace(/\\s+/g, ' ').trim().includes(${JSON.stringify(text)}));
    if (!element) return false;
    element.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Clickable element not found: ${text}`);
  await pause(500);
}

async function chooseSelect(cdp, index, matcher = null) {
  const selected = await evaluate(cdp, `(() => {
    const select = document.querySelectorAll('select')[${index}];
    if (!select) return null;
    const options = [...select.options];
    const option = ${matcher === null
      ? "options.find((item) => item.value)"
      : `options.find((item) => item.textContent.includes(${JSON.stringify(matcher)}))`};
    if (!option) return null;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, option.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return option.textContent.trim();
  })()`);
  if (!selected) throw new Error(`Select option not found at index ${index}: ${matcher || "first value"}`);
  await pause(650);
  return selected;
}

async function fillInput(cdp, selector, value) {
  const filled = await evaluate(cdp, `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!filled) throw new Error(`Input not found: ${selector}`);
}

async function createDemoToken(endpoint, payload) {
  const response = await fetch(`${HOST}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.token) throw new Error(data.error || `Token creation failed for ${endpoint}`);
  return data.token;
}

const selfToken = await createDemoToken("/api/self/class", {
  title: "나의 배움 돌아보기",
  description: "배운 점과 다음에 실천할 일을 차분히 돌아봅니다.",
  teacherId: "30",
  evaluationId: "capture-demo-self-20261030",
  questions: [
    { id: "effort", prompt: "이번 활동에서 스스로 잘했다고 생각하는 점은 무엇인가요?", type: "text", maxScore: 5, required: true },
    { id: "growth", prompt: "다음 활동에서 더 나아지기 위해 무엇을 실천할까요?", type: "text", maxScore: 5, required: true },
    { id: "confidence", prompt: "배운 내용을 설명할 수 있다는 자신감을 선택하세요.", type: "score", maxScore: 5, required: true },
  ],
});

const sessionToken = await createDemoToken("/api/session/class", {
  title: "프로젝트 배움 여정",
  description: "평가와 성찰을 순서대로 진행하며 다음 배움을 준비합니다.",
  teacherId: "30",
  evaluationId: "capture-demo-session-20261030",
  studentResultSharing: { enabled: false, anonymizeRespondents: true, minPeerResponses: 2 },
  steps: [
    {
      id: "step-self",
      kind: "self",
      title: "나의 참여 돌아보기",
      required: true,
      questions: [
        { id: "participation", prompt: "이번 활동에 얼마나 적극적으로 참여했나요?", type: "score", maxScore: 5, required: true },
        { id: "learning", prompt: "새롭게 알게 된 점을 구체적으로 적어 보세요.", type: "text", maxScore: 5, required: true },
      ],
    },
    {
      id: "step-reflection",
      kind: "reflection",
      title: "다음 배움 계획하기",
      required: true,
      questions: [
        "친구의 의견을 듣고 바꾸거나 보완한 점은 무엇인가요?",
        "다음 프로젝트에서 새롭게 시도하고 싶은 것은 무엇인가요?",
      ],
    },
  ],
});

const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  `--window-size=${WIDTH},${HEIGHT}`,
  "about:blank",
], { stdio: "ignore", windowsHide: true });

let cdp;
try {
  const targets = await waitForJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = targets.find((target) => target.type === "page");
  if (!page) throw new Error("No Chrome page target available");
  cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // 01. Entry screens
  await navigate(cdp, `${HOST}/project_expo?capture=entry`);
  await waitForText(cdp, "오늘은 어떤 역할인가요?");
  await captureViewport(cdp, `${categories.entry}/01-project-expo-role-selection.png`, {
    title: "프로젝트형 평가 역할 선택",
    category: "진입 화면",
    source: "/project_expo",
    description: "교사와 학생이 같은 플랫폼에서 역할별 흐름으로 진입하는 화면",
    height: 900,
  });

  await clickByText(cdp, "학생", ".role");
  await waitForText(cdp, "나를 선택해 주세요");
  await chooseSelect(cdp, 0, "6학년 1반");
  await waitFor(cdp, "document.querySelectorAll('select').length >= 2");
  await chooseSelect(cdp, 1, "1반_1모둠");
  await waitFor(cdp, "document.querySelectorAll('select').length >= 3");
  await captureViewport(cdp, `${categories.entry}/02-project-expo-student-entry.png`, {
    title: "학생 반·모둠·이름 선택",
    category: "진입 화면",
    source: "/project_expo",
    description: "학생이 자신의 반과 모둠, 가명 계정을 고르는 화면",
    height: 880,
  });
  await chooseSelect(cdp, 2, "학생 1");

  // 02. Generic evaluation screens
  await navigate(cdp, `${HOST}/?class=capture-current-disabled`);
  await waitForText(cdp, "학생이 직접");
  await captureViewport(cdp, `${categories.general}/01-pdf-student-submission-notice.png`, {
    title: "PDF 평가 학생 안내",
    category: "범용 평가",
    source: "/?class=…",
    description: "현재 개인정보 보호 정책에 따라 학생 직접 제출이 중단되었음을 안내하는 화면",
    height: 960,
  });

  await navigate(cdp, `${HOST}/docs`);
  await waitForText(cdp, "학생이 직접");
  await captureViewport(cdp, `${categories.general}/02-docs-student-submission-notice.png`, {
    title: "Google Docs 평가 학생 안내",
    category: "범용 평가",
    source: "/docs",
    description: "Google Docs 작품을 교사가 수집해 평가하는 현재 운영 방식을 안내하는 화면",
    height: 960,
  });

  await navigate(cdp, `${HOST}/self?class=${encodeURIComponent(selfToken)}`);
  await waitForText(cdp, "나의 배움 돌아보기");
  await captureViewport(cdp, `${categories.general}/03-self-evaluation-student-form.png`, {
    title: "학생 자기평가 화면",
    category: "범용 평가",
    source: "/self?class=…",
    description: "서술형 성찰과 자신감 척도를 함께 사용하는 비식별 자기평가 예시",
    height: 1080,
  });

  await navigate(cdp, `${HOST}/session?class=${encodeURIComponent(sessionToken)}`);
  await waitForText(cdp, "프로젝트 배움 여정");
  await captureViewport(cdp, `${categories.general}/04-session-student-journey.png`, {
    title: "단계형 평가 세션 학생 화면",
    category: "범용 평가",
    source: "/session?class=…",
    description: "자기평가와 다음 배움 계획을 순서대로 진행하는 단계형 화면",
    height: 1080,
  });

  // 03. Project student flow (read-only demo copy)
  await navigate(cdp, `${HOST}/project_expo?capture=student`);
  await waitForText(cdp, "오늘은 어떤 역할인가요?");
  await clickByText(cdp, "학생", ".role");
  await waitForText(cdp, "나를 선택해 주세요");
  await chooseSelect(cdp, 0, "6학년 1반");
  await waitFor(cdp, "document.querySelectorAll('select').length >= 2");
  await chooseSelect(cdp, 1, "1반_1모둠");
  await waitFor(cdp, "document.querySelectorAll('select').length >= 3");
  await chooseSelect(cdp, 2, "학생 1");
  await clickByText(cdp, "평가 시작하기", "button");
  await waitFor(cdp, "document.querySelectorAll('.node').length >= 6", 25000);
  await waitForText(cdp, "AI 피드백 받기");
  await pause(1000);

  await captureElement(cdp, `${categories.student}/01-student-ai-feedforward.png`, "document.querySelector('.layout')", {
    title: "학생 AI 피드포워드 화면",
    category: "프로젝트 학생 화면",
    source: "/project_expo · 학생 · AI 피드백",
    description: "초안과 루브릭을 바탕으로 잘한 점과 다음 수정 방향을 확인하는 화면",
    margin: 10,
    maxHeight: 1050,
    minWidth: 1200,
  });

  for (const [label, filename, title, description] of [
    ["최종 결과물 제출", "02-student-final-submission.png", "학생 최종 결과물 제출", "AI 피드포워드를 반영한 수정본을 제출하는 화면"],
    ["동료평가", "03-student-peer-evaluation.png", "학생 동료평가", "다른 모둠의 결과물을 루브릭으로 읽고 평가하는 화면"],
    ["협업평가", "04-student-collaboration-evaluation.png", "학생 협업평가", "같은 모둠 친구의 역할 수행과 협업 과정을 평가하는 화면"],
  ]) {
    await clickByText(cdp, label, ".node:not(.locked)");
    await waitForText(cdp, label);
    await pause(500);
    await captureElement(cdp, `${categories.student}/${filename}`, "document.querySelector('.layout')", {
      title,
      category: "프로젝트 학생 화면",
      source: `/project_expo · 학생 · ${label}`,
      description,
      margin: 10,
      maxHeight: 1020,
      minWidth: 1200,
    });
  }

  // Student result: include only the header and the first score card; exclude free-text comments.
  await clickByText(cdp, "평가결과 확인", ".node:not(.locked)");
  await waitFor(cdp, "[...document.querySelectorAll('h1')].some((node) => node.textContent.trim() === '평가결과 확인')", 25000);
  await waitForText(cdp, "나의 최종 점수");
  await pause(800);
  await captureElement(cdp, `${categories.results}/01-student-result-score-card.png`, `(() => {
    const heading = [...document.querySelectorAll('h1')].find((node) => node.textContent.trim() === '평가결과 확인');
    const section = heading?.closest('.fade');
    if (!section) return null;
    const card = section.querySelector('.card.pad-lg');
    if (!card) return section;
    const wrapper = document.createElement('div');
    wrapper.dataset.captureWrapper = 'student-result';
    wrapper.style.background = '#fff';
    wrapper.style.padding = '20px';
    heading.parentElement.parentElement.before(wrapper);
    wrapper.append(heading.parentElement.parentElement, card);
    return wrapper;
  })()`, {
    title: "학생 개인 평가 결과",
    category: "결과 화면",
    source: "/project_expo · 학생 · 평가결과 확인",
    description: "자유서술 의견을 제외하고 최종 점수·동료평가·협업평가만 보여 주는 안전한 결과 화면",
    margin: 12,
    maxHeight: 780,
    minWidth: 820,
  });

  // 04. Teacher demo: settings, rubric, and anonymized aggregate results.
  await evaluate(cdp, "localStorage.removeItem('project_expo:me_identity')");
  await navigate(cdp, `${HOST}/project_expo?capture=teacher`);
  await waitForText(cdp, "오늘은 어떤 역할인가요?");
  await clickByText(cdp, "선생님", ".role");
  await waitForText(cdp, "교사용 페이지");
  await pause(900);
  await captureViewport(cdp, `${categories.teacher}/01-project-settings-read-only.png`, {
    title: "프로젝트 설정",
    category: "교사 운영 화면",
    source: "/project_expo · 교사 · 프로젝트 설정",
    description: "프로젝트 목표와 학생 안내를 설계하는 읽기 전용 전시 화면",
    height: 1050,
  });

  await clickByText(cdp, "평가 루브릭", "button");
  await waitForText(cdp, "AI 피드백용");
  await pause(500);
  await captureViewport(cdp, `${categories.teacher}/02-rubric-design-read-only.png`, {
    title: "평가 루브릭 설계",
    category: "교사 운영 화면",
    source: "/project_expo · 교사 · 평가 루브릭",
    description: "AI 피드포워드·동료평가·협업평가 기준을 목적에 따라 구분한 화면",
    height: 1080,
  });

  await clickByText(cdp, "결과 통합조회", "button");
  await waitForText(cdp, "반별 평균 평가 결과", 25000);
  await captureElement(cdp, `${categories.results}/03-teacher-class-average-table.png`, `(() => {
    const heading = [...document.querySelectorAll('h2')].find((node) => node.textContent.includes('반별 평균 평가 결과'));
    const tables = [...document.querySelectorAll('table.tbl')];
    return tables.find((table) => !heading || table.getBoundingClientRect().top > heading.getBoundingClientRect().top) || tables[0];
  })()`, {
    title: "교사 반별 평균 결과표",
    category: "결과 화면",
    source: "/project_expo · 교사 · 결과 통합조회",
    description: "개인 이름 없이 반별 평균과 제출 현황을 한눈에 확인하는 집계표",
    margin: 18,
    maxHeight: 620,
    minWidth: 980,
  });

  // 05. Project 4: role screen, stage control, AI judgement, and junior results.
  await navigate(cdp, `${HOST}/project4?capture=entry`);
  await waitForText(cdp, "계절의 비밀을");
  await captureViewport(cdp, `${categories.entry}/03-project4-role-selection.png`, {
    title: "프로젝트별 평가 역할 선택",
    category: "진입 화면",
    source: "/project4",
    description: "6학년 학생·5학년 후배·교사 역할을 나눈 프로젝트 전용 진입 화면",
    height: 950,
  });

  await clickByText(cdp, "평가 운영하기", "button");
  await waitFor(cdp, "document.querySelector('input[type=password]')");
  await fillInput(cdp, "input[type=password]", "4523");
  await evaluate(cdp, "document.querySelector('input[type=password]').closest('form').requestSubmit()");
  await waitForText(cdp, "계절의 비밀 평가 운영", 25000);
  await clickByText(cdp, "단계 열기", "button");
  await waitForText(cdp, "학생 단계 열기");
  await pause(600);
  await captureViewport(cdp, `${categories.teacher}/03-project4-stage-control.png`, {
    title: "프로젝트 학생 단계 제어",
    category: "교사 운영 화면",
    source: "/project4 · 교사 · 단계 열기",
    description: "학생에게 공개할 평가 단계를 수업 흐름에 맞춰 관리하는 화면",
    height: 1050,
  });

  await clickByText(cdp, "실명 결과", "button");
  await waitForText(cdp, "실명 결과 조회", 25000);
  await waitFor(cdp, "document.querySelector('[class*=resultStats]')", 25000);
  await clickByText(cdp, "6학년 2반", "[class*=classResultTabs] button");
  await waitForText(cdp, "6학년 2반 · 종합결과");
  await waitFor(cdp, `[...document.querySelectorAll('[class*=resultStats] strong')]
    .some((node) => Number(node.textContent.trim()) > 0)`, 30000);
  await evaluate(cdp, `(() => {
    const label = [...document.querySelectorAll('[class*=resultDashboardHead] span')]
      .find((node) => node.textContent.includes('실명 결과 조회'));
    if (label) label.textContent = '통합 결과 조회';
    document.querySelectorAll('[class*=summaryTable] tbody tr td:nth-child(3) b').forEach((node) => {
      node.textContent = '익명 작품';
    });
  })()`);
  await pause(500);
  await captureElement(cdp, `${categories.results}/02-project4-teacher-summary.png`, "document.querySelector('[class*=resultDashboard]')", {
    title: "교사 프로젝트 통합 결과",
    category: "결과 화면",
    source: "/project4 · 교사 · 통합 결과",
    description: "평가 종류별 완료 건수와 모둠별 진행 현황을 확인하고 대표 학생 이름은 가린 화면",
    margin: 12,
    maxHeight: 900,
    minWidth: 1180,
  });

  await navigate(cdp, `${HOST}/project4?capture=student`);
  await waitForText(cdp, "계절의 비밀을");
  await clickByText(cdp, "프로젝트 평가 시작", "button");
  await waitFor(cdp, "document.querySelectorAll('select').length >= 3");
  await chooseSelect(cdp, 0, "6학년 2반");
  await chooseSelect(cdp, 1, "2모둠");
  await chooseSelect(cdp, 2, null);
  await clickByText(cdp, "평가 시작", "button");
  await waitFor(cdp, "document.querySelector('[class*=journey]')", 25000);
  await clickByText(cdp, "AI 피드백 판단", "[class*=journey] button");
  await waitFor(cdp, "document.querySelectorAll('[class*=aiFeedbackList] article').length >= 5", 25000);
  await evaluate(cdp, `(() => {
    const title = document.querySelector('[class*=studentHead] h1');
    if (title) title.textContent = '익명 학생의 평가 여정';
    const meta = document.querySelector('[class*=studentHead] p');
    if (meta) meta.textContent = '6학년 · 익명 모둠';
    const file = document.querySelector('[class*=groupFeedbackMeta] span');
    if (file) file.textContent = '익명 모둠 대본.pdf';
  })()`);
  await pause(400);
  await captureElement(cdp, `${categories.student}/05-project4-ai-judgement.png`, "document.querySelector('[class*=studentShell]')", {
    title: "프로젝트 AI 피드백 판단",
    category: "프로젝트 학생 화면",
    source: "/project4 · 학생 · AI 피드백 판단",
    description: "AI 의견을 그대로 수용하지 않고 근거를 확인해 반영 여부를 결정하는 화면",
    margin: 10,
    maxHeight: 1080,
    minWidth: 1200,
  });

  for (const [index, filename, title, description] of [
    [0, "06-project4-ai-accept-card.png", "AI 피드백 반영 판단 사례", "근거를 확인한 뒤 AI 제안을 반영하기로 한 학생 판단 카드"],
    [2, "07-project4-ai-reject-card.png", "AI 피드백 비반영 판단 사례", "근거를 확인한 뒤 AI 제안을 반영하지 않기로 한 학생 판단 카드"],
  ]) {
    await captureElement(cdp, `${categories.student}/${filename}`, `document.querySelectorAll('[class*=aiFeedbackList] article')[${index}]`, {
      title,
      category: "프로젝트 학생 화면",
      source: "/project4 · 학생 · AI 피드백 판단",
      description,
      margin: 12,
      maxHeight: 900,
      minWidth: 900,
    });
  }

  await clickByText(cdp, "후배 평가", "[class*=journey] button");
  await waitForText(cdp, "후배들의 이해 확인 기다리기");
  await evaluate(cdp, `(() => {
    document.querySelectorAll('[class*=resultOverview] section').forEach((section) => {
      const heading = section.querySelector('h3')?.textContent || '';
      if (!heading.includes('후배들의 퀴즈 변화')) section.style.display = 'none';
      else section.style.gridColumn = '1 / -1';
    });
  })()`);
  await pause(400);
  await captureElement(cdp, `${categories.results}/04-project4-junior-result.png`, "document.querySelector('[class*=studentWork]')", {
    title: "후배 평가 결과",
    category: "결과 화면",
    source: "/project4 · 학생 · 후배 평가",
    description: "자유서술 의견을 제외하고 후배의 이해도 분포와 사전·사후 퀴즈 변화만 보여 주는 화면",
    margin: 14,
    maxHeight: 820,
    minWidth: 1100,
  });

  await fs.writeFile(path.join(OUT, "index.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`manifest ${manifest.length} captures\n${OUT}\n`);
} finally {
  if (cdp) cdp.close();
  chrome.kill();
}
