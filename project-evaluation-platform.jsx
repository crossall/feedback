import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Sprout, GraduationCap, Users, Handshake, BarChart3, Lightbulb, Upload, Lock, Unlock,
  CheckCircle2, ChevronRight, Settings, FileText, Plus, Trash2, Save, RefreshCw,
  Sparkles, AlertTriangle, ArrowLeft, BookOpen, PenLine, ClipboardList,
  UserCircle2, LogOut, Eye, Link2, Loader2, ThumbsUp, CheckSquare, MessageSquare
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";

/* ============================================================
   프로젝트 평가 플랫폼 — 단일 아티팩트
   교사: 평가 설정 / 루브릭 / 모둠 / 통합 결과
   학생: 결과물 평가 → 동료평가 → 협업평가 → 결과 확인 → 성찰 (순차)
   ============================================================ */

/* ---------- 공동 저장소 래퍼 (실패 시 세션 메모리로 대체) ---------- */
const mem = {};
const skey = (k, shared) => (shared ? "S:" : "U:") + k;
const store = {
  available: true,
  async probe() {
    try {
      await window.storage.set("pj_probe", "1", false);
      this.available = true;
    } catch (e) {
      this.available = false;
    }
    return this.available;
  },
  async get(key, shared = true) {
    try {
      const r = await window.storage.get(key, shared);
      const s = r ? r.value : mem[skey(key, shared)];
      return s ? JSON.parse(s) : null;
    } catch (e) {
      const s = mem[skey(key, shared)];
      return s ? JSON.parse(s) : null;
    }
  },
  async set(key, obj, shared = true) {
    const s = JSON.stringify(obj);
    mem[skey(key, shared)] = s;
    try {
      await window.storage.set(key, s, shared);
    } catch (e) {
      this.available = false;
    }
    return obj;
  },
  async list(prefix, shared = true) {
    try {
      const r = await window.storage.list(prefix, shared);
      return r ? r.keys : [];
    } catch (e) {
      return Object.keys(mem)
        .filter((k) => k.startsWith((shared ? "S:" : "U:") + prefix))
        .map((k) => k.slice(2));
    }
  },
};

/* ---------- 비밀번호 해시 (가벼운 잠금용, 평문 저장 방지) ---------- */
function hashStr(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const PROJECT1_TEACHER_AUTH = { hash: hashStr("6556") };

let projectEvaluationRuntime = {};

export function configureProjectEvaluationRuntime(options = {}) {
  projectEvaluationRuntime = { ...options };
}

function runtimeOptions() {
  return {
    apiBasePath: "/api/project1",
    footerUrl: "feedforward.kr/project1",
    teacherAuth: PROJECT1_TEACHER_AUTH,
    aiFeedbackCacheSchema: AI_FEEDBACK_CACHE_SCHEMA,
    resultsCacheSchema: RESULTS_CACHE_SCHEMA,
    reflectionsCacheSchema: REFLECTIONS_CACHE_SCHEMA,
    defaultConfigPatch: null,
    allowEmptyClasses: false,
    themeCss: "",
    ...projectEvaluationRuntime,
  };
}

function getDefaultConfig() {
  const patch = runtimeOptions().defaultConfigPatch;
  const base = structuredClone(DEFAULT_CONFIG);
  if (!patch) return base;

  return {
    ...base,
    ...patch,
    project: { ...base.project, ...(patch.project || {}) },
    settings: { ...base.settings, ...(patch.settings || {}) },
    rubric: { ...base.rubric, ...(patch.rubric || {}) },
    classes: Array.isArray(patch.classes) ? structuredClone(patch.classes) : base.classes,
    groups: Array.isArray(patch.groups) ? structuredClone(patch.groups) : base.groups,
  };
}

/* ---------- AI 호출 (Claude API) ---------- */
function extractJSON(text) {
  if (!text) return null;
  let t = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a === -1 || b === -1) return null;
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch (e) {
    return null;
  }
}
async function callClaude(messages, maxTokens = 1000) {
  const res = await fetch(`${runtimeOptions().apiBasePath}/claude`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maxTokens, messages }),
  });
  const raw = await res.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (e) { data = { error: raw }; }
  if (!res.ok) throw new Error(data.error || "Claude 요청에 실패했습니다.");
  return data.text || "";
}

const MAX_PROJECT_PDF_BYTES = 22 * 1024 * 1024;
const MAX_PROJECT_PDF_MB = Math.floor(MAX_PROJECT_PDF_BYTES / (1024 * 1024));
function isPdfFile(file) {
  return !!file && (file.type === "application/pdf" || file.name?.toLowerCase().endsWith(".pdf"));
}
function pdfLimitMessage() {
  return `PDF는 최대 ${MAX_PROJECT_PDF_MB}MB까지 올릴 수 있어요. Claude API의 32MB 요청 제한을 넘지 않도록 여유를 둔 값입니다.`;
}

const AI_FEEDBACK_CACHE_SCHEMA = "project1-ai-feedback-content-v2-websearch";
const AI_FEEDBACK_LOCK_MS = 90 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return hashStr(typeof value === "string" ? value : Array.from(bytes).join(","));
}

function normalizeSignatureText(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sampledPageNumbers(numPages) {
  if (numPages <= 24) return Array.from({ length: numPages }, (_, i) => i + 1);
  const pages = new Set([1, 2, 3, numPages - 2, numPages - 1, numPages]);
  for (let i = 0; i < 18; i++) pages.add(1 + Math.round(((numPages - 1) * i) / 17));
  return Array.from(pages).filter((p) => p >= 1 && p <= numPages).sort((a, b) => a - b);
}

function averageHashFromCanvas(canvas, cellsX = 16, cellsY = 16) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "";
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const values = [];
  for (let cy = 0; cy < cellsY; cy++) {
    for (let cx = 0; cx < cellsX; cx++) {
      const x0 = Math.floor((cx * width) / cellsX);
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * width) / cellsX));
      const y0 = Math.floor((cy * height) / cellsY);
      const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * height) / cellsY));
      let sum = 0, count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          sum += (data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114);
          count++;
        }
      }
      values.push(count ? sum / count : 255);
    }
  }
  const avgValue = values.reduce((s, v) => s + v, 0) / (values.length || 1);
  return values.map((v) => (v < avgValue ? "1" : "0")).join("");
}

async function renderPageSignature(page) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "";
  const width = 96, height = 128;
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(width / base.width, height / base.height);
  const vp = page.getViewport({ scale });
  ctx.save();
  ctx.translate((width - vp.width) / 2, (height - vp.height) / 2);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  ctx.restore();
  return averageHashFromCanvas(canvas);
}

function aiRubricHash(config, items) {
  return hashStr(JSON.stringify({
    schema: runtimeOptions().aiFeedbackCacheSchema,
    subject: config?.project?.subject || "",
    items: (items || []).map((it) => ({
      no: it.no, name: it.name, high: it.high, mid: it.mid, low: it.low,
      hi: it.hi, mi: it.mi, lo: it.lo,
    })),
  }));
}

async function computePdfContentSignature(bytes) {
  try {
    const pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
    const visualPages = new Set(sampledPageNumbers(doc.numPages));
    const textParts = [];
    const visualParts = [];

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      try {
        const text = await page.getTextContent();
        textParts.push(text.items.map((item) => item.str || "").join(" "));
      } catch (e) {
        textParts.push("");
      }
      if (visualPages.has(p)) {
        try {
          visualParts.push(`${p}:${await renderPageSignature(page)}`);
        } catch (e) {
          visualParts.push(`${p}:`);
        }
      }
    }

    const normalizedText = normalizeSignatureText(textParts.join(" "));
    const textHash = normalizedText ? await sha256Hex(normalizedText) : "no-text";
    const visualHash = await sha256Hex(`${doc.numPages}|${visualParts.join("|")}`);
    const contentHash = await sha256Hex(`${runtimeOptions().aiFeedbackCacheSchema}|pages:${doc.numPages}|text:${textHash}|visual:${visualHash}`);
    return {
      strategy: "pdf-content",
      pageCount: doc.numPages,
      textHash: textHash.slice(0, 32),
      visualHash: visualHash.slice(0, 32),
      contentHash: contentHash.slice(0, 32),
      textLength: normalizedText.length,
      sampledPages: Array.from(visualPages),
    };
  } catch (e) {
    const byteHash = await sha256Hex(bytes);
    return {
      strategy: "pdf-bytes-fallback",
      pageCount: null,
      textHash: "fallback",
      visualHash: "fallback",
      contentHash: byteHash.slice(0, 32),
      textLength: 0,
      sampledPages: [],
    };
  }
}

function aiFeedbackCacheKeys(config, items, signature) {
  const rubric = aiRubricHash(config, items);
  return {
    rubric,
    primary: `pj_ai_cache_${rubric}_${signature.contentHash}`,
    visual: signature.visualHash && signature.visualHash !== "fallback" ? `pj_ai_cache_v_${rubric}_${signature.visualHash}` : "",
    lock: `pj_ai_lock_${rubric}_${signature.contentHash}`,
  };
}

function normalizeAiFeedbackResult(parsed, items, maxP) {
  const norm = items.map((it) => {
    const f = (parsed.items || []).find((x) => Number(x.no) === it.no) || {};
    const rating = ["상", "중", "하"].includes(f.rating) ? f.rating : "중";
    return { no: it.no, rating, score: itemScore(it, rating), reason: String(f.reason || "").slice(0, 60) };
  });
  return {
    summary: String(parsed.summary || "").slice(0, 240),
    items: norm,
    aiScore: norm.reduce((s, x) => s + x.score, 0),
    aiMax: maxP,
    good: String(parsed.good || ""),
    improve: String(parsed.improve || ""),
  };
}

function draftRecordFromAiResult(result, { groupId, fileName, submittedBy, signature, cacheKey, reused, pdfData, fileSize }) {
  return {
    groupId,
    fileName,
    summary: result.summary || "",
    items: result.items || [],
    aiScore: result.aiScore ?? null,
    aiMax: result.aiMax,
    good: result.good || "",
    improve: result.improve || "",
    submittedBy,
    ts: Date.now(),
    contentSignature: signature,
    aiCacheKey: cacheKey,
    reusedAiFeedback: Boolean(reused),
    pdfData: pdfData || "",
    fileSize: fileSize || 0,
  };
}

async function readAiFeedbackCache(keys) {
  for (const key of [keys.primary, keys.visual].filter(Boolean)) {
    const cached = await store.get(key, true);
    if (cached?.schema === runtimeOptions().aiFeedbackCacheSchema && cached.result) return { ...cached, key };
  }
  return null;
}

async function waitForAiFeedbackCache(keys, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const cached = await readAiFeedbackCache(keys);
    if (cached) return cached;
    await sleep(1200);
  }
  return null;
}

async function writeAiFeedbackCache(keys, signature, result, meta) {
  const payload = {
    schema: runtimeOptions().aiFeedbackCacheSchema,
    signature,
    result,
    meta,
    ts: Date.now(),
  };
  await store.set(keys.primary, payload, true);
  if (keys.visual) await store.set(keys.visual, payload, true);
}

const PROJECT_END_REFLECTION_INTRO = "프로젝트를 마치며, 나의 프로젝트 과정을 차분히 돌아보세요.";
const PROJECT_END_REFLECTION_QUESTIONS = [
  "우리 모둠이 만든 결과물\n- 우리 모둠의 주제는 무엇이었나요? (예: 식물 이름)\n- 우리 결과물에서 가장 마음에 드는 부분 또는 고치거나 더하고 싶었던 점이 있나요?",
  "내가 새롭게 알게 된 것\n- 이 프로젝트를 하면서 새롭게 알게 된 점 세 가지를 적어 보세요.\n1.\n2.\n3.",
  "어려웠지만 해냈어요\n- 프로젝트에서 가장 어려웠던 점은 무엇이었나요?",
  "다음에는 이렇게,\n- 다음에 비슷한 프로젝트를 한다면, 무엇을 다르게 해보고 싶나요?",
];
const PROJECT_END_REFLECTION_QUESTIONS_3_4 = [
  "모둠 친구들과 협력하면서 좋았던 점 또는 아쉬웠던 점은 무엇인가요?\n\n역할 분담  |  의견 나누기와 의사 결정  |  서로 돕고 배려하기",
  "AI 피드백 중 어떤 내용을 반영했고, 그 이유는 무엇인가요?\n\n반영한 AI 피드백  |  반영한 이유  |  반영하지 않은 피드백과 그 이유",
  "다음 프로젝트에서 더 잘하고 싶은 점은 무엇인가요?\n\n협력하는 방법  |  AI를 활용하는 방법  |  결과물을 만드는 방법",
];
const LEGACY_REFLECTION_CLASS_IDS = new Set(["cmqu5n1oc", "cmqu5n4yh", "cmqu5nfg6"]);
const LEGACY_REFLECTION_CLASS_NAMES = new Set(["6학년 1반", "6학년 2반", "6학년 5반"]);

function reflectionQuestionsFor(config, me, reflect) {
  const savedQuestions = (reflect?.answers || []).map((answer) => answer.q).filter(Boolean);
  if (savedQuestions.length > 0) return savedQuestions;

  const group = config?.groups?.find((g) => g.id === me.groupId);
  const studentClassId = me.classId || group?.classId;
  const label = className(config, studentClassId);
  return LEGACY_REFLECTION_CLASS_IDS.has(studentClassId) || LEGACY_REFLECTION_CLASS_NAMES.has(label)
    ? PROJECT_END_REFLECTION_QUESTIONS
    : PROJECT_END_REFLECTION_QUESTIONS_3_4;
}

/* ---------- 기본 루브릭 (식물 안내서 예시, 교사가 수정 가능) ---------- */
const DEFAULT_CONFIG = {
  project: {
    title: "식물 안내서 만들기",
    subject: "식물",
    desc: "모둠별로 맡은 식물을 조사해 1~6학년 누구나 이해할 수 있는 안내서를 만듭니다.",
  },
  settings: { selfInCollab: true },
  rubric: {
    aiFeedback: {
      title: "결과물 평가 · AI 피드백용",
      desc: "결과물을 더 좋게 다듬도록 AI가 피드백을 주는 기준입니다. (100점 만점 · 최종 점수에는 반영되지 않음)",
      items: [
        { no: 1, name: "구조·기능·사실 정확성", high: 20, mid: 16, low: 12,
          hi: "식물의 주요 기관(뿌리·줄기·잎·꽃·열매 등)과 하는 일을 과학적 사실에 맞게 정확히 설명했다",
          mi: "식물의 여러 기관과 하는 일을 설명했으나, 일부 내용은 더 확인하거나 보완할 필요가 있다",
          lo: "식물의 구조·기능·생장에 대한 중요한 사실 오류나 헷갈리게 하는 설명이 있다" },
        { no: 2, name: "쉬운 설명", high: 20, mid: 16, low: 12,
          hi: "1~6학년 누구나 이해하도록 쉬운 단어와 짧은 문장으로 설명했다",
          mi: "대체로 쉬운 단어와 문장으로 설명했다",
          lo: "어려운 단어나 긴 문장이 있어 이해하는 데 시간이 걸린다" },
        { no: 3, name: "구성·편집", high: 20, mid: 16, low: 12,
          hi: "내용이 주제에 따라 체계적으로 구성되어 있고, 읽는 순서가 자연스럽게 이어진다",
          mi: "내용이 구성되어 있고, 대체로 읽는 흐름이 이어진다",
          lo: "내용이 담겨 있으나 구성이 단순해 읽는 흐름을 따라가기 어려운 부분이 있다" },
        { no: 4, name: "사진·그림", high: 15, mid: 12, low: 9,
          hi: "설명하는 부분마다 사진·그림이 골고루 들어가 있다",
          mi: "사진·그림이 여러 개 들어가 있다",
          lo: "사진이나 그림이 들어가 있다" },
        { no: 5, name: "창의성·흥미·새 정보", high: 15, mid: 12, low: 9,
          hi: "새롭게 알게 된 정보나 창의적 표현이 있어 읽는 재미가 있다",
          mi: "내용을 알차게 담았고, 흥미로운 부분이 군데군데 있다",
          lo: "조사한 기본 정보 위주로 담아 새롭거나 흥미로운 요소가 적다" },
        { no: 6, name: "출처", high: 5, mid: 4, low: 3,
          hi: "정보를 찾은 곳을 정확히 밝혔고 믿을 수 있는 자료를 사용했다",
          mi: "정보를 찾은 곳을 밝혔고, 일부 자료의 출처를 함께 적었다",
          lo: "정보를 찾은 곳을 자기 방식대로 표시했다" },
        { no: 7, name: "맞춤법·띄어쓰기", high: 5, mid: 4, low: 3,
          hi: "맞춤법과 띄어쓰기가 정확해 읽기에 편하다",
          mi: "맞춤법과 띄어쓰기를 대체로 바르게 썼다",
          lo: "맞춤법과 띄어쓰기 실수가 있어 읽는 데 걸리는 부분이 있다" },
      ],
    },
    peer: {
      title: "동료 양적평가",
      desc: "다른 모둠 친구들이 이 결과물을 읽고 점수를 매기는 기준입니다. (55점 만점)",
      items: [
        { no: 1, name: "내용이 잘 전달됨", high: 15, mid: 12, low: 9,
          hi: "읽고 나니 이 식물에 대해 무엇을 알려 주려는지 분명하게 이해됐다",
          mi: "읽고 나니 중요한 내용이 대체로 잘 전해졌다",
          lo: "읽고 나니 이 식물에 대한 기본적인 내용을 알 수 있었다" },
        { no: 2, name: "쉽게 읽힘", high: 15, mid: 12, low: 9,
          hi: "쉬운 말과 짧은 문장으로 술술 읽혀 동생들도 이해할 수 있을 것 같다",
          mi: "대체로 쉽게 읽혔고, 몇몇 표현은 천천히 읽으면 이해됐다",
          lo: "어려운 표현이 있어 내용을 이해하려면 여러 번 읽어야 했다" },
        { no: 3, name: "사진·그림", high: 15, mid: 12, low: 9,
          hi: "설명하는 부분마다 사진·그림이 골고루 들어가 있다",
          mi: "사진·그림이 여러 개 들어가 있다",
          lo: "사진이나 그림이 들어가 있다" },
        { no: 4, name: "재미·새로움", high: 10, mid: 8, low: 6,
          hi: "새롭게 알게 된 점과 창의적 표현이 있어 읽는 재미가 있었다",
          mi: "흥미로운 부분이 있어 읽는 재미가 어느 정도 있었다",
          lo: "기본적인 정보 위주로 구성되어 새롭거나 흥미로운 내용이 적었다" },
      ],
    },
    peerOpen: [
      { id: "good", label: "좋은 점", placeholder: "이 모둠 결과물에서 특히 좋았던 점을 적어 주세요." },
      { id: "improve", label: "더 좋아질 점", placeholder: "더 멋져지도록 더하거나 다듬으면 좋을 점을 적어 주세요." },
    ],
    collab: {
      title: "협업 평가",
      desc: "모둠원이 함께 일한 과정을 서로(자기 자신 포함) 평가하는 기준입니다. (모둠원 1명당 45점 만점)",
      items: [
        { no: 1, name: "참여와 적극성", high: 15, mid: 12, low: 9,
          hi: "모둠 활동에 적극적으로 참여하고, 의견을 자주 내며 활동을 이끌었다",
          mi: "모둠 활동에 꾸준히 참여하고, 의견을 냈다",
          lo: "모둠 활동에 참여하며 친구들의 의견을 따라 함께했다" },
        { no: 2, name: "책임감·자기 역할 수행", high: 15, mid: 12, low: 9,
          hi: "자기가 맡은 역할을 끝까지 책임지고 충실하게 해냈다",
          mi: "자기가 맡은 역할을 책임지고 해냈다",
          lo: "자기가 맡은 역할을 친구들의 도움을 받아 마무리했다" },
        { no: 3, name: "협력과 의사소통", high: 15, mid: 12, low: 9,
          hi: "친구들의 의견을 잘 듣고, 서로 도우며 의견을 활발하게 주고받았다",
          mi: "친구들의 의견을 듣고, 서로 도우며 활동했다",
          lo: "친구들과 의견을 나누며 함께 활동에 참여했다" },
      ],
    },
    collabOpen: [
      { id: "good", label: "잘한 점", placeholder: "이 친구가 특히 잘한 점이나 고마웠던 점을 적어 주세요. (선택)" },
      { id: "improve", label: "개선할 점", placeholder: "다음에 더 잘하면 좋을 점을 따뜻하게 적어 주세요. (선택)" },
    ],
  },
  classes: [{ id: "c1", name: "1반" }],
  groups: [
    { id: "g1", classId: "c1", name: "1모둠", members: ["김민준", "이서연", "박지호"] },
    { id: "g2", classId: "c1", name: "2모둠", members: ["최유나", "정예준", "강하린"] },
    { id: "g3", classId: "c1", name: "3모둠", members: ["윤도현", "임수아", "한지우"] },
  ],
};

/* ---------- 점수 도우미 ---------- */
const itemScore = (item, rating) =>
  rating === "상" ? item.high : rating === "중" ? item.mid : rating === "하" ? item.low : 0;
