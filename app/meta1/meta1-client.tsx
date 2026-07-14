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
  });
  installStorageBridge();
  return <ProjectEvaluationApp />;
}
