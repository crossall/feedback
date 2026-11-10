import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Sprout, GraduationCap, Users, Handshake, BarChart3, Lightbulb, Upload, Lock,
  CheckCircle2, ChevronRight, Settings, FileText, Plus, Trash2, Save, RefreshCw,
  Sparkles, AlertTriangle, ArrowLeft, BookOpen, PenLine, ClipboardList,
  UserCircle2, LogOut, Eye, Link2, Loader2
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
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, messages }),
  });
  const data = await res.json();
  return (data.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
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
    ai: {
      title: "AI 평가",
      evaluator: "AI",
      max: 50,
      items: [
        { no: 1, name: "식물의 구조와 기능 (정확성)", high: 10, mid: 5, low: 0,
          hi: "구조(뿌리·줄기·잎·꽃 등)와 기능을 정확하고 자세히 설명했고, 틀린 정보가 없다",
          mi: "구조나 기능 중 일부만 설명했거나, 대체로 맞지만 일부 부정확하다",
          lo: "설명이 부족하고, 틀린 정보가 있거나 알 수 있는 점이 거의 없다" },
        { no: 2, name: "주제에 맞는 핵심 내용", high: 10, mid: 5, low: 0,
          hi: "맡은 식물 주제에 꼭 맞는 중요한 내용만 담겨 있다",
          mi: "중요한 내용은 있지만 관련 없는 내용이 조금 섞여 있다",
          lo: "관련 없는 내용이 많아 무엇을 말하려는지 알기 어렵다" },
        { no: 3, name: "믿을 수 있는 출처", high: 10, mid: 5, low: 0,
          hi: "출처를 정확히 밝혔고 믿을 만한 곳에서 가져왔다",
          mi: "출처를 밝혔지만 정확하지 않거나 일부만 있다",
          lo: "출처가 전혀 없고 그대로 베껴 쓴 것처럼 보인다" },
        { no: 4, name: "사진·그림", high: 10, mid: 5, low: 0,
          hi: "식물을 한눈에 알아볼 수 있는 사진·그림이 있다",
          mi: "사진·그림은 있지만 알아보기에 조금 부족하다",
          lo: "사진·그림이 없거나 식물과 관련이 없다" },
        { no: 5, name: "맞춤법·띄어쓰기", high: 10, mid: 5, low: 0,
          hi: "맞춤법과 띄어쓰기가 거의 정확하다",
          mi: "실수가 군데군데 있다",
          lo: "실수가 많아 읽기 불편하다" },
      ],
    },
    peer: {
      title: "동료평가",
      evaluator: "다른 모둠 친구들",
      max: 30,
      items: [
        { no: 6, name: "쉬운 설명 (모든 학년이 이해)", high: 15, mid: 10, low: 5,
          hi: "1~6학년 누구나 이해할 수 있게 쉬운 단어와 문장으로 썼다",
          mi: "대체로 이해되지만 어려운 단어나 헷갈리는 표현이 조금 있다",
          lo: "어려운 단어가 많고 문장이 복잡해 이해하기 어렵다" },
        { no: 7, name: "창의성·흥미·새로운 정보", high: 15, mid: 10, low: 5,
          hi: "몰랐던 새 정보가 있고 표현이 창의적이어서 읽는 재미가 있다",
          mi: "내용은 괜찮지만 평범해 이미 알 만한 정보가 대부분이다",
          lo: "새로운 정보가 없고 흥미를 끌 부분이 없다" },
      ],
    },
    collab: {
      title: "협업 평가",
      evaluator: "같은 모둠",
      max: 20,
      items: [
        { no: 8, name: "역할 분담의 공평함", high: 10, mid: 5, low: 0,
          hi: "모둠원 모두가 비슷한 양의 일을 맡아 공평하게 나눴다",
          mi: "역할을 나눴지만 일부 모둠원에게 일이 몰렸다",
          lo: "역할이 거의 안 나뉘어 한두 명이 대부분의 일을 했다" },
        { no: 9, name: "성실한 참여와 협력", high: 10, mid: 5, low: 0,
          hi: "모두가 끝까지 성실히 참여했고 믿을 수 있는 내용을 맡아 왔다",
          mi: "대부분 참여했지만 일부는 참여가 부족하거나 부정확한 내용을 가져왔다",
          lo: "참여하지 않은 모둠원이 있거나 맡은 일을 제대로 해 오지 않았다" },
      ],
    },
  },
  groups: [
    { id: "g1", name: "1모둠", members: ["김민준", "이서연", "박지호"] },
    { id: "g2", name: "2모둠", members: ["최유나", "정예준", "강하린"] },
    { id: "g3", name: "3모둠", members: ["윤도현", "임수아", "한지우"] },
  ],
};

/* ---------- 점수 도우미 ---------- */
const itemScore = (item, rating) =>
  rating === "상" ? item.high : rating === "중" ? item.mid : rating === "하" ? item.low : 0;
const sumItems = (items, picks) =>
  items.reduce((s, it) => s + itemScore(it, picks[it.no]), 0);
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const round1 = (n) => Math.round(n * 10) / 10;

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
  min-height:100vh; -webkit-font-smoothing:antialiased; line-height:1.5;
}
.wrap{max-width:1120px;margin:0 auto;padding:22px 20px 80px}
.row{display:flex;gap:12px} .col{display:flex;flex-direction:column}
.between{display:flex;align-items:center;justify-content:space-between;gap:12px}
.center{display:flex;align-items:center;gap:10px}
.muted{color:var(--ink-soft)} .faint{color:var(--ink-faint)}
.mono{font-variant-numeric:tabular-nums}
.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}

/* topbar */
.topbar{position:sticky;top:0;z-index:20;backdrop-filter:saturate(140%) blur(8px);
  background:rgba(238,243,239,.78);border-bottom:1px solid var(--line)}
.topbar-in{max-width:1120px;margin:0 auto;padding:11px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{display:flex;align-items:center;gap:11px;font-weight:800;letter-spacing:-.02em}
.brand .logo{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;
  background:linear-gradient(150deg,var(--green),#2c9e6b);color:#fff;box-shadow:0 6px 16px -8px rgba(31,122,84,.7)}
.brand small{display:block;font-weight:600;font-size:11.5px;color:var(--ink-soft);letter-spacing:0}

/* cards */
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow)}
.pad{padding:20px} .pad-lg{padding:26px}
.eyebrow{font-size:11.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--green);display:flex;align-items:center;gap:7px}
.h1{font-size:27px;font-weight:850;letter-spacing:-.03em;margin:6px 0}
.h2{font-size:19px;font-weight:800;letter-spacing:-.02em}
.h3{font-size:15px;font-weight:750}
.lede{font-size:14.5px;color:var(--ink-soft);max-width:62ch}

