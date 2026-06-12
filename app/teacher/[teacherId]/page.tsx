import { notFound } from "next/navigation";
import { isTeacherId } from "@/lib/teacher-evaluations";
import TeacherDashboard from "./dashboard";

export function generateStaticParams() {
  return [{ teacherId: "4523" }, { teacherId: "6556" }];
}

export default async function TeacherDashboardPage({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = await params;
  if (!isTeacherId(teacherId)) notFound();
  return <TeacherDashboard teacherId={teacherId} />;
}
