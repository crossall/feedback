import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  createProject4Token,
  readProject4Token,
  validProject4TeacherPassword,
} from "@/lib/server/project4-auth";
import {
  getProject4AiReview,
  getProject4Config,
  getProject4Final,
  getProject4GroupPeers,
  getProject4Junior,
  getProject4PresentationReview,
  getProject4Reflection,
  getProject4Representative,
  getProject4TeacherData,
  saveProject4AiReview,
  saveProject4Config,
  saveProject4Final,
  saveProject4Junior,
  saveProject4Peer,
  saveProject4PresentationMemory,
  saveProject4PresentationRating,
  saveProject4Reflection,
  saveProject4Representative,
} from "@/lib/server/project4-store";
import type {
  Project4AiReview,
  Project4Config,
  Project4FinalScript,
  Project4JuniorResponse,
  Project4PresentationRating,
  Project4PresentationReview,
  Project4Reflection,
} from "@/lib/project4";

export const runtime = "nodejs";
export const maxDuration = 60;

function text(value: unknown, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
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
  if (config.openStage < stage) {
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

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action, 50);

    if (action === "getConfig") {
      return NextResponse.json({ config: await getProject4Config() });
    }

    if (action === "teacherLogin") {
      if (!validProject4TeacherPassword(text(body.password, 100))) {
        return NextResponse.json({ error: "교사 비밀번호를 확인해 주세요." }, { status: 401 });
      }
      return NextResponse.json({ token: createProject4Token({ role: "teacher" }) });
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
      requireStage(config, 7);
      const classId = text(body.targetClassId, 100);
      const groupId = text(body.targetGroupId, 100);
      const name = text(body.name, 100);
      const evaluatorClassNumber = text(body.evaluatorClass, 2);
      const evaluatorClass = /^\d{1,2}$/.test(evaluatorClassNumber) && Number(evaluatorClassNumber) > 0
        ? `5학년 ${Number(evaluatorClassNumber)}반`
        : "";
      if (!name || !evaluatorClass || !groupFromConfig(config, classId, groupId)) {
        return NextResponse.json({ error: "이름, 반, 평가할 모둠을 확인해 주세요." }, { status: 400 });
      }
      return NextResponse.json({
        token: createProject4Token({
          role: "junior",
          classId,
          groupId,
          name,
          evaluatorClass,
        }),
      });
    }

    const authToken = text(body.token, 5000);

    if (action === "saveConfig" || action === "teacherData") {
      readProject4Token(authToken, "teacher");
      if (action === "saveConfig") {
        return NextResponse.json({
          config: await saveProject4Config(body.config as Project4Config),
        });
      }
      return NextResponse.json({
        config: await getProject4Config(),
        data: await getProject4TeacherData(),
      });
    }

    if (action === "studentWorkspace" || action === "presentationWorkspace" || action === "submitPeer" || action === "saveRepresentative" || action === "savePresentationReview" || action === "updatePresentationReview" || action === "saveAiReview" || action === "saveFinal" || action === "saveReflection") {
      const access = readProject4Token(authToken, "student");
      const config = await getProject4Config();
      const found = studentFromConfig(config, access.classId || "", access.groupId || "", access.studentId || "");
      if (!found) throw new Error("학생 정보를 다시 확인해 주세요.");
      const classId = access.classId as string;
      const groupId = access.groupId as string;
      const studentId = access.studentId as string;

      const actionStages: Record<string, number> = {
        submitPeer: 1,
        saveRepresentative: 3,
        savePresentationReview: 4,
        updatePresentationReview: 4,
        presentationWorkspace: 4,
        saveAiReview: 5,
        saveFinal: 6,
        saveReflection: 8,
      };
      if (actionStages[action]) requireStage(config, actionStages[action]);

      if (action === "presentationWorkspace") {
        return NextResponse.json({
          presentation: studentPresentationReview(await getProject4PresentationReview(classId, groupId)),
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

      if (action === "saveRepresentative") {
        const selectedStudentId = text(body.selectedStudentId, 100);
        const selected = found.group.students.find((item) => item.id === selectedStudentId);
        const reason = text(body.reason);
        if (!selected || !reason) throw new Error("대표 작품과 선정 까닭을 입력해 주세요.");
        await saveProject4Representative({
          classId,
          groupId,
          selectedStudentId,
          selectedStudentName: selected.name,
          reason,
          submittedById: studentId,
          submittedByName: found.student.name,
          updatedAt: new Date().toISOString(),
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
          const rating = body.rating as Project4PresentationRating;
          if (targetGroupId) {
            if (!targetGroup || !Number.isInteger(criterionIndex) || criterionIndex < 0 || criterionIndex >= 6 || !validRatings.has(rating)) {
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

      const [peers, representative, presentation, aiReview, final, juniors, reflection] = await Promise.all([
        getProject4GroupPeers(classId, groupId),
        getProject4Representative(classId, groupId),
        getProject4PresentationReview(classId, groupId),
        getProject4AiReview(classId, groupId),
        getProject4Final(classId, groupId),
        getProject4Junior(classId, groupId),
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
          representative: representative ? {
            selectedStudentId: representative.selectedStudentId,
            selectedStudentName: representative.selectedStudentName,
            reason: representative.reason,
          } : null,
          presentation: studentPresentationReview(presentation),
          aiReview: studentAiReview(aiReview),
          final: final ? { ...final, submittedById: "", submittedByName: "" } : null,
          juniorSummary: {
            total: juniors.length,
            understanding: {
              well: juniors.filter((item) => item.understanding === "well").length,
              some: juniors.filter((item) => item.understanding === "some").length,
              little: juniors.filter((item) => item.understanding === "little").length,
            },
            helpfulParts: ["measurement", "globe", "australia", "voice"].map((part) => ({
              part,
              count: juniors.filter((item) => item.helpfulParts.includes(part)).length,
            })),
            questions: juniors.map((item) => item.question).filter(Boolean),
            messages: juniors.map((item) => item.message).filter(Boolean),
          },
          reflection,
        },
      });
    }

    if (action === "submitJunior") {
      const access = readProject4Token(authToken, "junior");
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
  } catch (error) {
    console.error("Project4 storage request failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "프로젝트 요청을 처리하지 못했습니다." },
      { status: 400 },
    );
  }
}
