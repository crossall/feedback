import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export default function PeerEvaluationPage() {
  return (
    <main className="peer-transition-page">
      <header className="site-header">
        <Link className="brand" href="/">
          <span className="brand-mark">葉</span>
          <span>잎새 피드백</span>
          <small>LEAFBACK</small>
        </Link>
      </header>

      <section className="peer-transition-content">
        <div className="eyebrow"><span /> PEER EVALUATION</div>
        <h1>동료평가는<br /><em>Google Form에서 진행해요.</em></h1>
        <p>개인정보 보호를 위해 Feedforward에서는 학생 이름과 동료평가 응답을 직접 수집하지 않습니다. 선생님이 공유한 Google Form 링크로 접속해 주세요.</p>
        <div className="peer-transition-notice">
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <strong>기존 학생용 링크에서는 응답을 받지 않습니다.</strong>
            <span>Google Form 링크를 받지 못했다면 담당 선생님께 문의해 주세요.</span>
          </div>
        </div>
        <Link className="secondary-button peer-transition-back" href="/">
          <ArrowLeft size={16} aria-hidden="true" />
          처음으로
        </Link>
      </section>
    </main>
  );
}
