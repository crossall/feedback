import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Bot,
  CalendarDays,
  CirclePlay,
  Download,
  ExternalLink,
  FileCheck2,
  FlaskConical,
  Leaf,
  Play,
  QrCode,
  School,
  Sparkles,
  UsersRound,
} from "lucide-react";

import contentStyles from "./content.module.css";
import {
  agencyFactors,
  developmentTimeline,
  openLessons,
  outcomeHighlights,
  projects,
} from "./showcase-data";
import { AgentProgram, ExperienceQuiz, GuidedTour } from "./showcase-interactive";
import { ShowcaseGuestbook } from "./showcase-guestbook";
import styles from "./showcase.module.css";

export const metadata: Metadata = {
  title: "2026 마포초등학교 교육력제고 온라인 결과발표회",
  description: "협력적 주도성을 깨우는 AI 과정중심평가 A.G.E.N.T. 프로그램 온라인 결과발표회",
};

const resources = [
  {
    title: "GRASPS 설계 템플릿",
    description: "목표·역할·청중·상황·산출물·평가기준을 한 장에 설계합니다.",
    href: "/showcase/resources/grasps-template.html",
    type: "설계",
  },
  {
    title: "프로젝트 루브릭 틀",
    description: "과학적 정확성부터 독자 관점까지 수행수준을 함께 만듭니다.",
    href: "/showcase/resources/rubric-template.html",
    type: "평가",
  },
  {
    title: "AI 피드백 검토지",
    description: "AI 제안을 반영·미반영하고 그 판단 근거를 기록합니다.",
    href: "/showcase/resources/ai-feedback-review.html",
    type: "검토",
  },
  {
    title: "교사용 피드백 프롬프트",
    description: "루브릭 기반 피드포워드를 만들고 교사가 재검토하는 틀입니다.",
    href: "/showcase/resources/prompt-guide.html",
    type: "AI",
  },
  {
    title: "탐구·성찰 학습지",
    description: "질문, 증거, 수정, 다음 행동을 한 흐름으로 기록합니다.",
    href: "/showcase/resources/project-worksheet.html",
    type: "수업",
  },
];

