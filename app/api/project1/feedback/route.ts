import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { isTeacherSessionFor } from "@/lib/server/teacher-accounts";
import { requestProject1Claude } from "@/lib/server/project1-claude";
import {
  listProject1FeedbackReviews,
  project1RubricHash,
  readProject1FeedbackCache,
  readProject1FeedbackReview,
  readProject1Shared,
  resolveProject1Scope,
  writeProject1FeedbackCache,
  writeProject1FeedbackReview,
  writeProject1Shared,
  type Project1AiFeedback,
  type Project1AiFeedbackItem,
  type Project1FeedbackReview,
  type Project1Scope,
} from "@/lib/server/project1-feedback-store";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PDF_BYTES = 22 * 1024 * 1024;

type RubricItem = {
  no: number;
  name: string;
  high: number;
  mid: number;
  low: number;
  hi: string;
  mi: string;
  lo: string;
};

type Project1Config = {
  project?: { subject?: string };
  rubric?: { aiFeedback?: { items?: RubricItem[] } };
  groups?: Array<{
    id?: string;
    classId?: string;
    members?: string[];
  }>;
};

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeGroupId(value: unknown) {
  const groupId = text(value, 120);
  if (!groupId || !/^[\p{L}\p{N}_:.-]+$/u.test(groupId)) {
    throw new Error("모둠 정보를 확인해 주세요.");
  }
  return groupId;
}

function safeRubricItems(value: unknown): RubricItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((item, index) => {
    const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      no: Math.max(1, Math.round(numeric(source.no, index + 1))),
      name: text(source.name, 120),
      high: numeric(source.high),
      mid: numeric(source.mid),
      low: numeric(source.low),
      hi: text(source.hi, 600),
      mi: text(source.mi, 600),
      lo: text(source.lo, 600),
    };
  }).filter((item) => item.name);
}

