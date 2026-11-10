import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  agentStages,
  projectBySlug,
  projects,
  type ProjectSlug,
} from "../../showcase-data";
import {
  BeforeAfterComparison,
  ProjectProgress,
  ProjectTimeline,
} from "./project-detail";
import styles from "./project.module.css";

type ProjectPageProps = {
  params: Promise<{ slug: string }>;
};

type ProjectPageStyle = CSSProperties & {
  "--project-accent": string;
  "--project-accent-soft": string;
};

const graspsLabels = [
  ["G", "Goal", "목표", "goal"],
  ["R", "Role", "역할", "role"],
  ["A", "Audience", "청중", "audience"],
  ["S", "Situation", "상황", "situation"],
  ["P", "Product", "산출물", "product"],
  ["S", "Standards", "평가기준", "standards"],
] as const;

function getProject(slug: string) {
  return projectBySlug.get(slug as ProjectSlug);
}

export const dynamicParams = false;

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);

  if (!project) notFound();

  return {
    title: `${project.title} | 마포초 교육력제고 온라인 결과발표회`,
    description: `${project.inquiry} ${project.summary}`,
    openGraph: {
      title: project.title,
      description: project.summary,
    },
  };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = getProject(slug);

  if (!project) notFound();

  const projectIndex = projects.findIndex((item) => item.slug === project.slug);
  const nextProject = projects[(projectIndex + 1) % projects.length];
  const timeline = agentStages.map((stage) => ({
    ...stage,
    moment: project.moments[stage.id],
  }));
  const pageStyle: ProjectPageStyle = {
    "--project-accent": project.accent,
    "--project-accent-soft": project.accentSoft,
  };

  return (
    <main className={styles.root} style={pageStyle}>
      <a className={styles.skipLink} href="#design">
        프로젝트 본문으로 건너뛰기
      </a>

      <header className={styles.hero} aria-labelledby="project-title">
        <div className={styles.heroBackdrop} aria-hidden="true">
          <Image
            src={project.image}
            alt=""
            fill
            priority
            sizes="100vw"
          />
        </div>
        <div className={styles.heroVeil} aria-hidden="true" />
        <div className={styles.heroGrain} aria-hidden="true" />

        <nav className={styles.heroNav} aria-label="프로젝트 전시 이동">
          <Link href="/showcase#projects">
            <span aria-hidden="true">←</span>
            온라인 전시로 돌아가기
          </Link>
          <span>
            PROJECT {String(project.order).padStart(2, "0")} / {String(projects.length).padStart(2, "0")}
          </span>
        </nav>

        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.heroEyebrow}>
              <span>PROJECT {String(project.order).padStart(2, "0")}</span>
              {project.reportPages}
            </p>
            <h1 id="project-title">{project.title}</h1>
            <p className={styles.heroSummary}>{project.summary}</p>

            <div className={styles.heroMeta}>
              <div>
                <span>최종 산출물</span>
                <strong>{project.output}</strong>
              </div>
              <div>
                <span>집중한 주도성</span>
                <strong>{project.focusFactors.join(" · ")}</strong>
              </div>
            </div>
          </div>

          <figure className={styles.heroArtwork}>
            <div className={styles.heroArtworkImage}>
              <Image
                src={project.image}
                alt={`${project.title} 프로젝트 제목 배너`}
                fill
                priority
                sizes="(max-width: 820px) 92vw, 48vw"
              />
            </div>
            <figcaption>
              <span>전시 작품</span>
              {project.output}
            </figcaption>
          </figure>
        </div>

        <ul className={styles.heroMetrics} aria-label="프로젝트 핵심 기록">
          {project.metrics.map((metric, index) => (
            <li key={metric}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {metric}
            </li>
          ))}
        </ul>

        <a className={styles.scrollCue} href="#design">
          <span>전시 읽기</span>
          <i aria-hidden="true" />
        </a>
      </header>

      <ProjectProgress />

      <div className={styles.exhibitionBody}>
        <section id="design" className={styles.section} aria-labelledby="design-title">
          <div className={styles.sectionHeading}>
            <div className={styles.sectionNumber} aria-hidden="true">01</div>
            <div>
              <p className={styles.sectionEyebrow}><span>DESIGN</span> 배움의 무대를 설계하다</p>
              <h2 id="design-title">질문이 방향을 만들고,<br /><em>청중이 배움을 진짜로 만듭니다.</em></h2>
            </div>
            <p>탐구 질문에서 시작해 역할과 청중이 있는 GRASPS 수행과제, 함께 읽을 루브릭까지 한 흐름으로 설계했습니다.</p>
          </div>

          <div className={styles.inquiryGrid}>
            <article className={styles.inquiryCard}>
              <div className={styles.cardLabel}><span>Q</span> 핵심 탐구 질문</div>
              <p>“{project.inquiry}”</p>
            </article>
            <article className={styles.generalizationCard}>
              <div className={styles.cardLabel}><span>G</span> 도달할 일반화</div>
              <p>{project.generalization}</p>
            </article>
          </div>

          <div className={styles.designBlockHeading}>
            <div>
              <span>GRASPS</span>
              <h3>실제적인 수행과제의 여섯 좌표</h3>
            </div>
            <p>학생은 무엇을, 누구의 입장에서, 누구에게 보여 줄지 알고 프로젝트를 시작했습니다.</p>
          </div>

          <dl className={styles.graspsGrid}>
            {graspsLabels.map(([letter, english, korean, key], index) => (
              <div className={styles.graspsCard} key={key}>
                <div className={styles.graspsCardHead}>
                  <span aria-hidden="true">{letter}</span>
                  <div>
                    <small>{english}</small>
                    <dt>{korean}</dt>
                  </div>
                  <i aria-hidden="true">{String(index + 1).padStart(2, "0")}</i>
                </div>
                <dd>{project.grasps[key]}</dd>
              </div>
            ))}
          </dl>

          <div className={styles.rubricBlock}>
            <div className={styles.rubricIntro}>
              <span>SHARED CRITERIA</span>
              <h3>고치기 전에,<br />잘된다는 뜻부터 함께 읽었습니다.</h3>
              <p>루브릭은 마지막 점수를 위한 표가 아니라 초안, 피드백, 수정의 방향을 잇는 공통 언어였습니다.</p>
              <div>
                <small>평가할 산출물</small>
                <strong>{project.output}</strong>
              </div>
            </div>
            <ol className={styles.rubricList}>
              {project.rubric.map((criterion, index) => (
                <li key={criterion}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{criterion}</strong>
                  <i aria-hidden="true" />
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="flow" className={`${styles.section} ${styles.flowSection}`} aria-labelledby="flow-title">
          <div className={styles.sectionHeading}>
            <div className={styles.sectionNumber} aria-hidden="true">02</div>
            <div>
              <p className={styles.sectionEyebrow}><span>FLOW</span> 수업의 흐름을 따라가다</p>
              <h2 id="flow-title">A에서 T까지,<br /><em>한 장면도 건너뛰지 않은 성장.</em></h2>
            </div>
            <p>각 단계를 누르면 보고서에 기록된 이 프로젝트의 수업 장면을 자세히 볼 수 있습니다.</p>
          </div>

          <ProjectTimeline
            projectTitle={project.title}
            projectSlug={project.slug}
            stages={timeline}
          />

          <div className={styles.flowNote}>
            <span aria-hidden="true">A → G → E → N → T</span>
            <p><strong>AI는 E에서 평가 초안을 제안하지만,</strong> 학생의 판단은 N에서 시작되고 T의 실제 변화로 증명됩니다.</p>
          </div>
        </section>

        <section id="change" className={styles.section} aria-labelledby="change-title">
          <div className={styles.sectionHeading}>
            <div className={styles.sectionNumber} aria-hidden="true">03</div>
            <div>
              <p className={styles.sectionEyebrow}><span>CHANGE</span> 수정의 증거를 발견하다</p>
              <h2 id="change-title">피드백은 문장이 아니라,<br /><em>다음 행동으로 남았습니다.</em></h2>
            </div>
            <p>슬라이더로 첫 설명과 최종 설명을 비교하고, 어떤 피드백이 어떤 수정으로 이어졌는지 확인해 보세요.</p>
          </div>

          <BeforeAfterComparison
            before={project.beforeAfter.before}
            after={project.beforeAfter.after}
          />

          <div className={styles.feedbackHeading}>
            <div>
              <span>FEEDBACK → REVISION</span>
              <h3>말을 들은 흔적이 아니라<br />판단하고 고친 흔적</h3>
            </div>
            <p>AI와 교사의 제안을 그대로 옮기지 않고, 탐구 증거와 평가기준에 맞는지 판단한 뒤 수정했습니다.</p>
          </div>

          <ol className={styles.feedbackMatches}>
            {project.feedbackMatches.map((match, index) => (
              <li key={`${match.feedback}-${index}`}>
                <article>
                  <span>피드백 {String(index + 1).padStart(2, "0")}</span>
                  <p>{match.feedback}</p>
                </article>
                <div className={styles.revisionArrow} aria-hidden="true">
                  <span>판단</span>
                  <i>→</i>
                </div>
                <article>
                  <span>수정의 증거</span>
                  <p>{match.revision}</p>
                </article>
              </li>
            ))}
          </ol>

          <blockquote className={styles.reflectionQuote}>
            <span aria-hidden="true">“</span>
            <p>{project.reflection}</p>
            <footer>
              <i aria-hidden="true" />
              프로젝트에 참여한 학생의 성찰
            </footer>
          </blockquote>
        </section>

        <section id="output" className={styles.outputGallery} aria-labelledby="output-title">
          <div className={styles.outputCopy}>
            <p className={styles.sectionEyebrow}><span>OUTPUT GALLERY</span> 배움이 작품이 된 순간</p>
            <h2 id="output-title">{project.output}</h2>
            <p>{project.summary}</p>
            <ul>
              {project.focusFactors.map((factor) => <li key={factor}>{factor}</li>)}
            </ul>
          </div>
          <div className={styles.outputEvidence}>
            <div className={styles.outputEvidenceTopline}>
              <span>OUTPUT · {String(project.order).padStart(2, "0")}</span>
              <p>실제 학생 자료 · 공개용 익명 발췌</p>
            </div>

            <div className={styles.evidenceGrid}>
              {project.evidence.map((item, index) => item.kind === "image" && item.image ? (
                <figure className={styles.evidenceFigure} key={`${item.title}-${index}`}>
                  <a
                    className={styles.evidenceImage}
                    href={item.image}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${item.title} 크게 보기, 새 탭에서 열림`}
                  >
                    <Image
                      src={item.image}
                      alt={item.alt ?? ""}
                      fill
                      sizes="(max-width: 820px) 92vw, 34vw"
                    />
                    <span>크게 보기 ↗</span>
                  </a>
                  <figcaption>
                    <span>{item.label}</span>
                    <strong>{item.title}</strong>
                    <p>{item.caption}</p>
                  </figcaption>
                </figure>
              ) : (
                <article className={styles.evidenceExcerpt} key={`${item.title}-${index}`}>
                  <span>{item.label}</span>
                  <h3>{item.title}</h3>
                  <blockquote>“{item.quote}”</blockquote>
                  <p>{item.caption}</p>
                </article>
              ))}
            </div>

            <p className={styles.privacyNote}>
              학생 이름·학번·계정·얼굴이 보이는 부분은 게시하지 않았습니다. 개인을 특정할 수 없는 문장과 화면만 선별했습니다.
            </p>
          </div>
        </section>

        <footer className={styles.closingCta}>
          <div>
            <span>EXHIBITION CONTINUES</span>
            <h2>다섯 프로젝트는<br />서로 다른 질문으로 이어집니다.</h2>
          </div>
          <div className={styles.closingActions}>
            <Link className={styles.backButton} href="/showcase#projects">
              <span aria-hidden="true">←</span>
              프로젝트 목록으로 돌아가기
            </Link>
            <Link className={styles.nextButton} href={`/showcase/projects/${nextProject.slug}`}>
              <span>
                다음 프로젝트
                <strong>{nextProject.shortTitle}</strong>
              </span>
              <i aria-hidden="true">→</i>
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
