import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TARGET_URL = process.env.PROJECT1_TEST_URL || "https://feedforward.kr/project1";
const PORT = 9227;
const TEST_PDF_BASE64 = await readFile(path.join(process.cwd(), "public", "project_end.pdf"), "base64");

const testConfig = {
  project: {
    title: "테스트 식물 안내서 만들기",
    subject: "식물",
    desc: "테스트용 프로젝트입니다.",
  },
  settings: { selfInCollab: true },
  rubric: {
    aiFeedback: {
      title: "결과물 평가 · AI 피드백용",
      desc: "사실 확인 포함 테스트 루브릭",
      items: [
        {
          no: 1,
          name: "구조·기능·사실 정확성",
          high: 20,
          mid: 16,
          low: 12,
          hi: "과학적 사실에 맞게 설명했다",
          mi: "일부 내용은 확인이 필요하다",
          lo: "중요한 사실 오류가 있다",
        },
        {
          no: 2,
          name: "쉬운 설명",
          high: 20,
          mid: 16,
          low: 12,
          hi: "쉽게 설명했다",
          mi: "대체로 쉽다",
          lo: "어렵다",
        },
      ],
    },
    peer: {
      title: "동료 양적평가",
      desc: "테스트",
      items: [
        { no: 1, name: "내용이 잘 전달됨", high: 15, mid: 12, low: 9, hi: "분명하다", mi: "대체로 전해진다", lo: "기본 내용만 있다" },
        { no: 2, name: "쉽게 읽힘", high: 15, mid: 12, low: 9, hi: "쉽다", mi: "대체로 쉽다", lo: "어렵다" },
      ],
    },
    peerOpen: [
      { id: "good", label: "좋은 점", placeholder: "좋은 점" },
      { id: "improve", label: "더 좋아질 점", placeholder: "더 좋아질 점" },
    ],
    collab: {
      title: "협업 평가",
      desc: "테스트",
      items: [
        { no: 1, name: "참여와 적극성", high: 15, mid: 12, low: 9, hi: "적극적", mi: "꾸준함", lo: "참여함" },
        { no: 2, name: "책임감", high: 15, mid: 12, low: 9, hi: "충실함", mi: "해냄", lo: "도움받음" },
      ],
    },
    collabOpen: [
      { id: "good", label: "잘한 점", placeholder: "잘한 점" },
      { id: "improve", label: "개선할 점", placeholder: "개선할 점" },
    ],
  },
  classes: [{ id: "c3", name: "6학년 3반" }],
  groups: [
    { id: "g31", classId: "c3", name: "3반_1모둠", members: ["학생A", "학생B"] },
    { id: "g32", classId: "c3", name: "3반_2모둠", members: ["학생C", "학생D"] },
  ],
};

const initScript = `
(() => {
  window.__PROJECT1_E2E_ERRORS__ = [];
  window.addEventListener("error", (event) => {
    window.__PROJECT1_E2E_ERRORS__.push(event.message || String(event.error || event));
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    window.__PROJECT1_E2E_ERRORS__.push(reason?.message || String(reason));
  });
  window.__projectStorageScope = "project1";
  const prefix = "project1-e2e:";
  const skey = (key, shared) => prefix + (shared ? "S:" : "U:") + key;
  const initialConfig = ${JSON.stringify(testConfig)};
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(prefix)) localStorage.removeItem(key);
  }
  localStorage.setItem(skey("pj_config", true), JSON.stringify(initialConfig));
  localStorage.setItem(skey("pj_student_stage_control", true), JSON.stringify({ byClass: { c3: "final" }, updatedAt: Date.now() }));
  window.storage = {
    async get(key, shared = true) {
      const value = localStorage.getItem(skey(key, shared));
      return value === null ? null : { value };
    },
    async set(key, value, shared = true) {
      if (value === "null") localStorage.removeItem(skey(key, shared));
      else localStorage.setItem(skey(key, shared), value);
      return { value };
    },
    async list(prefixKey, shared = true) {
      const storagePrefix = skey(prefixKey, shared);
      const keys = Object.keys(localStorage)
        .filter((key) => key.startsWith(storagePrefix))
        .map((key) => key.slice((prefix + (shared ? "S:" : "U:")).length));
      return { keys };
    },
  };
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("/api/project1/claude")) {
      const payload = JSON.stringify({
        text: JSON.stringify({
          summary: "찔레꽃 안내서 요약",
          items: [
            { no: 1, rating: "하", score: 12, reason: "검색 대조 결과 사실 오류 있음" },
            { no: 2, rating: "상", score: 20, reason: "초등학생이 이해하기 쉬움" }
          ],
          good: "사진과 쉬운 설명이 좋아요.",
          improve: "사실 확인: 찔레꽃의 기관 설명 중 잘못된 부분을 자료로 다시 확인해 고쳐 보세요."
        }),
        webSearchRequests: 1
      });
      return new Response(payload, { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return originalFetch(input, init);
  };
})();
`;

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else {
        this.events.push(msg);
      }
    };
  }
  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 15000);
    });
  }
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, label, timeout = 20000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      last = error;
    }
    await wait(250);
  }
  throw new Error(`Timed out waiting for ${label}${last ? `: ${last.message}` : ""}`);
}

