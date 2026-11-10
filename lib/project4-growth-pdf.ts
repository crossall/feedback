import type { Project4GrowthArea, Project4GrowthReport } from "@/lib/project4";

type JsPdf = import("jspdf").jsPDF;

const PAGE_WIDTH = 210;
const MARGIN_X = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const COLORS = {
  navy: "#344457",
  navyDark: "#283441",
  teal: "#5A7471",
  tealPale: "#EEF2F1",
  bluePale: "#F1F3F5",
  coral: "#846B64",
  coralPale: "#F4F1F0",
  gold: "#8B7C62",
  warmPale: "#F5F2ED",
  sky: "#687887",
  skyPale: "#F1F3F4",
  sage: "#718076",
  sagePale: "#F1F3F1",
  olive: "#68705B",
  olivePale: "#F1F2ED",
  ink: "#2D333A",
  muted: "#737980",
  line: "#D8DCE0",
  white: "#FFFFFF",
} as const;

const AREA_COLORS = [COLORS.navy, COLORS.teal, COLORS.coral, COLORS.gold, COLORS.sky, COLORS.sage, COLORS.olive];
const AREA_PALES = [COLORS.bluePale, COLORS.tealPale, COLORS.coralPale, COLORS.warmPale, COLORS.skyPale, COLORS.sagePale, COLORS.olivePale];
const LEVELS = ["상", "중", "하"] as const;
const FONT_REGULAR_FILE = "NanumGothic-Regular.ttf";
const FONT_BOLD_FILE = "NanumGothic-Bold.ttf";
const FONT_FAMILY = "GrowthNanum";

let fontDataPromise: Promise<{ regular: string; bold: string }> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)));
  }
  return btoa(chunks.join(""));
}

async function loadFonts() {
  if (!fontDataPromise) {
    fontDataPromise = Promise.all([
      fetch("/fonts/nanum-gothic/NanumGothic-Regular.ttf"),
      fetch("/fonts/nanum-gothic/NanumGothic-Bold.ttf"),
    ]).then(async ([regularResponse, boldResponse]) => {
      if (!regularResponse.ok || !boldResponse.ok) {
        throw new Error("PDF용 한글 글꼴을 불러오지 못했습니다.");
      }
      const [regular, bold] = await Promise.all([
        regularResponse.arrayBuffer(),
        boldResponse.arrayBuffer(),
      ]);
      return {
        regular: arrayBufferToBase64(regular),
        bold: arrayBufferToBase64(bold),
      };
    }).catch((error) => {
      fontDataPromise = null;
      throw error;
    });
  }
  return fontDataPromise;
}

function configureFonts(doc: JsPdf, fonts: { regular: string; bold: string }) {
  doc.addFileToVFS(FONT_REGULAR_FILE, fonts.regular);
  doc.addFileToVFS(FONT_BOLD_FILE, fonts.bold);
  doc.addFont(FONT_REGULAR_FILE, FONT_FAMILY, "normal", undefined, "Identity-H");
  doc.addFont(FONT_BOLD_FILE, FONT_FAMILY, "bold", undefined, "Identity-H");
}

function setFont(doc: JsPdf, weight: "normal" | "bold", size: number, color: string = COLORS.ink) {
  doc.setFont(FONT_FAMILY, weight);
  doc.setFontSize(size);
  doc.setTextColor(color);
}

function centerText(doc: JsPdf, text: string, x: number, y: number) {
  doc.text(text, x, y, { align: "center", baseline: "middle" });
}

function rightText(doc: JsPdf, text: string, x: number, y: number) {
  doc.text(text, x, y, { align: "right", baseline: "middle" });
}

function clampLine(doc: JsPdf, value: string, width: number) {
  let line = value.trimEnd();
  if (doc.getTextWidth(line) <= width) return line;
  while (line.length > 1 && doc.getTextWidth(`${line}…`) > width) {
    line = line.slice(0, -1).trimEnd();
  }
  return `${line}…`;
}

