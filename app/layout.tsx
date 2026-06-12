import type { Metadata } from "next";
import { Gowun_Batang, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const display = Gowun_Batang({
  variable: "--font-display",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const body = Noto_Sans_KR({
  variable: "--font-body",
  weight: ["400", "500", "700", "800"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "잎새 피드백 | 교사용 AI 평가 플랫폼",
  description: "PDF와 Google Docs 과제의 평가 기준을 만들고 학생에게 제공하는 교사용 AI 피드백 플랫폼",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
