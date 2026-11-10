export type ProjectSlug =
  | "gas-life"
  | "climate-today"
  | "plant-world"
  | "season-secret"
  | "energy-keeper";

export type AgentStageId =
  | "a1"
  | "a2"
  | "a3"
  | "a4"
  | "a5"
  | "g"
  | "e"
  | "n"
  | "t";

export interface AgentStage {
  id: AgentStageId;
  code: string;
  letter: "A" | "G" | "E" | "N" | "T";
  label: string;
  description: string;
}

export interface ProjectEvidence {
  kind: "image" | "excerpt";
  label: string;
  title: string;
  caption: string;
  image?: string;
  alt?: string;
  quote?: string;
}

export interface Project {
  slug: ProjectSlug;
  order: number;
  title: string;
  shortTitle: string;
  output: string;
  image: string;
  reportPages: string;
  focusFactors: string[];
  inquiry: string;
  generalization: string;
  summary: string;
  accent: string;
  accentSoft: string;
  grasps: {
    goal: string;
    role: string;
    audience: string;
    situation: string;
    product: string;
    standards: string;
  };
  rubric: string[];
  moments: Record<AgentStageId, string>;
  beforeAfter: {
    before: string;
    after: string;
  };
  feedbackMatches: Array<{
    feedback: string;
    revision: string;
  }>;
  evidence: ProjectEvidence[];
  reflection: string;
  metrics: string[];
}

export const agentStages: AgentStage[] = [
  {
    id: "a1",
    code: "A①",
    letter: "A",
    label: "삶과 개념 연결",
    description: "일상의 낯익은 장면에서 과학적 ‘왜?’를 찾고 삶과 개념을 연결합니다.",
  },
  {
    id: "a2",
    code: "A②",
    letter: "A",
    label: "탐구 질문 만들기",
    description: "개인의 질문을 모아 모둠이 끝까지 답할 핵심 질문으로 다듬습니다.",
  },
  {
    id: "a3",
    code: "A③",
    letter: "A",
    label: "계획하기",
    description: "변인·자료·일정·역할을 학생이 정하고 탐구 로드맵을 만듭니다.",
  },
  {
    id: "a4",
    code: "A④",
    letter: "A",
    label: "탐구하기",
    description: "관찰·실험·조사로 공동의 증거를 수집하고 설명을 다듬습니다.",
  },
  {
    id: "a5",
    code: "A⑤",
    letter: "A",
    label: "발표하기",
    description: "실제 청중에게 첫 산출물을 공개하고 질문과 반응을 받습니다.",
  },
  {
    id: "g",
    code: "G",
    letter: "G",
    label: "GRASPS 무대 설계",
    description: "목표·역할·청중·상황·산출물·평가기준으로 실제적인 수행과제를 설계합니다.",
  },
  {
    id: "e",
    code: "E",
    letter: "E",
    label: "Evaluate",
    description: "AI가 평가 초안을 만들고 교사가 검토해 정확성과 교육적 맥락을 확보합니다.",
  },
  {
    id: "n",
    code: "N",
    letter: "N",
    label: "Navigate",
    description: "학생이 피드백의 타당성을 판단하고 근거를 대며 다음 수정 방향을 찾습니다.",
  },
  {
    id: "t",
    code: "T",
    letter: "T",
    label: "Transform",
    description: "처음 결과와 최종 결과를 비교해 성장 과정을 성찰하고 그 내용을 다음 프로젝트에서 행동으로 옮깁니다.",
  },
];