function wrappedLines(doc: JsPdf, value: string, width: number, maxLines: number) {
  const normalized = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [""];
  const lines = normalized.split("\n").flatMap((part) => doc.splitTextToSize(part || " ", width) as string[]);
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  visible[maxLines - 1] = clampLine(doc, `${visible[maxLines - 1]}…`, width);
  return visible;
}

function paragraph(doc: JsPdf, options: {
  text: string;
  x: number;
  y: number;
  width: number;
  maxLines: number;
  size: number;
  lineHeight: number;
  weight?: "normal" | "bold";
  color?: string;
  align?: "left" | "center" | "right";
}) {
  setFont(doc, options.weight || "normal", options.size, options.color || COLORS.ink);
  const lines = wrappedLines(doc, options.text, options.width, options.maxLines);
  lines.forEach((line, index) => {
    const align = options.align || "left";
    const x = align === "center" ? options.x + options.width / 2 : align === "right" ? options.x + options.width : options.x;
    doc.text(line, x, options.y + index * options.lineHeight, { align, baseline: "top" });
  });
}

function classLabel(value: string) {
  const numbers = value.match(/\d+/g) || [];
  const number = value.match(/6학년\s*(\d+)반/)?.[1] || numbers[numbers.length - 1];
  return number ? `6학년 ${number}반` : value;
}

function drawHeader(doc: JsPdf, report: Project4GrowthReport, page: number) {
  const firstPage = page === 1;
  setFont(doc, "bold", 7.4, COLORS.teal);
  doc.text(firstPage ? "2026학년도 6학년 과학 · 과정중심평가 개인 성장 보고서" : "개인 성장 보고서 · 영역별 성장 기록", MARGIN_X, 16, { baseline: "middle" });

  setFont(doc, "bold", firstPage ? 20 : 17, COLORS.navyDark);
  doc.text(firstPage ? "계절의 변화 프로젝트" : "배움의 과정, 이렇게 성장했어요", MARGIN_X, firstPage ? 27 : 26, { baseline: "middle" });

  setFont(doc, "normal", 8.2, COLORS.muted);
  doc.text(firstPage ? "「계절의 비밀을 찾아서」 · 2026학년도 2학기 · 성취기준 [6과13-03]" : "일곱 영역에서 확인한 성장과 다음 실천", MARGIN_X, 37, { baseline: "middle" });

  const badgeWidth = 42;
  const badgeHeight = 21;
  const badgeX = PAGE_WIDTH - MARGIN_X - badgeWidth;
  const badgeY = 14.5;
  const badgeCenterX = badgeX + badgeWidth / 2;
  doc.setFillColor(COLORS.bluePale);
  doc.setDrawColor(COLORS.line);
  doc.setLineWidth(0.35);
  doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 2.5, 2.5, "FD");
  setFont(doc, "normal", 7.2, COLORS.muted);
  centerText(doc, `${classLabel(report.className)} · ${report.groupName}`, badgeCenterX, badgeY + 7);
  setFont(doc, "bold", 12.5, COLORS.navyDark);
  centerText(doc, report.studentName, badgeCenterX, badgeY + 15.5);

  doc.setDrawColor(COLORS.navy);
  doc.setLineWidth(1.3);
  doc.line(MARGIN_X, 43, PAGE_WIDTH - MARGIN_X, 43);
}

function drawFooter(doc: JsPdf, page: number) {
  doc.setDrawColor(COLORS.line);
  doc.setLineWidth(0.35);
  doc.line(MARGIN_X, 286, PAGE_WIDTH - MARGIN_X, 286);
  setFont(doc, "normal", 6.6, COLORS.muted);
  doc.text("6학년 과학 · 담당 교사 전혜리", MARGIN_X, 290.2, { baseline: "middle" });
  setFont(doc, "bold", 6.6, COLORS.teal);
  centerText(doc, "FEEDFORWARD", PAGE_WIDTH / 2, 290.2);
  setFont(doc, "normal", 6.6, COLORS.muted);
  rightText(doc, `${page} / 2`, PAGE_WIDTH - MARGIN_X, 290.2);
}