const sumItems = (items, picks) =>
  items.reduce((s, it) => s + itemScore(it, picks[it.no]), 0);
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const round1 = (n) => Math.round(n * 10) / 10;
const RESULTS_CACHE_KEY = "pj_results_cache";
const RESULTS_VERSION_KEY = "pj_results_version";
const RESULTS_CACHE_SCHEMA = "project1-results-v4-personal-collab";
const REFLECTIONS_CACHE_KEY = "pj_reflections_cache";
const REFLECTIONS_VERSION_KEY = "pj_reflections_version";
const REFLECTIONS_CACHE_SCHEMA = "project1-reflections-v1";
const STORE_READ_CONCURRENCY = 8;
const STUDENT_STAGE_CONTROL_KEY = "pj_student_stage_control";
const DEFAULT_OPEN_STUDENT_STEP = "final";
const STUDENT_STAGE_ORDER = ["result", "final", "peer", "collab", "report", "reflect"];
const TEACHER_STAGE_OPTIONS = [
  { key: "final", label: "최종 제출", desc: "AI 피드백과 최종 결과물 제출까지 열림" },
  { key: "peer", label: "동료평가", desc: "다른 모둠 결과물 평가 열림" },
  { key: "collab", label: "협업평가", desc: "같은 모둠 친구 평가 열림" },
  { key: "report", label: "결과 확인", desc: "평가 결과 확인 열림" },
  { key: "reflect", label: "성찰", desc: "프로젝트 성찰까지 열림" },
];
function normalizeOpenStudentStep(value) {
  return STUDENT_STAGE_ORDER.includes(value) ? value : DEFAULT_OPEN_STUDENT_STEP;
}
function studentStageIndex(key) {
  const index = STUDENT_STAGE_ORDER.indexOf(key);
  return index === -1 ? 0 : index;
}
function isStudentStepOpen(stepKey, openStep) {
  return studentStageIndex(stepKey) <= studentStageIndex(normalizeOpenStudentStep(openStep));
}
function openStudentStepForClass(stageControl, classId) {
  return normalizeOpenStudentStep(stageControl?.byClass?.[classId] || stageControl?.openStep);
}
async function markResultsChanged(reason = "update") {
  await store.set(RESULTS_VERSION_KEY, {
    ts: Date.now(),
    id: Math.random().toString(36).slice(2),
    reason,
  }, true);
}
async function markReflectionsChanged(reason = "update") {
  await store.set(REFLECTIONS_VERSION_KEY, {
    ts: Date.now(),
    id: Math.random().toString(36).slice(2),
    reason,
  }, true);
}

/* 루브릭 점수 도우미 */
const rubricMax = (items) => (items || []).reduce((s, it) => s + (Number(it.high) || 0), 0);
const aiItems = (config) => config?.rubric?.aiFeedback?.items || [];
const peerItems = (config) => config?.rubric?.peer?.items || [];
const collabItems = (config) => config?.rubric?.collab?.items || [];
const peerOpenQs = (config) => config?.rubric?.peerOpen || [];
const collabOpenQs = (config) => config?.rubric?.collabOpen || [];

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

/* 학급(반)·루브릭 보정: 예전 저장본/누락 대비 */
function withClasses(cfg) {
  const defaults = getDefaultConfig();
  if (!cfg) return defaults;
  const n = structuredClone(cfg);
  if (!Array.isArray(n.classes)) n.classes = structuredClone(defaults.classes || []);
  if (n.classes.length === 0 && !runtimeOptions().allowEmptyClasses) n.classes = [{ id: "c1", name: "1반" }];
  const fb = n.classes[0]?.id;
  n.groups = (n.groups || []).map((g) => (g.classId || !fb ? g : { ...g, classId: fb }));
  // 루브릭 구조 마이그레이션 (예전 구조 → aiFeedback/peer/collab/peerOpen)
  if (!n.rubric || !n.rubric.aiFeedback || !n.rubric.peer) n.rubric = structuredClone(defaults.rubric);
  if (!n.rubric.peerOpen) n.rubric.peerOpen = structuredClone(defaults.rubric.peerOpen);
  if (!n.rubric.collabOpen) n.rubric.collabOpen = structuredClone(defaults.rubric.collabOpen);
  if (n.weights) delete n.weights; // 더 이상 환산 비중을 쓰지 않음 (점수 그대로 합산)
  return n;
}