export const agentOverview = [
  {
    letter: "A" as const,
    word: "Activate",
    title: "질문으로 깨우기",
    description: "삶과 연결된 탐구 질문으로 10~12차시 프로젝트를 시작합니다.",
    scene: "gas-life" as ProjectSlug,
    stage: "a1" as AgentStageId,
  },
  {
    letter: "G" as const,
    word: "GRASPS",
    title: "진짜 과제 만들기",
    description: "역할과 청중을 정해 실제적 수행과제와 루브릭을 설계합니다.",
    scene: "climate-today" as ProjectSlug,
    stage: "g" as AgentStageId,
  },
  {
    letter: "E" as const,
    word: "Evaluate",
    title: "함께 평가하기",
    description: "AI의 속도와 교사의 전문성을 결합해 과정 자료를 읽습니다.",
    scene: "plant-world" as ProjectSlug,
    stage: "e" as AgentStageId,
  },
  {
    letter: "N" as const,
    word: "Navigate",
    title: "피드백을 가려 쓰기",
    description: "AI 피드백도 검토하고 선택하며 수정 방향을 스스로 찾습니다.",
    scene: "season-secret" as ProjectSlug,
    stage: "n" as AgentStageId,
  },
  {
    letter: "T" as const,
    word: "Transform",
    title: "성장을 다음 행동으로",
    description: "수정과 성찰의 경험을 다음 프로젝트와 실제 삶에 적용합니다.",
    scene: "energy-keeper" as ProjectSlug,
    stage: "t" as AgentStageId,
  },
];

export const agencyFactors = [
  { name: "목표설정", description: "무엇을 왜 배울지 함께 정하기", pre: 3.88, post: 4.2 },
  { name: "실행조절", description: "계획을 살피며 전략을 바꾸기", pre: 3.69, post: 4.2 },
  { name: "성찰", description: "증거로 자신의 배움을 되돌아보기", pre: 3.62, post: 4.17 },
  { name: "협력지향", description: "동료·교사·AI와 지식을 함께 만들기", pre: 3.98, post: 4.25 },
  { name: "역할조정", description: "공동 목표에 맞게 역할을 조율하기", pre: 3.97, post: 4.24 },
];

export const developmentTimeline = [
  {
    phase: "01",
    title: "수동 프롬프트",
    period: "1차 프로젝트",
    description: "교사가 산출물을 모아 직접 프롬프트를 입력하고 피드백을 전달했습니다.",
  },
  {
    phase: "02",
    title: "정교화·집계",
    period: "2차 프로젝트",
    description: "루브릭과 피드백 문장을 다듬고 결과를 한눈에 모을 필요가 있음을 확인했습니다.",
  },
  {
    phase: "03",
    title: "feedforward.kr",
    period: "3차 프로젝트부터",
    description: "AI·동료·협력 평가와 수정 기록을 한 흐름으로 연결하는 플랫폼으로 발전했습니다.",
  },
];

