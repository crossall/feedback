import type {
  PeerEvaluationConfig,
  PeerEvaluationMode,
  PeerEvaluationResponse,
  PeerQuestion,
} from "./peer-evaluation";
import { isScoredQuestion } from "./rubric-levels";

export type PeerReportScore = {
  question: PeerQuestion;
  average: number;
  count: number;
};

export type PeerReportComment = {
  question: PeerQuestion;
  comments: {
    text: string;
    respondentName: string;
    respondentTeam?: number;
  }[];
};

export type PeerReportTarget = {
  key: string;
  label: string;
  mode: PeerEvaluationMode;
  responses: PeerEvaluationResponse[];
  responseCount: number;
  scoreAverage: number;
  scoreMax: number;
  scores: PeerReportScore[];
  comments: PeerReportComment[];
};

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function targetKey(response: PeerEvaluationResponse) {
  if (response.mode === "team") return `team:${response.target.teamNumber ?? "unknown"}`;
  return `student:${response.target.name?.trim() ?? "unknown"}`;
}

function targetLabel(response: PeerEvaluationResponse) {
  if (response.mode === "team") return `${response.target.teamNumber ?? "미지정"}모둠`;
  return response.target.name?.trim() || "이름 미입력";
}

function answerValue(response: PeerEvaluationResponse, questionId: string) {
  return response.answers.find((answer) => answer.questionId === questionId)?.value;
}

export function buildPeerReportTargets(
  config: PeerEvaluationConfig,
  responses: PeerEvaluationResponse[],
) {
  const grouped = new Map<string, PeerEvaluationResponse[]>();
  for (const response of responses) {
    const key = targetKey(response);
    grouped.set(key, [...(grouped.get(key) ?? []), response]);
  }

  return Array.from(grouped.entries()).map(([key, targetResponses]) => {
    const first = targetResponses[0];
    const scores = config.questions
      .filter(isScoredQuestion)
      .map((question) => {
        const values = targetResponses
          .map((response) => answerValue(response, question.id))
          .filter((value): value is number => typeof value === "number");
        const average = values.length
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : 0;
        return { question, average, count: values.length };
      });
    const scoreMax = scores.reduce((sum, item) => sum + item.question.maxScore, 0);
    const scoreAverage = scores.length
      ? scores.reduce((sum, item) => sum + item.average, 0)
      : 0;
    const comments = config.questions
      .filter((question) => question.type === "text")
      .map((question) => ({
        question,
        comments: targetResponses
          .map((response) => ({
            text: String(answerValue(response, question.id) ?? "").trim(),
            respondentName: response.respondent.name,
            respondentTeam: response.respondent.teamNumber,
          }))
          .filter((comment) => comment.text),
      }));

    return {
      key,
      label: targetLabel(first),
      mode: first.mode,
      responses: targetResponses,
      responseCount: targetResponses.length,
      scoreAverage,
      scoreMax,
      scores,
      comments,
    };
  }).sort((a, b) => a.label.localeCompare(b.label, "ko-KR", { numeric: true }));
}

function csvCell(value: string | number | undefined) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function createPeerResponsesCsv(
  config: PeerEvaluationConfig,
  responses: PeerEvaluationResponse[],
) {
  const headers = [
    "제출 시간",
    "평가 방식",
    "평가자 학년",
    "평가자 반",
    "평가자 이름",
    "평가자 모둠",
    "평가 대상",
    ...config.questions.map((question) => question.prompt),
  ];
  const rows = responses.map((response) => [
    new Date(response.createdAt).toLocaleString("ko-KR"),
    response.mode === "team" ? "모둠 동료평가" : "개인 동료평가",
    response.respondent.grade,
    response.respondent.className,
    response.respondent.name,
    response.respondent.teamNumber ? `${response.respondent.teamNumber}모둠` : "",
    targetLabel(response),
    ...config.questions.map((question) => {
      const value = answerValue(response, question.id);
      return value === undefined ? "" : value;
    }),
  ]);
  return `\uFEFF${[headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")}`;
}

