"use client";

import {
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  Check,
  ChevronRight,
  Clapperboard,
  ClipboardCheck,
  Download,
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
type TeacherTab = "setup" | "stages" | "results";
type TeacherResultView = "peer" | "representative" | "presentation" | "ai" | "final" | "junior" | "reflection" | "summary";

type StudentWorkspace = {
  submittedTargetIds: string[];
  received: Array<{ id: string; good: string; blocked: string }>;
  representative: (Pick<Project4Representative, "selectedStudentId" | "selectedStudentName" | "updatedAt"> & {
    reasons: Project4RepresentativeReason[];
  }) | null;
  presentation: Project4PresentationReview | null;
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

type StudentWorkspaceSetter = Dispatch<SetStateAction<StudentWorkspace>>;

type TeacherData = {
  peer: Project4PeerResponse[];
  representatives: Project4Representative[];
  presentations: Project4PresentationReview[];
  ai: Project4AiReview[];
  finals: Project4FinalScript[];
  juniors: Project4JuniorResponse[];
  reflections: Project4Reflection[];
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
    understanding: { well: 0, some: 0, little: 0 },
    helpfulParts: [],
    questions: [],
    messages: [],
  },
  reflection: null,
};

const emptyTeacherData: TeacherData = {
  peer: [], representatives: [], presentations: [], ai: [], finals: [], juniors: [], reflections: [],
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
        <h1>계절의 비밀을<br /><em>찾아서</em></h1>
        <p>{config.description}</p>
        <div className={styles.privacyLine}><ShieldCheck size={16} /><span>학생 평가는 친구에게 익명으로 보이며, 평가자 이름은 교사만 확인합니다.</span></div>
      </div>
      <div className={styles.roleGrid}>
        <button type="button" onClick={() => setRole("studentLogin")}>
          <span className={styles.roleIcon}><UserRound size={25} /></span><div><small>6학년</small><strong>프로젝트 평가 시작</strong><p>친구 피드백부터 자기평가까지 8단계로 진행해요.</p></div><ChevronRight />
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
    {tab === "stages" && <TeacherStages
      config={draft}
      setStage={(stage) => save({ ...draft, openStage: stage }, `${stage}단계까지 학생에게 열었습니다.`)}
      setGroupReviewOpen={(open) => save(
        { ...draft, groupReviewOpen: open },
        open ? "다른 모둠 발표 평가를 학생에게 열었습니다." : "다른 모둠 발표 평가를 닫았습니다.",
      )}
      busy={busy}
    />}
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
      {draft.classes.length === 0 ? <div className={styles.empty}>반을 추가한 뒤 모둠과 학생 이름을 등록해 주세요.</div> : draft.classes.map((classroom) => <article className={styles.classEditor} key={classroom.id}><div className={styles.classEditorHead}><input value={classroom.name} onChange={(event) => setDraft({ ...draft, classes: draft.classes.map((item) => item.id === classroom.id ? { ...item, name: event.target.value } : item) })} /><div><button type="button" onClick={() => addGroup(classroom.id)}><Plus size={14} /> 모둠 추가</button><button type="button" className={styles.dangerButton} onClick={() => setDraft({ ...draft, classes: draft.classes.filter((item) => item.id !== classroom.id), groups: draft.groups.filter((group) => group.classId !== classroom.id) })}><Trash2 size={14} /></button></div></div>
        <div className={styles.groupGrid}>{draft.groups.filter((group) => group.classId === classroom.id).map((group) => <div className={styles.groupEditor} key={group.id}><div className={styles.groupTitle}><input value={group.name} onChange={(event) => updateGroup(group.id, { name: event.target.value })} /><button type="button" onClick={() => setDraft({ ...draft, groups: draft.groups.filter((item) => item.id !== group.id) })}><Trash2 size={13} /></button></div><div className={styles.studentList}>{group.students.map((student) => <div key={student.id}><input value={student.name} onChange={(event) => updateGroup(group.id, { students: group.students.map((item) => item.id === student.id ? { ...item, name: event.target.value } : item) })} /><button type="button" onClick={() => updateGroup(group.id, { students: group.students.filter((item) => item.id !== student.id) })}><Trash2 size={12} /></button></div>)}</div><StudentAdder onAdd={(name) => addStudent(group.id, name)} /></div>)}</div>
      </article>)}</section>
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

function TeacherStages({ config, setStage, setGroupReviewOpen, busy }: {
  config: Project4Config;
  setStage: (stage: number) => void;
  setGroupReviewOpen: (open: boolean) => void;
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
    <div className={styles.stageControl}>{project4Stages.map((stage, index) => {
      const number = index + 1;
      const open = isProject4StageOpen(config, number);
      const current = number === 4 ? groupReviewOpen : number === config.openStage;
      return <button key={stage} className={current ? styles.current : open ? styles.done : ""} disabled={busy} onClick={() => number === 4 ? setGroupReviewOpen(true) : setStage(number)}><span>{open && !current ? <Check size={16} /> : number}</span><div><b>{stage}</b><small>{open ? "학생에게 열림" : number === 4 ? "위 버튼으로 별도 열기" : "클릭하여 이 단계까지 열기"}</small></div>{!open && <Lock size={15} />}</button>;
    })}</div>
  </section>;
}

function TeacherResults({ config, data, refresh, busy }: { config: Project4Config; data: TeacherData; refresh: () => void; busy: boolean }) {
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
    juniors: data.juniors.filter((item) => item.targetClassId === selectedClassId),
    reflections: data.reflections.filter((item) => item.classId === selectedClassId),
  };
  const resultViews: Array<{ id: TeacherResultView; label: string; count: number; icon: React.ReactNode }> = [
    { id: "peer", label: "동료평가", count: filtered.peer.length, icon: <Users size={15} /> },
    { id: "representative", label: "대표 선정", count: filtered.representatives.length, icon: <BookOpenCheck size={15} /> },
    { id: "presentation", label: "발표 평가", count: filtered.presentations.length, icon: <Clapperboard size={15} /> },
    { id: "ai", label: "모둠 AI", count: filtered.ai.length, icon: <Sparkles size={15} /> },
    { id: "final", label: "최종 대본", count: filtered.finals.length, icon: <FileText size={15} /> },
    { id: "junior", label: "후배 평가", count: filtered.juniors.length, icon: <GraduationCap size={15} /> },
    { id: "reflection", label: "자기평가", count: filtered.reflections.length, icon: <ClipboardCheck size={15} /> },
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
        ["동료평가", filtered.peer.length], ["대표 선정", filtered.representatives.length], ["발표 평가", filtered.presentations.length], ["모둠 AI", filtered.ai.length], ["최종 대본", filtered.finals.length], ["후배 응답", filtered.juniors.length], ["자기평가", filtered.reflections.length],
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
            const juniorCount = filtered.juniors.filter((item) => item.targetGroupId === group.id).length;
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
    {view === "junior" && <ResultSection title={`${selectedClass.name} · 5학년 후배 평가 · 교사 실명 확인`} empty={filtered.juniors.length === 0}>{filtered.juniors.map((item) => <article className={styles.record} key={item.id}><div className={styles.recordMeta}><b>{item.evaluatorName}</b><span>{item.evaluatorClass}</span><small>대상: {groupLabel(config, item.targetGroupId)}</small></div><div><p><strong>이해 정도</strong>{item.understanding === "well" ? "잘 이해했어요" : item.understanding === "some" ? "조금 알 것 같아요" : "잘 모르겠어요"}</p>{item.question && <p><strong>질문</strong>{item.question}</p>}{item.message && <p><strong>한마디</strong>{item.message}</p>}</div></article>)}</ResultSection>}
    {view === "reflection" && <ResultSection title={`${selectedClass.name} · 자기평가와 성찰`} empty={filtered.reflections.length === 0}>{filtered.reflections.map((item) => <article className={styles.record} key={item.studentId}><div className={styles.recordMeta}><b>{item.studentName}</b><span>{groupLabel(config, item.groupId)}</span><small>참여 {item.responsibility} · 피드백 {item.helpfulFeedback} · 수정 {item.revisedFromFeedback}</small></div><div><p><strong>고친 점</strong>{item.changed}</p><p><strong>다음 설명</strong>{item.nextExplanation}</p><p><strong>AI 미반영 이유</strong>{item.rejectedAiReason}</p></div></article>)}</ResultSection>}
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
    {activeStage === 7 && <JuniorWaitStep summary={workspace.juniorSummary} />}
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
        body: JSON.stringify({ token, fileName: file.name, pdfData }),
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

const partLabels: Record<string, string> = { measurement: "측정한 숫자", globe: "지구본으로 보여 준 부분", australia: "호주 이야기", voice: "목소리와 말하는 속도" };

function JuniorWaitStep({ summary }: { summary: StudentWorkspace["juniorSummary"] }) {
  return <><StepTitle number={7} title="후배들의 이해 확인 기다리기" text="5학년 후배들은 패들렛에서 대표 영상을 보고 이해한 정도와 질문을 남깁니다." icon={<School />} /><div className={styles.summaryCard}><strong>{summary.total}명</strong><span>우리 모둠 영상을 평가한 후배</span><div><p>잘 이해했어요 <b>{summary.understanding.well}명</b></p><p>조금 알 것 같아요 <b>{summary.understanding.some}명</b></p><p>잘 모르겠어요 <b>{summary.understanding.little}명</b></p></div></div></>;
}

function ReflectionStep({ workspace, busy, action }: { workspace: StudentWorkspace; busy: boolean; action: (name: string, payload?: Record<string, unknown>) => Promise<StudentWorkspace | null> }) {
  const saved = workspace.reflection; const [values, setValues] = useState({ responsibility: saved?.responsibility || 2, helpfulFeedback: saved?.helpfulFeedback || 2, revisedFromFeedback: saved?.revisedFromFeedback || 2, changed: saved?.changed || "", nextExplanation: saved?.nextExplanation || "", rejectedAiReason: saved?.rejectedAiReason || "" }); const summary = workspace.juniorSummary;
  return <><StepTitle number={8} title="결과를 읽고 나의 다음 설명 정하기" text="낮은 결과도 실패가 아니라 어느 부분이 어려웠는지 알려 주는 정보입니다." icon={<BarChart3 />} /><div className={styles.resultOverview}><section><h3>친구들이 본 내 설명</h3>{workspace.received.length ? workspace.received.map((item, index) => <div key={item.id}><b>익명 의견 {index + 1}</b><p><strong>잘 전달된 점</strong>{item.good}</p><p><strong>이해되지 않은 점</strong>{item.blocked}</p></div>) : <p>아직 받은 의견이 없습니다.</p>}</section><section><h3>우리 모둠의 AI 판단</h3>{workspace.aiReview?.feedbacks.length ? workspace.aiReview.feedbacks.map((item, index) => <p key={item.id}><strong>{index + 1}. {item.accept === true ? "반영" : item.accept === false ? "반영하지 않음" : "판단 전"}</strong>{item.title}</p>) : <p>아직 AI 피드백 판단 기록이 없습니다.</p>}</section><section><h3>후배들이 본 우리 모둠 설명</h3><p>{summary.total}명 중 {summary.understanding.well}명이 “잘 이해했어요”를 골랐습니다.</p><div className={styles.miniBars}>{summary.helpfulParts.map((item) => <span key={item.part}><small>{partLabels[item.part]}</small><b>{item.count}명</b></span>)}</div></section><section><h3>후배가 남긴 질문</h3>{summary.questions.length ? summary.questions.map((item, index) => <blockquote key={index}>{item}</blockquote>) : <p>아직 질문이 없습니다.</p>}</section></div><form className={styles.reflectionForm} onSubmit={(event) => { event.preventDefault(); void action("saveReflection", { reflection: values }); }}><h3>나의 자기평가</h3>{[["responsibility", "대본을 만들 때 내 역할을 책임 있게 했다"], ["helpfulFeedback", "친구의 설명에 도움이 되는 피드백을 주었다"], ["revisedFromFeedback", "친구의 피드백을 받아들여 내 설명을 고쳤다"]].map(([key, label]) => <label className={styles.scaleQuestion} key={key}><span>{label}</span><div>{[1, 2, 3].map((score) => <button type="button" className={values[key as keyof typeof values] === score ? styles.active : ""} key={score} onClick={() => setValues({ ...values, [key]: score })}>{score}점</button>)}</div></label>)}<label><span>친구들의 피드백을 보고 내 설명에서 무엇을 고쳤나요?</span><textarea rows={4} value={values.changed} onChange={(event) => setValues({ ...values, changed: event.target.value })} /></label><label><span>후배들의 반응을 보고 다음에 설명한다면 무엇을 다르게 하고 싶나요?</span><textarea rows={4} value={values.nextExplanation} onChange={(event) => setValues({ ...values, nextExplanation: event.target.value })} /></label><label><span>AI 피드백 중 반영하지 않은 것은 무엇이며, 왜 그렇게 정했나요?</span><textarea rows={4} value={values.rejectedAiReason} onChange={(event) => setValues({ ...values, rejectedAiReason: event.target.value })} /></label><button className={styles.primaryButton} disabled={busy || !values.changed || !values.nextExplanation || !values.rejectedAiReason}>{busy ? <Loader2 className={styles.spin} /> : <Save size={16} />} 자기평가 저장</button></form></>;
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