export const projects: Project[] = [
  {
    slug: "gas-life",
    order: 1,
    title: "슬기로운 기체생활",
    shortTitle: "기체생활",
    output: "기체생활 가이드",
    image: "/showcase/projects/01-wise-gas-life.png",
    reportPages: "보고서 14–16쪽",
    focusFactors: ["실행조절", "성찰"],
    inquiry: "우리 주변의 기체는 어떤 성질을 가지며, 그 성질을 알면 우리 생활이 어떻게 슬기로워질까?",
    generalization: "기체의 온도·압력·부피 관계를 알면 생활 속 문제를 과학적으로 설명하고 해결할 수 있다.",
    summary: "주사기와 탁구공 실험의 증거를 생활 속 안전·활용 팁으로 바꾼 첫 프로젝트입니다.",
    accent: "#d97745",
    accentSoft: "#f8dfcf",
    grasps: {
      goal: "기체의 온도·압력·부피 관계를 설명하고 다른 사람의 생활을 돕는다.",
      role: "생활과학 전문가",
      audience: "기체 때문에 불편하거나 위험을 겪는 학교 구성원과 가족",
      situation: "생활 속 기체 현상 하나를 골라 원리를 밝히고 활용·대처법을 안내한다.",
      product: "현상, 실험 원리, 실천 팁을 담은 ‘슬기로운 기체생활 가이드’",
      standards: "과학적 정확성, 원인 설명, 원리–팁 연결, 쉬운 표현, 구성·출처",
    },
    rubric: ["과학적 정확성", "부피 변화의 원인", "원리와 생활 팁의 연결", "독자를 위한 쉬운 설명", "구성·편집·출처"],
    moments: {
      a1: "찌그러진 탁구공, 페트병, 주사기처럼 생활 속 기체 장면에서 궁금증을 찾았습니다.",
      a2: "기체의 성질을 알면 생활이 어떻게 더 안전하고 편리해지는지 모둠 질문으로 모았습니다.",
      a3: "온도와 압력을 바꾸어 볼 실험, 기록 방법, 모둠 역할을 직접 정했습니다.",
      a4: "주사기 피스톤과 뜨거운 물 속 탁구공을 관찰하며 부피 변화의 증거를 남겼습니다.",
      a5: "첫 가이드에서 현상과 팁을 설명하고 다른 모둠의 질문을 받았습니다.",
      g: "‘생활과학 전문가’가 되어 가족과 학교 구성원을 위한 기체생활 가이드를 설계했습니다.",
      e: "AI 평가 초안을 교사가 확인하며 실험 근거, 원인 사슬, 표현의 난도를 살폈습니다.",
      n: "‘어떤 실험에서 확인했는가’라는 피드백을 골라 관찰 문장을 보강했습니다.",
      t: "결론만 있던 설명이 증거와 생활 팁을 갖춘 안내로 바뀌었고, 다음 프로젝트의 수정 기준이 되었습니다.",
    },
    beforeAfter: {
      before: "압력을 주면 부피가 작아진다.",
      after: "주사기 피스톤을 세게 누를수록 안의 공기 부피가 더 많이 줄었다. 압력이 커질수록 기체 부피가 작아진다는 것을 관찰로 확인했다.",
    },
    feedbackMatches: [
      { feedback: "어떤 실험에서 확인했는지 근거가 없어요.", revision: "주사기 피스톤 관찰 결과를 문장에 추가했어요." },
      { feedback: "현상과 생활 팁 사이의 과학 원리가 빠졌어요.", revision: "뜨거운 물 → 기체 온도 상승 → 부피 팽창의 사슬을 넣었어요." },
    ],
    evidence: [
      {
        kind: "excerpt",
        label: "첫 평가 답안 · 익명 발췌",
        title: "변화 방향을 거꾸로 설명한 첫 답",
        quote: "펌프로 공기를 빼냈을 때 고무풍선의 부피가 줄어든다.",
        caption: "실험 결과와 반대 방향으로 설명해 피드백의 출발점이 된 문장입니다.",
      },
      {
        kind: "excerpt",
        label: "재도전 답안 · 익명 발췌",
        title: "압력과 부피의 관계를 다시 연결한 답",
        quote: "펌프로 공기를 빼내면 압력이 낮아지면서 공기의 부피가 늘어난다.",
        caption: "같은 학생의 재도전 답안에서 원인과 결과의 방향이 바로잡혔습니다.",
      },
    ],
    reflection: "처음에는 답을 틀리면 끝이라고 생각했는데, AI 선생님이 알려준 대로 고쳐서 다시 쓰니까 내가 진짜 알게 된 것 같았다.",
    metrics: ["1차 프로젝트", "수동 프롬프트 운영", "실행조절·성찰 집중"],
  },
  {
    slug: "climate-today",
    order: 2,
    title: "내일을 지키는 오늘",
    shortTitle: "기후행동",
    output: "기후위기 대응 카드뉴스",
    image: "/showcase/projects/02-protect-tomorrow.png",
    reportPages: "보고서 17–19쪽",
    focusFactors: ["목표설정", "성찰"],
    inquiry: "기후변화를 막기 위해 오늘 우리가 할 수 있는 일을 어떻게 알리고 실천하게 할 수 있을까?",
    generalization: "과학적 원인과 영향을 이해할 때 기후행동을 구체적이고 설득력 있게 제안할 수 있다.",
    summary: "기후위기의 원인–영향–행동을 ‘한 장 한 메시지’ 카드뉴스로 번역했습니다.",
    accent: "#2f7d72",
    accentSoft: "#d8eee9",
    grasps: {
      goal: "기후변화의 영향을 이해하고 학교 구성원의 참여를 설득한다.",
      role: "우리 학교 기후위기 알림 기자",
      audience: "필요성은 알지만 행동을 미루는 학교 구성원과 가족",
      situation: "지구의 날·기후주간에 원인, 영향, 행동을 정확하고 쉽게 알린다.",
      product: "과학적 근거와 구체적 실천을 담은 기후위기 대응 카드뉴스",
      standards: "정확성, 원인–영향–대응 논리, 쉬운 표현, 시각 구성, 실천 가능성, 출처, 맞춤법",
    },
    rubric: ["과학 정보의 정확성", "원인–영향–대응 연결", "독자를 위한 쉬운 표현", "한 장 한 메시지", "실천의 구체성·가능성", "믿을 만한 출처", "맞춤법"],
    moments: {
      a1: "폭염, 빙하, 급식 잔반처럼 기후위기가 우리의 오늘과 만나는 장면을 모았습니다.",
      a2: "‘알기’에서 멈추지 않고 학교가 실제로 움직이게 할 질문을 만들었습니다.",
      a3: "독자, 카드 순서, 자료 출처와 모둠별 제작 역할을 계획했습니다.",
      a4: "온실가스 증가부터 해수면 상승까지 자료를 조사하고 인과관계를 확인했습니다.",
      a5: "첫 카드뉴스를 동생과 친구의 눈으로 읽어 보고 이해하기 어려운 지점을 찾았습니다.",
      g: "기후위기 알림 기자가 되어 지구의 날에 학교와 가족을 설득하는 과제를 설계했습니다.",
      e: "AI와 교사가 정보의 정확성, 인과 연결, 한 장의 정보량과 출처를 함께 점검했습니다.",
      n: "도움이 되는 피드백과 틀린 피드백을 가려 원인 카드와 행동 카드를 다시 구성했습니다.",
      t: "‘환경을 아껴요’가 급식 남기지 않기와 플러그 뽑기 같은 오늘의 행동으로 바뀌었습니다.",
    },
    beforeAfter: {
      before: "환경을 아껴요. 지구를 지켜요.",
      after: "오늘부터 급식을 먹을 만큼만 받고, 쓰지 않는 전자기기의 플러그를 뽑아요. 작은 행동도 온실가스 배출을 줄이는 데 보탬이 됩니다.",
    },
    feedbackMatches: [
      { feedback: "영향은 있지만 왜 일어나는지 설명이 빠졌어요.", revision: "온실가스 증가 → 기온 상승 → 빙하 융해 → 해수면 상승 카드를 앞에 넣었어요." },
      { feedback: "한 장에 문장이 너무 많아 핵심이 흐려져요.", revision: "한 장에 한 메시지만 남기고 시각 자료를 키웠어요." },
    ],
    evidence: [
      {
        kind: "image",
        label: "학생 카드뉴스 · 익명 캡처",
        title: "산불 사례로 읽는 기후변화",
        image: "/showcase/student-work/climate-cardnews-wildfire.png",
        alt: "학생 카드뉴스. 산림에서 발생한 산불의 뜻과 기후변화로 산불 발생·피해가 커진다는 설명, 산불 사진과 뉴스 출처가 담겨 있다.",
        caption: "작성자 표기가 없는 작품 페이지만 원본 화면 그대로 발췌했습니다.",
      },
      {
        kind: "image",
        label: "학생 카드뉴스 · 익명 캡처",
        title: "영구동토층과 탄소의 연결",
        image: "/showcase/student-work/climate-cardnews-permafrost.png",
        alt: "학생 카드뉴스. 영구동토층이 녹으며 이산화탄소가 배출되고 지구 평균기온 상승으로 이어진다는 설명과 동토층 사진이 담겨 있다.",
        caption: "원인과 영향을 시각 자료와 문장으로 연결한 모둠 산출물 일부입니다.",
      },
    ],
    reflection: "내가 만든 카드뉴스를 동생도 읽을 수 있게 고치는 게 제일 어려웠는데, 고치고 나니 훨씬 좋아졌다.",
    metrics: ["2차 프로젝트", "플랫폼 요구 발견", "목표설정·성찰 집중"],
  },
  {
    slug: "plant-world",
    order: 3,
    title: "그것이 알고싶다 아름다운 식물세상",
    shortTitle: "식물세상",
    output: "식물 설명서·QR 이름표",
    image: "/showcase/projects/03-beautiful-plant-world.png",
    reportPages: "보고서 20–22쪽",
    focusFactors: ["협력지향", "역할조정"],
    inquiry: "우리 학교 식물을 더 잘 이해하고 관심을 갖도록 안내판을 어떻게 만들 수 있을까?",
    generalization: "식물의 구조와 기능은 서식 환경과 연결되며, 과학적 설명은 실제 공간을 바꿀 수 있다.",
    summary: "학교 식물을 조사해 설명서를 만들고 29개의 QR 이름표를 실제 교정에 남겼습니다.",
    accent: "#54833f",
    accentSoft: "#e0edd7",
    grasps: {
      goal: "학교 식물의 구조와 기능을 탐구해 누구나 이용할 안내 공간을 만든다.",
      role: "학교 식물 탐구 공간 기획자",
      audience: "학교 구성원, 특히 어린 학년 학생",
      situation: "이름표가 없거나 정보가 부족한 식물을 정확하고 흥미롭게 안내한다.",
      product: "협력 초안을 고쳐 게시하는 식물 설명서와 QR 이름표",
      standards: "구조·기능 정확성, 쉬운 설명, 구성, 시각 자료, 흥미, 출처, 맞춤법",
    },
    rubric: ["구조·기능의 정확성", "쉬운 설명", "구성·편집", "사진·그림", "흥미와 새로운 정보", "믿을 만한 출처", "맞춤법"],
    moments: {
      a1: "매일 지나치던 교정의 나무에 이름표와 설명이 부족하다는 문제를 발견했습니다.",
      a2: "어린 동생도 식물의 특징을 이해하고 관심을 갖게 할 방법을 질문했습니다.",
      a3: "식물 선정, 촬영, 조사, 글쓰기, QR 제작 역할을 모둠 안에서 조정했습니다.",
      a4: "잎·줄기·뿌리의 구조와 기능, 서식 환경의 관계를 현장과 자료에서 확인했습니다.",
      a5: "초안 설명서를 서로 읽고 사진, 캡션, 어려운 낱말을 점검했습니다.",
      g: "학교 식물 탐구 공간 기획자가 되어 실제 교정에 남을 안내판을 설계했습니다.",
      e: "feedforward.kr에서 AI·동료·협력 평가를 모아 구조·기능과 출처를 살폈습니다.",
      n: "‘기능은 있지만 환경과의 연결이 없다’는 피드백을 골라 설명을 확장했습니다.",
      t: "최종 설명서와 QR 이름표 29개를 학교 식물에 직접 설치했습니다.",
    },
    beforeAfter: {
      before: "뿌리는 물을 흡수한다.",
      after: "이 식물은 뿌리가 깊이 뻗어 건조한 곳에서도 땅속의 물을 얻을 수 있다. 뿌리의 모양이 사는 환경과 연결되어 있다.",
    },
    feedbackMatches: [
      { feedback: "뿌리의 기능은 있지만 왜 이 환경에서 잘 자라는지 빠졌어요.", revision: "깊은 뿌리와 건조한 서식 환경의 관계를 추가했어요." },
      { feedback: "사진이 무엇을 보여 주는지 알기 어려워요.", revision: "‘물과 영양분을 흡수하는 뿌리’처럼 캡션을 달았어요." },
    ],
    evidence: [
      {
        kind: "image",
        label: "식물 안내서 · 익명 캡처",
        title: "생김새와 기능을 나란히 설명하기",
        image: "/showcase/student-work/plant-guide-structure.png",
        alt: "학생 식물 안내서. 장미의 뿌리·줄기·잎·꽃을 행으로 나누고 생김새와 하는 일을 사진과 문장으로 나란히 정리한 표이다.",
        caption: "식물의 각 부분을 ‘어떻게 생겼는가’와 ‘무슨 일을 하는가’로 짝지었습니다.",
      },
      {
        kind: "image",
        label: "식물 안내서 · 익명 캡처",
        title: "한눈에 보는 장미의 구조",
        image: "/showcase/student-work/plant-guide-diagram.png",
        alt: "학생 식물 안내서. 장미 그림에 꽃잎·꽃받침·잎·줄기·가시·뿌리 등 각 부분의 명칭을 선으로 표시한 구조도이다.",
        caption: "출처를 함께 적은 그림 자료로 글의 설명을 보완했습니다.",
      },
    ],
    reflection: "우리가 만든 이름표를 직접 학교 식물에 달 수 있다는 게 정말 뿌듯해요. 우리 반이 만든 안내판이 학교에 실제로 남는다니 신기해요.",
    metrics: ["3차 프로젝트", "QR 이름표 29개", "협력지향·역할조정 집중"],
  },
  {
    slug: "season-secret",
    order: 4,
    title: "서핑하는 산타: 계절의 비밀을 찾아서",
    shortTitle: "계절의 비밀",
    output: "계절 설명 영상",
    image: "/showcase/projects/04-surfing-santa-seasons.png",
    reportPages: "보고서 23–25쪽",
    focusFactors: ["성찰", "협력지향"],
    inquiry: "계절이 바뀌는 까닭을 어떻게 하면 더 정확하게 설명할 수 있을까?",
    generalization: "자전축 기울기와 태양의 남중 고도가 받는 에너지양을 바꾸어 계절이 생긴다.",
    summary: "일부러 섞은 오류 피드백을 실험 근거로 가려 내며 계절 오개념을 바로잡았습니다.",
    accent: "#3878a8",
    accentSoft: "#dcecf7",
    grasps: {
      goal: "측정과 지구본 실험으로 계절의 원인을 설명하고 거리 오개념을 바로잡는다.",
      role: "우리 학교 과학 채널 계절 과학 해설가",
      audience: "5학년 후배와 가족",
      situation: "한국과 호주의 12월이 다른 까닭을 모둠 대본과 개인 영상으로 설명한다.",
      product: "공동 대본, AI 피드백 검토지, 지구본 시연을 담은 3–5분 개인 영상",
      standards: "측정·실험 근거, 조작–설명 일치, 인과사슬, 남반구, 수직축 반례, 쉬운 설명, AI 판단 근거",
    },
    rubric: ["측정·실험 근거", "지구본 조작과 설명의 일치", "에너지–기온 인과사슬", "남반구 설명", "자전축 수직 조건의 반례", "쉬운 설명", "AI 피드백 판단 근거"],
    moments: {
      a1: "한겨울에 서핑하는 호주의 산타 장면으로 ‘같은 12월, 다른 계절’의 수수께끼를 열었습니다.",
      a2: "계절의 원인을 거리 대신 어떤 증거로 설명할 수 있을지 질문을 정교화했습니다.",
      a3: "태양 고도 측정, 지구본 실험, 대본과 영상 제작 역할을 계획했습니다.",
      a4: "자전축을 기울인 지구본과 빛의 면적을 비교하며 에너지 차이를 확인했습니다.",
      a5: "5학년 후배가 이해할 수 있도록 첫 대본과 지구본 시연을 공유했습니다.",
      g: "계절 과학 해설가가 되어 한국과 호주의 12월을 설명하는 3–5분 영상을 설계했습니다.",
      e: "맞는 피드백 2개와 오류 피드백 3개를 섞어 과학적 판단의 근거를 드러냈습니다.",
      n: "‘태양과 가까워져서 덥다’는 AI 제안을 실험과 남반구 반례로 기각했습니다.",
      t: "거리 오개념을 고치고 자전축 기울기 → 에너지 → 기온의 인과사슬로 영상을 완성했습니다.",
    },
    beforeAfter: {
      before: "여름엔 자전축의 기울기가 태양과 가까워 여름인 6월에 남중고도가 가장 높다.",
      after: "여름에는 자전축이 태양 쪽으로 기울어진 방향 때문에 남중 고도가 높아지고, 겨울에는 남중 고도가 낮아진다. 거리가 아니라 기울어진 방향과 받는 에너지의 차이로 설명했다.",
    },
    feedbackMatches: [
      { feedback: "‘태양과 가까워’라는 표현은 지구본 실험과 맞지 않아요. 거리가 아니라 기울어진 방향 때문이에요.", revision: "‘태양 쪽으로 기울어진 방향’으로 고치고 6월 75도·겨울 29도의 남중 고도 자료를 연결했어요." },
      { feedback: "남중 고도 다음에 에너지와 기온의 연결이 빠졌어요.", revision: "남중 고도 → 받는 태양 에너지의 양 → 기온의 순서로 대본을 다시 이었어요." },
    ],
    evidence: [
      {
        kind: "excerpt",
        label: "피드백 전 대본 · 익명 발췌",
        title: "거리로 설명하려 했던 문장",
        quote: "여름엔 자전축의 기울기가 태양과 가까워 여름인 6월에 남중고도가 75도로 12개월 중 가장 높다.",
        caption: "실험에서는 지구본을 전등 쪽으로 당기지 않았다는 반례로 이 표현을 다시 검토했습니다.",
      },
      {
        kind: "excerpt",
        label: "최종 대본 · 익명 발췌",
        title: "기울어진 방향과 남중 고도로 바꾼 문장",
        quote: "여름엔 자전축의 기울기가 태양으로 기울어진 방향 때문에 6월에 남중고도가 75도로 높고, 겨울엔 29도로 남중고도가 낮다.",
        caption: "같은 모둠의 최종본에서 ‘가까워’가 ‘기울어진 방향’으로 바뀐 것을 확인했습니다.",
      },
    ],
    reflection: "우리가 지구본으로 해 본 거랑 달라서 안 고쳤어요. 이유를 쓰려고 다시 실험 결과를 봤는데, 그때 제가 진짜 이해한 것 같았어요.",
    metrics: ["오개념 모둠 8→2", "남반구 설명 8→21모둠", "AI 피드백 판별 1차"],
  },
  {
    slug: "energy-keeper",
    order: 5,
    title: "우리 학교 에너지 지킴이",
    shortTitle: "에너지 지킴이",
    output: "학교 전기 절약 제안서",
    image: "/showcase/projects/05-school-energy-keeper.png",
    reportPages: "보고서 26–28쪽",
    focusFactors: ["목표설정", "역할조정"],
    inquiry: "우리 학교 전기는 어디서 새고 있을까? — 데이터로 찾고, 데이터로 제안하기.",
    generalization: "정확한 측정과 계산은 막연한 절약 구호를 실행 가능한 공동체 제안으로 바꾼다.",
    summary: "학교 전력 낭비를 직접 조사하고 Wh·kWh로 계산해 교장 선생님께 제안했습니다.",
    accent: "#bd7a24",
    accentSoft: "#f5ead1",
    grasps: {
      goal: "학교의 전력 낭비를 찾아 계산하고 실현 가능한 절약 방안을 제안한다.",
      role: "우리 학교 에너지 지킴이",
      audience: "교장 선생님과 학교 구성원 전체",
      situation: "하루 동안 사용 현장을 조사하고 개수×소비전력×시간으로 낭비량을 계산한다.",
      product: "조사 학습지와 통합표·그래프를 근거로 만든 최종 전기 절약 제안서",
      standards: "자료 정확성, 단위 환산, 자료–제안 연결, 실천 주체 구분, 절감 효과, 독자 표현, 역할 수행",
    },
    rubric: ["조사 자료의 정확성", "Wh→kWh→1년 환산", "자료와 연결된 구체적 제안", "비용 없는 실천과 학교 지원 구분", "예상 절감 효과", "독자를 고려한 표현", "계획·역할 수행"],
    moments: {
      a1: "사람이 없는 교실과 복도에서 켜진 전등을 보며 ‘전기는 어디서 새는가’를 물었습니다.",
      a2: "막연한 절약이 아니라 데이터로 학교를 설득할 핵심 질문을 만들었습니다.",
      a3: "조사 구역, 시간, 기기 수, 소비전력 기록과 계산 역할을 나누었습니다.",
      a4: "교실과 복도를 조사하고 개수×W×시간으로 낭비 전력량을 계산했습니다.",
      a5: "모둠 데이터를 학급 통합표와 그래프로 모아 첫 절약 제안을 발표했습니다.",
      g: "에너지 지킴이가 되어 교장 선생님께 전달할 데이터 기반 제안서를 설계했습니다.",
      e: "AI와 교사가 개수·시간의 근거, Wh–kWh 환산, 제안의 실행 가능성을 점검했습니다.",
      n: "4차 프로젝트에서 익힌 AI 피드백 검토를 두 번째로 적용하며 오류를 더 잘 가려 냈습니다.",
      t: "‘전등이 많다’는 말이 256Wh라는 증거와 사람·학교가 나눠 할 실행안으로 바뀌었습니다.",
    },
    beforeAfter: {
      before: "점심시간에 빈 교실에 전등이 많이 켜져 있었다.",
      after: "점심시간 50분 동안 3층 빈 교실 4칸에 40W 전등 8개가 켜져 있어 256Wh가 낭비되었다. 마지막 사람이 끄는 표시를 붙이고 복도에는 센서등 설치를 제안한다.",
    },
    feedbackMatches: [
      { feedback: "‘많이’가 아니라 개수와 시간을 근거로 보여 주세요.", revision: "전등 8개×40W×50분을 기록해 256Wh로 수치화했어요." },
      { feedback: "Wh를 kWh로 바꾸는 단계가 빠졌어요.", revision: "÷1,000 환산표를 넣고 통합 계산표와 다시 대조했어요." },
    ],
    evidence: [
      {
        kind: "excerpt",
        label: "현장 조사 제안서 · 익명 발췌",
        title: "문제를 구체적인 장소에서 찾다",
        quote: "센서등이 없는 화장실이 몇 군데 있습니다. 사람이 없는데도 불이 켜져 있어 많은 전기가 낭비될 것입니다.",
        caption: "막연한 절약 구호 대신 학교 안의 실제 장소와 문제 상황을 특정했습니다.",
      },
      {
        kind: "excerpt",
        label: "실천 제안 · 익명 발췌",
        title: "관찰을 학교의 행동으로 바꾸다",
        quote: "센서등을 설치하면 사람이 들어갈 때 자동으로 켜지고, 아무도 없으면 꺼져 전기를 낭비하지 않게 될 것입니다.",
        caption: "계산 단위 오류는 검토 대상으로 남겨 두고, 관찰과 실천이 연결된 문장만 발췌했습니다.",
      },
    ],
    reflection: "우리 모두가 조사한 부분이 개선되어 학교 전기세가 많이 절약되고 지구를 지키는 데에도 기여하면 좋겠다.",
    metrics: ["AI 오류 판별 73→86%", "자료 근거 판단 20→55%", "상 수준 모둠 6→17"],
  },
];

