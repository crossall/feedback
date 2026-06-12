"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { isTeacherId } from "@/lib/teacher-evaluations";

export default function TeacherLanding() {
  const router = useRouter();
  const [teacherId, setTeacherId] = useState("");
  const [error, setError] = useState("");

  function enterStudio(event: FormEvent) {
    event.preventDefault();
    if (!isTeacherId(teacherId)) {
      setError("등록된 4자리 교사 ID를 확인해 주세요.");
      return;
    }
    router.push(`/teacher/${teacherId}`);
  }

  return (
    <main className="platform-home">
      <header className="site-header platform-header">
        <div className="brand">
          <span className="brand-mark">葉</span>
          <span>잎새 피드백</span>
          <small>LEAFBACK</small>
        </div>
        <span className="platform-badge">TEACHER PLATFORM</span>
      </header>

      <section className="platform-hero">
        <div className="platform-copy">
          <div className="eyebrow"><span /> FEEDBACK, READY TO GROW</div>
          <h1>평가를 만들고,<br /><em>다시 꺼내 쓰세요.</em></h1>
          <p>
            PDF와 Google Docs 과제를 위한 평가 기준을 만들고 학생용 링크로
            나눠 주세요. 저장한 평가는 교사 보관함에서 언제든 이어서 사용할 수 있습니다.
          </p>
          <div className="platform-points">
            <span>평가 기준 저장</span>
            <span>학생 링크 생성</span>
            <span>PDF · DOCS 지원</span>
          </div>
        </div>

        <form className="teacher-login-card" onSubmit={enterStudio}>
          <span className="login-number">01</span>
          <p className="login-kicker">교사 스튜디오 입장</p>
          <h2>나의 평가 보관함으로</h2>
          <p>발급받은 4자리 교사 ID를 입력해 주세요.</p>
          <label>
            <span>교사 ID</span>
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
              autoFocus
            />
          </label>
          {error && <div className="error-message">{error}</div>}
          <button className="primary-button">보관함 들어가기 <span className="arrow">→</span></button>
          <small>현재 등록된 교사 ID: 4523, 6556</small>
        </form>
      </section>
      <footer>LEAFBACK · TEACHER FEEDBACK PLATFORM</footer>
    </main>
  );
}
