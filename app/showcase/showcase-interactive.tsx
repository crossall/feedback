"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw, Sparkles, X } from "lucide-react";

import { agentOverview } from "./showcase-data";
import styles from "./content.module.css";

const tourSteps = [
  { id: "overview", label: "연구 한눈에 보기" },
  { id: "foundation", label: "기반 조성" },
  { id: "projects", label: "5개 프로젝트" },
  { id: "effects", label: "효과와 일반화" },
  { id: "experience", label: "AI 피드백 체험" },
  { id: "guestbook", label: "질문 남기기" },
];

export function GuidedTour() {
  const [activeStep, setActiveStep] = useState<number | null>(null);

  useEffect(() => {
    if (activeStep === null) return;
    const target = document.getElementById(tourSteps[activeStep].id);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeStep]);

  const start = () => setActiveStep(0);
  const close = () => setActiveStep(null);
  const next = () => {
    if (activeStep === null) return;
    if (activeStep === tourSteps.length - 1) close();
    else setActiveStep(activeStep + 1);
  };
  const previous = () => {
    if (activeStep === null || activeStep === 0) return;
    setActiveStep(activeStep - 1);
  };

  return (
    <>
      <button className={styles.tourStart} type="button" onClick={start}>
        <Sparkles aria-hidden="true" size={18} />
        10분 투어 시작
        <ArrowRight aria-hidden="true" size={18} />
      </button>

      {activeStep !== null ? (
        <aside className={styles.tourDock} aria-label="10분 전시 투어">
          <div className={styles.tourProgress} aria-hidden="true">
            <span style={{ width: `${((activeStep + 1) / tourSteps.length) * 100}%` }} />
          </div>
          <div className={styles.tourDockCopy}>
            <span>
              {String(activeStep + 1).padStart(2, "0")} / {String(tourSteps.length).padStart(2, "0")}
            </span>
            <strong>{tourSteps[activeStep].label}</strong>
          </div>
          <div className={styles.tourControls}>
            <button type="button" onClick={previous} disabled={activeStep === 0} aria-label="이전 전시">
              <ArrowLeft aria-hidden="true" size={17} />
            </button>
            <button type="button" onClick={next} aria-label={activeStep === tourSteps.length - 1 ? "투어 마치기" : "다음 전시"}>
              {activeStep === tourSteps.length - 1 ? <Check aria-hidden="true" size={17} /> : <ArrowRight aria-hidden="true" size={17} />}
            </button>
            <button type="button" onClick={close} aria-label="투어 닫기">
              <X aria-hidden="true" size={17} />
            </button>
          </div>
        </aside>
      ) : null}
    </>
  );
}

export function AgentProgram() {
  const [active, setActive] = useState<(typeof agentOverview)[number]["letter"]>("A");
  const selected = agentOverview.find((stage) => stage.letter === active) ?? agentOverview[0];

  return (
    <div className={styles.agentProgram}>
      <div className={styles.agentRail} role="tablist" aria-label="AGENT 프로그램 단계">
        {agentOverview.map((stage, index) => (
          <div className={styles.agentRailItem} key={stage.letter}>
            <button
              className={stage.letter === active ? styles.agentButtonActive : styles.agentButton}
              type="button"
              role="tab"
              aria-selected={stage.letter === active}
              aria-controls="agent-stage-panel"
              onClick={() => setActive(stage.letter)}
            >
              <span>{stage.letter}</span>
              <small>{stage.word}</small>
            </button>
            {index < agentOverview.length - 1 ? <span className={styles.agentConnector} aria-hidden="true" /> : null}
          </div>
        ))}
      </div>

      <div id="agent-stage-panel" className={styles.agentPanel} role="tabpanel">
        <span className={styles.agentGhost} aria-hidden="true">{selected.letter}</span>
        <div>
          <p className={styles.agentKicker}>{selected.word}</p>
          <h3>{selected.title}</h3>
          <p>{selected.description}</p>
        </div>
        <Link href={`/showcase/projects/${selected.scene}#stage-${selected.stage}`}>
          이 단계의 프로젝트 장면 보기
          <ArrowRight aria-hidden="true" size={17} />
        </Link>
      </div>
    </div>
  );
}

type Choice = "reflect" | "reject";

