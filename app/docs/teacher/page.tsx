"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { providerFromModel } from "@/lib/class-config";
import { defaultGoogleDocsClassConfig } from "@/lib/google-docs-defaults";
import EvaluationOutputOptionsField from "@/app/evaluation-output-options";
import {
  isTeacherId,
  loadEvaluation,
  loadTeacherApiKeyStatus,
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
  const [hasApiKeys, setHasApiKeys] = useState({ openai: false, anthropic: false });
  const [googleAuth, setGoogleAuth] = useState({
    configured: false,
    connected: false,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTeacherId = params.get("teacher") ?? "";
    const requestedEvaluationId = params.get("evaluation") ?? "";

    if (isTeacherId(requestedTeacherId)) {
      queueMicrotask(() => setTeacherId(requestedTeacherId));
      queueMicrotask(async () => {
        try {
          setHasApiKeys(await loadTeacherApiKeyStatus(requestedTeacherId));
        } catch {
          // Link creation will still validate the key on the server.
        }
      });
      queueMicrotask(async () => {
        try {
          const response = await fetch(
            `/api/google/oauth/status?teacher=${requestedTeacherId}`,
            { cache: "no-store" },
          );
          if (response.ok) setGoogleAuth(await response.json());
        } catch {
          // The option panel will keep showing the setup guidance.
        }
      });
      const oauthResult = params.get("oauth");
      if (oauthResult === "connected") {
        queueMicrotask(() => setStorageMessage("Google 계정 연결이 완료됐어요."));
      } else if (oauthResult === "not-configured") {
        queueMicrotask(() => setError("플랫폼의 Google OAuth 앱 설정이 먼저 필요합니다."));
      }
      if (requestedEvaluationId) {
        queueMicrotask(async () => {
          try {
            const saved = await loadEvaluation(requestedTeacherId, requestedEvaluationId);
            if (saved?.type !== "docs") return;
            setEvaluationId(saved.id);
            setSettings(saved.config);
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
      if (settings.outputOptions.appendToGoogleDoc && !googleAuth.connected) {
        throw new Error(
          googleAuth.configured
            ? "Google Docs 쓰기 기능을 사용하려면 먼저 Google 계정을 연결해 주세요."
            : "Google Docs 쓰기 기능을 사용하려면 플랫폼의 Google OAuth 앱 설정이 필요합니다.",
        );
      }
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
            <p>API 키는 교사 보관함에서 별도로 관리합니다. 여기서는 평가 기준과 모델만 저장합니다.</p>
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
            <span>평가 모델</span>
            <select value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })}>
              <option value="gpt-5.5">GPT-5.5 · 높은 평가 품질</option>
              <option value="gpt-5.4-mini">GPT-5.4 mini · 비용 절약</option>
              <option value="gpt-4o">GPT-4o · 호환 모델</option>
              <option value="claude-opus-4-8">Claude Opus 4.8 · 깊은 평가</option>
              <option value="claude-opus-4-7">Claude Opus 4.7 · 깊은 평가</option>
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6 · 균형형</option>
              <option value="claude-haiku-4-5">Claude Haiku 4.5 · 빠른 평가</option>
            </select>
            {!hasApiKeys[providerFromModel(settings.model)] && (
              <small>
                이 모델을 사용하려면 먼저 내 평가 보관함에서 {providerFromModel(settings.model) === "anthropic" ? "Claude" : "OpenAI"} API 키를 저장해 주세요.
              </small>
            )}
          </label>
          <label className="field full">
            <span>과제 설명 <b>*</b></span>
            <textarea rows={4} value={settings.assignment} onChange={(e) => setSettings({ ...settings, assignment: e.target.value })} />
          </label>
          <label className="field full">
            <span>평가 루브릭 <b>*</b></span>
            <textarea className="rubric-input" rows={17} value={settings.rubric} onChange={(e) => setSettings({ ...settings, rubric: e.target.value })} />
            <small>각 항목의 배점을 적어 주세요. 전체 점수는 루브릭과 추가 프롬프트에 따라 AI가 산출합니다.</small>
          </label>
          <label className="field full">
            <span>추가 프롬프트</span>
            <textarea rows={4} value={settings.instruction} onChange={(e) => setSettings({ ...settings, instruction: e.target.value })} />
          </label>
          <EvaluationOutputOptionsField
            value={settings.outputOptions}
            onChange={(outputOptions) => setSettings({ ...settings, outputOptions })}
            allowGoogleDocsAppend
            googleAuth={{
              ...googleAuth,
              connectHref: teacherId
                ? `/api/google/oauth/start?teacher=${teacherId}&returnTo=${encodeURIComponent(
                  `/docs/teacher?teacher=${teacherId}${evaluationId ? `&evaluation=${evaluationId}` : ""}`,
                )}`
                : "#",
            }}
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
            <button type="button" className="text-button" onClick={() => setSettings(defaultGoogleDocsClassConfig)}>기본 루브릭으로 되돌리기</button>
            <button className="primary-button save-button" disabled={loading}>{loading ? "암호화 링크 만드는 중..." : "저장하고 학생용 링크 만들기"}</button>
          </div>

          {classUrl && (
            <div className="class-link-result">
              <span>Google Docs 학급 링크가 준비됐어요</span>
              <strong>이 주소를 학생들에게 전달해 주세요.</strong>
              <div><input readOnly value={classUrl} /><button type="button" onClick={copyLink}>{copied ? "복사됨" : "링크 복사"}</button></div>
              <a href={classUrl} target="_blank" rel="noreferrer">학생 화면 미리 보기 →</a>
              <p>루브릭이나 모델을 바꾸면 새 링크를 만들어 다시 전달해 주세요.</p>
            </div>
          )}
        </form>
      </section>
      <footer>LEAFBACK · GOOGLE DOCS 교사용 평가 설정</footer>
    </main>
  );
}
