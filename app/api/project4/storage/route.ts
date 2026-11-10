import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  createProject4Token,
  readProject4Token,
  validProject4TeacherPassword,
} from "@/lib/server/project4-auth";
import {
  getProject4AiReview,
  getProject4AiGeneration,
  getProject4Config,
  getProject4Final,
  getProject4GroupPeers,
  getProject4Junior,
  getProject4JuniorGroupEvaluation,
  getProject4JuniorGroupEvaluations,
  getProject4JuniorQuiz,
  getProject4JuniorQuizzes,
  getProject4PresentationReview,
  getProject4Reflection,
  getProject4Representative,
  getProject4TeacherData,
  saveProject4AiReview,
  saveProject4Config,
  saveProject4Final,
  saveProject4GrowthReport,
  saveProject4Junior,
  saveProject4JuniorGroupEvaluation,
  saveProject4JuniorQuiz,
  saveProject4Peer,
  saveProject4PresentationMemory,
  saveProject4PresentationRating,
  saveProject4Reflection,
  saveProject4RepresentativeReason,
  saveProject4RepresentativeSelection,
} from "@/lib/server/project4-store";
import type {
  Project4AiReview,
  Project4Config,
  Project4FinalScript,
  Project4GrowthAreaId,
  Project4GrowthLevel,
  Project4GrowthReport,
  Project4JuniorClassSummary,
  Project4JuniorGroupEvaluation,
  Project4JuniorGroupSummary,
  Project4JuniorQuiz,
  Project4JuniorQuizAnswers,
  Project4JuniorResponse,
  Project4PresentationRating,
  Project4PresentationReview,
  Project4Reflection,
} from "@/lib/project4";
import { isProject4StageOpen, scoreProject4JuniorQuiz } from "@/lib/project4";
import { getTeacherSessionId } from "@/lib/server/teacher-accounts";
import { runWithProjectInstance } from "@/lib/server/project-instance-context";
import { getProjectInstanceById } from "@/lib/server/project-instance-store";
import type { ProjectRequestInstance } from "@/lib/server/project-instance-context";

export const runtime = "nodejs";
export const maxDuration = 60;

