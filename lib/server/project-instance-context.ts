import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import type { ProjectInstance } from "@/lib/project-instances";

export type ProjectRequestInstance = ProjectInstance & { legacy: boolean };

const projectRequestStorage = new AsyncLocalStorage<ProjectRequestInstance>();

export function runWithProjectInstance<T>(instance: ProjectRequestInstance, callback: () => T) {
  return projectRequestStorage.run(instance, callback);
}

export function currentProjectInstance() {
  return projectRequestStorage.getStore();
}

export function project4StorageBasePath() {
  const instance = currentProjectInstance();
  return !instance || instance.legacy
    ? "project4/"
    : `project-instances/${instance.teacherId}/${instance.slug}/project4/`;
}

export function isLegacyProjectRequest() {
  return currentProjectInstance()?.legacy !== false;
}
