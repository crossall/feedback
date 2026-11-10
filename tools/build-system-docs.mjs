import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const systemDir = path.join(root, "docs", "system");
const diagramDir = path.join(systemDir, "diagrams");
const manifestPath = path.join(systemDir, "system-map.json");
const checkOnly = process.argv.includes("--check");
const skipRaster = checkOnly || process.argv.includes("--no-raster");

const COLORS = {
  ink: "#17352B",
  muted: "#5D6B63",
  green: "#2D7254",
  greenSoft: "#E4F1EA",
  teal: "#287C7A",
  tealSoft: "#E1F1F0",
  orange: "#C86B2A",
  orangeSoft: "#FBEADA",
  violet: "#655CB0",
  violetSoft: "#ECEAF8",
  blue: "#315F83",
  blueSoft: "#E8F0F7",
  red: "#A4473E",
  redSoft: "#F8E9E6",
  paper: "#FFFDF8",
  canvas: "#F5F2E9",
  line: "#CBD5CE"
};

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function md(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function wrap(text, maxChars) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textLines(lines, x, y, className, lineHeight = 28, anchor = "start") {
  return lines.map((line, index) => (
    `<text x="${x}" y="${y + index * lineHeight}" class="${className}" text-anchor="${anchor}">${xml(line)}</text>`
  )).join("\n");
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await walk(absolute));
    else output.push(absolute);
  }
  return output;
}

async function discoverApiRoutes() {
  const apiDir = path.join(root, "app", "api");
  const files = (await walk(apiDir)).filter((file) => file.endsWith(`${path.sep}route.ts`));
  const routes = [];
  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    const relativeDir = path.relative(path.join(root, "app"), path.dirname(file)).split(path.sep).join("/");
    const methods = [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)]
      .map((match) => match[1]);
    const runtime = source.match(/export\s+const\s+runtime\s*=\s*["']([^"']+)["']/)?.[1] ?? "default";
    const maxDuration = source.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/)?.[1] ?? "-";
    routes.push({
      route: `/${relativeDir}`,
      methods: methods.join(", ") || "-",
      runtime,
      maxDuration,
      file: path.relative(root, file).split(path.sep).join("/")
    });
  }
  return routes.sort((a, b) => a.route.localeCompare(b.route, "ko"));
}

function buildInventory(manifest, routes) {
  const capabilities = manifest.capabilities.map((item) => (
    `| ${md(item.label)} | ${md(item.entry.join(", "))} | ${md(item.apis.join(", "))} | ${md(item.outcomes.join(", "))} |`
  )).join("\n");
  const routeRows = routes.map((item) => (
    `| ${md(item.route)} | ${md(item.methods)} | ${md(item.runtime)} | ${md(item.maxDuration)} | ${md(item.file)} |`
  )).join("\n");
  const flags = manifest.featureFlags.map((item) => (
    `| ${md(item.name)} | ${item.value ? "true" : "false"} | ${md(item.effect)} |`
  )).join("\n");
  const external = manifest.externalSystems.map((item) => (
    `| ${md(item.label)} | ${md(item.data)} |`
  )).join("\n");

  return `# Feedforward 시스템 자동 인벤토리

이 파일은 \`docs/system/system-map.json\`과 실제 \`app/api/**/route.ts\`를 읽어 생성합니다. 직접 편집하지 않습니다.

## 기능 영역

| 기능 | 화면 진입점 | 주요 API | 결과 |
| --- | --- | --- | --- |
${capabilities}

## Route Handler 목록

총 ${routes.length}개 Route Handler를 확인했습니다. Next.js 16에서 Route Handler는 공개 HTTP 경계이므로 각 경로에서 인증과 권한을 다시 확인해야 합니다.

| 경로 | 메서드 | 런타임 | 최대 실행시간 초 | 구현 파일 |
| --- | --- | --- | --- | --- |
${routeRows}

## 외부 시스템과 전송 데이터

| 외부 시스템 | 현재 전송 또는 저장 데이터 |
| --- | --- |
${external}

## 기능 플래그

| 이름 | 현재 값 | 영향 |
| --- | --- | --- |
${flags}
`;
}

