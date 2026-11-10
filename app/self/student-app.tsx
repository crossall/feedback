"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import type {
  SelfAnswer,
  SelfEvaluationConfig,
  SelfEvaluationResponse,
  SelfQuestion,
} from "@/lib/self-evaluation";
import { normalizeQuestionAnswer } from "@/lib/rubric-levels";

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

export default function SelfStudentApp({
  classToken,
  config,
}: {
  classToken: string;
  config?: SelfEvaluationConfig;
}) {
  const [grade, setGrade] = useState("");
  const [className, setClassName] = useState("");
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SelfEvaluationResponse | null>(null);

  function updateAnswer(questionId: string, value: string) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
    setError("");
    setSaved(null);
  }

  function answersForSubmit(): SelfAnswer[] {
    return (config?.questions ?? []).map((question) => {
      const value = answers[question.id] ?? "";
      return normalizeQuestionAnswer(question, {
        questionId: question.id,
        value,
        levelId: question.type === "level" ? value : undefined,
      });
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaved(null);
    if (!classToken || !config) {
      setError("선생님이 보내 준 자기평가 링크로 접속해 주세요.");
      return;
    }
    if (!grade.trim() || !className.trim() || !name.trim()) {
      setError("학년, 반, 이름을 모두 입력해 주세요.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/self/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classToken,
          respondent: { grade, className, name, team },
          answers: answersForSubmit(),
        }),
      });
      const data = await response.json() as {
        response?: SelfEvaluationResponse;
        error?: string;
      };
      if (!response.ok || !data.response) throw new Error(data.error || "자기평가를 제출하지 못했습니다.");
      setSaved(data.response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "자기평가를 제출하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/">
          <span className="brand-mark"><Icon name="leaf" size={24} /></span>
          <span>LEAFBACK</span>
          <small>SELF REVIEW</small>
        </Link>
        <nav className="header-links">
          <Link className="teacher-link" href="/">PDF 평가</Link>
          <Link className="teacher-link" href="/peer">동료평가</Link>
        </nav>
      </header>

      <section className="student-page">
        <div className="hero peer-hero">
          <div className="eyebrow"><span /> SELF REVIEW</div>
          <h1>{config?.title ?? "자기평가"}<br /><em>나의 활동을 돌아봅니다.</em></h1>
          <p>{config?.description ?? "선생님이 보내 준 자기평가 링크로 다시 접속해 주세요."}</p>
          {config && (
            <div className="class-summary">
              <span>이번 자기평가</span>
              <strong>{config.title}</strong>
              <p>{config.questions.length}개 질문에 답합니다.</p>
            </div>
          )}
        </div>

        {!config && (
          <div className="missing-class">
            <span><Icon name="lock" /></span>
            <div><strong>자기평가 링크가 필요합니다</strong><p>선생님이 보내 준 전용 링크로 접속해 주세요.</p></div>
          </div>
        )}

        <div className="work-area peer-work-area">
          <form className="submission-card peer-form" onSubmit={submit}>
            <div className="card-heading">
              <span>01</span>
              <div><h2>{config?.title ?? "자기평가 제출하기"}</h2><p>내가 한 활동을 솔직하고 구체적으로 적어 주세요.</p></div>
            </div>
            <div className="field-row">
              <label className="field"><span>학년 <b>*</b></span><input value={grade} onChange={(event) => setGrade(event.target.value)} placeholder="예: 5학년" /></label>
              <label className="field"><span>반 <b>*</b></span><input value={className} onChange={(event) => setClassName(event.target.value)} placeholder="예: 2반" /></label>
              <label className="field"><span>이름 <b>*</b></span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="이름" /></label>
              <label className="field"><span>모둠</span><input value={team} onChange={(event) => setTeam(event.target.value)} placeholder="선택" /></label>
            </div>

            <div className="peer-question-list">
              {config?.questions.map((question, index) => (
                <SelfQuestionInput
                  key={question.id}
                  question={question}
                  index={index}
                  value={answers[question.id] ?? ""}
                  onChange={(value) => updateAnswer(question.id, value)}
                />
              ))}
            </div>

            {error && <div className="error-message">{error}</div>}
            {saved && (
              <div className="storage-message peer-submit-success">
                <Icon name="check" size={16} /> 자기평가가 저장되었습니다.
              </div>
            )}
            <button className="primary-button" disabled={loading || !config}>
              {loading ? "제출 중..." : <><Icon name="spark" /> 자기평가 제출하기</>}
            </button>
          </form>

          <aside className="guide-card">
            <span className="guide-number">SELF CHECK</span>
            <h3>나의 활동을<br />차분히 보기</h3>
            <ul>
              <li><span>1</span><div><strong>구체적으로</strong><p>무엇을 했는지 장면이 보이게 적습니다.</p></div></li>
              <li><span>2</span><div><strong>솔직하게</strong><p>잘한 점과 아쉬운 점을 함께 봅니다.</p></div></li>
              <li><span>3</span><div><strong>다음 행동으로</strong><p>다음에 바꿀 작은 행동을 적습니다.</p></div></li>
            </ul>
          </aside>
        </div>
      </section>
      <footer>LEAFBACK · SELF REVIEW</footer>
    </main>
  );
}

function SelfQuestionInput({
  question,
  index,
  value,
  onChange,
}: {
  question: SelfQuestion;
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
          rows={4}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="구체적으로 적어 주세요"
        />
      )}
    </label>
  );
}
