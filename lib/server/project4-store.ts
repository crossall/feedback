import "server-only";

import { del, get, list, put } from "@vercel/blob";
import growthBase from "./project4-growth-base.json";
import {
  isLegacyProjectRequest,
  project4StorageBasePath,
} from "@/lib/server/project-instance-context";
import {
  normalizeProject4Config,
  project4DefaultConfig,
  type Project4AiReview,
  type Project4Config,
  type Project4FinalScript,
  type Project4GrowthLevel,
  type Project4GrowthReport,
  type Project4JuniorGroupEvaluation,
  type Project4JuniorQuiz,
  type Project4JuniorResponse,
  type Project4PeerResponse,
  type Project4PresentationReview,
  type Project4PresentationRating,
  type Project4Reflection,
  type Project4Representative,
  type Project4RepresentativeReason,
} from "@/lib/project4";

const baseGrowthReports = growthBase as unknown as Project4GrowthReport[];
const maxConcurrentBlobReads = 16;
let activeBlobReads = 0;
const blobReadWaiters: Array<() => void> = [];

async function withBlobReadSlot<T>(operation: () => Promise<T>) {
  if (activeBlobReads >= maxConcurrentBlobReads) {
    await new Promise<void>((resolve) => blobReadWaiters.push(resolve));
  }
  activeBlobReads += 1;
  try {
    return await operation();
  } finally {
    activeBlobReads -= 1;
    blobReadWaiters.shift()?.();
  }
}

async function retryBlobOperation<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function readBlobValue<T>(pathOrUrl: string) {
  return withBlobReadSlot(() => retryBlobOperation(async () => {
    const result = await get(pathOrUrl, { access: "private", useCache: false });
    return result ? await new Response(result.stream).json() as T : null;
  }));
}

async function readJson<T>(path: string): Promise<T | null> {
  return readBlobValue<T>(`${project4StorageBasePath()}${path}`);
}