function text(value: unknown, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

const growthAreaIds = new Set<Project4GrowthAreaId>([
  "draft",
  "revision",
  "individualVideo",
  "groupVideo",
  "aiJudgment",
  "junior",
  "writtenAssessment",
]);

function sanitizeGrowthReport(value: unknown): Project4GrowthReport {
  const report = value && typeof value === "object" ? value as Project4GrowthReport : null;
  if (!report || !/^[a-f0-9]{20}$/.test(text(report.id, 30))) {
    throw new Error("저장할 성장보고서를 확인해 주세요.");
  }
  const areas = Array.isArray(report.areas)
    ? report.areas.flatMap((item) => {
      const id = text(item.id, 30) as Project4GrowthAreaId;
      const level = text(item.level, 5) as Project4GrowthLevel;
      if (!growthAreaIds.has(id) || !["상", "중", "하"].includes(level)) return [];
      return [{
        id,
        title: text(item.title, 100),
        source: text(item.source, 150),
        feedback: text(item.feedback, 1500),
        level,
        status: item.status === "ready" ? "ready" as const : "review" as const,
      }];
    })
    : [];
  if (areas.length !== 7 || new Set(areas.map((item) => item.id)).size !== 7) {
    throw new Error("성장보고서의 일곱 평가 영역을 확인해 주세요.");
  }
  const overallLevel = text(report.overallLevel, 5) as Project4GrowthLevel;
  if (!["상", "중", "하"].includes(overallLevel)) {
    throw new Error("종합 수준을 확인해 주세요.");
  }
  return {
    id: report.id,
    className: text(report.className, 30),
    groupName: text(report.groupName, 50),
    studentName: text(report.studentName, 100),
    areas,
    overallLevel,
    overallHeadline: text(report.overallHeadline, 300),
    overallFeedback: text(report.overallFeedback, 1500),
    strengthFeedback: text(report.strengthFeedback, 1000),
    nextStep: text(report.nextStep, 1000),
    parentPrompt: text(report.parentPrompt, 500),
    evidence: report.evidence,
    updatedAt: new Date().toISOString(),
    edited: true,
  };
}

function studentFromConfig(config: Project4Config, classId: string, groupId: string, studentId: string) {
  const group = config.groups.find((item) => item.id === groupId && item.classId === classId);
  const student = group?.students.find((item) => item.id === studentId);
  return group && student ? { group, student } : null;
}

function groupFromConfig(config: Project4Config, classId: string, groupId: string) {
  return config.groups.find((item) => item.id === groupId && item.classId === classId) || null;
}

function studentConfig(config: Project4Config, classId: string, groupId: string): Project4Config {
  return {
    ...config,
    groups: config.groups.map((group) => ({
      ...group,
      students: group.classId === classId && group.id === groupId ? group.students : [],
    })),
  };
}

function requireStage(config: Project4Config, stage: number) {
  if (!isProject4StageOpen(config, stage)) {
    throw new Error(`${stage}단계는 아직 교사가 열지 않았습니다.`);
  }
}

function studentAiReview(value: Project4AiReview | null) {
  if (!value) return null;
  return {
    classId: value.classId,
    groupId: value.groupId,
    fileName: value.fileName,
    revision: value.revision || 1,
    wrongFeedback: value.wrongFeedback,
    submittedById: "",
    submittedByName: "",
    generatedAt: value.generatedAt || value.updatedAt,
    updatedAt: value.updatedAt,
    feedbacks: value.feedbacks.map((feedback) => ({
      id: feedback.id,
      title: feedback.title,
      feedback: feedback.feedback,
      evidence: feedback.evidence,
      criterionNumbers: feedback.criterionNumbers,
      accept: feedback.accept,
      basis: feedback.basis,
      reason: feedback.reason,
    })),
  };
}

function studentPresentationReview(value: Project4PresentationReview | null) {
  return value ? { ...value, submittedById: "", submittedByName: "" } : null;
}

function studentRepresentative(value: Awaited<ReturnType<typeof getProject4Representative>>) {
  if (!value) return null;
  return {
    selectedStudentId: value.selectedStudentId,
    selectedStudentName: value.selectedStudentName,
    reasons: value.reasons || [],
    updatedAt: value.updatedAt,
  };
}

const juniorQuizQuestions = [
  {
    id: "question1" as const,
    title: "여름이 겨울보다 더운 까닭",
    correctAnswer: 2,
    misconceptionAnswer: 1,
    misconceptionLabel: "태양과 가까워져서",
  },
  {
    id: "question2" as const,
    title: "우리나라가 여름일 때 호주가 겨울인 까닭",
    correctAnswer: 1,
    misconceptionAnswer: 2,
    misconceptionLabel: "호주가 태양에서 더 멀리 떨어져 있어서",
  },
] as const;

function requireJuniorEvaluationOpen(config: Project4Config) {
  if (!config.juniorEvaluation.open) {
    throw new Error("5학년 후배 평가는 지금 닫혀 있습니다.");
  }
}

function juniorMapping(config: Project4Config, juniorClassNumber: number) {
  return config.juniorEvaluation.classMappings.find((item) => item.juniorClassNumber === juniorClassNumber) || null;
}

function parseJuniorQuizAnswers(value: unknown): Project4JuniorQuizAnswers {
  const answers = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const question1 = Number(answers.question1);
  const question2 = Number(answers.question2);
  if (![1, 2, 3].includes(question1) || ![1, 2, 3].includes(question2)) {
    throw new Error("두 문제에 모두 답해 주세요.");
  }
  return {
    question1: question1 as 1 | 2 | 3,
    question2: question2 as 1 | 2 | 3,
  };
}

function juniorGroupSummary(
  evaluations: Project4JuniorGroupEvaluation[],
  legacy: Project4JuniorResponse[] = [],
): Project4JuniorGroupSummary {
  const distribution: Project4JuniorGroupSummary["distribution"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  evaluations.forEach((item) => { distribution[item.understanding] += 1; });
  legacy.forEach((item) => { distribution[item.understanding === "well" ? 5 : item.understanding === "some" ? 3 : 1] += 1; });
  return {
    total: evaluations.length + legacy.length,
    distribution,
    good: evaluations.map((item) => item.good).filter(Boolean),
    difficult: [
      ...evaluations.map((item) => item.difficult),
      ...legacy.map((item) => item.question),
    ].filter(Boolean),
    messages: [...evaluations.map((item) => item.message), ...legacy.map((item) => item.message)].filter(Boolean),
  };
}

function juniorClassSummary(quizzes: Project4JuniorQuiz[]): Project4JuniorClassSummary {
  const preSubmitted = quizzes.length;
  const postSubmitted = quizzes.filter((item) => item.postAnswers).length;
  return {
    participants: new Set(quizzes.map((item) => item.studentId)).size,
    preSubmitted,
    postSubmitted,
    questions: juniorQuizQuestions.map((question) => {
      const preCorrect = quizzes.filter((item) => item.preAnswers[question.id] === question.correctAnswer).length;
      const postRecords = quizzes.filter((item): item is Project4JuniorQuiz & { postAnswers: Project4JuniorQuizAnswers } => Boolean(item.postAnswers));
      const postCorrect = postRecords.filter((item) => item.postAnswers[question.id] === question.correctAnswer).length;
      return {
        id: question.id,
        title: question.title,
        preCorrect,
        preTotal: preSubmitted,
        prePercent: preSubmitted ? Math.round((preCorrect / preSubmitted) * 100) : 0,
        postCorrect,
        postTotal: postSubmitted,
        postPercent: postSubmitted ? Math.round((postCorrect / postSubmitted) * 100) : 0,
        misconceptionLabel: question.misconceptionLabel,
        preMisconception: quizzes.filter((item) => item.preAnswers[question.id] === question.misconceptionAnswer).length,
        postMisconception: postRecords.filter((item) => item.postAnswers[question.id] === question.misconceptionAnswer).length,
      };
    }),
  };
}

async function project4JuniorWorkspace(config: Project4Config, access: ReturnType<typeof readProject4Token>) {
  const targetClassId = access.classId || "";
  const studentId = access.studentId || "";
  const targetClass = config.classes.find((item) => item.id === targetClassId);
  const groups = config.groups.filter((item) => item.classId === targetClassId);
  const [quiz, responses] = await Promise.all([
    getProject4JuniorQuiz(targetClassId, studentId),
    Promise.all(groups.map((group) => getProject4JuniorGroupEvaluation(targetClassId, group.id, studentId))),
  ]);
  return {
    me: {
      studentId,
      evaluatorClass: access.evaluatorClass || "",
      evaluatorClassNumber: Number(access.evaluatorClass?.match(/(\d+)반/)?.[1] || 0),
      studentNumber: Number(access.studentNumber || 0),
      name: access.name || "",
      targetClassId,
      targetClassName: targetClass?.name || "6학년 반",
    },
    groups: groups.map((group) => ({ id: group.id, name: group.name, videoUrl: group.videoUrl })),
    quiz,
    responses: responses.filter((item): item is Project4JuniorGroupEvaluation => Boolean(item)),
    evaluationOpen: config.juniorEvaluation.open,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const requestedInstanceId = text(body.instanceId, 200);
    const storedInstance = requestedInstanceId
      ? await getProjectInstanceById(requestedInstanceId, "project4")
      : null;
    if (requestedInstanceId && !storedInstance) {
      return NextResponse.json({ error: "프로젝트 주소를 확인해 주세요." }, { status: 404 });
    }
    const instance: ProjectRequestInstance = storedInstance
      ? { ...storedInstance, legacy: false }
      : {
        id: "project4",
        teacherId: "4523",
        slug: "project4",
        name: "계절의 비밀",
        template: "project4",
        copiedRubric: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        legacy: true,
      };
    return await runWithProjectInstance(instance, async () => {
    const action = text(body.action, 50);
    const readToken = (token: string, role: "teacher" | "student" | "junior") => {
      const access = readProject4Token(token, role);
      if (access.instanceId !== instance.id) throw new Error("다른 프로젝트의 로그인 정보입니다. 다시 들어와 주세요.");
      return access;
    };

    if (action === "getConfig") {
      return NextResponse.json({ config: await getProject4Config() });
    }

    if (action === "teacherLogin") {
      const teacherAllowed = instance.legacy
        ? validProject4TeacherPassword(text(body.password, 100))
        : await getTeacherSessionId() === instance.teacherId;
      if (!teacherAllowed) {
        return NextResponse.json({ error: "교사 비밀번호를 확인해 주세요." }, { status: 401 });
      }
      return NextResponse.json({ token: createProject4Token({ instanceId: instance.id, role: "teacher" }) });
    }

    if (action === "enterStudent") {
      const config = await getProject4Config();
      const classId = text(body.classId, 100);
      const groupId = text(body.groupId, 100);
      const studentId = text(body.studentId, 100);
      const found = studentFromConfig(config, classId, groupId, studentId);
      if (!found) {
        return NextResponse.json({ error: "반, 모둠, 이름을 다시 확인해 주세요." }, { status: 400 });
      }
      return NextResponse.json({
        token: createProject4Token({
          instanceId: instance.id,
          role: "student",
          classId,
          groupId,
          studentId: found.student.id,
          name: found.student.name,
        }),
      });
    }

    if (action === "enterJunior") {
      const config = await getProject4Config();
      requireJuniorEvaluationOpen(config);
      const name = text(body.name, 100);
      const juniorClassNumber = Math.round(Number(body.juniorClassNumber));
      const studentNumber = Math.round(Number(body.studentNumber));
      const mapping = juniorMapping(config, juniorClassNumber);
      if (!name || !mapping || studentNumber < 1 || studentNumber > 99) {
        return NextResponse.json({ error: "반, 번호, 이름을 다시 확인해 주세요." }, { status: 400 });
      }
      const evaluatorClass = `5학년 ${juniorClassNumber}반`;
      const studentId = createHash("sha256")
        .update([evaluatorClass, studentNumber, name, mapping.targetClassId].map((item) => String(item).trim().toLocaleLowerCase("ko")).join("|"))
        .digest("hex")
        .slice(0, 24);
      const token = createProject4Token({
        instanceId: instance.id,
        role: "junior",
        classId: mapping.targetClassId,
        studentId,
        studentNumber: String(studentNumber),
        name,
        evaluatorClass,
      });
      return NextResponse.json({
        token,
        workspace: await project4JuniorWorkspace(config, readToken(token, "junior")),
      });
    }

    const authToken = text(body.token, 5000);

    if (action === "saveConfig" || action === "teacherData" || action === "saveGrowthReport") {
      readToken(authToken, "teacher");
      if (action === "saveConfig") {
        return NextResponse.json({
          config: await saveProject4Config(body.config as Project4Config),
        });
      }
      if (action === "saveGrowthReport") {
        const report = sanitizeGrowthReport(body.report);
        const saved = await saveProject4GrowthReport(report);
        return NextResponse.json({ report: saved });
      }
      const config = await getProject4Config();
      return NextResponse.json({
        config,
        data: await getProject4TeacherData(config),
      });
    }

    if (action === "studentWorkspace" || action === "representativeWorkspace" || action === "presentationWorkspace" || action === "aiWorkspace" || action === "submitPeer" || action === "saveRepresentative" || action === "updateRepresentativeSelection" || action === "saveRepresentativeReason" || action === "savePresentationReview" || action === "updatePresentationReview" || action === "saveAiReview" || action === "saveFinal" || action === "saveReflection") {
      const access = readToken(authToken, "student");
      const config = await getProject4Config();
      const found = studentFromConfig(config, access.classId || "", access.groupId || "", access.studentId || "");
      if (!found) throw new Error("학생 정보를 다시 확인해 주세요.");
      const classId = access.classId as string;
      const groupId = access.groupId as string;
      const studentId = access.studentId as string;

      const actionStages: Record<string, number> = {
        submitPeer: 1,
        saveRepresentative: 3,
        updateRepresentativeSelection: 3,
        saveRepresentativeReason: 3,
        representativeWorkspace: 3,
        savePresentationReview: 4,
        updatePresentationReview: 4,
        presentationWorkspace: 4,
        aiWorkspace: 5,
        saveAiReview: 5,
        saveFinal: 6,
        saveReflection: 8,
      };
      if (actionStages[action]) requireStage(config, actionStages[action]);

      if (action === "representativeWorkspace") {
        return NextResponse.json({
          representative: studentRepresentative(await getProject4Representative(classId, groupId)),
        });
      }

      if (action === "presentationWorkspace") {
        return NextResponse.json({
          presentation: studentPresentationReview(await getProject4PresentationReview(classId, groupId)),
        });
      }

      if (action === "aiWorkspace") {
        const [aiReview, generation] = await Promise.all([
          getProject4AiReview(classId, groupId),
          getProject4AiGeneration(classId, groupId),
        ]);
        return NextResponse.json({
          aiReview: studentAiReview(aiReview),
          generating: Boolean(generation),
        });
      }

      if (action === "submitPeer") {
        const targetId = text(body.targetId, 100);
        const target = found.group.students.find((item) => item.id === targetId && item.id !== studentId);
        if (!target) throw new Error("평가할 모둠 친구를 확인해 주세요.");
        const good = text(body.good);
        const blocked = text(body.blocked);
        if (!good || !blocked) throw new Error("두 문항에 모두 답해 주세요.");
        const now = new Date().toISOString();
        await saveProject4Peer({
          id: `${targetId}-${studentId}`,
          classId,
          groupId,
          evaluatorId: studentId,
          evaluatorName: found.student.name,
          targetId,
          targetName: target.name,
          good,
          blocked,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (action === "saveRepresentative" || action === "updateRepresentativeSelection") {
        const selectedStudentId = text(body.selectedStudentId, 100);
        const selected = found.group.students.find((item) => item.id === selectedStudentId);
        const legacyReason = action === "saveRepresentative" ? text(body.reason) : "";
        if (!selected) throw new Error("대표 작품을 다시 선택해 주세요.");
        if (action === "saveRepresentative" && !legacyReason) throw new Error("대표 작품을 고른 이유를 입력해 주세요.");
        const now = new Date().toISOString();
        await saveProject4RepresentativeSelection({
          classId,
          groupId,
          selectedStudentId,
          selectedStudentName: selected.name,
          submittedById: studentId,
          submittedByName: found.student.name,
          updatedAt: now,
        });
        if (action === "saveRepresentative") {
          await saveProject4RepresentativeReason({
            classId,
            groupId,
            studentId,
            studentName: found.student.name,
            selectedStudentId,
            selectedStudentName: selected.name,
            reason: legacyReason,
            updatedAt: now,
          });
        } else {
          return NextResponse.json({
            representative: studentRepresentative(await getProject4Representative(classId, groupId)),
          });
        }
      }

      if (action === "saveRepresentativeReason") {
        const reason = text(body.reason);
        const representative = await getProject4Representative(classId, groupId);
        if (!representative) throw new Error("먼저 모둠 대표 작품을 선택해 주세요.");
        if (!reason) throw new Error("대표 작품을 고른 이유를 입력해 주세요.");
        await saveProject4RepresentativeReason({
          classId,
          groupId,
          studentId,
          studentName: found.student.name,
          selectedStudentId: representative.selectedStudentId,
          selectedStudentName: representative.selectedStudentName,
          reason,
          updatedAt: new Date().toISOString(),
        });
        return NextResponse.json({
          representative: studentRepresentative(await getProject4Representative(classId, groupId)),
        });
      }

      if (action === "savePresentationReview" || action === "updatePresentationReview") {
        const submitted = body.presentation as Project4PresentationReview | undefined;
        const targetGroups = config.groups.filter((group) => group.classId === classId && group.id !== groupId);
        if (targetGroups.length === 0) throw new Error("같은 반에 평가할 다른 모둠이 없습니다.");
        const validRatings = new Set<Project4PresentationRating>(["good", "average", "needsWork"]);
        const now = new Date().toISOString();
        const saves: Array<Promise<void>> = [];

        if (action === "updatePresentationReview") {
          const targetGroupId = text(body.targetGroupId, 100);
          const targetGroup = targetGroups.find((group) => group.id === targetGroupId);
          const criterionIndex = Number(body.criterionIndex);
          const rating = body.rating as Project4PresentationRating | null;
          if (targetGroupId) {
            if (!targetGroup || !Number.isInteger(criterionIndex) || criterionIndex < 0 || criterionIndex >= 6 || (rating !== null && !validRatings.has(rating))) {
              throw new Error("평가할 모둠과 기준을 다시 확인해 주세요.");
            }
            saves.push(saveProject4PresentationRating({
              classId,
              evaluatorGroupId: groupId,
              evaluatorGroupName: found.group.name,
              targetGroupId,
              targetGroupName: targetGroup.name,
              criterionIndex,
              rating,
              submittedById: studentId,
              submittedByName: found.student.name,
              updatedAt: now,
            }));
          } else if (Object.prototype.hasOwnProperty.call(body, "memorable")) {
            saves.push(saveProject4PresentationMemory({
              classId,
              evaluatorGroupId: groupId,
              evaluatorGroupName: found.group.name,
              memorable: text(body.memorable),
              submittedById: studentId,
              submittedByName: found.student.name,
              updatedAt: now,
            }));
          } else {
            throw new Error("저장할 평가 내용을 확인해 주세요.");
          }
        } else {
          for (const target of Array.isArray(submitted?.targets) ? submitted.targets : []) {
            const targetGroup = targetGroups.find((group) => group.id === text(target.targetGroupId, 100));
            if (!targetGroup || !Array.isArray(target.ratings)) continue;
            target.ratings.slice(0, 6).forEach((rating, criterionIndex) => {
              if (!rating || !validRatings.has(rating)) return;
              saves.push(saveProject4PresentationRating({
                classId,
                evaluatorGroupId: groupId,
                evaluatorGroupName: found.group.name,
                targetGroupId: targetGroup.id,
                targetGroupName: targetGroup.name,
                criterionIndex,
                rating,
                submittedById: studentId,
                submittedByName: found.student.name,
                updatedAt: now,
              }));
            });
          }
          if (submitted && Object.prototype.hasOwnProperty.call(submitted, "memorable")) {
            saves.push(saveProject4PresentationMemory({
              classId,
              evaluatorGroupId: groupId,
              evaluatorGroupName: found.group.name,
              memorable: text(submitted.memorable),
              submittedById: studentId,
              submittedByName: found.student.name,
              updatedAt: now,
            }));
          }
        }
        if (saves.length === 0) throw new Error("저장할 평가 내용을 확인해 주세요.");
        await Promise.all(saves);
        return NextResponse.json({
          presentation: studentPresentationReview(await getProject4PresentationReview(classId, groupId)),
        });
      }

      if (action === "saveAiReview") {
        const review = body.review as Project4AiReview | undefined;
        const existing = await getProject4AiReview(classId, groupId);
        if (!existing) throw new Error("먼저 모둠 스크립트를 올려 AI 피드백을 받아 주세요.");
        if ((review?.revision || 1) !== (existing.revision || 1) || review?.generatedAt !== (existing.generatedAt || existing.updatedAt)) {
          throw new Error("모둠원이 새 피드백을 만들었습니다. 최신 피드백을 확인한 뒤 다시 판단해 주세요.");
        }
        const submittedFeedbacks = Array.isArray(review?.feedbacks) ? review.feedbacks : [];
        const submittedById = new Map(submittedFeedbacks.map((item) => [text(item.id, 100), item]));
        const validBases = new Set(["measurement", "experiment", "criteria", "unsure"]);
        await saveProject4AiReview({
          ...existing,
          feedbacks: existing.feedbacks.map((feedback) => {
            const submitted = submittedById.get(feedback.id);
            return {
              ...feedback,
              accept: typeof submitted?.accept === "boolean" ? submitted.accept : undefined,
              basis: validBases.has(String(submitted?.basis)) ? submitted?.basis : undefined,
              reason: text(submitted?.reason),
            };
          }),
          wrongFeedback: text(review?.wrongFeedback),
          submittedById: studentId,
          submittedByName: found.student.name,
          updatedAt: new Date().toISOString(),
        });
      }

      if (action === "saveFinal") {
        const final = body.final as Project4FinalScript;
        if (final.mode === "text" && !text(final.text)) throw new Error("최종 대본을 입력해 주세요.");
        if (final.mode === "pdf" && !text(final.fileData, 18_000_000)) throw new Error("최종 대본 PDF를 선택해 주세요.");
        await saveProject4Final({
          ...final,
          classId,
          groupId,
          text: text(final.text, 30_000),
          fileName: text(final.fileName, 300),
          fileData: final.mode === "pdf" ? text(final.fileData, 18_000_000) : undefined,
          submittedById: studentId,
          submittedByName: found.student.name,
          updatedAt: new Date().toISOString(),
        });
      }

      if (action === "saveReflection") {
        const reflection = body.reflection as Project4Reflection;
        await saveProject4Reflection({
          ...reflection,
          classId,
          groupId,
          studentId,
          studentName: found.student.name,
          responsibility: Math.max(1, Math.min(3, Number(reflection.responsibility) || 1)),
          helpfulFeedback: Math.max(1, Math.min(3, Number(reflection.helpfulFeedback) || 1)),
          revisedFromFeedback: Math.max(1, Math.min(3, Number(reflection.revisedFromFeedback) || 1)),
          changed: text(reflection.changed),
          nextExplanation: text(reflection.nextExplanation),
          rejectedAiReason: text(reflection.rejectedAiReason),
          updatedAt: new Date().toISOString(),
        });
      }

      const [peers, representative, presentation, aiReview, final, legacyJuniors, juniorGroups, juniorQuizzes, reflection] = await Promise.all([
        getProject4GroupPeers(classId, groupId),
        getProject4Representative(classId, groupId),
        getProject4PresentationReview(classId, groupId),
        getProject4AiReview(classId, groupId),
        getProject4Final(classId, groupId),
        getProject4Junior(classId, groupId),
        getProject4JuniorGroupEvaluations(classId, groupId),
        getProject4JuniorQuizzes(classId),
        getProject4Reflection(classId, groupId, studentId),
      ]);
      return NextResponse.json({
        config: studentConfig(config, classId, groupId),
        me: { classId, groupId, studentId, name: found.student.name },
        workspace: {
          submittedTargetIds: peers.filter((item) => item.evaluatorId === studentId).map((item) => item.targetId),
          received: peers.filter((item) => item.targetId === studentId).map((item) => ({
            id: item.id,
            good: item.good,
            blocked: item.blocked,
          })),
          representative: studentRepresentative(representative),
          presentation: studentPresentationReview(presentation),
          aiReview: studentAiReview(aiReview),
          final: final ? { ...final, submittedById: "", submittedByName: "" } : null,
          juniorSummary: juniorGroupSummary(juniorGroups, legacyJuniors),
          juniorClassSummary: juniorClassSummary(juniorQuizzes),
          reflection,
        },
      });
    }

    if (["juniorWorkspace", "submitJuniorPreQuiz", "submitJuniorGroup", "submitJuniorPostQuiz"].includes(action)) {
      const access = readToken(authToken, "junior");
      const config = await getProject4Config();
      const juniorClassNumber = Number(access.evaluatorClass?.match(/(\d+)반/)?.[1] || 0);
      const mapping = juniorMapping(config, juniorClassNumber);
      const targetClassId = access.classId || "";
      const studentId = access.studentId || "";
      const studentNumber = Number(access.studentNumber || 0);
      if (!mapping || mapping.targetClassId !== targetClassId || !studentId || !access.name || studentNumber < 1) {
        throw new Error("5학년 학생 정보를 다시 확인해 주세요.");
      }

      if (action === "juniorWorkspace") {
        return NextResponse.json({ workspace: await project4JuniorWorkspace(config, access) });
      }

      requireJuniorEvaluationOpen(config);
      const now = new Date().toISOString();
      const quiz = await getProject4JuniorQuiz(targetClassId, studentId);

      if (action === "submitJuniorPreQuiz") {
        if (quiz) throw new Error("시작 퀴즈는 이미 제출했습니다.");
        const answers = parseJuniorQuizAnswers(body.answers);
        await saveProject4JuniorQuiz({
          id: studentId,
          studentId,
          evaluatorClassNumber: juniorClassNumber,
          evaluatorClass: access.evaluatorClass || "",
          studentNumber,
          evaluatorName: access.name,
          targetClassId,
          preAnswers: answers,
          preScore: scoreProject4JuniorQuiz(answers),
          preSubmittedAt: now,
          updatedAt: now,
        });
      }

      if (action === "submitJuniorGroup") {
        if (!quiz) throw new Error("먼저 시작 퀴즈를 제출해 주세요.");
        if (quiz.postSubmittedAt) throw new Error("마무리 퀴즈를 제출한 뒤에는 평가를 수정할 수 없습니다.");
        const targetGroupId = text(body.targetGroupId, 100);
        const targetGroup = groupFromConfig(config, targetClassId, targetGroupId);
        const understanding = Math.round(Number(body.understanding));
        if (!targetGroup || understanding < 1 || understanding > 5) {
          throw new Error("평가할 모둠과 이해한 정도를 확인해 주세요.");
        }
        const existing = await getProject4JuniorGroupEvaluation(targetClassId, targetGroupId, studentId);
        const studentResponses = (await Promise.all(
          config.groups
            .filter((group) => group.classId === targetClassId)
            .map((group) => getProject4JuniorGroupEvaluation(targetClassId, group.id, studentId)),
        )).filter(Boolean);
        const value: Project4JuniorGroupEvaluation = {
          id: `${studentId}-${targetGroupId}`,
          studentId,
          evaluatorClassNumber: juniorClassNumber,
          evaluatorClass: access.evaluatorClass || "",
          studentNumber,
          evaluatorName: access.name,
          targetClassId,
          targetGroupId,
          understanding: understanding as 1 | 2 | 3 | 4 | 5,
          good: text(body.good),
          difficult: text(body.difficult),
          message: text(body.message),
          evaluationOrder: existing?.evaluationOrder || studentResponses.length + 1,
          submittedAt: existing?.submittedAt || now,
          updatedAt: now,
        };
        await saveProject4JuniorGroupEvaluation(value);
      }

      if (action === "submitJuniorPostQuiz") {
        if (!quiz) throw new Error("먼저 시작 퀴즈를 제출해 주세요.");
        if (quiz.postSubmittedAt) throw new Error("마무리 퀴즈는 이미 제출했습니다.");
        const targetGroups = config.groups.filter((group) => group.classId === targetClassId);
        if (targetGroups.length === 0) throw new Error("평가할 모둠이 아직 등록되지 않았습니다.");
        const responses = await Promise.all(
          targetGroups.map((group) => getProject4JuniorGroupEvaluation(targetClassId, group.id, studentId)),
        );
        if (responses.some((item) => !item)) throw new Error("모든 모둠 평가를 먼저 제출해 주세요.");
        const answers = parseJuniorQuizAnswers(body.answers);
        await saveProject4JuniorQuiz({
          ...quiz,
          postAnswers: answers,
          postScore: scoreProject4JuniorQuiz(answers),
          postSubmittedAt: now,
          updatedAt: now,
        });
      }

      return NextResponse.json({ workspace: await project4JuniorWorkspace(config, access) });
    }

    if (action === "submitJunior") {
      const access = readToken(authToken, "junior");
      const config = await getProject4Config();
      requireStage(config, 7);
      const understanding = body.understanding;
      if (understanding !== "well" && understanding !== "some" && understanding !== "little") {
        throw new Error("이해한 정도를 선택해 주세요.");
      }
      const response: Project4JuniorResponse = {
        id: createHash("sha256")
          .update([access.evaluatorClass, access.name, access.classId, access.groupId].map((item) => String(item || "").trim().toLocaleLowerCase("ko")).join("|"))
          .digest("hex")
          .slice(0, 24),
        evaluatorName: access.name || "",
        evaluatorClass: access.evaluatorClass || "",
        targetClassId: access.classId || "",
        targetGroupId: access.groupId || "",
        understanding,
        helpfulParts: Array.isArray(body.helpfulParts) ? body.helpfulParts.map((item) => text(item, 30)).slice(0, 4) : [],
        question: text(body.question),
        message: text(body.message),
        createdAt: new Date().toISOString(),
      };
      await saveProject4Junior(response);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "요청한 동작을 확인해 주세요." }, { status: 400 });
    });
  } catch (error) {
    console.error("Project4 storage request failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "프로젝트 요청을 처리하지 못했습니다." },
      { status: 400 },
    );
  }
}