function extractJson(value: string) {
  const cleaned = value.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI 피드백 형식을 읽지 못했습니다.");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

function itemScore(item: RubricItem, rating: Project1AiFeedbackItem["rating"]) {
  if (rating === "상") return item.high;
  if (rating === "하") return item.low;
  return item.mid;
}

function normalizeFeedback(parsed: Record<string, unknown>, items: RubricItem[]): Project1AiFeedback {
  const parsedItems = Array.isArray(parsed.items) ? parsed.items : [];
  const normalizedItems = items.map((item) => {
    const match = parsedItems.find((candidate) => {
      if (!candidate || typeof candidate !== "object") return false;
      return Number((candidate as Record<string, unknown>).no) === item.no;
    });
    const source = match && typeof match === "object" ? match as Record<string, unknown> : {};
    const candidateRating = text(source.rating, 10);
    const rating: Project1AiFeedbackItem["rating"] = candidateRating === "상" || candidateRating === "하"
      ? candidateRating
      : "중";
    return {
      no: item.no,
      rating,
      score: itemScore(item, rating),
      reason: text(source.reason, 40),
    };
  });
  return {
    summary: text(parsed.summary, 120),
    items: normalizedItems,
    aiScore: normalizedItems.reduce((sum, item) => sum + item.score, 0),
    aiMax: items.reduce((sum, item) => sum + item.high, 0),
    good: text(parsed.good, 120),
    improve: text(parsed.improve, 150),
  };
}

function promptFor(subject: string, items: RubricItem[]) {
  const rubricText = items.map((item) =>
    `${item.no}. ${item.name} — 상(${item.high}점): ${item.hi} / 중(${item.mid}점): ${item.mi} / 하(${item.low}점): ${item.lo}`,
  ).join("\n");
  return `당신은 초등학생 프로젝트(주제: "${subject}")의 결과물을 보고, 학생이 결과물을 더 좋게 고치도록 돕는 따뜻한 선생님입니다.
이 평가는 점수를 매기기 위한 것이 아니라 "수정에 참고할 피드백"을 주기 위한 것입니다.
첨부된 PDF 결과물을 읽고 아래 ${items.length}개 항목을 각각 상/중/하로 평가하고, 고치면 좋을 점을 알려 주세요.

${rubricText}

규칙:
- 각 항목 rating은 "상","중","하" 중 하나, score는 해당 등급 점수.
- reason은 한국어 40자 이내의 근거.
- summary는 다른 모둠 친구들이 읽고 평가에 참고할 수 있도록 결과물 내용을 120자 이내로 요약.
- good은 이 결과물에서 특히 잘한 점 2~3가지를 초등학생이 이해할 수 있는 따뜻한 말투로(한국어 120자 이내).
- improve는 더 좋게 고치면 좋을 점 2~3가지를 구체적이고 친절하게(한국어 150자 이내).
- 사실 확인을 꼭 하세요. 쉬운 표현이나 다른 말로 설명한 것은 허용하되, ${subject}에 관한 사실 오류는 그냥 넘어가지 말고 해당 항목 rating을 낮추며 improve에 바르게 고칠 내용을 포함하세요.
- PDF에 구체적인 사실, 이름, 수치, 개념이 나오면 web_search 도구로 신뢰할 수 있는 자료를 찾아 대조하세요.
- 사실 오류를 발견하면 improve의 첫머리를 "사실 확인:"으로 시작하세요.
- 확실하지 않은 내용은 단정하지 말고 자료로 다시 확인하도록 안내하세요.
다른 말 없이 아래 JSON 형식으로만 응답:
{"summary":"...","items":[{"no":1,"rating":"상","score":20,"reason":"..."}],"good":"...","improve":"..."}`;
}

function pdfBase64(pdfData: string) {
  const prefix = "data:application/pdf;base64,";
  if (!pdfData.startsWith(prefix)) throw new Error("PDF 파일 형식을 확인해 주세요.");
  const base64 = pdfData.slice(prefix.length);
  if (!base64 || base64.length > Math.ceil(MAX_PDF_BYTES * 4 / 3) + 8) {
    throw new Error("PDF는 최대 22MB까지 올릴 수 있어요.");
  }
  return base64;
}

function contentHash(review: Pick<Project1FeedbackReview, "contentSignature" | "requestId">) {
  const signatureHash = text(review.contentSignature?.contentHash, 128);
  return signatureHash || review.requestId;
}

async function generateFeedback(
  scope: Project1Scope,
  review: Project1FeedbackReview,
  config: Project1Config,
  force = false,
) {
  const items = safeRubricItems(config.rubric?.aiFeedback?.items);
  if (items.length === 0) throw new Error("AI 피드백 루브릭을 확인해 주세요.");
  const subject = text(config.project?.subject, 200) || "프로젝트";
  const rubricHash = project1RubricHash(subject, items);
  const hash = contentHash(review);
  if (!force) {
    const cached = await readProject1FeedbackCache(scope, rubricHash, hash);
    if (cached) return { feedback: cached, rubricHash };
  }

  const result = await requestProject1Claude({
    instanceId: scope.instanceId || undefined,
    maxTokens: 1200,
    messages: [{
      role: "user",
      content: [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: pdfBase64(review.pdfData),
          },
        },
        { type: "text", text: promptFor(subject, items) },
      ],
    }],
  });
  const feedback = normalizeFeedback(extractJson(result.text), items);
  await writeProject1FeedbackCache(scope, rubricHash, hash, feedback);
  return { feedback, rubricHash };
}

function studentStatus(review: Project1FeedbackReview | null, legacyApproved = false) {
  if (!review) return { status: legacyApproved ? "approved" : "none" };
  return {
    status: review.status,
    requestId: review.requestId,
    version: review.version,
    groupId: review.groupId,
    fileName: review.fileName,
    fileSize: review.fileSize,
    submittedBy: review.submittedBy,
    requestedAt: review.requestedAt,
    updatedAt: review.updatedAt,
    teacherNote: review.status === "changes_requested" ? review.teacherNote || "" : "",
    error: review.status === "failed" ? review.error || "" : "",
  };
}

