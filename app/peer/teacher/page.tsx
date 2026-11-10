"use client";

import Link from "next/link";
import { Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createPeerQuestion,
  defaultPeerEvaluationConfig,
  loadPeerResponses,
  validatePeerEvaluationConfig,
  type PeerEvaluationConfig,
  type PeerEvaluationResponse,
  type PeerQuestion,
} from "@/lib/peer-evaluation";
import {
  buildPeerReportTargets,
  downloadPeerHtmlReport,
  downloadPeerResponsesCsv,
  openPeerPdfReport,
} from "@/lib/peer-report";
import {
  isTeacherId,
  loadEvaluation,
  saveEvaluation,
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
import { internalPeerCollectionEnabled } from "@/lib/feature-flags";
import { createGoogleFormAppsScript } from "@/lib/google-form-script";

function cloneDefaultConfig(): PeerEvaluationConfig {
  return {
    ...defaultPeerEvaluationConfig,
    questions: defaultPeerEvaluationConfig.questions.map((question) => ({ ...question })),
  };
}

function formatTarget(response: PeerEvaluationResponse) {
  if (response.mode === "team") return `${response.target.teamNumber ?? ""}모둠`;
  return response.target.name ?? "";
}

function handleDownloadError(error: unknown) {
  window.alert(error instanceof Error ? error.message : "보고서를 만들지 못했습니다.");
}

export default function PeerTeacherPage() {
  const [settings, setSettings] = useState<PeerEvaluationConfig>(cloneDefaultConfig);
  const [teacherId, setTeacherId] = useState<TeacherId | null>(null);
  const [evaluationId, setEvaluationId] = useState("");
  const [classUrl, setClassUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [responsesLoading, setResponsesLoading] = useState(false);
  const [responses, setResponses] = useState<PeerEvaluationResponse[]>([]);
  const [error, setError] = useState("");
  const [storageMessage, setStorageMessage] = useState("");
  const [aiRubric, setAiRubric] = useState("");
  const [aiPreview, setAiPreview] = useState<GeneratedQuestionSet | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [scriptCopied, setScriptCopied] = useState(false);

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
            if (saved?.type !== "peer") return;
            setEvaluationId(saved.id);
            setSettings(saved.config);
            setStorageMessage("서버 보관함에서 저장된 동료평가를 불러왔어요.");
            if (internalPeerCollectionEnabled) {
              setResponses(await loadPeerResponses(requestedTeacherId, saved.id));
            }
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "동료평가를 불러오지 못했습니다.");
          }
        });
      }
    }
  }, []);

  const scoreSummary = useMemo(() => {
    return settings.questions
      .filter(isScoredQuestion)
      .map((question) => {
        const values = responses
          .map((response) => response.answers.find((answer) => answer.questionId === question.id)?.value)
          .filter((value): value is number => typeof value === "number");
        const average = values.length
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : 0;
        return { question, average, count: values.length };
      });
  }, [responses, settings.questions]);

  const reportTargets = useMemo(
    () => buildPeerReportTargets(settings, responses),
    [responses, settings],
  );

  const googleFormScript = useMemo(
    () => createGoogleFormAppsScript(settings),
    [settings],
  );

  async function refreshResponses(
    requestedTeacherId = teacherId,
    requestedEvaluationId = evaluationId,
  ) {
    if (!requestedTeacherId || !requestedEvaluationId) return;
    setResponsesLoading(true);
    try {
      setResponses(await loadPeerResponses(requestedTeacherId, requestedEvaluationId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "응답 목록을 불러오지 못했습니다.");
    } finally {
      setResponsesLoading(false);
    }
  }

  function updateQuestion(id: string, patch: Partial<PeerQuestion>) {
    setSettings((current) => ({
      ...current,
      questions: current.questions.map((question) => (
        question.id === id ? { ...question, ...patch } : question
      )),
    }));
  }

  function removeQuestion(id: string) {
    setSettings((current) => ({
      ...current,
      questions: current.questions.filter((question) => question.id !== id),
    }));
  }

  function changeQuestionType(id: string, type: PeerQuestion["type"]) {
    setSettings((current) => ({
      ...current,
      questions: current.questions.map((question) => {
        if (question.id !== id) return question;
        if (type === "level") {
          const levels = normalizeRubricLevels(question.levels, question.maxScore);
          return {
            ...question,
            type,
            levels,
            maxScore: maxScoreFromLevels(levels, question.maxScore),
          };
        }
        return { ...question, type, levels: undefined };
      }),
    }));
  }

  function updateQuestionLevel(
    question: PeerQuestion,
    levelId: string,
    patch: Partial<RubricLevel>,
  ) {
    const levels = normalizeRubricLevels(question.levels, question.maxScore).map((level) => (
      level.id === levelId ? { ...level, ...patch } : level
    ));
    updateQuestion(question.id, {
      levels,
      maxScore: maxScoreFromLevels(levels, question.maxScore),
    });
  }

  async function generateQuestions() {
    if (!teacherId) {
      setAiError("교사 ID로 입장한 뒤 AI 자동생성을 사용할 수 있습니다.");
      return;
    }
    setAiLoading(true);
    setAiError("");
    try {
      const response = await fetch("/api/ai/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherId,
          kind: "peer",
          rubric: aiRubric,
          title: settings.title,
          mode: settings.mode,
        }),
      });
      const data = await response.json() as {
        result?: GeneratedQuestionSet;
        error?: string;
      };
      if (!response.ok || !data.result) {
        throw new Error(data.error || "AI 문항을 생성하지 못했습니다.");
      }
      setAiPreview(data.result);
    } catch (caught) {
      setAiError(caught instanceof Error ? caught.message : "AI 문항을 생성하지 못했습니다.");
    } finally {
      setAiLoading(false);
    }
  }

  function applyGeneratedQuestions() {
    if (!aiPreview) return;
    setSettings((current) => ({
      ...current,
      title: aiPreview.title || current.title,
      description: aiPreview.description || current.description,
      questions: aiPreview.questions.map((question) => ({ ...question })),
    }));
    setStorageMessage(`${aiPreview.model}이 만든 동료평가 문항을 적용했어요.`);
    window.setTimeout(() => setStorageMessage(""), 2800);
  }

  async function persistSettings(message = "동료평가를 서버 보관함에 저장했어요.") {
    if (!teacherId) throw new Error("교사 ID로 입장한 뒤 동료평가를 저장해 주세요.");
    const validationError = validatePeerEvaluationConfig(settings);
    if (validationError) throw new Error(validationError);
    const saved = await saveEvaluation(teacherId, "peer", settings, evaluationId || undefined);
    if (saved.type !== "peer") throw new Error("동료평가 저장 결과를 확인해 주세요.");
    setEvaluationId(saved.id);
    setSettings(saved.config);
    window.history.replaceState(
      null,
      "",
      `/peer/teacher?teacher=${teacherId}&evaluation=${saved.id}`,
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
      const saved = await persistSettings("동료평가를 저장하고 새 학생용 링크를 만들었어요.");
      const response = await fetch("/api/peer/class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saved.config),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "동료평가 링크를 만들지 못했습니다.");
      setClassUrl(`${window.location.origin}/peer?class=${encodeURIComponent(data.token)}`);
      await refreshResponses(teacherId, saved.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "동료평가 링크를 만들지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(classUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function copyGoogleFormScript() {
    const validationError = validatePeerEvaluationConfig(settings);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      await navigator.clipboard.writeText(googleFormScript);
      setError("");
      setScriptCopied(true);
      window.setTimeout(() => setScriptCopied(false), 1800);
    } catch {
      setError("스크립트를 복사하지 못했습니다. 아래 코드 보기를 열어 직접 복사해 주세요.");
    }
  }

  function resetSettings() {
    setSettings(cloneDefaultConfig());
    setClassUrl("");
    setResponses([]);
    setAiPreview(null);
    setAiError("");
    setStorageMessage("입력 내용을 기본값으로 되돌렸어요.");
  }

  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/peer">
          <span className="brand-mark">葉</span>
          <span>잎새 피드백</span>
          <small>LEAFBACK</small>
        </Link>
        <nav className="header-links">
          {teacherId && <Link className="teacher-link" href={`/teacher/${teacherId}`}>내 평가 보관함</Link>}
          <Link className="teacher-link" href={teacherId ? `/teacher?teacher=${teacherId}` : "/teacher"}>PDF 교사 설정</Link>
          <Link className="teacher-link" href={teacherId ? `/docs/teacher?teacher=${teacherId}` : "/docs/teacher"}>Docs 교사 설정</Link>
        </nav>
      </header>

      <section className="teacher-page peer-teacher-page">
        <div className="teacher-intro">
          <div className="eyebrow"><span /> PEER TEACHER STUDIO</div>
          <h1>우리 반의<br /><em>동료평가를 만들어요.</em></h1>
          <p>루브릭을 만든 뒤 Google Form 생성용 Apps Script를 복사하세요. 학생 응답은 선생님의 Google 계정에서만 관리됩니다.</p>
          <div className="security-note">
            <strong>{teacherId ? `${teacherId} 선생님의 보관함에는 루브릭만 저장돼요` : "교사 번호로 들어와 루브릭을 저장해 주세요"}</strong>
            <p>학생 이름과 응답은 Feedforward 서버에 수집하거나 저장하지 않습니다.</p>
          </div>
        </div>

        <form
          className="settings-form"
          onSubmit={internalPeerCollectionEnabled ? createClassLink : (event) => event.preventDefault()}
        >
          <div className="settings-title">
            <span>01</span>
            <div><h2>동료평가 설정</h2><p>반 단위로 진행할 질문지를 만듭니다.</p></div>
          </div>
          {storageMessage && <div className="storage-message">{storageMessage}</div>}
          <label className="field full">
            <span>평가 제목 <b>*</b></span>
            <input value={settings.title} onChange={(event) => setSettings({ ...settings, title: event.target.value })} />
          </label>
          <label className="field full">
            <span>학생 안내 문구</span>
            <textarea rows={3} value={settings.description} onChange={(event) => setSettings({ ...settings, description: event.target.value })} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>평가 방식</span>
              <select value={settings.mode} onChange={(event) => setSettings({ ...settings, mode: event.target.value === "team" ? "team" : "individual" })}>
                <option value="individual">개인 동료평가</option>
                <option value="team">모둠 동료평가</option>
              </select>
            </label>
            {settings.mode === "team" && (
              <label className="field">
                <span>모둠 수 <b>*</b></span>
                <input type="number" min="2" max="20" value={settings.teamCount} onChange={(event) => setSettings({ ...settings, teamCount: Number(event.target.value) })} />
              </label>
            )}
          </div>

          <section className="ai-generator-panel">
            <div className="ai-generator-head">
              <div>
                <span>AI 자동생성</span>
                <strong>루브릭으로 동료평가 문항 만들기</strong>
              </div>
              <b>Claude Opus</b>
            </div>
            <label className="field full">
              <span>루브릭</span>
              <textarea
                rows={7}
                value={aiRubric}
                onChange={(event) => setAiRubric(event.target.value)}
                placeholder="평가 기준과 배점을 붙여 넣어 주세요."
              />
            </label>
            {aiError && <div className="error-message">{aiError}</div>}
            <div className="ai-generator-actions">
              <button type="button" className="secondary-button" onClick={generateQuestions} disabled={aiLoading}>
                {aiLoading ? "생성 중..." : aiPreview ? "다시 생성" : "AI 자동생성"}
              </button>
              {aiPreview && (
                <button type="button" className="secondary-button" onClick={applyGeneratedQuestions}>
                  문항 적용
                </button>
              )}
            </div>
            {aiPreview && (
              <div className="ai-preview">
                <div className="ai-preview-head">
                  <span>{aiPreview.model}</span>
                  <strong>{aiPreview.title}</strong>
                </div>
                <p>{aiPreview.description}</p>
                <div className="ai-preview-list">
                  {aiPreview.questions.map((question, index) => (
                    <article key={question.id}>
                      <span>{String(index + 1).padStart(2, "0")} · {question.type === "level" ? "상중하" : question.type === "score" ? `${question.maxScore}점` : "서술형"}</span>
                      <p>{question.prompt}</p>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>

          <div className="peer-builder">
            <div className="section-heading">
              <span>02</span>
              <div><h2>질문 만들기</h2><p>점수형과 짧은 글 질문을 섞어 사용할 수 있어요.</p></div>
            </div>
            {settings.questions.map((question, index) => (
              <article key={question.id} className="peer-builder-card">
                <div className="peer-builder-top">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <button type="button" onClick={() => removeQuestion(question.id)} disabled={settings.questions.length <= 1}>삭제</button>
                </div>
                <label className="field full">
                  <span>질문 내용 <b>*</b></span>
                  <input value={question.prompt} onChange={(event) => updateQuestion(question.id, { prompt: event.target.value })} placeholder="예: 친구가 맡은 역할을 성실히 했나요?" />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>응답 형식</span>
                    <select value={question.type} onChange={(event) => changeQuestionType(question.id, event.target.value === "text" ? "text" : event.target.value === "level" ? "level" : "score")}>
                      <option value="score">점수 입력</option>
                      <option value="level">상중하 선택</option>
                      <option value="text">짧은 글</option>
                    </select>
                  </label>
                  {question.type === "score" ? (
                    <label className="field">
                      <span>최대 점수</span>
                      <input type="number" min="1" max="100" value={question.maxScore} onChange={(event) => updateQuestion(question.id, { maxScore: Number(event.target.value) })} />
                    </label>
                  ) : question.type === "text" ? (
                    <label className="peer-required-toggle">
                      <input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(question.id, { required: event.target.checked })} />
                      <span>필수 응답</span>
                    </label>
                  ) : (
                    <label className="field">
                      <span>최고 점수</span>
                      <input readOnly value={question.maxScore} />
                    </label>
                  )}
                </div>
                {question.type === "level" && (
                  <div className="level-editor">
                    {(question.levels ?? createDefaultRubricLevels(question.maxScore)).map((level) => (
                      <div key={level.id} className="level-editor-row">
                        <label className="field">
                          <span>단계</span>
                          <input value={level.label} onChange={(event) => updateQuestionLevel(question, level.id, { label: event.target.value })} />
                        </label>
                        <label className="field">
                          <span>점수</span>
                          <input type="number" min="0" max="100" value={level.score} onChange={(event) => updateQuestionLevel(question, level.id, { score: Number(event.target.value) })} />
                        </label>
                        <label className="field level-description-field">
                          <span>학생에게 보일 문구</span>
                          <textarea rows={2} value={level.description} onChange={(event) => updateQuestionLevel(question, level.id, { description: event.target.value })} />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
                {question.type === "score" && (
                  <label className="peer-required-toggle">
                    <input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(question.id, { required: event.target.checked })} />
                    <span>필수 응답</span>
                  </label>
                )}
                {question.type === "level" && (
                  <label className="peer-required-toggle">
                    <input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(question.id, { required: event.target.checked })} />
                    <span>필수 응답</span>
                  </label>
                )}
              </article>
            ))}
            <button type="button" className="secondary-button peer-add-question" onClick={() => setSettings({ ...settings, questions: [...settings.questions, createPeerQuestion()] })}>
              질문 추가
            </button>
          </div>

          <section className="google-form-export">
            <div className="section-heading google-form-export-heading">
              <span>03</span>
              <div>
                <h2>Google Form 만들기</h2>
                <p>현재 루브릭이 반영된 Apps Script가 자동으로 준비됩니다.</p>
              </div>
            </div>
            <ol className="google-form-steps">
              <li><b>Apps Script 복사</b><span>현재 질문과 모둠 설정을 코드로 복사합니다.</span></li>
              <li><b>새 프로젝트 열기</b><span>Google 계정의 Apps Script 편집기를 엽니다.</span></li>
              <li><b>붙여넣고 실행</b><span>createPeerEvaluationForm을 실행한 뒤 실행 로그에서 학생 링크를 확인합니다.</span></li>
            </ol>
            <div className="google-form-actions">
              <button type="button" className="primary-button google-script-copy" onClick={copyGoogleFormScript}>
                <Copy size={16} aria-hidden="true" />
                {scriptCopied ? "복사됨" : "Apps Script 복사"}
              </button>
              <a
                className="secondary-button google-apps-script-link"
                href="https://script.google.com/home/projects/create"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={16} aria-hidden="true" />
                Google Apps Script 열기
              </a>
            </div>
            <div className="google-form-privacy">
              <ShieldCheck size={17} aria-hidden="true" />
              <p>실행하면 선생님의 Google Drive에 Form과 응답 스프레드시트가 생성됩니다. 처음 한 번은 Google 권한 승인이 필요합니다.</p>
            </div>
            <details className="google-script-preview">
              <summary>생성된 코드 보기</summary>
              <pre><code>{googleFormScript}</code></pre>
            </details>
          </section>

          {error && <div className="error-message">{error}</div>}
          <div className="teacher-storage-actions">
            <button type="button" className="secondary-button" onClick={async () => {
              setError("");
              try {
                await persistSettings();
                if (internalPeerCollectionEnabled) await refreshResponses();
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "동료평가를 저장하지 못했습니다.");
              }
            }}>
              {evaluationId ? "동료평가 수정 저장" : "동료평가 보관함에 저장"}
            </button>
            <button type="button" className="danger-text-button" onClick={resetSettings}>입력 초기화</button>
          </div>
          {internalPeerCollectionEnabled && (
            <div className="settings-actions">
              <button type="button" className="text-button" onClick={() => setSettings(cloneDefaultConfig())}>기본 질문으로 되돌리기</button>
              <button className="primary-button save-button" disabled={loading}>{loading ? "링크 만드는 중..." : "저장하고 학생용 링크 만들기"}</button>
            </div>
          )}

          {internalPeerCollectionEnabled && classUrl && (
            <div className="class-link-result">
              <span>동료평가 링크가 준비됐어요</span>
              <strong>이 주소를 학생들에게 전달해 주세요.</strong>
              <div><input readOnly value={classUrl} /><button type="button" onClick={copyLink}>{copied ? "복사됨" : "링크 복사"}</button></div>
              <a href={classUrl} target="_blank" rel="noreferrer">학생 화면 미리 보기 →</a>
            </div>
          )}
        </form>
      </section>

      {internalPeerCollectionEnabled && evaluationId && (
        <section className="peer-results-section">
          <div className="section-heading">
            <span>03</span>
            <div><h2>응답 목록</h2><p>학생들이 제출한 동료평가를 확인합니다.</p></div>
          </div>
          <div className="peer-results-actions">
            <strong>{responses.length}개 응답</strong>
            <div>
              <button type="button" className="secondary-button" onClick={() => {
                try {
                  downloadPeerResponsesCsv(settings, responses);
                } catch (caught) {
                  handleDownloadError(caught);
                }
              }} disabled={responses.length === 0}>
                CSV 다운로드
              </button>
              <button type="button" className="secondary-button" onClick={() => refreshResponses()} disabled={responsesLoading}>
                {responsesLoading ? "불러오는 중..." : "새로고침"}
              </button>
            </div>
          </div>
          {scoreSummary.length > 0 && (
            <div className="peer-score-summary">
              {scoreSummary.map(({ question, average, count }) => (
                <article key={question.id}>
                  <span>{count}개 응답</span>
                  <strong>{average.toFixed(1)} / {question.maxScore}</strong>
                  <p>{question.prompt}</p>
                </article>
              ))}
            </div>
          )}
          {responses.length === 0 ? (
            <div className="empty-library">
              <strong>아직 제출된 응답이 없어요.</strong>
              <p>학생용 링크를 공유한 뒤 이곳에서 응답을 확인할 수 있습니다.</p>
            </div>
          ) : (
            <>
              <div className="peer-report-targets">
                {reportTargets.map((target) => (
                  <article key={target.key} className="peer-report-card">
                    <div>
                      <span>{target.mode === "team" ? "모둠 보고서" : "학생 보고서"}</span>
                      <h3>{target.label}</h3>
                      <p>{target.responseCount}개 응답 · 평균 {target.scoreAverage.toFixed(1)} / {target.scoreMax || 0}</p>
                    </div>
                    <div className="peer-report-actions">
                      <button type="button" onClick={() => {
                        try {
                          openPeerPdfReport(settings, target);
                        } catch (caught) {
                          handleDownloadError(caught);
                        }
                      }}>
                        PDF 보고서
                      </button>
                      <button type="button" onClick={() => {
                        try {
                          downloadPeerHtmlReport(settings, target);
                        } catch (caught) {
                          handleDownloadError(caught);
                        }
                      }}>
                        HTML
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="peer-response-list">
                {responses.map((response) => (
                  <article key={response.id} className="peer-response-card">
                    <div className="peer-response-meta">
                      <strong>{response.respondent.name}</strong>
                      <span>{response.respondent.grade} · {response.respondent.className}{response.respondent.teamNumber ? ` · ${response.respondent.teamNumber}모둠` : ""}</span>
                      <b>→ {formatTarget(response)}</b>
                      <time>{new Date(response.createdAt).toLocaleString("ko-KR")}</time>
                    </div>
                    <div className="peer-response-answers">
                      {settings.questions.map((question) => {
                        const answer = response.answers.find((item) => item.questionId === question.id);
                        return (
                          <div key={question.id}>
                            <span>{question.prompt}</span>
                            <strong>{answer?.value === "" || answer?.value === undefined ? "미응답" : String(answer.value)}</strong>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      <footer>LEAFBACK · 동료평가 교사용 설정</footer>
    </main>
  );
}
