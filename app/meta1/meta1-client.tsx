"use client";

import ProjectEvaluationApp, { configureProjectEvaluationRuntime } from "@/project-evaluation-platform";

type StorageResult = { value?: string } | null;

declare global {
  interface Window {
    storage?: {
      get: (key: string, shared?: boolean) => Promise<StorageResult>;
      set: (key: string, value: string, shared?: boolean) => Promise<StorageResult>;
      list: (prefix: string, shared?: boolean) => Promise<{ keys: string[] }>;
    };
    __projectStorageScope?: string;
  }
}

const appScope = "meta1";
const localPrefix = "meta1:";
const earthMotionThemeCss = `
.pj-root{
  --ink:#172033;
  --ink-soft:#566276;
  --ink-faint:#8b97aa;
  --paper:#eef4fb;
  --surface:#ffffff;
  --surface-2:#f5f8fc;
  --line:#dce6f1;
  --line-2:#cad8e8;
  --green:#197b72;
  --green-700:#0f5f58;
  --green-soft:#e1f2ef;
  --green-100:#c6e4df;
  --accent:#d68a16;
  --accent-soft:#fff0d5;
  --accent-700:#975f09;
  --teal:#1b74b7;
  --teal-soft:#e1effb;
  --violet:#4f5aa8;
  --violet-soft:#e8ebfa;
  --rose:#b85f58;
  --rose-soft:#f8e7e5;
  --gold:#d7a625;
  background:linear-gradient(180deg,#edf4fb 0%,#f8fbff 48%,#eef7f1 100%);
}
.pj-root .logo,
.pj-root .btn.primary{
  background:linear-gradient(150deg,#197b72,#1b74b7);
}
.pj-root .btn.accent{
  background:linear-gradient(150deg,#d68a16,#f0b04a);
}
.pj-root .connector .fill,
.pj-root .scorebar > i{
  background:linear-gradient(180deg,#197b72,#1b74b7);
}
.pj-root .scorebar > i{
  background:linear-gradient(90deg,#197b72,#1b74b7);
}
.pj-root .card{
  box-shadow:0 18px 50px -36px rgba(23,32,51,.32);
}
`;
const earthAndSpaceConfigPatch = {
  project: {
    title: "지구와 우주",
    subject: "지구와 우주",
    desc: "지구의 운동, 달과 태양, 계절과 낮밤, 우주 탐구 내용을 바탕으로 모둠 결과물을 만듭니다.",
  },
  rubric: {
    aiFeedback: {
      title: "결과물 평가 · AI 피드백용",
      desc: "결과물을 더 좋게 다듬도록 AI가 피드백을 주는 기준입니다. (100점 만점 · 최종 점수에는 반영되지 않음)",
      items: [
        { no: 1, name: "과학적 사실 정확성", high: 20, mid: 16, low: 12,
          hi: "지구의 자전·공전, 달과 태양, 계절과 낮밤 등 지구와 우주 개념을 과학적 사실에 맞게 정확히 설명했다",
          mi: "지구와 우주에 대한 주요 개념을 설명했으나, 일부 내용은 더 확인하거나 보완할 필요가 있다",
          lo: "지구의 운동이나 우주 현상에 대한 중요한 사실 오류나 헷갈리게 하는 설명이 있다" },
        { no: 2, name: "원인과 관계 설명", high: 20, mid: 16, low: 12,
          hi: "낮과 밤, 계절 변화, 달의 모양 변화처럼 현상이 일어나는 까닭과 관계를 잘 연결해 설명했다",
          mi: "현상과 원인을 대체로 연결해 설명했지만, 더 분명하게 다듬을 부분이 있다",
          lo: "현상은 소개했지만 왜 그렇게 되는지 설명이 부족하거나 관계가 분명하지 않다" },
        { no: 3, name: "쉬운 설명", high: 15, mid: 12, low: 9,
          hi: "초등학생이 이해하도록 쉬운 단어와 짧은 문장으로 설명했다",
          mi: "대체로 쉬운 단어와 문장으로 설명했다",
          lo: "어려운 단어나 긴 문장이 있어 이해하는 데 시간이 걸린다" },
        { no: 4, name: "구성·편집", high: 15, mid: 12, low: 9,
          hi: "내용이 주제에 따라 체계적으로 구성되어 있고, 읽는 순서가 자연스럽게 이어진다",
          mi: "내용이 구성되어 있고, 대체로 읽는 흐름이 이어진다",
          lo: "내용이 담겨 있으나 구성이 단순해 읽는 흐름을 따라가기 어려운 부분이 있다" },
        { no: 5, name: "그림·자료 활용", high: 15, mid: 12, low: 9,
          hi: "그림, 사진, 도표, 모형 등이 설명과 잘 연결되어 지구와 우주 내용을 이해하는 데 도움을 준다",
          mi: "그림, 사진, 도표, 모형 등이 여러 개 들어가 있고 대체로 설명에 도움이 된다",
          lo: "그림이나 자료가 들어가 있지만 설명과의 연결이 부족하다" },
        { no: 6, name: "출처", high: 10, mid: 8, low: 6,
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
          hi: "읽고 나니 지구와 우주에 대해 무엇을 알려 주려는지 분명하게 이해됐다",
          mi: "읽고 나니 중요한 내용이 대체로 잘 전해졌다",
          lo: "읽고 나니 지구와 우주에 대한 기본적인 내용을 알 수 있었다" },
        { no: 2, name: "쉽게 읽힘", high: 15, mid: 12, low: 9,
          hi: "쉬운 말과 짧은 문장으로 술술 읽혀 내용을 잘 이해할 수 있었다",
          mi: "대체로 쉽게 읽혔고, 몇몇 표현은 천천히 읽으면 이해됐다",
          lo: "어려운 표현이 있어 내용을 이해하려면 여러 번 읽어야 했다" },
        { no: 3, name: "그림·자료", high: 15, mid: 12, low: 9,
          hi: "그림, 사진, 도표, 모형 등이 설명과 잘 연결되어 이해에 도움이 되었다",
          mi: "그림, 사진, 도표, 모형 등이 여러 개 들어가 있어 대체로 도움이 되었다",
          lo: "그림이나 자료가 들어가 있지만 설명을 이해하는 데 도움은 적었다" },
        { no: 4, name: "재미·새로움", high: 10, mid: 8, low: 6,
          hi: "새롭게 알게 된 점과 창의적 표현이 있어 읽는 재미가 있었다",
          mi: "흥미로운 부분이 있어 읽는 재미가 어느 정도 있었다",
          lo: "기본적인 정보 위주로 구성되어 새롭거나 흥미로운 내용이 적었다" },
      ],
    },
  },
  classes: [],
  groups: [],
};
const earthAndSpaceFactCheckRules = [
  "사실 확인을 꼭 하세요. 쉬운 표현이나 다른 말로 설명한 것은 허용하되, 지구의 자전·공전, 달의 운동, 낮과 밤, 계절 변화, 태양계와 우주에 대한 과학적 사실 오류는 그냥 넘기지 말고 해당 항목 rating을 낮추며 improve에 바로잡을 내용을 포함하세요.",
  "PDF에 지구와 우주 관련 구체적인 천체, 현상, 수치, 개념이 나오면 웹 검색으로 신뢰할 수 있는 자료를 찾아 대조한 뒤 평가하세요.",
  "사실 오류를 발견하면 improve의 첫머리를 \"사실 확인:\"으로 시작하고, 잘못된 내용과 바르게 고칠 내용을 초등학생이 이해할 수 있게 구체적으로 적으세요.",
  "확실하지 않은 내용은 단정하지 말고 \"자료로 다시 확인해 보면 좋겠어요\"처럼 확인이 필요하다고 안내하세요.",
];