export const outcomeHighlights = [
  {
    value: "3.87 → 4.21",
    label: "협력적 주도성 전체 평균",
    note: "6학년 5개 학급, 105명",
  },
  {
    value: "8 → 2모둠",
    label: "계절 거리 오개념",
    note: "처음 오개념을 보인 8모둠 중 75% 교정",
  },
  {
    value: "73% → 86%",
    label: "AI 오류 피드백 판별률",
    note: "4차 프로젝트에서 5차 프로젝트로",
  },
  {
    value: "29개",
    label: "학교에 남은 QR 식물 이름표",
    note: "학생 산출물이 실제 공간의 변화로",
  },
];

export const openLessons = [
  {
    date: "04.28",
    title: "기체생활 — 피드백을 성장으로",
    focus: "N · T",
    summary: "실험 근거가 빠진 설명을 찾아 피드포워드로 보완하고 첫 답안과 재평가 답안을 비교합니다.",
  },
  {
    date: "05.20",
    title: "기후행동 — 평가기준으로 읽기",
    focus: "E",
    summary: "카드뉴스를 정확성·논리·독자 관점으로 읽고 AI 평가와 동료평가를 함께 검토합니다.",
  },
  {
    date: "09.15",
    title: "계절의 비밀 — AI도 검토하기",
    focus: "T",
    summary: "정답 피드백 2개와 오류 피드백 3개를 실험 증거로 가려내며 과학적 설명을 완성합니다.",
  },
];

export const projectBySlug = new Map(projects.map((project) => [project.slug, project]));
