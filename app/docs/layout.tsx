import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "잎새 피드백 | Google Docs AI 평가",
  description: "교사의 루브릭에 따라 학생의 Google Docs 글을 평가하는 AI 피드백 도구",
};

export default function GoogleDocsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
