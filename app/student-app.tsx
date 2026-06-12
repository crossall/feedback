"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, FormEvent, useEffect, useRef, useState } from "react";
import EvaluationDelivery from "./evaluation-delivery";
import type { Evaluation, EvaluationResponse } from "@/lib/evaluation-result";

function Icon({
  name,
  size = 20,
}: {
  name: "leaf" | "upload" | "check" | "spark" | "lock";
  size?: number;
}) {
  const paths = {
    leaf: <><path d="M4 21c4-8 9-12 16-17 0 8-3 15-12 16" /><path d="M5 16c3 0 7 1 10 3" /></>,
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    spark: <><path d="m12 3 1.2 4.2L17 9l-3.8 1.8L12 15l-1.2-4.2L7 9l3.8-1.8Z" /><path d="m5 15 .7 2.3L8 18l-2.3.7L5 21l-.7-2.3L2 18l2.3-.7Z" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

export default function StudentApp({ classToken }: { classToken: string }) {
  const [studentGrade, setStudentGrade] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentTeam, setStudentTeam] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EvaluationResponse | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result) {
      window.setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }, [result]);

  function chooseFile(candidate?: File) {
    setError("");
    setResult(null);
    if (!candidate) return;
    if (candidate.type !== "application/pdf") {
      setError("PDF 파일만 올릴 수 있어요.");
      return;
    }
    if (candidate.size > 15 * 1024 * 1024) {
      setError("파일 크기는 15MB 이하여야 해요.");
      return;
    }
    setFile(candidate);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files[0]);
  }

  async function evaluate(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!classToken) {
      setError("선생님이 보내주신 학급 링크로 접속해 주세요.");
      return;
    }
    if (!studentGrade.trim() || !studentClass.trim() || !studentName.trim() || !studentTeam.trim() || !file) {
      setError("학년, 반, 이름, 모둠과 PDF 파일을 모두 입력해 주세요.");
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("classToken", classToken);
      formData.append("studentGrade", studentGrade);
      formData.append("studentClass", studentClass);
      formData.append("studentName", studentName);
      formData.append("studentTeam", studentTeam);

      const response = await fetch("/api/evaluate", { method: "POST", body: formData });
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
        <Link className="brand" href="/">
          <span className="brand-mark"><Icon name="leaf" size={24} /></span>
          <span>잎새 피드백</span>
          <small>LEAFBACK</small>
        </Link>
        <nav className="header-links">
          <Link className="teacher-link" href="/docs">Google Docs 평가</Link>
          <Link className="teacher-link" href="/teacher">교사용 페이지</Link>
        </nav>
      </header>

      <section className="student-page">
        <div className="hero">
          <div className="eyebrow"><span /> SCIENCE PROJECT REVIEW</div>
          <h1>식물의 이야기를<br /><em>한 장씩</em> 들려주세요.</h1>
          <p>완성한 카드뉴스 PDF를 올리면, 선생님의 평가 기준에 따라<br className="desktop-only" /> 꼼꼼한 AI 피드백을 받을 수 있어요.</p>
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
              <div><h2>작품 제출하기</h2><p>평가받을 카드뉴스를 준비해 주세요.</p></div>
            </div>
            <div className="field-row">
              <label className="field"><span>학년 <b>*</b></span><input value={studentGrade} onChange={(e) => setStudentGrade(e.target.value)} placeholder="예: 5학년" /></label>
              <label className="field"><span>반 <b>*</b></span><input value={studentClass} onChange={(e) => setStudentClass(e.target.value)} placeholder="예: 2반" /></label>
              <label className="field"><span>이름 <b>*</b></span><input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="이름을 입력하세요" /></label>
              <label className="field"><span>모둠 <b>*</b></span><input value={studentTeam} onChange={(e) => setStudentTeam(e.target.value)} placeholder="예: 새싹 모둠" /></label>
            </div>
            <label className={`drop-zone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
              <input type="file" accept="application/pdf" onChange={(e: ChangeEvent<HTMLInputElement>) => chooseFile(e.target.files?.[0])} />
              <span className="upload-icon">{file ? <Icon name="check" size={28} /> : <Icon name="upload" size={28} />}</span>
              {file ? <><strong>{file.name}</strong><p>{(file.size / 1024 / 1024).toFixed(1)}MB · 클릭해서 다른 파일 선택</p></> : <><strong>PDF를 이곳에 끌어다 놓으세요</strong><p>또는 클릭해서 파일 선택 · 최대 15MB</p></>}
            </label>
            {error && <div className="error-message">{error}</div>}
            <button className="primary-button" disabled={loading || !classToken}>
              {loading ? <><span className="spinner" /> PDF를 읽고 평가하는 중...</> : <><Icon name="spark" /> AI 피드백 받기 <span className="arrow">→</span></>}
            </button>
            <p className="privacy"><Icon name="lock" size={14} /> 제출 파일은 평가 요청에만 사용됩니다.</p>
          </form>

          <aside className="guide-card">
            <span className="guide-number">식물도감</span>
            <h3>평가 전,<br />한번 확인해 볼까요?</h3>
            <ul>
              <li><span>1</span><div><strong>구조와 기능</strong><p>뿌리, 줄기, 잎의 역할을 정확하게 설명했나요?</p></div></li>
              <li><span>2</span><div><strong>관찰과 기록</strong><p>식물의 특징을 직접 관찰한 내용이 담겨 있나요?</p></div></li>
              <li><span>3</span><div><strong>보기 좋은 구성</strong><p>글과 이미지가 조화롭고 읽기 편한가요?</p></div></li>
              <li><span>4</span><div><strong>출처 표시</strong><p>참고한 자료와 이미지 출처를 적었나요?</p></div></li>
            </ul>
            <div className="tiny-note">잘 만든 작품보다<br /><b>배움이 보이는 작품</b>이 더 멋져요.</div>
          </aside>
        </div>

        {result && (
          <div ref={resultRef} className="evaluation-output">
            <EvaluationDelivery
              result={result}
              student={{
                grade: studentGrade,
                className: studentClass,
                name: studentName,
                team: studentTeam,
              }}
            />
            {result.outputOptions.showOnScreen && (
              <ResultPanel result={result} studentName={studentName} />
            )}
          </div>
        )}
      </section>
      <footer>LEAFBACK · 식물의 구조와 기능 카드뉴스 평가</footer>
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
