"use client";

import Link from "next/link";
import { Check, Copy, ExternalLink, Loader2, Trash2, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import {
  projectTemplateInfo,
  type ProjectInstance,
  type ProjectTemplateId,
} from "@/lib/project-instances";

function slugPreview(value: string) {
  return value
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase("ko")
    .replace(/\s+/g, "-")
    .replace(/[^0-9a-z가-힣_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 48);
}

export default function ProjectCopyLibrary({ teacherId }: { teacherId: string }) {
  const [instances, setInstances] = useState<ProjectInstance[]>([]);
  const [names, setNames] = useState<Record<ProjectTemplateId, string>>({ project1: "", project4: "" });
  const [copyRubric, setCopyRubric] = useState<Record<ProjectTemplateId, boolean>>({ project1: true, project4: true });
  const [busy, setBusy] = useState<ProjectTemplateId | "">("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    fetch("/api/project-instances", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { instances?: ProjectInstance[]; error?: string };
        if (!response.ok) throw new Error(data.error || "복사한 프로젝트를 불러오지 못했습니다.");
        setInstances(data.instances || []);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "복사한 프로젝트를 불러오지 못했습니다."));
  }, []);

  async function create(template: ProjectTemplateId) {
    setBusy(template);
    setError("");
    try {
      const response = await fetch("/api/project-instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template, name: names[template], copyRubric: copyRubric[template] }),
      });
      const data = await response.json() as { instance?: ProjectInstance; error?: string };
      if (!response.ok || !data.instance) throw new Error(data.error || "프로젝트를 복사하지 못했습니다.");
      setInstances((current) => [data.instance as ProjectInstance, ...current]);
      setNames((current) => ({ ...current, [template]: "" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "프로젝트를 복사하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function copyAddress(instance: ProjectInstance) {
    const address = `${window.location.origin}/${instance.teacherId}/${instance.slug}`;
    await navigator.clipboard.writeText(address);
    setCopied(instance.id);
    window.setTimeout(() => setCopied(""), 1800);
  }

  async function remove(instance: ProjectInstance) {
    if (!window.confirm(`'${instance.name}' 프로젝트와 저장된 응답을 모두 삭제할까요?`)) return;
    setError("");
    const response = await fetch("/api/project-instances", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId: instance.id }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) {
      setError(data.error || "프로젝트를 삭제하지 못했습니다.");
      return;
    }
    setInstances((current) => current.filter((item) => item.id !== instance.id));
  }

  return (
    <section className="project-copy-section">
      <div className="section-heading">
        <span>02</span>
        <div>
          <h2>프로젝트 흐름 복사</h2>
          <p>학생 정보와 응답은 제외하고 흐름만 복사합니다. AI는 위에 저장한 내 Claude API 키를 사용합니다.</p>
        </div>
      </div>
      <div className="project-template-grid">
        {(Object.keys(projectTemplateInfo) as ProjectTemplateId[]).map((template) => {
          const info = projectTemplateInfo[template];
          const preview = slugPreview(names[template]);
          return (
            <article className="project-template" key={template}>
              <div className="project-template-title">
                <span><Workflow size={20} aria-hidden="true" /></span>
                <div><small>{template.toUpperCase()}</small><h3>{info.label}</h3></div>
              </div>
              <p>{info.summary}</p>
              <ol>{info.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              <label className="project-name-field">
                <span>주소에 사용할 이름</span>
                <input
                  value={names[template]}
                  maxLength={50}
                  placeholder={template === "project1" ? "예: 식물안내서" : "예: 계절프로젝트"}
                  onChange={(event) => setNames((current) => ({ ...current, [template]: event.target.value }))}
                />
                <small>/{teacherId}/{preview || "설정하는-이름"}</small>
              </label>
              <label className="project-rubric-option">
                <input
                  type="checkbox"
                  checked={copyRubric[template]}
                  onChange={(event) => setCopyRubric((current) => ({ ...current, [template]: event.target.checked }))}
                />
                <span>현재 루브릭도 복사하기</span>
              </label>
              <button type="button" onClick={() => create(template)} disabled={busy !== "" || preview.length < 2}>
                {busy === template ? <Loader2 className="spin" size={16} /> : <Copy size={16} />}
                흐름 복사
              </button>
            </article>
          );
        })}
      </div>
      {error && <div className="error-message">{error}</div>}
      {instances.length > 0 && (
        <div className="project-instance-list">
          <h3>내가 복사한 프로젝트</h3>
          {instances.map((instance) => (
            <div key={instance.id}>
              <span className="format-chip project">{instance.template === "project1" ? "P1" : "P4"}</span>
              <div><strong>{instance.name}</strong><small>/{instance.teacherId}/{instance.slug}</small></div>
              <button type="button" title="주소 복사" onClick={() => copyAddress(instance)}>
                {copied === instance.id ? <Check size={16} /> : <Copy size={16} />}
              </button>
              <Link href={`/${instance.teacherId}/${instance.slug}`} title="프로젝트 열기"><ExternalLink size={16} /></Link>
              <button className="project-instance-delete" type="button" title="프로젝트 삭제" onClick={() => remove(instance)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
