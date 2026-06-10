"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useState } from "react";

type CriterionResult = {
  name: string;
  score: number;
  maxScore: number;
  feedback: string;
};

type Evaluation = {
  title: string;
  totalScore: number;
  maxScore: number;
  summary: string;
  criteria: CriterionResult[];
  strengths: string[];
  improvements: string[];
  nextStep: string;
};

type Settings = {
  apiKey: string;
  model: string;
  assignment: string;
  rubric: string;
  instruction: string;
};

const defaultSettings: Settings = {
  apiKey: "",
  model: "gpt-5.5",
  assignment:
    "식물의 구조와 기능을 설명하고, 한 가지 이상의 식물을 관찰하여 식물도감 형태의 카드뉴스로 제작한다.",
  rubric: `1. 식물의 구조와 기능 이해 (30점)
- 뿌리, 줄기, 잎, 꽃, 열매 등 주요 구조를 정확히 설명했는가?
- 각 구조의 기능과 서로의 관계를 과학적으로 설명했는가?

2. 식물도감의 과학적 정확성 (25점)
- 식물 이름과 특징, 서식 환경, 관찰 정보가 정확한가?
- 사실과 관찰 결과가 구분되어 있는가?

3. 내용 구성과 전달력 (20점)
- 제목, 본문, 흐름이 논리적이고 핵심 내용이 잘 드러나는가?
- 학생이 자신의 말로 이해하기 쉽게 설명했는가?

4. 시각 디자인과 가독성 (15점)
- 사진, 그림, 도표가 내용 이해에 도움을 주는가?
- 글자 크기, 색상 대비, 여백, 페이지 구성이 읽기 편한가?

5. 출처와 완성도 (10점)
- 참고 자료와 이미지 출처를 밝혔는가?
- 맞춤법, 문장 표현, 전체 완성도가 적절한가?`,
  instruction:
    "중학생이 이해할 수 있는 친절하고 구체적인 한국어로 피드백하세요. 확인되지 않는 내용을 지어내지 말고, PDF에서 근거를 찾기 어려운 항목은 그 사실을 명시하세요.",
};

const storageKey = "leafback-teacher-settings";