async function writeJson(path: string, value: unknown) {
  await put(`${project4StorageBasePath()}${path}`, JSON.stringify(value), {
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
    const result = await retryBlobOperation(() => list({ prefix: `${project4StorageBasePath()}${prefix}`, cursor }));
    const pageItems = await Promise.all(result.blobs.map((blob) => (
      readBlobValue<unknown>(blob.downloadUrl || blob.url)
    )));
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
  if (existing) await del(`${project4StorageBasePath()}${path}`);
  try {
    await put(`${project4StorageBasePath()}${path}`, JSON.stringify(value), {
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
  if (existing?.generationId === generationId) await del(`${project4StorageBasePath()}${path}`);
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

export async function saveProject4JuniorQuiz(value: Project4JuniorQuiz) {
  await writeJson(`junior-quiz/${value.targetClassId}/${value.studentId}.json`, value);
}

export async function getProject4JuniorQuiz(classId: string, studentId: string) {
  return readJson<Project4JuniorQuiz>(`junior-quiz/${classId}/${studentId}.json`);
}

export async function getProject4JuniorQuizzes(classId?: string) {
  return listJson<Project4JuniorQuiz>(classId ? `junior-quiz/${classId}/` : "junior-quiz/");
}

export async function saveProject4JuniorGroupEvaluation(value: Project4JuniorGroupEvaluation) {
  await writeJson(`junior-group/${value.targetClassId}/${value.targetGroupId}/${value.studentId}.json`, value);
}

export async function getProject4JuniorGroupEvaluation(classId: string, groupId: string, studentId: string) {
  return readJson<Project4JuniorGroupEvaluation>(`junior-group/${classId}/${groupId}/${studentId}.json`);
}

export async function getProject4JuniorGroupEvaluations(classId: string, groupId?: string) {
  return listJson<Project4JuniorGroupEvaluation>(groupId
    ? `junior-group/${classId}/${groupId}/`
    : `junior-group/${classId}/`);
}

export async function getAllProject4JuniorGroupEvaluations() {
  return listJson<Project4JuniorGroupEvaluation>("junior-group/");
}

export async function saveProject4Reflection(value: Project4Reflection) {
  await writeJson(`reflection/${value.classId}/${value.groupId}/${value.studentId}.json`, value);
}

export async function getProject4Reflection(classId: string, groupId: string, studentId: string) {
  return readJson<Project4Reflection>(`reflection/${classId}/${groupId}/${studentId}.json`);
}

export async function saveProject4GrowthReport(value: Project4GrowthReport) {
  const normalized = finalizeProject4GrowthReport(value);
  await writeJson(`growth-report/${normalized.id}.json`, normalized);
  return normalized;
}

function project4ClassNumber(value: string) {
  return Number(
    value.match(/6\s*-\s*(\d+)/)?.[1]
    || value.match(/6\s*학년\s*(\d+)\s*반/)?.[1]
    || value.match(/(\d+)\s*반/)?.[1]
    || 0,
  );
}

function project4GroupNumber(value: string) {
  return Number(value.match(/(\d+)/)?.[1] || 0);
}

function growthLevelFromAverage(average: number): Project4GrowthLevel {
  if (average >= 3.4) return "상";
  if (average >= 2.5) return "중";
  return "하";
}

type JuniorFeedbackThemeId =
  | "visual"
  | "pace"
  | "voice"
  | "vocabulary"
  | "structure"
  | "audio"
  | "science";

type JuniorFeedbackTheme = {
  id: JuniorFeedbackThemeId;
  keywords: string[];
  exactStrength: string;
  referenceStrength: string;
  nextStep: string;
};

const juniorFeedbackThemes: JuniorFeedbackTheme[] = [
  {
    id: "visual",
    keywords: ["사진", "그림", "그래프", "글씨", "화면", "자료"],
    exactStrength: "그림·사진·그래프 같은 시각 자료가 이해에 도움이 되었다는 의견이 많았습니다.",
    referenceStrength: "그림·사진·그래프를 설명과 함께 보여 줄 때 이해하기 쉬웠다는 의견이 자주 나왔습니다.",
    nextStep: "그림만 보이는 장면에는 짧은 설명을 덧붙이고, 핵심 근거를 화면에서 직접 짚어 주세요.",
  },
  {
    id: "pace",
    keywords: ["속도", "빠르", "천천히", "느리", "끊", "더듬"],
    exactStrength: "말의 속도가 알맞아 설명을 따라가기 편했다는 의견이 있었습니다.",
    referenceStrength: "말의 속도가 일정하고 적당할 때 설명을 따라가기 편했다는 의견이 많았습니다.",
    nextStep: "빠르거나 끊겨 들리는 부분은 문장을 짧게 나누고 중요한 용어 앞뒤에서 잠시 멈춰 보세요.",
  },
  {
    id: "voice",
    keywords: ["목소리", "또박", "명확", "정확", "크게", "작다", "톤"],
    exactStrength: "목소리가 또렷하고 크기가 적절해 내용을 듣기 좋았다는 평가가 있었습니다.",
    referenceStrength: "또렷하고 일정한 목소리가 내용을 이해하는 데 도움이 되었다는 의견이 있었습니다.",
    nextStep: "목소리 크기를 일정하게 유지하고 중요한 문장은 또박또박 말해 보세요.",
  },
  {
    id: "vocabulary",
    keywords: ["단어", "용어", "뜻", "어렵", "모르"],
    exactStrength: "어려운 단어의 뜻을 풀어 준 점이 이해에 도움이 되었다는 의견이 있었습니다.",
    referenceStrength: "낯선 과학 용어의 뜻을 바로 풀어 줄 때 이해하기 쉬웠다는 의견이 반복해서 나왔습니다.",
    nextStep: "낯선 과학 용어에는 쉬운 뜻이나 생활 속 예를 바로 붙여 설명해 보세요.",
  },
  {
    id: "structure",
    keywords: ["요약", "순서", "마지막", "길었", "길어서", "자세히", "이유"],
    exactStrength: "설명 순서와 요약이 내용을 이해하는 데 도움이 되었다는 평가가 있었습니다.",
    referenceStrength: "설명 순서를 나누고 마지막에 요약할 때 핵심 내용을 기억하기 쉬웠다는 의견이 있었습니다.",
    nextStep: "긴 설명은 순서를 나누고 마지막에 계절이 바뀌는 까닭을 한 문장으로 요약해 보세요.",
  },
  {
    id: "audio",
    keywords: ["배경소리", "잡소리", "시끄", "소음", "잡음", "배경음", "기침", "코푸", "녹음", "오디오", "쿵쿵"],
    exactStrength: "녹음 소리가 안정적인 장면에서는 설명에 집중하기 좋았다는 반응이 있었습니다.",
    referenceStrength: "배경 소음이 적고 음량이 일정할 때 설명에 집중하기 쉽다는 의견이 많았습니다.",
    nextStep: "배경 소음이 적은 곳에서 녹음하고 장면마다 목소리 크기가 비슷한지 확인해 보세요.",
  },
  {
    id: "science",
    keywords: ["자전축", "태양", "계절", "공전", "남중", "에너지", "실험", "근거", "까닭"],
    exactStrength: "과학 개념과 까닭을 연결해 자세히 설명한 점이 좋았다는 의견이 있었습니다.",
    referenceStrength: "측정값이나 실험 장면을 계절 변화의 까닭과 연결할 때 이해하기 쉬웠다는 의견이 있었습니다.",
    nextStep: "측정값·지구본 실험과 결론을 직접 연결해 계절이 바뀌는 까닭을 분명히 말해 보세요.",
  },
];

function rankedJuniorThemes(comments: string[], fallback: JuniorFeedbackThemeId[]) {
  const ranked = juniorFeedbackThemes
    .map((theme, order) => ({
      theme,
      order,
      count: comments.reduce((count, comment) => {
        const normalized = comment.toLocaleLowerCase("ko").replace(/\s+/g, "");
        return count + (theme.keywords.some((keyword) => normalized.includes(keyword)) ? 1 : 0);
      }, 0),
    }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count || left.order - right.order)
    .map((item) => item.theme);

  const fallbackThemes = fallback
    .map((id) => juniorFeedbackThemes.find((theme) => theme.id === id))
    .filter((theme): theme is JuniorFeedbackTheme => Boolean(theme));
  return [...ranked, ...fallbackThemes].filter((theme, index, all) => (
    all.findIndex((candidate) => candidate.id === theme.id) === index
  ));
}

function exactJuniorFeedback(
  average: number,
  positiveComments: string[],
  difficultComments: string[],
) {
  const strength = rankedJuniorThemes(positiveComments, ["visual", "structure"])[0];
  const improvement = rankedJuniorThemes(difficultComments, ["pace", "vocabulary"])
    .find((theme) => theme.id !== strength.id)
    || rankedJuniorThemes(difficultComments, ["pace", "vocabulary"])[0];
  return `후배 평가 자료에서 확인한 이해도 평균은 ${average}점(5점 만점)입니다. ${strength.exactStrength} 한편 보완 의견을 반영해 ${improvement.nextStep} 후배 의견에서 확인한 강점은 이어 가고, 보완점을 다음 설명에 반영해 더 이해하기 쉬운 영상으로 다듬어 보세요.`;
}

function pooledJuniorFeedback(
  average: number,
  positiveComments: string[],
  difficultComments: string[],
  classNumber: number,
  groupNumber: number,
) {
  const strengths = rankedJuniorThemes(positiveComments, ["visual", "structure", "voice"]);
  const improvements = rankedJuniorThemes(difficultComments, ["pace", "vocabulary", "audio", "science"]);
  const effectiveGroupNumber = groupNumber > 0 ? groupNumber : 7;
  const variationIndex = Math.max(0, (classNumber - 3) * 7 + effectiveGroupNumber - 1);
  const strength = strengths[variationIndex % strengths.length];
  const improvement = improvements[(variationIndex * 5 + 1) % improvements.length];
  const closing = [
    "자신의 영상과 비교해 실천할 점 한 가지를 골라 보세요.",
    "다음 촬영 전에 확인할 점 한 가지를 적어 보세요.",
    "영상을 다시 보며 고칠 장면 한 곳을 찾아 보세요.",
  ][variationIndex % 3];
  return `후배 평가 자료에서 확인한 이해도 평균은 ${average}점(5점 만점)입니다. ${strength.referenceStrength} ${improvement.nextStep} ${closing}`;
}

function overallGrowthLevel(report: Project4GrowthReport): Project4GrowthLevel {
  const points: Record<Project4GrowthLevel, number> = { 상: 3, 중: 2, 하: 1 };
  const areaLevels = new Map(report.areas.map((area) => [area.id, area.level]));
  const personalAreas = ["draft", "revision", "individualVideo", "aiJudgment"] as const;
  const completedPersonalWork = personalAreas.every((areaId) => areaLevels.get(areaId) !== "하");
  if (report.evidence.individualVideo.submitted && completedPersonalWork) return "상";
  const pointTotal = report.areas.reduce((sum, area) => sum + points[area.level], 0);
  if (pointTotal >= 10) return "중";
  return "하";
}

function overallGrowthHeadline(level: Project4GrowthLevel) {
  if (level === "상") return "과학적 근거를 비교하고 설명을 스스로 다듬는 힘이 돋보입니다.";
  if (level === "중") return "과학적 근거를 찾아 설명을 고쳐 가는 힘이 자라고 있습니다.";
  return "핵심 근거를 하나씩 연결하며 설명을 완성해 가고 있습니다.";
}

function missingGrowthFeedback(
  report: Project4GrowthReport,
  areaId: Project4GrowthReport["areas"][number]["id"],
) {
  if (areaId === "draft" && report.evidence.draft.kind === "missing") return "초안 없음";
  if (areaId === "revision" && report.evidence.revision.kind === "missing") return "수정안 없음";
  if (areaId === "individualVideo" && !report.evidence.individualVideo.submitted) return "개인 영상 없음";
  if (areaId === "groupVideo" && !report.evidence.groupVideo.submitted) return "모둠 영상 없음";
  if (areaId === "aiJudgment" && !report.evidence.aiJudgment.available) {
    return "AI 판단 응답 없음";
  }
  if (areaId === "junior" && report.evidence.junior.source === "none") return "후배 평가 없음";
  if (areaId === "writtenAssessment" && !report.evidence.writtenAssessment?.submitted) return "지필평가 기록 없음";
  return null;
}

function finalizeProject4GrowthReport(report: Project4GrowthReport): Project4GrowthReport {
  const areas = report.areas.map((item) => {
    const missingFeedback = missingGrowthFeedback(report, item.id);
    return missingFeedback ? { ...item, feedback: missingFeedback } : item;
  });
  const automaticLevel = report.edited ? report.overallLevel : overallGrowthLevel({ ...report, areas });
  const cappedByMissingIndividualVideo = !report.evidence.individualVideo.submitted && automaticLevel === "상";
  const overallLevel = cappedByMissingIndividualVideo ? "중" : automaticLevel;
  return {
    ...report,
    areas,
    overallLevel,
    overallHeadline: overallLevel === report.overallLevel ? report.overallHeadline : overallGrowthHeadline(overallLevel),
  };
}

function enrichProject4GrowthJunior(
  report: Project4GrowthReport,
  config: Project4Config,
  juniorGroups: Project4JuniorGroupEvaluation[],
  juniors: Project4JuniorResponse[],
) {
  const classNumber = project4ClassNumber(report.className);
  const classItem = config.classes.find((item) => project4ClassNumber(item.name) === classNumber);
  const groupNumber = project4GroupNumber(report.groupName);
  const groupItem = config.groups.find((item) => item.classId === classItem?.id && project4GroupNumber(item.name) === groupNumber);
  const exactCurrent = groupItem
    ? juniorGroups.filter((item) => item.targetClassId === classItem?.id && item.targetGroupId === groupItem.id)
    : [];
  const exactLegacy = groupItem
    ? juniors.filter((item) => item.targetClassId === classItem?.id && item.targetGroupId === groupItem.id)
    : [];
  const exactScores = [
    ...exactCurrent.map((item) => item.understanding),
    ...exactLegacy.map((item) => item.understanding === "well" ? 5 : item.understanding === "some" ? 3 : 1),
  ];
  const pooledScores = [
    ...juniorGroups.map((item) => item.understanding),
    ...juniors.map((item) => item.understanding === "well" ? 5 : item.understanding === "some" ? 3 : 1),
  ];
  const exactPositiveComments = [
    ...exactCurrent.map((item) => item.good),
    ...exactLegacy.flatMap((item) => item.helpfulParts),
  ].filter((item) => item.trim());
  const exactDifficultComments = [
    ...exactCurrent.map((item) => item.difficult),
    ...exactLegacy.map((item) => item.question),
  ].filter((item) => item.trim());
  const pooledPositiveComments = [
    ...juniorGroups.map((item) => item.good),
    ...juniors.flatMap((item) => item.helpfulParts),
  ].filter((item) => item.trim());
  const pooledDifficultComments = [
    ...juniorGroups.map((item) => item.difficult),
    ...juniors.map((item) => item.question),
  ].filter((item) => item.trim());
  const scores = exactScores.length > 0 ? exactScores : pooledScores;
  const source = exactScores.length > 0 ? "exact" : scores.length > 0 ? "pooled" : "none";
  const average = scores.length > 0
    ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
    : null;
  const currentArea = report.areas.find((item) => item.id === "junior");
  if (!currentArea) return report;

  let feedback = "후배 평가 없음";
  let level: Project4GrowthLevel = "하";
  let status: "ready" | "review" = "review";
  if (average !== null && source === "exact") {
    feedback = exactJuniorFeedback(
      average,
      exactPositiveComments,
      exactDifficultComments,
    );
    level = growthLevelFromAverage(average);
    status = "ready";
  } else if (average !== null) {
    feedback = pooledJuniorFeedback(
      average,
      pooledPositiveComments,
      pooledDifficultComments,
      classNumber,
      groupNumber,
    );
    level = growthLevelFromAverage(average);
    status = "ready";
  }

  const next: Project4GrowthReport = {
    ...report,
    areas: report.areas.map((item) => item.id === "junior" ? {
      ...item,
      source: "5학년 후배 의견",
      feedback,
      level,
      status,
    } : item),
    evidence: {
      ...report.evidence,
      junior: { source, responseCount: scores.length, average },
    },
  };
  const overallLevel = overallGrowthLevel(next);
  return { ...next, overallLevel, overallHeadline: overallGrowthHeadline(overallLevel) };
}

async function getProject4GrowthReports(
  config: Project4Config,
  juniorGroups: Project4JuniorGroupEvaluation[],
  juniors: Project4JuniorResponse[],
) {
  const [overrides] = await Promise.all([
    listJson<Project4GrowthReport>("growth-report/"),
  ]);
  const overrideMap = new Map(overrides.map((item) => [item.id, item]));
  return (isLegacyProjectRequest() ? baseGrowthReports : []).map((base) => {
    const enriched = enrichProject4GrowthJunior(base, config, juniorGroups, juniors);
    const override = overrideMap.get(base.id);
    if (!override) return finalizeProject4GrowthReport(enriched);
    const overrideAreas = new Map(override.areas.map((item) => [item.id, item]));
    const areas = enriched.areas.map((automaticArea) => {
      const savedArea = overrideAreas.get(automaticArea.id);
      if (!savedArea) return automaticArea;
      if (automaticArea.id === "junior" || automaticArea.id === "writtenAssessment") {
        return automaticArea;
      }
      const automaticPatterns: Partial<Record<typeof automaticArea.id, RegExp>> = {
        draft: /^(처음 설명에서|모둠 초안에서)/,
        revision: /^(초안 뒤 수정안에|수정안에서도|수정안 제출은|수정안을 제출해)/,
        individualVideo: /^(개인 영상을 \d+회 제출하며|반별 패들렛에 개인 영상을|개인 영상 없음)/,
        groupVideo: /^(6학년 전체 패들렛에 모둠 영상을|모둠 영상 없음)/,
        aiJudgment: /^(오류 문항 1개를 보정한 결과|AI 피드백 8개 중|AI 판단 응답 없음)/,
      };
      const usesAutomaticFeedback = automaticPatterns[automaticArea.id]?.test(savedArea.feedback) ?? false;
      return usesAutomaticFeedback
        ? { ...automaticArea, status: savedArea.status }
        : savedArea;
    });
    const overallFeedback = override.overallFeedback.includes("교사의 최종 검토")
      ? enriched.overallFeedback
      : override.overallFeedback;
    return finalizeProject4GrowthReport({
      ...enriched,
      ...override,
      areas,
      overallFeedback,
      evidence: {
        ...enriched.evidence,
        ...override.evidence,
        aiJudgment: enriched.evidence.aiJudgment,
        junior: enriched.evidence.junior,
        writtenAssessment: enriched.evidence.writtenAssessment,
      },
    });
  });
}

export async function getProject4TeacherData(config: Project4Config) {
  const [peer, representatives, presentations, ai, finals, juniors, juniorQuizzes, juniorGroups, reflections] = await Promise.all([
    listJson<Project4PeerResponse>("peer/"),
    getProject4Representatives(),
    getProject4PresentationReviews(),
    listJson<Project4AiReview>("ai/"),
    listJson<Project4FinalScript>("final/"),
    listJson<Project4JuniorResponse>("junior/"),
    getProject4JuniorQuizzes(),
    getAllProject4JuniorGroupEvaluations(),
    listJson<Project4Reflection>("reflection/"),
  ]);
  const growthReports = await getProject4GrowthReports(config, juniorGroups, juniors);
  return { peer, representatives, presentations, ai, finals, juniors, juniorQuizzes, juniorGroups, reflections, growthReports };
}
