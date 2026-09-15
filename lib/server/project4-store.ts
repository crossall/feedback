import "server-only";

import { del, get, list, put } from "@vercel/blob";
import {
  normalizeProject4Config,
  project4DefaultConfig,
  type Project4AiReview,
  type Project4Config,
  type Project4FinalScript,
  type Project4JuniorResponse,
  type Project4PeerResponse,
  type Project4PresentationReview,
  type Project4PresentationRating,
  type Project4Reflection,
  type Project4Representative,
  type Project4RepresentativeReason,
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

type Project4RepresentativeSelectionRecord = Omit<Project4Representative, "reason" | "reasons">;

type Project4RepresentativeReasonRecord = Project4RepresentativeReason & {
  classId: string;
  groupId: string;
};

export async function saveProject4RepresentativeSelection(value: Project4RepresentativeSelectionRecord) {
  await writeJson(`representative-selection/${value.classId}/${value.groupId}.json`, value);
}

export async function saveProject4RepresentativeReason(value: Project4RepresentativeReasonRecord) {
  await writeJson(`representative-reason/${value.classId}/${value.groupId}/${value.studentId}.json`, value);
}

function composeProject4Representative(
  legacy: Project4Representative | null,
  selection: Project4RepresentativeSelectionRecord | null,
  savedReasons: Project4RepresentativeReasonRecord[],
): Project4Representative | null {
  const selected = selection || legacy;
  if (!selected) return null;

  const reasonMap = new Map<string, Project4RepresentativeReason>();
  if (legacy?.reason && legacy.submittedById) {
    reasonMap.set(legacy.submittedById, {
      studentId: legacy.submittedById,
      studentName: legacy.submittedByName,
      selectedStudentId: legacy.selectedStudentId,
      selectedStudentName: legacy.selectedStudentName,
      reason: legacy.reason,
      updatedAt: legacy.updatedAt,
    });
  }
  for (const reason of savedReasons) {
    reasonMap.set(reason.studentId, {
      studentId: reason.studentId,
      studentName: reason.studentName,
      selectedStudentId: reason.selectedStudentId,
      selectedStudentName: reason.selectedStudentName,
      reason: reason.reason,
      updatedAt: reason.updatedAt,
    });
  }
  const reasons = Array.from(reasonMap.values()).sort((a, b) => a.studentName.localeCompare(b.studentName, "ko"));

  return {
    classId: selected.classId,
    groupId: selected.groupId,
    selectedStudentId: selected.selectedStudentId,
    selectedStudentName: selected.selectedStudentName,
    reason: reasons.map((item) => item.reason).join("\n"),
    reasons,
    submittedById: selected.submittedById,
    submittedByName: selected.submittedByName,
    updatedAt: selected.updatedAt,
  };
}

export async function getProject4Representative(classId: string, groupId: string) {
  const [legacy, selection, reasons] = await Promise.all([
    readJson<Project4Representative>(`representative/${classId}/${groupId}.json`),
    readJson<Project4RepresentativeSelectionRecord>(`representative-selection/${classId}/${groupId}.json`),
    listJson<Project4RepresentativeReasonRecord>(`representative-reason/${classId}/${groupId}/`),
  ]);
  return composeProject4Representative(legacy, selection, reasons);
}

async function getProject4Representatives() {
  const [legacy, selections, reasons] = await Promise.all([
    listJson<Project4Representative>("representative/"),
    listJson<Project4RepresentativeSelectionRecord>("representative-selection/"),
    listJson<Project4RepresentativeReasonRecord>("representative-reason/"),
  ]);
  const keys = new Set<string>();
  legacy.forEach((item) => keys.add(`${item.classId}\u0000${item.groupId}`));
  selections.forEach((item) => keys.add(`${item.classId}\u0000${item.groupId}`));
  reasons.forEach((item) => keys.add(`${item.classId}\u0000${item.groupId}`));
  return Array.from(keys).flatMap((key) => {
    const [classId, groupId] = key.split("\u0000");
    const representative = composeProject4Representative(
      legacy.find((item) => item.classId === classId && item.groupId === groupId) || null,
      selections.find((item) => item.classId === classId && item.groupId === groupId) || null,
      reasons.filter((item) => item.classId === classId && item.groupId === groupId),
    );
    return representative ? [representative] : [];
  });
}

export async function saveProject4PresentationReview(value: Project4PresentationReview) {
  await writeJson(`presentation/${value.classId}/${value.evaluatorGroupId}.json`, value);
}

type Project4PresentationRatingRecord = {
  classId: string;
  evaluatorGroupId: string;
  evaluatorGroupName: string;
  targetGroupId: string;
  targetGroupName: string;
  criterionIndex: number;
  rating: Project4PresentationRating | null;
  submittedById: string;
  submittedByName: string;
  updatedAt: string;
};

type Project4PresentationMemoryRecord = {
  classId: string;
  evaluatorGroupId: string;
  evaluatorGroupName: string;
  memorable: string;
  submittedById: string;
  submittedByName: string;
  updatedAt: string;
};

export async function saveProject4PresentationRating(value: Project4PresentationRatingRecord) {
  await writeJson(
    `presentation-rating/${value.classId}/${value.evaluatorGroupId}/${value.targetGroupId}/${value.criterionIndex}.json`,
    value,
  );
}

export async function saveProject4PresentationMemory(value: Project4PresentationMemoryRecord) {
  await writeJson(`presentation-memory/${value.classId}/${value.evaluatorGroupId}.json`, value);
}

function composeProject4PresentationReview(
  legacy: Project4PresentationReview | null,
  ratings: Project4PresentationRatingRecord[],
  memory: Project4PresentationMemoryRecord | null,
): Project4PresentationReview | null {
  if (!legacy && ratings.length === 0 && !memory) return null;

  const targetMap = new Map<string, Project4PresentationReview["targets"][number]>();
  for (const target of legacy?.targets || []) {
    targetMap.set(target.targetGroupId, {
      targetGroupId: target.targetGroupId,
      targetGroupName: target.targetGroupName,
      ratings: Array.from({ length: 6 }, (_, index) => target.ratings[index] || null),
    });
  }
  for (const item of ratings) {
    if (item.criterionIndex < 0 || item.criterionIndex >= 6) continue;
    const target = targetMap.get(item.targetGroupId) || {
      targetGroupId: item.targetGroupId,
      targetGroupName: item.targetGroupName,
      ratings: Array<Project4PresentationRating | null>(6).fill(null),
    };
    target.targetGroupName = item.targetGroupName;
    target.ratings[item.criterionIndex] = item.rating;
    targetMap.set(item.targetGroupId, target);
  }

  const latest = [legacy, memory, ...ratings]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const identity = legacy || memory || ratings[0];
  if (!identity || !latest) return null;

  return {
    classId: identity.classId,
    evaluatorGroupId: identity.evaluatorGroupId,
    evaluatorGroupName: identity.evaluatorGroupName,
    targets: Array.from(targetMap.values()),
    memorable: memory?.memorable ?? legacy?.memorable ?? "",
    submittedById: latest.submittedById,
    submittedByName: latest.submittedByName,
    updatedAt: latest.updatedAt,
  };
}

export async function getProject4PresentationReview(classId: string, groupId: string) {
  const [legacy, ratings, memory] = await Promise.all([
    readJson<Project4PresentationReview>(`presentation/${classId}/${groupId}.json`),
    listJson<Project4PresentationRatingRecord>(`presentation-rating/${classId}/${groupId}/`),
    readJson<Project4PresentationMemoryRecord>(`presentation-memory/${classId}/${groupId}.json`),
  ]);
  return composeProject4PresentationReview(legacy, ratings, memory);
}

async function getProject4PresentationReviews() {
  const [legacy, ratings, memories] = await Promise.all([
    listJson<Project4PresentationReview>("presentation/"),
    listJson<Project4PresentationRatingRecord>("presentation-rating/"),
    listJson<Project4PresentationMemoryRecord>("presentation-memory/"),
  ]);
  const keys = new Set<string>();
  legacy.forEach((item) => keys.add(`${item.classId}\u0000${item.evaluatorGroupId}`));
  ratings.forEach((item) => keys.add(`${item.classId}\u0000${item.evaluatorGroupId}`));
  memories.forEach((item) => keys.add(`${item.classId}\u0000${item.evaluatorGroupId}`));
  return Array.from(keys).flatMap((key) => {
    const [classId, groupId] = key.split("\u0000");
    const review = composeProject4PresentationReview(
      legacy.find((item) => item.classId === classId && item.evaluatorGroupId === groupId) || null,
      ratings.filter((item) => item.classId === classId && item.evaluatorGroupId === groupId),
      memories.find((item) => item.classId === classId && item.evaluatorGroupId === groupId) || null,
    );
    return review ? [review] : [];
  });
}

export async function saveProject4AiReview(value: Project4AiReview) {
  await writeJson(`ai/${value.classId}/${value.groupId}.json`, value);
}

export async function getProject4AiReview(classId: string, groupId: string) {
  return readJson<Project4AiReview>(`ai/${classId}/${groupId}.json`);
}

type Project4AiGeneration = {
  classId: string;
  groupId: string;
  generationId: string;
  submittedById: string;
  submittedByName: string;
  startedAt: string;
  expiresAt: string;
};

function project4AiGenerationPath(classId: string, groupId: string) {
  return `ai-generation/${classId}/${groupId}.json`;
}

export async function getProject4AiGeneration(classId: string, groupId: string) {
  const generation = await readJson<Project4AiGeneration>(project4AiGenerationPath(classId, groupId));
  return generation && generation.expiresAt > new Date().toISOString() ? generation : null;
}

export async function startProject4AiGeneration(value: Project4AiGeneration) {
  const path = project4AiGenerationPath(value.classId, value.groupId);
  const existing = await readJson<Project4AiGeneration>(path);
  if (existing && existing.expiresAt > new Date().toISOString()) return false;
  if (existing) await del(`${basePath}${path}`);
  try {
    await put(`${basePath}${path}`, JSON.stringify(value), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
    });
    return true;
  } catch {
    return false;
  }
}

export async function finishProject4AiGeneration(classId: string, groupId: string, generationId: string) {
  const path = project4AiGenerationPath(classId, groupId);
  const existing = await readJson<Project4AiGeneration>(path);
  if (existing?.generationId === generationId) await del(`${basePath}${path}`);
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
    getProject4Representatives(),
    getProject4PresentationReviews(),
    listJson<Project4AiReview>("ai/"),
    listJson<Project4FinalScript>("final/"),
    listJson<Project4JuniorResponse>("junior/"),
    listJson<Project4Reflection>("reflection/"),
  ]);
  return { peer, representatives, presentations, ai, finals, juniors, reflections };
}
