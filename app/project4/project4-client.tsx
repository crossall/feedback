"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  Check,
  ChevronRight,
  Clapperboard,
  ClipboardCheck,
  Download,
  ExternalLink,
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
  Search,
  School,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  isProject4StageOpen,
  project4DefaultConfig,
  project4Id,
  project4PresentationCriteria,
  project4Stages,
  type Project4AiFeedback,
  type Project4AiReview,
  type Project4Config,
  type Project4FinalScript,
  type Project4GrowthArea,
  type Project4GrowthLevel,
  type Project4GrowthReport,
  type Project4JuniorClassSummary,
  type Project4JuniorGroupEvaluation,
  type Project4JuniorGroupSummary,
  type Project4JuniorQuiz,
  type Project4JuniorQuizAnswers,
  type Project4JuniorResponse,
  type Project4PeerResponse,
  type Project4PresentationRating,
  type Project4PresentationReview,
  type Project4Reflection,
  type Project4Representative,
  type Project4RepresentativeReason,
} from "@/lib/project4";
import styles from "./project4.module.css";

type Role = "home" | "teacherLogin" | "teacher" | "studentLogin" | "student" | "juniorLogin" | "junior";

const project4RoleViews: Record<Role, string> = {
  home: "",
  teacherLogin: "teacher-login",
  teacher: "teacher",
  studentLogin: "student-login",
  student: "student",
  juniorLogin: "junior-login",
  junior: "junior",
};

function project4RoleFromUrl(): Role {
  if (typeof window === "undefined") return "home";
  const view = new URL(window.location.href).searchParams.get("view") || "";
  return (Object.entries(project4RoleViews).find(([, value]) => value === view)?.[0] as Role | undefined) || "home";
}

function writeProject4Role(role: Role, replace = false) {
  const url = new URL(window.location.href);
  const view = project4RoleViews[role];
  if (view) url.searchParams.set("view", view);
  else url.searchParams.delete("view");
  window.history[replace ? "replaceState" : "pushState"](null, "", `${url.pathname}${url.search}${url.hash}`);
}
type TeacherTab = "setup" | "stages" | "results";
type TeacherResultView = "peer" | "representative" | "presentation" | "ai" | "final" | "junior" | "reflection" | "growth" | "summary";

type JuniorWorkspace = {
  me: {
    studentId: string;
    evaluatorClass: string;
    evaluatorClassNumber: number;
    studentNumber: number;
    name: string;
    targetClassId: string;
    targetClassName: string;
  };
  groups: Array<{ id: string; name: string; videoUrl: string }>;
  quiz: Project4JuniorQuiz | null;
  responses: Project4JuniorGroupEvaluation[];
  evaluationOpen: boolean;
};

type StudentWorkspace = {
  submittedTargetIds: string[];
  received: Array<{ id: string; good: string; blocked: string }>;
  representative: (Pick<Project4Representative, "selectedStudentId" | "selectedStudentName" | "updatedAt"> & {
    reasons: Project4RepresentativeReason[];
  }) | null;
  presentation: Project4PresentationReview | null;
  aiReview: Project4AiReview | null;
  final: Project4FinalScript | null;
  juniorSummary: Project4JuniorGroupSummary;
  juniorClassSummary: Project4JuniorClassSummary;
  reflection: Project4Reflection | null;
};

type StudentWorkspaceSetter = Dispatch<SetStateAction<StudentWorkspace>>;

type TeacherData = {
  peer: Project4PeerResponse[];
  representatives: Project4Representative[];
  presentations: Project4PresentationReview[];
  ai: Project4AiReview[];
  finals: Project4FinalScript[];
  juniors: Project4JuniorResponse[];
  juniorQuizzes: Project4JuniorQuiz[];
  juniorGroups: Project4JuniorGroupEvaluation[];
  reflections: Project4Reflection[];
  growthReports: Project4GrowthReport[];
};

const emptyWorkspace: StudentWorkspace = {
  submittedTargetIds: [],
  received: [],
  representative: null,
  presentation: null,
  aiReview: null,
  final: null,
  juniorSummary: {
    total: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    good: [],
    difficult: [],
    messages: [],
  },
  juniorClassSummary: { participants: 0, preSubmitted: 0, postSubmitted: 0, questions: [] },
  reflection: null,
};

const emptyTeacherData: TeacherData = {
  peer: [], representatives: [], presentations: [], ai: [], finals: [], juniors: [], juniorQuizzes: [], juniorGroups: [], reflections: [], growthReports: [],
};

function browserProject4InstanceId() {
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/^\/(\d{4})\/([^/]+)\/?$/);
  return match ? `${match[1]}/${decodeURIComponent(match[2])}` : "";
}

