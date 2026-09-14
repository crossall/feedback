"use client";

import {
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Leaf,
  Loader2,
  Lock,
  LogOut,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  School,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import {
  project4DefaultConfig,
  project4Id,
  project4Stages,
  type Project4AiFeedback,
  type Project4AiReview,
  type Project4Config,
  type Project4FinalScript,
  type Project4JuniorResponse,
  type Project4PeerResponse,
  type Project4Reflection,
  type Project4Representative,
} from "@/lib/project4";
import styles from "./project4.module.css";

type Role = "home" | "teacherLogin" | "teacher" | "studentLogin" | "student" | "juniorLogin" | "junior";
type TeacherTab = "setup" | "stages" | "results";

type StudentWorkspace = {
  submittedTargetIds: string[];
  received: Array<{ id: string; good: string; blocked: string }>;
  representative: Pick<Project4Representative, "selectedStudentId" | "selectedStudentName" | "reason"> | null;
  aiReview: Project4AiReview | null;
  final: Project4FinalScript | null;
  juniorSummary: {
    total: number;
    understanding: { well: number; some: number; little: number };
    helpfulParts: Array<{ part: string; count: number }>;
    questions: string[];
    messages: string[];
  };
  reflection: Project4Reflection | null;
};

type TeacherData = {
  peer: Project4PeerResponse[];
  representatives: Project4Representative[];
  ai: Project4AiReview[];
  finals: Project4FinalScript[];
  juniors: Project4JuniorResponse[];
  reflections: Project4Reflection[];
};

const emptyWorkspace: StudentWorkspace = {
  submittedTargetIds: [],
  received: [],
  representative: null,
  aiReview: null,
  final: null,
  juniorSummary: {
    total: 0,
    understanding: { well: 0, some: 0, little: 0 },
    helpfulParts: [],
    questions: [],
    messages: [],
  },
  reflection: null,
};

const emptyTeacherData: TeacherData = {
  peer: [], representatives: [], ai: [], finals: [], juniors: [], reflections: [],
};

async function project4Api<T>(action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch("/api/project4/storage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function classLabel(config: Project4Config, id: string) {
  return config.classes.find((item) => item.id === id)?.name || "반 미지정";
}

function groupLabel(config: Project4Config, id: string) {
  return config.groups.find((item) => item.id === id)?.name || "모둠 미지정";
}

export default function Project4Client() {
  const [role, setRole] = useState<Role>("home");
  const [config, setConfig] = useState<Project4Config>(project4DefaultConfig);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [teacherToken, setTeacherToken] = useState("");
  const [studentToken, setStudentToken] = useState("");
  const [juniorToken, setJuniorToken] = useState("");
  const [studentMe, setStudentMe] = useState({ classId: "", groupId: "", studentId: "", name: "" });
  const [workspace, setWorkspace] = useState<StudentWorkspace>(emptyWorkspace);

  useEffect(() => {
    project4Api<{ config: Project4Config }>("getConfig")
      .then((data) => setConfig(data.config))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "평가 설정을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, []);

  function goHome() {
    setRole("home");
    setError("");
  }

  if (loading) {
    return <main className={styles.root}><div className={styles.loading}><Loader2 className={styles.spin} /> 평가 공간을 준비하고 있습니다.</div></main>;
  }

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <button className={styles.brand} type="button" onClick={goHome}>
          <span><Leaf size={22} /></span>
          <div><b>계절의 비밀</b><small>PROJECT 4 · FEEDFORWARD</small></div>
        </button>
        {role !== "home" && (
          <button className={styles.headerButton} type="button" onClick={goHome}><LogOut size={15} /> 나가기</button>
        )}
      </header>

      {error && <div className={styles.globalError}>{error}</div>}

      {role === "home" && <RoleHome config={config} setRole={setRole} />}
      {role === "teacherLogin" && <TeacherLogin onBack={goHome} onLogin={async (token) => {
        const loaded = await project4Api<{ config: Project4Config }>("teacherData", { token });
        setConfig(loaded.config);
        setTeacherToken(token);
        setRole("teacher");
      }} />}
      {role === "teacher" && <TeacherStudio config={config} setConfig={setConfig} token={teacherToken} />}
      {role === "studentLogin" && <StudentLogin config={config} onBack={goHome} onEnter={async (identity) => {
        const data = await project4Api<{ token: string }>("enterStudent", identity);
        setStudentToken(data.token);
        const loaded = await project4Api<{ config: Project4Config; me: typeof studentMe; workspace: StudentWorkspace }>("studentWorkspace", { token: data.token });
        setConfig(loaded.config);
        setStudentMe(loaded.me);
        setWorkspace(loaded.workspace);
        setRole("student");
      }} />}
      {role === "student" && <StudentStudio config={config} setConfig={setConfig} me={studentMe} token={studentToken} workspace={workspace} setWorkspace={setWorkspace} />}
      {role === "juniorLogin" && <JuniorLogin config={config} onBack={goHome} onEnter={async (identity) => {
        const data = await project4Api<{ token: string }>("enterJunior", identity);
        setJuniorToken(data.token);
        setRole("junior");
      }} />}
      {role === "junior" && <JuniorEvaluation token={juniorToken} onDone={goHome} />}
    </main>
  );
}

function RoleHome({ config, setRole }: { config: Project4Config; setRole: (role: Role) => void }) {
  return (
    <section className={styles.home}>
      <div className={styles.homeCopy}>
        <span className={styles.kicker}><Sparkles size={15} /> SECRETS OF THE SEASONS</span>
        <h1>계절이 바뀌는 까닭을<br /><em>설명하고, 듣고, 다시 고쳐요.</em></h1>
        <p>{config.description}</p>
        <div className={styles.privacyLine}><ShieldCheck size={16} /><span>학생 평가는 친구에게 익명으로 보이며, 평가자 이름은 교사만 확인합니다.</span></div>
      </div>
      <div className={styles.roleGrid}>
        <button type="button" onClick={() => setRole("studentLogin")}>
          <span className={styles.roleIcon}><UserRound size={25} /></span><div><small>6학년</small><strong>프로젝트 평가 시작</strong><p>친구 피드백부터 자기평가까지 7단계로 진행해요.</p></div><ChevronRight />
        </button>
        <button type="button" onClick={() => setRole("juniorLogin")}>
          <span className={styles.roleIcon}><School size={25} /></span><div><small>5학년</small><strong>선배 영상 평가</strong><p>패들렛에서 영상을 본 뒤 이해한 정도를 알려 줘요.</p></div><ChevronRight />
        </button>
        <button type="button" onClick={() => setRole("teacherLogin")}>
          <span className={styles.roleIcon}><GraduationCap size={25} /></span><div><small>교사</small><strong>평가 운영하기</strong><p>명단과 기준을 준비하고 단계와 결과를 관리해요.</p></div><ChevronRight />
        </button>
      </div>
    </section>
  );
}

function TeacherLogin({ onBack, onLogin }: { onBack: () => void; onLogin: (token: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const data = await project4Api<{ token: string }>("teacherLogin", { password });
      await onLogin(data.token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "로그인하지 못했습니다.");
    } finally { setBusy(false); }
  }
  return <CenteredPanel title="교사 운영 화면" subtitle="비밀번호를 입력하면 학생 명단과 실명 평가 기록을 확인할 수 있습니다." onBack={onBack}>
    <form className={styles.loginForm} onSubmit={submit}>
      <label><span>교사 비밀번호</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></label>
      {error && <InlineError text={error} />}
      <button className={styles.primaryButton} disabled={busy}>{busy ? <Loader2 className={styles.spin} /> : <Lock size={17} />} 교사 화면 열기</button>
    </form>
  </CenteredPanel>;
}

function CenteredPanel({ title, subtitle, onBack, children }: { title: string; subtitle: string; onBack: () => void; children: React.ReactNode }) {
  return <section className={styles.centered}><button type="button" className={styles.backButton} onClick={onBack}><ArrowLeft size={15} /> 돌아가기</button><div className={styles.centeredCard}><h1>{title}</h1><p>{subtitle}</p>{children}</div></section>;
}

function InlineError({ text }: { text: string }) {
  return <div className={styles.inlineError}>{text}</div>;
}

function TeacherStudio({ config, setConfig, token }: { config: Project4Config; setConfig: (config: Project4Config) => void; token: string }) {
  const [tab, setTab] = useState<TeacherTab>("setup");
  const [draft, setDraft] = useState(config);
  const [data, setData] = useState<TeacherData>(emptyTeacherData);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(next = draft, success = "평가 설정을 저장했습니다.") {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await project4Api<{ config: Project4Config }>("saveConfig", { token, config: next });
      setConfig(result.config); setDraft(result.config); setMessage(success);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function loadResults() {
    setBusy(true); setError("");
    try {
      const result = await project4Api<{ config: Project4Config; data: TeacherData }>("teacherData", { token });
      setConfig(result.config); setDraft(result.config); setData(result.data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "결과를 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }

  return <section className={styles.studio}>
    <div className={styles.studioHead}><div><span className={styles.kicker}>TEACHER STUDIO</span><h1>계절의 비밀 평가 운영</h1><p>학생에게는 익명으로 보이는 평가자 정보를 이 화면에서만 확인할 수 있습니다.</p></div><div className={styles.stageBadge}><span>현재 공개 단계</span><b>{draft.openStage}</b><small>{project4Stages[draft.openStage - 1]}</small></div></div>
    <div className={styles.tabs}>
      <button className={tab === "setup" ? styles.active : ""} onClick={() => setTab("setup")}><ClipboardCheck size={16} /> 설정과 명단</button>
      <button className={tab === "stages" ? styles.active : ""} onClick={() => setTab("stages")}><Lock size={16} /> 단계 열기</button>
      <button className={tab === "results" ? styles.active : ""} onClick={() => { setTab("results"); void loadResults(); }}><BarChart3 size={16} /> 실명 결과</button>
    </div>
    {message && <div className={styles.successBanner}><Check size={16} />{message}</div>}
    {error && <InlineError text={error} />}
    {tab === "setup" && <TeacherSetup draft={draft} setDraft={setDraft} save={() => save()} busy={busy} />}
    {tab === "stages" && <TeacherStages config={draft} setStage={(stage) => save({ ...draft, openStage: stage }, `${stage}단계까지 학생에게 열었습니다.`)} busy={busy} />}
    {tab === "results" && <TeacherResults config={draft} data={data} refresh={loadResults} busy={busy} />}
  </section>;
}

function TeacherSetup({ draft, setDraft, save, busy }: { draft: Project4Config; setDraft: (config: Project4Config) => void; save: () => void; busy: boolean }) {
  function addClass() {
    setDraft({ ...draft, classes: [...draft.classes, { id: project4Id("class"), name: `6학년 ${draft.classes.length + 1}반` }] });
  }
  function addGroup(classId: string) {
    const count = draft.groups.filter((group) => group.classId === classId).length;
    setDraft({ ...draft, groups: [...draft.groups, { id: project4Id("group"), classId, name: `${count + 1}모둠`, students: [] }] });
  }
  function updateGroup(groupId: string, patch: Partial<Project4Config["groups"][number]>) {
    setDraft({ ...draft, groups: draft.groups.map((group) => group.id === groupId ? { ...group, ...patch } : group) });
  }
  return <div className={styles.panelStack}>
    <section className={styles.panel}><div className={styles.panelHead}><div><span>01</span><h2>프로젝트 안내</h2></div></div><div className={styles.formGrid}><label><span>프로젝트 이름</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label className={styles.full}><span>학생 안내</span><textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label></div></section>
    <section className={styles.panel}><div className={styles.panelHead}><div><span>02</span><h2>평가 기준 6항목</h2></div><small>초안은 언제든 수정할 수 있습니다.</small></div><div className={styles.criteriaEdit}>{draft.criteria.map((criterion, index) => <label key={index}><b>{index + 1}</b><textarea rows={2} value={criterion} onChange={(event) => setDraft({ ...draft, criteria: draft.criteria.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} /></label>)}</div></section>
    <section className={styles.panel}><div className={styles.panelHead}><div><span>03</span><h2>반·모둠·학생 명단</h2></div><button className={styles.outlineButton} type="button" onClick={addClass}><Plus size={15} /> 반 추가</button></div>
      {draft.classes.length === 0 ? <div className={styles.empty}>반을 추가한 뒤 모둠과 학생 이름을 등록해 주세요.</div> : draft.classes.map((classroom) => <article className={styles.classEditor} key={classroom.id}><div className={styles.classEditorHead}><input value={classroom.name} onChange={(event) => setDraft({ ...draft, classes: draft.classes.map((item) => item.id === classroom.id ? { ...item, name: event.target.value } : item) })} /><div><button type="button" onClick={() => addGroup(classroom.id)}><Plus size={14} /> 모둠 추가</button><button type="button" className={styles.dangerButton} onClick={() => setDraft({ ...draft, classes: draft.classes.filter((item) => item.id !== classroom.id), groups: draft.groups.filter((group) => group.classId !== classroom.id) })}><Trash2 size={14} /></button></div></div>
        <div className={styles.groupGrid}>{draft.groups.filter((group) => group.classId === classroom.id).map((group) => <div className={styles.groupEditor} key={group.id}><div className={styles.groupTitle}><input value={group.name} onChange={(event) => updateGroup(group.id, { name: event.target.value })} /><button type="button" onClick={() => setDraft({ ...draft, groups: draft.groups.filter((item) => item.id !== group.id) })}><Trash2 size={13} /></button></div><div className={styles.studentList}>{group.students.map((student) => <div key={student.id}><input value={student.name} onChange={(event) => updateGroup(group.id, { students: group.students.map((item) => item.id === student.id ? { ...item, name: event.target.value } : item) })} /><button type="button" onClick={() => updateGroup(group.id, { students: group.students.filter((item) => item.id !== student.id) })}><Trash2 size={12} /></button></div>)}</div><button className={styles.addStudent} type="button" onClick={() => updateGroup(group.id, { students: [...group.students, { id: project4Id("student"), name: `학생 ${group.students.length + 1}` }] })}><Plus size={13} /> 학생 추가</button></div>)}</div>
      </article>)}</section>
    <div className={styles.stickySave}><span>학생 이름은 평가자 확인을 위해 교사 화면에만 표시됩니다.</span><button className={styles.primaryButton} type="button" onClick={save} disabled={busy}>{busy ? <Loader2 className={styles.spin} /> : <Save size={16} />} 변경사항 저장</button></div>
  </div>;
}

function TeacherStages({ config, setStage, busy }: { config: Project4Config; setStage: (stage: number) => void; busy: boolean }) {
  return <section className={styles.panel}><div className={styles.panelHead}><div><span>진행</span><h2>학생 단계 열기</h2></div></div><p className={styles.panelIntro}>선택한 단계까지 학생이 이동할 수 있습니다. 이전 단계는 계속 다시 볼 수 있습니다.</p><div className={styles.stageControl}>{project4Stages.map((stage, index) => { const number = index + 1; return <button key={stage} className={number === config.openStage ? styles.current : number < config.openStage ? styles.done : ""} disabled={busy} onClick={() => setStage(number)}><span>{number < config.openStage ? <Check size={16} /> : number}</span><div><b>{stage}</b><small>{number <= config.openStage ? "학생에게 열림" : "아직 잠김"}</small></div>{number > config.openStage && <Lock size={15} />}</button>; })}</div></section>;
}

function TeacherResults({ config, data, refresh, busy }: { config: Project4Config; data: TeacherData; refresh: () => void; busy: boolean }) {
  return <div className={styles.panelStack}>
    <div className={styles.resultStats}>{[
      ["동료평가", data.peer.length], ["대표 선정", data.representatives.length], ["AI 검토", data.ai.length], ["후배 응답", data.juniors.length], ["자기평가", data.reflections.length],
    ].map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}<button type="button" onClick={refresh} disabled={busy}><RefreshCw className={busy ? styles.spin : ""} size={16} /> 새로고침</button></div>
    <ResultSection title="모둠 내 동료평가 · 교사 실명 확인" empty={data.peer.length === 0}>{data.peer.map((item) => <article className={styles.record} key={item.id}><div className={styles.recordMeta}><b>{item.evaluatorName}</b><span>→ {item.targetName}</span><small>{classLabel(config, item.classId)} · {groupLabel(config, item.groupId)}</small></div><div><p><strong>잘 전달된 부분</strong>{item.good}</p><p><strong>이해가 막힌 부분</strong>{item.blocked}</p></div></article>)}</ResultSection>
    <ResultSection title="대표 작품 선정" empty={data.representatives.length === 0}>{data.representatives.map((item) => <article className={styles.record} key={`${item.classId}-${item.groupId}`}><div className={styles.recordMeta}><b>{item.selectedStudentName} 작품</b><span>{groupLabel(config, item.groupId)}</span><small>입력: {item.submittedByName}</small></div><div><p><strong>선정 이유</strong>{item.reason}</p></div></article>)}</ResultSection>
    <ResultSection title="AI 피드백 판단" empty={data.ai.length === 0}>{data.ai.map((review) => <article className={styles.aiRecord} key={`${review.classId}-${review.groupId}`}><h3>{classLabel(config, review.classId)} · {groupLabel(config, review.groupId)} <small>입력: {review.submittedByName}</small></h3>{review.feedbacks.map((feedback) => <div key={feedback.id}><b>{feedback.title}</b><span className={feedback.accept === true ? styles.accept : styles.reject}>{feedback.accept === true ? "반영" : feedback.accept === false ? "미반영" : "판단 전"}</span><p>{feedback.reason || "판단 이유 미입력"}</p></div>)}{review.wrongFeedback && <p className={styles.wrongFeedback}><strong>잘못되었다고 본 피드백</strong>{review.wrongFeedback}</p>}</article>)}</ResultSection>
    <ResultSection title="최종 대본" empty={data.finals.length === 0}>{data.finals.map((item) => <article className={styles.record} key={`${item.classId}-${item.groupId}`}><div className={styles.recordMeta}><b>{classLabel(config, item.classId)} · {groupLabel(config, item.groupId)}</b><span>입력: {item.submittedByName}</span><small>{item.mode === "pdf" ? item.fileName : "직접 작성"}</small></div><div>{item.mode === "text" ? <p><strong>최종 대본</strong>{item.text}</p> : item.fileData ? <a className={styles.outlineButton} href={item.fileData} download={item.fileName || "최종-대본.pdf"}><FileText size={15} /> PDF 내려받기</a> : <p>PDF 파일 정보가 없습니다.</p>}</div></article>)}</ResultSection>
    <ResultSection title="5학년 후배 평가 · 교사 실명 확인" empty={data.juniors.length === 0}>{data.juniors.map((item) => <article className={styles.record} key={item.id}><div className={styles.recordMeta}><b>{item.evaluatorName}</b><span>{item.evaluatorClass}</span><small>대상: {classLabel(config, item.targetClassId)} · {groupLabel(config, item.targetGroupId)}</small></div><div><p><strong>이해 정도</strong>{item.understanding === "well" ? "잘 이해했어요" : item.understanding === "some" ? "조금 알 것 같아요" : "잘 모르겠어요"}</p>{item.question && <p><strong>질문</strong>{item.question}</p>}{item.message && <p><strong>한마디</strong>{item.message}</p>}</div></article>)}</ResultSection>
    <ResultSection title="자기평가와 성찰" empty={data.reflections.length === 0}>{data.reflections.map((item) => <article className={styles.record} key={item.studentId}><div className={styles.recordMeta}><b>{item.studentName}</b><span>{classLabel(config, item.classId)} · {groupLabel(config, item.groupId)}</span><small>참여 {item.responsibility} · 피드백 {item.helpfulFeedback} · 수정 {item.revisedFromFeedback}</small></div><div><p><strong>고친 점</strong>{item.changed}</p><p><strong>다음 설명</strong>{item.nextExplanation}</p><p><strong>AI 미반영 이유</strong>{item.rejectedAiReason}</p></div></article>)}</ResultSection>
  </div>;
}

function ResultSection({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return <section className={styles.panel}><div className={styles.panelHead}><div><h2>{title}</h2></div></div>{empty ? <div className={styles.empty}>아직 기록이 없습니다.</div> : <div className={styles.recordList}>{children}</div>}</section>;
}

function StudentLogin({ config, onBack, onEnter }: { config: Project4Config; onBack: () => void; onEnter: (identity: { classId: string; groupId: string; studentId: string }) => Promise<void> }) {
  const [classId, setClassId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const groups = config.groups.filter((group) => group.classId === classId);
  const students = groups.find((group) => group.id === groupId)?.students || [];
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await onEnter({ classId, groupId, studentId }); } catch (caught) { setError(caught instanceof Error ? caught.message : "입장하지 못했습니다."); } finally { setBusy(false); } }
  return <CenteredPanel title="6학년 프로젝트 평가" subtitle="자기 반과 모둠을 고른 뒤 이름을 선택하세요." onBack={onBack}><form className={styles.loginForm} onSubmit={submit}><label><span>반</span><select value={classId} onChange={(event) => { setClassId(event.target.value); setGroupId(""); setStudentId(""); }}><option value="">반 선택</option>{config.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>모둠</span><select value={groupId} onChange={(event) => { setGroupId(event.target.value); setStudentId(""); }} disabled={!classId}><option value="">모둠 선택</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>이름</span><select value={studentId} onChange={(event) => setStudentId(event.target.value)} disabled={!groupId}><option value="">이름 선택</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label><p className={styles.helper}>선택한 이름은 로그인 확인에만 사용되며, 친구 화면의 평가 의견에는 표시되지 않습니다.</p>{error && <InlineError text={error} />}<button className={styles.primaryButton} disabled={busy || !studentId}>{busy ? <Loader2 className={styles.spin} /> : <ChevronRight size={17} />} 평가 시작</button></form></CenteredPanel>;
}

function StudentStudio({ config, setConfig, me, token, workspace, setWorkspace }: { config: Project4Config; setConfig: (config: Project4Config) => void; me: { classId: string; groupId: string; studentId: string; name: string }; token: string; workspace: StudentWorkspace; setWorkspace: (workspace: StudentWorkspace) => void }) {
  const [stage, setStage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const group = config.groups.find((item) => item.id === me.groupId);
  async function action(name: string, payload: Record<string, unknown> = {}) { setBusy(true); setError(""); try { const result = await project4Api<{ config: Project4Config; workspace: StudentWorkspace }>(name, { token, ...payload }); if (result.config) setConfig(result.config); setWorkspace(result.workspace); return result.workspace; } catch (caught) { setError(caught instanceof Error ? caught.message : "저장하지 못했습니다."); return null; } finally { setBusy(false); } }
  return <section className={styles.studentShell}><div className={styles.studentHead}><div><span className={styles.kicker}>MY SEASON PROJECT</span><h1>{me.name}의 평가 여정</h1><p>{classLabel(config, me.classId)} · {group?.name}</p></div><div className={styles.openNotice}><Lock size={15} /><span>{config.openStage}단계까지 열렸어요</span><button type="button" onClick={() => void action("studentWorkspace")} disabled={busy} aria-label="공개 단계와 결과 새로고침" title="새로고침"><RefreshCw className={busy ? styles.spin : ""} size={15} /></button></div></div><nav className={styles.journey}>{project4Stages.map((label, index) => { const number = index + 1; const locked = number > config.openStage; return <button key={label} disabled={locked} className={stage === number ? styles.active : ""} onClick={() => setStage(number)}><span>{locked ? <Lock size={13} /> : number}</span><small>{label}</small></button>; })}</nav>{error && <InlineError text={error} />}<div className={styles.studentWork}>
    {stage === 1 && <PeerStep config={config} group={group} me={me} workspace={workspace} busy={busy} action={action} />}
    {stage === 2 && <ReceivedStep workspace={workspace} />}
    {stage === 3 && <RepresentativeStep group={group} workspace={workspace} busy={busy} action={action} />}
    {stage === 4 && <AiStep token={token} workspace={workspace} setWorkspace={setWorkspace} busy={busy} action={action} />}
    {stage === 5 && <FinalStep workspace={workspace} busy={busy} action={action} />}
    {stage === 6 && <JuniorWaitStep summary={workspace.juniorSummary} />}
    {stage === 7 && <ReflectionStep workspace={workspace} busy={busy} action={action} />}
  </div></section>;
}

function StepTitle({ number, title, text, icon }: { number: number; title: string; text: string; icon: React.ReactNode }) {
  return <div className={styles.stepTitle}><span>{icon}</span><div><small>STEP {number}</small><h2>{title}</h2><p>{text}</p></div></div>;
}

function CriteriaAside({ config }: { config: Project4Config }) {
  return <aside className={styles.criteriaAside}><span>우리의 평가 기준</span>{config.criteria.map((item, index) => <p key={item}><b>{index + 1}</b>{item}</p>)}</aside>;
}

function PeerStep({ config, group, me, workspace, busy, action }: { config: Project4Config; group?: Project4Config["groups"][number]; me: { studentId: string }; workspace: StudentWorkspace; busy: boolean; action: (name: string, payload?: Record<string, unknown>) => Promise<StudentWorkspace | null> }) {
  const targets = group?.students.filter((item) => item.id !== me.studentId) || [];
  const [targetId, setTargetId] = useState(targets.find((item) => !workspace.submittedTargetIds.includes(item.id))?.id || targets[0]?.id || "");
  const [good, setGood] = useState(""); const [blocked, setBlocked] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); const next = await action("submitPeer", { targetId, good, blocked }); if (next) { setGood(""); setBlocked(""); const nextTarget = targets.find((item) => !next.submittedTargetIds.includes(item.id)); if (nextTarget) setTargetId(nextTarget.id); } }
  return <><StepTitle number={1} title="모둠 친구의 설명 돌아보기" text="영상은 패들렛에서 보고, 모둠원 전원을 한 명씩 평가해 주세요. 점수는 매기지 않습니다." icon={<Users />} /><div className={styles.twoColumn}><form className={styles.taskCard} onSubmit={submit}><label><span>평가할 친구</span><select value={targetId} onChange={(event) => setTargetId(event.target.value)}>{targets.map((item) => <option key={item.id} value={item.id}>{item.name} {workspace.submittedTargetIds.includes(item.id) ? "· 완료" : ""}</option>)}</select></label><label><span>이 설명에서 가장 잘 전달된 부분은 무엇인가요?</span><textarea rows={4} value={good} onChange={(event) => setGood(event.target.value)} required /></label><label><span>어느 부분에서 이해가 막혔나요? 평가 기준 번호를 들어 써 주세요.</span><textarea rows={5} value={blocked} onChange={(event) => setBlocked(event.target.value)} placeholder="예: 3번에서 남중 고도까지는 알겠는데 왜 더워지는지가 빠졌어." required /></label><button className={styles.primaryButton} disabled={busy || !targetId}>{busy ? <Loader2 className={styles.spin} /> : <Send size={16} />} 익명 평가 저장</button><p className={styles.helper}>친구 화면에는 내 이름이 나오지 않지만, 선생님은 평가자를 확인할 수 있습니다.</p></form><CriteriaAside config={config} /></div></>;
}

function ReceivedStep({ workspace }: { workspace: StudentWorkspace }) {
  return <><StepTitle number={2} title="친구들이 남긴 말 확인하기" text="여러 사람이 같은 곳을 짚었다면 그 부분부터 고쳐 보세요. 작성자 이름은 표시되지 않습니다." icon={<MessageSquareText />} />{workspace.received.length === 0 ? <div className={styles.empty}>아직 내가 받은 평가가 없습니다.</div> : <div className={styles.feedbackColumns}><section><h3>잘 전달된 점</h3>{workspace.received.map((item, index) => <blockquote key={item.id}><b>의견 {index + 1}</b>{item.good}</blockquote>)}</section><section><h3>이해되지 않은 점</h3>{workspace.received.map((item, index) => <blockquote key={item.id}><b>의견 {index + 1}</b>{item.blocked}</blockquote>)}</section></div>}</>;
}

function RepresentativeStep({ group, workspace, busy, action }: { group?: Project4Config["groups"][number]; workspace: StudentWorkspace; busy: boolean; action: (name: string, payload?: Record<string, unknown>) => Promise<StudentWorkspace | null> }) {
  const [selectedStudentId, setSelected] = useState(workspace.representative?.selectedStudentId || ""); const [reason, setReason] = useState(workspace.representative?.reason || "");
  return <><StepTitle number={3} title="함께 보고 싶은 설명 고르기" text="가장 잘한 작품을 뽑는 것이 아니라, 다른 모둠과 함께 보고 싶은 설명 한 편을 고릅니다." icon={<BookOpenCheck />} /><form className={styles.taskCard} onSubmit={(event) => { event.preventDefault(); void action("saveRepresentative", { selectedStudentId, reason }); }}><label><span>함께 보고 싶은 설명</span><select value={selectedStudentId} onChange={(event) => setSelected(event.target.value)}><option value="">선택</option>{group?.students.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>이 영상을 고른 까닭을 평가 기준 번호를 들어 한 문장으로 써 주세요.</span><textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="예: 2번 기준처럼 지구본을 돌리며 말해서 따라가기 쉬웠습니다." /></label><button className={styles.primaryButton} disabled={busy || !selectedStudentId || !reason}>{busy ? <Loader2 className={styles.spin} /> : <Save size={16} />} 모둠 대표 저장</button>{workspace.representative && <p className={styles.helper}>현재 선택: {workspace.representative.selectedStudentName} 작품</p>}</form></>;
}

function AiStep({ token, workspace, setWorkspace, busy, action }: { token: string; workspace: StudentWorkspace; setWorkspace: (workspace: StudentWorkspace) => void; busy: boolean; action: (name: string, payload?: Record<string, unknown>) => Promise<StudentWorkspace | null> }) {
  const [file, setFile] = useState<File | null>(null); const [generating, setGenerating] = useState(false); const [review, setReview] = useState<Project4AiReview | null>(workspace.aiReview); const [error, setError] = useState("");
  async function generate() { if (!file) return; setGenerating(true); setError(""); try { const pdfData = await fileAsDataUrl(file); const response = await fetch("/api/project4/claude", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, fileName: file.name, pdfData }) }); const data = await response.json() as { feedbacks?: Project4AiFeedback[]; error?: string }; if (!response.ok || !data.feedbacks) throw new Error(data.error || "AI 피드백을 만들지 못했습니다."); const next: Project4AiReview = { classId: "", groupId: "", fileName: file.name, feedbacks: data.feedbacks.map((item, index) => ({ ...item, id: item.id || `feedback-${index + 1}` })), wrongFeedback: "", submittedById: "", submittedByName: "", updatedAt: new Date().toISOString() }; setReview(next); const loaded = await action("saveAiReview", { review: next }); if (loaded) setWorkspace(loaded); } catch (caught) { setError(caught instanceof Error ? caught.message : "AI 피드백을 만들지 못했습니다."); } finally { setGenerating(false); } }
  function updateFeedback(id: string, patch: Partial<Project4AiFeedback>) { if (!review) return; setReview({ ...review, feedbacks: review.feedbacks.map((item) => item.id === id ? { ...item, ...patch } : item) }); }
  const complete = review?.feedbacks.every((item) => typeof item.accept === "boolean" && item.basis && item.reason?.trim());
  return <><StepTitle number={4} title="AI 피드백을 검토하고 판단하기" text="AI가 언제나 맞는 것은 아닙니다. 무엇을 반영할지 우리가 배운 근거로 결정하세요." icon={<Sparkles />} />{!review ? <div className={styles.taskCard}><label className={styles.filePicker}><Upload size={25} /><div><b>{file?.name || "모둠 대본 PDF 선택"}</b><span>PDF를 올리면 점수 없이 수정 피드백 5개를 만듭니다.</span></div><input type="file" accept="application/pdf" onChange={(event: ChangeEvent<HTMLInputElement>) => { const next = event.target.files?.[0] || null; if (next && next.size > 12 * 1024 * 1024) { setError("PDF는 12MB 이하여야 합니다."); return; } setFile(next); }} /></label>{error && <InlineError text={error} />}<button className={styles.primaryButton} type="button" onClick={generate} disabled={!file || generating}>{generating ? <><Loader2 className={styles.spin} /> 과학 내용을 확인하는 중...</> : <><Sparkles size={16} /> AI 피드백 5개 만들기</>}</button></div> : <div className={styles.aiFeedbackList}>{review.feedbacks.map((feedback, index) => <article key={feedback.id}><div className={styles.aiFeedbackHead}><span>{index + 1}</span><div><h3>{feedback.title}</h3><small>관련 기준 {feedback.criterionNumbers?.join(", ") || "-"}</small></div></div><p>{feedback.feedback}</p><blockquote>{feedback.evidence}</blockquote><div className={styles.decisionRow}><button type="button" className={feedback.accept === true ? styles.activeYes : ""} onClick={() => updateFeedback(feedback.id, { accept: true })}>O 반영</button><button type="button" className={feedback.accept === false ? styles.activeNo : ""} onClick={() => updateFeedback(feedback.id, { accept: false })}>X 반영하지 않음</button></div><label><span>무엇을 보고 정했나요?</span><select value={feedback.basis || ""} onChange={(event) => updateFeedback(feedback.id, { basis: event.target.value as Project4AiFeedback["basis"] })}><option value="">근거 선택</option><option value="measurement">① 우리가 측정한 자료</option><option value="experiment">② 지구본 실험 결과</option><option value="criteria">③ 우리가 만든 평가 기준</option><option value="unsure">④ 잘 모르겠음</option></select></label><label><span>그렇게 정한 까닭</span><textarea rows={3} value={feedback.reason || ""} onChange={(event) => updateFeedback(feedback.id, { reason: event.target.value })} /></label></article>)}<label className={styles.wrongFeedback}><span>다섯 개 중 잘못된 피드백이 있었다면 몇 번이라고 생각하나요? 그렇게 본 까닭은?</span><textarea rows={4} value={review.wrongFeedback} onChange={(event) => setReview({ ...review, wrongFeedback: event.target.value })} /></label><button className={styles.primaryButton} disabled={busy || !complete} onClick={() => action("saveAiReview", { review })}>{busy ? <Loader2 className={styles.spin} /> : <Save size={16} />} 판단 결과 저장</button></div>}</>;
}

function FinalStep({ workspace, busy, action }: { workspace: StudentWorkspace; busy: boolean; action: (name: string, payload?: Record<string, unknown>) => Promise<StudentWorkspace | null> }) {
  const [mode, setMode] = useState<"text" | "pdf">(workspace.final?.mode || "text"); const [text, setText] = useState(workspace.final?.text || ""); const [file, setFile] = useState<File | null>(null); const [error, setError] = useState("");
  async function saveFinal() { setError(""); try { const fileData = mode === "pdf" ? (file ? await fileAsDataUrl(file) : workspace.final?.fileData) : undefined; await action("saveFinal", { final: { mode, text, fileName: file?.name || workspace.final?.fileName || "", fileData } }); } catch (caught) { setError(caught instanceof Error ? caught.message : "최종 대본을 저장하지 못했습니다."); } }
  return <><StepTitle number={5} title="최종 대본 완성하기" text="반영하기로 한 것만 고쳐 최종 대본을 완성하세요. 남반구 설명이 들어갔는지도 확인합니다." icon={<FileText />} /><div className={styles.taskCard}><div className={styles.segment}><button className={mode === "text" ? styles.active : ""} onClick={() => setMode("text")}>화면에 직접 작성</button><button className={mode === "pdf" ? styles.active : ""} onClick={() => setMode("pdf")}>PDF 업로드</button></div>{mode === "text" ? <label><span>고친 최종 대본</span><textarea rows={14} value={text} onChange={(event) => setText(event.target.value)} /></label> : <label className={styles.filePicker}><Upload size={25} /><div><b>{file?.name || workspace.final?.fileName || "최종 대본 PDF 선택"}</b><span>고친 부분을 다른 색으로 표시하면 변화가 잘 보입니다.</span></div><input type="file" accept="application/pdf" onChange={(event) => { const next = event.target.files?.[0] || null; if (next && next.size > 10 * 1024 * 1024) { setError("PDF는 10MB 이하여야 합니다."); return; } setFile(next); }} /></label>}{error && <InlineError text={error} />}<button className={styles.primaryButton} onClick={saveFinal} disabled={busy || (mode === "text" ? !text.trim() : !file && !workspace.final?.fileData)}>{busy ? <Loader2 className={styles.spin} /> : <Save size={16} />} 최종 대본 저장</button>{workspace.final && <p className={styles.helper}>최종 대본이 저장되어 있습니다. 다시 저장하면 최신 내용으로 바뀝니다.</p>}</div></>;
}

const partLabels: Record<string, string> = { measurement: "측정한 숫자", globe: "지구본으로 보여 준 부분", australia: "호주 이야기", voice: "목소리와 말하는 속도" };

function JuniorWaitStep({ summary }: { summary: StudentWorkspace["juniorSummary"] }) {
  return <><StepTitle number={6} title="후배들의 이해 확인 기다리기" text="5학년 후배들은 패들렛에서 대표 영상을 보고 이해한 정도와 질문을 남깁니다." icon={<School />} /><div className={styles.summaryCard}><strong>{summary.total}명</strong><span>우리 모둠 영상을 평가한 후배</span><div><p>잘 이해했어요 <b>{summary.understanding.well}명</b></p><p>조금 알 것 같아요 <b>{summary.understanding.some}명</b></p><p>잘 모르겠어요 <b>{summary.understanding.little}명</b></p></div></div></>;
}

function ReflectionStep({ workspace, busy, action }: { workspace: StudentWorkspace; busy: boolean; action: (name: string, payload?: Record<string, unknown>) => Promise<StudentWorkspace | null> }) {
  const saved = workspace.reflection; const [values, setValues] = useState({ responsibility: saved?.responsibility || 2, helpfulFeedback: saved?.helpfulFeedback || 2, revisedFromFeedback: saved?.revisedFromFeedback || 2, changed: saved?.changed || "", nextExplanation: saved?.nextExplanation || "", rejectedAiReason: saved?.rejectedAiReason || "" }); const summary = workspace.juniorSummary;
  return <><StepTitle number={7} title="결과를 읽고 나의 다음 설명 정하기" text="낮은 결과도 실패가 아니라 어느 부분이 어려웠는지 알려 주는 정보입니다." icon={<BarChart3 />} /><div className={styles.resultOverview}><section><h3>친구들이 본 내 설명</h3>{workspace.received.length ? workspace.received.map((item, index) => <div key={item.id}><b>익명 의견 {index + 1}</b><p><strong>잘 전달된 점</strong>{item.good}</p><p><strong>이해되지 않은 점</strong>{item.blocked}</p></div>) : <p>아직 받은 의견이 없습니다.</p>}</section><section><h3>우리 모둠의 AI 판단</h3>{workspace.aiReview?.feedbacks.length ? workspace.aiReview.feedbacks.map((item, index) => <p key={item.id}><strong>{index + 1}. {item.accept === true ? "반영" : item.accept === false ? "반영하지 않음" : "판단 전"}</strong>{item.title}</p>) : <p>아직 AI 피드백 판단 기록이 없습니다.</p>}</section><section><h3>후배들이 본 우리 모둠 설명</h3><p>{summary.total}명 중 {summary.understanding.well}명이 “잘 이해했어요”를 골랐습니다.</p><div className={styles.miniBars}>{summary.helpfulParts.map((item) => <span key={item.part}><small>{partLabels[item.part]}</small><b>{item.count}명</b></span>)}</div></section><section><h3>후배가 남긴 질문</h3>{summary.questions.length ? summary.questions.map((item, index) => <blockquote key={index}>{item}</blockquote>) : <p>아직 질문이 없습니다.</p>}</section></div><form className={styles.reflectionForm} onSubmit={(event) => { event.preventDefault(); void action("saveReflection", { reflection: values }); }}><h3>나의 자기평가</h3>{[["responsibility", "대본을 만들 때 내 역할을 책임 있게 했다"], ["helpfulFeedback", "친구의 설명에 도움이 되는 피드백을 주었다"], ["revisedFromFeedback", "친구의 피드백을 받아들여 내 설명을 고쳤다"]].map(([key, label]) => <label className={styles.scaleQuestion} key={key}><span>{label}</span><div>{[1, 2, 3].map((score) => <button type="button" className={values[key as keyof typeof values] === score ? styles.active : ""} key={score} onClick={() => setValues({ ...values, [key]: score })}>{score}점</button>)}</div></label>)}<label><span>친구들의 피드백을 보고 내 설명에서 무엇을 고쳤나요?</span><textarea rows={4} value={values.changed} onChange={(event) => setValues({ ...values, changed: event.target.value })} /></label><label><span>후배들의 반응을 보고 다음에 설명한다면 무엇을 다르게 하고 싶나요?</span><textarea rows={4} value={values.nextExplanation} onChange={(event) => setValues({ ...values, nextExplanation: event.target.value })} /></label><label><span>AI 피드백 중 반영하지 않은 것은 무엇이며, 왜 그렇게 정했나요?</span><textarea rows={4} value={values.rejectedAiReason} onChange={(event) => setValues({ ...values, rejectedAiReason: event.target.value })} /></label><button className={styles.primaryButton} disabled={busy || !values.changed || !values.nextExplanation || !values.rejectedAiReason}>{busy ? <Loader2 className={styles.spin} /> : <Save size={16} />} 자기평가 저장</button></form></>;
}

function JuniorLogin({ config, onBack, onEnter }: { config: Project4Config; onBack: () => void; onEnter: (identity: { name: string; evaluatorClass: string; targetClassId: string; targetGroupId: string }) => Promise<void> }) {
  const [name, setName] = useState(""); const [evaluatorClass, setEvaluatorClass] = useState(""); const [targetClassId, setTargetClassId] = useState(""); const [targetGroupId, setTargetGroupId] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const groups = config.groups.filter((item) => item.classId === targetClassId);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await onEnter({ name, evaluatorClass, targetClassId, targetGroupId }); } catch (caught) { setError(caught instanceof Error ? caught.message : "입장하지 못했습니다."); } finally { setBusy(false); } }
  return <CenteredPanel title="선배들의 설명을 들어 보았어요" subtitle="패들렛에서 본 영상의 6학년 반과 모둠을 선택하세요." onBack={onBack}><form className={styles.loginForm} onSubmit={submit}><label><span>5학년 반</span><input value={evaluatorClass} onChange={(event) => setEvaluatorClass(event.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" pattern="[0-9]*" placeholder="예: 2" /></label><label><span>이름</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>본 영상의 6학년 반</span><select value={targetClassId} onChange={(event) => { setTargetClassId(event.target.value); setTargetGroupId(""); }}><option value="">반 선택</option>{config.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>본 영상의 모둠</span><select value={targetGroupId} onChange={(event) => setTargetGroupId(event.target.value)}><option value="">모둠 선택</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{error && <InlineError text={error} />}<button className={styles.primaryButton} disabled={busy || !name || !evaluatorClass || !targetGroupId}>{busy ? <Loader2 className={styles.spin} /> : <ChevronRight size={17} />} 평가 시작</button></form></CenteredPanel>;
}

function JuniorEvaluation({ token, onDone }: { token: string; onDone: () => void }) {
  const [understanding, setUnderstanding] = useState(""); const [helpfulParts, setHelpfulParts] = useState<string[]>([]); const [question, setQuestion] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [done, setDone] = useState(false);
  function toggle(part: string) { setHelpfulParts((current) => current.includes(part) ? current.filter((item) => item !== part) : [...current, part]); }
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await project4Api("submitJunior", { token, understanding, helpfulParts, question, message }); setDone(true); } catch (caught) { setError(caught instanceof Error ? caught.message : "평가를 제출하지 못했습니다."); } finally { setBusy(false); } }
  if (done) return <CenteredPanel title="고마워요!" subtitle="솔직하게 알려 준 내용이 6학년 선배들의 다음 설명에 큰 도움이 됩니다." onBack={onDone}><button className={styles.primaryButton} onClick={onDone}><Check size={17} /> 처음으로</button></CenteredPanel>;
  return <section className={styles.juniorPage}><span className={styles.kicker}><School size={15} /> 5학년 후배 평가</span><h1>계절이 왜 바뀌는지<br />이해했나요?</h1><p>6학년 선배들이 지구본과 전등으로 실험한 결과를 바탕으로 설명 영상을 만들었습니다. 패들렛에서 영상을 보고 솔직하게 답해 주세요.</p><form className={styles.juniorForm} onSubmit={submit}><fieldset><legend>1. 계절이 왜 바뀌는지 이해했나요?</legend><div className={styles.choiceGrid}>{[["well", "잘 이해했어요"], ["some", "조금 알 것 같아요"], ["little", "잘 모르겠어요"]].map(([value, label]) => <button type="button" className={understanding === value ? styles.active : ""} key={value} onClick={() => setUnderstanding(value)}>{label}</button>)}</div></fieldset><fieldset><legend>2. 어느 부분이 가장 이해가 잘 됐나요? <small>여러 개 선택</small></legend><div className={styles.checkGrid}>{Object.entries(partLabels).map(([value, label]) => <button type="button" className={helpfulParts.includes(value) ? styles.active : ""} key={value} onClick={() => toggle(value)}>{helpfulParts.includes(value) && <Check size={15} />}{label}</button>)}</div></fieldset><label><span>3. 더 궁금한 것이나 이해되지 않은 것이 있나요? <small>선택</small></span><textarea rows={4} value={question} onChange={(event) => setQuestion(event.target.value)} /></label><label><span>선배들에게 한마디 남겨 주세요. <small>선택</small></span><textarea rows={3} value={message} onChange={(event) => setMessage(event.target.value)} /></label>{error && <InlineError text={error} />}<button className={styles.primaryButton} disabled={busy || !understanding}>{busy ? <Loader2 className={styles.spin} /> : <Send size={17} />} 평가 보내기</button></form></section>;
}
