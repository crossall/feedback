export type ProjectTemplateId = "project1" | "project4";

export type ProjectInstance = {
  id: string;
  teacherId: string;
  slug: string;
  name: string;
  template: ProjectTemplateId;
  copiedRubric: boolean;
  createdAt: string;
  updatedAt: string;
};

export const projectTemplateInfo: Record<ProjectTemplateId, {
  label: string;
  summary: string;
  steps: string[];
}> = {
  project1: {
    label: "프로젝트 결과물 평가",
    summary: "AI 피드백, 다른 모둠 평가, 모둠원 협업평가와 개인별 결과 확인을 잇는 흐름",
    steps: ["결과물 제출", "AI 피드백", "동료·협업평가", "개인 결과·성찰"],
  },
  project4: {
    label: "8단계 과정중심평가",
    summary: "모둠 동료평가부터 대표작, 발표, AI 검토, 후배 평가와 성찰까지 운영하는 흐름",
    steps: ["모둠 동료평가", "대표작·발표", "AI 검토·수정", "후배 평가·성찰"],
  },
};

export function isProjectTemplateId(value: unknown): value is ProjectTemplateId {
  return value === "project1" || value === "project4";
}

export function projectInstanceId(teacherId: string, slug: string) {
  return `${teacherId}/${slug}`;
}
