import Link from "next/link";
import { ArrowLeft, FileLock2, ShieldCheck } from "lucide-react";

export default function StudentSubmissionNotice({ kind }: { kind: "pdf" | "docs" }) {
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
        <div className="eyebrow"><span /> {kind === "pdf" ? "PDF REVIEW" : "GOOGLE DOCS REVIEW"}</div>
        <h1>학생이 직접<br /><em>작품을 제출하지 않아요.</em></h1>
        <p>개인정보 보호를 위해 학생용 제출 링크 운영을 중단했습니다. 선생님이 {kind === "pdf" ? "PDF 작품을 직접 올려" : "수집한 Google Docs 주소로"} 평가를 진행합니다.</p>
        <div className="peer-transition-notice">
          <FileLock2 size={22} aria-hidden="true" />
          <div>
            <strong>이 주소에서는 학생 정보와 작품을 입력받지 않습니다.</strong>
            <span>평가 결과와 전달 방법은 담당 선생님께 확인해 주세요.</span>
          </div>
        </div>
        <div className="student-transition-privacy">
          <ShieldCheck size={17} aria-hidden="true" />
          <span>기존 학생 제출 기능은 복구 가능한 상태로 안전하게 보관되어 있습니다.</span>
        </div>
        <Link className="secondary-button peer-transition-back" href="/">
          <ArrowLeft size={16} aria-hidden="true" />
          처음으로
        </Link>
      </section>
    </main>
  );
}