const feedbackItems = [
  {
    id: "energy-chain",
    text: "‘남중 고도가 높다’ 다음에 빛이 좁은 면적에 모이고, 받는 에너지가 많아져 기온이 오른다는 설명을 덧붙이세요.",
    answer: "reflect" as Choice,
    explanation: "실험으로 확인한 에너지–기온의 인과관계를 완성하는 타당한 피드백입니다.",
  },
  {
    id: "distance",
    text: "여름은 지구가 태양에 가까워지는 계절이므로 ‘태양과의 거리 때문에 덥다’고 고치세요.",
    answer: "reject" as Choice,
    explanation: "호주와 한국의 계절이 반대인 사실을 설명하지 못하는 대표적인 거리 오개념입니다.",
  },
  {
    id: "southern",
    text: "한국이 겨울일 때 호주는 여름이라는 반례를 넣어 거리 설명이 왜 맞지 않는지 보여 주세요.",
    answer: "reflect" as Choice,
    explanation: "남반구 반례는 거리 오개념을 검토하는 강력한 과학적 근거입니다.",
  },
  {
    id: "rotation",
    text: "여름에는 지구의 자전 속도가 빨라져 햇빛을 더 많이 받는다고 설명하세요.",
    answer: "reject" as Choice,
    explanation: "계절의 원인을 자전 속도와 연결할 수 없습니다. 자전축 기울기와 남중 고도가 핵심입니다.",
  },
  {
    id: "australia-distance",
    text: "호주는 한국보다 태양에서 더 멀리 있기 때문에 12월에 계절이 다르다고 덧붙이세요.",
    answer: "reject" as Choice,
    explanation: "두 지역의 계절 차이는 지구–태양 거리 차이가 아니라 기울어진 자전축과 공전 위치로 설명합니다.",
  },
];

export function ExperienceQuiz() {
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [submitted, setSubmitted] = useState(false);
  const complete = Object.keys(choices).length === feedbackItems.length;
  const score = useMemo(
    () => feedbackItems.filter((item) => choices[item.id] === item.answer).length,
    [choices],
  );
  const percentage = Math.round((score / feedbackItems.length) * 100);

  const reset = () => {
    setChoices({});
    setSubmitted(false);
  };

  return (
    <div className={styles.experienceGrid}>
      <aside className={styles.scriptCard}>
        <span>6학년 모둠의 첫 대본</span>
        <h3>“계절은 왜 바뀔까?”</h3>
        <blockquote>
          여름에는 태양의 남중 고도가 높습니다. 그래서 햇빛이 더 강합니다. 여름에는 지구가 태양과 가까워지고, 겨울에는 멀어져서 기온이 달라집니다.
        </blockquote>
        <p>AI가 준 5개의 피드백 중에는 과학적 오류가 3개 섞여 있습니다. 실험 증거에 비추어 반영할지 판단해 보세요.</p>
      </aside>

      <form
        className={styles.quizForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (complete) setSubmitted(true);
        }}
      >
        <div className={styles.quizList}>
          {feedbackItems.map((item, index) => {
            const isCorrect = choices[item.id] === item.answer;
            return (
              <fieldset className={styles.feedbackItem} key={item.id}>
                <legend className={styles.feedbackLegend}>
                  {String(index + 1).padStart(2, "0")}. {item.text}
                </legend>
                <div className={styles.feedbackQuestion} aria-hidden="true">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item.text}</strong>
                </div>
                <div className={styles.choiceRow}>
                  <label>
                    <input
                      type="radio"
                      name={item.id}
                      value="reflect"
                      checked={choices[item.id] === "reflect"}
                      disabled={submitted}
                      onChange={() => setChoices((current) => ({ ...current, [item.id]: "reflect" }))}
                    />
                    반영하기
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={item.id}
                      value="reject"
                      checked={choices[item.id] === "reject"}
                      disabled={submitted}
                      onChange={() => setChoices((current) => ({ ...current, [item.id]: "reject" }))}
                    />
                    반영하지 않기
                  </label>
                </div>
                {submitted ? (
                  <div className={isCorrect ? styles.answerCorrect : styles.answerWrong}>
                    {isCorrect ? <Check aria-hidden="true" size={17} /> : <X aria-hidden="true" size={17} />}
                    <span>
                      <strong>{isCorrect ? "정확한 판단" : `정답: ${item.answer === "reflect" ? "반영하기" : "반영하지 않기"}`}</strong>
                      {item.explanation}
                    </span>
                  </div>
                ) : null}
              </fieldset>
            );
          })}
        </div>

        {submitted ? (
          <div className={styles.quizResult} aria-live="polite">
            <div>
              <span>나의 판별률</span>
              <strong>{percentage}%</strong>
            </div>
            <p>
              4차 프로젝트 당시 6학년 학생들의 오류 피드백 판별률은 <b>73%</b>였습니다. 같은 판단을 한 번 더 연습한 5차 프로젝트에서는 <b>86%</b>까지 높아졌습니다.
            </p>
            <button type="button" onClick={reset}>
              <RotateCcw aria-hidden="true" size={17} />
              다시 도전
            </button>
          </div>
        ) : (
          <button className={styles.quizSubmit} type="submit" disabled={!complete}>
            {complete ? "판단 제출하고 정답 보기" : `${feedbackItems.length - Object.keys(choices).length}개를 더 판단해 주세요`}
            <ArrowRight aria-hidden="true" size={18} />
          </button>
        )}
      </form>
    </div>
  );
}
