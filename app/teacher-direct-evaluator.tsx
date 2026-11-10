"use client";

import {
  FileCheck2,
  FileUp,
  Link as LinkIcon,
  LockKeyhole,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import EvaluationDelivery from "@/app/evaluation-delivery";
import EvaluationResultPanel from "@/app/evaluation-result-panel";
import type { EvaluationResponse } from "@/lib/evaluation-result";
import type { ReportStudent } from "@/lib/evaluation-report";

type CompletedEvaluation = {
  id: string;
  student: ReportStudent;
  source: string;
  result: EvaluationResponse;
};

export default function TeacherDirectEvaluator({
  kind,
  teacherId,
  prepareToken,
}: {
  kind: "pdf" | "docs";
  teacherId: string | null;
  prepareToken: () => Promise<string>;
}) {
  const [studentGrade, setStudentGrade] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentTeam, setStudentTeam] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState<CompletedEvaluation[]>([]);
  const [activeId, setActiveId] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);

  const active = useMemo(
    () => completed.find((item) => item.id === activeId),
    [activeId, completed],
  );

  function chooseFile(candidate?: File) {
    setError("");
    if (!candidate) return;
    if (candidate.type !== "application/pdf") {
      setError("PDF 파일만 올릴 수 있습니다.");
      return;
    }
    if (candidate.size > 15 * 1024 * 1024) {
      setError("PDF 파일은 15MB 이하여야 합니다.");
      return;
    }
    setFile(candidate);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files[0]);
  }

  function startNextStudent() {
    setStudentName("");
    setStudentTeam("");
    setDocumentUrl("");
    setFile(null);
    setFileInputKey((current) => current + 1);
    setError("");
    setActiveId("");
    window.scrollTo({ top: resultRef.current?.offsetTop ?? 0, behavior: "smooth" });
  }

  async function evaluate(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!teacherId) {
      setError("교사 번호로 입장한 뒤 평가해 주세요.");
      return;
    }
    if (!studentGrade.trim() || !studentClass.trim() || !studentName.trim()) {
      setError("학년, 반, 학생 이름을 모두 입력해 주세요.");
      return;
    }
    if (kind === "pdf" && !file) {
      setError("평가할 PDF 파일을 선택해 주세요.");
      return;
    }
    if (kind === "docs" && !documentUrl.trim()) {
      setError("평가할 Google Docs 주소를 입력해 주세요.");
      return;
    }

    setLoading(true);
    try {
      const classToken = await prepareToken();
      let response: Response;
      if (kind === "pdf") {
        const formData = new FormData();
        formData.append("file", file as File);
        formData.append("classToken", classToken);
        formData.append("studentGrade", studentGrade);
        formData.append("studentClass", studentClass);
        formData.append("studentName", studentName);
        formData.append("studentTeam", studentTeam);
        response = await fetch("/api/evaluate", { method: "POST", body: formData });
      } else {
        response = await fetch("/api/evaluate-doc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentUrl,
            classToken,
            studentGrade,
            studentClass,
            studentName,
            studentTeam,
          }),
        });
      }

      const data = await response.json() as EvaluationResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "평가 중 문제가 생겼습니다.");
      const entry: CompletedEvaluation = {
        id: crypto.randomUUID(),
        student: {
          grade: studentGrade,
          className: studentClass,
          name: studentName,
          team: studentTeam || "개인 제출",
        },
        source: kind === "pdf" ? (file as File).name : documentUrl,
        result: data,
      };
      setCompleted((current) => [entry, ...current]);
      setActiveId(entry.id);
      window.setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "평가 중 문제가 생겼습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section ref={resultRef} className="teacher-direct-section">
      <div className="section-heading">
        <span>02</span>
        <div>
          <h2>{kind === "pdf" ? "학생 PDF 직접 평가" : "학생 Google Docs 직접 평가"}</h2>
          <p>학생 대신 교사가 작품과 학생 정보를 입력합니다.</p>
        </div>
      </div>

      <div className="teacher-direct-layout">
        <form className="teacher-direct-form" onSubmit={evaluate}>
          <div className="field-row teacher-student-fields">
            <label className="field"><span>학년 <b>*</b></span><input value={studentGrade} onChange={(event) => setStudentGrade(event.target.value)} placeholder="예: 5학년" /></label>
            <label className="field"><span>반 <b>*</b></span><input value={studentClass} onChange={(event) => setStudentClass(event.target.value)} placeholder="예: 2반" /></label>
            <label className="field"><span>가명 또는 식별 번호 <b>*</b></span><input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="예: 5학년-01" /></label>
            <label className="field"><span>모둠 <small>(선택)</small></span><input value={studentTeam} onChange={(event) => setStudentTeam(event.target.value)} placeholder="모둠 활동일 때만" /></label>
          </div>

          {kind === "pdf" ? (
            <label className={`drop-zone teacher-drop-zone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
              <input key={fileInputKey} type="file" accept="application/pdf" onChange={(event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0])} />
              <span className="upload-icon">{file ? <FileCheck2 size={27} /> : <FileUp size={27} />}</span>
              {file ? <><strong>{file.name}</strong><p>{(file.size / 1024 / 1024).toFixed(1)}MB · 클릭해서 다른 파일 선택</p></> : <><strong>학생 PDF를 선택하세요</strong><p>끌어다 놓거나 클릭해서 선택 · 최대 15MB</p></>}
            </label>
          ) : (
            <label className="document-link-field teacher-document-field">
              <span className="upload-icon"><LinkIcon size={25} /></span>
              <span className="document-link-copy"><strong>Google Docs 주소 <b>*</b></strong><small>교사가 수집한 학생 문서 주소를 붙여 넣으세요.</small></span>
              <input type="url" value={documentUrl} onChange={(event) => setDocumentUrl(event.target.value)} placeholder="https://docs.google.com/document/d/..." />
            </label>
          )}

          {error && <div className="error-message">{error}</div>}
          <button className="primary-button" disabled={loading}>
            {loading ? <><span className="spinner" /> {kind === "pdf" ? "PDF를 읽고 평가하는 중..." : "문서를 읽고 평가하는 중..."}</> : <><Sparkles size={18} /> 이 학생 평가하기</>}
          </button>
          <p className="privacy"><LockKeyhole size={14} /> 학생 정보와 작품은 평가 요청에만 사용되며 Feedforward에 저장되지 않습니다.</p>
        </form>

        <aside className="teacher-evaluation-queue">
          <div className="teacher-queue-head">
            <span>완료한 평가</span>
            <strong>{completed.length}</strong>
          </div>
          {completed.length === 0 ? (
            <p className="teacher-queue-empty">평가를 완료하면 이 브라우저에서 결과 목록을 다시 열 수 있습니다.</p>
          ) : (
            <div className="teacher-queue-list">
              {completed.map((item) => (
                <button key={item.id} type="button" className={item.id === activeId ? "active" : ""} onClick={() => setActiveId(item.id)}>
                  <span>{item.student.name}</span>
                  <small>{item.student.grade} · {item.student.className}</small>
                  <b>{item.result.totalScore} / {item.result.maxScore}</b>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>

      {active && (
        <div className="teacher-active-result">
          <div className="teacher-next-action">
            <div><strong>{active.student.name} 학생 평가가 완료됐습니다.</strong><span>{active.source}</span></div>
            <button type="button" className="secondary-button" onClick={startNextStudent}><RotateCcw size={15} /> 다음 학생 평가</button>
          </div>
          <EvaluationDelivery result={active.result} student={active.student} />
          {active.result.outputOptions.showOnScreen && (
            <EvaluationResultPanel result={active.result} studentName={active.student.name} />
          )}
        </div>
      )}
    </section>
  );
}
