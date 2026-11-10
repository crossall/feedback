"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type {
  EvaluationSessionConfig,
  EvaluationSessionResponse,
  EvaluationSessionStep,
  SessionResponsePayload,
  SessionAiStep,
  SessionPeerStep,
  SessionReflectionStep,
  SessionRespondent,
  SessionSelfStep,
} from "@/lib/evaluation-session";
import { sessionStepLabel } from "@/lib/evaluation-session";
import {
  normalizeQuestionAnswer,
  type EvaluationQuestionType,
  type RubricLevel,
} from "@/lib/rubric-levels";

type Identity = SessionRespondent;

type PeerTargetDraft = {
  id: string;
  targetName: string;
  targetTeam: string;
  answers: Record<string, string>;
};

type StudentPeerResult = {
  published: boolean;
  message?: string;
  anonymized?: boolean;
  minPeerResponses?: number;
  reports?: {
    stepId: string;
    stepTitle: string;
    label: string;
    responseCount: number;
    scoreAverage: number;
    scoreMax: number;
    scores: {
      questionId: string;
      prompt: string;
      average: number;
      maxScore: number;
      count: number;
    }[];
    comments: {
      questionId: string;
      prompt: string;
      withheld: boolean;
      comments: {
        text: string;
        respondent?: string;
      }[];
    }[];
  }[];
};