export function downloadPeerResponsesCsv(
  config: PeerEvaluationConfig,
  responses: PeerEvaluationResponse[],
) {
  const csv = createPeerResponsesCsv(config, responses);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${config.title}-동료평가-응답.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function createPeerReportHtml(
  config: PeerEvaluationConfig,
  target: PeerReportTarget,
) {
  const scoreCards = target.scores.map((score, index) => {
    const percent = score.question.maxScore
      ? Math.min(100, (score.average / score.question.maxScore) * 100)
      : 0;
    return `
    <article class="criterion">
      <div class="criterion-head">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <h3>${escapeHtml(score.question.prompt)}</h3>
        <b>${score.average.toFixed(1)} / ${score.question.maxScore}</b>
      </div>
      <div class="bar"><i style="width:${percent}%"></i></div>
      <p>${score.count}개 응답 평균</p>
    </article>`;
  }).join("");
  const commentSections = target.comments.map((group) => {
    const comments = group.comments.length
      ? group.comments.map((comment) => `
        <li>
          <p>${escapeHtml(comment.text)}</p>
          <small>${escapeHtml(comment.respondentName)}${comment.respondentTeam ? ` · ${comment.respondentTeam}모둠` : ""}</small>
        </li>`).join("")
      : "<li><p>아직 작성된 코멘트가 없습니다.</p></li>";
    return `<section><h2>${escapeHtml(group.question.prompt)}</h2><ul>${comments}</ul></section>`;
  }).join("");
  const evaluatedBy = target.responses
    .map((response) => `${response.respondent.name}${response.respondent.teamNumber ? `(${response.respondent.teamNumber}모둠)` : ""}`)
    .join(", ");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(target.label)} 동료평가 보고서</title>
<style>
  *{box-sizing:border-box} body{margin:0;background:#f5f1e6;color:#17352b;font-family:"Noto Sans KR",Arial,sans-serif}
  .report{width:min(920px,calc(100% - 32px));margin:32px auto;background:#fffdf7;padding:48px;box-shadow:0 18px 60px rgba(50,61,45,.12)}
  header{display:flex;justify-content:space-between;gap:30px;padding-bottom:28px;border-bottom:2px solid #17352b}
  .brand{font-size:12px;letter-spacing:.18em;color:#4d7b5f;font-weight:800}.report h1{margin:8px 0 12px;font-size:32px}
  .student{color:#65736d;font-size:12px;line-height:1.7}.score{flex:0 0 120px;height:120px;border:8px solid #dce9a6;border-radius:50%;display:grid;place-content:center;text-align:center}
  .score strong{font-size:33px}.score small{color:#718078}.summary{margin:28px 0;padding:22px;background:#f1f5e8;line-height:1.75;font-size:13px}
  .criteria{display:grid;grid-template-columns:1fr 1fr;gap:14px}.criterion{border:1px solid #d8ded3;padding:18px;break-inside:avoid}
  .criterion-head{display:grid;grid-template-columns:25px 1fr auto;gap:8px;align-items:center}.criterion-head span{color:#bb6748;font-size:11px}.criterion h3{margin:0;font-size:13px;line-height:1.45}
  .bar{height:4px;background:#e9e9df;margin:12px 0}.bar i{display:block;height:100%;background:#4d7b5f}.criterion p{margin:0;color:#53635b;font-size:12px;line-height:1.65}
  .comments{display:grid;gap:16px;margin-top:22px}.comments section{padding:20px;background:#f4f5ea;break-inside:avoid}
  h2{margin:0 0 12px;font-size:18px}ul{margin:0;padding-left:20px}li{margin:9px 0;font-size:12px;line-height:1.55}li p{margin:0 0 4px}li small{color:#718078}
  footer{margin-top:25px;padding-top:15px;border-top:1px solid #d8ded3;color:#7c8982;font-size:9px;letter-spacing:.12em}
  @media print{body{background:white}.report{width:100%;margin:0;padding:24px;box-shadow:none}}
  @media(max-width:650px){.report{padding:28px 20px}.criteria{grid-template-columns:1fr}header{display:block}.score{margin-top:18px}}
</style>
</head>
<body>
<main class="report">
  <header>
    <div><div class="brand">LEAFBACK · PEER REVIEW REPORT</div><h1>${escapeHtml(target.label)} 동료평가 보고서</h1>
    <div class="student">${escapeHtml(config.title)} · ${target.mode === "team" ? "모둠 동료평가" : "개인 동료평가"} · ${target.responseCount}개 응답</div></div>
    <div class="score"><strong>${target.scoreAverage.toFixed(1)}</strong><small>/ ${target.scoreMax || 0}</small></div>
  </header>
  <div class="summary">
    ${escapeHtml(target.label)}이 받은 동료평가 결과입니다. 점수는 점수형 문항 평균을 합산했으며,
    아래 코멘트에는 친구들이 남긴 서술형 응답을 함께 모았습니다.<br>
    평가 참여: ${escapeHtml(evaluatedBy || "응답 없음")}
  </div>
  <section class="criteria">${scoreCards || "<p>점수형 문항이 없습니다.</p>"}</section>
  <div class="comments">${commentSections || "<section><h2>친구들의 코멘트</h2><ul><li><p>서술형 문항이 없습니다.</p></li></ul></section>"}</div>
  <footer>잎새 피드백 · 동료평가 응답을 대상별로 자동 집계했습니다.</footer>
</main>
</body>
</html>`;
}

export function downloadPeerHtmlReport(
  config: PeerEvaluationConfig,
  target: PeerReportTarget,
) {
  const html = createPeerReportHtml(config, target);
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${target.label}-동료평가-보고서.html`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function openPeerPdfReport(
  config: PeerEvaluationConfig,
  target: PeerReportTarget,
) {
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) throw new Error("팝업을 허용한 뒤 다시 시도해 주세요.");
  reportWindow.document.write(createPeerReportHtml(config, target));
  reportWindow.document.close();
  window.setTimeout(() => reportWindow.print(), 300);
}
