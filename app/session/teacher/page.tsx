"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createSessionStepId,
  defaultEvaluationSessionConfig,
  defaultReflectionQuestions,
  defaultSelfQuestions,
  loadSessionResponses,
  sessionStepLabel,
  validateEvaluationSessionConfig,
  type EvaluationSessionConfig,
  type EvaluationSessionResponse,
  type EvaluationSessionStep,
  type SessionPeerStep,
  type SessionSelfQuestion,
} from "@/lib/evaluation-session";
import {
  isTeacherId,
  loadEvaluation,
  loadEvaluations,
  saveEvaluation,
  type SavedEvaluation,
  type TeacherId,
} from "@/lib/teacher-evaluations";
import type { GeneratedQuestionSet } from "@/lib/ai-question-generation";
import {
  createDefaultRubricLevels,
  isScoredQuestion,
  maxScoreFromLevels,
  normalizeRubricLevels,
  type RubricLevel,
} from "@/lib/rubric-levels";

function cloneDefaultConfig(): EvaluationSessionConfig {
  return {
    ...defaultEvaluationSessionConfig,
    steps: [],
  };
}

function stepFromEvaluation(evaluation: SavedEvaluation): EvaluationSessionStep | null {
  if (evaluation.type === "session") return null;
  if (evaluation.type === "pdf" || evaluation.type === "docs") {
    return {
      id: createSessionStepId(),
      kind: evaluation.type,
      title: evaluation.config.classTitle,
      required: true,
      sourceEvaluationId: evaluation.id,
      config: {
        ...evaluation.config,
        apiKey: "",
        apiKeys: { openai: "", anthropic: "" },
      },
    };
  }
  if (evaluation.type === "peer") {
    return {
      id: createSessionStepId(),
      kind: "peer",
      title: evaluation.config.title,
      required: true,
      sourceEvaluationId: evaluation.id,
      config: evaluation.config,
    };
  }
  return null;
}

function evaluationTitle(evaluation: SavedEvaluation) {
  if (evaluation.type === "peer" || evaluation.type === "session") {
    return evaluation.config.title;
  }
  return evaluation.config.classTitle;
}

function responseKey(response: EvaluationSessionResponse) {
  return [
    response.respondent.grade,
    response.respondent.className,
    response.respondent.name,
    response.respondent.team ?? "",
  ].join(" ");
}

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function peerTargetKey(response: EvaluationSessionResponse) {
  if (response.payload.type !== "peer") return "";
  if (response.payload.mode === "team") {
    return `team:${response.payload.target.teamNumber ?? "unknown"}`;
  }
  return `student:${response.payload.target.name?.trim().replace(/\s+/g, "").toLowerCase() ?? "unknown"}`;
}

function peerTargetLabel(response: EvaluationSessionResponse) {
  if (response.payload.type !== "peer") return "";
  if (response.payload.mode === "team") {
    return `${response.payload.target.teamNumber ?? "미지정"}모둠`;
  }
  return response.payload.target.name?.trim() || "이름 미입력";
}

function peerAnswerValue(response: EvaluationSessionResponse, questionId: string) {
  if (response.payload.type !== "peer") return undefined;
  return response.payload.answers.find((answer) => answer.questionId === questionId)?.value;
}

function peerScoreText(step: SessionPeerStep | undefined, response: EvaluationSessionResponse) {
  if (response.payload.type !== "peer") return "";
  const questions = step?.config.questions.filter(isScoredQuestion) ?? [];
  const score = questions.reduce((sum, question) => {
    const value = peerAnswerValue(response, question.id);
    return typeof value === "number" ? sum + value : sum;
  }, 0);
  const maxScore = questions.reduce((sum, question) => sum + question.maxScore, 0);
  return maxScore ? `${score}/${maxScore}` : "점수형 문항 없음";
}