function buildPipelineSvg(manifest) {
  const cards = manifest.commonPipeline.map((step, index) => {
    const row = index < 4 ? 0 : 1;
    const column = row === 0 ? index : 7 - index;
    const x = 72 + column * 455;
    const y = row === 0 ? 245 : 615;
    const palette = [
      [COLORS.green, COLORS.greenSoft],
      [COLORS.teal, COLORS.tealSoft],
      [COLORS.blue, COLORS.blueSoft],
      [COLORS.orange, COLORS.orangeSoft],
      [COLORS.violet, COLORS.violetSoft],
      [COLORS.red, COLORS.redSoft],
      [COLORS.blue, COLORS.blueSoft],
      [COLORS.green, COLORS.greenSoft]
    ][index];
    const detailLines = wrap(step.detail, 24).slice(0, 3);
    return `<g filter="url(#shadow)">
      <rect x="${x}" y="${y}" width="390" height="260" rx="26" fill="${COLORS.paper}" stroke="${COLORS.line}"/>
      <path d="M${x + 26} ${y} H${x + 364} Q${x + 390} ${y} ${x + 390} ${y + 26} V${y + 42} H${x} V${y + 26} Q${x} ${y} ${x + 26} ${y}Z" fill="${palette[1]}"/>
    </g>
    <circle cx="${x + 48}" cy="${y + 72}" r="28" fill="${palette[0]}"/>
    <text x="${x + 48}" y="${y + 80}" class="step" text-anchor="middle">${step.number}</text>
    <text x="${x + 90}" y="${y + 80}" class="cardTitle">${xml(step.label)}</text>
    ${textLines(detailLines, x + 34, y + 132, "body", 28)}
    <text x="${x + 34}" y="${y + 226}" class="owner">책임  ${xml(step.owner)}</text>`;
  }).join("\n");

  const topArrows = [0, 1, 2].map((index) => {
    const x1 = 72 + index * 455 + 400;
    const x2 = 72 + (index + 1) * 455 - 10;
    return `<path d="M${x1} 375 H${x2}" class="arrow"/>`;
  }).join("\n");
  const bottomArrows = [0, 1, 2].map((index) => {
    const x1 = 72 + (3 - index) * 455 - 10;
    const x2 = 72 + (2 - index) * 455 + 400;
    return `<path d="M${x1} 745 H${x2}" class="arrow"/>`;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" role="img" aria-labelledby="title desc">
  <title id="title">Feedforward 공통 평가 파이프라인</title>
  <desc id="desc">교사가 기준을 설계하고 서버가 검증과 권한 발급을 거쳐 수행을 수집한 뒤 분석, 사람의 판단, 결과 전달, 수정과 다음 수업으로 연결하는 여덟 단계 흐름</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F8F4EA"/><stop offset="1" stop-color="#EEF4EF"/></linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#17352B" flood-opacity=".10"/></filter>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#789184"/></marker>
    <style>
      text{font-family:"NanumGothic","Malgun Gothic",sans-serif}.eyebrow{font-size:17px;font-weight:700;letter-spacing:2px;fill:#2D7254}.title{font-size:51px;font-weight:700;fill:#17352B}.subtitle{font-size:23px;fill:#5D6B63}.cardTitle{font-size:27px;font-weight:700;fill:#17352B}.body{font-size:18px;fill:#4E5E55}.owner{font-size:16px;font-weight:700;fill:#5D6B63}.step{font-size:22px;font-weight:700;fill:white}.arrow{fill:none;stroke:#789184;stroke-width:4;stroke-linecap:round;marker-end:url(#arrow)}.loop{font-size:17px;font-weight:700;fill:#2D7254}
    </style>
  </defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <circle cx="1820" cy="85" r="220" fill="#DCE9A6" opacity=".2"/><circle cx="60" cy="1020" r="180" fill="#DFF1F0" opacity=".45"/>
  <text x="72" y="68" class="eyebrow">FEEDFORWARD SYSTEM PIPELINE</text>
  <text x="72" y="132" class="title">기준에서 다음 행동까지 이어지는 평가 파이프라인</text>
  <text x="72" y="178" class="subtitle">AI 분석은 가운데 단계이며, 시작과 끝의 책임은 교사와 학생에게 있습니다</text>
  ${topArrows}
  <path d="M1817 505 C1880 505 1880 615 1817 615" class="arrow"/>
  ${bottomArrows}
  ${cards}
  <path d="M72 875 C72 1000 700 1010 960 1010 C1220 1010 1792 990 1792 875" fill="none" stroke="#2D7254" stroke-width="4" stroke-dasharray="10 11" marker-end="url(#arrow)"/>
  <rect x="590" y="948" width="740" height="70" rx="35" fill="#FFFDF8" stroke="#BFD0C5"/>
  <text x="960" y="990" class="loop" text-anchor="middle">결과를 다음 과제와 루브릭 설계에 되돌려 수업을 개선합니다</text>
  <text x="1848" y="1050" class="owner" text-anchor="end">Source  docs/system/system-map.json</text>
</svg>`;
}

function buildArchitectureSvg(manifest) {
  const capabilityCards = manifest.capabilities.map((item, index) => {
    const x = 90 + (index % 3) * 585;
    const y = 235 + Math.floor(index / 3) * 152;
    const colors = [COLORS.greenSoft, COLORS.tealSoft, COLORS.orangeSoft, COLORS.violetSoft, COLORS.blueSoft, COLORS.redSoft];
    return `<g><rect x="${x}" y="${y}" width="530" height="118" rx="20" fill="${colors[index]}" stroke="${COLORS.line}"/>
      <text x="${x + 28}" y="${y + 43}" class="boxTitle">${xml(item.label)}</text>
      ${textLines(wrap(item.outcomes.join(" · "), 43).slice(0, 2), x + 28, y + 76, "small", 23)}
    </g>`;
  }).join("\n");

  const external = manifest.externalSystems.map((item, index) => {
    const x = 90 + index * 435;
    return `<g><rect x="${x}" y="940" width="390" height="112" rx="20" fill="#FFFDF8" stroke="#CBD5CE"/>
      <text x="${x + 24}" y="982" class="boxTitle smallTitle">${xml(item.label)}</text>
      ${textLines(wrap(item.data, 34).slice(0, 2), x + 24, 1014, "tiny", 20)}
    </g>`;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1150" viewBox="0 0 1920 1150" role="img" aria-labelledby="title desc">
  <title id="title">Feedforward 시스템 구조도</title>
  <desc id="desc">교사와 학생 브라우저, Next.js 화면과 API, 도메인 서비스, 비공개 저장소, 외부 AI와 Google 서비스 사이의 계층과 신뢰 경계를 보여 주는 구조도</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F8F4EA"/><stop offset="1" stop-color="#EEF4EF"/></linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="9" stdDeviation="12" flood-color="#17352B" flood-opacity=".09"/></filter>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#72877A"/></marker>
    <style>
      text{font-family:"NanumGothic","Malgun Gothic",sans-serif}.eyebrow{font-size:17px;font-weight:700;letter-spacing:2px;fill:#2D7254}.title{font-size:51px;font-weight:700;fill:#17352B}.subtitle{font-size:22px;fill:#5D6B63}.layer{font-size:16px;font-weight:700;letter-spacing:1px;fill:#53645A}.boxTitle{font-size:23px;font-weight:700;fill:#17352B}.smallTitle{font-size:19px}.body{font-size:18px;fill:#4E5E55}.small{font-size:15px;fill:#4E5E55}.tiny{font-size:13px;fill:#5D6B63}.whiteTitle{font-size:24px;font-weight:700;fill:white}.whiteBody{font-size:16px;fill:#E4EEE7}.arrow{fill:none;stroke:#72877A;stroke-width:3.5;marker-end:url(#arrow)}.boundary{fill:none;stroke:#A9B8AE;stroke-width:2;stroke-dasharray:8 8}
    </style>
  </defs>
  <rect width="1920" height="1150" fill="url(#bg)"/>
  <text x="70" y="62" class="eyebrow">FEEDFORWARD SYSTEM ARCHITECTURE</text>
  <text x="70" y="125" class="title">역할과 데이터 경계를 드러낸 시스템 구조</text>
  <text x="70" y="168" class="subtitle">화면은 공개되어도 저장소와 비밀정보는 서버 경계 안에서만 접근합니다</text>

  <rect x="55" y="195" width="1810" height="325" rx="30" fill="#FFFFFF" opacity=".55" class="boundary"/>
  <text x="82" y="225" class="layer">사용자 경험 계층  Next.js App Router pages and client components</text>
  ${capabilityCards}

  <path d="M960 520 V565" class="arrow"/>
  <rect x="90" y="565" width="1740" height="118" rx="24" fill="#17352B" filter="url(#shadow)"/>
  <text x="130" y="612" class="whiteTitle">공개 HTTP 경계  Route Handlers and Proxy</text>
  <text x="130" y="648" class="whiteBody">입력 검증 · 역할과 토큰 확인 · 파일 크기 제한 · 동일 출처 확인 · 오류 변환 · 외부 서비스 호출 조정</text>
  <text x="1790" y="648" class="whiteBody" text-anchor="end">${manifest.capabilities.reduce((sum, item) => sum + item.apis.length, 0)} documented endpoint references</text>

  <path d="M960 683 V724" class="arrow"/>
  <rect x="90" y="724" width="520" height="142" rx="24" fill="#FFFDF8" stroke="#CBD5CE" filter="url(#shadow)"/>
  <text x="120" y="769" class="boxTitle">도메인 규칙</text>
  <text x="120" y="807" class="body">루브릭 · 단계 · 배점 · 정규화 · 보고서</text>
  <text x="120" y="839" class="small">lib의 순수 타입과 계산 로직</text>

  <rect x="700" y="724" width="520" height="142" rx="24" fill="#FFFDF8" stroke="#CBD5CE" filter="url(#shadow)"/>
  <text x="730" y="769" class="boxTitle">보안과 세션</text>
  <text x="730" y="807" class="body">AES GCM · HMAC · 만료 토큰 · 쿠키</text>
  <text x="730" y="839" class="small">서버 전용 키와 역할별 접근 범위</text>

  <rect x="1310" y="724" width="520" height="142" rx="24" fill="#FFFDF8" stroke="#CBD5CE" filter="url(#shadow)"/>
  <text x="1340" y="769" class="boxTitle">저장 어댑터</text>
  <text x="1340" y="807" class="body">비공개 Blob JSON · 충돌 제어 · 재시도</text>
  <text x="1340" y="839" class="small">평가 설정, 응답, 프로젝트 기록, 방명록</text>

  <path d="M350 866 V915" class="arrow"/><path d="M960 866 V915" class="arrow"/><path d="M1570 866 V915" class="arrow"/>
  <text x="90" y="921" class="layer">관리형 인프라와 외부 서비스  HTTPS over server side clients</text>
  ${external}
  <text x="960" y="1112" class="small" text-anchor="middle">외부 응답은 구조화하고 필요한 결과만 역할별 화면과 저장소로 되돌립니다</text>
</svg>`;
}

async function assertManifestRoutes(manifest, routes) {
  const discovered = new Set(routes.map((item) => item.route));
  const declared = [...new Set(manifest.capabilities.flatMap((item) => item.apis))];
  const missing = declared.filter((route) => !discovered.has(route));
  if (missing.length) {
    throw new Error(`system-map.json에 선언했지만 구현에서 찾지 못한 API: ${missing.join(", ")}`);
  }
}

async function writeOrCheck(file, content) {
  const normalized = content.endsWith("\n") ? content : `${content}\n`;
  if (checkOnly) {
    let existing = "";
    try {
      existing = await fs.readFile(file, "utf8");
    } catch {
      throw new Error(`생성 파일이 없습니다: ${path.relative(root, file)}`);
    }
    if (existing !== normalized) {
      throw new Error(`시스템 문서가 최신이 아닙니다: ${path.relative(root, file)}. npm run docs:system을 실행하세요.`);
    }
    return;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, normalized, "utf8");
}

async function rasterize(svgPath, pngPath, width) {
  const { default: sharp } = await import("sharp");
  await sharp(svgPath, { density: 180 })
    .resize({ width, withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(pngPath);
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const routes = await discoverApiRoutes();
  await assertManifestRoutes(manifest, routes);

  const outputs = [
    [path.join(systemDir, "generated-api-inventory.md"), buildInventory(manifest, routes)],
    [path.join(diagramDir, "feedforward-system-pipeline.svg"), buildPipelineSvg(manifest)],
    [path.join(diagramDir, "feedforward-system-architecture.svg"), buildArchitectureSvg(manifest)]
  ];
  for (const [file, content] of outputs) await writeOrCheck(file, content);

  if (!skipRaster) {
    await rasterize(outputs[1][0], path.join(diagramDir, "feedforward-system-pipeline.png"), 1920);
    await rasterize(outputs[2][0], path.join(diagramDir, "feedforward-system-architecture.png"), 1920);
  }

  const mode = checkOnly ? "검증" : "생성";
  console.log(`Feedforward 시스템 문서 ${mode} 완료: API ${routes.length}개`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
