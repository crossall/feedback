import type { Evaluation } from "./evaluation-result";

export function formatEvaluationText(
  evaluation: Evaluation,
  studentName: string,
) {
  const criteria = evaluation.criteria
    .map((item, index) => (
      `${index + 1}. ${item.name} (${item.score}/${item.maxScore})\n${item.feedback}`
    ))
    .join("\n\n");
  const strengths = evaluation.strengths.map((text) => `- ${text}`).join("\n");
  const improvements = evaluation.improvements.map((text) => `- ${text}`).join("\n");

  return `===== 잎새 피드백 · ${studentName} 학생 평가 =====

총점: ${evaluation.totalScore}/${evaluation.maxScore}

[종합 의견]
${evaluation.summary}

[항목별 평가]
${criteria}

[잘한 점]
${strengths}

[다듬으면 더 좋아질 점]
${improvements}

[다음 단계]
${evaluation.nextStep}

===== 평가 끝 =====`;
}
