"use client";

import {
  downloadHtmlReport,
  openPdfReport,
  type ReportStudent,
} from "@/lib/evaluation-report";
import type { EvaluationResponse } from "@/lib/evaluation-result";

export default function EvaluationDelivery({
  result,
  student,
}: {
  result: EvaluationResponse;
  student: ReportStudent;
}) {
  const reportFormat = result.outputOptions.reportFormat;

  function receiveReport() {
    try {
      if (reportFormat === "html") {
        downloadHtmlReport(result, student);
      } else if (reportFormat === "pdf") {
        openPdfReport(result, student);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "보고서를 열지 못했습니다.");
    }
  }

  return (
    <section className="delivery-panel">
      {result.delivery?.googleDocsAppended && (
        <div className="delivery-status success">
          <strong>Google Docs에 평가를 추가했어요.</strong>
          <span>제출한 문서의 마지막 부분을 확인해 주세요.</span>
        </div>
      )}
      {result.delivery?.warning && (
        <div className="delivery-status warning">
          <strong>Google Docs에는 추가하지 못했어요.</strong>
          <span>{result.delivery.warning}</span>
        </div>
      )}
      {reportFormat !== "none" && (
        <button type="button" className="report-button" onClick={receiveReport}>
          <span>{reportFormat === "pdf" ? "PDF" : "HTML"}</span>
          <div>
            <strong>{reportFormat === "pdf" ? "PDF 보고서 저장" : "HTML 보고서 다운로드"}</strong>
            <small>
              {reportFormat === "pdf"
                ? "인쇄 창에서 대상을 ‘PDF로 저장’으로 선택하세요."
                : "브라우저에서 열 수 있는 보고서 파일을 받습니다."}
            </small>
          </div>
          <b>↓</b>
        </button>
      )}
      {!result.outputOptions.showOnScreen
        && reportFormat === "none"
        && !result.delivery?.googleDocsAppended
        && !result.delivery?.warning && (
          <div className="delivery-status success">
            <strong>평가가 완료됐어요.</strong>
          </div>
        )}
    </section>
  );
}
