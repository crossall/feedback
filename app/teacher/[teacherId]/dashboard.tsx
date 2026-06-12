"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  deleteEvaluation,
  loadEvaluations,
  type SavedEvaluation,
  type TeacherId,
} from "@/lib/teacher-evaluations";

export default function TeacherDashboard({ teacherId }: { teacherId: TeacherId }) {
  const [evaluations, setEvaluations] = useState<SavedEvaluation[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    queueMicrotask(async () => {
      try {
        setEvaluations(await loadEvaluations(teacherId));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "평가 보관함을 불러오지 못했습니다.");
      } finally {
        setReady(true);
      }
    });
  }, [teacherId]);

  async function removeEvaluation(evaluationId: string) {
    if (!window.confirm("이 평가를 보관함에서 삭제할까요?")) return;
    try {
      await deleteEvaluation(teacherId, evaluationId);
      setEvaluations(await loadEvaluations(teacherId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "평가를 삭제하지 못했습니다.");
    }
  }

  return (
    <main className="dashboard-page">
      <header className="site-header">
        <Link className="brand" href="/">
          <span className="brand-mark">葉</span>
          <span>잎새 피드백</span>
          <small>LEAFBACK</small>
        </Link>
        <div className="dashboard-identity">
          <span>TEACHER</span>
          <strong>{teacherId}</strong>
          <Link href="/">나가기</Link>
        </div>
      </header>

      <section className="dashboard-shell">
        <div className="dashboard-heading">
          <div>
            <div className="eyebrow"><span /> MY FEEDBACK LIBRARY</div>
            <h1>선생님의<br /><em>평가 보관함</em></h1>
            <p>새 평가를 만들거나 저장해 둔 평가를 열어 학생용 링크를 다시 만들 수 있어요.</p>
          </div>
          <div className="dashboard-stat">
            <strong>{evaluations.length}</strong>
            <span>저장된 평가</span>
          </div>
        </div>

        <section className="create-section">
          <div className="section-heading">
            <span>01</span>
            <div><h2>새로 만들기</h2><p>학생이 제출할 문서 형식을 선택하세요.</p></div>
          </div>
          <div className="creation-grid">
            <Link href={`/teacher?teacher=${teacherId}`}>
              <span className="type-icon">PDF</span>
              <div><strong>PDF 평가 만들기</strong><p>보고서, 발표 자료, 활동 결과물 등 다양한 PDF를 평가해요.</p></div>
              <b>→</b>
            </Link>
            <Link href={`/docs/teacher?teacher=${teacherId}`}>
              <span className="type-icon docs">DOC</span>
              <div><strong>Google Docs 평가 만들기</strong><p>공유 링크로 제출한 글과 문서를 평가해요.</p></div>
              <b>→</b>
            </Link>
          </div>
        </section>

        <section className="library-section">
          <div className="section-heading">
            <span>02</span>
            <div><h2>저장한 평가</h2><p>평가 기준을 열어 수정하거나 학생 링크를 다시 만드세요.</p></div>
          </div>
          {error && <div className="error-message">{error}</div>}
          {!ready ? (
            <div className="empty-library">평가 보관함을 불러오는 중...</div>
          ) : evaluations.length === 0 ? (
            <div className="empty-library">
              <strong>아직 저장한 평가가 없어요.</strong>
              <p>위의 새로 만들기에서 첫 평가를 만들어 보세요.</p>
            </div>
          ) : (
            <div className="evaluation-grid">
              {evaluations.map((evaluation) => {
                const editPath = evaluation.type === "pdf" ? "/teacher" : "/docs/teacher";
                return (
                  <article key={evaluation.id} className="evaluation-card">
                    <div className="evaluation-meta">
                      <span className={`format-chip ${evaluation.type}`}>{evaluation.type === "pdf" ? "PDF" : "DOCS"}</span>
                      <time>{new Date(evaluation.updatedAt).toLocaleDateString("ko-KR")}</time>
                    </div>
                    <h3>{evaluation.config.classTitle}</h3>
                    <p>{evaluation.config.assignment}</p>
                    <div className="evaluation-actions">
                      <Link href={`${editPath}?teacher=${teacherId}&evaluation=${evaluation.id}`}>평가 열기</Link>
                      <button type="button" onClick={() => removeEvaluation(evaluation.id)}>삭제</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
      <footer>LEAFBACK · TEACHER {teacherId}</footer>
    </main>
  );
}
