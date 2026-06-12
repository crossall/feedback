import type { Evaluation } from "./evaluation-result";

export type ReportStudent = {
  grade: string;
  className: string;
  name: string;
  team: string;
};

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function createEvaluationReportHtml(
  evaluation: Evaluation,
  student: ReportStudent,
) {
  const criteria = evaluation.criteria.map((item, index) => `
    <article class="criterion">
      <div class="criterion-head">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <h3>${escapeHtml(item.name)}</h3>
        <b>${item.score} / ${item.maxScore}</b>
      </div>
      <div class="bar"><i style="width:${Math.min(100, (item.score / item.maxScore) * 100)}%"></i></div>
      <p>${escapeHtml(item.feedback)}</p>
    </article>`).join("");
  const strengths = evaluation.strengths
    .map((text) => `<li>${escapeHtml(text)}</li>`)
    .join("");
  const improvements = evaluation.improvements
    .map((text) => `<li>${escapeHtml(text)}</li>`)
    .join("");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(student.name)} 학생 평가 보고서</title>
<style>
  *{box-sizing:border-box} body{margin:0;background:#f5f1e6;color:#17352b;font-family:"Noto Sans KR",Arial,sans-serif}
  .report{width:min(920px,calc(100% - 32px));margin:32px auto;background:#fffdf7;padding:48px;box-shadow:0 18px 60px rgba(50,61,45,.12)}
  header{display:flex;justify-content:space-between;gap:30px;padding-bottom:28px;border-bottom:2px solid #17352b}
  .brand{font-size:12px;letter-spacing:.18em;color:#4d7b5f;font-weight:800}.report h1{margin:8px 0 12px;font-size:32px}
  .student{color:#65736d;font-size:12px;line-height:1.7}.score{flex:0 0 110px;height:110px;border:8px solid #dce9a6;border-radius:50%;display:grid;place-content:center;text-align:center}
  .score strong{font-size:35px}.score small{color:#718078}.summary{margin:28px 0;padding:22px;background:#f1f5e8;line-height:1.75}
  .criteria{display:grid;grid-template-columns:1fr 1fr;gap:14px}.criterion{border:1px solid #d8ded3;padding:18px}
  .criterion-head{display:grid;grid-template-columns:25px 1fr auto;gap:8px;align-items:center}.criterion-head span{color:#bb6748;font-size:11px}.criterion h3{margin:0;font-size:13px}
  .bar{height:4px;background:#e9e9df;margin:12px 0}.bar i{display:block;height:100%;background:#4d7b5f}.criterion p{margin:0;color:#53635b;font-size:12px;line-height:1.65}
  .columns{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}.columns section{padding:20px;background:#f4f5ea}.columns section:last-child{background:#f8eee7}
  h2{margin:0 0 12px;font-size:18px}ul{margin:0;padding-left:20px}li{margin:8px 0;font-size:12px;line-height:1.55}
  .next{margin-top:18px;padding:20px;background:#17352b;color:white}.next small{display:block;color:#dce9a6;letter-spacing:.15em;margin-bottom:6px}
  footer{margin-top:25px;padding-top:15px;border-top:1px solid #d8ded3;color:#7c8982;font-size:9px;letter-spacing:.12em}
  @media print{body{background:white}.report{width:100%;margin:0;padding:24px;box-shadow:none}.criterion,.columns section{break-inside:avoid}}
  @media(max-width:650px){.report{padding:28px 20px}.criteria,.columns{grid-template-columns:1fr}}
</style>
</head>
<body>
<main class="report">
  <header>
    <div><div class="brand">LEAFBACK · AI FEEDBACK REPORT</div><h1>${escapeHtml(evaluation.title)}</h1>
    <div class="student">${escapeHtml(student.grade)} · ${escapeHtml(student.className)} · ${escapeHtml(student.name)} · ${escapeHtml(student.team)}</div></div>
    <div class="score"><strong>${evaluation.totalScore}</strong><small>/ ${evaluation.maxScore}</small></div>
  </header>
  <div class="summary">${escapeHtml(evaluation.summary)}</div>
  <section class="criteria">${criteria}</section>
  <div class="columns"><section><h2>잘한 점</h2><ul>${strengths}</ul></section><section><h2>다듬으면 더 좋아질 점</h2><ul>${improvements}</ul></section></div>
  <div class="next"><small>NEXT STEP</small><strong>${escapeHtml(evaluation.nextStep)}</strong></div>
  <footer>잎새 피드백 · 정해진 보고서 양식에 평가 결과를 자동 구성했습니다.</footer>
</main>
</body>
</html>`;
}

export function downloadHtmlReport(
  evaluation: Evaluation,
  student: ReportStudent,
) {
  const html = createEvaluationReportHtml(evaluation, student);
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${student.name}-평가-보고서.html`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function openPdfReport(
  evaluation: Evaluation,
  student: ReportStudent,
) {
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) throw new Error("팝업을 허용한 뒤 다시 시도해 주세요.");
  reportWindow.document.write(createEvaluationReportHtml(evaluation, student));
  reportWindow.document.close();
  window.setTimeout(() => reportWindow.print(), 300);
}
