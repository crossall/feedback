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

const appScope = "project_expo";
const localPrefix = "project_expo:";
const demoSharedPrefix = "project_expo_demo:";

async function projectExpoStorage(action: "get" | "set" | "list", payload: Record<string, unknown>) {
  const response = await fetch("/api/project_expo/storage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "전시관 저장소 요청에 실패했습니다.");
  return data;
}

function localKeys(prefix: string, scopePrefix: string) {
  return Object.keys(window.localStorage)
    .filter((key) => key.startsWith(`${scopePrefix}${prefix}`))
    .map((key) => key.slice(scopePrefix.length));
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

      const localValue = window.localStorage.getItem(`${demoSharedPrefix}${key}`);
      if (localValue !== null) return localValue === "null" ? null : { value: localValue };
      return projectExpoStorage("get", { key }) as Promise<StorageResult>;
    },
    async set(key, value, shared = true) {
      if (!shared) {
        if (value === "null") window.localStorage.removeItem(`${localPrefix}${key}`);
        else window.localStorage.setItem(`${localPrefix}${key}`, value);
        return { value };
      }

      window.localStorage.setItem(`${demoSharedPrefix}${key}`, value);
      return { value };
    },
    async list(prefix, shared = true) {
      if (!shared) {
        return { keys: localKeys(prefix, localPrefix) };
      }

      const remote = await projectExpoStorage("list", { prefix }) as { keys?: string[] };
      const remoteKeys = Array.isArray(remote.keys) ? remote.keys : [];
      const local = localKeys(prefix, demoSharedPrefix);
      const tombstones = new Set(
        local.filter((key) => window.localStorage.getItem(`${demoSharedPrefix}${key}`) === "null"),
      );
      const localLive = local.filter((key) => !tombstones.has(key));
      return {
        keys: Array.from(new Set([
          ...remoteKeys.filter((key) => !tombstones.has(key)),
          ...localLive,
        ])),
      };
    },
  };
}

export default function ProjectExpoClient() {
  configureProjectEvaluationRuntime({
    apiBasePath: "/api/project_expo",
    footerUrl: "feedforward.kr/project_expo",
    aiFeedbackCacheSchema: "project-expo-ai-feedback-content-v1-websearch",
    resultsCacheSchema: "project-expo-results-v1-personal-collab",
    reflectionsCacheSchema: "project-expo-reflections-v1",
    expoMode: true,
    guideMode: true,
    teacherOpenAccess: true,
    teacherReadOnly: true,
  });
  installStorageBridge();
  return <ProjectEvaluationApp />;
}