/* ---------- 루브릭 텍스트 파서: 붙여넣은 글 → 루브릭 구조 ---------- */
function parseGradeItems(bodyLines) {
  const items = [];
  let cur = null, lastGrade = null, no = 0;
  for (const raw of bodyLines) {
    const line = raw.trim();
    if (!line) continue;
    // "1. 항목이름 (20/16/12)"  — 끝의 (상/중/하 점수)
    const mItem = line.match(/^\s*\d+[.)]\s*(.+?)\s*[（(]\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*[)）]\s*$/);
    if (mItem) {
      no += 1;
      cur = { no, name: mItem[1].trim(), high: +mItem[2], mid: +mItem[3], low: +mItem[4], hi: "", mi: "", lo: "" };
      items.push(cur); lastGrade = null; continue;
    }
    const mG = line.match(/^(상|중|하)\s*[:：]\s*(.*)$/);
    if (cur && mG) {
      lastGrade = mG[1] === "상" ? "hi" : mG[1] === "중" ? "mi" : "lo";
      cur[lastGrade] = mG[2].trim();
    } else if (cur && lastGrade) {
      cur[lastGrade] += " " + line; // 줄바꿈된 이어진 설명
    }
  }
  return items;
}
function parseOpenQs(bodyLines) {
  const out = [];
  for (const raw of bodyLines) {
    const line = raw.trim();
    const m = line.match(/^[-•*]\s*(.+?)\s*[:：]\s*(.+)$/);
    if (m) out.push({ id: "q" + (out.length + 1), label: m[1].trim(), placeholder: m[2].trim() });
  }
  return out;
}
function cleanRubricTitle(header) {
  let t = header;
  if (t.includes("—")) t = t.split("—").slice(1).join("—");
  else if (t.includes(" - ")) t = t.split(" - ").slice(1).join(" - ");
  t = t.replace(/[（(][^)）]*[)）]\s*$/, "").trim();
  return t;
}
// 반환: { rubric?: {...}, counts: {...}, warnings: [] }
function parseRubricText(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let cur = null;
  for (const line of lines) {
    if (/^\s*[■▶◆#]/.test(line) || /^\s*평가\s*\d/.test(line)) {
      cur = { header: line.replace(/^\s*[■▶◆#]\s*/, "").trim(), body: [] };
      blocks.push(cur);
    } else if (cur) cur.body.push(line);
  }
  const rubric = {};
  const warnings = [];
  for (const b of blocks) {
    const h = b.header;
    const mEval = h.match(/평가\s*(\d+)/);
    const evalNo = mEval ? Number(mEval[1]) : null;
    const kind = /주관식/.test(h)
      ? (/협업|모둠원/.test(h) || evalNo === 3 ? "collabOpen" : "peerOpen")
      : /AI|에이아이|피드백/.test(h) || evalNo === 1
        ? "aiFeedback"
        : /협업|모둠원/.test(h) || evalNo === 3
          ? "collab"
          : /동료|양적/.test(h) || evalNo === 2
            ? "peer"
            : "";
    if (kind === "peerOpen" || kind === "collabOpen") {
      const qs = parseOpenQs(b.body);
      if (qs.length) {
        if (kind === "collabOpen") rubric.collabOpen = qs;
        else rubric.peerOpen = qs;
      }
    } else if (kind === "aiFeedback") {
      const items = parseGradeItems(b.body);
      if (items.length) rubric.aiFeedback = { title: cleanRubricTitle(h) || "결과물 평가 · AI 피드백용", desc: DEFAULT_CONFIG.rubric.aiFeedback.desc, items };
    } else if (kind === "collab") {
      const items = parseGradeItems(b.body);
      if (items.length) rubric.collab = { title: cleanRubricTitle(h) || "협업 평가", desc: DEFAULT_CONFIG.rubric.collab.desc, items };
    } else if (kind === "peer") {
      const items = parseGradeItems(b.body);
      if (items.length) rubric.peer = { title: cleanRubricTitle(h) || "동료 양적평가", desc: DEFAULT_CONFIG.rubric.peer.desc, items };
    }
  }
  const counts = {
    aiFeedback: rubric.aiFeedback ? rubric.aiFeedback.items.length : 0,
    peer: rubric.peer ? rubric.peer.items.length : 0,
    collab: rubric.collab ? rubric.collab.items.length : 0,
    peerOpen: rubric.peerOpen ? rubric.peerOpen.length : 0,
    collabOpen: rubric.collabOpen ? rubric.collabOpen.length : 0,
  };
  if (!counts.aiFeedback) warnings.push("‘AI 피드백용’ 평가를 찾지 못했어요. (제목에 ‘AI 피드백’ 또는 ‘평가 1’ 포함)");
  if (!counts.peer) warnings.push("‘동료 양적평가’를 찾지 못했어요. (제목에 ‘동료’ 또는 ‘평가 2’ 포함)");
  if (!counts.collab) warnings.push("‘협업 평가’를 찾지 못했어요. (제목에 ‘협업’ 또는 ‘평가 3’ 포함)");
  return { rubric, counts, warnings };
}

/* =================================================================== */
/* ===========================  STYLES  ============================== */
/* =================================================================== */
const CSS = `
:root{
  --ink:#1d2521; --ink-soft:#5d665f; --ink-faint:#929b94;
  --paper:#eef3ef; --surface:#ffffff; --surface-2:#f5f9f6;
  --line:#e1e8e2; --line-2:#d2dbd4;
  --green:#1f7a54; --green-700:#155e40; --green-soft:#e4f1ea; --green-100:#d2e8dd;
  --accent:#e07b2f; --accent-soft:#fbeada; --accent-700:#b85f18;
  --teal:#1f8a86; --teal-soft:#dff1f0;
  --violet:#6b62b5; --violet-soft:#eae8f7;
  --rose:#bf5a45; --rose-soft:#f8e6e1;
  --gold:#c79a2f;
  --shadow:0 1px 2px rgba(20,40,30,.05), 0 10px 30px -16px rgba(20,40,30,.22);
  --shadow-lg:0 2px 4px rgba(20,40,30,.06), 0 24px 48px -24px rgba(20,40,30,.28);
  --r:16px; --r-sm:10px;
}
*{box-sizing:border-box}
.pj-root{
  font-family:'Pretendard',-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',system-ui,sans-serif;
  color:var(--ink); background:
    radial-gradient(1200px 480px at 88% -8%, #e7f1eb 0%, rgba(231,241,235,0) 60%),
    radial-gradient(900px 420px at -6% 8%, #f3ece1 0%, rgba(243,236,225,0) 55%),
    var(--paper);
  min-height:100vh; width:100%; overflow-x:hidden; -webkit-font-smoothing:antialiased; line-height:1.5;
}
.wrap{width:100%;max-width:1120px;margin:0 auto;padding:22px 20px 80px}
.row{display:flex;gap:12px;min-width:0} .col{display:flex;flex-direction:column;min-width:0}
.between{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}
.center{display:flex;align-items:center;gap:10px;min-width:0}
.card,.pad,.pad-lg,.layout main,.rail,.dropzone,.checkrow{min-width:0}
.muted{color:var(--ink-soft)} .faint{color:var(--ink-faint)}
.mono{font-variant-numeric:tabular-nums}
.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}

/* topbar */
.topbar{position:sticky;top:0;z-index:20;backdrop-filter:saturate(140%) blur(8px);
  background:rgba(238,243,239,.78);border-bottom:1px solid var(--line)}
.topbar-in{width:100%;max-width:1120px;margin:0 auto;padding:11px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.pj-brand{appearance:none;border:0;background:transparent;color:inherit;display:flex;align-items:center;gap:11px;font:inherit;font-weight:800;letter-spacing:-.02em;text-align:left;cursor:pointer;min-width:0;padding:0}
.pj-brand .logo{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;
  background:linear-gradient(150deg,var(--green),#2c9e6b);color:#fff;box-shadow:0 6px 16px -8px rgba(31,122,84,.7)}
.pj-brand > span:last-child{min-width:0}
.pj-brand small{display:block;font-weight:600;font-size:11.5px;color:var(--ink-soft);letter-spacing:0;max-width:min(320px,58vw);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* cards */
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow)}
.pad{padding:20px} .pad-lg{padding:26px}
.eyebrow{font-size:11.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--green);display:flex;align-items:center;gap:7px}
.h1{font-size:27px;font-weight:850;letter-spacing:-.03em;margin:6px 0}
.h2{font-size:19px;font-weight:800;letter-spacing:-.02em}
.h3{font-size:15px;font-weight:750}
.lede{font-size:14.5px;color:var(--ink-soft);max-width:62ch}
.pj-root p,.pj-root .lede,.pj-root .muted,.pj-root .hint,.pj-root .h1,.pj-root .h2,.pj-root .h3,.pj-root .ttl,.pj-root .sub{overflow-wrap:anywhere}

/* buttons */
.btn{appearance:none;border:1px solid var(--line-2);background:var(--surface);color:var(--ink);
  font:inherit;font-weight:700;font-size:14px;padding:10px 16px;border-radius:11px;cursor:pointer;
  display:inline-flex;align-items:center;gap:8px;transition:.15s;line-height:1;white-space:nowrap}
.btn:hover{border-color:#b8c3ba;transform:translateY(-1px)}
.btn:active{transform:translateY(0)}
.btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
.btn.primary{background:linear-gradient(150deg,var(--green),#2a9b68);border-color:transparent;color:#fff;
  box-shadow:0 8px 20px -10px rgba(31,122,84,.75)}
.btn.primary:hover{filter:brightness(1.04)}
.btn.accent{background:linear-gradient(150deg,var(--accent),#ef923f);border-color:transparent;color:#fff;
  box-shadow:0 8px 20px -10px rgba(224,123,47,.7)}
.btn.ghost{background:transparent;border-color:transparent;color:var(--ink-soft);padding-left:8px;padding-right:8px}
.btn.ghost:hover{background:var(--surface-2);transform:none}
.btn.sm{padding:7px 11px;font-size:13px;border-radius:9px}
.btn.lg{padding:13px 22px;font-size:15px}

/* inputs */
.field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
.label{font-size:13px;font-weight:750;color:var(--ink)}
.hint{font-size:12px;color:var(--ink-faint)}
.input,.textarea,select.input{width:100%;font:inherit;font-size:14px;color:var(--ink);background:var(--surface-2);
  border:1px solid var(--line-2);border-radius:10px;padding:11px 12px;transition:.15s;outline:none}
.input:focus,.textarea:focus,select.input:focus{border-color:var(--green);background:#fff;box-shadow:0 0 0 3px var(--green-100)}
.textarea{resize:vertical;min-height:84px;line-height:1.55}
.num{width:74px;text-align:center}

/* pills / badges */
.pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:750;padding:5px 10px;border-radius:999px;border:1px solid var(--line-2);background:var(--surface-2);color:var(--ink-soft)}
.pill.green{background:var(--green-soft);color:var(--green-700);border-color:transparent}
.pill.accent{background:var(--accent-soft);color:var(--accent-700);border-color:transparent}
.pill.gray{background:#eef1ee;color:#6b746d;border-color:transparent}
.chip{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;flex:none}
.fchip{cursor:pointer;font-size:13px;font-weight:750;padding:7px 14px;border-radius:999px;border:1px solid var(--line-2);background:var(--surface);color:var(--ink-soft);transition:all .15s}
.fchip:hover{border-color:var(--green-100);color:var(--green-700)}
.fchip.on{background:var(--green);border-color:var(--green);color:#fff}

/* role cards */
.role-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;min-width:0}
.role{cursor:pointer;border:1px solid var(--line);background:var(--surface);border-radius:var(--r);padding:26px;
  transition:.18s;box-shadow:var(--shadow);position:relative;overflow:hidden;min-width:0;max-width:100%}
.role:hover{transform:translateY(-3px);box-shadow:var(--shadow-lg);border-color:var(--green-100)}
.role .ic{width:54px;height:54px;border-radius:15px;display:grid;place-items:center;margin-bottom:14px}

/* journey rail */
.layout{display:grid;grid-template-columns:300px 1fr;gap:22px;align-items:start}
.rail{position:sticky;top:78px}
.rail-head{padding:16px 18px;border-bottom:1px solid var(--line)}
.steps{padding:10px 12px}
.node{position:relative;display:flex;gap:13px;padding:11px 10px;border-radius:12px;cursor:pointer;transition:.14s}
.node:hover{background:var(--surface-2)}
.node.active{background:var(--green-soft)}
.node.locked{cursor:not-allowed;opacity:.62}
.node .dot{width:34px;height:34px;border-radius:50%;flex:none;display:grid;place-items:center;z-index:2;
  border:2px solid var(--line-2);background:#fff;color:var(--ink-faint);font-weight:800;font-size:13px}
.node.active .dot{border-color:var(--green);color:var(--green);box-shadow:0 0 0 4px var(--green-100)}
.node.done .dot{background:var(--green);border-color:var(--green);color:#fff}
.node .ttl{font-weight:750;font-size:14px;letter-spacing:-.01em}
.node .sub{font-size:11.5px;color:var(--ink-faint);margin-top:2px}
.node.active .sub{color:var(--green-700)}
.connector{position:absolute;left:26.5px;top:0;bottom:0;width:2px;background:var(--line);z-index:1}
.connector .fill{position:absolute;top:0;left:0;width:100%;background:linear-gradient(var(--green),#3aa676);transition:height .4s}

/* segmented rating */
.seg{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.seg button{appearance:none;cursor:pointer;font:inherit;font-weight:750;border:1.5px solid var(--line-2);
  background:var(--surface);border-radius:11px;padding:12px 8px;transition:.14s;text-align:center;color:var(--ink-soft)}
.seg button:hover{border-color:#b8c3ba}
.seg button .g{display:block;font-size:16px;font-weight:850;color:var(--ink)}
.seg button .p{display:block;font-size:11.5px;margin-top:3px}
.seg button[data-on="상"]{border-color:var(--green);background:var(--green-soft);color:var(--green-700)}
.seg button[data-on="상"] .g{color:var(--green-700)}
.seg button[data-on="중"]{border-color:var(--gold);background:#faf3df;color:#8a6a14}
.seg button[data-on="중"] .g{color:#8a6a14}
.seg button[data-on="하"]{border-color:var(--rose);background:var(--rose-soft);color:#a23f2c}
.seg button[data-on="하"] .g{color:#a23f2c}

/* vertical rubric options: grade + points badge + description per row */
.segv{display:flex;flex-direction:column;gap:8px}
.segv button{appearance:none;cursor:pointer;font:inherit;border:1.5px solid var(--line-2);background:var(--surface);
  border-radius:12px;padding:11px 13px;transition:.14s;text-align:left;display:flex;align-items:center;gap:13px;width:100%}
.segv button:hover{border-color:#b8c3ba}
.segv .badge{flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:48px;
  padding:7px 0;border-radius:10px;background:var(--surface-2);border:1px solid var(--line-2)}
.segv .badge .g{font-size:15px;font-weight:850;color:var(--ink);line-height:1}
.segv .badge .p{font-size:11px;margin-top:3px;color:var(--ink-faint);font-weight:700}
.segv .desc{flex:1;font-size:13px;line-height:1.5;color:var(--ink-soft)}
.segv button[data-on="상"]{border-color:var(--green);background:var(--green-soft)}
.segv button[data-on="상"] .badge{background:var(--green);border-color:var(--green)}
.segv button[data-on="상"] .badge .g,.segv button[data-on="상"] .badge .p{color:#fff}
.segv button[data-on="상"] .desc{color:var(--green-700);font-weight:600}
.segv button[data-on="중"]{border-color:var(--gold);background:#faf3df}
.segv button[data-on="중"] .badge{background:var(--gold);border-color:var(--gold)}
.segv button[data-on="중"] .badge .g,.segv button[data-on="중"] .badge .p{color:#fff}
.segv button[data-on="중"] .desc{color:#8a6a14;font-weight:600}
.segv button[data-on="하"]{border-color:var(--rose);background:var(--rose-soft)}
.segv button[data-on="하"] .badge{background:var(--rose);border-color:var(--rose)}
.segv button[data-on="하"] .badge .g,.segv button[data-on="하"] .badge .p{color:#fff}
.segv button[data-on="하"] .desc{color:#a23f2c;font-weight:600}

/* score visuals */
.scorebar{height:9px;border-radius:6px;background:#eef1ee;overflow:hidden}
.scorebar > i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,var(--green),#3aa676)}
.big-score{font-size:46px;font-weight:850;letter-spacing:-.03em;line-height:1}
.kpi{display:flex;flex-direction:column;gap:5px;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:var(--surface-2)}
.kpi b{font-size:24px;font-weight:850;letter-spacing:-.02em}

/* table */
.tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.tbl th,.tbl td{padding:11px 12px;text-align:left;border-bottom:1px solid var(--line)}
.tbl th{font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-faint);font-weight:800;background:var(--surface-2)}
.tbl tr:last-child td{border-bottom:none}
.tbl .r{text-align:right}

/* tabs */
.tabs{display:flex;gap:4px;background:var(--surface-2);border:1px solid var(--line);padding:5px;border-radius:13px;flex-wrap:wrap}
.tab{appearance:none;border:none;background:transparent;font:inherit;font-weight:750;font-size:13.5px;color:var(--ink-soft);
  padding:9px 14px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:.14s}
.tab.on{background:#fff;color:var(--ink);box-shadow:var(--shadow)}

/* banner */
.banner{display:flex;gap:11px;align-items:flex-start;padding:13px 15px;border-radius:13px;font-size:13.5px;font-weight:600}
.banner.warn{background:#fdf3e6;color:#8a5a14;border:1px solid #f3ddb8}
.banner.info{background:var(--teal-soft);color:#0e6360;border:1px solid #bfe3e1}
.banner.ok{background:var(--green-soft);color:var(--green-700);border:1px solid var(--green-100)}

/* misc */
.divider{height:1px;background:var(--line);margin:18px 0}
.dropzone{border:2px dashed var(--line-2);border-radius:16px;padding:34px 20px;text-align:center;cursor:pointer;transition:.16s;background:var(--surface-2)}
.dropzone:hover{border-color:var(--green);background:var(--green-soft)}
.dropzone.has{border-style:solid;border-color:var(--green);background:var(--green-soft)}
.guide-frame{width:100%;height:520px;border:1px solid var(--line-2);border-radius:12px;background:#fff}
.list-rest{display:flex;flex-direction:column;gap:10px}
.checkrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px;border:1px solid var(--line);border-radius:13px;background:var(--surface);transition:.14s;flex-wrap:wrap}
.checkrow.done{border-color:var(--green-100);background:var(--green-soft)}
.checkrow:hover{box-shadow:var(--shadow)}
.fade{animation:fade .35s ease both}@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
a.link{color:var(--green-700);font-weight:700;text-decoration:none;border-bottom:1.5px solid var(--green-100)}

@media (max-width:860px){
  .layout{grid-template-columns:1fr}
  .rail{position:static}
  .role-grid{grid-template-columns:1fr}
  .wrap > .fade{width:100%!important;max-width:100%!important;margin-left:0!important;margin-right:0!important}
  .pj-root .h1{font-size:26px!important;line-height:1.24}
  .role p,.lede,.muted,.hint{word-break:break-all}
  .steps{display:flex;overflow-x:auto;gap:6px}
  .node{flex-direction:column;align-items:center;min-width:110px;text-align:center}
  .connector{display:none}
  .node .sub{display:none}
}
@media (max-width:640px){
  .wrap{padding:16px 12px 56px}
  .topbar-in{padding:10px 12px;flex-wrap:wrap}
  .topbar-in > .center{width:100%;justify-content:space-between}
  .pj-brand small{max-width:68vw}
  .pad{padding:16px}.pad-lg{padding:18px}
  .role{padding:20px;width:100%}
  .role-grid{grid-template-columns:minmax(0,1fr)}
  .wrap > .fade{width:100%!important;max-width:100%!important;margin-left:0!important;margin-right:0!important}
  .pj-root .h1{font-size:24px!important;line-height:1.22}
  .h2{font-size:18px}
  .role p,.lede,.muted,.hint{word-break:break-all}
  .between{align-items:flex-start;flex-wrap:wrap}
  .btn.lg{width:100%;justify-content:center}
  .row{flex-wrap:wrap}
  .row > .input,.row > select.input{min-width:180px;flex:1 1 220px}
  .segv button{align-items:flex-start;padding:10px}
  .segv .badge{min-width:42px}
  .dropzone{padding:28px 14px}
  .guide-frame{height:420px}
  .tbl{min-width:720px}
}
`;

/* =================================================================== */
/* =====================  SHARED SMALL COMPONENTS  =================== */
/* =================================================================== */
function Banner({ kind = "info", icon, children }) {
  const Icon = icon || (kind === "warn" ? AlertTriangle : kind === "ok" ? CheckCircle2 : Sparkles);
  return (
    <div className={`banner ${kind}`}>
      <Icon size={17} style={{ marginTop: 1, flex: "none" }} />
      <div>{children}</div>
    </div>
  );
}
function ScoreBar({ value, max }) {
  const pct = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return <div className="scorebar"><i style={{ width: pct + "%" }} /></div>;
}
function RatingPicker({ item, value, onChange }) {
  const opt = [["상", item.high, item.hi], ["중", item.mid, item.mi], ["하", item.low, item.lo]];
  return (
    <div className="segv" role="group">
      {opt.map(([g, p, d]) => (
        <button key={g} type="button" data-on={value === g ? g : undefined} onClick={() => onChange(g)}>
          <span className="badge"><span className="g">{g}</span><span className="p">{p}점</span></span>
          <span className="desc">{d || ""}</span>
        </button>
      ))}
    </div>
  );
}
function ItemCard({ item, value, onChange, accent = "var(--green)" }) {
  return (
    <div className="card pad" style={{ marginBottom: 14 }}>
      <div className="center" style={{ alignItems: "flex-start", marginBottom: 11 }}>
        <span className="chip" style={{ background: accent, color: "#fff", borderRadius: 10, fontWeight: 800 }}>
          {item.no}
        </span>
        <div className="h3" style={{ paddingTop: 3 }}>{item.name}</div>
      </div>
      <RatingPicker item={item} value={value} onChange={onChange} />
    </div>
  );
}

/* =================================================================== */
/* ===============================  APP  ============================= */
/* =================================================================== */
export default function App() {
  const [ready, setReady] = useState(false);
  const [storeOk, setStoreOk] = useState(true);
  const [config, setConfig] = useState(null);
  const [me, setMe] = useState(null); // {role, groupId, name, key} | {role:'teacher'}

  useEffect(() => {
    (async () => {
      const ok = await store.probe();
      setStoreOk(ok);
      const cfg = await store.get("pj_config", true);
      setConfig(withClasses(cfg));
      const saved = await store.get("me_identity", false);
      if (saved) setMe(saved);
      setReady(true);
    })();
  }, []);

  const saveConfig = useCallback(async (next) => {
    setConfig(next);
    await store.set("pj_config", next, true);
  }, []);
  const chooseMe = useCallback(async (identity) => {
    setMe(identity);
    await store.set("me_identity", identity, false);
  }, []);
  const reset = useCallback(async () => {
    setMe(null);
    await store.set("me_identity", null, false);
  }, []);

  if (!ready)
    return (
      <div className="pj-root" style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <style>{CSS}{runtimeOptions().themeCss}</style>
        <div className="center muted"><Loader2 className="spin" size={20} /> 불러오는 중…</div>
      </div>
    );

  return (
    <div className="pj-root">
      <style>{CSS}{runtimeOptions().themeCss}</style>
      <header className="topbar">
        <div className="topbar-in">
          <button className="pj-brand" type="button" onClick={reset} aria-label="프로젝트 첫 화면으로 돌아가기">
            <span className="logo"><Sprout size={20} /></span>
            <span>모둠 프로젝트 평가
              <small>{config?.project?.title || "평가 플랫폼"}</small>
            </span>
          </button>
          {me && (
            <div className="center">
              <span className="pill">
                {me.role === "teacher" ? <GraduationCap size={14} /> : <UserCircle2 size={14} />}
                {me.role === "teacher"
                  ? "교사"
                  : `${me.classId && className(config, me.classId) ? className(config, me.classId) + " " : ""}${groupName(config, me.groupId)} · ${me.name}`}
              </span>
              <button className="btn sm ghost" onClick={reset}><LogOut size={15} /> 나가기</button>
            </div>
          )}
        </div>
      </header>

      <div className="wrap">
        {!storeOk && (
          <div style={{ marginBottom: 16 }}>
            <Banner kind="warn">
              공동 저장소에 연결하지 못했습니다. 지금은 <b>이 기기에서만</b> 임시로 동작하며, 동료·협업 평가의 반 전체 공유는 되지 않습니다.
            </Banner>
          </div>
        )}

        {!me && <RoleGate onPick={chooseMe} config={config} />}
        {me?.role === "teacher" && <TeacherApp config={config} saveConfig={saveConfig} />}
        {me?.role === "student" && <StudentApp config={config} me={me} />}
      </div>
    </div>
  );
}

function groupName(config, gid) {
  return config?.groups?.find((g) => g.id === gid)?.name || "모둠";
}
function className(config, cid) {
  return config?.classes?.find((c) => c.id === cid)?.name || "";
}

/* =================================================================== */
/* ============================  ROLE GATE  ========================= */
/* =================================================================== */
function RoleGate({ onPick, config }) {
  const [mode, setMode] = useState(null); // null | 'student' | 'teacher'
  const [cid, setCid] = useState("");
  const [gid, setGid] = useState("");
  const [name, setName] = useState("");
  const classes = config?.classes || [];
  const myGroups = (config?.groups || []).filter((g) => g.classId === cid);
  const group = config?.groups?.find((g) => g.id === gid);

  if (mode === "teacher") {
    return <TeacherGate onBack={() => setMode(null)} onAuthed={(tname) => onPick({ role: "teacher", name: tname })} />;
  }

  if (mode === "student") {
    return (
      <div className="fade" style={{ maxWidth: 520, margin: "30px auto" }}>
        <button className="btn ghost" onClick={() => setMode(null)} style={{ marginBottom: 12 }}>
          <ArrowLeft size={16} /> 뒤로
        </button>
        <div className="card pad-lg">
          <div className="eyebrow"><UserCircle2 size={14} /> 학생 입장</div>
          <h2 className="h1" style={{ fontSize: 23 }}>나를 선택해 주세요</h2>
          {!config ? (
            <Banner kind="warn">아직 선생님이 평가를 준비하지 않았어요. 잠시 후 다시 들어와 주세요.</Banner>
          ) : (
            <>
              <div className="field">
                <label className="label">우리 반</label>
                <select className="input" value={cid} onChange={(e) => { setCid(e.target.value); setGid(""); setName(""); }}>
                  <option value="">반 선택</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {cid && (
                <div className="field">
                  <label className="label">우리 모둠</label>
                  {myGroups.length === 0 ? (
                    <div className="hint">이 반에 아직 모둠이 없어요. 선생님께 알려 주세요.</div>
                  ) : (
                    <select className="input" value={gid} onChange={(e) => { setGid(e.target.value); setName(""); }}>
                      <option value="">모둠 선택</option>
                      {myGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  )}
                </div>
              )}
              {group && (
                <div className="field">
                  <label className="label">내 이름</label>
                  <select className="input" value={name} onChange={(e) => setName(e.target.value)}>
                    <option value="">이름 선택</option>
                    {group.members.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              )}
              <button className="btn primary lg" disabled={!cid || !gid || !name} style={{ width: "100%", marginTop: 6 }}
                onClick={() => onPick({ role: "student", classId: cid, groupId: gid, name, key: `${gid}::${name}` })}>
                평가 시작하기 <ChevronRight size={17} />
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fade" style={{ maxWidth: 760, margin: "26px auto" }}>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div className="eyebrow" style={{ justifyContent: "center" }}><Sprout size={14} /> 프로젝트 평가 플랫폼</div>
        <h1 className="h1" style={{ fontSize: 30 }}>오늘은 어떤 역할인가요?</h1>
        <p className="lede" style={{ margin: "0 auto" }}>
          선생님은 평가를 만들고 결과를 모아보고, 학생은 결과물 평가부터 성찰까지 차례대로 진행해요.
        </p>
      </div>
      <div className="role-grid">
        <div className="role" onClick={() => setMode("teacher")}>
          <div className="ic" style={{ background: "var(--green-soft)", color: "var(--green-700)" }}><GraduationCap size={28} /></div>
          <div className="h2">선생님</div>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
            프로젝트·루브릭·모둠을 설정하고, 학생 평가 링크를 배포하고, 모든 결과를 한 번에 확인합니다.
          </p>
          <div className="pill green" style={{ marginTop: 14 }}>설정 · 통합 조회 <ChevronRight size={13} /></div>
        </div>
        <div className="role" onClick={() => setMode("student")}>
          <div className="ic" style={{ background: "var(--accent-soft)", color: "var(--accent-700)" }}><UserCircle2 size={28} /></div>
          <div className="h2">학생</div>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
            결과물 평가 → 동료평가 → 협업평가 → 결과 확인 → 프로젝트 성찰을 순서대로 진행합니다.
          </p>
          <div className="pill accent" style={{ marginTop: 14 }}>5단계 평가 여정 <ChevronRight size={13} /></div>
        </div>
      </div>
    </div>
  );
}

/* =================================================================== */
/* ========================  TEACHER GATE (인증)  =================== */
/* =================================================================== */
function TeacherGate({ onAuthed, onBack }) {
  const [loading, setLoading] = useState(true);
  const [acct, setAcct] = useState(runtimeOptions().teacherAuth); // {hash}
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const a = await store.get("pj_teacher_auth", true);
      setAcct(a?.hash ? { hash: a.hash } : runtimeOptions().teacherAuth);
      setLoading(false);
    })();
  }, []);

  const login = () => {
    setErr("");
    if (hashStr(pw) !== acct.hash) return setErr("비밀번호가 맞지 않아요. 다시 입력해 주세요.");
    onAuthed("");
  };

  const onEnter = (fn) => (e) => { if (e.key === "Enter") fn(); };

  return (
    <div className="fade" style={{ maxWidth: 460, margin: "30px auto" }}>
      <button className="btn ghost" onClick={onBack} style={{ marginBottom: 12 }}>
        <ArrowLeft size={16} /> 뒤로
      </button>
      <div className="card pad-lg">
        <div className="eyebrow"><GraduationCap size={14} /> 선생님 입장</div>

        {loading ? (
          <div className="center muted" style={{ padding: "26px 0" }}>
            <Loader2 className="spin" size={18} /> 확인 중…
          </div>
        ) : (
          <>
            <h2 className="h1" style={{ fontSize: 22 }}>교사용 비밀번호 입력</h2>
            <p className="muted" style={{ fontSize: 13.5, marginTop: -4, marginBottom: 8 }}>
              비밀번호를 입력하면 평가 설정과 결과 화면으로 들어갑니다.
            </p>
            <div className="field">
              <label className="label">비밀번호</label>
              <input className="input" type="password" value={pw} placeholder="비밀번호" autoFocus
                onChange={(e) => setPw(e.target.value)} onKeyDown={onEnter(login)} />
            </div>
            {err && <Banner kind="warn">{err}</Banner>}
            <button className="btn primary lg" style={{ width: "100%", marginTop: 6 }} onClick={login}>
              <GraduationCap size={16} /> 들어가기
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* =================================================================== */
/* ============================  TEACHER  =========================== */
/* =================================================================== */
function TeacherApp({ config, saveConfig }) {
  const [tab, setTab] = useState("setup");
  const [draft, setDraft] = useState(withClasses(config));
  const [savedFlash, setSavedFlash] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  const doSave = async () => {
    await saveConfig(draft);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  const TABS = [
    ["setup", "프로젝트 설정", Settings],
    ["rubric", "평가 루브릭", ClipboardList],
    ["groups", "모둠 구성", Users],
    ["results", "결과 통합조회", BarChart3],
  ];

  return (
    <div className="fade">
      <div className="between" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow"><GraduationCap size={14} /> 교사용 페이지</div>
          <h1 className="h1">{draft.project.title || "새 프로젝트"}</h1>
        </div>
        <div className="center">
          {savedFlash && <span className="pill green"><CheckCircle2 size={14} /> 저장됨</span>}
          {dirty && <span className="pill accent">저장 안 된 변경사항</span>}
          <button className="btn primary" onClick={doSave} disabled={!dirty}><Save size={16} /> 변경사항 저장</button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 18 }}>
        {TABS.map(([k, t, Ic]) => (
          <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
            <Ic size={15} /> {t}
          </button>
        ))}
      </div>

      {tab === "setup" && <TeacherSetup draft={draft} setDraft={setDraft} configSaved={!!config} />}
      {tab === "rubric" && <TeacherRubric draft={draft} setDraft={setDraft} />}
      {tab === "groups" && <TeacherGroups draft={draft} setDraft={setDraft} />}
      {tab === "results" && <TeacherResults config={config} />}
    </div>
  );
}

function TeacherSetup({ draft, setDraft, configSaved }) {
  const set = (path, val) => setDraft((d) => {
    const n = structuredClone(d);
    if (path === "title") n.project.title = val;
    if (path === "subject") n.project.subject = val;
    if (path === "desc") n.project.desc = val;
    if (path === "self") n.settings.selfInCollab = val;
    return n;
  });
  const loadExample = () => setDraft(getDefaultConfig());

  const [resetMsg, setResetMsg] = useState(null); // { ok, text }
  const [resetting, setResetting] = useState(false);
  const resetData = async () => {
    setResetting(true); setResetMsg(null);
    try {
      const prefixes = ["pj_sub_", "pj_draft_", "pj_peer_", "pj_collab_", "pj_reflect_"];
      let n = 0;
      for (const pre of prefixes) {
        const keys = await store.list(pre, true);
        for (const k of keys) { await store.set(k, null, true); n++; }
      }
      await markResultsChanged("reset");
      await markReflectionsChanged("reset");
      setResetMsg({ ok: true, text: `학생 제출·평가 데이터를 모두 비웠어요(${n}건). 학생들은 1단계부터 다시 시작하고, 최종 제출 화면도 깨끗한 업로드 화면으로 나옵니다.` });
    } catch (e) {
      setResetMsg({ ok: false, text: "초기화 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." });
    } finally { setResetting(false); }
  };

  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 22 }}>
      <div style={{ flex: "1 1 460px" }}>
        <div className="card pad-lg">
          <h2 className="h2" style={{ marginBottom: 14 }}>프로젝트 정보</h2>
          <div className="field">
            <label className="label">프로젝트 이름</label>
            <input className="input" value={draft.project.title} onChange={(e) => set("title", e.target.value)} placeholder="예: 식물 안내서 만들기" />
          </div>
          <div className="field">
            <label className="label">주제 (AI 채점 기준이 됩니다)</label>
            <input className="input" value={draft.project.subject} onChange={(e) => set("subject", e.target.value)} placeholder="예: 식물" />
            <span className="hint">AI가 결과물을 채점할 때 이 주제에 얼마나 맞는지 판단합니다.</span>
          </div>
          <div className="field">
            <label className="label">학생 안내 설명</label>
            <textarea className="textarea" value={draft.project.desc} onChange={(e) => set("desc", e.target.value)} placeholder="학생들이 보게 될 프로젝트 설명" />
          </div>
          <div className="divider" />
          <label className="checkrow" style={{ cursor: "pointer" }}>
            <div>
              <div className="h3">협업 평가에 자기 자신도 포함</div>
              <div className="hint">끄면 모둠원은 자신을 제외한 친구들만 평가합니다.</div>
            </div>
            <input type="checkbox" checked={draft.settings.selfInCollab} onChange={(e) => set("self", e.target.checked)} style={{ width: 20, height: 20 }} />
          </label>
        </div>
      </div>

      <div style={{ flex: "1 1 320px" }}>
        <div className="card pad-lg" style={{ marginBottom: 16 }}>
          <div className="eyebrow"><Link2 size={14} /> 학생 링크 배포</div>
          <h3 className="h3" style={{ margin: "8px 0 8px" }}>이 화면 링크 하나를 반 전체에 공유하세요</h3>
          <p className="muted" style={{ fontSize: 13.5 }}>
            학생들은 같은 링크로 들어와 <b>학생 → 모둠 → 이름</b>을 선택하고 평가를 시작합니다.
            동료·협업 평가 데이터는 모두가 함께 보는 공동 저장소에 모입니다.
          </p>
          <Banner kind="info" >{configSaved ? "평가가 게시되었습니다. 학생들이 입장할 수 있어요." : "‘변경사항 저장’을 누르면 학생들이 입장할 수 있게 게시됩니다."}</Banner>
        </div>
        <div className="card pad-lg">
          <div className="eyebrow"><BookOpen size={14} /> 빠른 시작</div>
          <p className="muted" style={{ fontSize: 13.5, margin: "8px 0 12px" }}>
            식물 안내서 예시(세 평가 · 동료 55 + 협업 45)로 한 번에 채워볼 수 있어요. 다른 주제는 위 ‘루브릭 편집’ 탭에서 붙여넣기로 바꾸면 됩니다.
          </p>
          <button className="btn" onClick={loadExample}><RefreshCw size={15} /> 예시 루브릭 불러오기</button>
        </div>

        <div className="card pad-lg" style={{ marginTop: 16, borderColor: "var(--rose)" }}>
          <div className="eyebrow" style={{ color: "var(--rose)" }}><Trash2 size={14} /> 평가 데이터 초기화</div>
          <p className="muted" style={{ fontSize: 13.5, margin: "8px 0 12px" }}>
            연습으로 올린 초안·최종본·동료평가·협업평가·성찰을 <b>모두 비웁니다.</b> 공개수업 전, 깨끗한 상태로 시작할 때 한 번 누르세요. 프로젝트 설정·반·모둠은 그대로 유지됩니다. <b>되돌릴 수 없어요.</b>
          </p>
          {resetMsg && <div style={{ marginBottom: 10 }}><Banner kind={resetMsg.ok ? "ok" : "warn"}>{resetMsg.text}</Banner></div>}
          {resetting
            ? <button className="btn" disabled><Loader2 className="spin" size={15} /> 비우는 중…</button>
            : <ConfirmDelete onConfirm={resetData} label="학생 제출·평가 모두 비우기" prompt="정말 모두 지울까요?" small={false} />}
        </div>
      </div>
    </div>
  );
}

function TeacherRubric({ draft, setDraft }) {
  const cats = [
    ["aiFeedback", "var(--teal)", Sparkles],
    ["peer", "var(--accent)", Users],
    ["collab", "var(--violet)", Handshake],
  ];
  const updItem = (cat, no, field, val) => setDraft((d) => {
    const n = structuredClone(d);
    const it = n.rubric[cat].items.find((x) => x.no === no);
    it[field] = field === "name" || field.length === 2 ? val : Number(val);
    return n;
  });
  const catMax = (cat) => (draft.rubric[cat]?.items || []).reduce((s, it) => s + (Number(it.high) || 0), 0);
  const peerM = catMax("peer"), collabM = catMax("collab"), aiM = catMax("aiFeedback");

  const openQs = draft.rubric.peerOpen || [];
  const updOpen = (i, field, val) => setDraft((d) => { const n = structuredClone(d); n.rubric.peerOpen[i][field] = val; return n; });
  const addOpen = () => setDraft((d) => { const n = structuredClone(d); n.rubric.peerOpen = n.rubric.peerOpen || []; n.rubric.peerOpen.push({ id: "q" + Date.now().toString(36), label: "새 질문", placeholder: "" }); return n; });
  const delOpen = (i) => setDraft((d) => { const n = structuredClone(d); n.rubric.peerOpen.splice(i, 1); return n; });

  const cOpenQs = draft.rubric.collabOpen || [];
  const updCOpen = (i, field, val) => setDraft((d) => { const n = structuredClone(d); n.rubric.collabOpen[i][field] = val; return n; });
  const addCOpen = () => setDraft((d) => { const n = structuredClone(d); n.rubric.collabOpen = n.rubric.collabOpen || []; n.rubric.collabOpen.push({ id: "q" + Date.now().toString(36), label: "새 질문", placeholder: "" }); return n; });
  const delCOpen = (i) => setDraft((d) => { const n = structuredClone(d); n.rubric.collabOpen.splice(i, 1); return n; });

  // ----- 붙여넣기로 가져오기 -----
  const [pasteText, setPasteText] = useState("");
  const [importInfo, setImportInfo] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);

  const applyParsed = (parsed) => {
    const c = parsed.counts || {};
    if (!parsed.rubric || (!c.aiFeedback && !c.peer && !c.collab && !c.peerOpen)) {
      setImportInfo({ ok: false, counts: c, warnings: ["붙여넣은 글에서 평가 기준을 찾지 못했어요. 아래 형식(■ 평가 N … 상/중/하)을 확인해 주세요."] });
      return;
    }
    setDraft((d) => {
      const n = structuredClone(d);
      if (parsed.rubric.aiFeedback) n.rubric.aiFeedback = parsed.rubric.aiFeedback;
      if (parsed.rubric.peer) n.rubric.peer = parsed.rubric.peer;
      if (parsed.rubric.collab) n.rubric.collab = parsed.rubric.collab;
      if (parsed.rubric.peerOpen) n.rubric.peerOpen = parsed.rubric.peerOpen;
      if (parsed.rubric.collabOpen) n.rubric.collabOpen = parsed.rubric.collabOpen;
      return n;
    });
    setImportInfo({ ok: true, counts: c, warnings: parsed.warnings || [] });
  };

  const importPaste = () => applyParsed(parseRubricText(pasteText));

  const importViaAI = async () => {
    if (!pasteText.trim()) return;
    setAiBusy(true); setImportInfo(null);
    try {
      const prompt =
`다음은 초등학교 프로젝트의 평가 루브릭입니다. 아래 텍스트를 읽고 JSON으로 정리하세요.
- 평가 종류: aiFeedback(결과물·AI 피드백용), peer(동료 양적평가), collab(협업 평가). 텍스트에 없는 종류는 생략.
- 각 종류의 items 배열 원소: {"name","high","mid","low","hi","mi","lo"} (high/mid/low=상/중/하 점수 정수, hi/mi/lo=상/중/하 설명 문장)
- 점수가 텍스트에 없으면 high는 적절히 정하고 mid=round(high*0.8), low=round(high*0.6).
- peerOpen 배열 원소: {"label","placeholder"} (동료 주관식 문항)
- collabOpen 배열 원소: {"label","placeholder"} (협업 주관식 문항, 모둠원끼리 주고받는 글)
다른 말 없이 JSON만 출력:
{"aiFeedback":{"items":[...]},"peer":{"items":[...]},"collab":{"items":[...]},"peerOpen":[...],"collabOpen":[...]}

[루브릭 텍스트]
${pasteText}`;
      const text = await callClaude([{ role: "user", content: prompt }], 3000);
      const p = extractJSON(text);
      if (!p) { setImportInfo({ ok: false, counts: {}, warnings: ["AI가 정리하지 못했어요. ‘형식 그대로 가져오기’를 써 보세요."] }); return; }
      const mkItems = (arr) => (arr || []).map((it, i) => ({ no: i + 1, name: String(it.name || `항목 ${i + 1}`), high: Number(it.high) || 0, mid: Number(it.mid) || 0, low: Number(it.low) || 0, hi: String(it.hi || ""), mi: String(it.mi || ""), lo: String(it.lo || "") }));
      const R = {};
      if (p.aiFeedback?.items) R.aiFeedback = { title: DEFAULT_CONFIG.rubric.aiFeedback.title, desc: DEFAULT_CONFIG.rubric.aiFeedback.desc, items: mkItems(p.aiFeedback.items) };
      if (p.peer?.items) R.peer = { title: DEFAULT_CONFIG.rubric.peer.title, desc: DEFAULT_CONFIG.rubric.peer.desc, items: mkItems(p.peer.items) };
      if (p.collab?.items) R.collab = { title: DEFAULT_CONFIG.rubric.collab.title, desc: DEFAULT_CONFIG.rubric.collab.desc, items: mkItems(p.collab.items) };
      if (Array.isArray(p.peerOpen)) R.peerOpen = p.peerOpen.map((q, i) => ({ id: "q" + (i + 1), label: String(q.label || `질문 ${i + 1}`), placeholder: String(q.placeholder || "") }));
      if (Array.isArray(p.collabOpen)) R.collabOpen = p.collabOpen.map((q, i) => ({ id: "q" + (i + 1), label: String(q.label || `질문 ${i + 1}`), placeholder: String(q.placeholder || "") }));
      const counts = { aiFeedback: R.aiFeedback ? R.aiFeedback.items.length : 0, peer: R.peer ? R.peer.items.length : 0, collab: R.collab ? R.collab.items.length : 0, peerOpen: R.peerOpen ? R.peerOpen.length : 0, collabOpen: R.collabOpen ? R.collabOpen.length : 0 };
      applyParsed({ rubric: R, counts, warnings: [] });
    } catch (e) {
      setImportInfo({ ok: false, counts: {}, warnings: ["AI 변환 중 문제가 생겼어요. ‘형식 그대로 가져오기’를 써 보세요."] });
    } finally { setAiBusy(false); }
  };

  return (
    <div className="fade">
      {/* 붙여넣기로 가져오기 */}
      <div className="card pad-lg" style={{ marginBottom: 18, borderColor: "var(--teal)" }}>
        <div className="center" style={{ marginBottom: 8 }}>
          <span className="chip" style={{ background: "var(--teal)", color: "#fff" }}><ClipboardList size={18} /></span>
          <div>
            <div className="h2">루브릭 붙여넣기로 가져오기</div>
            <div className="hint" style={{ maxWidth: 560 }}>아래에 평가 기준 텍스트를 붙여넣고 가져오면, 세 평가(AI 피드백 / 동료 양적 / 협업)와 주관식 문항이 한 번에 채워집니다. 식물 안내서가 아니어도 같은 형식이면 동작해요.</div>
          </div>
        </div>
        <textarea className="textarea" style={{ minHeight: 150, fontSize: 13, fontFamily: "ui-monospace, monospace" }}
          placeholder={"여기에 붙여넣으세요. 예)\n■ 평가 1 — 결과물 평가 · AI 피드백용 (100점)\n1. 구조·기능·정확성 (20/16/12)\n   상: ...\n   중: ...\n   하: ...\n..."}
          value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
        <div className="between" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
          <span className="hint">‘형식 그대로’는 위 예시 형식, ‘AI로 정리’는 표·메모 등 자유 형식도 맞춰줍니다.</span>
          <div className="center" style={{ gap: 8 }}>
            <button className="btn sm" disabled={aiBusy} onClick={importViaAI}>{aiBusy ? <><Loader2 className="spin" size={15} /> 정리 중…</> : <><Sparkles size={15} /> AI로 정리해서 가져오기</>}</button>
            <button className="btn primary sm" disabled={!pasteText.trim() || aiBusy} onClick={importPaste}><ClipboardList size={15} /> 형식 그대로 가져오기</button>
          </div>
        </div>
        {importInfo && (
          <div style={{ marginTop: 12 }}>
            {importInfo.ok ? (
              <Banner kind="ok">
                불러왔어요 — AI 피드백 {importInfo.counts.aiFeedback}개 · 동료 {importInfo.counts.peer}개 · 협업 {importInfo.counts.collab}개 · 동료 주관식 {importInfo.counts.peerOpen}개 · 협업 주관식 {importInfo.counts.collabOpen || 0}개. 아래에서 확인하고 <b>저장</b>하세요.
                {importInfo.warnings?.length > 0 && <div style={{ marginTop: 6, fontSize: 12.5 }}>· {importInfo.warnings.join(" · ")}</div>}
              </Banner>
            ) : (
              <Banner kind="warn">{importInfo.warnings?.join(" · ")}</Banner>
            )}
          </div>
        )}
      </div>

      <Banner kind="info">
        <b>점수 구조</b> · 최종 점수 = <b>동료 평가 {peerM}점 + 협업 평가 {collabM}점 = {peerM + collabM}점</b> (두 점수를 그대로 합산). <br />
        ‘동료 양적평가’는 다른 모둠 평균, ‘협업 평가’는 모둠원 평균이 그대로 점수가 됩니다. ‘AI 피드백용’({aiM}점)은 1단계에서 결과물 수정용 피드백을 줄 때만 쓰이고 <b>최종 점수에는 반영되지 않습니다.</b>
      </Banner>
      <div style={{ height: 16 }} />
      {cats.map(([cat, color, Ic]) => (
        <div key={cat} className="card pad-lg" style={{ marginBottom: 18 }}>
          <div className="between" style={{ marginBottom: 6 }}>
            <div className="center">
              <span className="chip" style={{ background: color, color: "#fff" }}><Ic size={18} /></span>
              <div>
                <div className="h2">{draft.rubric[cat].title}</div>
                <div className="hint" style={{ maxWidth: 520 }}>{draft.rubric[cat].desc}</div>
              </div>
            </div>
            <span className="pill" style={{ background: color, color: "#fff", border: "none" }}>{catMax(cat)}점{cat === "collab" ? " (1인당)" : ""}</span>
          </div>
          <div className="divider" />
          {draft.rubric[cat].items.map((it) => (
            <div key={it.no} style={{ padding: "14px 0", borderTop: "1px dashed var(--line)" }}>
              <div className="row" style={{ alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <span className="chip" style={{ background: "var(--surface-2)", border: "1px solid var(--line-2)", fontWeight: 800, fontSize: 13 }}>{it.no}</span>
                <input className="input" style={{ flex: "1 1 220px" }} value={it.name} onChange={(e) => updItem(cat, it.no, "name", e.target.value)} />
                <div className="center" style={{ gap: 6 }}>
                  {["high", "mid", "low"].map((lv, i) => (
                    <div key={lv} className="center" style={{ gap: 4 }}>
                      <span className="hint" style={{ width: 22 }}>{["상", "중", "하"][i]}</span>
                      <input className="input num" type="number" value={it[lv]} onChange={(e) => updItem(cat, it.no, lv, e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {[["hi", "상 설명"], ["mi", "중 설명"], ["lo", "하 설명"]].map(([f, ph]) => (
                  <textarea key={f} className="textarea" style={{ flex: "1 1 200px", minHeight: 60, fontSize: 13 }}
                    placeholder={ph} value={it[f]} onChange={(e) => updItem(cat, it.no, f, e.target.value)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* 동료평가 주관식 문항 */}
      <div className="card pad-lg" style={{ marginBottom: 18 }}>
        <div className="between" style={{ marginBottom: 6 }}>
          <div className="center">
            <span className="chip" style={{ background: "var(--accent)", color: "#fff" }}><PenLine size={18} /></span>
            <div>
              <div className="h2">동료평가 주관식 문항</div>
              <div className="hint" style={{ maxWidth: 520 }}>학생이 다른 모둠 결과물에 글로 답하는 질적 평가 문항입니다. 작성한 내용은 해당 모둠에게 그대로 전달됩니다.</div>
            </div>
          </div>
          <button className="btn sm" onClick={addOpen}><Plus size={15} /> 문항 추가</button>
        </div>
        <div className="divider" />
        {openQs.length === 0 && <div className="hint">주관식 문항이 없습니다. ‘문항 추가’로 만들어 주세요.</div>}
        {openQs.map((q, i) => (
          <div key={q.id} style={{ padding: "12px 0", borderTop: "1px dashed var(--line)" }}>
            <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input className="input" style={{ flex: "1 1 180px" }} placeholder="문항 제목 (예: 좋은 점)" value={q.label} onChange={(e) => updOpen(i, "label", e.target.value)} />
              <input className="input" style={{ flex: "2 1 280px" }} placeholder="학생에게 보일 안내 문구" value={q.placeholder} onChange={(e) => updOpen(i, "placeholder", e.target.value)} />
              <button className="btn sm ghost" onClick={() => delOpen(i)}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>

      {/* 협업평가 주관식 문항 */}
      <div className="card pad-lg" style={{ marginBottom: 18 }}>
        <div className="between" style={{ marginBottom: 6 }}>
          <div className="center">
            <span className="chip" style={{ background: "var(--violet)", color: "#fff" }}><PenLine size={18} /></span>
            <div>
              <div className="h2">협업평가 주관식 문항 <span className="pill gray" style={{ fontSize: 11, verticalAlign: 2 }}>선택 입력</span></div>
              <div className="hint" style={{ maxWidth: 520 }}>학생이 같은 모둠 친구 한 명 한 명에게 글로 남기는 문항입니다. <b>쓰고 싶은 학생만</b> 작성하며, 작성한 내용은 받는 친구에게 익명으로 전달됩니다. (자기 자신에게는 표시되지 않음)</div>
            </div>
          </div>
          <button className="btn sm" onClick={addCOpen}><Plus size={15} /> 문항 추가</button>
        </div>
        <div className="divider" />
        {cOpenQs.length === 0 && <div className="hint">협업 주관식 문항이 없습니다. ‘문항 추가’로 만들면 학생 화면에 나타납니다.</div>}
        {cOpenQs.map((q, i) => (
          <div key={q.id} style={{ padding: "12px 0", borderTop: "1px dashed var(--line)" }}>
            <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input className="input" style={{ flex: "1 1 180px" }} placeholder="문항 제목 (예: 잘한 점)" value={q.label} onChange={(e) => updCOpen(i, "label", e.target.value)} />
              <input className="input" style={{ flex: "2 1 280px" }} placeholder="학생에게 보일 안내 문구" value={q.placeholder} onChange={(e) => updCOpen(i, "placeholder", e.target.value)} />
              <button className="btn sm ghost" onClick={() => delCOpen(i)}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfirmDelete({ onConfirm, label = "삭제", small = true, prompt = "삭제할까요?", Icon = Trash2 }) {
  const [armed, setArmed] = useState(false);
  const sz = small ? "sm" : "";
  if (!armed) return <button className={`btn ${sz} ghost`} onClick={() => setArmed(true)}><Icon size={15} /> {label}</button>;
  return (
    <span className="center" style={{ gap: 6 }}>
      <span className="hint" style={{ color: "var(--rose)" }}>{prompt}</span>
      <button className={`btn ${sz}`} style={{ background: "var(--rose)", color: "#fff", borderColor: "var(--rose)" }} onClick={onConfirm}>네</button>
      <button className={`btn ${sz} ghost`} onClick={() => setArmed(false)}>취소</button>
    </span>
  );
}

function TeacherGroups({ draft, setDraft }) {
  const [cname, setCname] = useState("");
  const [gByClass, setGByClass] = useState({}); // cid -> 입력값
  const classes = draft.classes || [];

  const addClass = () => {
    if (!cname.trim()) return;
    setDraft((d) => {
      const n = structuredClone(d);
      n.classes = n.classes || [];
      n.classes.push({ id: "c" + Date.now().toString(36), name: cname.trim() });
      return n;
    });
    setCname("");
  };
  const renameClass = (cid, name) => setDraft((d) => {
    const n = structuredClone(d);
    const c = n.classes.find((x) => x.id === cid);
    if (c) c.name = name;
    return n;
  });
  const delClass = (cid) => setDraft((d) => {
    const n = structuredClone(d);
    n.classes = (n.classes || []).filter((c) => c.id !== cid);
    n.groups = (n.groups || []).filter((g) => g.classId !== cid);
    return n;
  });
  const addGroup = (cid) => {
    const name = (gByClass[cid] || "").trim();
    if (!name) return;
    setDraft((d) => {
      const n = structuredClone(d);
      n.groups.push({ id: "g" + Date.now().toString(36), classId: cid, name, members: [] });
      return n;
    });
    setGByClass((s) => ({ ...s, [cid]: "" }));
  };
  const delGroup = (id) => setDraft((d) => ({ ...d, groups: d.groups.filter((g) => g.id !== id) }));
  const addMember = (gid, name) => {
    if (!name.trim()) return;
    setDraft((d) => {
      const n = structuredClone(d);
      const g = n.groups.find((x) => x.id === gid);
      if (!g.members.includes(name.trim())) g.members.push(name.trim());
      return n;
    });
  };
  const delMember = (gid, name) => setDraft((d) => {
    const n = structuredClone(d);
    const g = n.groups.find((x) => x.id === gid);
    g.members = g.members.filter((m) => m !== name);
    return n;
  });

  return (
    <div className="fade">
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="eyebrow"><Users size={14} /> 학급(반) 관리</div>
        <p className="hint" style={{ margin: "6px 0 12px" }}>
          가르치는 반을 먼저 추가하고, 각 반 안에 모둠을 만드세요. 학생은 자기 반의 모둠만 볼 수 있고, 동료평가도 같은 반 안에서만 이루어집니다.
        </p>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" placeholder="새 반 이름 (예: 3학년 2반)" value={cname}
            onChange={(e) => setCname(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addClass()} />
          <button className="btn primary" onClick={addClass}><Plus size={16} /> 반 추가</button>
        </div>
      </div>

      {classes.length === 0 && <Banner kind="warn">아직 반이 없습니다. 위에서 반을 먼저 추가해 주세요.</Banner>}

      {classes.map((c) => {
        const cg = draft.groups.filter((g) => g.classId === c.id);
        return (
          <div key={c.id} className="card pad-lg" style={{ marginBottom: 16 }}>
            <div className="between" style={{ marginBottom: 2, gap: 10 }}>
              <input className="input" value={c.name} onChange={(e) => renameClass(c.id, e.target.value)}
                style={{ fontWeight: 800, fontSize: 17, maxWidth: 280, border: "1px solid transparent", background: "transparent", padding: "4px 6px" }} />
              <ConfirmDelete onConfirm={() => delClass(c.id)} label="반 삭제" />
            </div>
            <div className="hint" style={{ marginBottom: 12 }}>모둠 {cg.length}개{cg.length > 0 ? ` · 학생 ${cg.reduce((s, g) => s + g.members.length, 0)}명` : ""}</div>

            <div className="row" style={{ gap: 8, marginBottom: 14 }}>
              <input className="input" placeholder="이 반에 모둠 추가 (예: 1모둠)" value={gByClass[c.id] || ""}
                onChange={(e) => setGByClass((s) => ({ ...s, [c.id]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addGroup(c.id)} />
              <button className="btn" onClick={() => addGroup(c.id)}><Plus size={16} /> 모둠</button>
            </div>

            <div className="row" style={{ flexWrap: "wrap", gap: 14 }}>
              {cg.length === 0 && <div className="hint">아직 모둠이 없습니다. 위 칸에서 모둠을 추가하세요.</div>}
              {cg.map((g) => (
                <div key={g.id} className="card pad" style={{ flex: "1 1 300px", background: "var(--surface-2)" }}>
                  <div className="between" style={{ marginBottom: 12 }}>
                    <div className="h3">{g.name}</div>
                    <button className="btn sm ghost" onClick={() => delGroup(g.id)}><Trash2 size={15} /></button>
                  </div>
                  <div className="list-rest" style={{ marginBottom: 12 }}>
                    {g.members.length === 0 && <div className="hint">아직 모둠원이 없습니다.</div>}
                    {g.members.map((m) => (
                      <div key={m} className="checkrow" style={{ padding: "9px 12px" }}>
                        <span className="center"><UserCircle2 size={16} className="muted" /> {m}</span>
                        <button className="btn sm ghost" onClick={() => delMember(g.id, m)}><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                  <MemberAdder onAdd={(name) => addMember(g.id, name)} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
function MemberAdder({ onAdd }) {
  const [v, setV] = useState("");
  return (
    <div className="row" style={{ gap: 6 }}>
      <input className="input" placeholder="모둠원 이름" value={v} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { onAdd(v); setV(""); } }} />
      <button className="btn sm" onClick={() => { onAdd(v); setV(""); }}><Plus size={15} /></button>
    </div>
  );
}

/* ---------- 교사: 통합 결과 ---------- */
function TeacherResults({ config }) {
  const [data, setData] = useState(null);
  const [reflections, setReflections] = useState([]);
  const [stageControl, setStageControl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cls, setCls] = useState("all");
  const [batchPrinting, setBatchPrinting] = useState(false);
  const [stageSaving, setStageSaving] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    const [results, refl, stages] = await Promise.all([
      aggregateAll(config),
      aggregateReflections(config),
      store.get(STUDENT_STAGE_CONTROL_KEY, true),
    ]);
    setData(results);
    setReflections(refl.reflections || []);
    setStageControl(stages || {});
    setLoading(false);
  }, [config]);
  useEffect(() => { if (config) load(); }, [config, load]);

  if (!config) return <Banner kind="warn">먼저 프로젝트를 설정하고 저장해 주세요.</Banner>;
  if (loading) return <div className="center muted" style={{ padding: 40 }}><Loader2 className="spin" size={18} /> 결과를 모으는 중…</div>;

  const classes = config.classes || [];
  const gClass = Object.fromEntries((config.groups || []).map((g) => [g.id, g.classId]));
  const isClassSummary = cls === "all" && classes.length > 1;
  const avgValue = (rows, key) => {
    const values = rows.map((row) => row[key]).filter((v) => Number.isFinite(v));
    return values.length ? avg(values) : null;
  };
  const classSummaryRows = classes.map((c) => {
    const rows = data.groups.filter((g) => g.classId === c.id);
    const peerScore = avgValue(rows, "peerScore");
    const collabScore = avgValue(rows, "collabScore");
    const hasAny = peerScore != null || collabScore != null;
    return {
      id: c.id,
      classId: c.id,
      name: c.name,
      aiFeedback: avgValue(rows, "aiFeedback"),
      peerScore,
      peerN: rows.reduce((sum, g) => sum + (g.peerN || 0), 0),
      collabScore,
      collabN: rows.reduce((sum, g) => sum + (g.collabN || 0), 0),
      total: hasAny ? (peerScore ?? 0) + (collabScore ?? 0) : null,
      submitted: rows.length > 0 && rows.every((g) => g.submitted),
      submittedCount: rows.filter((g) => g.submitted).length,
      groupCount: rows.length,
    };
  });
  const shown = isClassSummary ? classSummaryRows : data.groups.filter((g) => cls === "all" || g.classId === cls);
  const shownStudents = (data.students || []).filter((s) => cls === "all" || s.classId === cls);
  const shownRefl = reflections.filter((r) => cls === "all" || gClass[r.groupId] === cls);
  const totalMax = data.peerMax + data.collabMax;
  const chartMax = Math.max(100, data.aiMax, data.peerMax, data.collabMax);
  const tableColSpan = isClassSummary || !(cls === "all" && classes.length > 1) ? 6 : 7;
  const studentTableColSpan = classes.length > 1 ? 8 : 7;
  const selectedClassIds = cls === "all" ? classes.map((c) => c.id) : [cls].filter(Boolean);
  const selectedStageValues = selectedClassIds.map((cid) => openStudentStepForClass(stageControl, cid));
  const selectedStage = selectedStageValues.length > 0 && selectedStageValues.every((value) => value === selectedStageValues[0])
    ? selectedStageValues[0]
    : "mixed";
  const selectedStageLabel = selectedStage === "mixed"
    ? "반마다 다름"
    : TEACHER_STAGE_OPTIONS.find((option) => option.key === selectedStage)?.label || "최종 제출";
  const stageScopeLabel = cls === "all" ? "전체 반" : className(config, cls) || "선택한 반";

  const chartData = shown.map((g) => ({
    name: g.name,
    AI산출물: round1(g.aiFeedback ?? 0),
    동료평가: round1(g.peerScore ?? 0),
    협업평가: round1(g.collabScore ?? 0),
  }));

  const printStudentResultBatch = async () => {
    if (shownStudents.length === 0) return;
    setBatchPrinting(true);
    try {
      const selectedGroupIds = Array.from(new Set(shownStudents.map((s) => s.groupId).filter(Boolean)));
      const draftEntries = await mapLimit(selectedGroupIds, STORE_READ_CONCURRENCY, async (gid) => [
        gid,
        await store.get("pj_draft_" + gid, true),
      ]);
      const draftsByGroupId = Object.fromEntries(draftEntries.filter(([, draft]) => draft));
      const reflectionsByKey = Object.fromEntries(
        reflections.filter((r) => r?.by).map((r) => [r.by, r]),
      );
      const groupsById = Object.fromEntries((config.groups || []).map((g) => [g.id, g]));
      const scopeLabel = cls === "all" ? "전체" : className(config, cls) || "선택한 반";
      openStudentResultBatchPdf({
        config,
        students: shownStudents,
        groupsById,
        draftsByGroupId,
        reflectionsByKey,
        totalMax,
        title: `${scopeLabel} 학생 개인 결과지`,
      });
    } finally {
      setBatchPrinting(false);
    }
  };

  const openStage = async (stageKey) => {
    if (selectedClassIds.length === 0) return;
    setStageSaving(stageKey);
    try {
      const next = {
        ...(stageControl || {}),
        byClass: { ...((stageControl && stageControl.byClass) || {}) },
        updatedAt: Date.now(),
      };
      selectedClassIds.forEach((cid) => {
        next.byClass[cid] = stageKey;
      });
      await store.set(STUDENT_STAGE_CONTROL_KEY, next, true);
      setStageControl(next);
    } finally {
      setStageSaving("");
    }
  };

  return (
    <div className="fade">
      <div className="between" style={{ marginBottom: 14 }}>
        <h2 className="h2">{isClassSummary ? "반별 평균 평가 결과" : "모둠별 평가 결과"}</h2>
        <div className="center" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className="btn sm" disabled={shownStudents.length === 0 || batchPrinting} onClick={printStudentResultBatch}>
            {batchPrinting ? <><Loader2 className="spin" size={15} /> 준비 중…</> : <><FileText size={15} /> 학생 결과지 일괄 출력</>}
          </button>
          <button className="btn sm" onClick={load}><RefreshCw size={15} /> 새로고침</button>
        </div>
      </div>

      {classes.length > 1 && (
        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <button className={`fchip ${cls === "all" ? "on" : ""}`} onClick={() => setCls("all")}>전체</button>
          {classes.map((c) => (
            <button key={c.id} className={`fchip ${cls === c.id ? "on" : ""}`} onClick={() => setCls(c.id)}>{c.name}</button>
          ))}
        </div>
      )}

      <div className="card pad-lg" style={{ marginBottom: 18 }}>
        <div className="between" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div className="eyebrow"><Lock size={14} /> 학생 진행 단계 열기</div>
            <h3 className="h3" style={{ margin: "6px 0 4px" }}>{stageScopeLabel}: {selectedStageLabel}까지 열림</h3>
            <p className="hint">학생은 자기 단계를 끝내도 선생님이 연 단계까지만 이동할 수 있습니다. 반 필터를 고른 뒤 누르면 해당 반에만 적용됩니다.</p>
          </div>
          <button className="btn sm" onClick={load}><RefreshCw size={15} /> 상태 새로고침</button>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {TEACHER_STAGE_OPTIONS.map((option) => (
            <button
              key={option.key}
              className={`btn sm ${selectedStage === option.key ? "primary" : ""}`}
              disabled={!!stageSaving}
              title={option.desc}
              onClick={() => openStage(option.key)}
            >
              {stageSaving === option.key ? <Loader2 className="spin" size={15} /> : <Unlock size={15} />}
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card pad-lg" style={{ marginBottom: 18 }}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6ece7" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#5d665f" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, chartMax]} tick={{ fontSize: 12, fill: "#5d665f" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e1e8e2", fontSize: 13 }} />
            <Bar dataKey="AI산출물" fill="#1f8a86" radius={[6, 6, 0, 0]} />
            <Bar dataKey="동료평가" fill="#e07b2f" radius={[6, 6, 0, 0]} />
            <Bar dataKey="협업평가" fill="#6b62b5" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="center" style={{ justifyContent: "center", gap: 18, marginTop: 6, fontSize: 12.5 }}>
          <span className="center"><i style={{ width: 11, height: 11, borderRadius: 3, background: "#1f8a86", display: "inline-block" }} /> AI산출물 평가 (/{data.aiMax})</span>
          <span className="center"><i style={{ width: 11, height: 11, borderRadius: 3, background: "#e07b2f", display: "inline-block" }} /> 동료평가 (/{data.peerMax})</span>
          <span className="center"><i style={{ width: 11, height: 11, borderRadius: 3, background: "#6b62b5", display: "inline-block" }} /> 협업평가 (/{data.collabMax})</span>
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto", marginBottom: 18 }}>
        <table className="tbl">
          <thead><tr>{!isClassSummary && cls === "all" && classes.length > 1 && <th>반</th>}<th>{isClassSummary ? "반" : "모둠"}</th><th className="r">AI산출물 /{data.aiMax}</th><th className="r">동료 /{data.peerMax}</th><th className="r">협업 평균 /{data.collabMax}</th><th className="r">평균 합계 /{totalMax}</th><th>{isClassSummary ? "제출 모둠" : "제출"}</th></tr></thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={tableColSpan} className="muted" style={{ textAlign: "center", padding: 20 }}>표시할 모둠이 없습니다.</td></tr>
            )}
            {shown.map((g) => (
              <tr key={g.id}>
                {!isClassSummary && cls === "all" && classes.length > 1 && <td className="faint">{className(config, g.classId)}</td>}
                <td style={{ fontWeight: 700 }}>{g.name}</td>
                <td className="r mono faint">{g.aiFeedback != null ? round1(g.aiFeedback) : "—"}</td>
                <td className="r mono">{g.peerScore != null ? round1(g.peerScore) : "—"}{g.peerScore != null && <span className="faint"> ({g.peerN})</span>}</td>
                <td className="r mono">{g.collabScore != null ? round1(g.collabScore) : "—"}{g.collabScore != null && <span className="faint"> ({g.collabN})</span>}</td>
                <td className="r mono" style={{ fontWeight: 800 }}>{g.total != null ? round1(g.total) : "—"}</td>
                <td>{isClassSummary
                  ? <span className="pill gray" style={{ fontSize: 11 }}>{g.submittedCount}/{g.groupCount}</span>
                  : g.submitted ? <span className="pill green" style={{ fontSize: 11 }}><CheckCircle2 size={12} /> 완료</span> : <span className="pill gray" style={{ fontSize: 11 }}>미제출</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginBottom: 18 }}>괄호 안 숫자는 평가에 참여한 모둠/학생 수입니다. 위 표의 ‘협업 평균’은 개인별 협업점수를 모둠 단위로 평균낸 참고값입니다. 실제 최종 점수는 아래 학생별 표에서 개인마다 계산됩니다.</p>

      <h2 className="h2" style={{ marginBottom: 12 }}>학생별 개인 점수</h2>
      <div className="card" style={{ overflowX: "auto", marginBottom: 18 }}>
        <table className="tbl">
          <thead>
            <tr>
              {classes.length > 1 && <th>반</th>}
              <th>모둠</th>
              <th>학생</th>
              <th className="r">동료 /{data.peerMax}</th>
              <th className="r">협업 /{data.collabMax}</th>
              <th className="r">최종 /{totalMax}</th>
              <th className="r">평가 수</th>
              <th>제출</th>
            </tr>
          </thead>
          <tbody>
            {shownStudents.length === 0 && (
              <tr><td colSpan={studentTableColSpan} className="muted" style={{ textAlign: "center", padding: 20 }}>표시할 학생이 없습니다.</td></tr>
            )}
            {shownStudents.map((s) => (
              <tr key={s.key}>
                {classes.length > 1 && <td className="faint">{className(config, s.classId)}</td>}
                <td>{s.groupName}</td>
                <td style={{ fontWeight: 800 }}>{s.name}</td>
                <td className="r mono">{s.peerScore != null ? round1(s.peerScore) : "—"}{s.peerScore != null && <span className="faint"> ({s.peerN})</span>}</td>
                <td className="r mono">{s.collabScore != null ? round1(s.collabScore) : "—"}{s.collabScore != null && <span className="faint"> ({s.collabN})</span>}</td>
                <td className="r mono" style={{ fontWeight: 850 }}>{s.total != null ? round1(s.total) : "—"}</td>
                <td className="r faint">{s.peerN || 0} / {s.collabN || 0}</td>
                <td>{s.submitted ? <span className="pill green" style={{ fontSize: 11 }}><CheckCircle2 size={12} /> 완료</span> : <span className="pill gray" style={{ fontSize: 11 }}>미제출</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginBottom: 18 }}>학생별 최종 점수 = 같은 모둠이 함께 받는 동료평가 점수 + 그 학생이 받은 협업평가 평균입니다. AI 참고 점수는 최종 점수에 반영되지 않습니다.</p>

      <h2 className="h2" style={{ marginBottom: 12 }}>학생 성찰 모아보기</h2>
      {shownRefl.length === 0 ? (
        <Banner kind="info">아직 제출된 성찰이 없습니다.</Banner>
      ) : (
        <div className="list-rest">
          {shownRefl.map((r, i) => (
            <div key={i} className="card pad">
              <div className="center" style={{ marginBottom: 10 }}>
                <span className="pill">{className(config, gClass[r.groupId]) ? className(config, gClass[r.groupId]) + " · " : ""}{groupName(config, r.groupId)} · {r.name}</span>
              </div>
              <div className="list-rest">
                {r.answers.map((a, j) => (
                  <div key={j}>
                    <div className="hint" style={{ marginBottom: 2 }}>{a.q}</div>
                    <div style={{ fontSize: 14 }}>{a.a || <span className="faint">— 답변 없음 —</span>}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function resultsConfigHash(config) {
  return hashStr(JSON.stringify({
    classes: config?.classes || [],
    groups: config?.groups || [],
    rubric: config?.rubric || {},
    settings: config?.settings || {},
  }));
}

/* ---------- 집계 로직 (교사 + 학생 결과 공용) ---------- */
async function aggregateAll(config) {
  let version = await store.get(RESULTS_VERSION_KEY, true);
  if (!version?.id) {
    version = { ts: Date.now(), id: Math.random().toString(36).slice(2), reason: "cache-init" };
    await store.set(RESULTS_VERSION_KEY, version, true);
  }
  const versionId = version?.id ? `${version.ts || 0}:${version.id}` : "initial";
  const configHash = resultsConfigHash(config);
  const cached = await store.get(RESULTS_CACHE_KEY, true);
  if (cached?.schema === runtimeOptions().resultsCacheSchema && cached?.versionId === versionId && cached?.configHash === configHash && cached?.data) {
    return { ...cached.data, cachedAt: cached.generatedAt, fromCache: true };
  }

  const data = await aggregateAllFresh(config);
  const payload = { schema: runtimeOptions().resultsCacheSchema, versionId, configHash, generatedAt: Date.now(), data };
  await store.set(RESULTS_CACHE_KEY, payload, true);
  return { ...data, cachedAt: payload.generatedAt, fromCache: false };
}

async function aggregateReflections(config) {
  let version = await store.get(REFLECTIONS_VERSION_KEY, true);
  if (!version?.id) {
    version = { ts: Date.now(), id: Math.random().toString(36).slice(2), reason: "reflections-cache-init" };
    await store.set(REFLECTIONS_VERSION_KEY, version, true);
  }
  const versionId = version?.id ? `${version.ts || 0}:${version.id}` : "initial";
  const configHash = resultsConfigHash(config);
  const cached = await store.get(REFLECTIONS_CACHE_KEY, true);
  if (cached?.schema === runtimeOptions().reflectionsCacheSchema && cached?.versionId === versionId && cached?.configHash === configHash && cached?.data) {
    return { ...cached.data, cachedAt: cached.generatedAt, fromCache: true };
  }

  const reflKeys = await store.list("pj_reflect_", true);
  const reflections = (await mapLimit(reflKeys, STORE_READ_CONCURRENCY, (k) => store.get(k, true))).filter(Boolean);
  const data = { reflections };
  const payload = { schema: runtimeOptions().reflectionsCacheSchema, versionId, configHash, generatedAt: Date.now(), data };
  await store.set(REFLECTIONS_CACHE_KEY, payload, true);
  return { ...data, cachedAt: payload.generatedAt, fromCache: false };
}

async function aggregateAllFresh(config) {
  const { groups } = config;
  const [subKeys, draftRows] = await Promise.all([
    store.list("pj_sub_", true),
    mapLimit(groups, STORE_READ_CONCURRENCY, async (g) => [g.id, await store.get("pj_draft_" + g.id, true)]),
  ]);
  const submittedGroups = new Set((subKeys || [])
    .filter((key) => key.startsWith("pj_sub_"))
    .map((key) => key.slice("pj_sub_".length)));
  const drafts = Object.fromEntries(draftRows.filter(([, d]) => d));

  // peer evals (다른 모둠이 매긴 결과물 점수 + 코멘트)
  const peerKeys = await store.list("pj_peer_", true);
  const peerRecords = await mapLimit(peerKeys, STORE_READ_CONCURRENCY, (k) => store.get(k, true));
  const peerByTarget = {}; // gid -> [score,...]  (0~peerMax)
  const commentsByTarget = {}; // gid -> [{good, improve}, ...]
  for (const p of peerRecords) {
    if (!p?.evals) continue;
    for (const tgt in p.evals) {
      const ev = p.evals[tgt];
      (peerByTarget[tgt] = peerByTarget[tgt] || []).push(ev.score);
      const open = ev.open || {};
      if ((open.good || "").trim() || (open.improve || "").trim()) {
        (commentsByTarget[tgt] = commentsByTarget[tgt] || []).push({ good: open.good || "", improve: open.improve || "" });
      }
    }
  }
  // collab evals (personal score = avg of ratings received by each member)
  const collabKeys = await store.list("pj_collab_", true);
  const collabRecords = await mapLimit(collabKeys, STORE_READ_CONCURRENCY, (k) => store.get(k, true));
  const collabByMember = {}; // `${gid}::name` -> [score,...]  (0~collabMax)
  const collabCommentsByMember = {}; // targetKey -> [{good,improve},...]  (받는 사람 기준)
  for (const c of collabRecords) {
    if (!c?.ratings) continue;
    for (const tgt of Object.keys(c.ratings)) {
      const rating = c.ratings[tgt];
      if (rating?.complete) {
        (collabByMember[tgt] = collabByMember[tgt] || []).push(rating.score);
      }
      if (tgt === c.by) continue; // 자기 자신에게 쓴 글은 제외
      const open = rating?.open || {};
      if ((open.good || "").trim() || (open.improve || "").trim()) {
        (collabCommentsByMember[tgt] = collabCommentsByMember[tgt] || []).push({ good: open.good || "", improve: open.improve || "" });
      }
    }
  }
  const peerMax = rubricMax(peerItems(config)) || 1;       // 55
  const collabMaxV = rubricMax(collabItems(config)) || 1;  // 45 (1인당)
  const aiMaxV = rubricMax(aiItems(config)) || 100;        // 100 (참고용)

  const students = [];
  const out = groups.map((g) => {
    const aiFeedback = drafts[g.id] ? drafts[g.id].aiScore : null; // 참고용 (초안 AI 피드백, 최종 미반영)
    const pArr = peerByTarget[g.id] || [];
    const peerScore = pArr.length ? avg(pArr) : null;        // 0~peerMax (다른 모둠 평균)
    const memberRows = (g.members || []).map((name) => {
      const key = `${g.id}::${name}`;
      const cArr = collabByMember[key] || [];
      const collabScore = cArr.length ? avg(cArr) : null;    // 0~collabMax (개인이 받은 협업평가 평균)
      const hasAny = peerScore != null || collabScore != null;
      const total = hasAny ? (peerScore ?? 0) + (collabScore ?? 0) : null;
      return {
        key, name, groupId: g.id, groupName: g.name, classId: g.classId,
        aiFeedback, aiMax: drafts[g.id]?.aiMax ?? aiMaxV,
        peerScore, peerMax, peerN: pArr.length,
        collabScore, collabMax: collabMaxV, collabN: cArr.length,
        comments: commentsByTarget[g.id] || [],
        collabComments: collabCommentsByMember[key] || [],
        submitted: submittedGroups.has(g.id),
        total,
      };
    });
    students.push(...memberRows);
    const memberCollabScores = memberRows.map((row) => row.collabScore).filter((v) => Number.isFinite(v));
    const collabScore = memberCollabScores.length ? avg(memberCollabScores) : null; // 모둠 요약용: 개인 협업점수 평균
    const collabN = memberRows.reduce((sum, row) => sum + (row.collabN || 0), 0);
    const hasAny = peerScore != null || collabScore != null;
    const total = hasAny ? (peerScore ?? 0) + (collabScore ?? 0) : null; // 동료 + 협업, 환산 없이 합산
    return {
      id: g.id, classId: g.classId, name: g.name,
      aiFeedback, aiMax: drafts[g.id]?.aiMax ?? aiMaxV,
      peerScore, peerMax, peerN: pArr.length,
      collabScore, collabMax: collabMaxV, collabN,
      comments: commentsByTarget[g.id] || [],
      submitted: submittedGroups.has(g.id),
      memberCount: (g.members || []).length,
      scoredMemberCount: memberCollabScores.length,
      total,
    };
  });
  return { groups: out, students, peerMax, collabMax: collabMaxV, aiMax: aiMaxV, collabCommentsByMember };
}

/* =================================================================== */
/* ============================  STUDENT  =========================== */
/* =================================================================== */
const STEPS = [
  { key: "result", label: "AI 피드백", sub: "초안 올리기 · AI 피드백", color: "var(--teal)", icon: Sparkles },
  { key: "final", label: "최종 결과물 제출", sub: "고친 결과물 올리기", color: "var(--teal)", icon: Upload },
  { key: "peer", label: "동료평가", sub: "다른 모둠 결과물", color: "var(--accent)", icon: Users },
  { key: "collab", label: "협업평가", sub: "우리 모둠끼리", color: "var(--violet)", icon: Handshake },
  { key: "report", label: "평가결과 확인", sub: "통합 보고서", color: "var(--green)", icon: BarChart3 },
  { key: "reflect", label: "프로젝트 성찰하기", sub: "스스로 돌아보기", color: "var(--rose)", icon: Lightbulb },
];

function StudentApp({ config, me }) {
  const [progress, setProgress] = useState({ resultsSeen: false });
  const [sub, setSub] = useState(null);       // our group's FINAL submission
  const [draftRec, setDraftRec] = useState(null); // our group's draft + AI feedback
  const [peer, setPeer] = useState(null);     // my peer evals
  const [collab, setCollab] = useState(null); // my collab ratings
  const [reflect, setReflect] = useState(null);
  const [stageControl, setStageControl] = useState(null);
  const [active, setActive] = useState("result");
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const [pg, s, d, p, c, r, stages] = await Promise.all([
      store.get("me_progress", false),
      store.get("pj_sub_" + me.groupId, true),
      store.get("pj_draft_" + me.groupId, true),
      store.get("pj_peer_" + me.key, true),
      store.get("pj_collab_" + me.key, true),
      store.get("pj_reflect_" + me.key, true),
      store.get(STUDENT_STAGE_CONTROL_KEY, true),
    ]);
    if (pg) setProgress(pg);
    setSub(s); setDraftRec(d); setPeer(p); setCollab(c); setReflect(r);
    setStageControl(stages || {});
    setLoaded(true);
  }, [me]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    let cancelled = false;
    const loadStages = async () => {
      const stages = await store.get(STUDENT_STAGE_CONTROL_KEY, true);
      if (!cancelled) setStageControl(stages || {});
    };
    const id = setInterval(loadStages, 10000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!config) return <Banner kind="warn">아직 선생님이 평가를 준비하지 않았어요.</Banner>;
  if (!loaded) return <div className="center muted" style={{ padding: 40 }}><Loader2 className="spin" size={18} /> 불러오는 중…</div>;

  const myGroup = config.groups.find((g) => g.id === me.groupId);
  const myClassId = me.classId || myGroup?.classId;
  const otherGroups = config.groups.filter((g) => (g.classId === myClassId) && g.id !== me.groupId);
  const collabTargets = (config.settings.selfInCollab ? myGroup.members : myGroup.members.filter((m) => m !== me.name))
    .map((m) => `${me.groupId}::${m}`);
  const teacherOpenStep = openStudentStepForClass(stageControl, myClassId);
  const teacherUnlocked = Object.fromEntries(STEPS.map((s) => [s.key, isStudentStepOpen(s.key, teacherOpenStep)]));

  const done = {
    result: !!draftRec,
    final: !!sub,
    peer: otherGroups.length === 0 || (peer && otherGroups.every((g) => peer.evals && peer.evals[g.id])),
    collab: collabTargets.length === 0 || (collab && collabTargets.every((t) => collab.ratings && collab.ratings[t] && collab.ratings[t].complete)),
    report: progress.resultsSeen,
    reflect: !!reflect,
  };
  // 순차 잠금 + 교사 개방: 이전 단계가 끝나고, 선생님이 연 단계까지만 열림
  const unlocked = {};
  let prevOk = true;
  for (const s of STEPS) { unlocked[s.key] = prevOk && teacherUnlocked[s.key]; prevOk = prevOk && done[s.key]; }

  const markResultsSeen = async () => {
    const np = { ...progress, resultsSeen: true };
    setProgress(np);
    await store.set("me_progress", np, false);
  };

  const goNext = (force = false) => {
    const idx = STEPS.findIndex((s) => s.key === active);
    for (let i = idx + 1; i < STEPS.length; i++) {
      if (unlocked[STEPS[i].key]) { setActive(STEPS[i].key); return; }
      if (!force) return;
    }
  };

  const completedCount = STEPS.filter((s) => done[s.key]).length;
  const activeIndex = STEPS.findIndex((s) => s.key === active);
  const nextStep = activeIndex >= 0 ? STEPS[activeIndex + 1] : null;
  const nextClosedByTeacher = !!(nextStep && done[active] && !teacherUnlocked[nextStep.key]);
  const openStageLabel = TEACHER_STAGE_OPTIONS.find((option) => option.key === teacherOpenStep)?.label || "최종 제출";
  const nextStepOpenFor = (stepKey) => {
    const stepIndex = STEPS.findIndex((s) => s.key === stepKey);
    const next = stepIndex >= 0 ? STEPS[stepIndex + 1] : null;
    return !next || teacherUnlocked[next.key];
  };

  return (
    <div className="layout fade">
      {/* RAIL */}
      <aside className="rail">
        <div className="card">
          <div className="rail-head">
            <div className="eyebrow"><Sprout size={13} /> 나의 평가 여정</div>
            <div className="between" style={{ marginTop: 8 }}>
              <span className="h3">{completedCount} / {STEPS.length} 단계</span>
              <span className="pill green" style={{ fontSize: 11 }}>{Math.round((completedCount / STEPS.length) * 100)}%</span>
            </div>
          </div>
          <div className="steps">
            <div style={{ position: "relative" }}>
              <div className="connector"><div className="fill" style={{ height: `${(completedCount / STEPS.length) * 100}%` }} /></div>
              {STEPS.map((s, i) => {
                const isDone = done[s.key], isLocked = !unlocked[s.key], isActive = active === s.key;
                const Ic = s.icon;
                return (
                  <div key={s.key}
                    className={`node ${isActive ? "active" : ""} ${isDone ? "done" : ""} ${isLocked ? "locked" : ""}`}
                    onClick={() => !isLocked && setActive(s.key)}>
                    <div className="dot">{isDone ? <CheckCircle2 size={18} /> : isLocked ? <Lock size={14} /> : i + 1}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="ttl center" style={{ gap: 6 }}>
                        <Ic size={14} style={{ color: isActive || isDone ? s.color : "var(--ink-faint)" }} /> {s.label}
                      </div>
                      <div className="sub">{s.sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main>
        {nextClosedByTeacher && (
          <div style={{ marginBottom: 16 }}>
            <Banner kind="info" icon={Lock}>
              다음 단계는 아직 열리지 않았어요. 지금은 선생님이 <b>{openStageLabel}</b> 단계까지 열어 두었습니다.
            </Banner>
          </div>
        )}
        {active === "result" && <StepResult config={config} me={me} draft={draftRec} onDone={refresh} goNext={goNext} nextStepOpen={nextStepOpenFor("result")} />}
        {active === "final" && <StepFinal config={config} me={me} sub={sub} draft={draftRec} onDone={refresh} goNext={goNext} nextStepOpen={nextStepOpenFor("final")} />}
        {active === "peer" && <StepPeer config={config} me={me} peer={peer} otherGroups={otherGroups} onDone={refresh} goNext={goNext} nextStepOpen={nextStepOpenFor("peer")} />}
        {active === "collab" && <StepCollab config={config} me={me} collab={collab} targets={collabTargets} onDone={refresh} goNext={goNext} nextStepOpen={nextStepOpenFor("collab")} />}
        {active === "report" && <StepReport config={config} me={me} draftRec={draftRec} reflect={reflect} onSeen={markResultsSeen} goNext={goNext} done={done} nextStepOpen={nextStepOpenFor("report")} />}
        {active === "reflect" && <StepReflect config={config} me={me} reflect={reflect} onDone={refresh} />}
      </main>
    </div>
  );
}

function StepHeader({ idx, title, sub, color, Icon }) {
  return (
    <div className="between" style={{ marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
      <div className="center">
        <span className="chip" style={{ background: color, color: "#fff", width: 46, height: 46, borderRadius: 14 }}><Icon size={22} /></span>
        <div>
          <div className="eyebrow" style={{ color }}>STEP {idx}</div>
          <h1 className="h1" style={{ fontSize: 24, margin: "2px 0 0" }}>{title}</h1>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13.5, maxWidth: 360 }}>{sub}</p>
    </div>
  );
}

/* ---------- STEP 1: AI 피드백 (초안 업로드) ---------- */
function StepResult({ config, me, draft, onDone, goNext, nextStepOpen = true }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [err, setErr] = useState("");
  const [manual, setManual] = useState(false);
  const [picks, setPicks] = useState({});
  const inputRef = useRef(null);
  const items = aiItems(config);
  const maxP = rubricMax(items);

  const onFile = (f) => {
    if (!f) return;
    if (!isPdfFile(f)) return setErr("PDF 파일만 업로드할 수 있어요.");
    if (f.size > MAX_PROJECT_PDF_BYTES) return setErr(pdfLimitMessage());
    setFile(f);
    setErr("");
  };

  const runAI = async () => {
    if (!file) return;
    if (file.size > MAX_PROJECT_PDF_BYTES) return setErr(pdfLimitMessage());
    setBusy(true); setErr("");
    let lockId = "";
    let cacheKeys = null;
    try {
      setBusyLabel("기존 피드백 확인 중…");
      const existingDraft = await store.get("pj_draft_" + me.groupId, true);
      if (existingDraft) {
        await onDone();
        return;
      }

      setBusyLabel("PDF 내용 확인 중…");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const draftPdfBase64 = bytesToBase64(bytes);
      const draftPdfData = "data:application/pdf;base64," + draftPdfBase64;
      const signature = await computePdfContentSignature(bytes);
      cacheKeys = aiFeedbackCacheKeys(config, items, signature);

      setBusyLabel("같은 내용의 피드백 찾는 중…");
      const cached = await readAiFeedbackCache(cacheKeys);
      if (cached) {
        const record = draftRecordFromAiResult(cached.result, {
          groupId: me.groupId,
          fileName: file.name,
          submittedBy: me.name,
          signature,
          cacheKey: cached.key,
          reused: true,
          pdfData: draftPdfData,
          fileSize: file.size,
        });
        await store.set("pj_draft_" + me.groupId, record, true);
        await markResultsChanged("draft");
        await onDone();
        return;
      }

      const activeLock = await store.get(cacheKeys.lock, true);
      if (activeLock?.ts && Date.now() - activeLock.ts < AI_FEEDBACK_LOCK_MS) {
        setBusyLabel("같은 내용을 먼저 평가 중이에요…");
        const waited = await waitForAiFeedbackCache(cacheKeys, AI_FEEDBACK_LOCK_MS);
        if (waited) {
          const record = draftRecordFromAiResult(waited.result, {
            groupId: me.groupId,
            fileName: file.name,
            submittedBy: me.name,
            signature,
            cacheKey: waited.key,
            reused: true,
            pdfData: draftPdfData,
            fileSize: file.size,
          });
          await store.set("pj_draft_" + me.groupId, record, true);
          await markResultsChanged("draft");
          await onDone();
          return;
        }
      }

      lockId = `${me.key}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await store.set(cacheKeys.lock, { id: lockId, ts: Date.now(), by: me.key }, true);
      await sleep(350);
      const lockCheck = await store.get(cacheKeys.lock, true);
      if (lockCheck?.id !== lockId && lockCheck?.ts && Date.now() - lockCheck.ts < AI_FEEDBACK_LOCK_MS) {
        setBusyLabel("같은 내용을 먼저 평가 중이에요…");
        const waited = await waitForAiFeedbackCache(cacheKeys, AI_FEEDBACK_LOCK_MS);
        if (waited) {
          const record = draftRecordFromAiResult(waited.result, {
            groupId: me.groupId,
            fileName: file.name,
            submittedBy: me.name,
            signature,
            cacheKey: waited.key,
            reused: true,
            pdfData: draftPdfData,
            fileSize: file.size,
          });
          await store.set("pj_draft_" + me.groupId, record, true);
          await markResultsChanged("draft");
          await onDone();
          return;
        }
      }

      const b64 = draftPdfBase64;
      const rubricText = items.map((it) =>
        `${it.no}. ${it.name} — 상(${it.high}점): ${it.hi} / 중(${it.mid}점): ${it.mi} / 하(${it.low}점): ${it.lo}`).join("\n");
      const prompt =
`당신은 초등학생 프로젝트(주제: "${config.project.subject}")의 결과물을 보고, 학생이 결과물을 더 좋게 고치도록 돕는 따뜻한 선생님입니다.
이 평가는 점수를 매기기 위한 것이 아니라 "수정에 참고할 피드백"을 주기 위한 것입니다.
첨부된 PDF 결과물을 읽고 아래 ${items.length}개 항목을 각각 상/중/하로 평가하고, 고치면 좋을 점을 알려 주세요.

${rubricText}

규칙:
- 각 항목 rating은 "상","중","하" 중 하나, score는 해당 등급 점수.
- reason은 한국어 40자 이내의 근거.
- summary는 다른 모둠 친구들이 읽고 평가에 참고할 수 있도록 결과물 내용을 120자 이내로 요약.
- good은 이 결과물에서 특히 잘한 점 2~3가지를 초등학생이 이해할 수 있는 따뜻한 말투로(한국어 120자 이내).
- improve는 더 좋게 고치면 좋을 점 2~3가지를 구체적이고 친절하게(한국어 150자 이내).
- 사실 확인을 꼭 하세요. 쉬운 표현이나 다른 말로 설명한 것은 허용하되, 식물의 구조·기능·생장·분류·생태 등에 대한 과학적 사실 오류는 그냥 넘기지 말고 해당 항목 rating을 낮추며 improve에 바로잡을 내용을 포함하세요.
- PDF에 특정 식물 이름이나 구체적인 식물 정보가 나오면 웹 검색으로 신뢰할 수 있는 자료를 찾아 대조한 뒤 평가하세요.
- 사실 오류를 발견하면 improve의 첫머리를 "사실 확인:"으로 시작하고, 잘못된 내용과 바르게 고칠 내용을 초등학생이 이해할 수 있게 구체적으로 적으세요.
- 확실하지 않은 내용은 단정하지 말고 "자료로 다시 확인해 보면 좋겠어요"처럼 확인이 필요하다고 안내하세요.
다른 말 없이 아래 JSON 형식으로만 응답:
{"summary":"...","items":[{"no":1,"rating":"상","score":20,"reason":"..."}],"good":"...","improve":"..."}`;
      setBusyLabel("AI가 읽는 중…");
      const text = await callClaude([{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
          { type: "text", text: prompt },
        ],
      }], 1200);
      const parsed = extractJSON(text);
      if (!parsed || !parsed.items) throw new Error("형식 오류");
      const result = normalizeAiFeedbackResult(parsed, items, maxP);
      await writeAiFeedbackCache(cacheKeys, signature, result, {
        projectSubject: config.project.subject,
        createdBy: me.key,
        sourceFileName: file.name,
      });
      const record = draftRecordFromAiResult(result, {
        groupId: me.groupId,
        fileName: file.name,
        submittedBy: me.name,
        signature,
        cacheKey: cacheKeys.primary,
        reused: false,
        pdfData: draftPdfData,
        fileSize: file.size,
      });
      await store.set("pj_draft_" + me.groupId, record, true);
      await markResultsChanged("draft");
      await onDone();
    } catch (e) {
      const detail = e instanceof Error && e.message ? ` (${e.message})` : "";
      setErr(`AI 피드백을 받지 못했어요. 잠시 후 다시 시도하거나, 아래에서 파일만 등록할 수 있어요.${detail}`);
      setManual(true);
    } finally {
      if (lockId && cacheKeys) {
        try {
          const lock = await store.get(cacheKeys.lock, true);
          if (lock?.id === lockId) await store.set(cacheKeys.lock, null, true);
        } catch (e) {}
      }
      setBusy(false);
      setBusyLabel("");
    }
  };

  const saveManual = async () => {
    let pdfData = "";
    let fileSize = 0;
    if (file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      pdfData = "data:application/pdf;base64," + bytesToBase64(bytes);
      fileSize = file.size;
    }
    const record = {
      groupId: me.groupId, fileName: file?.name || "초안", summary: "", items: [],
      aiScore: null, aiMax: maxP, good: "", improve: "", submittedBy: me.name, ts: Date.now(),
      pdfData, fileSize,
    };
    await store.set("pj_draft_" + me.groupId, record, true);
    await markResultsChanged("draft");
    await onDone();
  };

  const resubmit = async () => { await store.set("pj_draft_" + me.groupId, null, true); await markResultsChanged("draft-delete"); setFile(null); setManual(false); setPicks({}); await onDone(); };

  // 이미 초안 제출됨 → AI 피드백 표시 (수정 참고용)
  if (draft) {
    const sub = draft;
    return (
      <div className="fade">
        <StepHeader idx={1} title="AI 피드백 받기" color="var(--teal)" Icon={Sparkles}
          sub="AI가 우리 초안을 읽고 고치면 좋을 점을 알려줘요. 점수가 아니라 결과물을 더 좋게 다듬기 위한 피드백이에요. 고친 뒤 다음 단계에서 최종본을 올려요." />

        <Banner kind="info" icon={Sparkles}>
          여기 점수는 <b>참고용</b>이에요. 최종 점수에는 들어가지 않고, 다른 모둠의 동료평가와 협업평가로 정해져요. 피드백을 보고 고친 다음, <b>다음 단계에서 최종 결과물</b>을 올리면 그걸로 동료평가가 진행돼요.
        </Banner>

        <p className="hint" style={{ margin: "10px 2px 0" }}>이 초안은 <b>우리 모둠 공용</b>이에요. {sub.submittedBy}님이 올렸고, 모둠원 모두 같은 초안을 봅니다. ‘다시 올리기’를 하면 모둠 전체의 초안이 교체돼요.</p>

        <div className="card pad-lg" style={{ marginTop: 14, marginBottom: 16 }}>
          <div className="between" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div className="center"><FileText size={18} className="muted" /><span className="h3">{sub.fileName}</span>
              <span className="pill gray" style={{ fontSize: 11 }}>제출: {sub.submittedBy}</span></div>
            {sub.aiScore != null && (
              <div className="center">
                <span className="hint" style={{ marginRight: 6 }}>AI 참고 점수</span>
                <span className="big-score" style={{ fontSize: 26, color: "var(--teal)" }}>{sub.aiScore}<span className="faint" style={{ fontSize: 15 }}> / {sub.aiMax || maxP}</span></span>
              </div>
            )}
          </div>

          {(sub.good || sub.improve) && (
            <div className="row" style={{ flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
              {sub.good && (
                <div className="card pad" style={{ flex: "1 1 260px", background: "var(--green-soft)", borderColor: "transparent" }}>
                  <div className="center" style={{ gap: 7, fontWeight: 800, color: "var(--green-700)", marginBottom: 6 }}><ThumbsUp size={16} /> 잘한 점</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{sub.good}</div>
                </div>
              )}
              {sub.improve && (
                <div className="card pad" style={{ flex: "1 1 260px", background: "var(--accent-soft)", borderColor: "transparent" }}>
                  <div className="center" style={{ gap: 7, fontWeight: 800, color: "var(--accent-700)", marginBottom: 6 }}><Lightbulb size={16} /> 고치면 좋을 점</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{sub.improve}</div>
                </div>
              )}
            </div>
          )}

          {sub.items && sub.items.length > 0 && (
            <>
              <div className="divider" />
              <div className="list-rest">
                {sub.items.map((r) => {
                  const it = items.find((x) => x.no === r.no);
                  return (
                    <div key={r.no} className="checkrow" style={{ alignItems: "flex-start", flexDirection: "column", gap: 6 }}>
                      <div className="between" style={{ width: "100%" }}>
                        <span className="center"><span className="chip" style={{ width: 28, height: 28, background: "#fff", border: "1px solid var(--line-2)", fontSize: 12, fontWeight: 800 }}>{r.no}</span> {it?.name}</span>
                        <span className="center"><span className="pill" style={{ background: r.rating === "상" ? "var(--green-soft)" : r.rating === "중" ? "#faf3df" : "var(--rose-soft)", border: "none", color: r.rating === "상" ? "var(--green-700)" : r.rating === "중" ? "#8a6a14" : "#a23f2c" }}>{r.rating}</span> <b className="mono">{r.score}점</b></span>
                      </div>
                      {r.reason && <div className="muted" style={{ fontSize: 13, paddingLeft: 38 }}>{r.reason}</div>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="between">
          <ConfirmDelete onConfirm={resubmit} label="초안 다시 올리기" Icon={RefreshCw} prompt="모둠 초안을 지우고 다시 올릴까요?" />
          <button className="btn primary lg" disabled={!nextStepOpen} onClick={goNext}>
            {nextStepOpen ? <>다음: 최종 결과물 올리기 <ChevronRight size={17} /></> : <><Lock size={17} /> 선생님이 열면 이동</>}
          </button>
        </div>
      </div>
    );
  }

  // 업로드 화면
  return (
    <div className="fade">
      <StepHeader idx={1} title="AI 피드백 받기" color="var(--teal)" Icon={Sparkles}
        sub="우리 모둠 초안을 PDF로 올리면, AI가 읽고 고치면 좋을 점을 알려줘요. (점수가 아니라 수정에 참고하는 피드백이에요.)" />
      <Banner kind="info">결과물은 <b>모둠당 하나</b>예요. 같은 내용의 PDF는 기존 AI 피드백을 재사용해서 같은 점수와 의견이 나오게 합니다.</Banner>
      <div style={{ height: 14 }} />
      <div className="card pad-lg" style={{ marginBottom: 16 }}>
        <input ref={inputRef} type="file" accept="application/pdf" style={{ display: "none" }}
          onChange={(e) => onFile(e.target.files[0])} />
        <div className={`dropzone ${file ? "has" : ""}`} onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}>
          {file ? (
            <div className="center" style={{ justifyContent: "center" }}><FileText size={22} color="var(--green-700)" />
              <b>{file.name}</b><span className="muted">· 다시 클릭하면 변경</span></div>
          ) : (
            <>
              <Upload size={26} color="var(--ink-faint)" />
              <div className="h3" style={{ marginTop: 8 }}>초안 PDF를 여기에 올려주세요</div>
              <div className="hint" style={{ marginTop: 4 }}>클릭하거나 파일을 끌어다 놓으세요 · 최대 {MAX_PROJECT_PDF_MB}MB</div>
            </>
          )}
        </div>
        {err && <div style={{ marginTop: 12 }}><Banner kind="warn">{err}</Banner></div>}
        <div className="between" style={{ marginTop: 16 }}>
          <span className="hint">피드백 기준: {items.map((i) => i.name).join(" · ")}</span>
          <button className="btn primary lg" disabled={!file || busy} onClick={runAI}>
            {busy ? <><Loader2 className="spin" size={17} /> {busyLabel || "AI가 읽는 중…"}</> : <><Sparkles size={17} /> AI 피드백 받기</>}
          </button>
        </div>
      </div>

      {manual && (
        <div className="card pad-lg fade">
          <div className="eyebrow"><PenLine size={14} /> 피드백 없이 넘어가기</div>
          <p className="muted" style={{ fontSize: 13.5, margin: "8px 0 14px" }}>AI 피드백을 받지 못했어도, 이 단계를 마치고 다음에서 최종 결과물을 올릴 수 있어요.</p>
          <button className="btn primary lg" style={{ width: "100%" }} disabled={!file} onClick={saveManual}>
            <Save size={16} /> 이 초안으로 계속하기
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- STEP 2: 최종 결과물 제출 ---------- */
function StepFinal({ config, me, sub, draft, onDone, goNext, nextStepOpen = true }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef(null);

  const onFile = (f) => {
    if (!f) return;
    if (!isPdfFile(f)) return setErr("PDF 파일만 업로드할 수 있어요.");
    if (f.size > MAX_PROJECT_PDF_BYTES) return setErr(pdfLimitMessage());
    setFile(f);
    setErr("");
  };

  const submitFinal = async () => {
    if (!file) return;
    if (file.size > MAX_PROJECT_PDF_BYTES) return setErr(pdfLimitMessage());
    setBusy(true); setErr("");
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(file);
      });
      const ts = Date.now();
      const record = {
        groupId: me.groupId, fileName: file.name,
        summary: draft?.summary || "", // 동료평가 참고용 요약 (초안 단계 요약을 이어 씀)
        pdfData: "data:application/pdf;base64," + b64,
        fileSize: file.size,
        submittedBy: me.name, ts,
      };
      const meta = {
        groupId: me.groupId,
        fileName: file.name,
        summary: draft?.summary || "",
        fileSize: file.size,
        submittedBy: me.name,
        ts,
      };
      await store.set("pj_sub_" + me.groupId, record, true);
      await store.set("pj_sub_meta_" + me.groupId, meta, true);
      await markResultsChanged("final");
      await onDone();
    } catch (e) {
      setErr("제출 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
    } finally { setBusy(false); }
  };

  const resubmit = async () => {
    await Promise.all([
      store.set("pj_sub_" + me.groupId, null, true),
      store.set("pj_sub_meta_" + me.groupId, null, true),
    ]);
    await markResultsChanged("final-delete");
    setFile(null);
    await onDone();
  };

  // 이미 최종본 제출됨
  if (sub) {
    return (
      <div className="fade">
        <StepHeader idx={2} title="최종 결과물 제출" color="var(--teal)" Icon={Upload}
          sub="제출 완료! 다른 모둠이 이 최종본을 읽고 동료평가를 해요. 더 고쳤다면 다시 올릴 수 있어요." />
        <Banner kind="ok">최종 결과물이 제출되었어요. {sub.submittedBy}님이 <b>우리 모둠 대표로</b> 올렸고, 다른 모둠은 이 파일로 동료평가를 합니다. (모둠당 하나)</Banner>
        <div className="card pad-lg" style={{ marginTop: 14, marginBottom: 16 }}>
          <div className="center" style={{ marginBottom: 4, gap: 8, flexWrap: "wrap" }}>
            <FileText size={18} className="muted" /><span className="h3">{sub.fileName}</span>
            <span className="pill gray" style={{ fontSize: 11 }}>제출: {sub.submittedBy}</span>
          </div>
          {sub.pdfData ? <PdfPreview dataUrl={sub.pdfData} fileName={sub.fileName} />
            : <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>이전에 미리보기 저장 없이 제출된 파일이에요. 최종본을 다시 올리면 동료평가에서 PDF 미리보기가 표시됩니다.</p>}
        </div>
        <div className="between">
          <ConfirmDelete onConfirm={resubmit} label="최종본 다시 올리기" Icon={RefreshCw} prompt="모둠 최종본을 지우고 다시 올릴까요?" />
          <button className="btn primary lg" disabled={!nextStepOpen} onClick={goNext}>
            {nextStepOpen ? <>다음: 동료평가 <ChevronRight size={17} /></> : <><Lock size={17} /> 선생님이 열면 이동</>}
          </button>
        </div>
      </div>
    );
  }

  // 업로드 화면
  return (
    <div className="fade">
      <StepHeader idx={2} title="최종 결과물 제출" color="var(--teal)" Icon={Upload}
        sub="AI 피드백을 보고 고친 최종 결과물을 PDF로 올려요. 이 파일로 다른 모둠이 동료평가를 합니다." />
      <Banner kind="info">최종본도 <b>모둠당 하나</b>예요. 대표 한 명이 올리면 됩니다. 모둠원이 또 올리면 마지막 파일로 바뀌어요.</Banner>
      <div style={{ height: 14 }} />

      {draft?.improve && (
        <div className="card pad" style={{ marginBottom: 14, background: "var(--accent-soft)", borderColor: "transparent" }}>
          <div className="center" style={{ gap: 7, fontWeight: 800, color: "var(--accent-700)", marginBottom: 6 }}><Lightbulb size={16} /> AI가 알려준 고치면 좋을 점</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{draft.improve}</div>
          <div className="hint" style={{ marginTop: 8 }}>이 점들을 고쳤다면 최종본을 올려 주세요.</div>
        </div>
      )}

      <div className="card pad-lg" style={{ marginBottom: 16 }}>
        <input ref={inputRef} type="file" accept="application/pdf" style={{ display: "none" }}
          onChange={(e) => onFile(e.target.files[0])} />
        <div className={`dropzone ${file ? "has" : ""}`} onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}>
          {file ? (
            <div className="center" style={{ justifyContent: "center" }}><FileText size={22} color="var(--green-700)" />
              <b>{file.name}</b><span className="muted">· 다시 클릭하면 변경</span></div>
          ) : (
            <>
              <Upload size={26} color="var(--ink-faint)" />
              <div className="h3" style={{ marginTop: 8 }}>최종 결과물 PDF를 올려주세요</div>
              <div className="hint" style={{ marginTop: 4 }}>클릭하거나 파일을 끌어다 놓으세요 · 최대 {MAX_PROJECT_PDF_MB}MB</div>
            </>
          )}
        </div>
        {err && <div style={{ marginTop: 12 }}><Banner kind="warn">{err}</Banner></div>}
        <div className="between" style={{ marginTop: 16 }}>
          <span className="hint">제출하면 다른 모둠이 동료평가를 할 수 있어요.</span>
          <button className="btn primary lg" disabled={!file || busy} onClick={submitFinal}>
            {busy ? <><Loader2 className="spin" size={17} /> 제출 중…</> : <><CheckCircle2 size={17} /> 최종 결과물 제출</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- STEP 3: 동료평가 ---------- */
function StepPeer({ config, me, peer, otherGroups, onDone, goNext, nextStepOpen = true }) {
  const [target, setTarget] = useState(null);
  const items = peerItems(config);
  const evals = peer?.evals || {};

  if (otherGroups.length === 0) {
    return (
      <div className="fade">
        <StepHeader idx={3} title="동료평가" color="var(--accent)" Icon={Users} sub="다른 모둠 친구들의 결과물을 읽고 평가합니다." />
        <Banner kind="info">다른 모둠이 없어 이 단계는 건너뜁니다.</Banner>
        <div style={{ height: 14 }} />
        <button className="btn primary lg" disabled={!nextStepOpen} onClick={goNext}>
          {nextStepOpen ? <>다음 단계로 <ChevronRight size={17} /></> : <><Lock size={17} /> 선생님이 열면 이동</>}
        </button>
      </div>
    );
  }

  if (target) {
    const g = otherGroups.find((x) => x.id === target);
    return <PeerEvalForm config={config} me={me} group={g} items={items}
      onBack={async () => { await onDone(); setTarget(null); }} onSaved={async () => { await onDone(); setTarget(null); }} />;
  }

  const allDone = otherGroups.every((g) => evals[g.id]);
  const drafts = peer?.drafts || {};
  return (
    <div className="fade">
      <StepHeader idx={3} title="동료평가" color="var(--accent)" Icon={Users}
        sub="다른 모둠의 결과물을 읽고, 평가 기준으로 점수를 매기고 좋은 점·아쉬운 점을 적어 주세요. 모든 모둠을 평가하면 다음 단계가 열려요." />
      <div className="list-rest" style={{ marginBottom: 16 }}>
        {otherGroups.map((g) => {
          const ev = evals[g.id];
          const draft = drafts[g.id];
          return (
            <div key={g.id} className={`checkrow ${ev ? "done" : ""}`}>
              <div className="center">
                <span className="chip" style={{ background: ev ? "var(--green-soft)" : "var(--accent-soft)", color: ev ? "var(--green-700)" : "var(--accent-700)" }}>
                  {ev ? <CheckCircle2 size={18} /> : <BookOpen size={18} />}
                </span>
                <div>
                  <div className="h3">{g.name}</div>
                  <div className="hint">{ev ? `평가 완료 · ${ev.score}/${rubricMax(items)}점` : draft ? "작성 중 · 임시저장됨" : "결과물 읽고 평가하기"}</div>
                </div>
              </div>
              <button className={`btn sm ${ev ? "" : "accent"}`} onClick={() => setTarget(g.id)}>
                {ev ? <>다시 평가 <ChevronRight size={14} /></> : draft ? <>이어 쓰기 <ChevronRight size={14} /></> : <>평가하기 <ChevronRight size={14} /></>}
              </button>
            </div>
          );
        })}
      </div>
      <div className="between">
        <span className="pill">{Object.keys(evals).length} / {otherGroups.length} 모둠 평가함</span>
        <button className="btn primary lg" disabled={!allDone || !nextStepOpen} onClick={goNext}>
          {nextStepOpen ? <>다음: 협업평가 <ChevronRight size={17} /></> : <><Lock size={17} /> 선생님이 열면 이동</>}
        </button>
      </div>
      {!allDone && <p className="hint" style={{ marginTop: 10 }}>모든 모둠을 평가하면 다음 단계로 넘어갈 수 있어요.</p>}
    </div>
  );
}

/* ---------- PDF 미리보기: pdf.js로 canvas에 렌더 (샌드박스 iframe에서도 동작) ---------- */
let _pdfjsPromise = null;
function loadPdfJs() {
  if (typeof window !== "undefined" && window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (_pdfjsPromise) return _pdfjsPromise;
  const VER = "3.11.174";
  _pdfjsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${VER}/pdf.min.js`;
    s.onload = () => {
      try {
        const lib = window.pdfjsLib;
        lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${VER}/pdf.worker.min.js`;
        resolve(lib);
      } catch (e) { reject(e); }
    };
    s.onerror = () => reject(new Error("pdfjs load failed"));
    document.head.appendChild(s);
  });
  return _pdfjsPromise;
}

function PdfPreview({ dataUrl, fileName }) {
  const hostRef = useRef(null);
  const [state, setState] = useState("loading"); // loading | done | error
  const [numPages, setNumPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState("loading");
      try {
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        const b64 = (dataUrl.split(",")[1]) || "";
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        const host = hostRef.current;
        if (!host) return;
        host.innerHTML = "";
        const width = host.clientWidth || 560;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const maxPages = Math.min(doc.numPages, 12);
        for (let p = 1; p <= maxPages; p++) {
          const page = await doc.getPage(p);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = Math.max(0.2, width / base.width);
          const vp = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          canvas.width = Math.floor(vp.width * dpr);
          canvas.height = Math.floor(vp.height * dpr);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.display = "block";
          canvas.style.borderRadius = "8px";
          canvas.style.marginBottom = "10px";
          canvas.style.boxShadow = "0 1px 5px rgba(0,0,0,.10)";
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          if (cancelled) return;
          host.appendChild(canvas);
        }
        setNumPages(doc.numPages);
        setState("done");
      } catch (e) {
        if (!cancelled) setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [dataUrl]);

  return (
    <div style={{ marginTop: 12 }}>
      <div ref={hostRef} style={{ maxHeight: 560, overflowY: "auto", background: "var(--surface-2)", border: "1px solid var(--line-2)", borderRadius: 12, padding: 10, display: state === "done" ? "block" : "none" }} />
      {state === "loading" && (
        <div className="center muted" style={{ justifyContent: "center", padding: 28, background: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--line-2)" }}>
          <Loader2 className="spin" size={16} /> 결과물 미리보기를 불러오는 중…
        </div>
      )}
      {state === "error" && <Banner kind="warn">미리보기를 표시하지 못했어요. 아래 ‘파일 열기’로 결과물을 확인한 뒤 평가해 주세요.</Banner>}
      <div className="center" style={{ gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <a className="btn sm" href={dataUrl} download={fileName || "결과물.pdf"}><FileText size={14} /> 파일 열기 / 다운로드</a>
        {state === "done" && numPages > 12 && <span className="hint">앞 12쪽까지 보여줘요. 전체는 다운로드해서 확인하세요.</span>}
      </div>
    </div>
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function scoreText(value, max) {
  return value == null ? `- / ${max}` : `${round1(value)} / ${max}`;
}

function commentCards(title, items) {
  if (!items || items.length === 0) return "";
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      ${items.map((cm, i) => `
        <div class="note">
          <b>의견 ${i + 1}</b>
          ${cm.good ? `<p><strong>좋은 점</strong><br>${escapeHtml(cm.good)}</p>` : ""}
          ${cm.improve ? `<p><strong>더 좋아질 점</strong><br>${escapeHtml(cm.improve)}</p>` : ""}
        </div>
      `).join("")}
    </section>
  `;
}

function studentResultPrintStyles() {
  return `
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Noto Sans KR", "Malgun Gothic", Arial, sans-serif; color: #17352b; margin: 0; line-height: 1.55; }
  .report { width: 100%; }
  .report-page { break-after: page; page-break-after: always; }
  .report-page:last-child { break-after: auto; page-break-after: auto; }
  header { border-bottom: 3px solid #1f7a54; padding-bottom: 14px; margin-bottom: 18px; }
  .eyebrow { color: #1f7a54; font-size: 12px; font-weight: 800; letter-spacing: .08em; }
  h1 { font-size: 28px; margin: 4px 0 6px; }
  h2 { font-size: 17px; margin: 22px 0 10px; border-bottom: 1px solid #dce6dd; padding-bottom: 6px; }
  .meta { color: #65736a; font-size: 13px; }
  .score-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 16px 0; }
  .score { border: 1px solid #dce6dd; border-radius: 10px; padding: 12px; background: #f7faf7; }
  .score b { display: block; font-size: 22px; margin-top: 4px; }
  .total { background: #e6f3eb; border-color: #b8d9c5; }
  .note { border: 1px solid #e3e8e4; border-radius: 10px; padding: 11px 12px; margin-bottom: 8px; break-inside: avoid; }
  .note p { margin: 7px 0 0; }
  .rubric { display: grid; gap: 7px; }
  .rubric-row { border: 1px solid #e3e8e4; border-radius: 8px; padding: 9px 10px; break-inside: avoid; }
  .muted { color: #6f7a72; }
  pre { white-space: pre-wrap; font-family: inherit; margin: 4px 0 0; }
  footer { margin-top: 26px; color: #7a857e; font-size: 11px; text-align: right; }
  @media print {
    .report-page { page-break-after: always; }
    .report-page:last-child { page-break-after: auto; }
  }
`;
}

function studentResultReportHtml({ config, student, group, draftRec, reflect, peerComments, collabComments, totalMax, generatedAt, paged = false }) {
  const classLabel = className(config, student.classId) || "";
  const groupLabel = student.groupName || group?.name || groupName(config, student.groupId);
  const footerTime = generatedAt || new Date().toLocaleString("ko-KR");
  return `<main class="report${paged ? " report-page" : ""}">
  <header>
    <div class="eyebrow">PROJECT 1 개인 결과지</div>
    <h1>${escapeHtml(student.name)} 학생 결과</h1>
    <div class="meta">${escapeHtml(classLabel)}${classLabel ? " · " : ""}${escapeHtml(groupLabel)} · ${escapeHtml(config.project.title || "모둠 프로젝트 평가")}</div>
  </header>

  <section class="score-grid">
    <div class="score total"><span>최종 점수</span><b>${scoreText(student.total, totalMax)}</b></div>
    <div class="score"><span>동료평가</span><b>${scoreText(student.peerScore, student.peerMax)}</b><small>모둠 공통 점수 · ${student.peerN || 0}개 평가</small></div>
    <div class="score"><span>협업평가</span><b>${scoreText(student.collabScore, student.collabMax)}</b><small>개인이 받은 점수 · ${student.collabN || 0}명 평가</small></div>
  </section>

  <section>
    <h2>점수 해석</h2>
    <p>동료평가는 우리 모둠 결과물에 대한 점수라서 같은 모둠원이 함께 받습니다. 협업평가는 모둠 안에서 내가 받은 평가의 평균이라 학생마다 다릅니다. 최종 점수는 동료평가와 협업평가를 그대로 더한 값입니다.</p>
  </section>

  ${commentCards("다른 모둠이 우리 모둠에게 준 의견", peerComments)}
  ${commentCards("모둠 친구들이 나에게 해준 말", collabComments)}

  ${draftRec && (draftRec.good || draftRec.improve || draftRec.items?.length) ? `
    <section>
      <h2>AI 피드백 참고</h2>
      ${draftRec.aiScore != null ? `<p class="muted">참고 점수 ${escapeHtml(scoreText(draftRec.aiScore, draftRec.aiMax || 100))}</p>` : ""}
      ${draftRec.good ? `<div class="note"><strong>잘한 점</strong><br>${escapeHtml(draftRec.good)}</div>` : ""}
      ${draftRec.improve ? `<div class="note"><strong>고치면 좋을 점</strong><br>${escapeHtml(draftRec.improve)}</div>` : ""}
      ${draftRec.items?.length ? `<div class="rubric">${draftRec.items.map((it) => `<div class="rubric-row"><b>${escapeHtml(it.no)}. ${escapeHtml(aiItems(config).find((x) => x.no === it.no)?.name || "")}</b> · ${escapeHtml(it.rating)} ${escapeHtml(it.score)}점<br><span class="muted">${escapeHtml(it.reason || "")}</span></div>`).join("")}</div>` : ""}
    </section>
  ` : ""}

  ${reflect?.answers?.length ? `
    <section>
      <h2>프로젝트 성찰</h2>
      ${reflect.answers.map((a, i) => `<div class="note"><b>${i + 1}. ${escapeHtml(a.q)}</b><pre>${escapeHtml(a.a || "")}</pre></div>`).join("")}
    </section>
  ` : ""}

  <footer>${escapeHtml(runtimeOptions().footerUrl)} · ${escapeHtml(footerTime)}</footer>
</main>`;
}

function openResultPrintWindow({ title, bodyHtml }) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) {
    window.alert("팝업이 차단되어 결과지 출력 창을 열지 못했어요. 브라우저에서 팝업 허용 후 다시 눌러 주세요.");
    return;
  }
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${studentResultPrintStyles()}</style>
</head>
<body>
${bodyHtml}
<script>
  window.addEventListener('load', () => setTimeout(() => window.print(), 250));
</script>
</body>
</html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function openStudentResultPdf({ config, student, group, draftRec, reflect, peerComments, collabComments, totalMax }) {
  const generatedAt = new Date().toLocaleString("ko-KR");
  openResultPrintWindow({
    title: `${student.name} 개인 결과지`,
    bodyHtml: studentResultReportHtml({
      config,
      student,
      group,
      draftRec,
      reflect,
      peerComments,
      collabComments,
      totalMax,
      generatedAt,
    }),
  });
}

function openStudentResultBatchPdf({ config, students, groupsById, draftsByGroupId, reflectionsByKey, totalMax, title }) {
  if (!students || students.length === 0) {
    window.alert("출력할 학생이 없습니다.");
    return;
  }
  const generatedAt = new Date().toLocaleString("ko-KR");
  const bodyHtml = students.map((student) => studentResultReportHtml({
    config,
    student,
    group: groupsById?.[student.groupId],
    draftRec: draftsByGroupId?.[student.groupId],
    reflect: reflectionsByKey?.[student.key],
    peerComments: student.comments || [],
    collabComments: student.collabComments || [],
    totalMax,
    generatedAt,
    paged: true,
  })).join("\n");
  openResultPrintWindow({ title, bodyHtml });
}

function PeerEvalForm({ config, me, group, items, onBack, onSaved }) {
  const [picks, setPicks] = useState({});
  const [texts, setTexts] = useState({}); // {good, improve, ...}
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const lastDraftStampRef = useRef("");
  const finalizingRef = useRef(false);
  const openQs = peerOpenQs(config);
  const peerKey = "pj_peer_" + me.key;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setDraftLoaded(false);
      setDraftStatus("");
      const [targetSub, existing] = await Promise.all([
        store.get("pj_sub_" + group.id, true),
        store.get(peerKey, true),
      ]);
      if (cancelled) return;
      const submitted = existing?.evals?.[group.id];
      const draft = existing?.drafts?.[group.id];
      const source = draft || submitted;
      const nextPicks = source?.picks
        ? source.picks
        : Object.fromEntries((source?.items || []).map((it) => [it.no, it.rating]).filter(([, rating]) => rating));
      const nextTexts = source?.open || {};
      setPicks(nextPicks);
      setTexts(nextTexts);
      lastDraftStampRef.current = JSON.stringify({ picks: nextPicks, open: nextTexts });
      setSub(targetSub);
      setLoading(false);
      setDraftLoaded(true);
      if (draft) setDraftStatus("임시저장 불러옴");
    })();
    return () => { cancelled = true; };
  }, [group.id, peerKey]);

  useEffect(() => {
    if (!draftLoaded || finalizingRef.current) return;
    const stamp = JSON.stringify({ picks, open: texts });
    if (stamp === lastDraftStampRef.current) return;
    const hasInput = Object.keys(picks).length > 0 || Object.values(texts).some((v) => String(v || "").trim());
    if (!hasInput) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setDraftStatus("임시저장 중…");
      const existing = (await store.get(peerKey, true)) || { by: me.key, byGroup: me.groupId, evals: {}, drafts: {} };
      existing.evals = existing.evals || {};
      existing.drafts = existing.drafts || {};
      existing.drafts[group.id] = { picks, open: texts, ts: Date.now() };
      existing.updatedAt = Date.now();
      await store.set(peerKey, existing, true);
      lastDraftStampRef.current = stamp;
      if (!cancelled) setDraftStatus("임시저장됨");
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [draftLoaded, group.id, me.groupId, me.key, peerKey, picks, texts]);

  const ratingsDone = items.every((it) => picks[it.no]);
  const textsDone = openQs.every((q) => (texts[q.id] || "").trim().length > 0);

  const save = async () => {
    finalizingRef.current = true;
    setDraftStatus("제출 중…");
    const score = sumItems(items, picks);
    const open = {};
    openQs.forEach((q) => { open[q.id] = (texts[q.id] || "").trim(); });
    const existing = (await store.get(peerKey, true)) || { by: me.key, byGroup: me.groupId, evals: {}, drafts: {} };
    existing.evals = existing.evals || {};
    existing.evals[group.id] = {
      items: items.map((it) => ({ no: it.no, rating: picks[it.no], score: itemScore(it, picks[it.no]) })),
      score, open, ts: Date.now(),
    };
    if (existing.drafts) delete existing.drafts[group.id];
    existing.updatedAt = Date.now();
    await store.set(peerKey, existing, true);
    await markResultsChanged("peer");
    setDraftStatus("제출 완료");
    await onSaved();
  };

  return (
    <div className="fade">
      <button className="btn ghost" onClick={onBack} style={{ marginBottom: 8 }}><ArrowLeft size={16} /> 모둠 목록</button>
      <StepHeader idx={3} title={`${group.name} 평가`} color="var(--accent)" Icon={Users} sub="결과물을 읽고 기준대로 점수를 매긴 뒤, 좋은 점과 아쉬운 점을 적어 주세요." />

      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 10 }}><BookOpen size={16} style={{ verticalAlign: -3 }} /> {group.name}의 결과물</div>
        {loading ? <div className="center muted"><Loader2 className="spin" size={16} /> 불러오는 중…</div> :
          !sub ? <Banner kind="warn">이 모둠은 아직 결과물을 올리지 않았어요. 올린 뒤에 다시 평가해 주세요.</Banner> :
            <>
              {sub.summary && <Banner kind="info" icon={Sparkles}><b>요약</b> · {sub.summary}</Banner>}
              {sub.pdfData ? (
                <PdfPreview dataUrl={sub.pdfData} fileName={sub.fileName} />
              ) : (
                <Banner kind="warn">
                  이 파일은 이전 용량 제한 때 등록되어 PDF 미리보기 데이터가 저장되지 않았어요. 해당 모둠이 최종본을 다시 올리면 여기에서 바로 미리보기가 표시됩니다.
                </Banner>
              )}
            </>}
      </div>

      {sub && (
        <div className="card pad-lg">
          <div className="eyebrow" style={{ marginBottom: 10 }}><CheckSquare size={14} /> 점수 매기기 (양적 평가)</div>
          {draftStatus && <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>{draftStatus}</p>}
          {items.map((it) => (
            <ItemCard key={it.no} item={it} value={picks[it.no]} accent="var(--accent)" onChange={(g) => setPicks((p) => ({ ...p, [it.no]: g }))} />
          ))}

          <div className="divider" />
          <div className="eyebrow" style={{ marginBottom: 10 }}><PenLine size={14} /> 의견 쓰기 (질적 평가)</div>
          <p className="hint" style={{ marginTop: -4, marginBottom: 12 }}>여기에 쓴 내용은 그 모둠에게 그대로 전달돼요. 친구가 힘이 나도록, 도움이 되도록 적어 주세요.</p>
          {openQs.map((q) => (
            <div key={q.id} className="field">
              <label className="label">{q.label}</label>
              <textarea className="textarea" style={{ minHeight: 70 }} placeholder={q.placeholder}
                value={texts[q.id] || ""} onChange={(e) => setTexts((s) => ({ ...s, [q.id]: e.target.value }))} />
            </div>
          ))}

          <button className="btn accent lg" style={{ width: "100%", marginTop: 4 }} disabled={!ratingsDone || !textsDone} onClick={save}>
            <Save size={16} /> {group.name} 평가 제출
          </button>
          {(!ratingsDone || !textsDone) && <p className="hint" style={{ marginTop: 10, textAlign: "center" }}>모든 항목에 점수를 매기고 의견도 적어야 제출할 수 있어요.</p>}
        </div>
      )}
    </div>
  );
}

/* ---------- STEP 3: 협업평가 ---------- */
function StepCollab({ config, me, collab, targets, onDone, goNext, nextStepOpen = true }) {
  const items = collabItems(config);
  const openQs = collabOpenQs(config);
  const makeEmptyCollab = useCallback(() => ({ by: me.key, group: me.groupId, ratings: {} }), [me.key, me.groupId]);
  const cloneCollab = useCallback((record) => {
    const base = record || makeEmptyCollab();
    const cloned = typeof globalThis.structuredClone === "function"
      ? globalThis.structuredClone(base)
      : JSON.parse(JSON.stringify(base));
    return {
      by: cloned.by || me.key,
      group: cloned.group || me.groupId,
      ratings: cloned.ratings || {},
      updatedAt: cloned.updatedAt,
    };
  }, [makeEmptyCollab, me.groupId, me.key]);
  const [localCollab, setLocalCollab] = useState(() => cloneCollab(collab));
  const [openDraft, setOpenDraft] = useState({}); // tKey -> { qid: text }
  const [saveStatus, setSaveStatus] = useState("idle");
  const [movingNext, setMovingNext] = useState(false);
  const latestCollabRef = useRef(localCollab);
  const pendingSaveRef = useRef(null);
  const savingRef = useRef(false);
  const saveTimerRef = useRef(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (dirtyRef.current || savingRef.current || pendingSaveRef.current) return;
    const incoming = cloneCollab(collab);
    const localStamp = latestCollabRef.current?.updatedAt || 0;
    const incomingStamp = incoming.updatedAt || 0;
    if (localStamp && incomingStamp < localStamp) return;
    latestCollabRef.current = incoming;
    setLocalCollab(incoming);
  }, [cloneCollab, collab]);
  const ratings = localCollab?.ratings || {};
  const nameOf = (key) => key.split("::")[1];

  const runQueuedSave = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      while (pendingSaveRef.current) {
        const pending = pendingSaveRef.current;
        pendingSaveRef.current = null;
        setSaveStatus("saving");
        try {
          await store.set("pj_collab_" + me.key, pending.record, true);
          if (pending.touchesResults) await markResultsChanged("collab");
          if (!pendingSaveRef.current) {
            dirtyRef.current = false;
            setSaveStatus("saved");
            void onDone();
          }
        } catch (e) {
          pendingSaveRef.current = pendingSaveRef.current || pending;
          setSaveStatus("error");
          break;
        }
      }
    } finally {
      savingRef.current = false;
    }
  }, [me.key, onDone]);

  const scheduleCollabSave = useCallback((next, touchesResults) => {
    dirtyRef.current = true;
    latestCollabRef.current = next;
    const alreadyTouchesResults = pendingSaveRef.current?.touchesResults;
    pendingSaveRef.current = { record: next, touchesResults: Boolean(touchesResults || alreadyTouchesResults) };
    setSaveStatus("pending");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void runQueuedSave();
    }, 450);
  }, [runQueuedSave]);

  const updateLocalCollab = useCallback((updater) => {
    const base = cloneCollab(latestCollabRef.current);
    let touchesResults = false;
    const markTouchesResults = () => { touchesResults = true; };
    const next = updater(base, markTouchesResults);
    next.updatedAt = Date.now();
    latestCollabRef.current = next;
    setLocalCollab(next);
    scheduleCollabSave(next, touchesResults);
  }, [cloneCollab, scheduleCollabSave]);

  const flushCollabSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (pendingSaveRef.current && !savingRef.current) await runQueuedSave();
    let guard = 0;
    while ((savingRef.current || pendingSaveRef.current) && guard < 120) {
      if (!savingRef.current && pendingSaveRef.current) await runQueuedSave();
      else await new Promise((resolve) => setTimeout(resolve, 40));
      guard += 1;
    }
  }, [runQueuedSave]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const pending = pendingSaveRef.current;
    if (pending) {
      pendingSaveRef.current = null;
      void store.set("pj_collab_" + me.key, pending.record, true)
        .then(() => pending.touchesResults ? markResultsChanged("collab") : null);
    }
  }, [me.key]);

  const setPick = (targetKey, no, g) => {
    updateLocalCollab((cur, markTouchesResults) => {
      const prev = cur.ratings[targetKey] || { picks: {} };
      const existing = {
        ...prev,
        picks: { ...(prev.picks || {}), [no]: g },
      };
      const all = items.every((it) => existing.picks[it.no]);
      existing.items = items.map((it) => ({ no: it.no, rating: existing.picks[it.no], score: existing.picks[it.no] ? itemScore(it, existing.picks[it.no]) : 0 }));
      existing.score = all ? sumItems(items, existing.picks) : existing.score;
      existing.complete = all;
      if (existing.complete) markTouchesResults();
      cur.ratings[targetKey] = existing;
      return cur;
    });
  };

  const saveOpen = (targetKey) => {
    const draft = openDraft[targetKey];
    if (!draft) return;
    updateLocalCollab((cur, markTouchesResults) => {
      const prev = cur.ratings[targetKey] || { picks: {} };
      const existing = {
        ...prev,
        picks: { ...(prev.picks || {}) },
        open: { ...(prev.open || {}), ...draft },
      };
      markTouchesResults();
      cur.ratings[targetKey] = existing;
      return cur;
    });
    setOpenDraft((d) => {
      const n = { ...d };
      delete n[targetKey];
      return n;
    });
  };

  const handleGoNext = async () => {
    setMovingNext(true);
    await flushCollabSave();
    if (pendingSaveRef.current) {
      setSaveStatus("error");
      setMovingNext(false);
      return;
    }
    void onDone();
    setMovingNext(false);
    goNext(true);
  };

  const allDone = targets.length === 0 || targets.every((t) => ratings[t]?.complete);
  const saveStatusLabel =
    saveStatus === "pending" ? "저장 대기 중" :
    saveStatus === "saving" ? "저장 중" :
    saveStatus === "saved" ? "저장됨" :
    saveStatus === "error" ? "저장 실패" : "";

  if (targets.length === 0) {
    return (
      <div className="fade">
        <StepHeader idx={4} title="협업평가" color="var(--violet)" Icon={Handshake} sub="같은 모둠끼리 서로 평가합니다." />
        <Banner kind="info">평가할 모둠원이 없어 이 단계를 건너뜁니다.</Banner>
        <div style={{ height: 14 }} />
        <button className="btn primary lg" disabled={!nextStepOpen} onClick={goNext}>
          {nextStepOpen ? <>다음 단계로 <ChevronRight size={17} /></> : <><Lock size={17} /> 선생님이 열면 이동</>}
        </button>
      </div>
    );
  }

  return (
    <div className="fade">
      <StepHeader idx={4} title="협업평가" color="var(--violet)" Icon={Handshake}
        sub={`우리 모둠 친구들${config.settings.selfInCollab ? "(나 포함)" : ""}이 역할 분담과 참여를 얼마나 잘했는지 솔직하게 평가해요. 친구에게 해주고 싶은 말은 쓰고 싶을 때만 적으면 돼요. 다른 모둠은 볼 수 없어요.`} />
      <div className="list-rest">
        {targets.map((tKey) => {
          const r = ratings[tKey];
          const isMe = nameOf(tKey) === me.name;
          return (
            <div key={tKey} className="card pad" style={{ borderColor: r?.complete ? "var(--green-100)" : "var(--line)" }}>
              <div className="between" style={{ marginBottom: 12 }}>
                <div className="center">
                  <span className="chip" style={{ background: "var(--violet-soft)", color: "var(--violet)" }}><UserCircle2 size={18} /></span>
                  <div className="h3">{nameOf(tKey)} {isMe && <span className="pill gray" style={{ fontSize: 11 }}>나</span>}</div>
                </div>
                {r?.complete && <span className="pill green" style={{ fontSize: 11 }}><CheckCircle2 size={12} /> {r.score}점</span>}
              </div>
              {items.map((it) => (
                <div key={it.no} style={{ marginBottom: 12 }}>
                  <div className="center" style={{ marginBottom: 7 }}>
                    <span className="chip" style={{ width: 26, height: 26, fontSize: 12, background: "var(--surface-2)", border: "1px solid var(--line-2)", fontWeight: 800 }}>{it.no}</span>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{it.name}</span>
                  </div>
                  <RatingPicker item={it} value={r?.picks?.[it.no]} onChange={(g) => setPick(tKey, it.no, g)} />
                </div>
              ))}
              {!isMe && openQs.length > 0 && (
                <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px dashed var(--line)" }}>
                  <div className="center" style={{ gap: 6, marginBottom: 8 }}>
                    <MessageSquare size={14} style={{ color: "var(--violet)" }} />
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{nameOf(tKey)}에게 해주고 싶은 말</span>
                    <span className="pill gray" style={{ fontSize: 10.5 }}>선택 · 익명 전달</span>
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    {openQs.map((q) => (
                      <div key={q.id} style={{ flex: "1 1 220px" }}>
                        <label className="label" style={{ fontSize: 12.5 }}>{q.label}</label>
                        <textarea className="textarea" style={{ minHeight: 64, fontSize: 13 }}
                          placeholder={q.placeholder}
                          value={openDraft[tKey]?.[q.id] ?? r?.open?.[q.id] ?? ""}
                          onChange={(e) => setOpenDraft((d) => ({ ...d, [tKey]: { ...(d[tKey] || {}), [q.id]: e.target.value } }))}
                          onBlur={() => saveOpen(tKey)} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="between" style={{ marginTop: 16 }}>
        <div className="center" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="pill">{targets.filter((t) => ratings[t]?.complete).length} / {targets.length} 명 평가함</span>
          {saveStatusLabel && (
            <span
              className={`pill ${saveStatus === "saved" ? "green" : ""}`}
              style={saveStatus === "error" ? { background: "#fdf3e6", color: "#8a5a14", borderColor: "#f3ddb8" } : undefined}
            >
              {(saveStatus === "pending" || saveStatus === "saving") && <Loader2 className="spin" size={12} />}
              {saveStatus === "saved" && <CheckCircle2 size={12} />}
              {saveStatus === "error" && <AlertTriangle size={12} />}
              {saveStatusLabel}
            </span>
          )}
        </div>
        <button className="btn primary lg" disabled={!allDone || movingNext || !nextStepOpen} onClick={handleGoNext}>
          {movingNext ? <><Loader2 className="spin" size={17} /> 저장 후 이동 중</> : nextStepOpen ? <>다음: 결과 확인 <ChevronRight size={17} /></> : <><Lock size={17} /> 선생님이 열면 이동</>}
        </button>
      </div>
    </div>
  );
}

/* ---------- STEP 4: 평가결과 확인 ---------- */
function StepReport({ config, me, draftRec, reflect, onSeen, goNext, done, nextStepOpen = true }) {
  const [agg, setAgg] = useState(null);
  useEffect(() => { (async () => { const a = await aggregateAll(config); setAgg(a); onSeen(); })(); /* eslint-disable-next-line */ }, []);

  if (!agg) return <div className="center muted" style={{ padding: 40 }}><Loader2 className="spin" size={18} /> 결과 보고서를 만드는 중…</div>;
  const groupMine = agg.groups.find((g) => g.id === me.groupId);
  const mine = (agg.students || []).find((s) => s.key === me.key) || {
    ...(groupMine || {}),
    key: me.key,
    name: me.name,
    groupId: me.groupId,
    groupName: groupMine?.name || groupName(config, me.groupId),
    classId: me.classId || groupMine?.classId,
    collabComments: (agg.collabCommentsByMember && agg.collabCommentsByMember[me.key]) || [],
  };
  const total = mine.total != null ? round1(mine.total) : 0;
  const partial = mine.peerScore == null || mine.collabScore == null;
  const items = aiItems(config);
  const peerComments = groupMine?.comments || mine.comments || [];
  const myCollabComments = mine.collabComments || (agg.collabCommentsByMember && agg.collabCommentsByMember[me.key]) || [];
  const totalMax = agg.peerMax + agg.collabMax;

  const kpis = [
    ["동료 평가 (우리 모둠)", mine.peerScore, agg.peerMax, "var(--accent)", Users, mine.peerN, "모둠"],
    ["협업 평가 (내가 받은 평가)", mine.collabScore, agg.collabMax, "var(--violet)", Handshake, mine.collabN, "명"],
  ];

  const savePdf = () => openStudentResultPdf({
    config,
    me,
    student: mine,
    group: groupMine,
    draftRec,
    reflect,
    peerComments,
    collabComments: myCollabComments,
    totalMax,
  });

  return (
    <div className="fade">
      <StepHeader idx={5} title="평가결과 확인" color="var(--green)" Icon={BarChart3}
        sub="동료평가는 우리 모둠이 함께 받고, 협업평가는 내가 받은 평가로 계산해요. AI 피드백은 참고용으로 따로 보여줘요." />

      <div className="card pad-lg" style={{ marginBottom: 18, background: "linear-gradient(160deg,#ffffff, #f3f9f5)" }}>
        <div className="row" style={{ alignItems: "center", gap: 22, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center", minWidth: 150 }}>
            <div className="eyebrow" style={{ justifyContent: "center" }}>나의 최종 점수</div>
            <div className="big-score" style={{ color: "var(--green-700)", marginTop: 6 }}>{total}<span className="faint" style={{ fontSize: 18 }}> /100</span></div>
            <div style={{ marginTop: 10, width: 180, marginLeft: "auto", marginRight: "auto" }}><ScoreBar value={total} max={100} /></div>
          </div>
          <div className="col" style={{ gap: 10, flex: 1, minWidth: 240 }}>
            {kpis.map(([label, v, mx, c, Ic, n, unit]) => (
              <div key={label} className="row" style={{ alignItems: "center", gap: 12 }}>
                <span className="center" style={{ minWidth: 134, fontWeight: 700, fontSize: 13.5 }}><Ic size={15} style={{ color: c }} /> {label}</span>
                <div style={{ flex: 1 }}><ScoreBar value={v ?? 0} max={mx} /></div>
                <span className="mono" style={{ fontWeight: 800, minWidth: 52, textAlign: "right" }}>{v != null ? round1(v) : "—"}<span className="faint">/{mx}</span></span>
              </div>
            ))}
            <div className="hint" style={{ marginTop: 2 }}>최종 점수 = 우리 모둠 동료평가 {agg.peerMax}점 + 내가 받은 협업평가 {agg.collabMax}점 (그대로 합산)</div>
          </div>
        </div>
        {partial && <div style={{ marginTop: 16 }}><Banner kind="warn">친구들의 동료·협업 평가가 아직 진행 중일 수 있어요. 모두 끝나면 점수가 채워집니다.</Banner></div>}
      </div>

      {/* 받은 동료 의견 (좋은 점/아쉬운 점) */}
      {peerComments && peerComments.length > 0 && (
        <div className="card pad-lg" style={{ marginBottom: 18 }}>
          <h2 className="h2" style={{ marginBottom: 4 }}><MessageSquare size={18} style={{ verticalAlign: -3, color: "var(--accent)" }} /> 다른 모둠이 우리에게 준 의견</h2>
          <p className="hint" style={{ marginBottom: 14 }}>누가 썼는지는 익명이에요. 좋은 점은 자랑스러워하고, 아쉬운 점은 다음에 참고해요.</p>
          <div className="list-rest">
            {peerComments.map((cm, i) => (
              <div key={i} className="card pad" style={{ background: "var(--surface-2)" }}>
                <div className="pill gray" style={{ fontSize: 11, marginBottom: 10 }}>친구 {i + 1}</div>
                {cm.good && <div style={{ marginBottom: cm.improve ? 8 : 0 }}><span className="center" style={{ gap: 6, fontWeight: 800, color: "var(--green-700)", fontSize: 13 }}><ThumbsUp size={14} /> 좋은 점</span><div style={{ fontSize: 13.5, marginTop: 3, lineHeight: 1.6 }}>{cm.good}</div></div>}
                {cm.improve && <div><span className="center" style={{ gap: 6, fontWeight: 800, color: "var(--accent-700)", fontSize: 13 }}><Lightbulb size={14} /> 아쉬운 점</span><div style={{ fontSize: 13.5, marginTop: 3, lineHeight: 1.6 }}>{cm.improve}</div></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 모둠 친구들이 나에게 해준 말 (협업 주관식, 익명) */}
      {myCollabComments.length > 0 && (
        <div className="card pad-lg" style={{ marginBottom: 18 }}>
          <h2 className="h2" style={{ marginBottom: 4 }}><MessageSquare size={18} style={{ verticalAlign: -3, color: "var(--violet)" }} /> 모둠 친구들이 나에게 해준 말</h2>
          <p className="hint" style={{ marginBottom: 14 }}>같은 모둠 친구들이 써 준 메시지예요. 누가 썼는지는 익명이에요.</p>
          <div className="list-rest">
            {myCollabComments.map((cm, i) => (
              <div key={i} className="card pad" style={{ background: "var(--violet-soft)", borderColor: "transparent" }}>
                <div className="pill gray" style={{ fontSize: 11, marginBottom: 10 }}>친구 {i + 1}</div>
                {cm.good && <div style={{ marginBottom: cm.improve ? 8 : 0 }}><span className="center" style={{ gap: 6, fontWeight: 800, color: "var(--green-700)", fontSize: 13 }}><ThumbsUp size={14} /> 잘한 점</span><div style={{ fontSize: 13.5, marginTop: 3, lineHeight: 1.6 }}>{cm.good}</div></div>}
                {cm.improve && <div><span className="center" style={{ gap: 6, fontWeight: 800, color: "var(--accent-700)", fontSize: 13 }}><Lightbulb size={14} /> 개선할 점</span><div style={{ fontSize: 13.5, marginTop: 3, lineHeight: 1.6 }}>{cm.improve}</div></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI 피드백 (초안 단계, 참고용·최종 미반영) */}
      {draftRec && (draftRec.good || draftRec.improve || (draftRec.items && draftRec.items.length > 0)) && (
        <div className="card pad-lg" style={{ marginBottom: 18 }}>
          <h2 className="h2" style={{ marginBottom: 4 }}><Sparkles size={18} style={{ verticalAlign: -3, color: "var(--teal)" }} /> AI 피드백 <span className="pill gray" style={{ fontSize: 11, verticalAlign: 2 }}>참고용 · 최종 점수 미반영</span></h2>
          <p className="hint" style={{ marginBottom: 14 }}>1단계 초안에서 받은 수정용 피드백이에요{draftRec.aiScore != null ? ` (참고 점수 ${draftRec.aiScore}/${draftRec.aiMax || agg.aiMax})` : ""}.</p>
          {(draftRec.good || draftRec.improve) && (
            <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
              {draftRec.good && <div className="card pad" style={{ flex: "1 1 260px", background: "var(--green-soft)", borderColor: "transparent" }}><div className="center" style={{ gap: 7, fontWeight: 800, color: "var(--green-700)", marginBottom: 6 }}><ThumbsUp size={16} /> 잘한 점</div><div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{draftRec.good}</div></div>}
              {draftRec.improve && <div className="card pad" style={{ flex: "1 1 260px", background: "var(--accent-soft)", borderColor: "transparent" }}><div className="center" style={{ gap: 7, fontWeight: 800, color: "var(--accent-700)", marginBottom: 6 }}><Lightbulb size={16} /> 고치면 좋을 점</div><div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{draftRec.improve}</div></div>}
            </div>
          )}
        </div>
      )}

      <div className="between">
        <span className="pill green"><CheckCircle2 size={14} /> 결과를 확인했어요</span>
        <div className="center">
          <button className="btn lg" onClick={savePdf}><FileText size={16} /> 개인 결과지 PDF 저장</button>
          <button className="btn primary lg" disabled={!nextStepOpen} onClick={goNext}>
            {nextStepOpen ? <>마지막: 프로젝트 성찰하기 <Lightbulb size={16} /></> : <><Lock size={16} /> 선생님이 열면 이동</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- STEP 5: 프로젝트 성찰 ---------- */
function StepReflect({ config, me, reflect, onDone }) {
  const questions = reflectionQuestionsFor(config, me, reflect);
  const intro = PROJECT_END_REFLECTION_INTRO;
  const [answers, setAnswers] = useState(() => {
    const o = {}; (reflect?.answers || []).forEach((a, i) => (o[i] = a.a)); return o;
  });
  const [saved, setSaved] = useState(!!reflect);

  const save = async () => {
    const payload = {
      by: me.key, groupId: me.groupId, name: me.name, intro,
      source: "public/project_end.pdf",
      answers: questions.map((q, i) => ({ q, a: answers[i] || "" })), ts: Date.now(),
    };
    await store.set("pj_reflect_" + me.key, payload, true);
    await markReflectionsChanged("reflect");
    setSaved(true);
    await onDone();
  };

  return (
    <div className="fade">
      <StepHeader idx={6} title="프로젝트 성찰하기" color="var(--rose)" Icon={Lightbulb}
        sub="평가 결과를 바탕으로 프로젝트 전체를 돌아봐요. 정답은 없어요. 솔직하게 적을수록 다음 프로젝트가 더 좋아져요." />

      {intro && <div style={{ marginBottom: 16 }}><Banner kind="info" icon={FileText}>{intro}</Banner></div>}
      <div className="list-rest" style={{ marginBottom: 16 }}>
        {questions.map((q, i) => (
          <div key={i} className="card pad">
            <div className="center" style={{ marginBottom: 10, alignItems: "flex-start" }}>
              <span className="chip" style={{ background: "var(--rose-soft)", color: "var(--rose)", flex: "none" }}>{i + 1}</span>
              <div className="h3" style={{ paddingTop: 6, whiteSpace: "pre-line", lineHeight: 1.55 }}>{q}</div>
            </div>
            <textarea className="textarea" placeholder="여기에 생각을 적어 보세요…" value={answers[i] || ""}
              onChange={(e) => { setAnswers((a) => ({ ...a, [i]: e.target.value })); setSaved(false); }} />
          </div>
        ))}
      </div>
      <div className="between">
        <span className="hint">모든 학생에게 같은 성찰 질문이 제공됩니다.</span>
        <div className="center">
          {saved && <span className="pill green"><CheckCircle2 size={14} /> 저장됨</span>}
          <button className="btn primary lg" onClick={save}><Save size={16} /> 성찰 제출하기</button>
        </div>
      </div>
      {saved && (
        <div style={{ marginTop: 18 }}>
          <Banner kind="ok" icon={Sprout}>
            모든 평가와 성찰을 마쳤어요. 프로젝트를 끝까지 해낸 자신을 칭찬해 주세요. 선생님이 모두의 성찰을 함께 살펴볼 거예요.
          </Banner>
        </div>
      )}
    </div>
  );
}