function Icon({
  name,
  size = 20,
}: {
  name: "leaf" | "upload" | "settings" | "student" | "check" | "spark" | "lock";
  size?: number;
}) {
  const paths = {
    leaf: <><path d="M4 21c4-8 9-12 16-17 0 8-3 15-12 16" /><path d="M5 16c3 0 7 1 10 3" /></>,
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    student: <><circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    spark: <><path d="m12 3 1.2 4.2L17 9l-3.8 1.8L12 15l-1.2-4.2L7 9l3.8-1.8Z" /><path d="m5 15 .7 2.3L8 18l-2.3.7L5 21l-.7-2.3L2 18l2.3-.7Z" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

export default function Home() {
  const [view, setView] = useState<"student" | "teacher">("student");
  const [settings, setSettings] = useState(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Evaluation | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const restoredSettings = { ...defaultSettings, ...JSON.parse(stored) };
        queueMicrotask(() => setSettings(restoredSettings));
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
  }, []);

  function saveSettings(event: FormEvent) {
    event.preventDefault();
    localStorage.setItem(storageKey, JSON.stringify(settings));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

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
    if (!settings.apiKey) {
      setError("먼저 교사용 설정에서 OpenAI API 키를 입력해 주세요.");
      return;
    }
    if (!studentName.trim() || !file) {
      setError("이름과 PDF 파일을 모두 입력해 주세요.");
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("studentName", studentName);
      formData.append("studentNumber", studentNumber);
      formData.append("apiKey", settings.apiKey);
      formData.append("model", settings.model);
      formData.append("assignment", settings.assignment);
      formData.append("rubric", settings.rubric);
      formData.append("instruction", settings.instruction);

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
        <a className="brand" href="#" aria-label="잎새 피드백 홈">
          <span className="brand-mark"><Icon name="leaf" size={24} /></span>
          <span>잎새 피드백</span>
          <small>LEAFBACK</small>
        </a>
        <nav className="view-switch" aria-label="화면 전환">
          <button className={view === "student" ? "active" : ""} onClick={() => setView("student")}><Icon name="student" size={17} /> 학생 제출</button>
          <button className={view === "teacher" ? "active" : ""} onClick={() => setView("teacher")}><Icon name="settings" size={17} /> 교사 설정</button>
        </nav>
      </header>

      {view === "student" ? (
        <section className="student-page">
          <div className="hero">
            <div className="eyebrow"><span /> SCIENCE PROJECT REVIEW</div>
            <h1>식물의 이야기를<br /><em>한 장씩</em> 들려주세요.</h1>
            <p>완성한 카드뉴스 PDF를 올리면, 선생님의 평가 기준에 따라<br className="desktop-only" /> 꼼꼼한 AI 피드백을 받을 수 있어요.</p>
            <div className="botanical-sketch" aria-hidden>
              <span className="stem" />
              <span className="leaf leaf-one" />
              <span className="leaf leaf-two" />
              <span className="leaf leaf-three" />
              <span className="leaf leaf-four" />
            </div>
          </div>

          <div className="work-area">
            <form className="submission-card" onSubmit={evaluate}>
              <div className="card-heading">
                <span>01</span>
                <div><h2>작품 제출하기</h2><p>평가받을 카드뉴스를 준비해 주세요.</p></div>
              </div>
              <div className="field-row">
                <label className="field"><span>이름 <b>*</b></span><input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="이름을 입력하세요" /></label>
                <label className="field"><span>학번</span><input value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} placeholder="예: 20315" /></label>
              </div>
              <label
                className={`drop-zone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <input type="file" accept="application/pdf" onChange={(e: ChangeEvent<HTMLInputElement>) => chooseFile(e.target.files?.[0])} />
                <span className="upload-icon">{file ? <Icon name="check" size={28} /> : <Icon name="upload" size={28} />}</span>
                {file ? (
                  <><strong>{file.name}</strong><p>{(file.size / 1024 / 1024).toFixed(1)}MB · 클릭해서 다른 파일 선택</p></>
                ) : (
                  <><strong>PDF를 이곳에 끌어다 놓으세요</strong><p>또는 클릭해서 파일 선택 · 최대 15MB</p></>
                )}
              </label>
              {error && <div className="error-message">{error}</div>}
              <button className="primary-button" disabled={loading}>
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

          {result && <ResultPanel result={result} studentName={studentName} />}
        </section>
      ) : (
        <section className="teacher-page">
          <div className="teacher-intro">
            <div className="eyebrow"><span /> TEACHER STUDIO</div>
            <h1>평가의 기준을<br /><em>선생님의 언어로.</em></h1>
            <p>과제와 루브릭을 저장하면 학생의 PDF가 이 기준으로 평가됩니다.</p>
          </div>
          <form className="settings-form" onSubmit={saveSettings}>
            <div className="settings-title"><span><Icon name="settings" /></span><div><h2>평가 설정</h2><p>이 브라우저에만 저장되는 MVP 설정입니다.</p></div></div>
            <label className="field full"><span>OpenAI API 키 <b>*</b></span><input type="password" value={settings.apiKey} onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })} placeholder="sk-..." autoComplete="off" /><small>키는 브라우저 로컬 저장소에 보관되며 평가 요청 시에만 서버로 전달됩니다.</small></label>
            <label className="field full"><span>모델</span><select value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })}><option value="gpt-5.5">GPT-5.5 · 높은 평가 품질</option><option value="gpt-5.4-mini">GPT-5.4 mini · 비용 절약</option><option value="gpt-4o">GPT-4o · 호환 모델</option></select></label>
            <label className="field full"><span>과제 설명 <b>*</b></span><textarea rows={3} value={settings.assignment} onChange={(e) => setSettings({ ...settings, assignment: e.target.value })} /></label>
            <label className="field full"><span>평가 루브릭 <b>*</b></span><textarea className="rubric-input" rows={16} value={settings.rubric} onChange={(e) => setSettings({ ...settings, rubric: e.target.value })} /><small>점수의 총합이 100점이 되도록 작성하면 결과를 가장 보기 좋게 표시할 수 있어요.</small></label>
            <label className="field full"><span>추가 프롬프트</span><textarea rows={4} value={settings.instruction} onChange={(e) => setSettings({ ...settings, instruction: e.target.value })} /></label>
            <div className="settings-actions">
              <button type="button" className="text-button" onClick={() => setSettings({ ...defaultSettings, apiKey: settings.apiKey })}>기본 루브릭으로 되돌리기</button>
              <button className="primary-button save-button">{saved ? <><Icon name="check" /> 저장했어요</> : "설정 저장하기"}</button>
            </div>
          </form>
        </section>
      )}
      <footer>LEAFBACK · 식물의 구조와 기능 카드뉴스 평가 MVP</footer>
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