function Icon({ name }: { name: "check" | "lock" | "spark" }) {
  const paths = {
    check: <path d="m5 12 4 4L19 6" />,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    spark: <><path d="m12 3 1.2 4.2L17 9l-3.8 1.8L12 15l-1.2-4.2L7 9l3.8-1.8Z" /><path d="m5 15 .7 2.3L8 18l-2.3.7L5 21l-.7-2.3L2 18l2.3-.7Z" /></>,
  };
  return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

function emptyIdentity(): Identity {
  return {
    grade: "",
    className: "",
    name: "",
    team: "",
  };
}

function isIdentityReady(identity: Identity) {
  return Boolean(identity.grade.trim() && identity.className.trim() && identity.name.trim());
}

function createPeerTargetDraft(): PeerTargetDraft {
  return {
    id: crypto.randomUUID(),
    targetName: "",
    targetTeam: "",
    answers: {},
  };
}

function compactPeerTarget(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

export default function SessionStudentApp({
  sessionToken,
  config,
}: {
  sessionToken: string;
  config?: EvaluationSessionConfig;
}) {
  const [identity, setIdentity] = useState<Identity>(() => emptyIdentity());
  const [responses, setResponses] = useState<EvaluationSessionResponse[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState("");

  const completed = useMemo(() => {
    const done = new Set(responses.map((response) => response.stepId));
    return config?.steps.map((step) => done.has(step.id)) ?? [];
  }, [config?.steps, responses]);

  const activeStep = config?.steps[activeIndex];
  const completedCount = completed.filter(Boolean).length;
  const unlocked = (index: number) => {
    if (index === 0) return true;
    return completed.slice(0, index).every(Boolean);
  };

  function saveResponses(nextResponses: EvaluationSessionResponse[]) {
    if (nextResponses.length === 0) return;
    setResponses((current) => [
      ...nextResponses,
      ...current.filter((item) => !nextResponses.some((response) => response.id === item.id)),
    ]);
    setError("");
    const next = activeIndex + 1;
    if (config && next < config.steps.length) setActiveIndex(next);
  }

  function saveResponse(response: EvaluationSessionResponse) {
    saveResponses([response]);
  }

  function updateIdentity(patch: Partial<Identity>) {
    setIdentity((current) => ({ ...current, ...patch }));
    setError("");
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
          <Link className="teacher-link" href="/">PDF 평가</Link>
          <Link className="teacher-link" href="/peer">동료평가</Link>
        </nav>
      </header>

      <section className="student-page session-student-page">
        <div className="hero peer-hero">
          <div className="eyebrow"><span /> PROJECT SESSION</div>
          <h1>{config?.title ?? "묶음 평가"}<br /><em>순서대로 진행합니다.</em></h1>
          <p>{config?.description ?? "선생님이 보내 준 세션 링크로 다시 접속해 주세요."}</p>
          {config && (
            <div className="class-summary">
              <span>진행률</span>
              <strong>{completedCount} / {config.steps.length} 단계 완료</strong>
              <p>각 단계가 끝나면 마지막에 내 통합 결과를 확인할 수 있습니다.</p>
            </div>
          )}
        </div>

        {!config && (
          <div className="missing-class">
            <span><Icon name="lock" /></span>
            <div><strong>세션 링크가 필요합니다</strong><p>선생님이 보내 준 묶음 평가 링크로 다시 접속해 주세요.</p></div>
          </div>
        )}

        {config && (
          <div className="work-area peer-work-area session-work-area">
            <aside className="guide-card">
              <span className="guide-number">SESSION STEPS</span>
              <h3>오늘의 평가<br />흐름</h3>
              <ul>
                {config.steps.map((step, index) => {
                  const done = completed[index];
                  const locked = !unlocked(index);
                  return (
                    <li
                      key={step.id}
                      className={`${done ? "done" : ""} ${locked ? "locked" : ""} ${activeIndex === index ? "active" : ""}`}
                    >
                      <span>{done ? <Icon name="check" /> : locked ? <Icon name="lock" /> : index + 1}</span>
                      <div>
                        <strong>{step.title}</strong>
                        <p>{sessionStepLabel(step.kind)}</p>
                        <button
                          type="button"
                          className="session-step-button"
                          disabled={locked}
                          onClick={() => setActiveIndex(index)}
                        >
                          열기
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <div className="submission-card peer-form session-main-card">
              <div className="session-identity-panel">
              <div className="card-heading">
                <span>00</span>
                <div><h2>학생 정보</h2><p>세션 전체에서 같은 정보로 저장됩니다.</p></div>
              </div>
              <div className="field-row session-identity-fields">
                <label className="field"><span>학년 <b>*</b></span><input value={identity.grade} onChange={(event) => updateIdentity({ grade: event.target.value })} placeholder="예: 5학년" /></label>
                <label className="field"><span>반 <b>*</b></span><input value={identity.className} onChange={(event) => updateIdentity({ className: event.target.value })} placeholder="예: 2반" /></label>
                <label className="field"><span>이름 <b>*</b></span><input value={identity.name} onChange={(event) => updateIdentity({ name: event.target.value })} placeholder="이름" /></label>
                <label className="field"><span>모둠</span><input value={identity.team ?? ""} onChange={(event) => updateIdentity({ team: event.target.value })} placeholder="선택" /></label>
              </div>
              </div>

              {error && <div className="error-message">{error}</div>}
              <div className="session-active-panel">
                {activeStep && (
                  <StepPanel
                    key={activeStep.id}
                    step={activeStep}
                    identity={identity}
                    identityReady={isIdentityReady(identity)}
                    sessionToken={sessionToken}
                    onError={setError}
                    onSaved={saveResponse}
                    onSavedMany={saveResponses}
                  />
                )}
              </div>
              {completedCount === config.steps.length && (
                <SessionReport
                  responses={responses}
                  identity={identity}
                  sessionToken={sessionToken}
                />
              )}
            </div>
          </div>
        )}
      </section>
      <footer>LEAFBACK · SESSION</footer>
    </main>
  );
}

function StepPanel({
  step,
  identity,
  identityReady,
  sessionToken,
  onError,
  onSaved,
  onSavedMany,
}: {
  step: EvaluationSessionStep;
  identity: Identity;
  identityReady: boolean;
  sessionToken: string;
  onError: (message: string) => void;
  onSaved: (response: EvaluationSessionResponse) => void;
  onSavedMany: (responses: EvaluationSessionResponse[]) => void;
}) {
  if (step.kind === "pdf" || step.kind === "docs") {
    return (
      <AiStepForm
        step={step}
        identity={identity}
        identityReady={identityReady}
        sessionToken={sessionToken}
        onError={onError}
        onSaved={onSaved}
      />
    );
  }
  if (step.kind === "peer") {
    return <PeerStepForm step={step} identity={identity} identityReady={identityReady} sessionToken={sessionToken} onError={onError} onSavedMany={onSavedMany} />;
  }
  if (step.kind === "reflection") {
    return <ReflectionStepForm step={step} identity={identity} identityReady={identityReady} sessionToken={sessionToken} onError={onError} onSaved={onSaved} />;
  }
  if (step.kind === "self") {
    return <SelfStepForm step={step} identity={identity} identityReady={identityReady} sessionToken={sessionToken} onError={onError} onSaved={onSaved} />;
  }
  return null;
}

function AiStepForm({
  step,
  identity,
  identityReady,
  sessionToken,
  onError,
  onSaved,
}: {
  step: SessionAiStep;
  identity: Identity;
  identityReady: boolean;
  sessionToken: string;
  onError: (message: string) => void;
  onSaved: (response: EvaluationSessionResponse) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [documentUrl, setDocumentUrl] = useState("");
  const [loading, setLoading] = useState(false);

  function chooseFile(candidate?: File) {
    onError("");
    if (!candidate) return;
    if (candidate.type !== "application/pdf") {
      onError("PDF 파일만 올릴 수 있습니다.");
      return;
    }
    setFile(candidate);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!identityReady) {
      onError("학년, 반, 이름을 먼저 입력해 주세요.");
      return;
    }
    if (step.kind === "pdf" && !file) {
      onError("PDF 파일을 올려 주세요.");
      return;
    }
    if (step.kind === "docs" && !documentUrl.trim()) {
      onError("Google Docs 주소를 입력해 주세요.");
      return;
    }

    setLoading(true);
    onError("");
    try {
      const formData = new FormData();
      formData.append("sessionToken", sessionToken);
      formData.append("stepId", step.id);
      formData.append("studentGrade", identity.grade);
      formData.append("studentClass", identity.className);
      formData.append("studentName", identity.name);
      formData.append("studentTeam", identity.team ?? "");
      if (file) formData.append("file", file);
      if (documentUrl) formData.append("documentUrl", documentUrl);

      const response = await fetch("/api/session/evaluate", { method: "POST", body: formData });
      const data = await response.json() as { response?: EvaluationSessionResponse; error?: string };
      if (!response.ok || !data.response) throw new Error(data.error || "평가를 저장하지 못했습니다.");
      onSaved(data.response);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "평가를 저장하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="card-heading">
        <span>{sessionStepLabel(step.kind)}</span>
        <div><h2>{step.title}</h2><p>{step.config.assignment}</p></div>
      </div>
      {step.kind === "pdf" ? (
        <label className={`drop-zone ${file ? "has-file" : ""}`}>
          <input type="file" accept="application/pdf" onChange={(event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0])} />
          <span className="upload-icon"><Icon name={file ? "check" : "spark"} /></span>
          {file ? <><strong>{file.name}</strong><p>다른 파일을 선택하려면 다시 클릭하세요.</p></> : <><strong>PDF 파일을 올려 주세요</strong><p>최대 15MB</p></>}
        </label>
      ) : (
        <label className="field full">
          <span>Google Docs 주소 <b>*</b></span>
          <input value={documentUrl} onChange={(event) => setDocumentUrl(event.target.value)} placeholder="https://docs.google.com/..." />
        </label>
      )}
      <button className="primary-button" disabled={loading}>
        {loading ? "평가 중..." : "평가 제출하기"}
      </button>
    </form>
  );
}

function PeerStepForm({
  step,
  identity,
  identityReady,
  sessionToken,
  onError,
  onSavedMany,
}: {
  step: SessionPeerStep;
  identity: Identity;
  identityReady: boolean;
  sessionToken: string;
  onError: (message: string) => void;
  onSavedMany: (responses: EvaluationSessionResponse[]) => void;
}) {
  const [targets, setTargets] = useState<PeerTargetDraft[]>(() => [createPeerTargetDraft()]);
  const [loading, setLoading] = useState(false);
  const teams = Array.from({ length: step.config.teamCount }, (_, index) => index + 1);

  function updateTarget(id: string, patch: Partial<PeerTargetDraft>) {
    setTargets((current) => current.map((target) => (
      target.id === id ? { ...target, ...patch } : target
    )));
    onError("");
  }

  function addTarget() {
    setTargets((current) => [...current, createPeerTargetDraft()]);
    onError("");
  }

  function removeTarget(id: string) {
    setTargets((current) => current.length > 1
      ? current.filter((target) => target.id !== id)
      : current);
    onError("");
  }

  function validateTargets() {
    const seen = new Set<string>();
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      const label = `${index + 1}번째 평가 대상`;
      const key = step.config.mode === "team"
        ? target.targetTeam
        : compactPeerTarget(target.targetName);

      if (step.config.mode === "team") {
        if (!target.targetTeam) return `${label}의 모둠을 선택해 주세요.`;
        if (identity.team && target.targetTeam === identity.team.trim()) {
          return "자기 모둠은 평가 대상에서 제외해 주세요.";
        }
      } else if (!target.targetName.trim()) {
        return `${label}의 친구 이름을 입력해 주세요.`;
      }

      if (seen.has(key)) return "같은 대상을 중복해서 평가할 수 없습니다.";
      seen.add(key);
    }
    return "";
  }

  function peerPayload(target: PeerTargetDraft): SessionResponsePayload {
    return {
      type: "peer",
      mode: step.config.mode,
      target: {
        name: target.targetName,
        teamNumber: target.targetTeam ? Number(target.targetTeam) : undefined,
      },
      answers: step.config.questions.map((question) => {
        const value = target.answers[question.id] ?? "";
        return normalizeQuestionAnswer(question, {
          questionId: question.id,
          value,
          levelId: question.type === "level" ? value : undefined,
        });
      }),
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!identityReady) {
      onError("학년, 반, 이름을 먼저 입력해 주세요.");
      return;
    }
    const targetError = validateTargets();
    if (targetError) {
      onError(targetError);
      return;
    }

    setLoading(true);
    onError("");
    try {
      const response = await fetch("/api/session/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          stepId: step.id,
          respondent: identity,
          submissions: targets.map((target) => ({ payload: peerPayload(target) })),
        }),
      });
      const data = await response.json() as { responses?: EvaluationSessionResponse[]; error?: string };
      if (!response.ok || !data.responses) throw new Error(data.error || "동료평가를 저장하지 못했습니다.");
      setTargets([createPeerTargetDraft()]);
      onSavedMany(data.responses);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "동료평가를 저장하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="card-heading">
        <span>PEER</span>
        <div><h2>{step.title}</h2><p>{step.config.description}</p></div>
      </div>
      <div className="peer-target-list">
        {targets.map((target, targetIndex) => (
          <section key={target.id} className="peer-target-card">
            <div className="peer-target-head">
              <div>
                <span>{String(targetIndex + 1).padStart(2, "0")}</span>
                <h3>{step.config.mode === "team" ? "평가할 모둠" : "평가할 친구"}</h3>
              </div>
              <button type="button" onClick={() => removeTarget(target.id)} disabled={targets.length <= 1}>삭제</button>
            </div>

            {step.config.mode === "team" ? (
              <label className="field full">
                <span>평가할 모둠 <b>*</b></span>
                <select value={target.targetTeam} onChange={(event) => updateTarget(target.id, { targetTeam: event.target.value })}>
                  <option value="">선택</option>
                  {teams.map((team) => <option key={team} value={team}>{team}모둠</option>)}
                </select>
              </label>
            ) : (
              <label className="field full">
                <span>평가할 친구 <b>*</b></span>
                <input value={target.targetName} onChange={(event) => updateTarget(target.id, { targetName: event.target.value })} />
              </label>
            )}

            <QuestionInputs
              questions={step.config.questions}
              answers={target.answers}
              setAnswers={(updater) => updateTarget(target.id, { answers: updater(target.answers) })}
            />
          </section>
        ))}
      </div>
      <button type="button" className="secondary-button peer-add-target" onClick={addTarget}>
        평가 대상 추가
      </button>
      <button className="primary-button" disabled={loading}>{loading ? "저장 중..." : `${targets.length}개 동료평가 제출하기`}</button>
    </form>
  );
}

function SelfStepForm({
  step,
  identity,
  identityReady,
  sessionToken,
  onError,
  onSaved,
}: {
  step: SessionSelfStep;
  identity: Identity;
  identityReady: boolean;
  sessionToken: string;
  onError: (message: string) => void;
  onSaved: (response: EvaluationSessionResponse) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!identityReady) {
      onError("학년, 반, 이름을 먼저 입력해 주세요.");
      return;
    }
    setLoading(true);
    onError("");
    try {
      const response = await fetch("/api/session/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          stepId: step.id,
          respondent: identity,
          payload: {
            type: "self",
            answers: step.questions.map((question) => {
              const value = answers[question.id] ?? "";
              return normalizeQuestionAnswer(question, {
                questionId: question.id,
                value,
                levelId: question.type === "level" ? value : undefined,
              });
            }),
          },
        }),
      });
      const data = await response.json() as { response?: EvaluationSessionResponse; error?: string };
      if (!response.ok || !data.response) throw new Error(data.error || "자기평가를 저장하지 못했습니다.");
      onSaved(data.response);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "자기평가를 저장하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="card-heading">
        <span>SELF</span>
        <div><h2>{step.title}</h2><p>내가 한 활동을 차분히 돌아봅니다.</p></div>
      </div>
      <QuestionInputs questions={step.questions} answers={answers} setAnswers={setAnswers} />
      <button className="primary-button" disabled={loading}>{loading ? "저장 중..." : "자기평가 제출하기"}</button>
    </form>
  );
}

function ReflectionStepForm({
  step,
  identity,
  identityReady,
  sessionToken,
  onError,
  onSaved,
}: {
  step: SessionReflectionStep;
  identity: Identity;
  identityReady: boolean;
  sessionToken: string;
  onError: (message: string) => void;
  onSaved: (response: EvaluationSessionResponse) => void;
}) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!identityReady) {
      onError("학년, 반, 이름을 먼저 입력해 주세요.");
      return;
    }
    setLoading(true);
    onError("");
    try {
      const response = await fetch("/api/session/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          stepId: step.id,
          respondent: identity,
          payload: {
            type: "reflection",
            answers: step.questions.map((question, index) => ({
              question,
              answer: answers[index] ?? "",
            })),
          },
        }),
      });
      const data = await response.json() as { response?: EvaluationSessionResponse; error?: string };
      if (!response.ok || !data.response) throw new Error(data.error || "성찰을 저장하지 못했습니다.");
      onSaved(data.response);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "성찰을 저장하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="card-heading">
        <span>REF</span>
        <div><h2>{step.title}</h2><p>평가 결과와 활동 과정을 함께 돌아봅니다.</p></div>
      </div>
      <div className="peer-question-list">
        {step.questions.map((question, index) => (
          <label key={question} className="peer-question-card">
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{question}</strong>
            <textarea rows={4} value={answers[index] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [index]: event.target.value }))} />
          </label>
        ))}
      </div>
      <button className="primary-button" disabled={loading}>{loading ? "저장 중..." : "성찰 제출하기"}</button>
    </form>
  );
}