/* buttons */
.btn{appearance:none;border:1px solid var(--line-2);background:var(--surface);color:var(--ink);
  font:inherit;font-weight:700;font-size:14px;padding:10px 16px;border-radius:11px;cursor:pointer;
  display:inline-flex;align-items:center;gap:8px;transition:.15s;line-height:1}
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

/* role cards */
.role-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.role{cursor:pointer;border:1px solid var(--line);background:var(--surface);border-radius:var(--r);padding:26px;
  transition:.18s;box-shadow:var(--shadow);position:relative;overflow:hidden}
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
.checkrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px;border:1px solid var(--line);border-radius:13px;background:var(--surface);transition:.14s}
.checkrow.done{border-color:var(--green-100);background:var(--green-soft)}
.checkrow:hover{box-shadow:var(--shadow)}
.fade{animation:fade .35s ease both}@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
a.link{color:var(--green-700);font-weight:700;text-decoration:none;border-bottom:1.5px solid var(--green-100)}

@media (max-width:860px){
  .layout{grid-template-columns:1fr}
  .rail{position:static}
  .role-grid{grid-template-columns:1fr}
  .steps{display:flex;overflow-x:auto;gap:6px}
  .node{flex-direction:column;align-items:center;min-width:110px;text-align:center}
  .connector{display:none}
  .node .sub{display:none}
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
    <div className="seg" role="group">
      {opt.map(([g, p, d]) => (
        <button key={g} data-on={value === g ? g : undefined} onClick={() => onChange(g)} title={d}>
          <span className="g">{g}</span>
          <span className="p">{p}점</span>
        </button>
      ))}
    </div>
  );
}
function ItemCard({ item, value, onChange, accent = "var(--green)" }) {
  const desc = value === "상" ? item.hi : value === "중" ? item.mi : value === "하" ? item.lo : null;
  return (
    <div className="card pad" style={{ marginBottom: 14 }}>
      <div className="center" style={{ alignItems: "flex-start", marginBottom: 12 }}>
        <span className="chip" style={{ background: accent, color: "#fff", borderRadius: 10, fontWeight: 800 }}>
          {item.no}
        </span>
        <div>
          <div className="h3">{item.name}</div>
          <div className="hint" style={{ marginTop: 2 }}>상 {item.high} · 중 {item.mid} · 하 {item.low}점</div>
        </div>
      </div>
      <RatingPicker item={item} value={value} onChange={onChange} />
      {desc && <div className="muted" style={{ fontSize: 13, marginTop: 11, paddingLeft: 2 }}>“{desc}”</div>}
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
      setConfig(cfg);
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
        <style>{CSS}</style>
        <div className="center muted"><Loader2 className="spin" size={20} /> 불러오는 중…</div>
      </div>
    );

  return (
    <div className="pj-root">
      <style>{CSS}</style>
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <span className="logo"><Sprout size={20} /></span>
            <span>모둠 프로젝트 평가
              <small>{config?.project?.title || "평가 플랫폼"}</small>
            </span>
          </div>
          {me && (
            <div className="center">
              <span className="pill">
                {me.role === "teacher" ? <GraduationCap size={14} /> : <UserCircle2 size={14} />}
                {me.role === "teacher" ? `교사 · ${me.name || "선생님"}` : `${groupName(config, me.groupId)} · ${me.name}`}
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

/* =================================================================== */
/* ============================  ROLE GATE  ========================= */
/* =================================================================== */
function RoleGate({ onPick, config }) {
  const [mode, setMode] = useState(null); // null | 'student'
  const [gid, setGid] = useState("");
  const [name, setName] = useState("");
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
                <label className="label">우리 모둠</label>
                <select className="input" value={gid} onChange={(e) => { setGid(e.target.value); setName(""); }}>
                  <option value="">모둠 선택</option>
                  {config.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              {group && (
                <div className="field">
                  <label className="label">내 이름</label>
                  <select className="input" value={name} onChange={(e) => setName(e.target.value)}>
                    <option value="">이름 선택</option>
                    {group.members.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              )}
              <button className="btn primary lg" disabled={!gid || !name} style={{ width: "100%", marginTop: 6 }}
                onClick={() => onPick({ role: "student", groupId: gid, name, key: `${gid}::${name}` })}>
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
  const [acct, setAcct] = useState(null); // {name, hash} | null
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const a = await store.get("pj_teacher_auth", true);
      setAcct(a);
      setLoading(false);
    })();
  }, []);

  const create = async () => {
    setErr("");
    if (name.trim().length < 1) return setErr("선생님 이름(또는 별명)을 입력해 주세요.");
    if (pw.length < 4) return setErr("비밀번호는 4자 이상으로 정해 주세요.");
    if (pw !== pw2) return setErr("두 비밀번호가 서로 달라요. 다시 확인해 주세요.");
    setBusy(true);
    const rec = { name: name.trim(), hash: hashStr(pw) };
    await store.set("pj_teacher_auth", rec, true);
    setBusy(false);
    onAuthed(rec.name);
  };

  const login = () => {
    setErr("");
    if (hashStr(pw) !== acct.hash) return setErr("비밀번호가 맞지 않아요. 다시 입력해 주세요.");
    onAuthed(acct.name);
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
        ) : !acct ? (
          /* ---------- 최초 1회: 계정 만들기 ---------- */
          <>
            <h2 className="h1" style={{ fontSize: 22 }}>선생님 계정 만들기</h2>
            <p className="muted" style={{ fontSize: 13.5, marginTop: -4, marginBottom: 8 }}>
              처음이시네요. 이름과 비밀번호를 정하면 다음부터는 비밀번호로 들어올 수 있어요.
            </p>
            <div className="field">
              <label className="label">이름 (또는 별명)</label>
              <input className="input" value={name} placeholder="예: 김선생"
                onChange={(e) => setName(e.target.value)} onKeyDown={onEnter(create)} />
            </div>
            <div className="field">
              <label className="label">비밀번호 (4자 이상)</label>
              <input className="input" type="password" value={pw} placeholder="비밀번호"
                onChange={(e) => setPw(e.target.value)} onKeyDown={onEnter(create)} />
            </div>
            <div className="field">
              <label className="label">비밀번호 확인</label>
              <input className="input" type="password" value={pw2} placeholder="비밀번호 다시 입력"
                onChange={(e) => setPw2(e.target.value)} onKeyDown={onEnter(create)} />
            </div>
            {err && <Banner kind="warn">{err}</Banner>}
            <button className="btn primary lg" disabled={busy} style={{ width: "100%", marginTop: 6 }} onClick={create}>
              {busy ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />} 계정 만들고 시작하기
            </button>
            <p className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>
              ※ 비밀번호는 안전을 위해 변형해서 저장됩니다. 다만 이 도구는 한 교실용 간단한 잠금장치예요.
              잊으면 되돌릴 방법이 없으니 기억하기 쉬운 것으로 정해 주세요.
            </p>
          </>
        ) : (
          /* ---------- 이후: 로그인 ---------- */
          <>
            <h2 className="h1" style={{ fontSize: 22 }}>다시 오셨군요, {acct.name} 선생님</h2>
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
  const [draft, setDraft] = useState(config || DEFAULT_CONFIG);
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
  const loadExample = () => setDraft(structuredClone(DEFAULT_CONFIG));

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
            식물 안내서 예시 루브릭(9개 항목·100점)으로 한 번에 채워볼 수 있어요.
          </p>
          <button className="btn" onClick={loadExample}><RefreshCw size={15} /> 예시 루브릭 불러오기</button>
        </div>
      </div>
    </div>
  );
}

function TeacherRubric({ draft, setDraft }) {
  const cats = [
    ["ai", "var(--teal)", FileText],
    ["peer", "var(--accent)", Users],
    ["collab", "var(--violet)", Handshake],
  ];
  const updItem = (cat, no, field, val) => setDraft((d) => {
    const n = structuredClone(d);
    const it = n.rubric[cat].items.find((x) => x.no === no);
    it[field] = field === "name" || field.length === 2 ? val : Number(val);
    return n;
  });
  const catMax = (cat) => draft.rubric[cat].items.reduce((s, it) => s + it.high, 0);

  return (
    <div className="fade">
      <Banner kind="info">
        각 항목의 점수와 설명을 자유롭게 수정하세요. 영역별 만점은 각 항목 ‘상’ 점수의 합으로 자동 계산됩니다 — 현재 합계 <b>{catMax("ai") + catMax("peer") + catMax("collab")}점</b>.
      </Banner>
      <div style={{ height: 16 }} />
      {cats.map(([cat, color, Ic]) => (
        <div key={cat} className="card pad-lg" style={{ marginBottom: 18 }}>
          <div className="between" style={{ marginBottom: 6 }}>
            <div className="center">
              <span className="chip" style={{ background: color, color: "#fff" }}><Ic size={18} /></span>
              <div>
                <div className="h2">{draft.rubric[cat].title}</div>
                <div className="hint">평가자: {draft.rubric[cat].evaluator}</div>
              </div>
            </div>
            <span className="pill" style={{ background: color, color: "#fff", border: "none" }}>{catMax(cat)}점 만점</span>
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
    </div>
  );
}

function TeacherGroups({ draft, setDraft }) {
  const [gname, setGname] = useState("");
  const addGroup = () => {
    if (!gname.trim()) return;
    setDraft((d) => {
      const n = structuredClone(d);
      n.groups.push({ id: "g" + Date.now().toString(36), name: gname.trim(), members: [] });
      return n;
    });
    setGname("");
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
        <div className="row" style={{ gap: 8 }}>
          <input className="input" placeholder="새 모둠 이름 (예: 4모둠)" value={gname}
            onChange={(e) => setGname(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addGroup()} />
          <button className="btn primary" onClick={addGroup}><Plus size={16} /> 모둠 추가</button>
        </div>
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 16 }}>
        {draft.groups.map((g) => (
          <div key={g.id} className="card pad" style={{ flex: "1 1 320px" }}>
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
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setData(await aggregateAll(config));
    setLoading(false);
  }, [config]);
  useEffect(() => { if (config) load(); }, [config, load]);

  if (!config) return <Banner kind="warn">먼저 프로젝트를 설정하고 저장해 주세요.</Banner>;
  if (loading) return <div className="center muted" style={{ padding: 40 }}><Loader2 className="spin" size={18} /> 결과를 모으는 중…</div>;

  const chartData = data.groups.map((g) => ({
    name: g.name, AI: round1(g.ai ?? 0), 동료: round1(g.peer ?? 0), 협업: round1(g.collab ?? 0), 합계: round1(g.total ?? 0),
  }));

  return (
    <div className="fade">
      <div className="between" style={{ marginBottom: 14 }}>
        <h2 className="h2">모둠별 평가 결과</h2>
        <button className="btn sm" onClick={load}><RefreshCw size={15} /> 새로고침</button>
      </div>

      <div className="card pad-lg" style={{ marginBottom: 18 }}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6ece7" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#5d665f" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "#5d665f" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e1e8e2", fontSize: 13 }} />
            <Bar dataKey="AI" stackId="a" fill="#1f8a86" radius={[0, 0, 0, 0]} />
            <Bar dataKey="동료" stackId="a" fill="#e07b2f" />
            <Bar dataKey="협업" stackId="a" fill="#6b62b5" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="center" style={{ justifyContent: "center", gap: 18, marginTop: 6, fontSize: 12.5 }}>
          <span className="center"><i style={{ width: 11, height: 11, borderRadius: 3, background: "#1f8a86", display: "inline-block" }} /> AI (50)</span>
          <span className="center"><i style={{ width: 11, height: 11, borderRadius: 3, background: "#e07b2f", display: "inline-block" }} /> 동료 (30)</span>
          <span className="center"><i style={{ width: 11, height: 11, borderRadius: 3, background: "#6b62b5", display: "inline-block" }} /> 협업 (20)</span>
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden", marginBottom: 18 }}>
        <table className="tbl">
          <thead><tr><th>모둠</th><th className="r">AI</th><th className="r">동료</th><th className="r">협업</th><th className="r">합계 /100</th><th>제출</th></tr></thead>
          <tbody>
            {data.groups.map((g) => (
              <tr key={g.id}>
                <td style={{ fontWeight: 700 }}>{g.name}</td>
                <td className="r mono">{g.ai != null ? round1(g.ai) : "—"}</td>
                <td className="r mono">{g.peer != null ? `${round1(g.peer)}` : "—"}{g.peer != null && <span className="faint"> ({g.peerN})</span>}</td>
                <td className="r mono">{g.collab != null ? `${round1(g.collab)}` : "—"}{g.collab != null && <span className="faint"> ({g.collabN})</span>}</td>
                <td className="r mono" style={{ fontWeight: 800 }}>{g.total != null ? round1(g.total) : "—"}</td>
                <td>{g.submitted ? <span className="pill green" style={{ fontSize: 11 }}><CheckCircle2 size={12} /> 완료</span> : <span className="pill gray" style={{ fontSize: 11 }}>미제출</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginBottom: 18 }}>괄호 안 숫자는 평가에 참여한 학생 수입니다. 동료·협업 점수는 참여 학생들의 평균입니다.</p>

      <h2 className="h2" style={{ marginBottom: 12 }}>학생 성찰 모아보기</h2>
      {data.reflections.length === 0 ? (
        <Banner kind="info">아직 제출된 성찰이 없습니다.</Banner>
      ) : (
        <div className="list-rest">
          {data.reflections.map((r, i) => (
            <div key={i} className="card pad">
              <div className="center" style={{ marginBottom: 10 }}>
                <span className="pill">{groupName(config, r.groupId)} · {r.name}</span>
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

/* ---------- 집계 로직 (교사 + 학생 결과 공용) ---------- */
async function aggregateAll(config) {
  const { rubric, groups } = config;
  const subs = {};
  for (const g of groups) {
    const s = await store.get("pj_sub_" + g.id, true);
    if (s) subs[g.id] = s;
  }
  // peer evals
  const peerKeys = await store.list("pj_peer_", true);
  const peerByTarget = {}; // gid -> [score,...]
  for (const k of peerKeys) {
    const p = await store.get(k, true);
    if (!p) continue;
    for (const tgt in p.evals) {
      (peerByTarget[tgt] = peerByTarget[tgt] || []).push(p.evals[tgt].score);
    }
  }
  // collab evals (group level = avg of all member ratings within that group)
  const collabKeys = await store.list("pj_collab_", true);
  const collabByGroup = {}; // gid -> [score,...]
  for (const k of collabKeys) {
    const c = await store.get(k, true);
    if (!c) continue;
    const scores = Object.values(c.ratings).map((r) => r.score);
    (collabByGroup[c.group] = collabByGroup[c.group] || []).push(...scores);
  }
  // reflections
  const reflKeys = await store.list("pj_reflect_", true);
  const reflections = [];
  for (const k of reflKeys) {
    const r = await store.get(k, true);
    if (r) reflections.push(r);
  }

  const out = groups.map((g) => {
    const ai = subs[g.id] ? subs[g.id].aiScore : null;
    const pArr = peerByTarget[g.id] || [];
    const cArr = collabByGroup[g.id] || [];
    const peer = pArr.length ? avg(pArr) : null;
    const collab = cArr.length ? avg(cArr) : null;
    const total = (ai ?? 0) + (peer ?? 0) + (collab ?? 0);
    return {
      id: g.id, name: g.name, ai, peer, collab,
      peerN: pArr.length, collabN: cArr.length,
      submitted: !!subs[g.id],
      total: ai == null && peer == null && collab == null ? null : total,
    };
  });
  return { groups: out, reflections, subs };
}

/* =================================================================== */
/* ============================  STUDENT  =========================== */
/* =================================================================== */
const STEPS = [
  { key: "result", label: "결과물 평가", sub: "PDF 업로드 · AI 채점", color: "var(--teal)", icon: FileText },
  { key: "peer", label: "동료평가", sub: "다른 모둠 안내서", color: "var(--accent)", icon: Users },
  { key: "collab", label: "협업평가", sub: "우리 모둠끼리", color: "var(--violet)", icon: Handshake },
  { key: "report", label: "평가결과 확인", sub: "통합 보고서", color: "var(--green)", icon: BarChart3 },
  { key: "reflect", label: "프로젝트 성찰하기", sub: "스스로 돌아보기", color: "var(--rose)", icon: Lightbulb },
];

function StudentApp({ config, me }) {
  const [progress, setProgress] = useState({ resultsSeen: false });
  const [sub, setSub] = useState(null);       // our group's submission
  const [peer, setPeer] = useState(null);     // my peer evals
  const [collab, setCollab] = useState(null); // my collab ratings
  const [reflect, setReflect] = useState(null);
  const [active, setActive] = useState("result");
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const [pg, s, p, c, r] = await Promise.all([
      store.get("me_progress", false),
      store.get("pj_sub_" + me.groupId, true),
      store.get("pj_peer_" + me.key, true),
      store.get("pj_collab_" + me.key, true),
      store.get("pj_reflect_" + me.key, true),
    ]);
    if (pg) setProgress(pg);
    setSub(s); setPeer(p); setCollab(c); setReflect(r);
    setLoaded(true);
  }, [me]);
  useEffect(() => { refresh(); }, [refresh]);

  if (!config) return <Banner kind="warn">아직 선생님이 평가를 준비하지 않았어요.</Banner>;
  if (!loaded) return <div className="center muted" style={{ padding: 40 }}><Loader2 className="spin" size={18} /> 불러오는 중…</div>;

  const otherGroups = config.groups.filter((g) => g.id !== me.groupId);
  const myGroup = config.groups.find((g) => g.id === me.groupId);
  const collabTargets = (config.settings.selfInCollab ? myGroup.members : myGroup.members.filter((m) => m !== me.name))
    .map((m) => `${me.groupId}::${m}`);

  const done = {
    result: !!sub,
    peer: otherGroups.length === 0 || (peer && otherGroups.every((g) => peer.evals && peer.evals[g.id])),
    collab: collabTargets.length === 0 || (collab && collabTargets.every((t) => collab.ratings && collab.ratings[t])),
    report: progress.resultsSeen,
    reflect: !!reflect,
  };
  // 순차 잠금: 이전 단계가 끝나야 다음 단계 열림
  const unlocked = {};
  let prevOk = true;
  for (const s of STEPS) { unlocked[s.key] = prevOk; prevOk = prevOk && done[s.key]; }

  const markResultsSeen = async () => {
    const np = { ...progress, resultsSeen: true };
    setProgress(np);
    await store.set("me_progress", np, false);
  };

  const goNext = () => {
    const idx = STEPS.findIndex((s) => s.key === active);
    for (let i = idx + 1; i < STEPS.length; i++) {
      if (unlocked[STEPS[i].key] || done[STEPS[idx].key]) { setActive(STEPS[i].key); return; }
    }
  };

  const completedCount = STEPS.filter((s) => done[s.key]).length;

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
        {active === "result" && <StepResult config={config} me={me} sub={sub} onDone={refresh} goNext={goNext} />}
        {active === "peer" && <StepPeer config={config} me={me} peer={peer} otherGroups={otherGroups} onDone={refresh} goNext={goNext} />}
        {active === "collab" && <StepCollab config={config} me={me} collab={collab} targets={collabTargets} onDone={refresh} goNext={goNext} />}
        {active === "report" && <StepReport config={config} me={me} onSeen={markResultsSeen} goNext={goNext} done={done} />}
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

/* ---------- STEP 1: 결과물 평가 (AI) ---------- */
function StepResult({ config, me, sub, onDone, goNext }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [manual, setManual] = useState(false);
  const [picks, setPicks] = useState({});
  const inputRef = useRef(null);
  const items = config.rubric.ai.items;

  const onFile = (f) => { if (f && f.type === "application/pdf") { setFile(f); setErr(""); } else setErr("PDF 파일만 업로드할 수 있어요."); };

  const runAI = async () => {
    if (!file) return;
    setBusy(true); setErr("");
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(file);
      });
      const rubricText = items.map((it) =>
        `${it.no}. ${it.name} — 상(${it.high}점): ${it.hi} / 중(${it.mid}점): ${it.mi} / 하(${it.low}점): ${it.lo}`).join("\n");
      const prompt =
`당신은 초등학생 프로젝트(주제: "${config.project.subject}")의 결과물을 평가하는 공정한 채점자입니다.
첨부된 PDF 안내서를 읽고 아래 5개 항목을 각각 상/중/하로 평가하세요.

${rubricText}

규칙:
- 각 항목 rating은 "상","중","하" 중 하나, score는 해당 등급 점수.
- reason은 한국어 40자 이내의 근거.
- summary는 다른 모둠 친구들이 읽고 평가에 참고할 수 있도록 안내서 내용을 120자 이내로 요약.
- overall은 잘한 점과 개선점을 한 문장으로.
다른 말 없이 아래 JSON 형식으로만 응답:
{"summary":"...","items":[{"no":1,"rating":"상","score":10,"reason":"..."}],"overall":"..."}`;
      const text = await callClaude([{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
          { type: "text", text: prompt },
        ],
      }], 1000);
      const parsed = extractJSON(text);
      if (!parsed || !parsed.items) throw new Error("형식 오류");
      const norm = items.map((it) => {
        const f = (parsed.items || []).find((x) => Number(x.no) === it.no) || {};
        const rating = ["상", "중", "하"].includes(f.rating) ? f.rating : "중";
        return { no: it.no, rating, score: itemScore(it, rating), reason: String(f.reason || "").slice(0, 60) };
      });
      const dataUrl = "data:application/pdf;base64," + b64;
      const record = {
        groupId: me.groupId, fileName: file.name, summary: String(parsed.summary || "").slice(0, 240),
        items: norm, aiScore: norm.reduce((s, x) => s + x.score, 0), overall: String(parsed.overall || ""),
        pdfData: b64.length < 4500000 ? dataUrl : null, submittedBy: me.name, ts: Date.now(),
      };
      await store.set("pj_sub_" + me.groupId, record, true);
      await onDone();
    } catch (e) {
      setErr("AI 채점에 실패했어요. 잠시 후 다시 시도하거나, 아래에서 직접 채점할 수 있어요.");
      setManual(true);
    } finally { setBusy(false); }
  };

  const saveManual = async () => {
    const norm = items.map((it) => ({ no: it.no, rating: picks[it.no] || "중", score: itemScore(it, picks[it.no] || "중"), reason: "" }));
    const b64 = file ? await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.readAsDataURL(file); }) : null;
    const record = {
      groupId: me.groupId, fileName: file?.name || "직접 채점", summary: "", items: norm,
      aiScore: norm.reduce((s, x) => s + x.score, 0), overall: "직접 채점", submittedBy: me.name,
      pdfData: b64 && b64.length < 4500000 ? "data:application/pdf;base64," + b64 : null, ts: Date.now(),
    };
    await store.set("pj_sub_" + me.groupId, record, true);
    await onDone();
  };

  const resubmit = async () => { await store.set("pj_sub_" + me.groupId, null, true); setFile(null); setManual(false); setPicks({}); await onDone(); };

  // 이미 제출됨 → 결과 표시
  if (sub) {
    return (
      <div className="fade">
        <StepHeader idx={1} title="결과물 평가" color="var(--teal)" Icon={FileText}
          sub={`우리 모둠 안내서를 ${config.rubric.ai.evaluator}가 채점했어요. 사실·출처·맞춤법처럼 확인할 수 있는 항목입니다.`} />
        <div className="card pad-lg" style={{ marginBottom: 16 }}>
          <div className="between" style={{ marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <div className="center"><FileText size={18} className="muted" /><span className="h3">{sub.fileName}</span>
              <span className="pill gray" style={{ fontSize: 11 }}>제출: {sub.submittedBy}</span></div>
            <div className="center">
              <span className="big-score" style={{ fontSize: 30, color: "var(--teal)" }}>{sub.aiScore}<span className="faint" style={{ fontSize: 16 }}> / {config.rubric.ai.max}</span></span>
            </div>
          </div>
          {sub.overall && <Banner kind="info" icon={Sparkles}>{sub.overall}</Banner>}
          <div className="divider" />
          <div className="list-rest">
            {sub.items.map((r) => {
              const it = items.find((x) => x.no === r.no);
              return (
                <div key={r.no} className="checkrow done" style={{ alignItems: "flex-start", flexDirection: "column", gap: 8 }}>
                  <div className="between" style={{ width: "100%" }}>
                    <span className="center"><span className="chip" style={{ width: 28, height: 28, background: "#fff", border: "1px solid var(--line-2)", fontSize: 12, fontWeight: 800 }}>{r.no}</span> {it.name}</span>
                    <span className="center"><span className="pill" style={{ background: r.rating === "상" ? "var(--green-soft)" : r.rating === "중" ? "#faf3df" : "var(--rose-soft)", border: "none", color: r.rating === "상" ? "var(--green-700)" : r.rating === "중" ? "#8a6a14" : "#a23f2c" }}>{r.rating}</span> <b className="mono">{r.score}점</b></span>
                  </div>
                  {r.reason && <div className="muted" style={{ fontSize: 13, paddingLeft: 38 }}>{r.reason}</div>}
                </div>
              );
            })}
          </div>
        </div>
        <div className="between">
          <button className="btn ghost" onClick={resubmit}><RefreshCw size={15} /> 다시 제출하기</button>
          <button className="btn primary lg" onClick={goNext}>다음: 동료평가 <ChevronRight size={17} /></button>
        </div>
      </div>
    );
  }

  // 업로드 화면
  return (
    <div className="fade">
      <StepHeader idx={1} title="결과물 평가" color="var(--teal)" Icon={FileText}
        sub="우리 모둠이 만든 안내서를 PDF로 올리면 AI가 사실·출처·맞춤법 등을 채점해 줘요." />
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
              <div className="h3" style={{ marginTop: 8 }}>PDF 안내서를 여기에 올려주세요</div>
              <div className="hint" style={{ marginTop: 4 }}>클릭하거나 파일을 끌어다 놓으세요</div>
            </>
          )}
        </div>
        {err && <div style={{ marginTop: 12 }}><Banner kind="warn">{err}</Banner></div>}
        <div className="between" style={{ marginTop: 16 }}>
          <span className="hint">채점 항목: {items.map((i) => i.name).join(" · ")}</span>
          <button className="btn primary lg" disabled={!file || busy} onClick={runAI}>
            {busy ? <><Loader2 className="spin" size={17} /> AI가 채점하는 중…</> : <><Sparkles size={17} /> AI 채점 받기</>}
          </button>
        </div>
      </div>

      {manual && (
        <div className="card pad-lg fade">
          <div className="eyebrow"><PenLine size={14} /> 직접 채점</div>
          <p className="muted" style={{ fontSize: 13.5, margin: "8px 0 14px" }}>AI 채점이 어려울 때 각 항목을 직접 선택해 제출할 수 있어요.</p>
          {items.map((it) => (
            <ItemCard key={it.no} item={it} value={picks[it.no]} accent="var(--teal)" onChange={(g) => setPicks((p) => ({ ...p, [it.no]: g }))} />
          ))}
          <button className="btn primary lg" style={{ width: "100%" }} disabled={items.some((it) => !picks[it.no])} onClick={saveManual}>
            <Save size={16} /> 직접 채점 결과 제출
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- STEP 2: 동료평가 ---------- */
function StepPeer({ config, me, peer, otherGroups, onDone, goNext }) {
  const [target, setTarget] = useState(null);
  const items = config.rubric.peer.items;
  const evals = peer?.evals || {};

  if (otherGroups.length === 0) {
    return (
      <div className="fade">
        <StepHeader idx={2} title="동료평가" color="var(--accent)" Icon={Users} sub="다른 모둠 친구들의 안내서를 읽고 평가합니다." />
        <Banner kind="info">다른 모둠이 없어 이 단계는 건너뜁니다.</Banner>
        <div style={{ height: 14 }} /><button className="btn primary lg" onClick={goNext}>다음 단계로 <ChevronRight size={17} /></button>
      </div>
    );
  }

  if (target) {
    const g = otherGroups.find((x) => x.id === target);
    return <PeerEvalForm config={config} me={me} group={g} items={items}
      onBack={() => setTarget(null)} onSaved={async () => { await onDone(); setTarget(null); }} />;
  }

  const allDone = otherGroups.every((g) => evals[g.id]);
  return (
    <div className="fade">
      <StepHeader idx={2} title="동료평가" color="var(--accent)" Icon={Users}
        sub="다른 모둠 친구들의 안내서를 읽고, 쉬운 설명과 창의성을 평가해 주세요. 모든 모둠을 평가하면 다음 단계가 열려요." />
      <div className="list-rest" style={{ marginBottom: 16 }}>
        {otherGroups.map((g) => {
          const ev = evals[g.id];
          return (
            <div key={g.id} className={`checkrow ${ev ? "done" : ""}`}>
              <div className="center">
                <span className="chip" style={{ background: ev ? "var(--green-soft)" : "var(--accent-soft)", color: ev ? "var(--green-700)" : "var(--accent-700)" }}>
                  {ev ? <CheckCircle2 size={18} /> : <BookOpen size={18} />}
                </span>
                <div>
                  <div className="h3">{g.name}</div>
                  <div className="hint">{ev ? `평가 완료 · ${ev.score}점` : "안내서 읽고 평가하기"}</div>
                </div>
              </div>
              <button className={`btn sm ${ev ? "" : "accent"}`} onClick={() => setTarget(g.id)}>
                {ev ? <>다시 평가 <ChevronRight size={14} /></> : <>평가하기 <ChevronRight size={14} /></>}
              </button>
            </div>
          );
        })}
      </div>
      <div className="between">
        <span className="pill">{Object.keys(evals).length} / {otherGroups.length} 모둠 평가함</span>
        <button className="btn primary lg" disabled={!allDone} onClick={goNext}>다음: 협업평가 <ChevronRight size={17} /></button>
      </div>
      {!allDone && <p className="hint" style={{ marginTop: 10 }}>모든 모둠을 평가하면 다음 단계로 넘어갈 수 있어요.</p>}
    </div>
  );
}

function PeerEvalForm({ config, me, group, items, onBack, onSaved }) {
  const [picks, setPicks] = useState({});
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { setSub(await store.get("pj_sub_" + group.id, true)); setLoading(false); })(); }, [group.id]);

  const save = async () => {
    const score = sumItems(items, picks);
    const existing = (await store.get("pj_peer_" + me.key, true)) || { by: me.key, byGroup: me.groupId, evals: {} };
    existing.evals[group.id] = {
      items: items.map((it) => ({ no: it.no, rating: picks[it.no], score: itemScore(it, picks[it.no]) })),
      score, ts: Date.now(),
    };
    await store.set("pj_peer_" + me.key, existing, true);
    await onSaved();
  };

  return (
    <div className="fade">
      <button className="btn ghost" onClick={onBack} style={{ marginBottom: 8 }}><ArrowLeft size={16} /> 모둠 목록</button>
      <StepHeader idx={2} title={`${group.name} 평가`} color="var(--accent)" Icon={Users} sub="안내서를 읽고 두 항목을 평가해 주세요." />

      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 10 }}><BookOpen size={16} style={{ verticalAlign: -3 }} /> {group.name}의 안내서</div>
        {loading ? <div className="center muted"><Loader2 className="spin" size={16} /> 불러오는 중…</div> :
          !sub ? <Banner kind="warn">이 모둠은 아직 안내서를 제출하지 않았어요. 제출 후 다시 평가해 주세요.</Banner> :
            <>
              {sub.summary && <Banner kind="info" icon={Sparkles}><b>요약</b> · {sub.summary}</Banner>}
              {sub.pdfData ? (
                <iframe title="guide" src={sub.pdfData} className="guide-frame" style={{ marginTop: 12 }} />
              ) : (
                <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>원문 미리보기가 제공되지 않습니다. 위 요약을 참고해 평가해 주세요.</p>
              )}
            </>}
      </div>

      {sub && (
        <div className="card pad-lg">
          {items.map((it) => (
            <ItemCard key={it.no} item={it} value={picks[it.no]} accent="var(--accent)" onChange={(g) => setPicks((p) => ({ ...p, [it.no]: g }))} />
          ))}
          <button className="btn accent lg" style={{ width: "100%", marginTop: 4 }} disabled={items.some((it) => !picks[it.no])} onClick={save}>
            <Save size={16} /> {group.name} 평가 제출
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- STEP 3: 협업평가 ---------- */
function StepCollab({ config, me, collab, targets, onDone, goNext }) {
  const items = config.rubric.collab.items;
  const ratings = collab?.ratings || {};
  const nameOf = (key) => key.split("::")[1];

  const setPick = async (targetKey, no, g) => {
    const cur = (await store.get("pj_collab_" + me.key, true)) || { by: me.key, group: me.groupId, ratings: {} };
    const existing = cur.ratings[targetKey] || { picks: {} };
    existing.picks = { ...(existing.picks || {}), [no]: g };
    // recompute score if all picked
    const all = items.every((it) => existing.picks[it.no]);
    existing.items = items.map((it) => ({ no: it.no, rating: existing.picks[it.no], score: existing.picks[it.no] ? itemScore(it, existing.picks[it.no]) : 0 }));
    existing.score = all ? sumItems(items, existing.picks) : existing.score;
    existing.complete = all;
    cur.ratings[targetKey] = existing;
    await store.set("pj_collab_" + me.key, cur, true);
    await onDone();
  };

  const allDone = targets.length === 0 || targets.every((t) => ratings[t]?.complete);

  if (targets.length === 0) {
    return (
      <div className="fade">
        <StepHeader idx={3} title="협업평가" color="var(--violet)" Icon={Handshake} sub="같은 모둠끼리 서로 평가합니다." />
        <Banner kind="info">평가할 모둠원이 없어 이 단계를 건너뜁니다.</Banner>
        <div style={{ height: 14 }} /><button className="btn primary lg" onClick={goNext}>다음 단계로 <ChevronRight size={17} /></button>
      </div>
    );
  }

  return (
    <div className="fade">
      <StepHeader idx={3} title="협업평가" color="var(--violet)" Icon={Handshake}
        sub={`우리 모둠 친구들${config.settings.selfInCollab ? "(나 포함)" : ""}이 역할 분담과 참여를 얼마나 잘했는지 솔직하게 평가해요. 다른 모둠은 볼 수 없어요.`} />
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
            </div>
          );
        })}
      </div>
      <div className="between" style={{ marginTop: 16 }}>
        <span className="pill">{targets.filter((t) => ratings[t]?.complete).length} / {targets.length} 명 평가함</span>
        <button className="btn primary lg" disabled={!allDone} onClick={goNext}>다음: 결과 확인 <ChevronRight size={17} /></button>
      </div>
    </div>
  );
}

/* ---------- STEP 4: 평가결과 확인 ---------- */
function StepReport({ config, me, onSeen, goNext, done }) {
  const [agg, setAgg] = useState(null);
  useEffect(() => { (async () => { const a = await aggregateAll(config); setAgg(a); onSeen(); })(); /* eslint-disable-next-line */ }, []);

  if (!agg) return <div className="center muted" style={{ padding: 40 }}><Loader2 className="spin" size={18} /> 결과 보고서를 만드는 중…</div>;
  const mine = agg.groups.find((g) => g.id === me.groupId);
  const sub = agg.subs[me.groupId];
  const total = mine.total != null ? round1(mine.total) : 0;
  const partial = mine.peer == null || mine.collab == null;

  const kpis = [
    ["AI 평가", mine.ai, config.rubric.ai.max, "var(--teal)", FileText],
    ["동료평가", mine.peer, config.rubric.peer.max, "var(--accent)", Users],
    ["협업평가", mine.collab, config.rubric.collab.max, "var(--violet)", Handshake],
  ];

  return (
    <div className="fade">
      <StepHeader idx={4} title="평가결과 확인" color="var(--green)" Icon={BarChart3}
        sub="세 가지 평가를 모두 합친 우리 모둠의 통합 보고서예요. 이 결과를 보고 다음 단계에서 프로젝트를 돌아봐요." />

      <div className="card pad-lg" style={{ marginBottom: 18, background: "linear-gradient(160deg,#ffffff, #f3f9f5)" }}>
        <div className="row" style={{ alignItems: "center", gap: 22, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center", minWidth: 150 }}>
            <div className="eyebrow" style={{ justifyContent: "center" }}>우리 모둠 총점</div>
            <div className="big-score" style={{ color: "var(--green-700)", marginTop: 6 }}>{total}<span className="faint" style={{ fontSize: 18 }}> /100</span></div>
            <div style={{ marginTop: 10, width: 180, marginLeft: "auto", marginRight: "auto" }}><ScoreBar value={total} max={100} /></div>
          </div>
          <div className="col" style={{ gap: 10, flex: 1, minWidth: 240 }}>
            {kpis.map(([label, v, mx, c, Ic]) => (
              <div key={label} className="row" style={{ alignItems: "center", gap: 12 }}>
                <span className="center" style={{ minWidth: 96, fontWeight: 700, fontSize: 13.5 }}><Ic size={15} style={{ color: c }} /> {label}</span>
                <div style={{ flex: 1 }}><ScoreBar value={v ?? 0} max={mx} /></div>
                <span className="mono" style={{ fontWeight: 800, minWidth: 56, textAlign: "right" }}>{v != null ? round1(v) : "—"}<span className="faint">/{mx}</span></span>
              </div>
            ))}
          </div>
        </div>
        {partial && <div style={{ marginTop: 16 }}><Banner kind="warn">친구들의 동료·협업 평가가 아직 진행 중일 수 있어요. 모두 끝나면 점수가 채워집니다.</Banner></div>}
      </div>

      {sub && (
        <div className="card pad-lg" style={{ marginBottom: 18 }}>
          <h2 className="h2" style={{ marginBottom: 12 }}><FileText size={18} style={{ verticalAlign: -3, color: "var(--teal)" }} /> AI 평가 항목별 결과</h2>
          {sub.overall && <Banner kind="info" icon={Sparkles}>{sub.overall}</Banner>}
          <div className="list-rest" style={{ marginTop: 12 }}>
            {sub.items.map((r) => {
              const it = config.rubric.ai.items.find((x) => x.no === r.no);
              return (
                <div key={r.no} className="between" style={{ padding: "8px 2px", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{r.no}. {it?.name}</span>
                  <span className="center"><span className="pill" style={{ fontSize: 11, background: r.rating === "상" ? "var(--green-soft)" : r.rating === "중" ? "#faf3df" : "var(--rose-soft)", border: "none", color: r.rating === "상" ? "var(--green-700)" : r.rating === "중" ? "#8a6a14" : "#a23f2c" }}>{r.rating}</span><b className="mono">{r.score}점</b></span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="between">
        <span className="pill green"><CheckCircle2 size={14} /> 결과를 확인했어요</span>
        <button className="btn primary lg" onClick={goNext}>마지막: 프로젝트 성찰하기 <Lightbulb size={16} /></button>
      </div>
    </div>
  );
}

/* ---------- STEP 5: 프로젝트 성찰 ---------- */
function StepReflect({ config, me, reflect, onDone }) {
  const [questions, setQuestions] = useState(reflect?.answers?.map((a) => a.q) || null);
  const [intro, setIntro] = useState(reflect?.intro || "");
  const [answers, setAnswers] = useState(() => {
    const o = {}; (reflect?.answers || []).forEach((a, i) => (o[i] = a.a)); return o;
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(!!reflect);

  const FALLBACK = [
    "이 프로젝트에서 우리 모둠이 가장 잘했다고 생각하는 점은 무엇인가요?",
    "결과를 보고 가장 아쉬웠던 항목은 무엇이고, 왜 그렇게 되었을까요?",
    "다시 한다면 어떤 점을 다르게 해 보고 싶나요?",
    "이번 프로젝트로 새롭게 배운 것이나 느낀 점을 적어 보세요.",
  ];

  const genQuestions = async () => {
    setBusy(true);
    try {
      const agg = await aggregateAll(config);
      const mine = agg.groups.find((g) => g.id === me.groupId);
      const scoreText = `AI ${mine.ai ?? "?"}/${config.rubric.ai.max}, 동료 ${mine.peer != null ? round1(mine.peer) : "?"}/${config.rubric.peer.max}, 협업 ${mine.collab != null ? round1(mine.collab) : "?"}/${config.rubric.collab.max}, 총점 ${mine.total != null ? round1(mine.total) : "?"}/100`;
      const text = await callClaude([{
        role: "user",
        content: `초등학생이 프로젝트(주제: ${config.project.subject}) 평가 결과를 보고 스스로 성찰하도록 돕는 따뜻한 선생님입니다.
이 학생 모둠의 결과: ${scoreText}.
이 결과를 바탕으로 학생이 프로젝트 전체 과정을 돌아보게 하는 성찰 질문 4개를 만들어 주세요.
잘한 점은 인정하고, 부족했던 부분은 스스로 발견하도록 격려하는 따뜻한 말투. 각 질문은 한 문장.
다른 말 없이 JSON으로만: {"intro":"한두 문장 격려","questions":["...","...","...","..."]}`,
      }], 1000);
      const p = extractJSON(text);
      if (p?.questions?.length) { setQuestions(p.questions.slice(0, 5)); setIntro(p.intro || ""); }
      else { setQuestions(FALLBACK); setIntro("결과를 차분히 돌아보며 솔직하게 적어 보세요."); }
    } catch (e) {
      setQuestions(FALLBACK); setIntro("결과를 차분히 돌아보며 솔직하게 적어 보세요.");
    } finally { setBusy(false); }
  };

  const save = async () => {
    const payload = {
      by: me.key, groupId: me.groupId, name: me.name, intro,
      answers: questions.map((q, i) => ({ q, a: answers[i] || "" })), ts: Date.now(),
    };
    await store.set("pj_reflect_" + me.key, payload, true);
    setSaved(true);
    await onDone();
  };

  return (
    <div className="fade">
      <StepHeader idx={5} title="프로젝트 성찰하기" color="var(--rose)" Icon={Lightbulb}
        sub="평가 결과를 바탕으로 프로젝트 전체를 돌아봐요. 정답은 없어요. 솔직하게 적을수록 다음 프로젝트가 더 좋아져요." />

      {!questions ? (
        <div className="card pad-lg" style={{ textAlign: "center" }}>
          <span className="chip" style={{ width: 56, height: 56, borderRadius: 16, background: "var(--rose-soft)", color: "var(--rose)", margin: "0 auto 14px" }}><Lightbulb size={26} /></span>
          <h3 className="h2">나만의 성찰 질문 받기</h3>
          <p className="muted" style={{ fontSize: 14, maxWidth: 420, margin: "8px auto 18px" }}>
            우리 모둠의 평가 결과에 맞춰 AI가 성찰 질문을 만들어 줘요.
          </p>
          <button className="btn lg" style={{ background: "var(--rose)", color: "#fff", border: "none" }} onClick={genQuestions} disabled={busy}>
            {busy ? <><Loader2 className="spin" size={17} /> 질문을 만드는 중…</> : <><Sparkles size={17} /> 성찰 질문 받기</>}
          </button>
        </div>
      ) : (
        <>
          {intro && <div style={{ marginBottom: 16 }}><Banner kind="info" icon={Sparkles}>{intro}</Banner></div>}
          <div className="list-rest" style={{ marginBottom: 16 }}>
            {questions.map((q, i) => (
              <div key={i} className="card pad">
                <div className="center" style={{ marginBottom: 10, alignItems: "flex-start" }}>
                  <span className="chip" style={{ background: "var(--rose-soft)", color: "var(--rose)", flex: "none" }}>{i + 1}</span>
                  <div className="h3" style={{ paddingTop: 6 }}>{q}</div>
                </div>
                <textarea className="textarea" placeholder="여기에 생각을 적어 보세요…" value={answers[i] || ""}
                  onChange={(e) => { setAnswers((a) => ({ ...a, [i]: e.target.value })); setSaved(false); }} />
              </div>
            ))}
          </div>
          <div className="between">
            <button className="btn ghost" onClick={genQuestions} disabled={busy}><RefreshCw size={15} /> 질문 다시 받기</button>
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
        </>
      )}
    </div>
  );
}
