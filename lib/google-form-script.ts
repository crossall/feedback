import type { PeerEvaluationConfig, PeerQuestion } from "./peer-evaluation";
import { normalizeRubricLevels } from "./rubric-levels";

function scriptValue(value: string | number | boolean | string[]) {
  return JSON.stringify(value);
}

function requiredCall(required: boolean) {
  return `.setRequired(${required ? "true" : "false"})`;
}

function questionScript(question: PeerQuestion, index: number) {
  const variable = `question${index + 1}`;
  const title = scriptValue(question.prompt);

  if (question.type === "text") {
    return [
      `  form.addParagraphTextItem()`,
      `    .setTitle(${title})`,
      `    ${requiredCall(question.required)};`,
    ].join("\n");
  }

  if (question.type === "level") {
    const choices = normalizeRubricLevels(question.levels, question.maxScore).map((level) => (
      `${level.label} (${level.score}점) - ${level.description}`
    ));
    return [
      `  form.addMultipleChoiceItem()`,
      `    .setTitle(${title})`,
      `    .setChoiceValues(${scriptValue(choices)})`,
      `    ${requiredCall(question.required)};`,
    ].join("\n");
  }

  if (question.maxScore >= 3 && question.maxScore <= 10) {
    return [
      `  form.addScaleItem()`,
      `    .setTitle(${title})`,
      `    .setBounds(0, ${question.maxScore})`,
      `    .setLabels("전혀 그렇지 않음", "매우 그렇다")`,
      `    ${requiredCall(question.required)};`,
    ].join("\n");
  }

  return [
    `  const ${variable} = form.addTextItem()`,
    `    .setTitle(${title})`,
    `    .setHelpText("0점부터 ${question.maxScore}점 사이의 숫자를 입력하세요.")`,
    `    ${requiredCall(question.required)};`,
    `  ${variable}.setValidation(`,
    `    FormApp.createTextValidation()`,
    `      .requireNumberBetween(0, ${question.maxScore})`,
    `      .build(),`,
    `  );`,
  ].join("\n");
}

export function createGoogleFormAppsScript(config: PeerEvaluationConfig) {
  const teamChoices = Array.from(
    { length: Math.max(2, config.teamCount) },
    (_, index) => `${index + 1}모둠`,
  );
  const identityItems = [
    `  form.addTextItem().setTitle("학년").setRequired(true);`,
    `  form.addTextItem().setTitle("반").setRequired(true);`,
    `  form.addTextItem().setTitle("내 이름").setRequired(true);`,
  ];

  if (config.mode === "team") {
    identityItems.push(
      `  form.addListItem().setTitle("내 모둠").setChoiceValues(${scriptValue(teamChoices)}).setRequired(true);`,
      `  form.addListItem().setTitle("평가할 모둠").setChoiceValues(${scriptValue(teamChoices)}).setRequired(true);`,
    );
  } else {
    identityItems.push(
      `  form.addTextItem().setTitle("평가할 친구 이름").setRequired(true);`,
    );
  }

  const questions = config.questions.map(questionScript).join("\n\n");
  const description = [
    config.description,
    "한 명 또는 한 모둠을 평가합니다. 다른 대상을 평가하려면 제출 완료 화면에서 '다른 응답 제출'을 선택하세요.",
    "응답은 선생님의 Google 계정에만 저장됩니다.",
  ].filter(Boolean).join("\n\n");

  return `function createPeerEvaluationForm() {
  const formTitle = ${scriptValue(config.title)};
  const form = FormApp.create(formTitle, true);

  form.setDescription(${scriptValue(description)});
  form.setConfirmationMessage("동료평가 응답을 제출하였습니다.");
  form.setShowLinkToRespondAgain(true);
  form.setLimitOneResponsePerUser(false);
  form.setProgressBar(true);
  form.setShuffleQuestions(false);

  form.addSectionHeaderItem()
    .setTitle("평가자와 평가 대상")
    .setHelpText("본인 정보와 평가할 대상을 정확히 입력하세요.");

${identityItems.join("\n")}

  form.addSectionHeaderItem()
    .setTitle("동료평가 문항")
    .setHelpText("활동에서 직접 본 모습을 기준으로 평가하세요.");

${questions}

  const responseSheet = SpreadsheetApp.create(formTitle + " 응답");
  form.setDestination(FormApp.DestinationType.SPREADSHEET, responseSheet.getId());

  const linkSheet = responseSheet.getSheets()[0];
  linkSheet.setName("링크 안내");
  linkSheet.getRange("A1:B3").setValues([
    ["학생 응답 링크", form.getPublishedUrl()],
    ["교사용 편집 링크", form.getEditUrl()],
    ["응답 스프레드시트", responseSheet.getUrl()],
  ]);
  linkSheet.autoResizeColumns(1, 2);

  console.log("학생 응답 링크: " + form.getPublishedUrl());
  console.log("교사용 편집 링크: " + form.getEditUrl());
  console.log("응답 스프레드시트: " + responseSheet.getUrl());

  return {
    responderUrl: form.getPublishedUrl(),
    editUrl: form.getEditUrl(),
    spreadsheetUrl: responseSheet.getUrl(),
  };
}`;
}
