import { notFound } from "next/navigation";
import Project1Client from "@/app/project1/project1-client";
import Project4Client from "@/app/project4/project4-client";
import { getTeacherSessionId } from "@/lib/server/teacher-accounts";
import { getProjectInstance } from "@/lib/server/project-instance-store";

export default async function ProjectInstancePage({
  params,
}: {
  params: Promise<{ teacherId: string; slug: string }>;
}) {
  const { teacherId, slug } = await params;
  const instance = await getProjectInstance(teacherId, decodeURIComponent(slug));
  if (!instance) notFound();
  const ownerAccess = await getTeacherSessionId() === instance.teacherId;
  return instance.template === "project1"
    ? <Project1Client instanceId={instance.id} ownerAccess={ownerAccess} />
    : <Project4Client instanceId={instance.id} ownerAccess={ownerAccess} />;
}