function QuestionInputs({
  questions,
  answers,
  setAnswers,
}: {
  questions: {
    id: string;
    prompt: string;
    type: EvaluationQuestionType;
    maxScore: number;
    required: boolean;
    levels?: RubricLevel[];
  }[];
  answers: Record<string, string>;
  setAnswers: (updater: (current: Record<string, string>) => Record<string, string>) => void;
}) {
  return (
    <div className="peer-question-list">
      {questions.map((question, index) => (
        question.type === "level" ? (
          <article key={question.id} className="peer-question-card">
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{question.prompt} {question.required && <b>*</b>}</strong>
            <div className="level-option-list">
              {(question.levels ?? []).map((level) => (
                <button
                  type="button"
                  key={level.id}
                  className={`level-option ${answers[question.id] === level.id ? "selected" : ""}`}
                  onClick={() => setAnswers((current) => ({ ...current, [question.id]: level.id }))}
                >
                  <b>{level.label}</b>
                  <span>{level.description}</span>
                  <small>{level.score}점</small>
                </button>
              ))}
            </div>
          </article>
        ) : (
          <label key={question.id} className="peer-question-card">
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{question.prompt} {question.required && <b>*</b>}</strong>
            {question.type === "score" ? (
              <input
                type="number"
                min="0"
                max={question.maxScore}
                value={answers[question.id] ?? ""}
                onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                placeholder={`0-${question.maxScore}`}
              />
            ) : (
              <textarea
                rows={3}
                value={answers[question.id] ?? ""}
                onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
              />
            )}
          </label>
        )
      ))}
    </div>
  );
}