function drawSectionTitle(doc: JsPdf, number: number, title: string, top: number) {
  const centerX = MARGIN_X + 3.2;
  const centerY = top + 2.8;
  doc.setFillColor(COLORS.navy);
  doc.circle(centerX, centerY, 3.2, "F");
  setFont(doc, "bold", 7.4, COLORS.white);
  centerText(doc, String(number), centerX, centerY + 0.1);
  setFont(doc, "bold", 12, COLORS.navyDark);
  doc.text(title, MARGIN_X + 8, top + 2.8, { baseline: "middle" });
}

function drawSummary(doc: JsPdf, report: Project4GrowthReport) {
  const x = MARGIN_X;
  const y = 49;
  const height = 39;
  const leftWidth = 37;
  doc.setFillColor(COLORS.bluePale);
  doc.setDrawColor(COLORS.bluePale);
  doc.roundedRect(x, y, CONTENT_WIDTH, height, 4, 4, "FD");

  doc.setDrawColor("#D7DFE8");
  doc.setLineWidth(0.35);
  doc.line(x + leftWidth, y + 5, x + leftWidth, y + height - 5);
  setFont(doc, "normal", 7.2, COLORS.muted);
  centerText(doc, "종합 결과", x + leftWidth / 2, y + 8);
  setFont(doc, "bold", 30, COLORS.navy);
  centerText(doc, report.overallLevel, x + leftWidth / 2, y + 20.5);

  const scaleWidth = 8;
  const scaleGap = 1.5;
  const scaleX = x + (leftWidth - (scaleWidth * 3 + scaleGap * 2)) / 2;
  LEVELS.forEach((level, index) => {
    const active = level === report.overallLevel;
    const boxX = scaleX + index * (scaleWidth + scaleGap);
    doc.setFillColor(active ? COLORS.navy : COLORS.white);
    doc.setDrawColor(active ? COLORS.navy : COLORS.line);
    doc.setLineWidth(0.35);
    doc.roundedRect(boxX, y + 28, scaleWidth, 6, 1.2, 1.2, "FD");
    setFont(doc, active ? "bold" : "normal", 6.8, active ? COLORS.white : COLORS.muted);
    centerText(doc, level, boxX + scaleWidth / 2, y + 31.2);
  });

  const textX = x + leftWidth + 6;
  const textWidth = CONTENT_WIDTH - leftWidth - 12;
  paragraph(doc, { text: report.overallHeadline, x: textX, y: y + 6, width: textWidth, maxLines: 2, size: 10.6, lineHeight: 5, weight: "bold", color: COLORS.navyDark });
  paragraph(doc, { text: report.overallFeedback, x: textX, y: y + 16.5, width: textWidth, maxLines: 3, size: 8.3, lineHeight: 4.2 });
  paragraph(doc, { text: "피드백 문장은 성장의 근거를 설명하고, 상·중·하는 현재 도달 수준을 요약합니다.", x: textX, y: y + 33, width: textWidth, maxLines: 1, size: 6.5, lineHeight: 3, color: COLORS.muted });
}

function drawJourney(doc: JsPdf, report: Project4GrowthReport) {
  const top = 104;
  const gap = 1.6;
  const boxWidth = (CONTENT_WIDTH - gap * (report.areas.length - 1)) / report.areas.length;
  const boxHeight = 25;
  report.areas.forEach((area, index) => {
    const x = MARGIN_X + index * (boxWidth + gap);
    const accent = AREA_COLORS[index];
    doc.setFillColor(AREA_PALES[index]);
    doc.setDrawColor(accent);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, top, boxWidth, boxHeight, 2.5, 2.5, "FD");
    doc.setFillColor(accent);
    doc.circle(x + boxWidth / 2, top + 5, 2.6, "F");
    setFont(doc, "bold", 6.6, COLORS.white);
    centerText(doc, String(index + 1), x + boxWidth / 2, top + 5.1);
    paragraph(doc, { text: area.title, x: x + 1.5, y: top + 10, width: boxWidth - 3, maxLines: 2, size: report.areas.length > 6 ? 6.4 : 7.2, lineHeight: 3.4, weight: "bold", align: "center" });
    setFont(doc, "bold", 8.2, accent);
    centerText(doc, area.level, x + boxWidth / 2, top + 21);
  });
}

