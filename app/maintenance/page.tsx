import type { Metadata } from "next";
import Link from "next/link";
import { Construction, HardHat, ShieldCheck, Wrench } from "lucide-react";

export const metadata: Metadata = {
  title: "Under Construction",
  description: "현재 사이트는 공사중입니다.",
};

export default function MaintenancePage() {
  return (
    <main className="construction-page" aria-labelledby="construction-title">
      <section className="construction-shell">
        <div className="construction-tape" aria-hidden="true">
          <span>UNDER CONSTRUCTION</span>
          <span>UNDER CONSTRUCTION</span>
          <span>UNDER CONSTRUCTION</span>
        </div>

        <div className="construction-panel">
          <div className="construction-alert">
            <Construction size={26} strokeWidth={2} />
            <span>Site Notice</span>
          </div>

          <div className="construction-copy">
            <p className="construction-kicker">Temporary Shutdown</p>
            <h1 id="construction-title">Under Construction</h1>
            <strong>현재 사이트는 공사중입니다.</strong>
            <p>
              모든 페이지 접속이 잠시 닫혔습니다. 정비가 끝나면 다시 이용하실 수 있습니다.
            </p>
          </div>

          <div className="construction-status-grid" aria-label="현재 상태">
            <article>
              <HardHat size={18} strokeWidth={2} />
              <span>작업 상태</span>
              <strong>공사중</strong>
            </article>
            <article>
              <Wrench size={18} strokeWidth={2} />
              <span>페이지 상태</span>
              <strong>임시 폐쇄</strong>
            </article>
          </div>
        </div>

        <div className="construction-footer" aria-hidden="true">
          <span>403</span>
          <span>OFFLINE</span>
          <span>WORK IN PROGRESS</span>
        </div>

        <section className="construction-privacy-note" aria-labelledby="construction-privacy-title">
          <div className="construction-privacy-heading">
            <ShieldCheck size={18} strokeWidth={2} />
            <div>
              <span>Privacy Notice</span>
              <h2 id="construction-privacy-title">Feedforward 개인정보 처리방침</h2>
            </div>
          </div>
          <div className="construction-privacy-grid">
            <p>
              Feedforward는 학생 실명, 학번, 개인 이메일, 전화번호를 필수로 요구하지 않고
              별칭, 가명, 번호, 임시 라벨 등으로 참여할 수 있도록 운영합니다.
            </p>
            <p>
              학생 답안, 산출물, 자기평가, 동료평가, AI 피드백은 수업 피드백과 과정중심평가
              운영에 필요한 범위에서만 처리합니다.
            </p>
            <p>
              AI 피드백에는 학생을 직접 식별하는 정보를 보내지 않으며, 공개 페이지에는 운영자의
              개인 실명, 개인 이메일, 전화번호를 게시하지 않습니다.
            </p>
          </div>
          <p className="construction-privacy-small">
            문의, 열람, 정정, 삭제, 처리정지 요청은 담당 교사 또는 학교에서 안내한 공식 경로로
            접수합니다. 자세한 내용은 개인정보 처리방침 전문에서 확인할 수 있습니다.
          </p>
          <Link className="construction-privacy-link" href="/privacy">
            개인정보 처리방침 전문 보기
          </Link>
        </section>
      </section>
    </main>
  );
}
