"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type Evaluation = {
  title: string;
  totalScore: number;
  maxScore: number;
  summary: string;
  criteria: Array<{
    name: string;
    score: number;
    maxScore: number;
    feedback: string;
  }>;
  strengths: string[];
  improvements: string[];
  nextStep: string;
};

function Icon({
  name,
  size = 20,
}: {
  name: "leaf" | "link" | "check" | "spark" | "lock";
  size?: number;
}) {
  const paths = {
    leaf: <><path d="M4 21c4-8 9-12 16-17 0 8-3 15-12 16" /><path d="M5 16c3 0 7 1 10 3" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    spark: <><path d="m12 3 1.2 4.2L17 9l-3.8 1.8L12 15l-1.2-4.2L7 9l3.8-1.8Z" /><path d="m5 15 .7 2.3L8 18l-2.3.7L5 21l-.7-2.3L2 18l2.3-.7Z" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

export default function GoogleDocsStudentApp({ classToken }: { classToken: string }) {
  const [studentGrade, setStudentGrade] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentTeam, setStudentTeam] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Evaluation | null>(null);

  async function evaluate(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!classToken) {
      setError("선생님이 보내주신 학급 링크로 접속해 주세요.");
      return;
    }
    if (!studentGrade.trim() || !studentClass.trim() || !studentName.trim() || !studentTeam.trim() || !documentUrl.trim()) {
      setError("학년, 반, 이름, 모둠과 Google Docs 주소를 모두 입력해 주세요.");
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/evaluate-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentUrl,
          classToken,
          studentGrade,
          studentClass,
          studentName,
          studentTeam,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "평가 중 문제가 생겼어요.");
      setResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "평가 중 문제가 생겼어요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/docs">
          <span className="brand-mark"><Icon name="leaf" size={24} /></span>
          <span>잎새 피드백</span>
          <small>LEAFBACK</small>
        </Link>
        <nav className="header-links">
          <Link className="teacher-link" href="/">PDF 평가</Link>
          <Link className="teacher-link" href="/docs/teacher">교사용 페이지</Link>
        </nav>
      </header>

      <section className="student-page">
        <div className="hero">
          <div className="eyebrow"><span /> GOOGLE DOCS REVIEW</div>
          <h1>쓴 글을 공유하고<br /><em>한 단계 더</em> 다듬어 봐요.</h1>
          <p>Google Docs 주소를 입력하면 선생님의 평가 기준에 따라<br className="desktop-only" /> 구체적인 AI 피드백을 받을 수 있어요.</p>
          <div className="botanical-sketch" aria-hidden>
            <span className="stem" /><span className="leaf leaf-one" /><span className="leaf leaf-two" /><span className="leaf leaf-three" /><span className="leaf leaf-four" />
          </div>
        </div>

        {!classToken && (
          <div className="missing-class">
            <span><Icon name="lock" /></span>
            <div><strong>학급 링크가 필요해요</strong><p>선생님이 보내주신 전용 링크로 다시 접속해 주세요.</p></div>
          </div>
        )}

        <div className="work-area">
          <form className="submission-card" onSubmit={evaluate}>
            <div className="card-heading">
              <span>01</span>
              <div><h2>글 제출하기</h2><p>평가받을 Google Docs 문서를 준비해 주세요.</p></div>
            </div>
            <div className="field-row">
              <label className="field"><span>학년 <b>*</b></span><input value={studentGrade} onChange={(e) => setStudentGrade(e.target.value)} placeholder="예: 5학년" /></label>
              <label className="field"><span>반 <b>*</b></span><input value={studentClass} onChange={(e) => setStudentClass(e.target.value)} placeholder="예: 2반" /></label>
              <label className="field"><span>이름 <b>*</b></span><input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="이름을 입력하세요" /></label>
              <label className="field"><span>모둠 <b>*</b></span><input value={studentTeam} onChange={(e) => setStudentTeam(e.target.value)} placeholder="예: 새싹 모둠" /></label>
            </div>
            <label className="document-link-field">
              <span className="upload-icon"><Icon name="link" size={26} /></span>
              <span className="document-link-copy"><strong>Google Docs 주소 <b>*</b></strong><small>문서의 공유 설정을 ‘링크가 있는 모든 사용자에게 공개’로 바꿔 주세요.</small></span>
              <input type="url" value={documentUrl} onChange={(e) => { setDocumentUrl(e.target.value); setError(""); setResult(null); }} placeholder="https://docs.google.com/document/d/..." />
            </label>
            {error && <div className="error-message">{error}</div>}
            <button className="primary-button" disabled={loading || !classToken}>
              {loading ? <><span className="spinner" /> Google Docs를 읽고 평가하는 중...</> : <><Icon name="spark" /> AI 피드백 받기 <span className="arrow">→</span></>}
            </button>
            <p className="privacy"><Icon name="lock" size={14} /> 문서 내용은 평가 요청에만 사용됩니다.</p>
          </form>

          <aside className="guide-card">
            <span className="guide-number">WRITING CHECK</span>
            <h3>평가 전,<br />한번 확인해 볼까요?</h3>
            <ul>
              <li><span>1</span><div><strong>공유 설정</strong><p>링크가 있는 사람이 문서를 볼 수 있도록 설정했나요?</p></div></li>
              <li><span>2</span><div><strong>주제와 내용</strong><p>과제의 주제와 요구 사항이 글에 잘 드러나나요?</p></div></li>
              <li><span>3</span><div><strong>근거와 구성</strong><p>생각을 뒷받침하는 이유와 글의 흐름이 자연스러운가요?</p></div></li>
              <li><span>4</span><div><strong>마지막 점검</strong><p>맞춤법과 출처를 확인하고 불필요한 문장을 다듬었나요?</p></div></li>
            </ul>
            <div className="tiny-note">처음부터 완벽한 글보다<br /><b>고쳐 쓴 흔적이 있는 글</b>이 더 멋져요.</div>
          </aside>
        </div>

        {result && <ResultPanel result={result} studentName={studentName} />}
      </section>
      <footer>LEAFBACK · GOOGLE DOCS 글쓰기 평가</footer>
    </main>
  );
}

function ResultPanel({ result, studentName }: { result: Evaluation; studentName: string }) {
  return (
    <section className="result-panel">
      <div className="result-top">
        <div><span className="result-label">AI REVIEW COMPLETE</span><h2>{studentName} 학생의 피드백</h2><p>{result.summary}</p></div>
        <div className="score-ring"><strong>{result.totalScore}</strong><span>/ {result.maxScore}</span></div>
      </div>
      <div className="criteria-grid">
        {result.criteria.map((item, index) => (
          <article key={`${item.name}-${index}`}>
            <div className="criterion-head"><span>0{index + 1}</span><h3>{item.name}</h3><b>{item.score} / {item.maxScore}</b></div>
            <div className="score-bar"><i style={{ width: `${Math.min(100, (item.score / item.maxScore) * 100)}%` }} /></div>
            <p>{item.feedback}</p>
          </article>
        ))}
      </div>
      <div className="feedback-columns">
        <div><h3>잘한 점</h3>{result.strengths.map((text) => <p key={text}><Icon name="check" size={17} />{text}</p>)}</div>
        <div><h3>다듬으면 더 좋아질 점</h3>{result.improvements.map((text) => <p key={text}><span>↗</span>{text}</p>)}</div>
      </div>
      <div className="next-step"><span><Icon name="spark" /></span><div><small>NEXT STEP</small><strong>{result.nextStep}</strong></div></div>
    </section>
  );
}
