export type Project4Student = {
  id: string;
  name: string;
};

export type Project4Group = {
  id: string;
  classId: string;
  name: string;
  students: Project4Student[];
};

export type Project4Class = {
  id: string;
  name: string;
};

export type Project4Config = {
  title: string;
  description: string;
  openStage: number;
  criteria: string[];
  classes: Project4Class[];
  groups: Project4Group[];
};

export type Project4PeerResponse = {
  id: string;
  classId: string;
  groupId: string;
  evaluatorId: string;
  evaluatorName: string;
  targetId: string;
  targetName: string;
  good: string;
  blocked: string;
  createdAt: string;
  updatedAt: string;
};

export type Project4Representative = {
  classId: string;
  groupId: string;
  selectedStudentId: string;
  selectedStudentName: string;
  reason: string;
  submittedById: string;
  submittedByName: string;
  updatedAt: string;
};

export type Project4AiFeedback = {
  id: string;
  title: string;
  feedback: string;
  evidence: string;
  criterionNumbers: number[];
  accept?: boolean;
  basis?: "measurement" | "experiment" | "criteria" | "unsure";
  reason?: string;
};

export type Project4AiReview = {
  classId: string;
  groupId: string;
  fileName: string;
  feedbacks: Project4AiFeedback[];
  wrongFeedback: string;
  submittedById: string;
  submittedByName: string;
  updatedAt: string;
};

export type Project4FinalScript = {
  classId: string;
  groupId: string;
  mode: "text" | "pdf";
  text: string;
  fileName: string;
  fileData?: string;
  submittedById: string;
  submittedByName: string;
  updatedAt: string;
};

export type Project4JuniorResponse = {
  id: string;
  evaluatorName: string;
  evaluatorClass: string;
  targetClassId: string;
  targetGroupId: string;
  understanding: "well" | "some" | "little";
  helpfulParts: string[];
  question: string;
  message: string;
  createdAt: string;
};

export type Project4Reflection = {
  classId: string;
  groupId: string;
  studentId: string;
  studentName: string;
  responsibility: number;
  helpfulFeedback: number;
  revisedFromFeedback: number;
  changed: string;
  nextExplanation: string;
  rejectedAiReason: string;
  updatedAt: string;
};

export const project4DefaultCriteria = [
  "측정한 태양의 남중 고도와 그림자 길이 자료를 설명에 알맞게 활용했다.",
  "지구본과 전등 실험으로 지구의 기울기와 햇빛이 비치는 모습을 이해하기 쉽게 보여 주었다.",
  "지구의 자전축이 기울어진 채 공전하여 계절에 따라 태양의 남중 고도와 낮의 길이가 달라짐을 연결해 설명했다.",
  "남반구는 북반구와 계절이 반대라는 점과 그 까닭을 설명했다.",
  "측정 자료와 실험 결과를 근거로 계절 변화의 까닭을 과학적으로 정확하고 논리적으로 설명했다.",
  "계절 변화를 처음 배우는 5학년이 이해할 수 있도록 쉬운 말, 알맞은 목소리와 속도로 설명했다.",
];

export const project4DefaultConfig: Project4Config = {
  title: "계절의 비밀",
  description: "측정과 지구본 실험을 근거로 계절이 바뀌는 까닭을 설명하고, 친구와 후배의 반응을 바탕으로 설명을 다듬습니다.",
  openStage: 1,
  criteria: project4DefaultCriteria,
  classes: [],
  groups: [],
};

export function project4Id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function normalizeProject4Config(value?: Partial<Project4Config>): Project4Config {
  const criteria = Array.isArray(value?.criteria)
    ? value.criteria.map((item) => String(item).trim()).filter(Boolean).slice(0, 6)
    : [];
  return {
    title: value?.title?.trim() || project4DefaultConfig.title,
    description: value?.description?.trim() || project4DefaultConfig.description,
    openStage: Math.max(1, Math.min(7, Math.round(Number(value?.openStage) || 1))),
    criteria: criteria.length === 6 ? criteria : [...project4DefaultCriteria],
    classes: Array.isArray(value?.classes)
      ? value.classes.map((item) => ({ id: String(item.id), name: String(item.name).trim() })).filter((item) => item.id && item.name)
      : [],
    groups: Array.isArray(value?.groups)
      ? value.groups.map((group) => ({
        id: String(group.id),
        classId: String(group.classId),
        name: String(group.name).trim(),
        students: Array.isArray(group.students)
          ? group.students.map((student) => ({ id: String(student.id), name: String(student.name).trim() })).filter((student) => student.id && student.name)
          : [],
      })).filter((group) => group.id && group.classId && group.name)
      : [],
  };
}

export const project4Stages = [
  "모둠 내 동료평가",
  "내가 받은 평가 확인",
  "대표 작품 선정",
  "AI 피드백 판단",
  "최종 대본 제출",
  "후배 평가",
  "결과 확인과 자기평가",
] as const;
