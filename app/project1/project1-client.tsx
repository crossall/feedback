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

async function project1Storage(instanceId: string, action: "get" | "set" | "list", payload: Record<string, unknown>) {
  const response = await fetch("/api/project1/storage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, instanceId: instanceId || undefined, ...payload }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "프로젝트 저장소 요청에 실패했습니다.");
  return data;
}

function installStorageBridge(instanceId: string) {
  if (typeof window === "undefined") return;
  const appScope = instanceId ? `project1:${instanceId}` : "project1";
  const localPrefix = `${appScope}:`;
  if (window.storage && window.__projectStorageScope === appScope) return;

  window.__projectStorageScope = appScope;
  window.storage = {
    async get(key, shared = true) {
      if (!shared) {
        const value = window.localStorage.getItem(`${localPrefix}${key}`);
        return value === null ? null : { value };
      }
      return project1Storage(instanceId, "get", { key }) as Promise<StorageResult>;
    },
    async set(key, value, shared = true) {
      if (!shared) {
        if (value === "null") window.localStorage.removeItem(`${localPrefix}${key}`);
        else window.localStorage.setItem(`${localPrefix}${key}`, value);
        return { value };
      }
      return project1Storage(instanceId, "set", { key, value }) as Promise<StorageResult>;
    },
    async list(prefix, shared = true) {
      if (!shared) {
        const keys = Object.keys(window.localStorage)
          .filter((key) => key.startsWith(`${localPrefix}${prefix}`))
          .map((key) => key.slice(localPrefix.length));
        return { keys };
      }
      return project1Storage(instanceId, "list", { prefix }) as Promise<{ keys: string[] }>;
    },
  };
}

export default function Project1Client({
  instanceId = "",
  ownerAccess = false,
}: {
  instanceId?: string;
  ownerAccess?: boolean;
}) {
  configureProjectEvaluationRuntime({
    instanceId,
    allowEmptyClasses: Boolean(instanceId),
    teacherOpenAccess: Boolean(instanceId) && ownerAccess,
    footerUrl: instanceId ? `feedforward.kr/${instanceId}` : "feedforward.kr/project1",
    ...(instanceId ? { teacherAuth: { accounts: [] } } : {}),
  });
  installStorageBridge(instanceId);
  return <ProjectEvaluationApp />;
}