async function evalExpr(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(detail || "Runtime exception");
  }
  return result.result.value;
}

async function clickText(cdp, text, exact = false) {
  const matcher = exact
    ? `el.textContent.trim() === ${JSON.stringify(text)}`
    : `el.textContent.includes(${JSON.stringify(text)})`;
  return evalExpr(cdp, `
    (() => {
      const els = [...document.querySelectorAll('button, .role, .node, .tab')];
      const el = els.find((el) => ${matcher} && !el.disabled);
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    })()
  `);
}

async function clickButton(cdp, text, exact = false) {
  const matcher = exact
    ? `el.textContent.trim() === ${JSON.stringify(text)}`
    : `el.textContent.includes(${JSON.stringify(text)})`;
  return evalExpr(cdp, `
    (() => {
      const els = [...document.querySelectorAll('button')];
      const el = els.find((el) => ${matcher} && !el.disabled);
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    })()
  `);
}

async function clickRole(cdp, text) {
  return evalExpr(cdp, `
    (() => {
      const roles = [...document.querySelectorAll('.role')];
      const role = roles.find((el) => el.querySelector('.h2')?.textContent.trim() === ${JSON.stringify(text)});
      if (!role) return false;
      role.scrollIntoView({ block: 'center' });
      role.click();
      return true;
    })()
  `);
}

async function setSelectByLabel(cdp, label, value) {
  return evalExpr(cdp, `
    (() => {
      const labels = [...document.querySelectorAll('label')];
      const labelEl = labels.find((el) => el.textContent.trim() === ${JSON.stringify(label)});
      if (!labelEl) return false;
      const field = labelEl.closest('.field');
      const select = field?.querySelector('select');
      if (!select) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, ${JSON.stringify(value)});
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()
  `);
}

async function fillPassword(cdp, value) {
  return evalExpr(cdp, `
    (() => {
      const input = document.querySelector('input[type="password"]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()
  `);
}

async function uploadPdf(cdp, name) {
  return evalExpr(cdp, `
    (async () => {
      const input = document.querySelector('input[type="file"]');
      if (!input) return false;
      const bytes = Uint8Array.from(atob(${JSON.stringify(TEST_PDF_BASE64)}), (c) => c.charCodeAt(0));
      const file = new File([bytes], ${JSON.stringify(name)}, { type: 'application/pdf' });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()
  `);
}

async function pageText(cdp) {
  return evalExpr(cdp, `document.body?.innerText || ""`);
}

async function storageValue(cdp, key, shared = true) {
  return evalExpr(cdp, `
    (async () => {
      const r = await window.storage.get(${JSON.stringify(key)}, ${JSON.stringify(shared)});
      return r?.value || null;
    })()
  `);
}

async function setShared(cdp, key, value) {
  return evalExpr(cdp, `
    (async () => {
      await window.storage.set(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(value))}, true);
      return true;
    })()
  `);
}

