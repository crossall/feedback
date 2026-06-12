"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { defaultGoogleDocsClassConfig } from "@/lib/google-docs-defaults";
import EvaluationOutputOptionsField from "@/app/evaluation-output-options";
import {
  isTeacherId,
  loadEvaluation,
  saveEvaluation,
  type TeacherId,
} from "@/lib/teacher-evaluations";

export default function GoogleDocsTeacherPage() {
  const [settings, setSettings] = useState(defaultGoogleDocsClassConfig);
  const [teacherId, setTeacherId] = useState<TeacherId | null>(null);
  const [evaluationId, setEvaluationId] = useState("");
  const [classUrl, setClassUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [storageMessage, setStorageMessage] = useState("");
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTeacherId = params.get("teacher") ?? "";
    const requestedEvaluationId = params.get("evaluation") ?? "";

    if (isTeacherId(requestedTeacherId)) {
      queueMicrotask(() => setTeacherId(requestedTeacherId));
      if (requestedEvaluationId) {
        queueMicrotask(async () => {
          try {
            const saved = await loadEvaluation(requestedTeacherId, requestedEvaluationId);
            if (saved?.type !== "docs") return;
            setEvaluationId(saved.id);
            setSettings(saved.config);
            setHasStoredApiKey(saved.hasApiKey);
            setStorageMessage("서버 보관함에서 저장된 Google Docs 평가를 불러왔어요.");
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "평가를 불러오지 못했습니다.");
          }
        });
      }
      return;
    }
  }, []);

  async function persistSettings(message = "평가를 서버 보관함에 저장했어요.") {
    if (!teacherId) throw new Error("교사 ID로 입장한 뒤 평가를 저장해 주세요.");
    if (
      !settings.outputOptions.showOnScreen
      && !settings.outputOptions.appendToGoogleDoc
      && settings.outputOptions.reportFormat === "none"
    ) {
      throw new Error("평가 결과 제공 방식을 하나 이상 선택해 주세요.");
    }
    const saved = await saveEvaluation(teacherId, "docs", settings, evaluationId || undefined);
    setEvaluationId(saved.id);
    setHasStoredApiKey(saved.hasApiKey);
    window.history.replaceState(
      null,
      "",
      `/docs/teacher?teacher=${teacherId}&evaluation=${saved.id}`,
    );
    setStorageMessage(message);
    window.setTimeout(() => setStorageMessage(""), 2800);
    return saved;
  }

  function resetSettings() {
    setSettings(defaultGoogleDocsClassConfig);
    setClassUrl("");
    setStorageMessage("입력 내용을 기본값으로 되돌렸어요.");
  }

  async function createClassLink(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setClassUrl("");
    try {
      const saved = await persistSettings("평가를 저장하고 새 학생용 링크를 만들었어요.");
      const response = await fetch("/api/class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          teacherId,
          evaluationId: saved.id,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "학급 링크를 만들지 못했습니다.");

      setClassUrl(`${window.location.origin}/docs?class=${encodeURIComponent(data.token)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "학급 링크를 만들지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(classUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/docs">
          <span className="brand-mark">葉</span>
          <span>잎새 피드백</span>
          <small>LEAFBACK</small>
        </Link>
        <nav className="header-links">
          {teacherId && <Link className="teacher-link" href={`/teacher/${teacherId}`}>내 평가 보관함</Link>}
          <Link className="teacher-link" href={teacherId ? `/teacher?teacher=${teacherId}` : "/teacher"}>PDF 교사 설정</Link>
          <Link className="teacher-link" href="/docs">학생 화면 보기</Link>
        </nav>
      </header>

      <section className="teacher-page">
        <div className="teacher-intro">
          <div className="eyebrow"><span /> DOCS TEACHER STUDIO</div>
          <h1>Google Docs의<br /><em>평가 기준을 만들어요.</em></h1>
          <p>과제와 루브릭을 입력해 학급 전용 링크를 만드세요. 학생들은 받은 링크에서 Google Docs 글을 제출할 수 있습니다.</p>
          <div className="security-note">
            <strong>{teacherId ? `${teacherId} 선생님의 보관함에 저장돼요` : "다음에도 바로 이어서 사용할 수 있어요"}</strong>
            <p>평가와 API 키는 암호화되어 서버에 저장됩니다. 다른 기기에서도 같은 교사 ID로 이어서 사용할 수 있어요.</p>
          </div>
        </div>

        <form className="settings-form" onSubmit={createClassLink}>
          <div className="settings-title">
            <span>01</span>
            <div><h2>Google Docs 평가 설정</h2><p>PDF 평가 설정과 별도로 저장됩니다.</p></div>
          </div>
          {storageMessage && <div className="storage-message">{storageMessage}</div>}
          <label className="field full">
            <span>학급 링크 이름 <b>*</b></span>
            <input value={settings.classTitle} onChange={(e) => setSettings({ ...settings, classTitle: e.target.value })} />
          </label>
          <label className="field full">
            <span>OpenAI API 키 <b>*</b></span>
            <input type="password" value={settings.apiKey} onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })} placeholder={hasStoredApiKey ? "서버에 저장된 API 키 사용 중" : "sk-..."} autoComplete="off" />
            <small>{hasStoredApiKey ? "새 키를 입력하지 않으면 서버에 저장된 기존 키를 계속 사용합니다." : "API 키는 서버에서 암호화해 저장하며 브라우저로 다시 전송하지 않습니다."}</small>
          </label>
          <label className="field full">
            <span>평가 모델</span>
            <select value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })}>
              <option value="gpt-5.5">GPT-5.5 · 높은 평가 품질</option>
              <option value="gpt-5.4-mini">GPT-5.4 mini · 비용 절약</option>
              <option value="gpt-4o">GPT-4o · 호환 모델</option>
            </select>
          </label>
          <label className="field full">
            <span>과제 설명 <b>*</b></span>
            <textarea rows={4} value={settings.assignment} onChange={(e) => setSettings({ ...settings, assignment: e.target.value })} />
          </label>
          <label className="field full">
            <span>평가 루브릭 <b>*</b></span>
            <textarea className="rubric-input" rows={17} value={settings.rubric} onChange={(e) => setSettings({ ...settings, rubric: e.target.value })} />
            <small>각 항목의 배점을 적고, 전체 점수의 합이 100점이 되도록 작성해 주세요.</small>
          </label>
          <label className="field full">
            <span>추가 프롬프트</span>
            <textarea rows={4} value={settings.instruction} onChange={(e) => setSettings({ ...settings, instruction: e.target.value })} />
          </label>
          <EvaluationOutputOptionsField
            value={settings.outputOptions}
            onChange={(outputOptions) => setSettings({ ...settings, outputOptions })}
            allowGoogleDocsAppend
          />
          {error && <div className="error-message">{error}</div>}
          <div className="teacher-storage-actions">
            <button type="button" className="secondary-button" onClick={async () => {
              setError("");
              try {
                await persistSettings();
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "평가를 저장하지 못했습니다.");
              }
            }}>
              {evaluationId ? "평가 수정 저장" : "평가 보관함에 저장"}
            </button>
            <button type="button" className="danger-text-button" onClick={resetSettings}>입력 초기화</button>
          </div>
          <div className="settings-actions">
            <button type="button" className="text-button" onClick={() => setSettings({ ...defaultGoogleDocsClassConfig, apiKey: settings.apiKey })}>기본 루브릭으로 되돌리기</button>
            <button className="primary-button save-button" disabled={loading}>{loading ? "암호화 링크 만드는 중..." : "저장하고 학생용 링크 만들기"}</button>
          </div>

          {classUrl && (
            <div className="class-link-result">
              <span>Google Docs 학급 링크가 준비됐어요</span>
              <strong>이 주소를 학생들에게 전달해 주세요.</strong>
              <div><input readOnly value={classUrl} /><button type="button" onClick={copyLink}>{copied ? "복사됨" : "링크 복사"}</button></div>
              <a href={classUrl} target="_blank" rel="noreferrer">학생 화면 미리 보기 →</a>
              <p>API 키나 루브릭을 바꾸면 새 링크를 만들어 다시 전달해 주세요.</p>
            </div>
          )}
        </form>
      </section>
      <footer>LEAFBACK · GOOGLE DOCS 교사용 평가 설정</footer>
    </main>
  );
}
