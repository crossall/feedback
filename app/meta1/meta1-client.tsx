"use client";

import ProjectEvaluationApp, { configureProjectEvaluationRuntime } from "@/project-evaluation-platform";

type StorageResult = { value?: string } | null;

declare global {
  interface Window {
    storage?: {
      get: (key: string, shared?: boolean) => Promise<StorageResult>;
      set: (key: string, value: string, shared?: boolean) => Promise<StorageResult>;
      list: (prefix: string, shared?: boolean) => Promise<{ keys: string[] }>;
    };
    __projectStorageScope?: string;
  }
}

const appScope = "meta1";
const localPrefix = "meta1:";
const earthMotionThemeCss = `
.pj-root{
  --ink:#172033;
  --ink-soft:#566276;
  --ink-faint:#8b97aa;
  --paper:#eef4fb;
  --surface:#ffffff;
  --surface-2:#f5f8fc;
  --line:#dce6f1;
  --line-2:#cad8e8;
  --green:#197b72;
  --green-700:#0f5f58;
  --green-soft:#e1f2ef;
  --green-100:#c6e4df;
  --accent:#d68a16;
  --accent-soft:#fff0d5;
  --accent-700:#975f09;
  --teal:#1b74b7;
  --teal-soft:#e1effb;
  --violet:#4f5aa8;
  --violet-soft:#e8ebfa;
  --rose:#b85f58;
  --rose-soft:#f8e7e5;
  --gold:#d7a625;
  background:linear-gradient(180deg,#edf4fb 0%,#f8fbff 48%,#eef7f1 100%);
}
.pj-root .logo,
.pj-root .btn.primary{
  background:linear-gradient(150deg,#197b72,#1b74b7);
}
.pj-root .btn.accent{
  background:linear-gradient(150deg,#d68a16,#f0b04a);
}
.pj-root .connector .fill,
.pj-root .scorebar > i{
  background:linear-gradient(180deg,#197b72,#1b74b7);
}
.pj-root .scorebar > i{
  background:linear-gradient(90deg,#197b72,#1b74b7);
}
.pj-root .card{
  box-shadow:0 18px 50px -36px rgba(23,32,51,.32);
}
`;

async function meta1Storage(action: "get" | "set" | "list", payload: Record<string, unknown>) {
  const response = await fetch("/api/meta1/storage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "프로젝트 저장소 요청에 실패했습니다.");
  return data;
}

function installStorageBridge() {
  if (typeof window === "undefined") return;
  if (window.storage && window.__projectStorageScope === appScope) return;

  window.__projectStorageScope = appScope;
  window.storage = {
    async get(key, shared = true) {
      if (!shared) {
        const value = window.localStorage.getItem(`${localPrefix}${key}`);
        return value === null ? null : { value };
      }
      return meta1Storage("get", { key }) as Promise<StorageResult>;
    },
    async set(key, value, shared = true) {
      if (!shared) {
        if (value === "null") window.localStorage.removeItem(`${localPrefix}${key}`);
        else window.localStorage.setItem(`${localPrefix}${key}`, value);
        return { value };
      }
      return meta1Storage("set", { key, value }) as Promise<StorageResult>;
    },
    async list(prefix, shared = true) {
      if (!shared) {
        const keys = Object.keys(window.localStorage)
          .filter((key) => key.startsWith(`${localPrefix}${prefix}`))
          .map((key) => key.slice(localPrefix.length));
        return { keys };
      }
      return meta1Storage("list", { prefix }) as Promise<{ keys: string[] }>;
    },
  };
}

export default function Meta1Client() {
  configureProjectEvaluationRuntime({
    apiBasePath: "/api/meta1",
    footerUrl: "feedforward.kr/meta1",
    teacherAuth: { hash: "2c9iul12cuv" },
    aiFeedbackCacheSchema: "meta1-ai-feedback-content-v1-websearch",
    resultsCacheSchema: "meta1-results-v1-personal-collab",
    reflectionsCacheSchema: "meta1-reflections-v1",
    defaultConfigPatch: {
      classes: [],
      groups: [],
    },
    allowEmptyClasses: true,
    themeCss: earthMotionThemeCss,
  });
  installStorageBridge();
  return <ProjectEvaluationApp />;
}