async function main() {
  const userDataDir = await mkdtemp(path.join(tmpdir(), "project1-e2e-"));
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ], { stdio: "ignore" });

  try {
    await waitFor(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
        return res.ok;
      } catch {
        return false;
      }
    }, "Chrome CDP");

    const tabs = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json());
    const tab = tabs.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
    if (!tab) throw new Error("No Chrome page target found");
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    const cdp = new Cdp(ws);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: initScript });
    await cdp.send("Page.navigate", { url: TARGET_URL });
    await waitFor(async () => (await pageText(cdp)).includes("오늘은 어떤 역할인가요?"), "role gate");

    const checks = [];
    const ok = (name, passed, detail = "") => {
      checks.push({ name, passed: Boolean(passed), detail });
      if (!passed) throw new Error(`${name} failed ${detail}`);
    };

    ok("role gate visible", (await pageText(cdp)).includes("선생님") && (await pageText(cdp)).includes("학생"));
    ok("open student", await clickRole(cdp, "학생"));
    await waitFor(async () => (await pageText(cdp)).includes("나를 선택해 주세요"), "student picker");
    ok("select class", await setSelectByLabel(cdp, "우리 반", "c3"));
    await waitFor(async () => (await pageText(cdp)).includes("우리 모둠"), "group picker");
    ok("select group", await setSelectByLabel(cdp, "우리 모둠", "g31"));
    await waitFor(async () => (await pageText(cdp)).includes("내 이름"), "name picker");
    ok("select name", await setSelectByLabel(cdp, "내 이름", "학생A"));
    ok("start student", await clickButton(cdp, "평가 시작하기"));
    await waitFor(async () => (await pageText(cdp)).includes("초안 PDF를 여기에 올려주세요"), "AI upload step");

    ok("upload draft pdf", await uploadPdf(cdp, "draft-test.pdf"));
    ok("run AI feedback", await clickButton(cdp, "AI 피드백 받기"));
    await waitFor(async () => (await pageText(cdp)).includes("사실 확인:"), "AI feedback result", 30000);
    const draftRaw = await storageValue(cdp, "pj_draft_g31", true);
    const draft = JSON.parse(draftRaw);
    ok("draft saved", Boolean(draftRaw));
    ok("draft stores pdfData", Boolean(draft.pdfData?.startsWith("data:application/pdf;base64,")));
    ok("AI fact-check feedback shown", draft.improve.includes("사실 확인:"));

    ok("go final step", await clickButton(cdp, "다음: 최종 결과물 올리기"));
    await waitFor(async () => (await pageText(cdp)).includes("최종 결과물 PDF를 올려주세요"), "final upload step");
    ok("upload final pdf", await uploadPdf(cdp, "final-test.pdf"));
    ok("submit final", await clickButton(cdp, "최종 결과물 제출"));
    await wait(3000);
    const finalRaw = await storageValue(cdp, "pj_sub_g31", true);
    if (!finalRaw) {
      const keys = await evalExpr(cdp, `Object.keys(localStorage).filter((key) => key.startsWith("project1-e2e:")).sort()`);
      throw new Error(`final submission not saved. keys=${JSON.stringify(keys)} text=${(await pageText(cdp)).slice(0, 1600)}`);
    }
    await wait(1000);
    const afterFinalText = await pageText(cdp);
    ok("peer locked by teacher", afterFinalText.includes("선생님이 열면 이동") || afterFinalText.includes("다음 단계는 아직 열리지 않았어요"), afterFinalText.slice(0, 1200));

    await setShared(cdp, "pj_student_stage_control", { byClass: { c3: "peer" }, updatedAt: Date.now() });
    await wait(11000);
    ok("peer unlocked after teacher opens", await clickButton(cdp, "다음: 동료평가"));
    await waitFor(async () => (await pageText(cdp)).includes("다른 모둠의 결과물"), "peer step");

    ok("back to home", await clickText(cdp, "모둠 프로젝트 평가"));
    await waitFor(async () => (await pageText(cdp)).includes("오늘은 어떤 역할인가요?"), "role gate after logout");
    ok("open teacher", await clickRole(cdp, "선생님"));
    await waitFor(async () => (await pageText(cdp)).includes("교사용 비밀번호 입력"), "teacher password");
    ok("fill password", await fillPassword(cdp, "6556"));
    ok("teacher login", await clickButton(cdp, "들어가기"));
    await waitFor(async () => (await pageText(cdp)).includes("교사용 페이지"), "teacher page");
    ok("open results tab", await clickText(cdp, "결과 통합조회"));
    await waitFor(async () => (await pageText(cdp)).includes("학생 진행 단계 열기"), "teacher results");
    ok("teacher stage controls visible", (await pageText(cdp)).includes("동료평가") && (await pageText(cdp)).includes("학생 결과지 일괄 출력"));

    const errors = await evalExpr(cdp, `window.__PROJECT1_E2E_ERRORS__ || []`);
    ok("no window errors", Array.isArray(errors) && errors.length === 0, JSON.stringify(errors));

    console.log(JSON.stringify({ ok: true, checks }, null, 2));
    ws.close();
  } finally {
    chrome.kill();
    await Promise.race([
      new Promise((resolve) => chrome.once("exit", resolve)),
      wait(3000),
    ]);
    await wait(500);
    await rm(userDataDir, { recursive: true, force: true }).catch(async () => {
      await wait(1500);
      await rm(userDataDir, { recursive: true, force: true });
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