export default function ShowcasePage() {
  return (
    <main className={styles.root}>
      <section className={styles.hero} aria-labelledby="showcase-title">
        <div className={styles.atmosphere} aria-hidden="true">
          <span className={styles.glowTop} />
          <span className={styles.glowBottom} />
          <span className={styles.lightDoor} />
          <span className={styles.floorLine} />
        </div>

        <div className={styles.constellation} aria-hidden="true">
          {Array.from({ length: 10 }, (_, index) => <span key={index} />)}
        </div>

        <div className={styles.exhibition} aria-hidden="true">
          <div className={`${styles.orbit} ${styles.orbitOuter}`}><span /></div>
          <div className={`${styles.orbit} ${styles.orbitMiddle}`}><span /></div>
          <div className={`${styles.orbit} ${styles.orbitInner}`}><span /></div>
          <div className={styles.portal} />
          {[styles.cardOne, styles.cardTwo, styles.cardThree, styles.cardFour].map((cardClass) => (
            <div className={`${styles.exhibitCard} ${cardClass}`} key={cardClass}>
              <i /><i /><i />
            </div>
          ))}
        </div>

        <section className={styles.titleStage}>
          <h1 id="showcase-title" className={styles.title}>
            <span className={styles.prelude}>2026 마포초등학교</span>
            <span className={styles.headline}>교육력제고</span>
            <span className={styles.subheadline}>온라인 결과발표회</span>
          </h1>
          <a className={styles.enterButton} href="#overview">
            전시 입장하기
            <ArrowDown aria-hidden="true" size={17} />
          </a>
        </section>

        <div className={styles.frame} aria-hidden="true">
          <span className={styles.cornerTopLeft} />
          <span className={styles.cornerTopRight} />
          <span className={styles.cornerBottomLeft} />
          <span className={styles.cornerBottomRight} />
        </div>

        <div className={styles.curtain} aria-hidden="true"><span /><span /></div>
      </section>

      <div className={contentStyles.exhibitionBody}>
        <nav className={contentStyles.siteNav} aria-label="결과발표회 전시 메뉴">
          <a className={contentStyles.brand} href="#overview" aria-label="전시 홈으로 이동">
            <span>AGENT</span>
            <small>MAPO 2026</small>
          </a>
          <div className={contentStyles.navLinks}>
            <a href="#foundation">기반 조성</a>
            <a href="#projects">프로그램 적용</a>
            <a href="#effects">효과</a>
            <a href="#experience">체험관</a>
            <a href="#resources">자료실</a>
          </div>
          <a className={contentStyles.navTour} href="#experience">직접 체험</a>
        </nav>

        <section id="overview" className={`${contentStyles.section} ${contentStyles.overviewSection}`}>
          <div className={contentStyles.sectionHeading}>
            <p className={contentStyles.eyebrow}><span>HOME</span> 연구 한눈에 보기</p>
            <h2>아이들은 AI의 답을 따르지 않고,<br />근거를 찾아 <em>다시 씁니다.</em></h2>
            <p className={contentStyles.lead}>
              탐구 질문 기반 GRASPS 수행과제와 생성형 AI 피드포워드를 연계해
              초등 6학년 과학 수업에서 협력적 주도성을 기르는 AI 과정중심평가 프로그램입니다.
            </p>
            <GuidedTour />
          </div>

          <div className={contentStyles.agentIntro}>
            <div>
              <span className={contentStyles.label}>A.G.E.N.T. PROGRAM</span>
              <h3>질문에서 시작해<br />성장으로 전환하는 다섯 글자</h3>
            </div>
            <p>글자를 눌러 단계의 의미를 살펴보고 실제 프로젝트 장면으로 이동해 보세요.</p>
          </div>
          <AgentProgram />
        </section>

        <section id="foundation" className={`${contentStyles.section} ${contentStyles.foundationSection}`}>
          <div className={contentStyles.chapterHeading}>
            <div className={contentStyles.chapterNumber}>I</div>
            <div>
              <p className={contentStyles.eyebrow}><span>실행목표 1</span> 기반 조성</p>
              <h2>AI보다 먼저 설계한 것은<br /><em>배움의 관계</em>였습니다.</h2>
            </div>
            <p>학생·동료·교사·AI가 서로의 판단을 대신하지 않고 더 나은 판단을 돕는 평가 환경을 만들었습니다.</p>
          </div>

          <div className={contentStyles.researchDesign}>
            <article>
              <span>01</span><FlaskConical aria-hidden="true" />
              <h3>탐구 질문</h3>
              <p>삶과 연결된 ‘왜?’가 프로젝트의 방향과 학생의 목표를 세웁니다.</p>
            </article>
            <span className={contentStyles.designArrow} aria-hidden="true">→</span>
            <article>
              <span>02</span><UsersRound aria-hidden="true" />
              <h3>실제적 수행</h3>
              <p>GRASPS로 역할과 청중이 있는 산출물을 함께 만들고 평가합니다.</p>
            </article>
            <span className={contentStyles.designArrow} aria-hidden="true">→</span>
            <article>
              <span>03</span><Bot aria-hidden="true" />
              <h3>하이브리드 피드백</h3>
              <p>AI의 평가 초안을 교사가 검토하고 학생은 다시 판단해 수정합니다.</p>
            </article>
          </div>

          <div className={contentStyles.factorBlock}>
            <div className={contentStyles.factorCopy}>
              <span className={contentStyles.label}>COLLABORATIVE AGENCY</span>
              <h3>협력적 주도성을 이루는<br />다섯 가지 힘</h3>
              <p>혼자 앞서가는 능력이 아니라, 사람과 도구 사이에서 목표·행동·관계를 조정하며 함께 성장하는 힘입니다.</p>
            </div>
            <div className={contentStyles.factorWheel} aria-label="협력적 주도성 5요인">
              <div className={contentStyles.factorCenter} aria-hidden="true"><span>함께</span><strong>주도하기</strong></div>
              {agencyFactors.map((factor, index) => (
                <article className={contentStyles[`factor${index + 1}`]} key={factor.name}>
                  <span>0{index + 1}</span>
                  <strong>{factor.name}</strong>
                  <small>{factor.description}</small>
                </article>
              ))}
            </div>
          </div>

          <div className={contentStyles.platformBlock}>
            <div className={contentStyles.platformIntro}>
              <span className={contentStyles.label}>MADE IN THE CLASSROOM</span>
              <h3>수업의 불편에서 시작된<br /><b>feedforward.kr</b></h3>
              <p>처음부터 완성된 도구를 가져와 수업한 것은 아닙니다. 다섯 번의 프로젝트를 거치며 필요한 기능을 하나씩 플랫폼으로 만들었습니다.</p>
              <Link className={contentStyles.platformButton} href="/project_expo" target="_blank" rel="noreferrer">
                익명 체험 모드 열기
                <ExternalLink aria-hidden="true" size={17} />
              </Link>
            </div>
            <ol className={contentStyles.developmentTimeline}>
              {developmentTimeline.map((item) => (
                <li key={item.phase}>
                  <span>{item.phase}</span>
                  <div><small>{item.period}</small><h4>{item.title}</h4><p>{item.description}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="projects" className={`${contentStyles.section} ${contentStyles.projectsSection}`}>
          <div className={contentStyles.chapterHeading}>
            <div className={contentStyles.chapterNumber}>II</div>
            <div>
              <p className={contentStyles.eyebrow}><span>실행목표 2</span> 프로그램 적용</p>
              <h2>다섯 번의 프로젝트,<br /><em>다섯 번의 성장 증거</em></h2>
            </div>
            <p>카드를 열면 설계·흐름·변화의 3단 전시가 시작됩니다. 각 AGENT 단계를 눌러 수업의 순간도 살펴볼 수 있습니다.</p>
          </div>

          <div className={contentStyles.projectGrid}>
            {projects.map((project) => (
              <Link
                className={contentStyles.projectCard}
                href={`/showcase/projects/${project.slug}`}
                key={project.slug}
                style={{ "--accent": project.accent, "--accent-soft": project.accentSoft } as CSSProperties}
              >
                <div className={contentStyles.projectImage}>
                  <Image src={project.image} alt="" fill sizes="(max-width: 760px) 100vw, 50vw" />
                  <span>PROJECT {String(project.order).padStart(2, "0")}</span>
                </div>
                <div className={contentStyles.projectCardBody}>
                  <div className={contentStyles.projectMeta}>
                    {project.focusFactors.map((factor) => <span key={factor}>{factor}</span>)}
                  </div>
                  <h3>{project.title}</h3>
                  <p>{project.summary}</p>
                  <div className={contentStyles.projectOutput}>
                    <small>최종 산출물</small><strong>{project.output}</strong>
                    <ArrowRight aria-hidden="true" size={18} />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className={contentStyles.galleryStrip}>
            <div>
              <CirclePlay aria-hidden="true" />
              <span>OUTPUT GALLERY</span>
              <strong>배움이 작품이 된 순간</strong>
            </div>
            <ul>
              {projects.map((project) => (
                <li key={project.slug}>
                  <Link href={`/showcase/projects/${project.slug}#output`}>
                    <span>0{project.order}</span>{project.output}<ArrowRight aria-hidden="true" size={14} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="effects" className={`${contentStyles.section} ${contentStyles.effectsSection}`}>
          <div className={contentStyles.chapterHeading}>
            <div className={contentStyles.chapterNumber}>III</div>
            <div>
              <p className={contentStyles.eyebrow}><span>실행목표 3</span> 효과와 일반화</p>
              <h2>변화는 느낌이 아니라<br /><em>기록으로 남았습니다.</em></h2>
            </div>
            <p>105명의 사전·사후 자료, 모둠 산출물, AI 피드백 판단 기록을 함께 읽었습니다.</p>
          </div>

          <div className={contentStyles.outcomeGrid}>
            {outcomeHighlights.map((item, index) => (
              <article key={item.label}>
                <span>0{index + 1}</span>
                <strong>{item.value}</strong>
                <h3>{item.label}</h3>
                <p>{item.note}</p>
              </article>
            ))}
          </div>

          <div className={contentStyles.dashboardBlock}>
            <div className={contentStyles.dashboardIntro}>
              <span className={contentStyles.label}>DATA DASHBOARD</span>
              <h3>협력적 주도성<br />다섯 요인의 변화</h3>
              <p>5점 척도 · 마포초 6학년 5개 학급 105명</p>
              <div className={contentStyles.chartLegend}><span>사전</span><span>사후</span></div>
            </div>
            <div className={contentStyles.factorChart} role="group" aria-label="협력적 주도성 5요인의 사전 사후 평균 비교">
              {agencyFactors.map((factor) => (
                <div className={contentStyles.factorRow} key={factor.name} aria-label={`${factor.name}: 사전 ${factor.pre.toFixed(2)}, 사후 ${factor.post.toFixed(2)}`}>
                  <strong>{factor.name}</strong>
                  <div>
                    <span className={contentStyles.preBar} style={{ width: `${factor.pre * 20}%` }}><i>{factor.pre.toFixed(2)}</i></span>
                    <span className={contentStyles.postBar} style={{ width: `${factor.post * 20}%` }}><i>{factor.post.toFixed(2)}</i></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={contentStyles.lessonHeading}>
            <div><CalendarDays aria-hidden="true" /><span className={contentStyles.label}>OPEN CLASS</span></div>
            <h3>공개수업 세 장면</h3>
            <p>영상 주소를 연결하기 전에도 수업 초점과 협의 내용을 먼저 살펴볼 수 있습니다.</p>
          </div>
          <div className={contentStyles.lessonGrid}>
            {openLessons.map((lesson, index) => (
              <article key={lesson.date}>
                <div className={contentStyles.videoPlaceholder}>
                  <span>{lesson.date}</span>
                  <div><Play aria-hidden="true" fill="currentColor" /><small>영상 연결 대기</small></div>
                  <b>{lesson.focus}</b>
                </div>
                <div>
                  <small>공개수업 0{index + 1}</small>
                  <h4>{lesson.title}</h4>
                  <p><strong>협의 요약</strong>{lesson.summary}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="experience" className={`${contentStyles.section} ${contentStyles.experienceSection}`}>
          <div className={contentStyles.experienceHeading}>
            <div className={contentStyles.experimentMark}><Sparkles aria-hidden="true" /></div>
            <p className={contentStyles.eyebrow}><span>EXPERIENCE</span> 당신도 AI 피드백을 검토해 보세요</p>
            <h2>AI가 말했으니<br />정답일까요?</h2>
            <p>6학년 학생들이 실제로 마주한 방식처럼 맞는 피드백 2개와 오류 피드백 3개를 가려 보세요.</p>
          </div>
          <ExperienceQuiz />
        </section>

        <section id="resources" className={`${contentStyles.section} ${contentStyles.resourcesSection}`}>
          <div className={contentStyles.resourcesHeading}>
            <div>
              <p className={contentStyles.eyebrow}><span>TEACHER KIT</span> 교사용 자료실</p>
              <h2>우리 교실에서<br />바로 시작해 보세요.</h2>
            </div>
            <p>학생 개인정보 없이 새로 정리한 인쇄용 템플릿입니다. 내려받은 HTML 파일을 브라우저에서 열어 바로 인쇄할 수 있습니다.</p>
          </div>
          <div className={contentStyles.resourceList}>
            {resources.map((resource, index) => (
              <a href={resource.href} download key={resource.href}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><small>{resource.type}</small><h3>{resource.title}</h3><p>{resource.description}</p></div>
                <Download aria-hidden="true" />
              </a>
            ))}
          </div>
          <div className={contentStyles.resourceNote}>
            <FileCheck2 aria-hidden="true" />
            <p><strong>개인정보 보호 원칙</strong>이름·학번·계정·얼굴·개별 점수는 제외하고, 개인을 특정할 수 없도록 선별한 학생 작품 일부만 수록했습니다.</p>
          </div>
        </section>

        <section id="guestbook" className={`${contentStyles.section} ${contentStyles.guestbookSection}`} aria-labelledby="guestbook-title">
          <div className={contentStyles.guestbookCopy}>
            <p className={contentStyles.eyebrow}><span>Q&amp;A</span> 방명록·질문</p>
            <h2 id="guestbook-title">보고, 묻고,<br />다시 이어지는 발표회</h2>
            <p>발표회를 둘러본 소감과 궁금한 점을 별명으로 남겨 주세요. 질문에는 운영자가 이 자리에서 답합니다.</p>
            <div className={contentStyles.guestbookStatus}><span /><strong>지금 참여할 수 있습니다</strong></div>
          </div>
          <ShowcaseGuestbook />
        </section>

        <footer className={contentStyles.footer}>
          <div>
            <span>2026 MAPO ELEMENTARY SCHOOL</span>
            <strong>협력적 주도성을 깨우는 AI 과정중심평가</strong>
          </div>
          <div className={contentStyles.footerMarks} aria-label="전시 주제">
            <School aria-hidden="true" /><Leaf aria-hidden="true" /><QrCode aria-hidden="true" />
          </div>
          <div>
            <Link href="/privacy">개인정보 처리방침</Link>
            <a href="#showcase-title">처음으로</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
