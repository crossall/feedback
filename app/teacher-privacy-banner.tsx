import { ShieldAlert } from "lucide-react";

export default function TeacherPrivacyBanner({ kind }: { kind: "pdf" | "docs" }) {
  return (
    <section className="teacher-privacy-banner" aria-label="학생 개인정보 보호 안내">
      <ShieldAlert size={21} aria-hidden="true" />
      <div>
        <strong>평가 전에 학생 개인정보를 제거해 주세요.</strong>
        <p>
          {kind === "pdf" ? "PDF 파일명과 결과물 본문" : "Google Docs 제목과 문서 본문"}에서
          학생 실명, 학번, 연락처, 학교명, 얼굴 사진 등 개인을 알아볼 수 있는 정보를 지우고
          가명이나 식별 번호를 사용해 주세요.
        </p>
      </div>
    </section>
  );
}
