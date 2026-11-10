import "server-only";

import { get, list, put } from "@vercel/blob";
import { createHash } from "crypto";
import { getProjectInstanceById } from "@/lib/server/project-instance-store";
import type { ProjectInstance } from "@/lib/project-instances";

export type Project1AiFeedbackItem = {
  no: number;
  rating: "상" | "중" | "하";
  score: number;
  reason: string;
};

export type Project1AiFeedback = {
  summary: string;
  items: Project1AiFeedbackItem[];
  aiScore: number;
  aiMax: number;
  good: string;
  improve: string;
};

export type Project1FeedbackStatus =
  | "generating"
  | "pending_review"
  | "approved"
  | "changes_requested"
  | "failed";

export type Project1FeedbackReview = {
  schema: "project1-feedback-review-v1";
  requestId: string;
  version: number;
  groupId: string;
  classId: string;
  fileName: string;
  fileSize: number;
  pdfData: string;
  submittedBy: string;
  requestedAt: number;
  updatedAt: number;
  status: Project1FeedbackStatus;
  contentSignature?: Record<string, unknown>;
  rubricHash: string;
  aiFeedback?: Project1AiFeedback;
  error?: string;
  teacherNote?: string;
  reviewedAt?: number;
  reviewedBy?: string;
};

export type Project1Scope = {
  instance: ProjectInstance | null;
  instanceId: string;
  teacherId: string;
  root: string;
};

function encodedJsonPath(basePath: string, key: string) {
  return `${basePath}${encodeURIComponent(key)}.json`;
}

function legacyJsonPath(basePath: string, key: string) {
  return `${basePath}${key}.json`;
}

async function readJsonAtPath<T>(path: string) {
  const result = await get(path, { access: "private", useCache: false });
  if (!result) return null;
  return await new Response(result.stream).json() as T;
}

async function writeJsonAtPath(path: string, value: unknown) {
  await put(path, JSON.stringify(value), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function resolveProject1Scope(instanceIdValue?: string): Promise<Project1Scope> {
  const instanceId = String(instanceIdValue ?? "").trim();
  const instance = instanceId
    ? await getProjectInstanceById(instanceId, "project1")
    : null;
  if (instanceId && !instance) throw new Error("프로젝트 주소를 확인해 주세요.");
  return {
    instance,
    instanceId,
    teacherId: instance?.teacherId || "6556",
    root: instance
      ? `project-instances/${instance.teacherId}/${instance.slug}/project1/`
      : "project1/",
  };
}

export async function readProject1Shared<T>(scope: Project1Scope, key: string) {
  const basePath = `${scope.root}storage/shared/`;
  const canonicalPath = encodedJsonPath(basePath, key);
  const canonical = await readJsonAtPath<T>(canonicalPath);
  if (canonical !== null) return canonical;
  const legacyPath = legacyJsonPath(basePath, key);
  return legacyPath === canonicalPath ? null : readJsonAtPath<T>(legacyPath);
}

export async function writeProject1Shared(scope: Project1Scope, key: string, value: unknown) {
  const basePath = `${scope.root}storage/shared/`;
  await writeJsonAtPath(encodedJsonPath(basePath, key), value);
}

function reviewPath(scope: Project1Scope, groupId: string) {
  return `${scope.root}feedback-reviews/${encodeURIComponent(groupId)}.json`;
}

export async function readProject1FeedbackReview(scope: Project1Scope, groupId: string) {
  return readJsonAtPath<Project1FeedbackReview>(reviewPath(scope, groupId));
}

export async function writeProject1FeedbackReview(
  scope: Project1Scope,
  review: Project1FeedbackReview,
) {
  await writeJsonAtPath(reviewPath(scope, review.groupId), review);
}

export async function listProject1FeedbackReviews(scope: Project1Scope) {
  const result = await list({ prefix: `${scope.root}feedback-reviews/` });
  const reviews = await Promise.all(result.blobs.map((blob) =>
    readJsonAtPath<Project1FeedbackReview>(blob.pathname)));
  return reviews.filter((review): review is Project1FeedbackReview => Boolean(review));
}

export function project1RubricHash(subject: string, items: unknown) {
  return createHash("sha256")
    .update(JSON.stringify({ subject, items }))
    .digest("hex")
    .slice(0, 32);
}

function feedbackCachePath(scope: Project1Scope, rubricHash: string, contentHash: string) {
  return `${scope.root}feedback-cache/${encodeURIComponent(`${rubricHash}_${contentHash}`)}.json`;
}

export async function readProject1FeedbackCache(
  scope: Project1Scope,
  rubricHash: string,
  contentHash: string,
) {
  return readJsonAtPath<Project1AiFeedback>(feedbackCachePath(scope, rubricHash, contentHash));
}

export async function writeProject1FeedbackCache(
  scope: Project1Scope,
  rubricHash: string,
  contentHash: string,
  feedback: Project1AiFeedback,
) {
  await writeJsonAtPath(feedbackCachePath(scope, rubricHash, contentHash), feedback);
}