function drawLevelScale(doc: JsPdf, selected: string, x: number, y: number, width: number, accent: string) {
  setFont(doc, "bold", 6.8, COLORS.muted);
  centerText(doc, "현재 수준", x + width / 2, y + 2.5);
  const boxHeight = 6.2;
  const gap = 1.2;
  LEVELS.forEach((level, index) => {
    const boxY = y + 6 + index * (boxHeight + gap);
    const active = level === selected;
    doc.setFillColor(active ? accent : COLORS.white);
    doc.setDrawColor(active ? accent : COLORS.line);
    doc.setLineWidth(0.35);
    doc.roundedRect(x, boxY, width, boxHeight, 1.6, 1.6, "FD");
    setFont(doc, active ? "bold" : "normal", 8, active ? COLORS.white : COLORS.muted);
    centerText(doc, level, x + width / 2, boxY + boxHeight / 2 + 0.1);
  });
}

function drawAreaCard(doc: JsPdf, area: Project4GrowthArea, index: number, top: number) {
  const x = MARGIN_X;
  const height = 38;
  const accent = AREA_COLORS[index];
  const pale = AREA_PALES[index];
  doc.setFillColor(COLORS.white);
  doc.setDrawColor(COLORS.line);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, top, CONTENT_WIDTH, height, 3.2, 3.2, "FD");
  doc.setFillColor(accent);
  doc.roundedRect(x, top, 4.2, height, 3.2, 3.2, "F");
  doc.rect(x + 2.2, top, 2, height, "F");

  const leftX = x + 9;
  const centerX = x + 57;
  const levelX = x + CONTENT_WIDTH - 22;
  const dividerX = centerX - 4;
  const titleX = leftX + 8;
  const titleWidth = dividerX - titleX - 2;
  const sourceWidth = dividerX - leftX - 2;
  doc.setDrawColor(COLORS.line);
  doc.setLineWidth(0.25);
  doc.line(dividerX, top + 5, dividerX, top + height - 5);
  doc.line(levelX - 3, top + 5, levelX - 3, top + height - 5);

  doc.setFillColor(accent);
  doc.circle(leftX + 3.2, top + 8, 3.2, "F");
  setFont(doc, "bold", 7.2, COLORS.white);
  centerText(doc, String(index + 1), leftX + 3.2, top + 8.1);
  paragraph(doc, { text: area.title, x: titleX, y: top + 6, width: titleWidth, maxLines: 2, size: 10.2, lineHeight: 4.4, weight: "bold" });

  doc.setFillColor(pale);
  doc.setDrawColor(pale);
  doc.roundedRect(leftX, top + 22, sourceWidth, 10, 2, 2, "FD");
  paragraph(doc, { text: "평가 자료", x: leftX + 3, y: top + 23.5, width: sourceWidth - 6, maxLines: 1, size: 6.5, lineHeight: 3, weight: "bold", color: accent });
  paragraph(doc, { text: area.source, x: leftX + 3, y: top + 27, width: sourceWidth - 6, maxLines: 2, size: 6.8, lineHeight: 3.1, color: COLORS.muted });

  setFont(doc, "bold", 6.8, accent);
  doc.text("피드백", centerX, top + 6, { baseline: "middle" });
  paragraph(doc, { text: area.feedback, x: centerX, y: top + 11, width: levelX - centerX - 5, maxLines: 5, size: 8, lineHeight: 4 });
  drawLevelScale(doc, area.level, levelX, top + 4, 17, accent);
}

