"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { defaultClassConfig } from "@/lib/defaults";

export default function TeacherPage() {
  const [settings, setSettings] = useState(defaultClassConfig);
  const [classUrl, setClassUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function createClassLink(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setClassUrl("");
    try {
      const response = await fetch("/api/class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "학급 링크를 만들지 못했습니다.");
      setClassUrl(`${window.location.origin}/?class=${encodeURIComponent(data.token)}`);
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
        <Link className="brand" href="/">
          <span className="brand-mark">葉</span>
          <span>잎새 피드백</span>
          <small>LEAFBACK</small>
        </Link>
        <Link className="teacher-link" href="/">학생 화면 보기</Link>
      </header>

      <section className="teacher-page">
        <div className="teacher-intro">
          <div className="eyebrow"><span /> TEACHER STUDIO</div>
          <h1>우리 반의<br /><em>평가 기준을 만들어요.</em></h1>
          <p>API 키와 루브릭을 입력해 학급 전용 링크를 만드세요. 학생들은 받은 링크에서 바로 작품을 제출할 수 있습니다.</p>
          <div className="security-note">
            <strong>API 키는 안전하게 처리됩니다</strong>
            <p>입력한 설정은 서버에서 암호화되며 학생 화면에는 API 키가 표시되지 않습니다.</p>
          </div>
        </div>

        <form className="settings-form" onSubmit={createClassLink}>
          <div className="settings-title">
            <span>01</span>
            <div><h2>학급 평가 설정</h2><p>설정을 마치면 학생용 링크가 생성됩니다.</p></div>
          </div>
          <label className="field full">
            <span>학급 링크 이름 <b>*</b></span>
            <input value={settings.classTitle} onChange={(e) => setSettings({ ...settings, classTitle: e.target.value })} />
          </label>
          <label className="field full">
            <span>OpenAI API 키 <b>*</b></span>
            <input type="password" value={settings.apiKey} onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })} placeholder="sk-..." autoComplete="off" />
            <small>학생에게 전달되는 링크에는 암호화된 형태로만 포함됩니다.</small>
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
          {error && <div className="error-message">{error}</div>}
          <div className="settings-actions">
            <button type="button" className="text-button" onClick={() => setSettings({ ...defaultClassConfig, apiKey: settings.apiKey })}>기본 루브릭으로 되돌리기</button>
            <button className="primary-button save-button" disabled={loading}>{loading ? "암호화 링크 만드는 중..." : "학생용 학급 링크 만들기"}</button>
          </div>

          {classUrl && (
            <div className="class-link-result">
              <span>학급 링크가 준비됐어요</span>
              <strong>이 주소를 학생들에게 전달해 주세요.</strong>
              <div><input readOnly value={classUrl} /><button type="button" onClick={copyLink}>{copied ? "복사됨" : "링크 복사"}</button></div>
              <a href={classUrl} target="_blank" rel="noreferrer">학생 화면 미리 보기 →</a>
              <p>API 키나 루브릭을 바꾸려면 새 링크를 만들어 다시 전달해 주세요.</p>
            </div>
          )}
        </form>
      </section>
      <footer>LEAFBACK · 교사용 평가 설정</footer>
    </main>
  );
}
