"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  deleteEvaluation,
  loadEvaluations,
  loadTeacherApiKeyStatus,
  saveTeacherApiKeySettings,
  type SavedEvaluation,
  type TeacherId,
} from "@/lib/teacher-evaluations";
import { bundledEvaluationVisible } from "@/lib/feature-flags";
import ProjectCopyLibrary from "./project-copy-library";

export default function TeacherDashboard({ teacherId }: { teacherId: TeacherId }) {
  const router = useRouter();
  const [evaluations, setEvaluations] = useState<SavedEvaluation[]>([]);
  const [apiKeys, setApiKeys] = useState({ openai: "", anthropic: "" });
  const [hasApiKeys, setHasApiKeys] = useState({ openai: false, anthropic: false });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [keyMessage, setKeyMessage] = useState("");
  const [keySaving, setKeySaving] = useState(false);
  const visibleEvaluations = bundledEvaluationVisible
    ? evaluations
    : evaluations.filter((evaluation) => evaluation.type !== "session");

  useEffect(() => {
    queueMicrotask(async () => {
      try {
        const [loadedEvaluations, loadedApiKeys] = await Promise.all([
          loadEvaluations(teacherId),
          loadTeacherApiKeyStatus(teacherId),
        ]);
        setEvaluations(loadedEvaluations);
        setHasApiKeys(loadedApiKeys);
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

  async function saveApiKeys(event: FormEvent) {
    event.preventDefault();
    setKeySaving(true);
    setError("");
    setKeyMessage("");
    try {
      const saved = await saveTeacherApiKeySettings(teacherId, apiKeys);
      setHasApiKeys(saved);
      setApiKeys({ openai: "", anthropic: "" });
      setKeyMessage("API 키 저장 상태를 업데이트했어요.");
      window.setTimeout(() => setKeyMessage(""), 2800);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "API 키를 저장하지 못했습니다.");
    } finally {
      setKeySaving(false);
    }
  }

  async function logout() {
    await fetch("/api/teachers/auth", { method: "DELETE" });
    router.push("/");
    router.refresh();
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
          <button type="button" onClick={logout}>나가기</button>
        </div>
      </header>

      <section className="dashboard-shell">
        <div className="dashboard-heading">
          <div>
            <div className="eyebrow"><span /> MY FEEDBACK LIBRARY</div>
            <h1>선생님의<br /><em>평가 보관함</em></h1>
            <p>평가 기준을 만들고 저장해 둔 평가를 열어 학생 작품을 직접 평가할 수 있어요.</p>
          </div>
          <div className="dashboard-stat">
            <strong>{visibleEvaluations.length}</strong>
            <span>저장된 평가</span>
          </div>
        </div>

        <section className="api-key-section">
          <div className="section-heading">
            <span>01</span>
            <div><h2>API 키 관리</h2><p>교사 번호에 사용할 평가 모델 키를 먼저 저장하세요.</p></div>
          </div>
          <form className="api-key-form" onSubmit={saveApiKeys}>
            <label>
              <span>OpenAI API 키</span>
              <input
                type="password"
                value={apiKeys.openai}
                onChange={(event) => setApiKeys({ ...apiKeys, openai: event.target.value })}
                placeholder={hasApiKeys.openai ? "저장된 OpenAI 키 사용 중" : "sk-..."}
                autoComplete="off"
              />
              <small>{hasApiKeys.openai ? "저장됨" : "미저장"}</small>
            </label>
            <label>
              <span>Claude API 키</span>
              <input
                type="password"
                value={apiKeys.anthropic}
                onChange={(event) => setApiKeys({ ...apiKeys, anthropic: event.target.value })}
                placeholder={hasApiKeys.anthropic ? "저장된 Claude 키 사용 중" : "sk-ant-..."}
                autoComplete="off"
              />
              <small>{hasApiKeys.anthropic ? "저장됨" : "미저장"}</small>
            </label>
            <button type="submit" disabled={keySaving}>
              {keySaving ? "저장 중..." : "API 키 저장"}
            </button>
          </form>
          {keyMessage && <div className="storage-message">{keyMessage}</div>}
        </section>

        <ProjectCopyLibrary teacherId={teacherId} />

        <section className="create-section">
          <div className="section-heading">
            <span>03</span>
            <div><h2>새로 만들기</h2><p>교사가 직접 평가할 작품 형식이나 동료평가를 선택하세요.</p></div>
          </div>
          {(!hasApiKeys.openai || !hasApiKeys.anthropic) && (
            <div className="key-warning">
              <strong>AI 평가용 API 키가 아직 모두 저장되지 않았어요.</strong>
              <span>
                PDF와 Google Docs 평가는 GPT 모델에 OpenAI 키, Claude 모델에 Claude 키가 필요합니다. 동료평가는 API 키 없이 만들 수 있어요.
              </span>
            </div>
          )}
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
            <Link href={`/peer/teacher?teacher=${teacherId}`}>
              <span className="type-icon peer">PEER</span>
              <div><strong>동료평가 만들기</strong><p>점수와 짧은 글 질문으로 반 친구나 모둠을 평가해요.</p></div>
              <b>→</b>
            </Link>
            {bundledEvaluationVisible && (
              <Link href={`/session/teacher?teacher=${teacherId}`}>
                <span className="type-icon session">SET</span>
                <div><strong>묶음 평가 만들기</strong><p>여러 평가를 한 흐름으로 묶고 마지막에 통합 보고서를 봅니다.</p></div>
                <b>&gt;</b>
              </Link>
            )}
          </div>
        </section>

        <section className="library-section">
          <div className="section-heading">
            <span>04</span>
            <div><h2>저장한 평가</h2><p>평가 기준을 열어 수정하거나 학생 작품 평가를 이어가세요.</p></div>
          </div>
          {error && <div className="error-message">{error}</div>}
          {!ready ? (
            <div className="empty-library">평가 보관함을 불러오는 중...</div>
          ) : visibleEvaluations.length === 0 ? (
            <div className="empty-library">
              <strong>아직 저장한 평가가 없어요.</strong>
              <p>위의 새로 만들기에서 첫 평가를 만들어 보세요.</p>
            </div>
          ) : (
            <div className="evaluation-grid">
              {visibleEvaluations.map((evaluation) => {
                const editPath = evaluation.type === "pdf"
                  ? "/teacher"
                  : evaluation.type === "docs"
                    ? "/docs/teacher"
                    : evaluation.type === "peer"
                      ? "/peer/teacher"
                      : "/session/teacher";
                const title = evaluation.type === "peer"
                  ? evaluation.config.title
                  : evaluation.type === "session"
                    ? evaluation.config.title
                    : evaluation.config.classTitle;
                const description = evaluation.type === "peer"
                  ? evaluation.config.description
                  : evaluation.type === "session"
                    ? evaluation.config.description
                    : evaluation.config.assignment;
                return (
                  <article key={evaluation.id} className="evaluation-card">
                    <div className="evaluation-meta">
                      <span className={`format-chip ${evaluation.type}`}>{evaluation.type === "pdf" ? "PDF" : evaluation.type === "docs" ? "DOCS" : evaluation.type === "peer" ? "PEER" : "SESSION"}</span>
                      <time>{new Date(evaluation.updatedAt).toLocaleDateString("ko-KR")}</time>
                    </div>
                    <h3>{title}</h3>
                    <p>{description}</p>
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
