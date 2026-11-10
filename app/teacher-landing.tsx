"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { projectTemplateInfo } from "@/lib/project-instances";

export default function TeacherLanding() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function enterStudio(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("이름을 두 글자 이상 입력해 주세요.");
      return;
    }
    if (!/^\d{4}$/.test(teacherId)) {
      setError("번호는 숫자 4자리로 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/teachers/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, name, teacherId }),
      });
      const data = await response.json() as { teacherId?: string; error?: string };
      if (!response.ok || !data.teacherId) {
        throw new Error(data.error || "교사 계정을 확인하지 못했습니다.");
      }
      router.push(`/teacher/${data.teacherId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "교사 계정을 확인하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function changeMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setError("");
  }

  return (
    <main className="platform-home">
      <header className="site-header platform-header">
        <div className="brand">
          <span className="brand-mark">葉</span>
          <span>잎새 피드백</span>
          <small>LEAFBACK</small>
        </div>
        <nav className="platform-nav" aria-label="홈 메뉴">
          <Link href="/privacy">개인정보 처리방침</Link>
          <span className="platform-teacher-only"><ShieldCheck size={14} aria-hidden="true" /> 교사 전용 사이트 · 학생용이 아닙니다</span>
        </nav>
      </header>

      <section className="platform-hero">
        <div className="platform-copy">
          <div className="eyebrow"><span /> FEEDBACK, READY TO GROW</div>
          <h1>평가를 만들고,<br /><em>다시 꺼내 쓰세요.</em></h1>
          <p>
            PDF와 Google Docs 과제의 기준을 만든 뒤 교사가 학생 작품을 직접 평가하세요.
            동료평가는 Google Form용 루브릭으로 만들 수 있습니다.
          </p>
          <div className="platform-points">
            <span>평가 기준 저장</span>
            <span>교사 직접 평가</span>
            <span>PDF · DOCS · PEER 지원</span>
          </div>
        </div>

        <form className="teacher-login-card" onSubmit={enterStudio}>
          <span className="login-number">01</span>
          <p className="login-kicker">교사 스튜디오 입장</p>
          <h2>{mode === "login" ? "나의 평가 보관함으로" : "새 보관함 만들기"}</h2>
          <p>{mode === "login"
            ? "등록한 이름과 4자리 번호를 모두 입력해 주세요."
            : "이름과 기억하기 쉬운 4자리 번호로 새 보관함을 만드세요."}</p>
          <div className="teacher-auth-mode" role="group" aria-label="교사 계정 방식">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>
              <LogIn size={15} aria-hidden="true" /> 로그인
            </button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")}>
              <UserPlus size={15} aria-hidden="true" /> 새로 만들기
            </button>
          </div>
          <label className="teacher-auth-text-field">
            <span>이름</span>
            <input
              type="text"
              autoComplete="name"
              maxLength={20}
              placeholder="이름을 입력하세요"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
              autoFocus
            />
          </label>
          <label className="teacher-auth-code-field">
            <span>4자리 번호</span>
            <input
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              placeholder="0000"
              value={teacherId}
              onChange={(event) => {
                setTeacherId(event.target.value.replace(/\D/g, "").slice(0, 4));
                setError("");
              }}
            />
          </label>
          {error && <div className="error-message">{error}</div>}
          <button className="primary-button" disabled={loading}>
            {loading ? "확인 중..." : mode === "login" ? "보관함 들어가기" : "내 보관함 만들기"}
            {!loading && <span className="arrow">→</span>}
          </button>
          <small>{mode === "login"
            ? "이름과 번호가 모두 일치해야 입장할 수 있습니다."
            : "번호는 다른 사용자와 겹치지 않는 숫자 4자리여야 합니다."}</small>
        </form>
      </section>
      <section className="platform-project-flows" aria-labelledby="project-flow-title">
        <div className="platform-flow-heading">
          <span>PROJECT WORKFLOWS</span>
          <h2 id="project-flow-title">완성된 평가 흐름을 내 수업으로 복사하세요.</h2>
          <p>로그인한 뒤 학생 개인정보 없이 복사하고, 내 주소와 내 API 키로 독립 운영할 수 있습니다.</p>
        </div>
        <div className="platform-flow-grid">
          {Object.entries(projectTemplateInfo).map(([id, flow]) => (
            <article key={id}>
              <small>{id.toUpperCase()}</small>
              <h3>{flow.label}</h3>
              <p>{flow.summary}</p>
              <ol>{flow.steps.map((step) => <li key={step}>{step}</li>)}</ol>
            </article>
          ))}
        </div>
      </section>
      <section className="platform-privacy-summary" aria-labelledby="platform-privacy-title">
        <div>
          <span>PRIVACY FIRST</span>
          <h2 id="platform-privacy-title">학생이 사이트에 직접 제출하지 않습니다.</h2>
          <p>
            PDF와 Google Docs 평가는 교사가 작품과 주소를 직접 입력하며, 학생 정보와 작품은 평가 요청에만 사용합니다.
            동료평가 응답은 교사가 만든 Google Form과 Google Drive에서 관리합니다.
          </p>
        </div>
        <Link className="privacy-summary-link" href="/privacy">개인정보 처리방침 보기</Link>
      </section>
      <footer>
        LEAFBACK · TEACHER FEEDBACK PLATFORM · <Link href="/privacy">개인정보 처리방침</Link>
      </footer>
    </main>
  );
}