async function project4Api<T>(action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch("/api/project4/storage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, instanceId: browserProject4InstanceId() || undefined, ...payload }),
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

function project4ClassNumber(value: string) {
  return Number(
    value.match(/6\s*-\s*(\d+)/)?.[1]
    || value.match(/6\s*학년\s*(\d+)\s*반/)?.[1]
    || value.match(/(\d+)\s*반/)?.[1]
    || 0,
  );
}

export default function Project4Client({
  instanceId = "",
  ownerAccess = false,
}: {
  instanceId?: string;
  ownerAccess?: boolean;
}) {
  const [role, setRole] = useState<Role>("home");
  const [config, setConfig] = useState<Project4Config>(project4DefaultConfig);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [teacherToken, setTeacherToken] = useState("");
  const [studentToken, setStudentToken] = useState("");
  const [juniorToken, setJuniorToken] = useState("");
  const [juniorWorkspace, setJuniorWorkspace] = useState<JuniorWorkspace | null>(null);
  const [studentMe, setStudentMe] = useState({ classId: "", groupId: "", studentId: "", name: "" });
  const [workspace, setWorkspace] = useState<StudentWorkspace>(emptyWorkspace);

  const navigateRole = useCallback((nextRole: Role, replace = false) => {
    setRole(nextRole);
    writeProject4Role(nextRole, replace);
  }, []);

  useEffect(() => {
    project4Api<{ config: Project4Config }>("getConfig")
      .then((data) => setConfig(data.config))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "평가 설정을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const syncRoleFromHistory = () => {
      const nextRole = project4RoleFromUrl();
      if (nextRole === "teacher" && !teacherToken) {
        setRole("teacherLogin");
        writeProject4Role("teacherLogin", true);
      } else if (nextRole === "student" && !studentToken) {
        setRole("studentLogin");
        writeProject4Role("studentLogin", true);
      } else if (nextRole === "junior" && !juniorToken) {
        setRole("juniorLogin");
        writeProject4Role("juniorLogin", true);
      }
      else setRole(nextRole);
    };
    syncRoleFromHistory();
    window.addEventListener("popstate", syncRoleFromHistory);
    return () => window.removeEventListener("popstate", syncRoleFromHistory);
  }, [juniorToken, studentToken, teacherToken]);

  function goHome() {
    setRole("home");
    setError("");
    writeProject4Role("home", true);
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

      {role === "home" && <RoleHome config={config} setRole={(nextRole) => navigateRole(nextRole)} />}
      {role === "teacherLogin" && <TeacherLogin copiedProject={Boolean(instanceId)} ownerAccess={ownerAccess} onBack={goHome} onLogin={async (token) => {
        const loaded = await project4Api<{ config: Project4Config }>("teacherData", { token });
        setConfig(loaded.config);
        setTeacherToken(token);
        navigateRole("teacher");
      }} />}
      {role === "teacher" && <TeacherStudio config={config} setConfig={setConfig} token={teacherToken} />}
      {role === "studentLogin" && <StudentLogin config={config} onBack={goHome} onEnter={async (identity) => {
        const data = await project4Api<{ token: string }>("enterStudent", identity);
        setStudentToken(data.token);
        const loaded = await project4Api<{ config: Project4Config; me: typeof studentMe; workspace: StudentWorkspace }>("studentWorkspace", { token: data.token });
        setConfig(loaded.config);
        setStudentMe(loaded.me);
        setWorkspace(loaded.workspace);
        navigateRole("student");
      }} />}
      {role === "student" && <StudentStudio config={config} setConfig={setConfig} me={studentMe} token={studentToken} workspace={workspace} setWorkspace={setWorkspace} />}
      {role === "juniorLogin" && <JuniorLogin config={config} onBack={goHome} onEnter={async (identity) => {
        const data = await project4Api<{ token: string; workspace: JuniorWorkspace }>("enterJunior", identity);
        setJuniorToken(data.token);
        setJuniorWorkspace(data.workspace);
        navigateRole("junior");
      }} />}
      {role === "junior" && juniorWorkspace && <JuniorEvaluation token={juniorToken} workspace={juniorWorkspace} setWorkspace={setJuniorWorkspace} onDone={goHome} />}
    </main>
  );
}

function RoleHome({ config, setRole }: { config: Project4Config; setRole: (role: Role) => void }) {
  return (
    <section className={styles.home}>
      <div className={styles.homeCopy}>
        <span className={styles.kicker}><Sparkles size={15} /> SECRETS OF THE SEASONS</span>
        <h1>계절의 비밀을<br /><em>찾아서</em></h1>
        <p>{config.description}</p>
        <div className={styles.privacyLine}><ShieldCheck size={16} /><span>학생 평가는 친구에게 익명으로 보이며, 평가자 이름은 교사만 확인합니다.</span></div>
      </div>
      <div className={styles.roleGrid}>
        <button type="button" onClick={() => setRole("studentLogin")}>
          <span className={styles.roleIcon}><UserRound size={25} /></span><div><small>6학년</small><strong>프로젝트 평가 시작</strong><p>친구 피드백부터 자기평가까지 8단계로 진행해요.</p></div><ChevronRight />
        </button>
        <button type="button" onClick={() => setRole("juniorLogin")}>
          <span className={styles.roleIcon}><School size={25} /></span><div><small>5학년</small><strong>선배 영상 평가</strong><p>시작 퀴즈와 선배 영상 평가, 마무리 퀴즈를 차례로 진행해요.</p></div><ChevronRight />
        </button>
        <button type="button" onClick={() => setRole("teacherLogin")}>
          <span className={styles.roleIcon}><GraduationCap size={25} /></span><div><small>교사</small><strong>평가 운영하기</strong><p>명단과 기준을 준비하고 단계와 결과를 관리해요.</p></div><ChevronRight />
        </button>
      </div>
    </section>
  );
}

function TeacherLogin({ copiedProject, ownerAccess, onBack, onLogin }: {
  copiedProject: boolean;
  ownerAccess: boolean;
  onBack: () => void;
  onLogin: (token: string) => Promise<void>;
}) {
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
  if (copiedProject && !ownerAccess) {
    return <CenteredPanel title="교사 운영 화면" subtitle="이 프로젝트를 만든 교사 계정으로 메인페이지에서 로그인해 주세요." onBack={onBack}>
      <Link className={styles.primaryButton} href="/">메인페이지에서 로그인</Link>
    </CenteredPanel>;
  }
  return <CenteredPanel title="교사 운영 화면" subtitle={copiedProject ? "현재 로그인한 교사 계정으로 운영 화면을 엽니다." : "비밀번호를 입력하면 학생 명단과 실명 평가 기록을 확인할 수 있습니다."} onBack={onBack}>
    <form className={styles.loginForm} onSubmit={submit}>
      {!copiedProject && <label><span>교사 비밀번호</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></label>}
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
    {tab === "stages" && <TeacherStages
      config={draft}
      setStage={(stage) => save({ ...draft, openStage: stage }, `${stage}단계까지 학생에게 열었습니다.`)}
      setGroupReviewOpen={(open) => save(
        { ...draft, groupReviewOpen: open },
        open ? "다른 모둠 발표 평가를 학생에게 열었습니다." : "다른 모둠 발표 평가를 닫았습니다.",
      )}
      setJuniorEvaluationOpen={(open) => save(
        { ...draft, juniorEvaluation: { ...draft.juniorEvaluation, open } },
        open ? "5학년 선배 영상 평가를 열었습니다." : "5학년 선배 영상 평가를 닫았습니다.",
      )}
      busy={busy}
    />}
    {tab === "results" && <TeacherResults
      config={draft}
      data={data}
      setData={setData}
      token={token}
      refresh={loadResults}
      busy={busy}
    />}
  </section>;
}

function TeacherSetup({ draft, setDraft, save, busy }: { draft: Project4Config; setDraft: (config: Project4Config) => void; save: () => void; busy: boolean }) {
  function addClass() {
    const classId = project4Id("class");
    const used = new Set(draft.juniorEvaluation.classMappings.map((item) => item.juniorClassNumber));
    const classNumber = Array.from({ length: 20 }, (_, index) => index + 1).find((value) => !used.has(value)) || draft.classes.length + 1;
    setDraft({
      ...draft,
      classes: [...draft.classes, { id: classId, name: `6학년 ${classNumber}반` }],
      juniorEvaluation: {
        ...draft.juniorEvaluation,
        classMappings: [...draft.juniorEvaluation.classMappings, { id: project4Id("junior-map"), juniorClassNumber: classNumber, targetClassId: classId }],
      },
    });
  }
  function addGroup(classId: string) {
    const count = draft.groups.filter((group) => group.classId === classId).length;
    setDraft({ ...draft, groups: [...draft.groups, { id: project4Id("group"), classId, name: `${count + 1}모둠`, videoUrl: "", students: [] }] });
  }
  function updateGroup(groupId: string, patch: Partial<Project4Config["groups"][number]>) {
    setDraft({ ...draft, groups: draft.groups.map((group) => group.id === groupId ? { ...group, ...patch } : group) });
  }
  function addStudent(groupId: string, name: string) {
    const group = draft.groups.find((item) => item.id === groupId);
    const trimmedName = name.trim();
    if (!group || !trimmedName || group.students.some((student) => student.name.trim() === trimmedName)) return false;
    updateGroup(groupId, {
      students: [...group.students, { id: project4Id("student"), name: trimmedName }],
    });
    return true;
  }
  return <div className={styles.panelStack}>
    <section className={styles.panel}><div className={styles.panelHead}><div><span>01</span><h2>프로젝트 안내</h2></div></div><div className={styles.formGrid}><label><span>프로젝트 이름</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label className={styles.full}><span>학생 안내</span><textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label></div></section>
    <section className={styles.panel}><div className={styles.panelHead}><div><span>02</span><h2>평가 기준 6항목</h2></div><small>초안은 언제든 수정할 수 있습니다.</small></div><div className={styles.criteriaEdit}>{draft.criteria.map((criterion, index) => <label key={index}><b>{index + 1}</b><textarea rows={2} value={criterion} onChange={(event) => setDraft({ ...draft, criteria: draft.criteria.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} /></label>)}</div></section>
    <section className={styles.panel}><div className={styles.panelHead}><div><span>03</span><h2>반·모둠·학생 명단</h2></div><button className={styles.outlineButton} type="button" onClick={addClass}><Plus size={15} /> 반 추가</button></div>
      {draft.classes.length === 0 ? <div className={styles.empty}>반을 추가한 뒤 모둠과 학생 이름을 등록해 주세요.</div> : draft.classes.map((classroom) => <article className={styles.classEditor} key={classroom.id}><div className={styles.classEditorHead}><input value={classroom.name} onChange={(event) => setDraft({ ...draft, classes: draft.classes.map((item) => item.id === classroom.id ? { ...item, name: event.target.value } : item) })} /><div><button type="button" onClick={() => addGroup(classroom.id)}><Plus size={14} /> 모둠 추가</button><button type="button" className={styles.dangerButton} onClick={() => setDraft({ ...draft, classes: draft.classes.filter((item) => item.id !== classroom.id), groups: draft.groups.filter((group) => group.classId !== classroom.id), juniorEvaluation: { ...draft.juniorEvaluation, classMappings: draft.juniorEvaluation.classMappings.filter((mapping) => mapping.targetClassId !== classroom.id) } })}><Trash2 size={14} /></button></div></div>
        <div className={styles.groupGrid}>{draft.groups.filter((group) => group.classId === classroom.id).map((group) => <div className={styles.groupEditor} key={group.id}><div className={styles.groupTitle}><input value={group.name} onChange={(event) => updateGroup(group.id, { name: event.target.value })} /><button type="button" onClick={() => setDraft({ ...draft, groups: draft.groups.filter((item) => item.id !== group.id) })}><Trash2 size={13} /></button></div><label className={styles.videoField}><span>후배 평가 영상 주소</span><input type="url" placeholder="YouTube, Google Drive 또는 영상 주소" value={group.videoUrl} onChange={(event) => updateGroup(group.id, { videoUrl: event.target.value })} /></label><div className={styles.studentList}>{group.students.map((student) => <div key={student.id}><input value={student.name} onChange={(event) => updateGroup(group.id, { students: group.students.map((item) => item.id === student.id ? { ...item, name: event.target.value } : item) })} /><button type="button" onClick={() => updateGroup(group.id, { students: group.students.filter((item) => item.id !== student.id) })}><Trash2 size={12} /></button></div>)}</div><StudentAdder onAdd={(name) => addStudent(group.id, name)} /></div>)}</div>
      </article>)}</section>
    <section className={styles.panel}><div className={styles.panelHead}><div><span>04</span><h2>5학년 반 연결</h2></div><button className={styles.outlineButton} type="button" disabled={draft.classes.length === 0} onClick={() => { const used = new Set(draft.juniorEvaluation.classMappings.map((item) => item.juniorClassNumber)); const juniorClassNumber = Array.from({ length: 20 }, (_, index) => index + 1).find((value) => !used.has(value)) || 1; setDraft({ ...draft, juniorEvaluation: { ...draft.juniorEvaluation, classMappings: [...draft.juniorEvaluation.classMappings, { id: project4Id("junior-map"), juniorClassNumber, targetClassId: draft.classes[0]?.id || "" }] } }); }}><Plus size={15} /> 연결 추가</button></div><p className={styles.panelIntro}>5학년 학생은 자기 반만 고르면 연결된 6학년 반의 모둠 영상만 보게 됩니다.</p><div className={styles.mappingList}>{draft.juniorEvaluation.classMappings.map((mapping) => <div key={mapping.id}><label><span>5학년 반</span><select value={mapping.juniorClassNumber} onChange={(event) => setDraft({ ...draft, juniorEvaluation: { ...draft.juniorEvaluation, classMappings: draft.juniorEvaluation.classMappings.map((item) => item.id === mapping.id ? { ...item, juniorClassNumber: Number(event.target.value) } : item) } })}>{Array.from({ length: 20 }, (_, index) => index + 1).map((number) => <option key={number} value={number}>5학년 {number}반</option>)}</select></label><ChevronRight size={18} /><label><span>평가할 6학년 반</span><select value={mapping.targetClassId} onChange={(event) => setDraft({ ...draft, juniorEvaluation: { ...draft.juniorEvaluation, classMappings: draft.juniorEvaluation.classMappings.map((item) => item.id === mapping.id ? { ...item, targetClassId: event.target.value } : item) } })}>{draft.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button type="button" className={styles.dangerButton} aria-label="반 연결 삭제" title="반 연결 삭제" onClick={() => setDraft({ ...draft, juniorEvaluation: { ...draft.juniorEvaluation, classMappings: draft.juniorEvaluation.classMappings.filter((item) => item.id !== mapping.id) } })}><Trash2 size={14} /></button></div>)}</div></section>
    <div className={styles.stickySave}><span>학생 이름은 로그인 선택과 교사의 평가자 확인에 사용됩니다.</span><button className={styles.primaryButton} type="button" onClick={save} disabled={busy}>{busy ? <Loader2 className={styles.spin} /> : <Save size={16} />} 변경사항 저장</button></div>
  </div>;
}

function StudentAdder({ onAdd }: { onAdd: (name: string) => boolean }) {
  const [name, setName] = useState("");

  function add() {
    if (onAdd(name)) setName("");
  }

  return <div className={styles.addStudent}>
    <input
      value={name}
      onChange={(event) => setName(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        add();
      }}
      placeholder="학생 이름"
      aria-label="추가할 학생 이름"
    />
    <button type="button" onClick={add} aria-label="학생 추가" title="학생 추가"><Plus size={14} /></button>
  </div>;
}

function TeacherStages({ config, setStage, setGroupReviewOpen, setJuniorEvaluationOpen, busy }: {
  config: Project4Config;
  setStage: (stage: number) => void;
  setGroupReviewOpen: (open: boolean) => void;
  setJuniorEvaluationOpen: (open: boolean) => void;
  busy: boolean;
}) {
  const groupReviewOpen = config.groupReviewOpen;
  return <section className={styles.panel}>
    <div className={styles.panelHead}><div><span>진행</span><h2>학생 단계 열기</h2></div></div>
    <p className={styles.panelIntro}>선택한 단계까지 학생이 이동할 수 있습니다. 다른 모둠 발표 평가는 아래 버튼으로 별도로 열고 닫습니다.</p>
    <div className={styles.groupStageControl}>
      <Clapperboard size={21} />
      <div><b>다른 모둠 발표 평가</b><span>앞 단계를 잠가도 이 평가만 따로 열어 학생들이 같은 반의 다른 모둠을 공동으로 평가할 수 있습니다.</span></div>
      <button
        type="button"
        className={groupReviewOpen ? styles.groupStageClose : ""}
        disabled={busy}
        onClick={() => setGroupReviewOpen(!groupReviewOpen)}
      >
        {groupReviewOpen ? <Lock size={15} /> : <Clapperboard size={15} />}
        {groupReviewOpen ? "모둠평가 닫기" : "모둠평가 열기"}
      </button>
    </div>
    <div className={styles.groupStageControl}>
      <School size={21} />
      <div><b>5학년 선배 영상 평가</b><span>연결된 5학년 반이 시작 퀴즈부터 마무리 퀴즈까지 진행할 수 있습니다.</span></div>
      <button
        type="button"
        className={config.juniorEvaluation.open ? styles.groupStageClose : ""}
        disabled={busy}
        onClick={() => setJuniorEvaluationOpen(!config.juniorEvaluation.open)}
      >
        {config.juniorEvaluation.open ? <Lock size={15} /> : <School size={15} />}
        {config.juniorEvaluation.open ? "후배평가 닫기" : "후배평가 열기"}
      </button>
    </div>
    <div className={styles.stageControl}>{project4Stages.map((stage, index) => {
      const number = index + 1;
      const open = isProject4StageOpen(config, number);
      const current = number === 4 ? groupReviewOpen : number === config.openStage;
      return <button key={stage} className={current ? styles.current : open ? styles.done : ""} disabled={busy} onClick={() => number === 4 ? setGroupReviewOpen(true) : setStage(number)}><span>{open && !current ? <Check size={16} /> : number}</span><div><b>{stage}</b><small>{open ? "학생에게 열림" : number === 4 ? "위 버튼으로 별도 열기" : "클릭하여 이 단계까지 열기"}</small></div>{!open && <Lock size={15} />}</button>;
    })}</div>
  </section>;
}

function summarizeJuniorQuizzes(quizzes: Project4JuniorQuiz[]): Project4JuniorClassSummary {
  const questionSettings = [
    { id: "question1" as const, title: "여름이 겨울보다 더운 까닭", correct: 2, misconception: 1, misconceptionLabel: "태양과 가까워져서" },
    { id: "question2" as const, title: "우리나라가 여름일 때 호주가 겨울인 까닭", correct: 1, misconception: 2, misconceptionLabel: "호주가 태양에서 더 멀리 떨어져 있어서" },
  ];
  const postQuizzes = quizzes.filter((item): item is Project4JuniorQuiz & { postAnswers: Project4JuniorQuizAnswers } => Boolean(item.postAnswers));
  return {
    participants: new Set(quizzes.map((item) => item.studentId)).size,
    preSubmitted: quizzes.length,
    postSubmitted: postQuizzes.length,
    questions: questionSettings.map((question) => {
      const preCorrect = quizzes.filter((item) => item.preAnswers[question.id] === question.correct).length;
      const postCorrect = postQuizzes.filter((item) => item.postAnswers[question.id] === question.correct).length;
      return {
        id: question.id,
        title: question.title,
        preCorrect,
        preTotal: quizzes.length,
        prePercent: quizzes.length ? Math.round((preCorrect / quizzes.length) * 100) : 0,
        postCorrect,
        postTotal: postQuizzes.length,
        postPercent: postQuizzes.length ? Math.round((postCorrect / postQuizzes.length) * 100) : 0,
        misconceptionLabel: question.misconceptionLabel,
        preMisconception: quizzes.filter((item) => item.preAnswers[question.id] === question.misconception).length,
        postMisconception: postQuizzes.filter((item) => item.postAnswers[question.id] === question.misconception).length,
      };
    }),
  };
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv(fileName: string, headers: string[], rows: unknown[][]) {
  const content = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function TeacherResults({ config, data, setData, token, refresh, busy }: {
  config: Project4Config;
  data: TeacherData;
  setData: Dispatch<SetStateAction<TeacherData>>;
  token: string;
  refresh: () => void;
  busy: boolean;
}) {
  const [selectedClassState, setSelectedClass] = useState(config.classes[0]?.id || "");
  const [view, setView] = useState<TeacherResultView>("summary");
  const selectedClassId = config.classes.some((item) => item.id === selectedClassState)
    ? selectedClassState
    : config.classes[0]?.id || "";
  const selectedClass = config.classes.find((item) => item.id === selectedClassId);
  const classGroups = config.groups.filter((group) => group.classId === selectedClassId);
  const filtered = {
    peer: data.peer.filter((item) => item.classId === selectedClassId),
    representatives: data.representatives.filter((item) => item.classId === selectedClassId),
    presentations: data.presentations.filter((item) => item.classId === selectedClassId),
    ai: data.ai.filter((item) => item.classId === selectedClassId),
    finals: data.finals.filter((item) => item.classId === selectedClassId),
    juniors: (data.juniors || []).filter((item) => item.targetClassId === selectedClassId),
    juniorQuizzes: (data.juniorQuizzes || []).filter((item) => item.targetClassId === selectedClassId),
    juniorGroups: (data.juniorGroups || []).filter((item) => item.targetClassId === selectedClassId),
    reflections: data.reflections.filter((item) => item.classId === selectedClassId),
    growthReports: (data.growthReports || []).filter((item) => project4ClassNumber(item.className) === project4ClassNumber(selectedClass?.name || "")),
  };
  const resultViews: Array<{ id: TeacherResultView; label: string; count: number; icon: React.ReactNode }> = [
    { id: "peer", label: "동료평가", count: filtered.peer.length, icon: <Users size={15} /> },
    { id: "representative", label: "대표 선정", count: filtered.representatives.length, icon: <BookOpenCheck size={15} /> },
    { id: "presentation", label: "발표 평가", count: filtered.presentations.length, icon: <Clapperboard size={15} /> },
    { id: "ai", label: "모둠 AI", count: filtered.ai.length, icon: <Sparkles size={15} /> },
    { id: "final", label: "최종 대본", count: filtered.finals.length, icon: <FileText size={15} /> },
    { id: "junior", label: "후배 평가", count: filtered.juniorGroups.length + filtered.juniors.length, icon: <GraduationCap size={15} /> },
    { id: "reflection", label: "자기평가", count: filtered.reflections.length, icon: <ClipboardCheck size={15} /> },
    { id: "growth", label: "성장보고서", count: filtered.growthReports.length, icon: <FileText size={15} /> },
    { id: "summary", label: "종합결과", count: classGroups.length, icon: <BarChart3 size={15} /> },
  ];
  const selectedView = resultViews.find((item) => item.id === view) || resultViews[resultViews.length - 1];

  if (!selectedClass) {
    return <section className={styles.panel}>
      <div className={styles.panelHead}><div><h2>평가 결과</h2></div><button className={styles.outlineButton} type="button" onClick={refresh} disabled={busy}><RefreshCw className={busy ? styles.spin : ""} size={15} /> 새로고침</button></div>
      <div className={styles.empty}>먼저 설정과 명단에서 반을 등록해 주세요.</div>
    </section>;
  }

  return <div className={styles.resultDashboard}>
    <section className={styles.resultToolbar}>
      <div className={styles.resultDashboardHead}>
        <div><span>실명 결과 조회</span><h2>{selectedClass.name} · {selectedView.label}</h2></div>
        <button type="button" onClick={refresh} disabled={busy}><RefreshCw className={busy ? styles.spin : ""} size={16} /> 새로고침</button>
      </div>
      <div className={styles.resultFilterGroup}>
        <b>반 선택</b>
        <div className={styles.classResultTabs} role="tablist" aria-label="조회할 반">
          {config.classes.map((classroom) => <button key={classroom.id} type="button" role="tab" aria-selected={selectedClassId === classroom.id} className={selectedClassId === classroom.id ? styles.active : ""} onClick={() => setSelectedClass(classroom.id)}>{classroom.name}</button>)}
        </div>
      </div>
      <div className={styles.resultFilterGroup}>
        <b>평가 종류</b>
        <div className={styles.resultTypeTabs} role="tablist" aria-label="조회할 평가 종류">
          {resultViews.map((item) => <button key={item.id} type="button" role="tab" aria-selected={view === item.id} className={view === item.id ? styles.active : ""} onClick={() => setView(item.id)}>{item.icon}<span>{item.label}</span><small>{item.count}</small></button>)}
        </div>
      </div>
    </section>

    {view === "summary" && <>
      <div className={`${styles.resultStats} ${styles.resultStatsCompact}`}>{[
        ["동료평가", filtered.peer.length], ["대표 선정", filtered.representatives.length], ["발표 평가", filtered.presentations.length], ["모둠 AI", filtered.ai.length], ["최종 대본", filtered.finals.length], ["후배 응답", filtered.juniorGroups.length + filtered.juniors.length], ["자기평가", filtered.reflections.length], ["성장보고서", filtered.growthReports.length],
      ].map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <section className={styles.panel}>
        <div className={styles.panelHead}><div><span>모둠별 현황</span><h2>{selectedClass.name} 종합결과</h2></div><small>{classGroups.length}개 모둠</small></div>
        {classGroups.length === 0 ? <div className={styles.empty}>이 반에 등록된 모둠이 없습니다.</div> : <div className={styles.summaryTableWrap}><table className={styles.summaryTable}>
          <thead><tr><th>모둠</th><th>동료평가</th><th>대표 선정</th><th>발표 평가</th><th>모둠 AI</th><th>최종 대본</th><th>후배 평가</th><th>자기평가</th></tr></thead>
          <tbody>{classGroups.map((group) => {
            const peerCount = filtered.peer.filter((item) => item.groupId === group.id).length;
            const peerExpected = group.students.length * Math.max(0, group.students.length - 1);
            const representative = filtered.representatives.find((item) => item.groupId === group.id);
            const presentation = filtered.presentations.find((item) => item.evaluatorGroupId === group.id);
            const presentationCount = presentation?.targets.reduce((sum, target) => sum + target.ratings.filter(Boolean).length, 0) || 0;
            const ai = filtered.ai.find((item) => item.groupId === group.id);
            const final = filtered.finals.find((item) => item.groupId === group.id);
            const juniorCount = filtered.juniorGroups.filter((item) => item.targetGroupId === group.id).length + filtered.juniors.filter((item) => item.targetGroupId === group.id).length;
            const reflectionCount = filtered.reflections.filter((item) => item.groupId === group.id).length;
            return <tr key={group.id}>
              <th><b>{group.name}</b><small>{group.students.length}명</small></th>
              <td><b>{peerCount}</b><small>/ {peerExpected}건</small></td>
              <td className={representative ? styles.completeCell : ""}><b>{representative ? representative.selectedStudentName : "미선정"}</b><small>{representative ? "대표 작품" : "-"}</small></td>
              <td className={presentationCount > 0 ? styles.completeCell : ""}><b>{presentationCount}</b><small>항목 평가</small></td>
              <td className={ai ? styles.completeCell : ""}><b>{ai ? `${ai.revision || 1}차` : "미제출"}</b><small>{ai ? `${ai.feedbacks.length}개 피드백` : "-"}</small></td>
              <td className={final ? styles.completeCell : ""}><b>{final ? "제출" : "미제출"}</b><small>{final ? (final.mode === "pdf" ? "PDF" : "직접 작성") : "-"}</small></td>
              <td className={juniorCount > 0 ? styles.completeCell : ""}><b>{juniorCount}</b><small>명 응답</small></td>
              <td className={reflectionCount >= group.students.length && group.students.length > 0 ? styles.completeCell : ""}><b>{reflectionCount}</b><small>/ {group.students.length}명</small></td>
            </tr>;
          })}</tbody>
        </table></div>}
      </section>
    </>}

    {view === "peer" && <ResultSection title={`${selectedClass.name} · 모둠 내 동료평가 · 교사 실명 확인`} empty={filtered.peer.length === 0}>
      {classGroups.map((group) => {
        const groupResponses = filtered.peer
          .filter((item) => item.groupId === group.id)
          .sort((left, right) => left.evaluatorName.localeCompare(right.evaluatorName, "ko"));
        return <section className={styles.peerGroupResult} key={group.id}>
          <div className={styles.peerGroupResultHead}>
            <div><h3>{group.name}</h3><span>{group.students.length}명</span></div>
            <strong>{groupResponses.length}건</strong>
          </div>
          {groupResponses.length === 0 ? <div className={styles.peerGroupEmpty}>아직 작성된 동료평가가 없습니다.</div> : <div className={styles.peerGroupRecords}>
            {groupResponses.map((item) => <article className={styles.record} key={item.id}><div className={styles.recordMeta}><b>{item.evaluatorName}</b><span>→ {item.targetName}</span></div><div><p><strong>잘 전달된 부분</strong>{item.good}</p><p><strong>이해가 막힌 부분</strong>{item.blocked}</p></div></article>)}
          </div>}
        </section>;
      })}
    </ResultSection>}
    {view === "representative" && <ResultSection title={`${selectedClass.name} · 대표 작품 선정`} empty={filtered.representatives.length === 0}>{filtered.representatives.map((item) => <article className={styles.record} key={`${item.classId}-${item.groupId}`}><div className={styles.recordMeta}><b>{item.selectedStudentName} 작품</b><span>{groupLabel(config, item.groupId)}</span><small>마지막 선택: {item.submittedByName}</small></div><div>{(item.reasons || []).length === 0 ? <p><strong>선정 이유</strong>{item.reason || "아직 입력된 이유가 없습니다."}</p> : (item.reasons || []).map((reason) => <p key={reason.studentId}><strong>{reason.studentName}</strong>{reason.reason}</p>)}</div></article>)}</ResultSection>}
    {view === "presentation" && <ResultSection title={`${selectedClass.name} · 다른 모둠 발표 평가 · 교사 실명 확인`} empty={filtered.presentations.length === 0}>{filtered.presentations.map((review) => <article className={styles.presentationRecord} key={`${review.classId}-${review.evaluatorGroupId}`}><h3>{review.evaluatorGroupName}<small>마지막 입력: {review.submittedByName} · {new Date(review.updatedAt).toLocaleString("ko-KR")}</small></h3>{review.targets.map((target) => <div className={styles.presentationResultTarget} key={target.targetGroupId}><b>{target.targetGroupName}</b><div>{target.ratings.map((rating, index) => <span key={index}>{index + 1} {rating ? presentationRatingLabels[rating] : "미선택"}</span>)}</div></div>)}{review.memorable && <p><strong>기억해 두고 싶은 점</strong>{review.memorable}</p>}</article>)}</ResultSection>}
    {view === "ai" && <ResultSection title={`${selectedClass.name} · 모둠 AI 피드백 검토 · 교사용 정답`} empty={filtered.ai.length === 0}>{filtered.ai.map((review) => <article className={styles.aiRecord} key={`${review.classId}-${review.groupId}`}><h3>{groupLabel(config, review.groupId)} <small>{review.revision || 1}차 · {review.fileName} · 입력: {review.submittedByName}</small></h3>{review.feedbacks.map((feedback, index) => <div key={feedback.id}><b>{index + 1}. {feedback.title}</b><span className={feedback.accept === true ? styles.accept : styles.reject}>{feedback.accept === true ? "학생 O" : feedback.accept === false ? "학생 X" : "미응답"}</span><p><strong>정답: {feedback.isValid === true ? "O" : feedback.isValid === false ? "X" : "기존 기록"}</strong>{feedback.teacherExplanation || "교사용 해설이 없는 기존 기록입니다."}<br /><small>학생 근거: {feedback.basis || "미선택"} · 학생 이유: {feedback.reason || "미입력"}</small></p></div>)}{review.wrongFeedback && <p className={styles.wrongFeedback}><strong>잘못되었다고 본 피드백</strong>{review.wrongFeedback}</p>}</article>)}</ResultSection>}
    {view === "final" && <ResultSection title={`${selectedClass.name} · 최종 대본`} empty={filtered.finals.length === 0}>{filtered.finals.map((item) => <article className={styles.record} key={`${item.classId}-${item.groupId}`}><div className={styles.recordMeta}><b>{groupLabel(config, item.groupId)}</b><span>입력: {item.submittedByName}</span><small>{item.mode === "pdf" ? item.fileName : "직접 작성"}</small></div><div>{item.mode === "text" ? <p><strong>최종 대본</strong>{item.text}</p> : item.fileData ? <a className={styles.outlineButton} href={item.fileData} download={item.fileName || "최종-대본.pdf"}><FileText size={15} /> PDF 내려받기</a> : <p>PDF 파일 정보가 없습니다.</p>}</div></article>)}</ResultSection>}
    {view === "junior" && <JuniorTeacherResults config={config} selectedClass={selectedClass} quizzes={filtered.juniorQuizzes} evaluations={filtered.juniorGroups} legacy={filtered.juniors} />}
    {view === "reflection" && <ResultSection title={`${selectedClass.name} · 자기평가와 성찰`} empty={filtered.reflections.length === 0}>{filtered.reflections.map((item) => <article className={styles.record} key={item.studentId}><div className={styles.recordMeta}><b>{item.studentName}</b><span>{groupLabel(config, item.groupId)}</span><small>참여 {item.responsibility} · 피드백 {item.helpfulFeedback} · 수정 {item.revisedFromFeedback}</small></div><div><p><strong>고친 점</strong>{item.changed}</p><p><strong>다음 설명</strong>{item.nextExplanation}</p><p><strong>AI 미반영 이유</strong>{item.rejectedAiReason}</p></div></article>)}</ResultSection>}
    {view === "growth" && <GrowthReportsTeacherView
      key={`${selectedClassId}-growth`}
      reports={filtered.growthReports}
      token={token}
      onSaved={(saved) => setData((current) => ({
        ...current,
        growthReports: current.growthReports.map((item) => item.id === saved.id ? saved : item),
      }))}
    />}
  </div>;
}

const growthLevels: Project4GrowthLevel[] = ["상", "중", "하"];

function copyGrowthReport(report: Project4GrowthReport) {
  return structuredClone(report);
}

function growthReportClassLabel(value: string) {
  const number = project4ClassNumber(value);
  return number ? `6학년 ${number}반` : value;
}

function growthReportFileName(report: Project4GrowthReport) {
  return `${growthReportClassLabel(report.className)}-${report.groupName}-${report.studentName}-개인-성장보고서-피드백성찰.pdf`
    .replaceAll(/[^0-9A-Za-z가-힣_.-]/g, "-");
}

function growthReportClassFileName(reports: Project4GrowthReport[]) {
  const classLabel = reports[0] ? growthReportClassLabel(reports[0].className) : "6학년";
  return `${classLabel}-개인-성장보고서-전체-${reports.length}명-피드백성찰.pdf`
    .replaceAll(/[^0-9A-Za-z가-힣_.-]/g, "-");
}

async function downloadGrowthReportPages(reports: Project4GrowthReport[], options: {
  fileName: string;
  onProgress?: (completed: number, total: number) => void;
}) {
  const { saveProject4GrowthReportsPdf } = await import("@/lib/project4-growth-pdf");
  await saveProject4GrowthReportsPdf(reports, options.fileName, options.onProgress);
}

async function downloadGrowthReportPdf(report: Project4GrowthReport) {
  await downloadGrowthReportPages([report], { fileName: growthReportFileName(report) });
}

function GrowthReportsTeacherView({ reports, token, onSaved }: {
  reports: Project4GrowthReport[];
  token: string;
  onSaved: (report: Project4GrowthReport) => void;
}) {
  const [groupFilter, setGroupFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(reports[0]?.id || "");
  const [draft, setDraft] = useState<Project4GrowthReport | null>(reports[0] ? copyGrowthReport(reports[0]) : null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ completed: number; total: number } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const groups = Array.from(new Set(reports.map((item) => item.groupName))).sort((left, right) => (
    Number(left.match(/\d+/)?.[0] || 99) - Number(right.match(/\d+/)?.[0] || 99)
  ));
  const visibleReports = reports.filter((item) => (
    (groupFilter === "all" || item.groupName === groupFilter)
    && (!query.trim() || item.studentName.includes(query.trim()))
  ));
  const batchReports = reports.map((report) => report.id === draft?.id ? draft : report);

  function selectReport(report: Project4GrowthReport | undefined) {
    setSelectedId(report?.id || "");
    setDraft(report ? copyGrowthReport(report) : null);
    setMessage("");
    setError("");
  }

  function applyFilters(nextGroup: string, nextQuery: string) {
    const candidates = reports.filter((item) => (
      (nextGroup === "all" || item.groupName === nextGroup)
      && (!nextQuery.trim() || item.studentName.includes(nextQuery.trim()))
    ));
    const nextSelected = candidates.find((item) => item.id === selectedId) || candidates[0];
    if (nextSelected?.id === selectedId) return;
    selectReport(nextSelected);
  }

  function updateArea(id: Project4GrowthArea["id"], patch: Partial<Project4GrowthArea>) {
    setDraft((current) => current ? {
      ...current,
      areas: current.areas.map((item) => item.id === id ? { ...item, ...patch } : item),
    } : current);
    setMessage("");
  }

  async function saveReport() {
    if (!draft) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await project4Api<{ report: Project4GrowthReport }>("saveGrowthReport", { token, report: draft });
      onSaved(result.report);
      setDraft(copyGrowthReport(result.report));
      setMessage("성장보고서를 저장했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "성장보고서를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    if (!draft) return;
    setDownloading(true);
    setError("");
    try {
      await downloadGrowthReportPdf(draft);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "성장보고서 PDF를 만들지 못했습니다.");
    } finally {
      setDownloading(false);
    }
  }

  async function downloadClassPdf() {
    if (batchReports.length === 0) return;
    setBatchDownloading(true);
    setBatchProgress({ completed: 0, total: batchReports.length * 2 });
    setError("");
    setMessage("");
    try {
      await downloadGrowthReportPages(batchReports, {
        fileName: growthReportClassFileName(batchReports),
        onProgress: (completed, total) => setBatchProgress({ completed, total }),
      });
      setMessage(`${growthReportClassLabel(batchReports[0].className)} ${batchReports.length}명의 성장보고서를 한 파일로 저장했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "반 전체 성장보고서 PDF를 만들지 못했습니다.");
    } finally {
      setBatchDownloading(false);
      setBatchProgress(null);
    }
  }

  if (reports.length === 0) {
    return <section className={styles.panel}><div className={styles.panelHead}><div><span>개인별 결과</span><h2>성장보고서</h2></div></div><div className={styles.empty}>이 반에 연결된 성장보고서 자료가 없습니다.</div></section>;
  }

  const reviewCount = draft?.areas.filter((item) => item.status === "review").length || 0;
  const evidence = draft?.evidence;
  return <section className={styles.growthWorkspace}>
    <aside className={styles.growthRoster}>
      <div className={styles.growthRosterHead}><div><span>학생 선택</span><b>{reports.length}명</b></div><small>자료 확인이 필요한 학생을 먼저 검토하세요.</small></div>
      <label className={styles.growthSearch}><Search size={15} /><input value={query} onChange={(event) => { const value = event.target.value; setQuery(value); applyFilters(groupFilter, value); }} placeholder="이름 검색" /></label>
      <select aria-label="모둠 필터" value={groupFilter} onChange={(event) => { const value = event.target.value; setGroupFilter(value); applyFilters(value, query); }}>
        <option value="all">전체 모둠</option>
        {groups.map((group) => <option key={group} value={group}>{group}</option>)}
      </select>
      <div className={styles.growthStudentList}>
        {visibleReports.length === 0 ? <p>검색 결과가 없습니다.</p> : visibleReports.map((report) => {
          const count = report.areas.filter((item) => item.status === "review").length;
          return <button type="button" key={report.id} className={report.id === selectedId ? styles.active : ""} onClick={() => selectReport(report)}>
            <span><b>{report.studentName}</b><small>{report.groupName}</small></span>
            <em className={count > 0 ? styles.needsReview : styles.reviewed}>{count > 0 ? `확인 ${count}` : "완료"}</em>
          </button>;
        })}
      </div>
    </aside>

    {draft && evidence && <div className={styles.growthEditor}>
      <header className={styles.growthEditorHead}>
        <div><span>{growthReportClassLabel(draft.className)} · {draft.groupName}</span><h2>{draft.studentName} 성장보고서</h2><p>자동으로 연결한 자료를 확인한 뒤 문장과 수준을 최종 조정하세요.</p></div>
        <div><button className={styles.outlineButton} type="button" onClick={() => void downloadClassPdf()} disabled={batchDownloading || downloading} title={`${growthReportClassLabel(draft.className)} ${reports.length}명의 보고서를 한 파일로 내려받기`}>{batchDownloading ? <Loader2 className={styles.spin} size={16} /> : <Download size={16} />}{batchDownloading && batchProgress ? `${batchProgress.completed}/${batchProgress.total}쪽` : "반 전체 PDF"}</button><button className={styles.outlineButton} type="button" onClick={() => void downloadPdf()} disabled={downloading || batchDownloading}>{downloading ? <Loader2 className={styles.spin} size={16} /> : <Download size={16} />} 개인 PDF</button><button className={styles.primaryButton} type="button" onClick={() => void saveReport()} disabled={saving || downloading || batchDownloading}>{saving ? <Loader2 className={styles.spin} size={16} /> : <Save size={16} />} 저장</button></div>
      </header>
      {message && <div className={styles.growthMessage}><Check size={15} />{message}</div>}
      {error && <InlineError text={error} />}
      <div className={styles.growthEvidenceHead}><div><b>연결 자료</b><span>{reviewCount > 0 ? `${reviewCount}개 영역은 교사 확인이 필요합니다.` : "일곱 영역을 모두 확인했습니다."}</span></div><div><a href={evidence.individualVideo.padletUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> 반별 패들렛</a><a href={evidence.groupVideo.padletUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> 전체 패들렛</a></div></div>
      <div className={styles.growthEvidenceGrid}>
        <div><span>초안</span><b>{evidence.draft.kind === "individual" ? "개인 응답" : evidence.draft.kind === "group" ? "모둠 자료" : "미연결"}</b></div>
        <div><span>수정안</span><b>{evidence.revision.kind === "individual" ? "개인 응답" : evidence.revision.kind === "group" ? "모둠 자료" : "미연결"}</b></div>
        <div><span>개인 영상</span><b>{evidence.individualVideo.submitted ? `${evidence.individualVideo.submissionCount}회 제출` : "미확인"}</b></div>
        <div><span>모둠 영상</span><b>{evidence.groupVideo.submitted ? `제출 ${evidence.groupVideo.post}` : "미확인"}</b></div>
        <div><span>AI 판단</span><b>{evidence.aiJudgment.correct === null ? "미연결" : `${evidence.aiJudgment.correct}/${evidence.aiJudgment.total}${evidence.aiJudgment.scoreAdjustment ? " · 1문항 보정" : ""}`}</b></div>
        <div><span>후배 평가</span><b>{evidence.junior.average === null ? "응답 없음" : `${evidence.junior.average}점 · ${evidence.junior.responseCount}건 · ${evidence.junior.source === "exact" ? "직접 평가" : "1·2반 참고"}`}</b></div>
        <div><span>지필평가</span><b>{evidence.writtenAssessment.score === null ? "기록 없음" : `${evidence.writtenAssessment.score}/${evidence.writtenAssessment.total}점`}</b></div>
      </div>

      <div className={styles.growthAreaEditors}>{draft.areas.map((item, index) => <article key={item.id}>
        <header><span>{index + 1}</span><div><h3>{item.title}</h3><small>{item.source}</small></div><button type="button" className={item.status === "review" ? styles.needsReview : styles.reviewed} onClick={() => updateArea(item.id, { status: item.status === "review" ? "ready" : "review" })}>{item.status === "review" ? "확인 필요" : "확인 완료"}</button></header>
        <textarea rows={4} value={item.feedback} onChange={(event) => updateArea(item.id, { feedback: event.target.value })} aria-label={`${item.title} 피드백`} />
        <div className={styles.growthLevelControl}><b>현재 수준</b>{growthLevels.map((level) => <button type="button" key={level} className={item.level === level ? styles.active : ""} onClick={() => updateArea(item.id, { level })}>{level}</button>)}</div>
      </article>)}</div>

      <section className={styles.growthSummaryEditor}>
        <div className={styles.growthSummaryHead}><div><span>종합 정리</span><h3>학생과 학부모에게 전할 내용</h3></div><div className={styles.growthOverallLevels}>{growthLevels.map((level) => {
          const disabled = level === "상" && !evidence.individualVideo.submitted;
          return <button type="button" key={level} className={draft.overallLevel === level ? styles.active : ""} disabled={disabled} title={disabled ? "개인 영상 미제출 시 종합 수준은 중 이하로 기록됩니다." : undefined} onClick={() => setDraft({ ...draft, overallLevel: level })}>{level}</button>;
        })}</div></div>
        <label><span>종합 한마디</span><input value={draft.overallHeadline} onChange={(event) => setDraft({ ...draft, overallHeadline: event.target.value })} /></label>
        <label><span>종합 피드백</span><textarea rows={3} value={draft.overallFeedback} onChange={(event) => setDraft({ ...draft, overallFeedback: event.target.value })} /></label>
        <div><label><span>잘한 점</span><textarea rows={3} value={draft.strengthFeedback} onChange={(event) => setDraft({ ...draft, strengthFeedback: event.target.value })} /></label><label><span>다음 성장 목표</span><textarea rows={3} value={draft.nextStep} onChange={(event) => setDraft({ ...draft, nextStep: event.target.value })} /></label></div>
      </section>
    </div>}
  </section>;
}

function ResultSection({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return <section className={styles.panel}><div className={styles.panelHead}><div><h2>{title}</h2></div></div>{empty ? <div className={styles.empty}>아직 기록이 없습니다.</div> : <div className={styles.recordList}>{children}</div>}</section>;
}

function JuniorTeacherResults({ config, selectedClass, quizzes, evaluations, legacy }: {
  config: Project4Config;
  selectedClass: Project4Config["classes"][number];
  quizzes: Project4JuniorQuiz[];
  evaluations: Project4JuniorGroupEvaluation[];
  legacy: Project4JuniorResponse[];
}) {
  const summary = summarizeJuniorQuizzes(quizzes);
  const classGroups = config.groups.filter((group) => group.classId === selectedClass.id);
  const filePrefix = selectedClass.name.replaceAll(/[^0-9A-Za-z가-힣_-]/g, "-");

  function downloadQuizCsv() {
    downloadCsv(`${filePrefix}-5학년-퀴즈.csv`, [
      "5학년_반", "번호", "이름", "대상_6학년_반", "시작_문제1", "시작_문제2", "시작_점수", "시작시각", "마무리_문제1", "마무리_문제2", "마무리_점수", "마무리시각",
    ], quizzes.map((item) => [
      item.evaluatorClass, item.studentNumber, item.evaluatorName, selectedClass.name,
      item.preAnswers.question1, item.preAnswers.question2, item.preScore, item.preSubmittedAt,
      item.postAnswers?.question1 || "", item.postAnswers?.question2 || "", item.postScore ?? "", item.postSubmittedAt || "",
    ]));
  }

  function downloadEvaluationCsv() {
    downloadCsv(`${filePrefix}-5학년-모둠평가.csv`, [
      "응답ID", "5학년_반", "번호", "이름", "대상_6학년_반", "대상_모둠", "이해도", "좋았던점", "어려웠던점", "한마디", "평가순서", "제출시각",
    ], evaluations.map((item) => [
      item.id, item.evaluatorClass, item.studentNumber, item.evaluatorName, selectedClass.name,
      groupLabel(config, item.targetGroupId), item.understanding, item.good, item.difficult, item.message,
      item.evaluationOrder, item.updatedAt || item.submittedAt,
    ]));
  }

  return <div className={styles.juniorTeacherResults}>
    <section className={styles.panel}>
      <div className={styles.panelHead}><div><span>퀴즈 변화</span><h2>{selectedClass.name} 전체 학습 결과</h2></div><div className={styles.csvActions}><button className={styles.outlineButton} type="button" onClick={downloadQuizCsv} disabled={quizzes.length === 0}><Download size={15} /> 퀴즈 CSV</button><button className={styles.outlineButton} type="button" onClick={downloadEvaluationCsv} disabled={evaluations.length === 0}><Download size={15} /> 모둠평가 CSV</button></div></div>
      <div className={styles.juniorQuizStats}><div><span>참여 학생</span><b>{summary.participants}명</b></div><div><span>시작 퀴즈</span><b>{summary.preSubmitted}명</b></div><div><span>마무리 퀴즈</span><b>{summary.postSubmitted}명</b></div></div>
      <div className={styles.quizChangeGrid}>{summary.questions.map((question) => <article key={question.id}><h3>{question.title}</h3><div><b>{question.prePercent}%</b><ChevronRight size={18} /><strong>{question.postPercent}%</strong></div><p>정답: 처음 {question.preCorrect}/{question.preTotal}명 · 마지막 {question.postCorrect}/{question.postTotal}명</p><small>“{question.misconceptionLabel}” 오해: {question.preMisconception}명 → {question.postMisconception}명</small></article>)}</div>
    </section>
    <section className={styles.panel}>
      <div className={styles.panelHead}><div><span>모둠별 결과</span><h2>이해도 분포와 후배 의견</h2></div><small>교사 화면에서는 평가자 실명이 표시됩니다.</small></div>
      {classGroups.length === 0 ? <div className={styles.empty}>등록된 모둠이 없습니다.</div> : <div className={styles.juniorGroupResults}>{classGroups.map((group) => {
        const current = evaluations.filter((item) => item.targetGroupId === group.id);
        const previous = legacy.filter((item) => item.targetGroupId === group.id);
        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        current.forEach((item) => { distribution[item.understanding] += 1; });
        previous.forEach((item) => { distribution[item.understanding === "well" ? 5 : item.understanding === "some" ? 3 : 1] += 1; });
        return <article key={group.id}><header><div><h3>{group.name}</h3><span>{current.length + previous.length}명 평가</span></div><div className={styles.ratingDistribution}>{[5, 4, 3, 2, 1].map((score) => <span key={score}><b>{score}점</b>{distribution[score as 1 | 2 | 3 | 4 | 5]}명</span>)}</div></header>{current.length === 0 && previous.length === 0 ? <div className={styles.peerGroupEmpty}>아직 작성된 후배 평가가 없습니다.</div> : <div className={styles.juniorResponseList}>{current.map((item) => <div key={item.id}><b>{item.evaluatorClass} {item.studentNumber}번 {item.evaluatorName}</b><small>{item.understanding}점 · {item.evaluationOrder}번째 평가 · {new Date(item.updatedAt).toLocaleString("ko-KR")}</small>{item.good && <p><strong>좋았던 점</strong>{item.good}</p>}{item.difficult && <p><strong>어려웠던 점</strong>{item.difficult}</p>}{item.message && <p><strong>한마디</strong>{item.message}</p>}</div>)}{previous.map((item) => <div key={`legacy-${item.id}`}><b>{item.evaluatorClass} {item.evaluatorName}</b><small>기존 후배 평가 기록</small>{item.question && <p><strong>어려웠던 점</strong>{item.question}</p>}{item.message && <p><strong>한마디</strong>{item.message}</p>}</div>)}</div>}</article>;
      })}</div>}
    </section>
  </div>;
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

function StudentStudio({ config, setConfig, me, token, workspace, setWorkspace }: { config: Project4Config; setConfig: (config: Project4Config) => void; me: { classId: string; groupId: string; studentId: string; name: string }; token: string; workspace: StudentWorkspace; setWorkspace: StudentWorkspaceSetter }) {
  const [stage, setStage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const group = config.groups.find((item) => item.id === me.groupId);
  const fallbackStage = project4Stages.reduce((latest, _label, index) => isProject4StageOpen(config, index + 1) ? index + 1 : latest, 1);
  const activeStage = isProject4StageOpen(config, stage) ? stage : fallbackStage;
  async function action(name: string, payload: Record<string, unknown> = {}) { setBusy(true); setError(""); try { const result = await project4Api<{ config: Project4Config; workspace: StudentWorkspace }>(name, { token, ...payload }); if (result.config) setConfig(result.config); setWorkspace(result.workspace); return result.workspace; } catch (caught) { setError(caught instanceof Error ? caught.message : "저장하지 못했습니다."); return null; } finally { setBusy(false); } }
  return <section className={styles.studentShell}><div className={styles.studentHead}><div><span className={styles.kicker}>MY SEASON PROJECT</span><h1>{me.name}의 평가 여정</h1><p>{classLabel(config, me.classId)} · {group?.name}</p></div><div className={styles.openNotice}><Lock size={15} /><span>{config.openStage}단계까지 · 모둠평가 {config.groupReviewOpen ? "열림" : "닫힘"}</span><button type="button" onClick={() => void action("studentWorkspace")} disabled={busy} aria-label="공개 단계와 결과 새로고침" title="새로고침"><RefreshCw className={busy ? styles.spin : ""} size={15} /></button></div></div><nav className={styles.journey}>{project4Stages.map((label, index) => { const number = index + 1; const locked = !isProject4StageOpen(config, number); return <button key={label} disabled={locked} className={activeStage === number ? styles.active : ""} onClick={() => setStage(number)}><span>{locked ? <Lock size={13} /> : number}</span><small>{label}</small></button>; })}</nav>{error && <InlineError text={error} />}<div className={styles.studentWork}>
    {activeStage === 1 && <PeerStep config={config} group={group} me={me} workspace={workspace} busy={busy} action={action} />}
    {activeStage === 2 && <ReceivedStep workspace={workspace} />}
    {activeStage === 3 && <RepresentativeStep group={group} me={me} token={token} workspace={workspace} setWorkspace={setWorkspace} />}
    {activeStage === 4 && <PresentationReviewStep config={config} me={me} token={token} workspace={workspace} setWorkspace={setWorkspace} />}
    {activeStage === 5 && <AiStep key={workspace.aiReview?.updatedAt || "empty"} config={config} group={group} me={me} token={token} workspace={workspace} setWorkspace={setWorkspace} busy={busy} action={action} />}
    {activeStage === 6 && <FinalStep workspace={workspace} busy={busy} action={action} />}
    {activeStage === 7 && <JuniorWaitStep summary={workspace.juniorSummary} classSummary={workspace.juniorClassSummary} />}
    {activeStage === 8 && <ReflectionStep workspace={workspace} busy={busy} action={action} />}
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

function RepresentativeStep({ group, me, token, workspace, setWorkspace }: {
  group?: Project4Config["groups"][number];
  me: { studentId: string };
  token: string;
  workspace: StudentWorkspace;
  setWorkspace: StudentWorkspaceSetter;
}) {
  const [shared, setShared] = useState(workspace.representative);
  const [reason, setReason] = useState(workspace.representative?.reasons.find((item) => item.studentId === me.studentId)?.reason || "");
  const [savingSelection, setSavingSelection] = useState(false);
  const [savingReason, setSavingReason] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const reasonDirtyRef = useRef(false);

  const applySharedRepresentative = useCallback((representative: StudentWorkspace["representative"]) => {
    setShared(representative);
    setWorkspace((current) => ({ ...current, representative }));
    if (!reasonDirtyRef.current) {
      setReason(representative?.reasons.find((item) => item.studentId === me.studentId)?.reason || "");
    }
    setLastSyncedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  }, [me.studentId, setWorkspace]);

  useEffect(() => {
    let active = true;
    async function loadSharedRepresentative() {
      try {
        const result = await project4Api<{ representative: StudentWorkspace["representative"] }>("representativeWorkspace", { token });
        if (!active) return;
        applySharedRepresentative(result.representative);
        setSyncError("");
      } catch (caught) {
        if (active) setSyncError(caught instanceof Error ? caught.message : "공동 대표 선택을 불러오지 못했습니다.");
      }
    }
    void loadSharedRepresentative();
    const timer = window.setInterval(() => void loadSharedRepresentative(), 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [applySharedRepresentative, token]);

  async function selectRepresentative(selectedStudentId: string) {
    if (savingSelection) return;
    const selected = group?.students.find((item) => item.id === selectedStudentId);
    if (!selected) return;
    setSavingSelection(true);
    setSyncError("");
    setShared((current) => ({
      selectedStudentId,
      selectedStudentName: selected.name,
      reasons: current?.reasons || [],
      updatedAt: current?.updatedAt || "",
    }));
    try {
      const result = await project4Api<{ representative: StudentWorkspace["representative"] }>("updateRepresentativeSelection", { token, selectedStudentId });
      applySharedRepresentative(result.representative);
    } catch (caught) {
      setSyncError(caught instanceof Error ? caught.message : "대표 작품 선택을 저장하지 못했습니다.");
    } finally {
      setSavingSelection(false);
    }
  }

  async function saveReason(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim() || !shared) return;
    setSavingReason(true);
    setSyncError("");
    try {
      const result = await project4Api<{ representative: StudentWorkspace["representative"] }>("saveRepresentativeReason", { token, reason });
      reasonDirtyRef.current = false;
      applySharedRepresentative(result.representative);
    } catch (caught) {
      setSyncError(caught instanceof Error ? caught.message : "나의 선정 이유를 저장하지 못했습니다.");
    } finally {
      setSavingReason(false);
    }
  }

  return <>
    <StepTitle number={3} title="함께 보고 싶은 설명 고르기" text="모둠원이 함께 대표 작품 하나를 선택하고, 선정 이유는 각자 작성합니다." icon={<BookOpenCheck />} />
    <div className={styles.representativeLayout}>
      <section className={styles.taskCard}>
        <div className={styles.representativeHeading}><div><b>함께 보고 싶은 설명</b><span>이름을 누르면 모둠의 공동 선택이 바로 바뀝니다.</span></div>{shared && <strong>{shared.selectedStudentName} 작품</strong>}</div>
        <div className={styles.representativeCandidates}>{group?.students.map((item) => <button type="button" key={item.id} className={shared?.selectedStudentId === item.id ? styles.active : ""} disabled={savingSelection} onClick={() => void selectRepresentative(item.id)}><UserRound size={20} /><span>{item.name}</span>{shared?.selectedStudentId === item.id && <Check size={17} />}</button>)}</div>
        <p className={syncError ? styles.representativeError : styles.helper} aria-live="polite">{syncError || (savingSelection ? "공동 선택을 저장하고 있습니다." : lastSyncedAt ? `${lastSyncedAt} 공동 선택 확인` : "공동 선택을 불러오고 있습니다.")}</p>
      </section>
      <form className={styles.taskCard} onSubmit={saveReason}>
        <label><span>내가 이 작품을 함께 보고 싶은 이유</span><textarea rows={5} value={reason} onChange={(event) => { reasonDirtyRef.current = true; setReason(event.target.value); }} placeholder="예: 2번 기준처럼 지구본을 돌리며 말해서 따라가기 쉬웠습니다." /></label>
        <button className={styles.primaryButton} disabled={savingReason || !shared || !reason.trim()}>{savingReason ? <Loader2 className={styles.spin} /> : <Save size={16} />} 나의 이유 저장</button>
      </form>
    </div>
    <section className={styles.representativeReasons}><div><MessageSquareText size={19} /><h3>모둠원이 쓴 선정 이유</h3><span>{shared?.reasons.length || 0}명</span></div>{!shared || shared.reasons.length === 0 ? <p>아직 저장된 선정 이유가 없습니다.</p> : <div>{shared.reasons.map((item) => <article key={item.studentId}><header><b>{item.studentName}</b><span>{item.selectedStudentName} 작품에 대해 작성</span></header><p>{item.reason}</p></article>)}</div>}</section>
  </>;
}

const presentationRatingLabels: Record<Project4PresentationRating, string> = {
  good: "잘함",
  average: "보통",
  needsWork: "아쉬움",
};

type PresentationDraft = {
  targets: Array<{
    targetGroupId: string;
    targetGroupName: string;
    ratings: Array<Project4PresentationRating | null>;
  }>;
  memorable: string;
};

function mergePresentationDraft(
  current: PresentationDraft,
  shared: Project4PresentationReview | null,
  pendingCells: Set<string>,
  preserveMemory: boolean,
): PresentationDraft {
  return {
    targets: current.targets.map((target) => {
      const saved = shared?.targets.find((item) => item.targetGroupId === target.targetGroupId);
      return {
        ...target,
        ratings: target.ratings.map((rating, criterionIndex) => (
          pendingCells.has(`${target.targetGroupId}-${criterionIndex}`)
            ? rating
            : saved?.ratings[criterionIndex] || null
        )),
      };
    }),
    memorable: preserveMemory ? current.memorable : shared?.memorable || "",
  };
}

function PresentationReviewStep({ config, me, token, workspace, setWorkspace }: {
  config: Project4Config;
  me: { classId: string; groupId: string };
  token: string;
  workspace: StudentWorkspace;
  setWorkspace: StudentWorkspaceSetter;
}) {
  const otherGroups = config.groups.filter((group) => group.classId === me.classId && group.id !== me.groupId);
  const [draft, setDraft] = useState<PresentationDraft>(() => ({
    targets: otherGroups.map((group) => {
      const saved = workspace.presentation?.targets.find((target) => target.targetGroupId === group.id);
      return {
        targetGroupId: group.id,
        targetGroupName: group.name,
        ratings: Array.from(
          { length: project4PresentationCriteria.length },
          (_, index) => saved?.ratings[index] || null,
        ),
      };
    }),
    memorable: workspace.presentation?.memorable || "",
  }));
  const [savingCells, setSavingCells] = useState<string[]>([]);
  const [savingMemory, setSavingMemory] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const pendingCellsRef = useRef(new Set<string>());
  const memoryDirtyRef = useRef(false);
  const completedRatings = draft.targets.reduce((total, target) => total + target.ratings.filter(Boolean).length, 0);
  const totalRatings = draft.targets.length * project4PresentationCriteria.length;

  useEffect(() => {
    let active = true;
    async function loadSharedPresentation() {
      try {
        const result = await project4Api<{ presentation: Project4PresentationReview | null }>("presentationWorkspace", { token });
        if (!active) return;
        setDraft((current) => mergePresentationDraft(
          current,
          result.presentation,
          pendingCellsRef.current,
          memoryDirtyRef.current,
        ));
        setWorkspace((current) => ({ ...current, presentation: result.presentation }));
        setLastSyncedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        setSyncError("");
      } catch (caught) {
        if (active) setSyncError(caught instanceof Error ? caught.message : "공동 평가를 불러오지 못했습니다.");
      }
    }
    void loadSharedPresentation();
    const timer = window.setInterval(() => void loadSharedPresentation(), 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [token, setWorkspace]);

  async function setRating(targetGroupId: string, criterionIndex: number, rating: Project4PresentationRating | null) {
    const cellKey = `${targetGroupId}-${criterionIndex}`;
    if (pendingCellsRef.current.has(cellKey)) return;
    pendingCellsRef.current.add(cellKey);
    setSavingCells((current) => [...current, cellKey]);
    setSyncError("");
    setDraft((current) => ({
      ...current,
      targets: current.targets.map((target) => target.targetGroupId === targetGroupId ? {
        ...target,
        ratings: target.ratings.map((value, index) => index === criterionIndex ? rating : value),
      } : target),
    }));
    try {
      const result = await project4Api<{ presentation: Project4PresentationReview | null }>("updatePresentationReview", {
        token,
        targetGroupId,
        criterionIndex,
        rating,
      });
      pendingCellsRef.current.delete(cellKey);
      setDraft((current) => mergePresentationDraft(current, result.presentation, pendingCellsRef.current, memoryDirtyRef.current));
      setWorkspace((current) => ({ ...current, presentation: result.presentation }));
      setLastSyncedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (caught) {
      pendingCellsRef.current.delete(cellKey);
      setSyncError(caught instanceof Error ? caught.message : "선택을 저장하지 못했습니다.");
    } finally {
      setSavingCells((current) => current.filter((item) => item !== cellKey));
    }
  }

  async function saveMemory(event: FormEvent) {
    event.preventDefault();
    setSavingMemory(true);
    setSyncError("");
    try {
      const result = await project4Api<{ presentation: Project4PresentationReview | null }>("updatePresentationReview", {
        token,
        memorable: draft.memorable,
      });
      memoryDirtyRef.current = false;
      setDraft((current) => mergePresentationDraft(current, result.presentation, pendingCellsRef.current, false));
      setWorkspace((current) => ({ ...current, presentation: result.presentation }));
      setLastSyncedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (caught) {
      setSyncError(caught instanceof Error ? caught.message : "공동 메모를 저장하지 못했습니다.");
    } finally {
      setSavingMemory(false);
    }
  }

  return <>
    <StepTitle number={4} title="다른 모둠 발표 평가하기" text="패들렛에서 다른 모둠 영상을 보며 모둠원이 함께 한 장의 평가표를 작성하세요." icon={<Clapperboard />} />
    {otherGroups.length === 0 ? <div className={styles.empty}>같은 반에 평가할 다른 모둠이 없습니다. 다음 열린 단계로 이동해도 됩니다.</div> : <form className={styles.presentationForm} onSubmit={saveMemory}>
      <div className={styles.presentationNotice}><Users size={18} /><div><b>모둠 공동 평가표입니다.</b><span>선택된 버튼을 다시 누르면 해제됩니다. 같은 칸은 모둠원이 마지막으로 누른 상태로 바뀝니다.</span></div><strong>{completedRatings}/{totalRatings} 선택</strong></div>
      <div className={styles.presentationTargets}>{draft.targets.map((target) => <article className={styles.presentationTarget} key={target.targetGroupId}>
        <header><Clapperboard size={18} /><h3>{target.targetGroupName}</h3><span>{target.ratings.filter(Boolean).length}/6</span></header>
        <div>{project4PresentationCriteria.map((criterion, criterionIndex) => <section className={styles.presentationCriterion} key={criterion.title}>
          <div><b>{criterionIndex + 1}. {criterion.title}</b><p>{criterion.description}</p></div>
          <div className={styles.presentationChoices} role="group" aria-label={`${target.targetGroupName} ${criterion.title}`}>
            {(Object.entries(presentationRatingLabels) as Array<[Project4PresentationRating, string]>).map(([rating, label]) => {
              const cellKey = `${target.targetGroupId}-${criterionIndex}`;
              const selected = target.ratings[criterionIndex] === rating;
              return <button type="button" aria-pressed={selected} disabled={savingCells.includes(cellKey)} className={selected ? styles.active : ""} key={rating} onClick={() => void setRating(target.targetGroupId, criterionIndex, selected ? null : rating)}>{savingCells.includes(cellKey) && selected ? "저장 중" : label}</button>;
            })}
          </div>
        </section>)}</div>
      </article>)}</div>
      <label className={styles.presentationMemory}><span>발표를 보며 기억해 두고 싶은 것</span><small>이 메모도 모둠원이 함께 봅니다. 어느 모둠의 어떤 점이 좋았는지 기준 번호와 함께 적어 주세요.</small><textarea rows={5} value={draft.memorable} onChange={(event) => { memoryDirtyRef.current = true; setDraft({ ...draft, memorable: event.target.value }); }} placeholder="예: 2모둠은 2번 기준에서 지구본을 움직이는 동작과 설명이 잘 맞았습니다." /></label>
      <div className={styles.presentationActions}><p className={syncError ? styles.presentationError : ""} aria-live="polite">{syncError || (savingCells.length > 0 ? "선택을 공동 평가표에 저장하고 있습니다." : lastSyncedAt ? `${lastSyncedAt} 공동 기록 확인` : "공동 기록을 불러오고 있습니다.")}</p><button className={styles.primaryButton} disabled={savingMemory}>{savingMemory ? <Loader2 className={styles.spin} /> : <Save size={16} />} 공동 메모 저장</button></div>
    </form>}
  </>;
}

function AiStep({ config, group, me, token, workspace, setWorkspace, busy, action }: {
  config: Project4Config;
  group?: Project4Config["groups"][number];
  me: { classId: string; groupId: string; name: string };
  token: string;
  workspace: StudentWorkspace;
  setWorkspace: StudentWorkspaceSetter;
  busy: boolean;
  action: (name: string, payload?: Record<string, unknown>) => Promise<StudentWorkspace | null>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [review, setReview] = useState<Project4AiReview | null>(workspace.aiReview);
  const [groupGenerating, setGroupGenerating] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");
  const sheetRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<Project4AiReview | null>(workspace.aiReview);
  const reviewDirtyRef = useRef(false);

  const applySharedAiReview = useCallback((sharedReview: Project4AiReview | null) => {
    const current = reviewRef.current;
    if (!sharedReview && current) return;
    const isNewGeneration = Boolean(sharedReview && (!current
      || sharedReview.revision !== current.revision
      || sharedReview.generatedAt !== current.generatedAt));
    if (reviewDirtyRef.current && !isNewGeneration) return;
    if (isNewGeneration) reviewDirtyRef.current = false;
    reviewRef.current = sharedReview;
    setReview(sharedReview);
    setWorkspace((currentWorkspace) => ({ ...currentWorkspace, aiReview: sharedReview }));
    setLastSyncedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  }, [setWorkspace]);

  useEffect(() => {
    if (generating) return;
    let active = true;
    async function loadSharedAiReview() {
      try {
        const result = await project4Api<{ aiReview: Project4AiReview | null; generating: boolean }>("aiWorkspace", { token });
        if (!active) return;
        setGroupGenerating(result.generating);
        applySharedAiReview(result.aiReview);
        setSyncError("");
      } catch (caught) {
        if (active) setSyncError(caught instanceof Error ? caught.message : "모둠 AI 피드백을 불러오지 못했습니다.");
      }
    }
    void loadSharedAiReview();
    const timer = window.setInterval(() => void loadSharedAiReview(), 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [applySharedAiReview, generating, token]);

  async function generate() {
    if (!file) return;
    setGenerating(true);
    setGroupGenerating(true);
    setError("");
    try {
      const pdfData = await fileAsDataUrl(file);
      const response = await fetch("/api/project4/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, fileName: file.name, pdfData, instanceId: browserProject4InstanceId() || undefined }),
      });
      const data = await response.json() as { review?: Project4AiReview; error?: string };
      if (!response.ok || !data.review) throw new Error(data.error || "모둠 AI 피드백을 만들지 못했습니다.");
      reviewDirtyRef.current = false;
      reviewRef.current = data.review;
      setReview(data.review);
      setWorkspace((current) => ({ ...current, aiReview: data.review || null }));
      setLastSyncedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setFile(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "모둠 AI 피드백을 만들지 못했습니다.");
    } finally {
      setGenerating(false);
      setGroupGenerating(false);
    }
  }

  function updateFeedback(id: string, patch: Partial<Project4AiFeedback>) {
    if (!review) return;
    reviewDirtyRef.current = true;
    const nextReview = {
      ...review,
      feedbacks: review.feedbacks.map((item) => item.id === id ? { ...item, ...patch } : item),
    };
    reviewRef.current = nextReview;
    setReview(nextReview);
  }

  async function saveReview() {
    if (!review) return;
    const loaded = await action("saveAiReview", { review });
    if (loaded?.aiReview) {
      reviewDirtyRef.current = false;
      reviewRef.current = loaded.aiReview;
      setReview(loaded.aiReview);
    }
  }

  async function downloadPdf() {
    if (!review || !sheetRef.current) return;
    const sheet = sheetRef.current;
    setDownloading(true);
    setError("");
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const pages = Array.from(sheet.querySelectorAll<HTMLElement>("[data-pdf-page]"));
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      for (let index = 0; index < pages.length; index += 1) {
        const frame = document.createElement("iframe");
        Object.assign(frame.style, {
          position: "fixed",
          top: "0",
          left: "-12000px",
          width: "794px",
          height: "1123px",
          border: "0",
          pointerEvents: "none",
        });
        document.body.appendChild(frame);

        const frameDocument = frame.contentDocument;
        if (!frameDocument) throw new Error("PDF 출력 화면을 준비하지 못했습니다.");
        frameDocument.open();
        frameDocument.write(`<!doctype html><html><head><base href="${window.location.origin}/"></head><body></body></html>`);
        frameDocument.close();

        const styleLoads: Promise<void>[] = [];
        document.querySelectorAll<HTMLStyleElement | HTMLLinkElement>('style, link[rel="stylesheet"]').forEach((source) => {
          const copied = source.cloneNode(true) as HTMLStyleElement | HTMLLinkElement;
          if (copied instanceof HTMLLinkElement) {
            styleLoads.push(new Promise((resolve) => {
              copied.addEventListener("load", () => resolve(), { once: true });
              copied.addEventListener("error", () => resolve(), { once: true });
            }));
          }
          frameDocument.head.appendChild(copied);
        });

        Object.assign(frameDocument.documentElement.style, {
          width: "794px",
          height: "1123px",
          margin: "0",
        });
        Object.assign(frameDocument.body.style, {
          width: "794px",
          height: "1123px",
          margin: "0",
          overflow: "hidden",
          background: "#ffffff",
        });
        const page = pages[index].cloneNode(true) as HTMLElement;
        Object.assign(page.style, {
          position: "relative",
          top: "0",
          left: "0",
          display: "block",
        });
        frameDocument.body.appendChild(page);

        let canvas: HTMLCanvasElement;
        try {
          await Promise.all(styleLoads);
          await frameDocument.fonts.ready;
          await new Promise<void>((resolve) => frame.contentWindow?.requestAnimationFrame(() => resolve()));
          canvas = await html2canvas(page, {
            scale: 2,
            backgroundColor: "#ffffff",
            width: 794,
            height: 1123,
            windowWidth: 794,
            windowHeight: 1123,
            logging: false,
            useCORS: true,
          });
        } finally {
          frame.remove();
        }
        if (index > 0) pdf.addPage();
        const ratio = Math.min(190 / canvas.width, 277 / canvas.height);
        const width = canvas.width * ratio;
        const height = canvas.height * ratio;
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", (210 - width) / 2, 10, width, height, undefined, "FAST");
      }
      pdf.save(`${classLabel(config, me.classId)}-${groupLabel(config, me.groupId)}-AI-피드백-검토지-${review.revision || 1}차.pdf`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "PDF를 만들지 못했습니다.");
    } finally {
      setDownloading(false);
    }
  }

  const complete = review?.feedbacks.every((item) => typeof item.accept === "boolean" && item.basis && item.reason?.trim());
  return <>
    <StepTitle number={5} title="모둠 스크립트의 AI 피드백 검토하기" text="모둠 대본 한 편에서 피드백을 받고, 무엇을 반영할지 배운 근거로 함께 결정하세요." icon={<Sparkles />} />
    <div className={`${styles.presentationNotice} ${styles.sharedAiNotice}`}><Users size={18} /><div><b>모둠 공용 AI 피드백입니다.</b><span>{syncError || "한 명이 스크립트를 올리면 같은 모둠원 화면에도 동일한 피드백이 자동으로 나타납니다."}</span></div><strong>{generating || groupGenerating ? "분석 중" : review ? `${review.revision || 1}차 공유됨` : lastSyncedAt ? "대기 중" : "확인 중"}</strong></div>
    <div className={styles.groupFeedbackToolbar}>
      <label className={styles.filePicker}><Upload size={25} /><div><b>{file?.name || (review ? "고친 모둠 스크립트 PDF 선택" : "모둠 스크립트 PDF 선택")}</b><span>3MB 이하 PDF이며, 분석 후 사이트에 원본 파일을 저장하지 않습니다.</span></div><input type="file" accept="application/pdf" disabled={generating || groupGenerating} onChange={(event: ChangeEvent<HTMLInputElement>) => { const next = event.target.files?.[0] || null; if (next && next.size > 3 * 1024 * 1024) { setError("PDF는 3MB 이하여야 합니다."); setFile(null); return; } setError(""); setFile(next); }} /></label>
      <button className={styles.primaryButton} type="button" onClick={generate} disabled={!file || generating || groupGenerating}>{generating ? <><Loader2 className={styles.spin} /> 스크립트를 살펴보는 중...</> : groupGenerating ? <><Loader2 className={styles.spin} /> 모둠원이 분석 중...</> : <><Sparkles size={16} /> {review ? "새 대본으로 다시 받기" : "AI 피드백 받기"}</>}</button>
      {review && <button className={styles.outlineButton} type="button" onClick={downloadPdf} disabled={downloading}>{downloading ? <Loader2 className={styles.spin} /> : <Download size={16} />} 평가지 PDF</button>}
    </div>
    {error && <InlineError text={error} />}
    {review ? <>
      <div className={styles.groupFeedbackMeta}><div><b>{review.revision || 1}차 모둠 AI 피드백</b><span>{review.fileName}</span></div><small>{new Date(review.generatedAt || review.updatedAt).toLocaleString("ko-KR")}</small></div>
      <div className={styles.aiFeedbackList}>{review.feedbacks.map((feedback, index) => <article key={feedback.id}><div className={styles.aiFeedbackHead}><span>{index + 1}</span><div><h3>{feedback.title}</h3><small>관련 기준 {feedback.criterionNumbers?.join(", ") || "-"}</small></div></div><p>{feedback.feedback}</p><blockquote><b>스크립트에서 확인한 근거</b>{feedback.evidence}</blockquote><div className={styles.decisionRow}><button type="button" className={feedback.accept === true ? styles.activeYes : ""} onClick={() => updateFeedback(feedback.id, { accept: true })}>O 반영</button><button type="button" className={feedback.accept === false ? styles.activeNo : ""} onClick={() => updateFeedback(feedback.id, { accept: false })}>X 반영하지 않음</button></div><label><span>무엇을 보고 정했나요?</span><select value={feedback.basis || ""} onChange={(event) => updateFeedback(feedback.id, { basis: event.target.value as Project4AiFeedback["basis"] })}><option value="">근거 선택</option><option value="measurement">① 우리가 측정한 자료</option><option value="experiment">② 지구본 실험 결과</option><option value="criteria">③ 우리가 만든 평가 기준</option><option value="unsure">④ 잘 모르겠음</option></select></label><label><span>그렇게 정한 까닭</span><textarea rows={3} value={feedback.reason || ""} onChange={(event) => updateFeedback(feedback.id, { reason: event.target.value })} placeholder="측정 자료, 지구본 실험, 평가 기준을 근거로 써 보세요." /></label></article>)}</div>
      <label className={styles.wrongFeedback}><span>다섯 개 중 잘못된 피드백이 있었다면 몇 번이라고 생각하나요? 그렇게 본 까닭은?</span><textarea rows={4} value={review.wrongFeedback} onChange={(event) => { reviewDirtyRef.current = true; const nextReview = { ...review, wrongFeedback: event.target.value }; reviewRef.current = nextReview; setReview(nextReview); }} /></label>
      <div className={styles.groupFeedbackActions}><p>모두 반영할 필요는 없습니다. 판단이 어려우면 측정 자료나 지구본 실험으로 직접 확인하세요.</p><button className={styles.primaryButton} type="button" disabled={busy || !complete} onClick={saveReview}>{busy ? <Loader2 className={styles.spin} /> : <Save size={16} />} 모둠 판단 저장</button></div>
      <GroupFeedbackPdf ref={sheetRef} config={config} group={group} me={me} review={review} />
    </> : <div className={styles.empty}>모둠 스크립트 PDF 한 편을 올리면 AI 피드백 5개와 검토지가 여기에 표시됩니다.</div>}
  </>;
}

function GroupFeedbackPdf({ ref, config, group, me, review }: {
  ref: React.RefObject<HTMLDivElement | null>;
  config: Project4Config;
  group?: Project4Config["groups"][number];
  me: { classId: string; groupId: string; name: string };
  review: Project4AiReview;
}) {
  const pageGroups = [
    { feedbacks: review.feedbacks.slice(0, 2), offset: 0 },
    { feedbacks: review.feedbacks.slice(2, 4), offset: 2 },
    { feedbacks: review.feedbacks.slice(4), offset: 4 },
  ];
  const members = group?.students.map((student) => student.name).join(", ") || "";
  const basisLabels: Record<NonNullable<Project4AiFeedback["basis"]>, string> = {
    measurement: "측정 자료",
    experiment: "지구본 실험",
    criteria: "평가 기준",
    unsure: "잘 모르겠음",
  };
  return (
    <div className={styles.pdfDocument} ref={ref} aria-hidden="true">
      {pageGroups.map(({ feedbacks, offset }, pageIndex) => (
        <section className={styles.pdfPage} data-pdf-page key={pageIndex}>
          <header>
            <small>PROJECT 4 · SECRETS OF THE SEASONS</small>
            <h1>AI 피드백 검토지</h1>
            <p>모둠 대본에 대한 AI 피드백 - 무엇을 반영할지 우리가 정합니다.</p>
          </header>
          <div className={styles.pdfIdentity}>
            <b>{classLabel(config, me.classId)} · {groupLabel(config, me.groupId)}</b>
            <span>모둠원 {members}</span>
            <span>{review.revision || 1}차 · {review.fileName}</span>
          </div>
          {pageIndex === 0 && (
            <div className={styles.pdfGuide}>
              <b>판단 기준</b>
              <p>① 우리가 측정하거나 지구본으로 확인한 것과 맞는가?</p>
              <p>② 우리가 만든 평가 기준(루브릭)에 맞는가?</p>
            </div>
          )}
          <div className={styles.pdfFeedbacks}>
            {feedbacks.map((feedback, localIndex) => {
              const index = offset + localIndex;
              return (
                <article key={feedback.id}>
                  <div>
                    <b>{index + 1}</b>
                    <h2>{feedback.title}</h2>
                    <span>관련 기준 {feedback.criterionNumbers.join(", ") || "-"}</span>
                  </div>
                  <p>{feedback.feedback}</p>
                  <blockquote>{feedback.evidence}</blockquote>
                  <div className={styles.pdfDecision}>
                    <b>모둠 판단</b>
                    <span>{feedback.accept === true ? "O 반영" : feedback.accept === false ? "X 반영하지 않음" : "O / X"}</span>
                  </div>
                  <div className={styles.pdfDecision}>
                    <b>확인한 근거</b>
                    <span>{feedback.basis ? basisLabels[feedback.basis] : " "}</span>
                  </div>
                  <div className={styles.pdfReason}>
                    <b>그렇게 정한 까닭</b>
                    <p>{feedback.reason || " "}</p>
                  </div>
                </article>
              );
            })}
          </div>
          <footer>
            <b>모두 반영할 필요는 없습니다.</b>
            <span>요청: {me.name} · 판단이 어려우면 측정 자료와 지구본 실험으로 확인해 보세요.</span>
            <small>{pageIndex + 1} / {pageGroups.length}</small>
          </footer>
        </section>
      ))}
    </div>
  );
}

function FinalStep({ workspace, busy, action }: { workspace: StudentWorkspace; busy: boolean; action: (name: string, payload?: Record<string, unknown>) => Promise<StudentWorkspace | null> }) {
  const [mode, setMode] = useState<"text" | "pdf">(workspace.final?.mode || "text"); const [text, setText] = useState(workspace.final?.text || ""); const [file, setFile] = useState<File | null>(null); const [error, setError] = useState("");
  async function saveFinal() { setError(""); try { const fileData = mode === "pdf" ? (file ? await fileAsDataUrl(file) : workspace.final?.fileData) : undefined; await action("saveFinal", { final: { mode, text, fileName: file?.name || workspace.final?.fileName || "", fileData } }); } catch (caught) { setError(caught instanceof Error ? caught.message : "최종 대본을 저장하지 못했습니다."); } }
  return <><StepTitle number={6} title="최종 대본 완성하기" text="반영하기로 한 것만 고쳐 최종 대본을 완성하세요. 남반구 설명이 들어갔는지도 확인합니다." icon={<FileText />} /><div className={styles.taskCard}><div className={styles.segment}><button className={mode === "text" ? styles.active : ""} onClick={() => setMode("text")}>화면에 직접 작성</button><button className={mode === "pdf" ? styles.active : ""} onClick={() => setMode("pdf")}>PDF 업로드</button></div>{mode === "text" ? <label><span>고친 최종 대본</span><textarea rows={14} value={text} onChange={(event) => setText(event.target.value)} /></label> : <label className={styles.filePicker}><Upload size={25} /><div><b>{file?.name || workspace.final?.fileName || "최종 대본 PDF 선택"}</b><span>고친 부분을 다른 색으로 표시하면 변화가 잘 보입니다.</span></div><input type="file" accept="application/pdf" onChange={(event) => { const next = event.target.files?.[0] || null; if (next && next.size > 10 * 1024 * 1024) { setError("PDF는 10MB 이하여야 합니다."); return; } setFile(next); }} /></label>}{error && <InlineError text={error} />}<button className={styles.primaryButton} onClick={saveFinal} disabled={busy || (mode === "text" ? !text.trim() : !file && !workspace.final?.fileData)}>{busy ? <Loader2 className={styles.spin} /> : <Save size={16} />} 최종 대본 저장</button>{workspace.final && <p className={styles.helper}>최종 대본이 저장되어 있습니다. 다시 저장하면 최신 내용으로 바뀝니다.</p>}</div></>;
}

function JuniorWaitStep({ summary, classSummary }: { summary: StudentWorkspace["juniorSummary"]; classSummary: Project4JuniorClassSummary }) {
  return <>
    <StepTitle number={7} title="후배들의 이해 확인 기다리기" text="5학년 후배들이 선배 영상을 보고 남긴 익명 결과입니다." icon={<School />} />
    <div className={styles.summaryCard}><strong>{summary.total}명</strong><span>우리 모둠 영상을 평가한 후배</span><div>{[5, 4, 3, 2, 1].map((score) => <p key={score}>{score}점 <b>{summary.distribution[score as 1 | 2 | 3 | 4 | 5]}명</b></p>)}</div></div>
    <div className={styles.resultOverview}>
      <section><h3>좋았던 점</h3>{summary.good.length ? summary.good.map((item, index) => <blockquote key={index}>{item}</blockquote>) : <p>아직 의견이 없습니다.</p>}</section>
      <section><h3>어려웠던 점</h3>{summary.difficult.length ? summary.difficult.map((item, index) => <blockquote key={index}>{item}</blockquote>) : <p>아직 의견이 없습니다.</p>}</section>
      <section><h3>후배들의 퀴즈 변화</h3>{classSummary.questions.length ? classSummary.questions.map((item) => <p key={item.id}><strong>{item.title}</strong>처음 {item.prePercent}% → 마지막 {item.postPercent}%<small>“{item.misconceptionLabel}” 오해: {item.preMisconception}명 → {item.postMisconception}명</small></p>) : <p>아직 퀴즈 결과가 없습니다.</p>}</section>
      <section><h3>선배들에게 한마디</h3>{summary.messages.length ? summary.messages.map((item, index) => <blockquote key={index}>{item}</blockquote>) : <p>아직 한마디가 없습니다.</p>}</section>
    </div>
  </>;
}

function ReflectionStep({ workspace, busy, action }: { workspace: StudentWorkspace; busy: boolean; action: (name: string, payload?: Record<string, unknown>) => Promise<StudentWorkspace | null> }) {
  const saved = workspace.reflection;
  const [values, setValues] = useState({ responsibility: saved?.responsibility || 2, helpfulFeedback: saved?.helpfulFeedback || 2, revisedFromFeedback: saved?.revisedFromFeedback || 2, changed: saved?.changed || "", nextExplanation: saved?.nextExplanation || "", rejectedAiReason: saved?.rejectedAiReason || "" });
  const summary = workspace.juniorSummary;
  return <>
    <StepTitle number={8} title="결과를 읽고 나의 다음 설명 정하기" text="낮은 결과도 실패가 아니라 어느 부분이 어려웠는지 알려 주는 정보입니다." icon={<BarChart3 />} />
    <div className={styles.resultOverview}>
      <section><h3>친구들이 본 내 설명</h3>{workspace.received.length ? workspace.received.map((item, index) => <div key={item.id}><b>익명 의견 {index + 1}</b><p><strong>잘 전달된 점</strong>{item.good}</p><p><strong>이해되지 않은 점</strong>{item.blocked}</p></div>) : <p>아직 받은 의견이 없습니다.</p>}</section>
      <section><h3>우리 모둠의 AI 판단</h3>{workspace.aiReview?.feedbacks.length ? workspace.aiReview.feedbacks.map((item, index) => <p key={item.id}><strong>{index + 1}. {item.accept === true ? "반영" : item.accept === false ? "반영하지 않음" : "판단 전"}</strong>{item.title}</p>) : <p>아직 AI 피드백 판단 기록이 없습니다.</p>}</section>
      <section><h3>후배들이 본 우리 모둠 설명</h3><p>{summary.total}명 중 {summary.distribution[5]}명이 5점을 골랐습니다.</p><div className={styles.miniBars}>{[5, 4, 3, 2, 1].map((score) => <span key={score}><small>{score}점</small><b>{summary.distribution[score as 1 | 2 | 3 | 4 | 5]}명</b></span>)}</div></section>
      <section><h3>후배가 어려워한 점</h3>{summary.difficult.length ? summary.difficult.map((item, index) => <blockquote key={index}>{item}</blockquote>) : <p>아직 의견이 없습니다.</p>}</section>
    </div>
    <form className={styles.reflectionForm} onSubmit={(event) => { event.preventDefault(); void action("saveReflection", { reflection: values }); }}><h3>나의 자기평가</h3>{[["responsibility", "대본을 만들 때 내 역할을 책임 있게 했다"], ["helpfulFeedback", "친구의 설명에 도움이 되는 피드백을 주었다"], ["revisedFromFeedback", "친구의 피드백을 받아들여 내 설명을 고쳤다"]].map(([key, label]) => <label className={styles.scaleQuestion} key={key}><span>{label}</span><div>{[1, 2, 3].map((score) => <button type="button" className={values[key as keyof typeof values] === score ? styles.active : ""} key={score} onClick={() => setValues({ ...values, [key]: score })}>{score}점</button>)}</div></label>)}<label><span>친구들의 피드백을 보고 내 설명에서 무엇을 고쳤나요?</span><textarea rows={4} value={values.changed} onChange={(event) => setValues({ ...values, changed: event.target.value })} /></label><label><span>후배들의 반응을 보고 다음에 설명한다면 무엇을 다르게 하고 싶나요?</span><textarea rows={4} value={values.nextExplanation} onChange={(event) => setValues({ ...values, nextExplanation: event.target.value })} /></label><label><span>AI 피드백 중 반영하지 않은 것은 무엇이며, 왜 그렇게 정했나요?</span><textarea rows={4} value={values.rejectedAiReason} onChange={(event) => setValues({ ...values, rejectedAiReason: event.target.value })} /></label><button className={styles.primaryButton} disabled={busy || !values.changed || !values.nextExplanation || !values.rejectedAiReason}>{busy ? <Loader2 className={styles.spin} /> : <Save size={16} />} 자기평가 저장</button></form>
  </>;
}

const juniorQuizQuestions = [
  {
    id: "question1" as const,
    question: "여름이 겨울보다 더운 까닭은?",
    options: ["여름에는 지구가 태양과 더 가까워져서", "여름에는 해가 높이 떠서 같은 땅이 햇빛을 더 많이 받아서", "여름에는 해가 더 뜨겁게 타올라서"],
  },
  {
    id: "question2" as const,
    question: "우리나라가 여름일 때 호주가 겨울인 까닭은?",
    options: ["같은 때에 호주는 햇빛을 비스듬히 받아서", "호주가 태양에서 더 멀리 떨어져 있어서", "호주에는 그늘이 져서 햇빛이 닿지 않아서"],
  },
];

function JuniorLogin({ config, onBack, onEnter }: { config: Project4Config; onBack: () => void; onEnter: (identity: { name: string; juniorClassNumber: number; studentNumber: number }) => Promise<void> }) {
  const mappings = [...config.juniorEvaluation.classMappings].sort((left, right) => left.juniorClassNumber - right.juniorClassNumber);
  const [name, setName] = useState("");
  const [juniorClassNumber, setJuniorClassNumber] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mapping = mappings.find((item) => item.juniorClassNumber === Number(juniorClassNumber));
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await onEnter({ name, juniorClassNumber: Number(juniorClassNumber), studentNumber: Number(studentNumber) }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "입장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <CenteredPanel title="선배 영상 평가" subtitle="내 반과 번호, 이름을 입력하면 이어서 진행할 수 있습니다." onBack={onBack}>
    {!config.juniorEvaluation.open && <div className={styles.inlineError}>지금은 선배 영상 평가 기간이 아닙니다.</div>}
    <form className={styles.loginForm} onSubmit={submit}>
      <label><span>학년</span><input value="5학년" disabled /></label>
      <label><span>반</span><select value={juniorClassNumber} onChange={(event) => setJuniorClassNumber(event.target.value)}><option value="">반 선택</option>{mappings.map((item) => <option key={item.id} value={item.juniorClassNumber}>{item.juniorClassNumber}반</option>)}</select></label>
      <label><span>번호</span><input value={studentNumber} onChange={(event) => setStudentNumber(event.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" pattern="[0-9]*" placeholder="숫자만 입력" /></label>
      <label><span>이름</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
      {mapping && <p className={styles.helper}>{mapping.juniorClassNumber}반은 {classLabel(config, mapping.targetClassId)} 선배들의 영상을 평가합니다.</p>}
      {mappings.length === 0 && <InlineError text="교사가 5학년 반 연결을 아직 설정하지 않았습니다." />}
      {error && <InlineError text={error} />}
      <button className={styles.primaryButton} disabled={busy || !config.juniorEvaluation.open || !name.trim() || !juniorClassNumber || !studentNumber || !mapping}>{busy ? <Loader2 className={styles.spin} /> : <ChevronRight size={17} />} 시작하기</button>
    </form>
  </CenteredPanel>;
}

function initialJuniorTab(workspace: JuniorWorkspace) {
  if (!workspace.quiz) return "pre";
  if (workspace.quiz.postSubmittedAt) return "post";
  const completed = new Set(workspace.responses.map((item) => item.targetGroupId));
  return workspace.groups.find((group) => !completed.has(group.id))?.id || "post";
}

function JuniorEvaluation({ token, workspace, setWorkspace, onDone }: { token: string; workspace: JuniorWorkspace; setWorkspace: Dispatch<SetStateAction<JuniorWorkspace | null>>; onDone: () => void }) {
  const [activeTab, setActiveTab] = useState(() => initialJuniorTab(workspace));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const completedGroupIds = new Set(workspace.responses.map((item) => item.targetGroupId));
  const preDone = Boolean(workspace.quiz);
  const allGroupsDone = workspace.groups.length > 0 && workspace.groups.every((group) => completedGroupIds.has(group.id));
  const postDone = Boolean(workspace.quiz?.postSubmittedAt);
  const completedSteps = Number(preDone) + workspace.groups.filter((group) => completedGroupIds.has(group.id)).length + Number(postDone);
  const totalSteps = workspace.groups.length + 2;

  async function action(name: string, payload: Record<string, unknown> = {}) {
    setBusy(true); setError("");
    try {
      const result = await project4Api<{ workspace: JuniorWorkspace }>(name, { token, ...payload });
      setWorkspace(result.workspace);
      return result.workspace;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "저장하지 못했습니다.");
      return null;
    } finally { setBusy(false); }
  }

  async function refresh() {
    const result = await action("juniorWorkspace");
    if (result?.quiz?.postSubmittedAt) setActiveTab("post");
  }

  return <section className={styles.juniorShell}>
    <div className={styles.juniorHead}><div><span className={styles.kicker}><School size={15} /> 5학년 선배 영상 평가</span><h1>선배들의 설명, 어땠나요?</h1><p>{workspace.me.evaluatorClass} {workspace.me.studentNumber}번 {workspace.me.name} · {workspace.me.targetClassName}</p></div><button className={styles.outlineButton} type="button" onClick={() => void refresh()} disabled={busy} title="진행 상황 새로고침"><RefreshCw className={busy ? styles.spin : ""} size={16} /> 새로고침</button></div>
    <div className={styles.juniorProgress}><div><b>{totalSteps}단계 중 {completedSteps}단계 완료</b><span>{postDone ? "모든 평가를 마쳤습니다." : "저장한 내용은 다시 로그인해도 이어집니다."}</span></div><div><span style={{ width: `${totalSteps ? (completedSteps / totalSteps) * 100 : 0}%` }} /></div></div>
    <nav className={styles.juniorTabs} aria-label="후배 평가 단계">
      <button type="button" className={`${activeTab === "pre" ? styles.active : ""} ${preDone ? styles.done : ""}`} disabled={postDone} onClick={() => setActiveTab("pre")}><span>{preDone ? <Check size={14} /> : "1"}</span>시작 퀴즈</button>
      {workspace.groups.map((group, index) => { const done = completedGroupIds.has(group.id); const locked = !preDone || postDone; return <button type="button" key={group.id} className={`${activeTab === group.id ? styles.active : ""} ${done ? styles.done : ""}`} disabled={locked} onClick={() => setActiveTab(group.id)}><span>{locked && !done ? <Lock size={13} /> : done ? <Check size={14} /> : index + 2}</span>{group.name}</button>; })}
      <button type="button" className={`${activeTab === "post" ? styles.active : ""} ${postDone ? styles.done : ""}`} disabled={!allGroupsDone || postDone} onClick={() => setActiveTab("post")}><span>{postDone ? <Check size={14} /> : !allGroupsDone ? <Lock size={13} /> : totalSteps}</span>마무리 퀴즈</button>
    </nav>
    {!workspace.evaluationOpen && !postDone && <InlineError text="평가 기간이 닫혀 있어 지금은 새 내용을 저장할 수 없습니다." />}
    {error && <InlineError text={error} />}
    <div className={styles.juniorStage}>
      {activeTab === "pre" && (workspace.quiz ? <JuniorPreSubmitted onNext={() => setActiveTab(workspace.groups[0]?.id || "post")} /> : <JuniorQuizForm mode="pre" busy={busy || !workspace.evaluationOpen} onSubmit={async (answers) => { const result = await action("submitJuniorPreQuiz", { answers }); if (result) setActiveTab(result.groups[0]?.id || "post"); }} />)}
      {workspace.groups.map((group) => activeTab === group.id && <JuniorGroupForm key={`${group.id}-${workspace.responses.find((item) => item.targetGroupId === group.id)?.updatedAt || "new"}`} group={group} saved={workspace.responses.find((item) => item.targetGroupId === group.id)} busy={busy || !workspace.evaluationOpen} onSubmit={async (values) => { const result = await action("submitJuniorGroup", { targetGroupId: group.id, ...values }); if (!result) return; const resultCompleted = new Set(result.responses.map((item) => item.targetGroupId)); setActiveTab(result.groups.find((item) => !resultCompleted.has(item.id))?.id || "post"); }} />)}
      {activeTab === "post" && (postDone && workspace.quiz ? <JuniorQuizResult quiz={workspace.quiz} onDone={onDone} /> : <JuniorQuizForm mode="post" busy={busy || !workspace.evaluationOpen} onSubmit={async (answers) => { const result = await action("submitJuniorPostQuiz", { answers }); if (result) setActiveTab("post"); }} />)}
    </div>
  </section>;
}

function JuniorPreSubmitted({ onNext }: { onNext: () => void }) {
  return <div className={styles.juniorSubmitted}><Check size={28} /><h2>시작 퀴즈를 제출했어요</h2><p>처음 생각은 그대로 저장되어 수정할 수 없습니다. 이제 선배들의 영상을 보러 가요!</p><button className={styles.primaryButton} type="button" onClick={onNext}><ChevronRight size={17} /> 영상 평가 시작</button></div>;
}

function JuniorQuizForm({ mode, busy, onSubmit }: { mode: "pre" | "post"; busy: boolean; onSubmit: (answers: Project4JuniorQuizAnswers) => Promise<void> }) {
  const [answers, setAnswers] = useState<Partial<Project4JuniorQuizAnswers>>({});
  return <form className={styles.juniorQuizForm} onSubmit={(event) => { event.preventDefault(); if (answers.question1 && answers.question2) void onSubmit(answers as Project4JuniorQuizAnswers); }}>
    <div className={styles.juniorStageTitle}><small>{mode === "pre" ? "START QUIZ" : "FINISH QUIZ"}</small><h2>{mode === "pre" ? "지금 알고 있는 대로 골라 보세요" : "선배들의 설명을 다 들었어요"}</h2><p>{mode === "pre" ? "영상을 보기 전이에요. 몰라도 괜찮아요!" : "이제 같은 문제를 다시 골라 볼까요?"}</p></div>
    {juniorQuizQuestions.map((question, questionIndex) => <fieldset key={question.id}><legend>문제 {questionIndex + 1}. {question.question}</legend><div className={styles.quizOptions}>{question.options.map((option, optionIndex) => { const value = (optionIndex + 1) as 1 | 2 | 3; return <button type="button" key={option} className={answers[question.id] === value ? styles.active : ""} onClick={() => setAnswers({ ...answers, [question.id]: value })}><b>{["①", "②", "③"][optionIndex]}</b><span>{option}</span></button>; })}</div></fieldset>)}
    <button className={styles.primaryButton} disabled={busy || !answers.question1 || !answers.question2}>{busy ? <Loader2 className={styles.spin} /> : <Send size={17} />} {mode === "pre" ? "시작 퀴즈 제출" : "마무리 퀴즈 제출"}</button>
  </form>;
}

function project4VideoEmbed(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes("youtu.be")) return `https://www.youtube-nocookie.com/embed/${parsed.pathname.slice(1)}`;
    if (parsed.hostname.includes("youtube.com")) {
      const id = parsed.searchParams.get("v") || parsed.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1];
      if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    const driveId = parsed.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
    if (parsed.hostname.includes("drive.google.com") && driveId) return `https://drive.google.com/file/d/${driveId}/preview`;
  } catch { return trimmed; }
  return trimmed;
}

function JuniorVideo({ group }: { group: JuniorWorkspace["groups"][number] }) {
  const source = project4VideoEmbed(group.videoUrl);
  if (!source) return <div className={styles.videoMissing}><Clapperboard size={25} /><p>교사가 아직 이 모둠의 영상을 등록하지 않았습니다.</p></div>;
  if (/\.(mp4|webm|ogg)(?:\?|$)/i.test(source)) return <video className={styles.directVideo} src={source} controls playsInline />;
  return <div className={styles.videoFrame}><iframe src={source} title={`${group.name} 설명 영상`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>;
}

function JuniorGroupForm({ group, saved, busy, onSubmit }: { group: JuniorWorkspace["groups"][number]; saved?: Project4JuniorGroupEvaluation; busy: boolean; onSubmit: (values: { understanding: number; good: string; difficult: string; message: string }) => Promise<void> }) {
  const [understanding, setUnderstanding] = useState(saved?.understanding || 0);
  const [good, setGood] = useState(saved?.good || "");
  const [difficult, setDifficult] = useState(saved?.difficult || "");
  const [message, setMessage] = useState(saved?.message || "");
  const ratings = [
    [5, "😄", "아주 잘 이해했어요"], [4, "🙂", "잘 이해했어요"], [3, "😐", "보통이에요"], [2, "😕", "조금 어려워요"], [1, "😣", "전혀 모르겠어요"],
  ] as const;
  return <form className={styles.juniorGroupForm} onSubmit={(event) => { event.preventDefault(); void onSubmit({ understanding, good, difficult, message }); }}>
    <div className={styles.juniorStageTitle}><small>GROUP VIDEO</small><h2>{group.name} 선배들의 설명</h2><p>영상을 끝까지 보고 솔직하게 알려 주세요.</p></div>
    <JuniorVideo group={group} />
    <fieldset><legend>1. 계절이 왜 바뀌는지 얼마나 잘 이해됐나요? <b>필수</b></legend><div className={styles.juniorRatingGrid}>{ratings.map(([score, face, label]) => <button type="button" key={score} className={understanding === score ? styles.active : ""} onClick={() => setUnderstanding(score)}><b>{score}</b><span>{face}</span><small>{label}</small></button>)}</div></fieldset>
    <div className={styles.juniorTextFields}><label><span>2. 이런 점이 좋았어요 <small>선택</small></span><textarea rows={3} value={good} onChange={(event) => setGood(event.target.value)} placeholder="지구본을 돌려서 보여 줘서 이해가 잘 됐어요." /></label><label><span>3. 이런 점은 어려웠어요 <small>선택</small></span><textarea rows={3} value={difficult} onChange={(event) => setDifficult(event.target.value)} placeholder="말이 빨라서 따라가기 어려웠어요." /></label><label><span>4. 선배들에게 한마디 <small>선택</small></span><textarea rows={3} value={message} onChange={(event) => setMessage(event.target.value)} /></label></div>
    {saved && <p className={styles.savedNotice}><Check size={15} /> 제출한 평가입니다. 마무리 퀴즈 전까지 다시 저장할 수 있어요.</p>}
    <button className={styles.primaryButton} disabled={busy || !understanding}>{busy ? <Loader2 className={styles.spin} /> : <Send size={17} />} {saved ? "수정 내용 저장" : "제출하고 다음으로"}</button>
  </form>;
}

function JuniorQuizResult({ quiz, onDone }: { quiz: Project4JuniorQuiz; onDone: () => void }) {
  return <div className={styles.juniorQuizResult}>
    <Check size={34} /><small>ALL COMPLETE</small><h2>모두 끝났어요! 고마워요 😊</h2><p className={styles.scoreCompare}>처음에는 <b>{quiz.preScore}개</b>, 지금은 <strong>{quiz.postScore || 0}개</strong> 맞혔어요!</p>
    <div className={styles.answerExplanations}><article><b>문제 1 정답 ②</b><p>여름에 더운 건 태양과 가까워서가 아니라, 해가 높이 떠서 같은 넓이의 땅에 햇빛이 모여 닿기 때문이에요.</p></article><article><b>문제 2 정답 ①</b><p>지구가 기울어져 있어서, 같은 때에 우리나라는 햇빛을 곧게, 호주는 비스듬히 받아요. 그래서 계절이 반대예요.</p></article></div>
    <button className={styles.primaryButton} type="button" onClick={onDone}><Check size={17} /> 처음으로</button>
  </div>;
}