function SessionReport({
  responses,
  identity,
  sessionToken,
}: {
  responses: EvaluationSessionResponse[];
  identity: Identity;
  sessionToken: string;
}) {
  const [peerResult, setPeerResult] = useState<StudentPeerResult | null>(null);
  const [loadingPeerResult, setLoadingPeerResult] = useState(false);
  const [peerResultError, setPeerResultError] = useState("");
  const aiResponses = responses.filter((response) => response.payload.type === "ai");
  const total = aiResponses.reduce((sum, response) => (
    response.payload.type === "ai" ? sum + response.payload.evaluation.totalScore : sum
  ), 0);
  const max = aiResponses.reduce((sum, response) => (
    response.payload.type === "ai" ? sum + response.payload.evaluation.maxScore : sum
  ), 0);

  async function loadPeerResult() {
    if (!sessionToken) return;
    setLoadingPeerResult(true);
    setPeerResultError("");
    try {
      const response = await fetch("/api/session/student-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          respondent: identity,
        }),
      });
      const data = await response.json() as StudentPeerResult & { error?: string };
      if (!response.ok) throw new Error(data.error || "받은 동료평가 결과를 불러오지 못했습니다.");
      setPeerResult(data);
    } catch (caught) {
      setPeerResultError(caught instanceof Error ? caught.message : "받은 동료평가 결과를 불러오지 못했습니다.");
    } finally {
      setLoadingPeerResult(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void loadPeerResult());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken, identity.grade, identity.className, identity.name, identity.team]);

  return (
    <section className="result-panel">
      <div className="result-top">
        <div>
          <span className="result-label">SESSION COMPLETE</span>
          <h2>통합 결과</h2>
          <p>제출한 평가와 성찰이 선생님 보고서에 저장되었습니다.</p>
        </div>
        <div className="score-ring"><strong>{total}</strong><span>/ {max || "-"}</span></div>
      </div>
      <div className="criteria-grid">
        {responses.map((response) => (
          <article key={response.id}>
            <div className="criterion-head">
              <span>{sessionStepLabel(response.stepKind)}</span>
              <h3>{response.stepTitle}</h3>
              <b>{response.payload.type === "ai" ? `${response.payload.evaluation.totalScore}/${response.payload.evaluation.maxScore}` : "완료"}</b>
            </div>
            <p>{response.payload.type === "ai" ? response.payload.evaluation.summary : "응답이 저장되었습니다."}</p>
          </article>
        ))}
      </div>
      <div className="student-peer-results">
        <div className="section-heading compact">
          <span>PEER</span>
          <div><h2>내가 받은 동료평가</h2><p>친구들이 나 또는 우리 모둠에게 남긴 점수와 서술형 답변입니다.</p></div>
        </div>
        {loadingPeerResult && <div className="storage-message">받은 동료평가 결과를 불러오는 중입니다.</div>}
        {peerResultError && <div className="error-message">{peerResultError}</div>}
        {peerResult && !peerResult.published && (
          <div className="empty-library">
            <strong>아직 결과가 공개되지 않았습니다.</strong>
            <p>{peerResult.message ?? "선생님이 결과를 공개하면 이곳에서 확인할 수 있습니다."}</p>
          </div>
        )}
        {peerResult?.published && (peerResult.reports?.length ?? 0) === 0 && (
          <div className="empty-library">
            <strong>아직 받은 동료평가가 없습니다.</strong>
            <p>친구들이 나 또는 우리 모둠을 평가하면 이곳에 모입니다.</p>
          </div>
        )}
        {peerResult?.published && peerResult.reports && peerResult.reports.length > 0 && (
          <div className="session-peer-report-grid student-peer-report-grid">
            {peerResult.reports.map((target) => (
              <article key={target.stepId} className="session-peer-report-card">
                <div className="session-peer-report-head">
                  <div>
                    <span>{target.stepTitle} · {target.responseCount}개 응답</span>
                    <h3>{target.label}</h3>
                  </div>
                  <b>{target.scoreAverage.toFixed(1)} / {target.scoreMax || 0}</b>
                </div>
                <div className="session-peer-score-lines">
                  {target.scores.length === 0 ? (
                    <p>점수형 문항이 없습니다.</p>
                  ) : target.scores.map((score) => (
                    <p key={score.questionId}>
                      <strong>{score.average.toFixed(1)} / {score.maxScore}</strong>
                      <span>{score.prompt}</span>
                    </p>
                  ))}
                </div>
                <div className="session-peer-comments">
                  {target.comments.length === 0 ? (
                    <p>서술형 문항이 없습니다.</p>
                  ) : target.comments.map((group) => (
                    <section key={group.questionId}>
                      <h4>{group.prompt}</h4>
                      {group.withheld ? (
                        <p>{peerResult.minPeerResponses ?? 2}개 이상 응답이 모이면 서술형 답변을 볼 수 있습니다.</p>
                      ) : group.comments.length === 0 ? (
                        <p>아직 작성된 답변이 없습니다.</p>
                      ) : group.comments.map((comment, index) => (
                        <blockquote key={`${group.questionId}-${index}`}>
                          {comment.text}
                          {comment.respondent && <small>{comment.respondent}</small>}
                        </blockquote>
                      ))}
                    </section>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
        <button type="button" className="secondary-button" onClick={loadPeerResult} disabled={loadingPeerResult}>
          {loadingPeerResult ? "불러오는 중..." : "받은 동료평가 새로고침"}
        </button>
      </div>
    </section>
  );
}