function buildReceivedPeerReports(
  settings: EvaluationSessionConfig,
  responses: EvaluationSessionResponse[],
) {
  const peerSteps = new Map(
    settings.steps
      .filter((step): step is SessionPeerStep => step.kind === "peer")
      .map((step) => [step.id, step]),
  );
  const grouped = new Map<string, { step: SessionPeerStep; responses: EvaluationSessionResponse[] }>();

  for (const response of responses) {
    if (response.payload.type !== "peer") continue;
    const step = peerSteps.get(response.stepId);
    if (!step) continue;
    const key = `${response.stepId}:${peerTargetKey(response)}`;
    const current = grouped.get(key);
    grouped.set(key, {
      step,
      responses: [...(current?.responses ?? []), response],
    });
  }

  return Array.from(grouped.entries()).map(([key, group]) => {
    const first = group.responses[0];
    const scoreQuestions = group.step.config.questions.filter(isScoredQuestion);
    const scores = scoreQuestions.map((question) => {
      const values = group.responses
        .map((response) => peerAnswerValue(response, question.id))
        .filter((value): value is number => typeof value === "number");
      const average = values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0;
      return {
        question,
        average,
        count: values.length,
      };
    });
    const scoreMax = scores.reduce((sum, score) => sum + score.question.maxScore, 0);
    const scoreAverage = scores.reduce((sum, score) => sum + score.average, 0);
    const comments = group.step.config.questions
      .filter((question) => question.type === "text")
      .map((question) => ({
        question,
        comments: group.responses
          .map((response) => ({
            text: String(peerAnswerValue(response, question.id) ?? "").trim(),
            respondent: `${response.respondent.name}${response.respondent.team ? ` · ${response.respondent.team}모둠` : ""}`,
          }))
          .filter((comment) => comment.text),
      }));

    return {
      key,
      stepTitle: group.step.title,
      label: peerTargetLabel(first),
      mode: first.payload.type === "peer" ? first.payload.mode : group.step.config.mode,
      responseCount: group.responses.length,
      scoreAverage,
      scoreMax,
      scores,
      comments,
    };
  }).sort((a, b) => `${a.stepTitle} ${a.label}`.localeCompare(`${b.stepTitle} ${b.label}`, "ko-KR", { numeric: true }));
}