function teacherSummary(review: Project1FeedbackReview) {
  const summary: Partial<Project1FeedbackReview> = { ...review };
  delete summary.pdfData;
  delete summary.aiFeedback;
  return summary;
}

async function requireTeacher(scope: Project1Scope) {
  if (!await isTeacherSessionFor(scope.teacherId)) {
    throw new Error("교사 로그인이 필요합니다.");
  }
}

async function projectConfig(scope: Project1Scope) {
  const config = await readProject1Shared<Project1Config>(scope, "pj_config");
  if (!config) throw new Error("먼저 프로젝트 설정을 저장해 주세요.");
  return config;
}

export async function POST(request: Request) {
  let activeReview: Project1FeedbackReview | null = null;
  let activeScope: Project1Scope | null = null;
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action, 40);
    const scope = await resolveProject1Scope(text(body.instanceId, 200) || undefined);
    activeScope = scope;

    if (action === "status") {
      const groupId = safeGroupId(body.groupId);
      const [review, draft] = await Promise.all([
        readProject1FeedbackReview(scope, groupId),
        readProject1Shared(scope, `pj_draft_${groupId}`),
      ]);
      return NextResponse.json(studentStatus(review, Boolean(draft)));
    }

    if (action === "request") {
      const groupId = safeGroupId(body.groupId);
      const config = await projectConfig(scope);
      const group = config.groups?.find((candidate) => candidate.id === groupId);
      const submittedBy = text(body.submittedBy, 100);
      if (!group || !submittedBy || !group.members?.includes(submittedBy)) {
        return NextResponse.json({ error: "학생과 모둠 정보를 확인해 주세요." }, { status: 400 });
      }

      const [existingDraft, existing] = await Promise.all([
        readProject1Shared(scope, `pj_draft_${groupId}`),
        readProject1FeedbackReview(scope, groupId),
      ]);
      if (existing && ["generating", "pending_review"].includes(existing.status)) {
        return NextResponse.json(studentStatus(existing));
      }
      const canReplaceApproved = body.replaceApproved === true
        || existing?.status === "changes_requested"
        || existing?.status === "failed";
      if (existingDraft && !canReplaceApproved) {
        return NextResponse.json({ status: "approved" });
      }

      const fileSize = Math.round(numeric(body.fileSize));
      if (fileSize <= 0 || fileSize > MAX_PDF_BYTES) {
        return NextResponse.json({ error: "PDF는 최대 22MB까지 올릴 수 있어요." }, { status: 400 });
      }
      const pdfData = text(body.pdfData, Math.ceil(MAX_PDF_BYTES * 4 / 3) + 200);
      pdfBase64(pdfData);
      const signature = body.contentSignature && typeof body.contentSignature === "object"
        ? body.contentSignature as Record<string, unknown>
        : {};
      const now = Date.now();
      const review: Project1FeedbackReview = {
        schema: "project1-feedback-review-v1",
        requestId: randomUUID(),
        version: (existing?.version || 0) + 1,
        groupId,
        classId: text(group.classId, 120),
        fileName: text(body.fileName, 240) || "초안.pdf",
        fileSize,
        pdfData,
        submittedBy,
        requestedAt: now,
        updatedAt: now,
        status: "generating",
        contentSignature: signature,
        rubricHash: "",
      };
      activeReview = review;
      await writeProject1FeedbackReview(scope, review);
      const generated = await generateFeedback(scope, review, config);
      const pending: Project1FeedbackReview = {
        ...review,
        status: "pending_review",
        updatedAt: Date.now(),
        rubricHash: generated.rubricHash,
        aiFeedback: generated.feedback,
      };
      activeReview = pending;
      await writeProject1FeedbackReview(scope, pending);
      return NextResponse.json(studentStatus(pending));
    }

    await requireTeacher(scope);

    if (action === "list") {
      const reviews = await listProject1FeedbackReviews(scope);
      return NextResponse.json({
        reviews: reviews
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map(teacherSummary),
      });
    }

    const groupId = safeGroupId(body.groupId);
    const review = await readProject1FeedbackReview(scope, groupId);
    if (!review) return NextResponse.json({ error: "검토할 피드백을 찾지 못했습니다." }, { status: 404 });
    const expectedRequestId = text(body.requestId, 100);
    if (expectedRequestId && expectedRequestId !== review.requestId) {
      return NextResponse.json({ error: "새 요청이 도착했습니다. 목록을 새로고침해 주세요." }, { status: 409 });
    }

    if (action === "detail") {
      return NextResponse.json({ review });
    }

    if (action === "approve") {
      if (review.status !== "pending_review" || !review.aiFeedback) {
        return NextResponse.json({ error: "검토 대기 중인 피드백만 승인할 수 있습니다." }, { status: 409 });
      }
      const approvedAt = Date.now();
      await writeProject1Shared(scope, `pj_draft_${groupId}`, {
        groupId,
        fileName: review.fileName,
        ...review.aiFeedback,
        submittedBy: review.submittedBy,
        ts: review.requestedAt,
        contentSignature: review.contentSignature || {},
        pdfData: review.pdfData,
        fileSize: review.fileSize,
        approvalStatus: "approved",
        approvedAt,
        approvedBy: scope.teacherId,
        feedbackRequestId: review.requestId,
      });
      await writeProject1Shared(scope, "pj_results_version", {
        ts: approvedAt,
        id: randomUUID(),
        reason: "feedback-approved",
      });
      const approved: Project1FeedbackReview = {
        ...review,
        status: "approved",
        updatedAt: approvedAt,
        reviewedAt: approvedAt,
        reviewedBy: scope.teacherId,
      };
      await writeProject1FeedbackReview(scope, approved);
      return NextResponse.json({ review: teacherSummary(approved) });
    }

    if (action === "request_changes") {
      if (review.status !== "pending_review") {
        return NextResponse.json({ error: "검토 대기 중인 피드백만 재제출 요청할 수 있습니다." }, { status: 409 });
      }
      const changed: Project1FeedbackReview = {
        ...review,
        status: "changes_requested",
        updatedAt: Date.now(),
        teacherNote: text(body.teacherNote, 500) || "PDF를 확인한 뒤 다시 요청해 주세요.",
        reviewedAt: Date.now(),
        reviewedBy: scope.teacherId,
      };
      await writeProject1FeedbackReview(scope, changed);
      return NextResponse.json({ review: teacherSummary(changed) });
    }

    if (action === "regenerate") {
      if (!["pending_review", "failed"].includes(review.status)) {
        return NextResponse.json({ error: "검토 대기 또는 생성 실패 상태에서 다시 만들 수 있습니다." }, { status: 409 });
      }
      const generating: Project1FeedbackReview = {
        ...review,
        status: "generating",
        version: review.version + 1,
        updatedAt: Date.now(),
        error: "",
        teacherNote: "",
      };
      activeReview = generating;
      await writeProject1FeedbackReview(scope, generating);
      const generated = await generateFeedback(scope, generating, await projectConfig(scope), true);
      const pending: Project1FeedbackReview = {
        ...generating,
        requestId: randomUUID(),
        status: "pending_review",
        updatedAt: Date.now(),
        rubricHash: generated.rubricHash,
        aiFeedback: generated.feedback,
      };
      activeReview = pending;
      await writeProject1FeedbackReview(scope, pending);
      return NextResponse.json({ review: teacherSummary(pending) });
    }

    return NextResponse.json({ error: "피드백 요청 동작을 확인해 주세요." }, { status: 400 });
  } catch (error) {
    console.error("Project1 feedback request failed:", error);
    if (activeScope && activeReview && activeReview.status === "generating") {
      await writeProject1FeedbackReview(activeScope, {
        ...activeReview,
        status: "failed",
        updatedAt: Date.now(),
        error: error instanceof Error ? error.message : "AI 피드백을 만들지 못했습니다.",
      }).catch((writeError) => console.error("Project1 feedback failure save failed:", writeError));
    }
    const message = error instanceof Error ? error.message : "AI 피드백 요청을 처리하지 못했습니다.";
    const status = message === "교사 로그인이 필요합니다." ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
