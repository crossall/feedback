"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import type {
  PeerAnswer,
  PeerEvaluationConfig,
  PeerEvaluationResponse,
  PeerQuestion,
} from "@/lib/peer-evaluation";
import { normalizeQuestionAnswer } from "@/lib/rubric-levels";

type TargetDraft = {
  id: string;
  targetName: string;
  targetTeam: string;
  answers: Record<string, string>;
};

function createTargetDraft(): TargetDraft {
  return {
    id: crypto.randomUUID(),
    targetName: "",
    targetTeam: "",
    answers: {},
  };
}

function Icon({
  name,
  size = 20,
}: {
  name: "leaf" | "check" | "lock" | "spark";
  size?: number;
}) {
  const paths = {
    leaf: <><path d="M4 21c4-8 9-12 16-17 0 8-3 15-12 16" /><path d="M5 16c3 0 7 1 10 3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    spark: <><path d="m12 3 1.2 4.2L17 9l-3.8 1.8L12 15l-1.2-4.2L7 9l3.8-1.8Z" /><path d="m5 15 .7 2.3L8 18l-2.3.7L5 21l-.7-2.3L2 18l2.3-.7Z" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

function compactKey(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

export default function PeerStudentApp({
  classToken,
  config,
}: {
  classToken: string;
  config?: PeerEvaluationConfig;
}) {
  const [grade, setGrade] = useState("");
  const [className, setClassName] = useState("");
  const [name, setName] = useState("");
  const [myTeam, setMyTeam] = useState("");
  const [targets, setTargets] = useState<TargetDraft[]>(() => [createTargetDraft()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedCount, setSavedCount] = useState(0);

  const teamOptions = useMemo(() => {
    const count = config?.teamCount ?? 0;
    return Array.from({ length: count }, (_, index) => index + 1);
  }, [config?.teamCount]);

  function clearResultState() {
    setError("");
    setSavedCount(0);
  }

  function updateTarget(id: string, patch: Partial<TargetDraft>) {
    setTargets((current) => current.map((target) => (
      target.id === id ? { ...target, ...patch } : target
    )));
    clearResultState();
  }

  function updateAnswer(targetId: string, questionId: string, value: string) {
    setTargets((current) => current.map((target) => (
      target.id === targetId
        ? { ...target, answers: { ...target.answers, [questionId]: value } }
        : target
    )));
    clearResultState();
  }

  function addTarget() {
    setTargets((current) => [...current, createTargetDraft()]);
    clearResultState();
  }

  function removeTarget(id: string) {
    setTargets((current) => current.length > 1
      ? current.filter((target) => target.id !== id)
      : current);
    clearResultState();
  }

  function validateTargets() {
    if (!config) return "선생님이 보내주신 동료평가 링크로 접속해 주세요.";
    const seen = new Set<string>();

    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      const label = `${index + 1}번째 평가 대상`;
      const key = config.mode === "team"
        ? target.targetTeam
        : compactKey(target.targetName);

      if (config.mode === "team") {
        if (!target.targetTeam) return `${label}의 평가할 모둠을 선택해 주세요.`;
        if (target.targetTeam === myTeam) return "자기 모둠은 평가 대상에서 제외해 주세요.";
      } else if (!target.targetName.trim()) {
        return `${label}의 친구 이름을 입력해 주세요.`;
      }

      if (seen.has(key)) return "같은 대상을 중복해서 평가할 수 없습니다.";
      seen.add(key);
    }
    return "";
  }

  function answersForTarget(target: TargetDraft): PeerAnswer[] {
    return (config?.questions ?? []).map((question) => {
      const rawValue = target.answers[question.id] ?? "";
      return normalizeQuestionAnswer(question, {
        questionId: question.id,
        value: rawValue,
        levelId: question.type === "level" ? rawValue : undefined,
      });
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSavedCount(0);
    if (!classToken || !config) {
      setError("선생님이 보내주신 동료평가 링크로 접속해 주세요.");
      return;
    }
    if (!grade.trim() || !className.trim() || !name.trim()) {
      setError("학년, 반, 내 이름을 모두 입력해 주세요.");
      return;
    }
    if (config.mode === "team" && !myTeam) {
      setError("내 모둠을 선택해 주세요.");
      return;
    }
    const targetError = validateTargets();
    if (targetError) {
      setError(targetError);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/peer/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classToken,
          respondent: {
            grade,
            className,
            name,
            teamNumber: myTeam ? Number(myTeam) : undefined,
          },
          submissions: targets.map((target) => ({
            target: {
              name: target.targetName,
              teamNumber: target.targetTeam ? Number(target.targetTeam) : undefined,
            },
            answers: answersForTarget(target),
          })),
        }),
      });
      const data = await response.json() as {
        responses?: PeerEvaluationResponse[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "응답을 제출하지 못했습니다.");
      setSavedCount(data.responses?.length ?? targets.length);
      setTargets([createTargetDraft()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "응답을 제출하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/peer">
          <span className="brand-mark"><Icon name="leaf" size={24} /></span>
          <span>잎새 피드백</span>
          <small>LEAFBACK</small>
        </Link>
        <nav className="header-links">
          <Link className="teacher-link" href="/">PDF 평가</Link>
          <Link className="teacher-link" href="/docs">Docs 평가</Link>
        </nav>
      </header>

      <section className="student-page">
        <div className="hero peer-hero">
          <div className="eyebrow"><span /> PEER REVIEW</div>
          <h1>친구의 배움을<br /><em>함께 돌아봐요.</em></h1>
          <p>선생님이 만든 질문에 따라 여러 친구나 여러 모둠을 한 번에 평가할 수 있어요. 같은 대상은 중복해서 제출할 수 없습니다.</p>
          {config && (
            <div className="class-summary">
              <span>이번 동료평가</span>
              <strong>{config.title}</strong>
              <p>{config.description}</p>
            </div>
          )}
        </div>

        {!config && (
          <div className="missing-class">
            <span><Icon name="lock" /></span>
            <div><strong>동료평가 링크가 필요해요</strong><p>선생님이 보내주신 전용 링크로 다시 접속해 주세요.</p></div>
          </div>
        )}

        <div className="work-area peer-work-area">
          <form className="submission-card peer-form" onSubmit={submit}>
            <div className="card-heading">
              <span>01</span>
              <div><h2>{config?.title ?? "동료평가 제출하기"}</h2><p>{config?.mode === "team" ? "내 이름과 내 모둠을 남기고, 평가할 모둠을 추가해 주세요." : "평가할 친구를 추가해서 여러 명을 한 번에 평가할 수 있어요."}</p></div>
            </div>

            <div className="field-row">
              <label className="field"><span>학년 <b>*</b></span><input value={grade} onChange={(e) => { setGrade(e.target.value); clearResultState(); }} placeholder="예: 5학년" /></label>
              <label className="field"><span>반 <b>*</b></span><input value={className} onChange={(e) => { setClassName(e.target.value); clearResultState(); }} placeholder="예: 2반" /></label>
              <label className="field"><span>내 이름 <b>*</b></span><input value={name} onChange={(e) => { setName(e.target.value); clearResultState(); }} placeholder="이름을 입력하세요" /></label>
              {config?.mode === "team" && (
                <label className="field">
                  <span>내 모둠 <b>*</b></span>
                  <select value={myTeam} onChange={(e) => { setMyTeam(e.target.value); clearResultState(); }}>
                    <option value="">선택</option>
                    {teamOptions.map((team) => <option key={team} value={team}>{team}모둠</option>)}
                  </select>
                </label>
              )}
            </div>

            <div className="peer-target-list">
              {targets.map((target, targetIndex) => (
                <section key={target.id} className="peer-target-card">
                  <div className="peer-target-head">
                    <div>
                      <span>{String(targetIndex + 1).padStart(2, "0")}</span>
                      <h3>{config?.mode === "team" ? "평가할 모둠" : "평가할 친구"}</h3>
                    </div>
                    <button type="button" onClick={() => removeTarget(target.id)} disabled={targets.length <= 1}>삭제</button>
                  </div>

                  {config?.mode === "team" ? (
                    <label className="field full">
                      <span>평가할 모둠 <b>*</b></span>
                      <select value={target.targetTeam} onChange={(e) => updateTarget(target.id, { targetTeam: e.target.value })}>
                        <option value="">선택</option>
                        {teamOptions.map((team) => <option key={team} value={team}>{team}모둠</option>)}
                      </select>
                    </label>
                  ) : (
                    <label className="field full">
                      <span>평가할 친구 <b>*</b></span>
                      <input value={target.targetName} onChange={(e) => updateTarget(target.id, { targetName: e.target.value })} placeholder="친구 이름" />
                    </label>
                  )}

                  <div className="peer-question-list">
                    {config?.questions.map((question, index) => (
                      <PeerQuestionInput
                        key={question.id}
                        question={question}
                        index={index}
                        value={target.answers[question.id] ?? ""}
                        onChange={(value) => updateAnswer(target.id, question.id, value)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <button type="button" className="secondary-button peer-add-target" onClick={addTarget}>
              평가 대상 추가
            </button>

            {error && <div className="error-message">{error}</div>}
            {savedCount > 0 && (
              <div className="storage-message peer-submit-success">
                <Icon name="check" size={16} /> {savedCount}개 평가를 제출했어요.
              </div>
            )}
            <button className="primary-button" disabled={loading || !config}>
              {loading ? <><span className="spinner" /> 제출 중...</> : <><Icon name="spark" /> 동료평가 제출하기 <span className="arrow">→</span></>}
            </button>
            <p className="privacy"><Icon name="lock" size={14} /> 응답은 선생님의 동료평가 확인에만 사용됩니다.</p>
          </form>

          <aside className="guide-card">
            <span className="guide-number">PEER CHECK</span>
            <h3>좋은 평가는<br />구체적이에요.</h3>
            <ul>
              <li><span>1</span><div><strong>대상 추가</strong><p>평가해야 할 친구나 모둠을 차례로 추가해요.</p></div></li>
              <li><span>2</span><div><strong>중복 확인</strong><p>같은 대상은 한 번만 평가할 수 있어요.</p></div></li>
              <li><span>3</span><div><strong>공정한 점수</strong><p>친함보다 활동 과정을 기준으로 평가해요.</p></div></li>
              <li><span>4</span><div><strong>모둠 정보</strong><p>모둠 평가에서는 내 이름과 내 모둠을 정확히 입력해요.</p></div></li>
            </ul>
            <div className="tiny-note">친구를 낮추는 말보다<br /><b>다음 활동에 도움이 되는 말</b>을 남겨요.</div>
          </aside>
        </div>
      </section>
      <footer>LEAFBACK · 동료평가</footer>
    </main>
  );
}

function PeerQuestionInput({
  question,
  index,
  value,
  onChange,
}: {
  question: PeerQuestion;
  index: number;
  value: string;
  onChange: (value: string) => void;
}) {
  if (question.type === "level") {
    return (
      <article className="peer-question-card">
        <span>{String(index + 1).padStart(2, "0")}</span>
        <strong>{question.prompt} {question.required && <b>*</b>}</strong>
        <div className="level-option-list">
          {(question.levels ?? []).map((level) => (
            <button
              type="button"
              key={level.id}
              className={`level-option ${value === level.id ? "selected" : ""}`}
              onClick={() => onChange(level.id)}
            >
              <b>{level.label}</b>
              <span>{level.description}</span>
              <small>{level.score}점</small>
            </button>
          ))}
        </div>
      </article>
    );
  }

  return (
    <label className="peer-question-card">
      <span>{String(index + 1).padStart(2, "0")}</span>
      <strong>{question.prompt} {question.required && <b>*</b>}</strong>
      {question.type === "score" ? (
        <input
          type="number"
          min="0"
          max={question.maxScore}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`0-${question.maxScore}`}
        />
      ) : (
        <textarea
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="짧게 적어 주세요"
        />
      )}
    </label>
  );
}