function migrateMeta1ConfigCopy(result: StorageResult) {
  if (!result?.value) return result;
  try {
    const config = JSON.parse(result.value);
    const text = JSON.stringify({
      project: config?.project,
      aiFeedback: config?.rubric?.aiFeedback?.items,
      peer: config?.rubric?.peer?.items,
    });
    if (!/(식물|안내서|뿌리|줄기|잎|꽃|열매)/.test(text)) return result;

    return {
      value: JSON.stringify({
        ...config,
        project: earthAndSpaceConfigPatch.project,
        rubric: {
          ...(config.rubric || {}),
          ...earthAndSpaceConfigPatch.rubric,
        },
      }),
    };
  } catch {
    return result;
  }
}

async function meta1Storage(action: "get" | "set" | "list", payload: Record<string, unknown>) {
  const response = await fetch("/api/meta1/storage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "프로젝트 저장소 요청에 실패했습니다.");
  return data;
}

function installStorageBridge() {
  if (typeof window === "undefined") return;
  if (window.storage && window.__projectStorageScope === appScope) return;

  window.__projectStorageScope = appScope;
  window.storage = {
    async get(key, shared = true) {
      if (!shared) {
        const value = window.localStorage.getItem(`${localPrefix}${key}`);
        return value === null ? null : { value };
      }
      const result = await meta1Storage("get", { key }) as StorageResult;
      return key === "pj_config" ? migrateMeta1ConfigCopy(result) : result;
    },
    async set(key, value, shared = true) {
      if (!shared) {
        if (value === "null") window.localStorage.removeItem(`${localPrefix}${key}`);
        else window.localStorage.setItem(`${localPrefix}${key}`, value);
        return { value };
      }
      return meta1Storage("set", { key, value }) as Promise<StorageResult>;
    },
    async list(prefix, shared = true) {
      if (!shared) {
        const keys = Object.keys(window.localStorage)
          .filter((key) => key.startsWith(`${localPrefix}${prefix}`))
          .map((key) => key.slice(localPrefix.length));
        return { keys };
      }
      return meta1Storage("list", { prefix }) as Promise<{ keys: string[] }>;
    },
  };
}

export default function Meta1Client() {
  configureProjectEvaluationRuntime({
    apiBasePath: "/api/meta1",
    footerUrl: "feedforward.kr/meta1",
    teacherAuth: { hash: "2c9iul12cuv" },
    aiFeedbackCacheSchema: "meta1-ai-feedback-content-v1-websearch",
    resultsCacheSchema: "meta1-results-v1-personal-collab",
    reflectionsCacheSchema: "meta1-reflections-v1",
    defaultConfigPatch: earthAndSpaceConfigPatch,
    allowEmptyClasses: true,
    themeCss: earthMotionThemeCss,
    projectTitlePlaceholder: "예: 지구와 우주",
    projectSubjectPlaceholder: "예: 지구와 우주",
    quickStartDescription: "지구와 우주 예시(세 평가 · 동료 55 + 협업 45)로 한 번에 채워볼 수 있어요. 필요한 부분은 위 ‘루브릭 편집’ 탭에서 바로 바꾸면 됩니다.",
    rubricImportHint: "아래에 평가 기준 텍스트를 붙여넣고 가져오면, 세 평가(AI 피드백 / 동료 양적 / 협업)와 주관식 문항이 한 번에 채워집니다. 지구와 우주 주제 기준도 같은 형식이면 동작해요.",
    rubricImportPlaceholder: "여기에 붙여넣으세요. 예)\n■ 평가 1 — 결과물 평가 · AI 피드백용 (100점)\n1. 과학적 사실 정확성 (20/16/12)\n   상: ...\n   중: ...\n   하: ...\n...",
    aiFactCheckRules: earthAndSpaceFactCheckRules,
  });
  installStorageBridge();
  return <ProjectEvaluationApp />;
}