export default function SessionTeacherPage() {
  const [settings, setSettings] = useState<EvaluationSessionConfig>(cloneDefaultConfig);
  const [teacherId, setTeacherId] = useState<TeacherId | null>(null);
  const [evaluationId, setEvaluationId] = useState("");
  const [available, setAvailable] = useState<SavedEvaluation[]>([]);
  const [responses, setResponses] = useState<EvaluationSessionResponse[]>([]);
  const [classUrl, setClassUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [storageMessage, setStorageMessage] = useState("");
  const [selfAiRubrics, setSelfAiRubrics] = useState<Record<string, string>>({});
  const [selfAiPreview, setSelfAiPreview] = useState<{
    stepId: string;
    result: GeneratedQuestionSet;
  } | null>(null);
  const [selfAiLoadingStepId, setSelfAiLoadingStepId] = useState("");
  const [selfAiError, setSelfAiError] = useState<{ stepId: string; message: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTeacherId = params.get("teacher") ?? "";
    const requestedEvaluationId = params.get("evaluation") ?? "";
    if (!isTeacherId(requestedTeacherId)) return;

    queueMicrotask(async () => {
      setTeacherId(requestedTeacherId);
      try {
        const evaluations = await loadEvaluations(requestedTeacherId);
        setAvailable(evaluations.filter((evaluation) => evaluation.type !== "session"));
        if (requestedEvaluationId) {
          const saved = await loadEvaluation(requestedTeacherId, requestedEvaluationId);
          if (saved?.type === "session") {
            setEvaluationId(saved.id);
            setSettings(saved.config);
            setResponses(await loadSessionResponses(requestedTeacherId, saved.id));
            setStorageMessage("저장된 묶음 평가를 불러왔습니다.");
          }
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "묶음 평가 정보를 불러오지 못했습니다.");
      }
    });
  }, []);

  const groupedResponses = useMemo(() => {
    const grouped = new Map<string, EvaluationSessionResponse[]>();
    for (const response of responses) {
      const key = responseKey(response);
      grouped.set(key, [...(grouped.get(key) ?? []), response]);
    }
    return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0], "ko-KR"));
  }, [responses]);

  const peerReports = useMemo(
    () => buildReceivedPeerReports(settings, responses),
    [responses, settings],
  );

  const peerSteps = useMemo(() => new Map(
    settings.steps
      .filter((step): step is SessionPeerStep => step.kind === "peer")
      .map((step) => [step.id, step]),
  ), [settings.steps]);

  function addExistingEvaluation(evaluationIdToAdd: string) {
    const evaluation = available.find(({ id }) => id === evaluationIdToAdd);
    if (!evaluation) return;
    const step = stepFromEvaluation(evaluation);
    if (!step) return;
    setSettings((current) => ({
      ...current,
      steps: [...current.steps, step],
    }));
  }

  function addSelfStep() {
    setSettings((current) => ({
      ...current,
      steps: [
        ...current.steps,
        {
          id: createSessionStepId(),
          kind: "self",
          title: "자기평가",
          required: true,
          questions: defaultSelfQuestions.map((question) => ({ ...question })),
        },
      ],
    }));
  }

  function addReflectionStep() {
    setSettings((current) => ({
      ...current,
      steps: [
        ...current.steps,
        {
          id: createSessionStepId(),
          kind: "reflection",
          title: "프로젝트 성찰",
          required: true,
          questions: [...defaultReflectionQuestions],
        },
      ],
    }));
  }

  function removeStep(stepId: string) {
    setSettings((current) => ({
      ...current,
      steps: current.steps.filter((step) => step.id !== stepId),
    }));
    setSelfAiRubrics((current) => {
      const next = { ...current };
      delete next[stepId];
      return next;
    });
    if (selfAiPreview?.stepId === stepId) setSelfAiPreview(null);
  }

  function moveStep(stepId: string, direction: -1 | 1) {
    setSettings((current) => {
      const index = current.steps.findIndex((step) => step.id === stepId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.steps.length) return current;
      const steps = [...current.steps];
      const [step] = steps.splice(index, 1);
      steps.splice(nextIndex, 0, step);
      return { ...current, steps };
    });
  }

  function updateSelfQuestion(
    stepId: string,
    questionId: string,
    patch: Partial<SessionSelfQuestion>,
  ) {
    setSettings((current) => ({
      ...current,
      steps: current.steps.map((item) => {
        if (item.id !== stepId || item.kind !== "self") return item;
        return {
          ...item,
          questions: item.questions.map((question) => (
            question.id === questionId ? { ...question, ...patch } : question
          )),
        };
      }),
    }));
  }

  function addSelfQuestion(stepId: string) {
    setSettings((current) => ({
      ...current,
      steps: current.steps.map((item) => {
        if (item.id !== stepId || item.kind !== "self") return item;
        return {
          ...item,
          questions: [
            ...item.questions,
            {
              id: `self-${crypto.randomUUID()}`,
              prompt: "",
              type: "score",
              maxScore: 5,
              required: true,
            },
          ],
        };
      }),
    }));
  }

  function removeSelfQuestion(stepId: string, questionId: string) {
    setSettings((current) => ({
      ...current,
      steps: current.steps.map((item) => {
        if (item.id !== stepId || item.kind !== "self" || item.questions.length <= 1) return item;
        return {
          ...item,
          questions: item.questions.filter((question) => question.id !== questionId),
        };
      }),
    }));
  }

  function changeSelfQuestionType(
    stepId: string,
    question: SessionSelfQuestion,
    type: SessionSelfQuestion["type"],
  ) {
    if (type === "level") {
      const levels = normalizeRubricLevels(question.levels, question.maxScore);
      updateSelfQuestion(stepId, question.id, {
        type,
        levels,
        maxScore: maxScoreFromLevels(levels, question.maxScore),
      });
      return;
    }
    updateSelfQuestion(stepId, question.id, {
      type,
      levels: undefined,
    });
  }

  function updateSelfQuestionLevel(
    stepId: string,
    question: SessionSelfQuestion,
    levelId: string,
    patch: Partial<RubricLevel>,
  ) {
    const levels = normalizeRubricLevels(question.levels, question.maxScore).map((level) => (
      level.id === levelId ? { ...level, ...patch } : level
    ));
    updateSelfQuestion(stepId, question.id, {
      levels,
      maxScore: maxScoreFromLevels(levels, question.maxScore),
    });
  }

  async function generateSelfQuestions(stepId: string, title: string) {
    if (!teacherId) {
      setSelfAiError({
        stepId,
        message: "교사 ID로 입장한 뒤 AI 자동생성을 사용할 수 있습니다.",
      });
      return;
    }
    setSelfAiLoadingStepId(stepId);
    setSelfAiError(null);
    try {
      const response = await fetch("/api/ai/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherId,
          kind: "self",
          rubric: selfAiRubrics[stepId] ?? "",
          title,
        }),
      });
      const data = await response.json() as {
        result?: GeneratedQuestionSet;
        error?: string;
      };
      if (!response.ok || !data.result) {
        throw new Error(data.error || "AI 문항을 생성하지 못했습니다.");
      }
      setSelfAiPreview({ stepId, result: data.result });
    } catch (caught) {
      setSelfAiError({
        stepId,
        message: caught instanceof Error ? caught.message : "AI 문항을 생성하지 못했습니다.",
      });
    } finally {
      setSelfAiLoadingStepId("");
    }
  }

  function applySelfGeneratedQuestions(stepId: string) {
    if (!selfAiPreview || selfAiPreview.stepId !== stepId) return;
    const { result } = selfAiPreview;
    setSettings((current) => ({
      ...current,
      steps: current.steps.map((item) => {
        if (item.id !== stepId || item.kind !== "self") return item;
        return {
          ...item,
          title: result.title || item.title,
          questions: result.questions.map((question) => ({ ...question })),
        };
      }),
    }));
    setStorageMessage(`${result.model}이 만든 자기평가 문항을 적용했어요.`);
    window.setTimeout(() => setStorageMessage(""), 2800);
  }

  async function persistSettings(message = "묶음 평가를 저장했습니다.") {
    if (!teacherId) throw new Error("교사 ID로 입장한 뒤 저장해 주세요.");
    const validationError = validateEvaluationSessionConfig(settings);
    if (validationError) throw new Error(validationError);
    const saved = await saveEvaluation(teacherId, "session", settings, evaluationId || undefined);
    if (saved.type !== "session") throw new Error("묶음 평가 저장 결과를 확인해 주세요.");
    setEvaluationId(saved.id);
    setSettings(saved.config);
    window.history.replaceState(
      null,
      "",
      `/session/teacher?teacher=${teacherId}&evaluation=${saved.id}`,
    );
    setStorageMessage(message);
    window.setTimeout(() => setStorageMessage(""), 2800);
    return saved;
  }

  async function createClassLink(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setClassUrl("");
    try {
      const saved = await persistSettings("묶음 평가를 저장하고 학생 링크를 만들었습니다.");
      const response = await fetch("/api/session/class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saved.config),
      });
      const data = await response.json() as { token?: string; error?: string };
      if (!response.ok || !data.token) throw new Error(data.error || "세션 링크를 만들지 못했습니다.");
      setClassUrl(`${window.location.origin}/session?class=${encodeURIComponent(data.token)}`);
      setResponses(await loadSessionResponses(teacherId as TeacherId, saved.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "세션 링크를 만들지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshResponses() {
    if (!teacherId || !evaluationId) return;
    setResponses(await loadSessionResponses(teacherId, evaluationId));
  }

  async function copyLink() {
    await navigator.clipboard.writeText(classUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function openSessionReport() {
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      setError("팝업을 허용한 뒤 다시 시도해 주세요.");
      return;
    }
    const peerSummaryRows = peerReports.map((target) => `
      <section>
        <h2>${escapeHtml(target.stepTitle)} · ${escapeHtml(target.label)}</h2>
        <p class="meta">${escapeHtml(target.mode === "team" ? "모둠 동료평가" : "개인 동료평가")} · ${target.responseCount}개 응답 · 평균 ${target.scoreAverage.toFixed(1)} / ${target.scoreMax || 0}</p>
        <div class="scores">
          ${target.scores.map((score) => `
            <article>
              <div><strong>${escapeHtml(score.question.prompt)}</strong><span>${score.count}개 응답</span></div>
              <p>${score.average.toFixed(1)} / ${score.question.maxScore}</p>
            </article>
          `).join("") || "<p>점수형 문항이 없습니다.</p>"}
        </div>
        <div class="comments">
          ${target.comments.map((group) => `
            <article>
              <div><strong>${escapeHtml(group.question.prompt)}</strong><span>${group.comments.length}개 답변</span></div>
              ${group.comments.length
                ? `<ul>${group.comments.map((comment) => `<li>${escapeHtml(comment.text)}<small>${escapeHtml(comment.respondent)}</small></li>`).join("")}</ul>`
                : "<p>아직 작성된 서술형 답변이 없습니다.</p>"}
            </article>
          `).join("") || "<p>서술형 문항이 없습니다.</p>"}
        </div>
      </section>
    `).join("");
    const rows = groupedResponses.map(([student, items]) => `
      <section>
        <h2>${escapeHtml(student)}</h2>
        ${items.map((item) => `
          <article>
            <div><strong>${escapeHtml(item.stepTitle)}</strong><span>${escapeHtml(sessionStepLabel(item.stepKind))}</span></div>
            <p>${escapeHtml(item.payload.type === "ai"
              ? `${item.payload.evaluation.totalScore}/${item.payload.evaluation.maxScore} · ${item.payload.evaluation.summary}`
              : item.payload.type === "peer"
                ? `${peerTargetLabel(item)} 평가 · ${peerScoreText(peerSteps.get(item.stepId), item)}`
                : item.payload.type === "self"
                  ? "자기평가 제출"
                  : "성찰 제출")}</p>
          </article>
        `).join("")}
      </section>
    `).join("");
    reportWindow.document.write(`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${escapeHtml(settings.title)} 통합 보고서</title>
<style>
body{margin:0;background:#f7f3ea;color:#17352b;font-family:Arial,sans-serif}
main{width:min(920px,calc(100% - 32px));margin:32px auto;background:white;padding:42px;border:1px solid #ddd5c7}
header{border-bottom:2px solid #17352b;padding-bottom:20px;margin-bottom:24px}
h1{margin:0 0 8px;font-size:30px}p{line-height:1.65}section{break-inside:avoid;margin:22px 0;padding:18px;background:#fbfaf4;border:1px solid #e4ded1}
h2{margin:0 0 14px;font-size:20px}article{padding:14px 0;border-top:1px solid #e8e2d7}
article:first-of-type{border-top:0}article div{display:flex;justify-content:space-between;gap:18px}
span{font-size:11px;font-weight:800;color:#7a6a37}.meta{margin-top:-6px;color:#65736d;font-size:12px}.scores{display:grid;grid-template-columns:1fr 1fr;gap:10px}.scores article,.comments article{background:white;border:1px solid #e8e2d7;padding:12px}.comments{display:grid;gap:10px;margin-top:10px}ul{margin:8px 0 0;padding-left:18px}li{margin:7px 0;line-height:1.55}small{display:block;color:#7a827c;margin-top:2px}footer{margin-top:26px;color:#7a827c;font-size:11px}
@media print{body{background:white}main{width:auto;margin:0;border:0}}
</style>
</head>
<body><main>
<header><h1>${escapeHtml(settings.title)} 통합 보고서</h1><p>${escapeHtml(settings.description)}</p></header>
<h1>받은 동료평가 요약</h1>
${peerSummaryRows || "<p>아직 받은 동료평가 응답이 없습니다.</p>"}
<h1>학생별 제출 현황</h1>
${rows || "<p>아직 제출된 응답이 없습니다.</p>"}
<footer>LEAFBACK SESSION REPORT</footer>
</main></body></html>`);
    reportWindow.document.close();
    window.setTimeout(() => reportWindow.print(), 300);
  }

  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/">
          <span className="brand-mark">SET</span>
          <span>LEAFBACK</span>
          <small>SESSION</small>
        </Link>
        <nav className="header-links">
          {teacherId && <Link className="teacher-link" href={`/teacher/${teacherId}`}>평가 보관함</Link>}
          <Link className="teacher-link" href={teacherId ? `/teacher?teacher=${teacherId}` : "/teacher"}>PDF 평가</Link>
          <Link className="teacher-link" href={teacherId ? `/peer/teacher?teacher=${teacherId}` : "/peer/teacher"}>동료평가</Link>
        </nav>
      </header>

      <section className="teacher-page peer-teacher-page session-teacher-page">
        <div className="teacher-intro">
          <div className="eyebrow"><span /> SESSION BUILDER</div>
          <h1>여러 평가를<br /><em>한 흐름으로 묶습니다.</em></h1>
          <p>이미 만든 PDF, Docs, 동료평가를 순서대로 연결하고 자기평가와 성찰을 더해 프로젝트 단위 보고서를 모읍니다.</p>
          <div className="security-note">
            <strong>{teacherId ? `${teacherId} 선생님의 보관함에 저장됩니다.` : "교사 번호로 들어와 저장해 주세요."}</strong>
            <p>세션은 기존 평가를 복사해서 사용하므로 원본 단일 평가는 그대로 유지됩니다.</p>
          </div>
        </div>

        <form className="settings-form" onSubmit={createClassLink}>
          <div className="settings-title">
            <span>01</span>
            <div><h2>세션 정보</h2><p>학생이 보게 될 묶음 평가의 이름과 안내문입니다.</p></div>
          </div>
          {storageMessage && <div className="storage-message">{storageMessage}</div>}
          <label className="field full">
            <span>세션 제목 <b>*</b></span>
            <input value={settings.title} onChange={(event) => setSettings({ ...settings, title: event.target.value })} />
          </label>
          <label className="field full">
            <span>학생 안내문</span>
            <textarea rows={3} value={settings.description} onChange={(event) => setSettings({ ...settings, description: event.target.value })} />
          </label>
          <div className="session-sharing-options">
            <label className="peer-required-toggle">
              <input
                type="checkbox"
                checked={settings.studentResultSharing.enabled}
                onChange={(event) => setSettings({
                  ...settings,
                  studentResultSharing: {
                    ...settings.studentResultSharing,
                    enabled: event.target.checked,
                  },
                })}
              />
              <span>학생에게 받은 동료평가 결과 공개</span>
            </label>
            <label className="peer-required-toggle">
              <input
                type="checkbox"
                checked={settings.studentResultSharing.anonymizeRespondents}
                onChange={(event) => setSettings({
                  ...settings,
                  studentResultSharing: {
                    ...settings.studentResultSharing,
                    anonymizeRespondents: event.target.checked,
                  },
                })}
                disabled={!settings.studentResultSharing.enabled}
              />
              <span>평가자 이름 숨기기</span>
            </label>
            <label className="field">
              <span>서술형 공개 최소 응답 수</span>
              <input
                type="number"
                min="1"
                max="10"
                value={settings.studentResultSharing.minPeerResponses}
                onChange={(event) => setSettings({
                  ...settings,
                  studentResultSharing: {
                    ...settings.studentResultSharing,
                    minPeerResponses: Number(event.target.value),
                  },
                })}
                disabled={!settings.studentResultSharing.enabled}
              />
            </label>
            <p>학생은 자기 또는 자기 모둠이 받은 점수 평균과 서술형 답변만 볼 수 있습니다.</p>
          </div>

          <div className="settings-title">
            <span>02</span>
            <div><h2>평가 단계 구성</h2><p>기존 평가를 추가하거나 자기평가/성찰을 붙입니다.</p></div>
          </div>
          <div className="field-row">
            <label className="field">
              <span>저장된 평가 추가</span>
              <select defaultValue="" onChange={(event) => {
                addExistingEvaluation(event.target.value);
                event.target.value = "";
              }}>
                <option value="">평가 선택</option>
                {available.map((evaluation) => (
                  <option key={evaluation.id} value={evaluation.id}>
                    {evaluation.type.toUpperCase()} · {evaluationTitle(evaluation)}
                  </option>
                ))}
              </select>
            </label>
            <div className="field" style={{ justifyContent: "end" }}>
              <button type="button" className="secondary-button" onClick={addSelfStep}>자기평가 추가</button>
            </div>
            <div className="field" style={{ justifyContent: "end" }}>
              <button type="button" className="secondary-button" onClick={addReflectionStep}>성찰 추가</button>
            </div>
          </div>

          <div className="peer-builder">
            {settings.steps.length === 0 ? (
              <div className="empty-library">아직 단계가 없습니다. 저장된 평가나 자기평가를 추가해 주세요.</div>
            ) : settings.steps.map((step, index) => (
              <article key={step.id} className="peer-builder-card">
                <div className="peer-builder-top">
                  <span>{String(index + 1).padStart(2, "0")} · {sessionStepLabel(step.kind)}</span>
                  <div>
                    <button type="button" onClick={() => moveStep(step.id, -1)} disabled={index === 0}>위</button>
                    <button type="button" onClick={() => moveStep(step.id, 1)} disabled={index === settings.steps.length - 1}>아래</button>
                    <button type="button" onClick={() => removeStep(step.id)}>삭제</button>
                  </div>
                </div>
                <label className="field full">
                  <span>단계 제목</span>
                  <input value={step.title} onChange={(event) => setSettings((current) => ({
                    ...current,
                    steps: current.steps.map((item) => item.id === step.id ? { ...item, title: event.target.value } : item),
                  }))} />
                </label>
                <p>{step.kind === "self"
                  ? `${step.questions.length}개 자기평가 질문`
                  : step.kind === "reflection"
                    ? `${step.questions.length}개 성찰 질문`
                    : step.kind === "peer"
                      ? `${step.config.questions.length}개 동료평가 질문`
                      : step.config.assignment}</p>
                {step.kind === "self" && (
                  <div className="self-question-editor">
                    {step.questions.map((question, questionIndex) => (
                      <section key={question.id} className="self-question-editor-row">
                        <div className="peer-builder-top">
                          <span>{String(questionIndex + 1).padStart(2, "0")}</span>
                          <button
                            type="button"
                            onClick={() => removeSelfQuestion(step.id, question.id)}
                            disabled={step.questions.length <= 1}
                          >
                            삭제
                          </button>
                        </div>
                        <label className="field full">
                          <span>질문 내용 <b>*</b></span>
                          <input value={question.prompt} onChange={(event) => updateSelfQuestion(step.id, question.id, { prompt: event.target.value })} />
                        </label>
                        <div className="field-row">
                          <label className="field">
                            <span>응답 형식</span>
                            <select value={question.type} onChange={(event) => changeSelfQuestionType(step.id, question, event.target.value === "text" ? "text" : event.target.value === "level" ? "level" : "score")}>
                              <option value="score">점수 입력</option>
                              <option value="level">상중하 선택</option>
                              <option value="text">짧은 글</option>
                            </select>
                          </label>
                          {question.type === "score" ? (
                            <label className="field">
                              <span>최대 점수</span>
                              <input type="number" min="1" max="100" value={question.maxScore} onChange={(event) => updateSelfQuestion(step.id, question.id, { maxScore: Number(event.target.value) })} />
                            </label>
                          ) : question.type === "level" ? (
                            <label className="field">
                              <span>최고 점수</span>
                              <input readOnly value={question.maxScore} />
                            </label>
                          ) : (
                            <label className="peer-required-toggle">
                              <input type="checkbox" checked={question.required} onChange={(event) => updateSelfQuestion(step.id, question.id, { required: event.target.checked })} />
                              <span>필수 응답</span>
                            </label>
                          )}
                        </div>
                        {question.type === "level" && (
                          <div className="level-editor">
                            {(question.levels ?? createDefaultRubricLevels(question.maxScore)).map((level) => (
                              <div key={level.id} className="level-editor-row">
                                <label className="field">
                                  <span>단계</span>
                                  <input value={level.label} onChange={(event) => updateSelfQuestionLevel(step.id, question, level.id, { label: event.target.value })} />
                                </label>
                                <label className="field">
                                  <span>점수</span>
                                  <input type="number" min="0" max="100" value={level.score} onChange={(event) => updateSelfQuestionLevel(step.id, question, level.id, { score: Number(event.target.value) })} />
                                </label>
                                <label className="field level-description-field">
                                  <span>학생에게 보일 문구</span>
                                  <textarea rows={2} value={level.description} onChange={(event) => updateSelfQuestionLevel(step.id, question, level.id, { description: event.target.value })} />
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                        {(question.type === "score" || question.type === "level") && (
                          <label className="peer-required-toggle">
                            <input type="checkbox" checked={question.required} onChange={(event) => updateSelfQuestion(step.id, question.id, { required: event.target.checked })} />
                            <span>필수 응답</span>
                          </label>
                        )}
                      </section>
                    ))}
                    <button type="button" className="secondary-button peer-add-question" onClick={() => addSelfQuestion(step.id)}>
                      자기평가 질문 추가
                    </button>
                  </div>
                )}
                {step.kind === "self" && (
                  <section className="ai-generator-panel compact">
                    <div className="ai-generator-head">
                      <div>
                        <span>AI 자동생성</span>
                        <strong>루브릭으로 자기평가 문항 만들기</strong>
                      </div>
                      <b>Claude Opus</b>
                    </div>
                    <label className="field full">
                      <span>루브릭</span>
                      <textarea
                        rows={6}
                        value={selfAiRubrics[step.id] ?? ""}
                        onChange={(event) => setSelfAiRubrics((current) => ({
                          ...current,
                          [step.id]: event.target.value,
                        }))}
                        placeholder="평가 기준과 배점을 붙여 넣어 주세요."
                      />
                    </label>
                    {selfAiError?.stepId === step.id && (
                      <div className="error-message">{selfAiError.message}</div>
                    )}
                    <div className="ai-generator-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => generateSelfQuestions(step.id, step.title)}
                        disabled={Boolean(selfAiLoadingStepId)}
                      >
                        {selfAiLoadingStepId === step.id
                          ? "생성 중..."
                          : selfAiPreview?.stepId === step.id
                            ? "다시 생성"
                            : "AI 자동생성"}
                      </button>
                      {selfAiPreview?.stepId === step.id && (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => applySelfGeneratedQuestions(step.id)}
                        >
                          문항 적용
                        </button>
                      )}
                    </div>
                    {selfAiPreview?.stepId === step.id && (
                      <div className="ai-preview">
                        <div className="ai-preview-head">
                          <span>{selfAiPreview.result.model}</span>
                          <strong>{selfAiPreview.result.title}</strong>
                        </div>
                        <p>{selfAiPreview.result.description}</p>
                        <div className="ai-preview-list">
                          {selfAiPreview.result.questions.map((question, questionIndex) => (
                            <article key={question.id}>
                              <span>{String(questionIndex + 1).padStart(2, "0")} · {question.type === "level" ? "상중하" : question.type === "score" ? `${question.maxScore}점` : "서술형"}</span>
                              <p>{question.prompt}</p>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </article>
            ))}
          </div>

          {error && <div className="error-message">{error}</div>}
          <div className="teacher-storage-actions">
            <button type="button" className="secondary-button" onClick={async () => {
              setError("");
              try {
                await persistSettings();
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "묶음 평가를 저장하지 못했습니다.");
              }
            }}>
              {evaluationId ? "묶음 평가 수정 저장" : "묶음 평가 저장"}
            </button>
          </div>
          <div className="settings-actions">
            <button className="primary-button save-button" disabled={loading}>
              {loading ? "링크 만드는 중..." : "저장하고 학생 링크 만들기"}
            </button>
          </div>

          {classUrl && (
            <div className="class-link-result">
              <span>묶음 평가 링크가 준비됐습니다</span>
              <strong>이 주소 하나를 학생들에게 전달하면 됩니다.</strong>
              <div><input readOnly value={classUrl} /><button type="button" onClick={copyLink}>{copied ? "복사됨" : "링크 복사"}</button></div>
              <a href={classUrl} target="_blank" rel="noreferrer">학생 화면 미리 보기</a>
            </div>
          )}
        </form>

        <section className="settings-form session-results-panel">
          <div className="settings-title">
            <span>03</span>
            <div><h2>통합 결과</h2><p>학생별 세션 응답을 단계별로 모아 봅니다.</p></div>
          </div>
          <div className="peer-results-actions">
            <strong>{responses.length}개 응답</strong>
            <div>
              <button type="button" className="secondary-button" onClick={refreshResponses} disabled={!evaluationId}>응답 새로고침</button>
              <button type="button" className="secondary-button" onClick={openSessionReport} disabled={groupedResponses.length === 0}>통합 보고서 인쇄</button>
            </div>
          </div>
          {peerReports.length > 0 && (
            <div className="session-peer-summary">
              <div className="section-heading compact">
                <span>PEER</span>
                <div><h2>받은 동료평가 요약</h2><p>대상별 점수 평균과 친구들이 남긴 서술형 답변입니다.</p></div>
              </div>
              <div className="session-peer-report-grid">
                {peerReports.map((target) => (
                  <article key={target.key} className="session-peer-report-card">
                    <div className="session-peer-report-head">
                      <div>
                        <span>{target.mode === "team" ? "모둠 동료평가" : "개인 동료평가"} · {target.stepTitle}</span>
                        <h3>{target.label}</h3>
                      </div>
                      <b>{target.scoreAverage.toFixed(1)} / {target.scoreMax || 0}</b>
                    </div>
                    <div className="session-peer-score-lines">
                      {target.scores.length === 0 ? (
                        <p>점수형 문항이 없습니다.</p>
                      ) : target.scores.map((score) => (
                        <p key={score.question.id}>
                          <strong>{score.average.toFixed(1)} / {score.question.maxScore}</strong>
                          <span>{score.question.prompt}</span>
                        </p>
                      ))}
                    </div>
                    <div className="session-peer-comments">
                      {target.comments.length === 0 ? (
                        <p>서술형 문항이 없습니다.</p>
                      ) : target.comments.map((group) => (
                        <section key={group.question.id}>
                          <h4>{group.question.prompt}</h4>
                          {group.comments.length === 0 ? (
                            <p>아직 작성된 답변이 없습니다.</p>
                          ) : group.comments.map((comment, index) => (
                            <blockquote key={`${group.question.id}-${index}`}>
                              {comment.text}
                              <small>{comment.respondent}</small>
                            </blockquote>
                          ))}
                        </section>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
          {groupedResponses.length === 0 ? (
            <div className="empty-library">아직 제출된 세션 응답이 없습니다.</div>
          ) : (
            <div className="evaluation-grid">
              {groupedResponses.map(([student, items]) => (
                <article key={student} className="evaluation-card">
                  <div className="evaluation-meta">
                    <span className="format-chip session">SESSION</span>
                    <span>{items.length} / {settings.steps.length} 단계</span>
                  </div>
                  <h3>{student}</h3>
                  {items.map((item) => (
                    <p key={item.id}>
                      <strong>{item.stepTitle}</strong>
                      {" · "}
                      {item.payload.type === "ai"
                        ? `${item.payload.evaluation.totalScore}/${item.payload.evaluation.maxScore}`
                        : item.payload.type === "peer"
                          ? `${peerTargetLabel(item)} 평가 · ${peerScoreText(peerSteps.get(item.stepId), item)}`
                          : item.payload.type === "self"
                            ? "자기평가 제출"
                            : "성찰 제출"}
                    </p>
                  ))}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
      <footer>LEAFBACK · SESSION</footer>
    </main>
  );
}
