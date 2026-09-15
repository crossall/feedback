import "server-only";

import { get, list, put } from "@vercel/blob";
import {
  normalizeProject4Config,
  project4DefaultConfig,
  type Project4AiReview,
  type Project4Config,
  type Project4FinalScript,
  type Project4JuniorResponse,
  type Project4PeerResponse,
  type Project4PresentationReview,
  type Project4Reflection,
  type Project4Representative,
} from "@/lib/project4";

const basePath = "project4/";

async function readJson<T>(path: string): Promise<T | null> {
  const result = await get(`${basePath}${path}`, { access: "private", useCache: false });
  if (!result) return null;
  return new Response(result.stream).json() as Promise<T>;
}

async function writeJson(path: string, value: unknown) {
  await put(`${basePath}${path}`, JSON.stringify(value), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function listJson<T>(prefix: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    const result = await list({ prefix: `${basePath}${prefix}`, cursor });
    const pageItems = await Promise.all(result.blobs.map(async (blob): Promise<unknown | null> => {
      const value = await get(blob.downloadUrl || blob.url, { access: "private", useCache: false });
      return value ? await new Response(value.stream).json() : null;
    }));
    for (const item of pageItems) {
      if (item !== null) items.push(item as T);
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return items;
}

export async function getProject4Config() {
  return normalizeProject4Config(await readJson<Project4Config>("config.json") || project4DefaultConfig);
}

export async function saveProject4Config(config: Project4Config) {
  const normalized = normalizeProject4Config(config);
  await writeJson("config.json", normalized);
  return normalized;
}

export async function saveProject4Peer(value: Project4PeerResponse) {
  await writeJson(`peer/${value.classId}/${value.groupId}/${value.targetId}/${value.evaluatorId}.json`, value);
}

export async function getProject4GroupPeers(classId: string, groupId: string) {
  return listJson<Project4PeerResponse>(`peer/${classId}/${groupId}/`);
}

export async function saveProject4Representative(value: Project4Representative) {
  await writeJson(`representative/${value.classId}/${value.groupId}.json`, value);
}

export async function getProject4Representative(classId: string, groupId: string) {
  return readJson<Project4Representative>(`representative/${classId}/${groupId}.json`);
}

export async function saveProject4PresentationReview(value: Project4PresentationReview) {
  await writeJson(`presentation/${value.classId}/${value.evaluatorGroupId}.json`, value);
}

export async function getProject4PresentationReview(classId: string, groupId: string) {
  return readJson<Project4PresentationReview>(`presentation/${classId}/${groupId}.json`);
}

export async function saveProject4AiReview(value: Project4AiReview) {
  await writeJson(`ai/${value.classId}/${value.groupId}.json`, value);
}

export async function getProject4AiReview(classId: string, groupId: string) {
  return readJson<Project4AiReview>(`ai/${classId}/${groupId}.json`);
}

export async function saveProject4Final(value: Project4FinalScript) {
  await writeJson(`final/${value.classId}/${value.groupId}.json`, value);
}

export async function getProject4Final(classId: string, groupId: string) {
  return readJson<Project4FinalScript>(`final/${classId}/${groupId}.json`);
}

export async function saveProject4Junior(value: Project4JuniorResponse) {
  await writeJson(`junior/${value.targetClassId}/${value.targetGroupId}/${value.id}.json`, value);
}

export async function getProject4Junior(classId: string, groupId: string) {
  return listJson<Project4JuniorResponse>(`junior/${classId}/${groupId}/`);
}

export async function saveProject4Reflection(value: Project4Reflection) {
  await writeJson(`reflection/${value.classId}/${value.groupId}/${value.studentId}.json`, value);
}

export async function getProject4Reflection(classId: string, groupId: string, studentId: string) {
  return readJson<Project4Reflection>(`reflection/${classId}/${groupId}/${studentId}.json`);
}

export async function getProject4TeacherData() {
  const [peer, representatives, presentations, ai, finals, juniors, reflections] = await Promise.all([
    listJson<Project4PeerResponse>("peer/"),
    listJson<Project4Representative>("representative/"),
    listJson<Project4PresentationReview>("presentation/"),
    listJson<Project4AiReview>("ai/"),
    listJson<Project4FinalScript>("final/"),
    listJson<Project4JuniorResponse>("junior/"),
    listJson<Project4Reflection>("reflection/"),
  ]);
  return { peer, representatives, presentations, ai, finals, juniors, reflections };
}
