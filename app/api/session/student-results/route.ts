import { NextResponse } from "next/server";
import { decryptSessionClassConfig } from "@/lib/session-token";
import { listSessionResponses } from "@/lib/server/session-store";
import type {
  EvaluationSessionResponse,
  SessionPeerStep,
  SessionRespondent,
} from "@/lib/evaluation-session";
import { isScoredQuestion } from "@/lib/rubric-levels";

export const runtime = "nodejs";

function compactKey(value?: string | number) {
  return String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

function teamKey(value?: string | number) {
  const text = String(value ?? "").trim();
  const numeric = text.match(/\d+/)?.[0];
  return numeric ?? compactKey(text);
}

function peerAnswerValue(response: EvaluationSessionResponse, questionId: string) {
  if (response.payload.type !== "peer") return undefined;
  return response.payload.answers.find((answer) => answer.questionId === questionId)?.value;
}

function isForStudent(response: EvaluationSessionResponse, respondent: SessionRespondent) {
  if (response.payload.type !== "peer") return false;
  if (response.payload.mode === "team") {
    return teamKey(response.payload.target.teamNumber) === teamKey(respondent.team);
  }
  return compactKey(response.payload.target.name) === compactKey(respondent.name);
}

function targetLabel(response: EvaluationSessionResponse) {
  if (response.payload.type !== "peer") return "";
  if (response.payload.mode === "team") return `${response.payload.target.teamNumber ?? "미지정"}모둠`;
  return response.payload.target.name?.trim() || "이름 미입력";
}

function normalizeRespondent(input: Partial<SessionRespondent>): SessionRespondent {
  const respondent = {
    grade: input.grade?.trim() ?? "",
    className: input.className?.trim() ?? "",
    name: input.name?.trim() ?? "",
    team: input.team?.trim() || undefined,
  };
  if (!respondent.grade || !respondent.className || !respondent.name) {
    throw new Error("학년, 반, 이름을 모두 입력해 주세요.");
  }
  return respondent;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      sessionToken?: string;
      respondent?: Partial<SessionRespondent>;
    };
    if (!body.sessionToken) {
      return NextResponse.json(
        { error: "세션 링크 정보를 확인해 주세요." },
        { status: 400 },
      );
    }

    const config = decryptSessionClassConfig(body.sessionToken);
    const respondent = normalizeRespondent(body.respondent ?? {});
    const sharing = config.studentResultSharing;
    if (!sharing.enabled) {
      return NextResponse.json({
        published: false,
        message: "선생님이 아직 학생 결과를 공개하지 않았습니다.",
      });
    }

    const peerSteps = new Map(
      config.steps
        .filter((step): step is SessionPeerStep => step.kind === "peer")
        .map((step) => [step.id, step]),
    );
    const responses = await listSessionResponses(config.teacherId ?? "", config.evaluationId ?? "");
    const received = responses.filter((response) => isForStudent(response, respondent));
    const grouped = new Map<string, EvaluationSessionResponse[]>();
    for (const response of received) {
      const key = response.stepId;
      grouped.set(key, [...(grouped.get(key) ?? []), response]);
    }

    const reports = Array.from(grouped.entries()).map(([stepId, targetResponses]) => {
      const step = peerSteps.get(stepId);
      const first = targetResponses[0];
      const scoreQuestions = step?.config.questions.filter(isScoredQuestion) ?? [];
      const textQuestions = step?.config.questions.filter((question) => question.type === "text") ?? [];
      const scores = scoreQuestions.map((question) => {
        const values = targetResponses
          .map((response) => peerAnswerValue(response, question.id))
          .filter((value): value is number => typeof value === "number");
        return {
          questionId: question.id,
          prompt: question.prompt,
          average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
          maxScore: question.maxScore,
          count: values.length,
        };
      });
      const scoreAverage = scores.reduce((sum, score) => sum + score.average, 0);
      const scoreMax = scores.reduce((sum, score) => sum + score.maxScore, 0);
      const commentsVisible = targetResponses.length >= sharing.minPeerResponses;
      const comments = textQuestions.map((question) => ({
        questionId: question.id,
        prompt: question.prompt,
        withheld: !commentsVisible,
        comments: commentsVisible
          ? targetResponses
            .map((response) => ({
              text: String(peerAnswerValue(response, question.id) ?? "").trim(),
              respondent: sharing.anonymizeRespondents
                ? undefined
                : `${response.respondent.name}${response.respondent.team ? ` · ${response.respondent.team}모둠` : ""}`,
            }))
            .filter((comment) => comment.text)
          : [],
      }));

      return {
        stepId,
        stepTitle: step?.title ?? first.stepTitle,
        label: targetLabel(first),
        responseCount: targetResponses.length,
        scoreAverage,
        scoreMax,
        scores,
        comments,
      };
    });

    return NextResponse.json({
      published: true,
      anonymized: sharing.anonymizeRespondents,
      minPeerResponses: sharing.minPeerResponses,
      reports,
    });
  } catch (error) {
    console.error("Student session results load failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "학생 결과를 불러오지 못했습니다." },
      { status: 400 },
    );
  }
}
