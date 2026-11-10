"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

import type { AgentStageId } from "../../showcase-data";
import styles from "./project.module.css";

const progressSteps = [
  { id: "design", number: "01", label: "설계" },
  { id: "flow", number: "02", label: "흐름" },
  { id: "change", number: "03", label: "변화" },
] as const;

type StageItem = {
  id: AgentStageId;
  code: string;
  letter: "A" | "G" | "E" | "N" | "T";
  label: string;
  description: string;
  moment: string;
};

type TimelineProps = {
  projectTitle: string;
  projectSlug: string;
  stages: StageItem[];
};

type ComparisonProps = {
  before: string;
  after: string;
};

type ProgressStyle = CSSProperties & {
  "--progress-width": string;
};

type ComparisonStyle = CSSProperties & {
  "--after-share": string;
};

export function ProjectProgress() {
  const [activeSection, setActiveSection] = useState<(typeof progressSteps)[number]["id"]>("design");

  useEffect(() => {
    const sections = progressSteps
      .map((step) => document.getElementById(step.id))
      .filter((section): section is HTMLElement => Boolean(section));

    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible) {
          setActiveSection(visible.target.id as (typeof progressSteps)[number]["id"]);
        }
      },
      { rootMargin: "-18% 0px -58% 0px", threshold: [0, 0.1, 0.35, 0.7] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const activeIndex = progressSteps.findIndex((step) => step.id === activeSection);
  const progressStyle: ProgressStyle = {
    "--progress-width": `${activeIndex * 33.333}%`,
  };

  return (
    <nav className={styles.progressNav} aria-label="프로젝트 상세 전시 단계" style={progressStyle}>
      <div className={styles.progressInner}>
        <span className={styles.progressTitle}>PROJECT VIEW</span>
        <ol className={styles.progressList}>
          {progressSteps.map((step) => {
            const isActive = step.id === activeSection;
            return (
              <li key={step.id} className={isActive ? styles.progressItemActive : styles.progressItem}>
                <a href={`#${step.id}`} aria-current={isActive ? "step" : undefined}>
                  <span>{step.number}</span>
                  <strong>{step.label}</strong>
                </a>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}

export function ProjectTimeline({ projectTitle, projectSlug, stages }: TimelineProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedStage, setSelectedStage] = useState(stages[0]);
  const dialogTitleId = `${projectSlug}-stage-title`;
  const dialogDescriptionId = `${projectSlug}-stage-description`;

  const openStage = (stage: StageItem) => {
    setSelectedStage(stage);
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  };

  useEffect(() => {
    const stageId = window.location.hash.replace("#stage-", "") as AgentStageId;
    const linkedStage = stages.find((stage) => stage.id === stageId);
    if (!linkedStage) return;

    const timer = window.setTimeout(() => {
      setSelectedStage(linkedStage);
      window.requestAnimationFrame(() => {
        const dialog = dialogRef.current;
        if (dialog && !dialog.open) dialog.showModal();
      });
    }, 260);

    return () => window.clearTimeout(timer);
  }, [stages]);

  return (
    <div className={styles.timelineExperience}>
      <div className={styles.timelineGuide}>
        <p><span aria-hidden="true">↘</span> 원을 눌러 수업 장면을 여세요.</p>
        <div aria-hidden="true">
          <span>A · Activate</span>
          <span>G · GRASPS</span>
          <span>E · Evaluate</span>
          <span>N · Navigate</span>
          <span>T · Transform</span>
        </div>
      </div>

      <ol className={styles.timelineList} aria-label={`${projectTitle} AGENT 수업 흐름`}>
        {stages.map((stage, index) => (
          <li id={`stage-${stage.id}`} key={stage.id} data-letter={stage.letter}>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-controls={`${projectSlug}-stage-dialog`}
              onClick={() => openStage(stage)}
            >
              <span className={styles.timelineIndex}>{String(index + 1).padStart(2, "0")}</span>
              <span className={styles.timelineCode}>{stage.code}</span>
              <span className={styles.timelineLabel}>{stage.label}</span>
              <span className={styles.timelineOpen} aria-hidden="true">＋</span>
            </button>
          </li>
        ))}
      </ol>

      <dialog
        ref={dialogRef}
        id={`${projectSlug}-stage-dialog`}
        className={styles.stageDialog}
        aria-labelledby={dialogTitleId}
        aria-describedby={dialogDescriptionId}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className={styles.stageDialogPanel}>
          <div className={styles.stageDialogTopline}>
            <span>{selectedStage.code} · {selectedStage.letter === "A" ? "Activate" : selectedStage.label}</span>
            <form method="dialog">
              <button type="submit" aria-label="수업 장면 닫기">닫기 <i aria-hidden="true">×</i></button>
            </form>
          </div>
          <div className={styles.stageDialogBody}>
            <span className={styles.stageDialogGhost} aria-hidden="true">{selectedStage.letter}</span>
            <p className={styles.stageDialogProject}>{projectTitle}</p>
            <h3 id={dialogTitleId}>{selectedStage.label}</h3>
            <p id={dialogDescriptionId} className={styles.stageMoment}>{selectedStage.moment}</p>
            <div className={styles.stageDefinition}>
              <span>이 단계의 의미</span>
              <p>{selectedStage.description}</p>
            </div>
          </div>
          <div className={styles.stageDialogFooter}>
            <span>REPORT-GROUNDED SCENE</span>
            <strong>{selectedStage.code}</strong>
          </div>
        </div>
      </dialog>
    </div>
  );
}

export function BeforeAfterComparison({ before, after }: ComparisonProps) {
  const [afterShare, setAfterShare] = useState(50);
  const comparisonStyle: ComparisonStyle = { "--after-share": `${afterShare}%` };
  const valueText = afterShare === 0
    ? "수정 전만 보기"
    : afterShare === 100
      ? "수정 후만 보기"
      : `수정 후 ${afterShare}퍼센트, 수정 전 ${100 - afterShare}퍼센트`;

  return (
    <div className={styles.comparison}>
      <div className={styles.comparisonTopline}>
        <span>BEFORE</span>
        <p>설명의 변화</p>
        <span>AFTER</span>
      </div>

      <div
        className={styles.comparisonViewport}
        style={comparisonStyle}
        role="group"
        aria-label="수정 전과 수정 후 설명 비교"
      >
        <article className={styles.beforeLayer}>
          <div>
            <span>수정 전</span>
            <small>FIRST DRAFT</small>
          </div>
          <p>{before}</p>
        </article>
        <article className={styles.afterLayer}>
          <div>
            <span>수정 후</span>
            <small>FINAL REVISION</small>
          </div>
          <p>{after}</p>
        </article>
        <span className={styles.comparisonDivider} aria-hidden="true">
          <i>↔</i>
        </span>
      </div>

      <div className={styles.comparisonControls}>
        <button type="button" onClick={() => setAfterShare(0)}>수정 전</button>
        <label>
          <span className={styles.visuallyHidden}>수정 전과 수정 후 표시 비율</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={afterShare}
            aria-valuetext={valueText}
            onChange={(event) => setAfterShare(Number(event.target.value))}
          />
        </label>
        <button type="button" onClick={() => setAfterShare(100)}>수정 후</button>
      </div>
      <p className={styles.comparisonHint}>슬라이더는 방향키로도 움직일 수 있습니다.</p>
    </div>
  );
}