function drawResponseBoxes(doc: JsPdf, report: Project4GrowthReport) {
  const top = 242;
  const height = 37;
  const gap = 4;
  const width = (CONTENT_WIDTH - gap) / 2;
  const cards = [
    {
      title: "피드백 성찰",
      prompt: "피드백을 읽고 알게 된 점과 다음에 실천할 점을 직접 써 보세요.",
      accent: COLORS.teal,
      pale: COLORS.tealPale,
    },
    {
      title: "가정에서 보내는 의견",
      prompt: report.parentPrompt,
      accent: COLORS.gold,
      pale: COLORS.warmPale,
    },
  ];

  cards.forEach((card, index) => {
    const x = MARGIN_X + index * (width + gap);
    doc.setFillColor(COLORS.white);
    doc.setDrawColor(card.accent);
    doc.setLineWidth(0.4);
    doc.roundedRect(x, top, width, height, 3, 3, "FD");
    doc.setFillColor(card.pale);
    doc.roundedRect(x + 4, top + 3.5, width - 8, 7, 1.5, 1.5, "F");
    paragraph(doc, { text: card.title, x: x + 7, y: top + 5, width: width - 14, maxLines: 1, size: 8.8, lineHeight: 4, weight: "bold", color: card.accent });
    paragraph(doc, { text: card.prompt, x: x + 5, y: top + 12, width: width - 10, maxLines: 2, size: 6.6, lineHeight: 3.4, color: COLORS.muted });
    doc.setDrawColor(index === 0 ? "#AABDBA" : "#B8B2A4");
    doc.setLineWidth(0.25);
    [23, 29.5, 36].forEach((offset) => doc.line(x + 5, top + offset, x + width - 5, top + offset));
  });
}

function drawFirstPage(doc: JsPdf, report: Project4GrowthReport) {
  drawHeader(doc, report, 1);
  drawSummary(doc, report);
  drawSectionTitle(doc, 1, "나의 배움 여정", 92);
  drawJourney(doc, report);
  drawSectionTitle(doc, 2, "영역별 성장 기록 · 1", 132);
  drawAreaCard(doc, report.areas[0], 0, 144);
  drawAreaCard(doc, report.areas[1], 1, 186);
  drawAreaCard(doc, report.areas[2], 2, 228);
  drawFooter(doc, 1);
}

function drawSecondPage(doc: JsPdf, report: Project4GrowthReport) {
  drawHeader(doc, report, 2);
  drawSectionTitle(doc, 2, "영역별 성장 기록 · 2", 50);
  drawAreaCard(doc, report.areas[3], 3, 61);
  drawAreaCard(doc, report.areas[4], 4, 103);
  drawAreaCard(doc, report.areas[5], 5, 145);
  drawAreaCard(doc, report.areas[6], 6, 187);
  drawSectionTitle(doc, 3, "피드백 성찰과 가정의 의견", 233);
  drawResponseBoxes(doc, report);
  drawFooter(doc, 2);
}

export async function saveProject4GrowthReportsPdf(
  reports: Project4GrowthReport[],
  fileName: string,
  onProgress?: (completed: number, total: number) => void,
) {
  if (reports.length === 0) throw new Error("PDF로 만들 성장보고서가 없습니다.");
  if (reports.some((report) => report.areas.length !== 7)) {
    throw new Error("성장보고서의 일곱 평가 영역을 확인해 주세요.");
  }
  const [{ jsPDF }, fonts] = await Promise.all([import("jspdf"), loadFonts()]);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true, putOnlyUsedFonts: true });
  configureFonts(doc, fonts);
  doc.setProperties({
    title: reports.length === 1 ? `${reports[0].studentName} 개인 성장 보고서` : `${classLabel(reports[0].className)} 개인 성장 보고서`,
    author: "Feedforward",
    subject: "Project 4 개인 성장 보고서",
  });
  const total = reports.length * 2;
  let completed = 0;
  reports.forEach((report, index) => {
    if (index > 0) doc.addPage("a4", "portrait");
    drawFirstPage(doc, report);
    completed += 1;
    onProgress?.(completed, total);
    doc.addPage("a4", "portrait");
    drawSecondPage(doc, report);
    completed += 1;
    onProgress?.(completed, total);
  });
  doc.save(fileName);
}
