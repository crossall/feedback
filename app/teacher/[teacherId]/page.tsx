import { redirect } from "next/navigation";
import { isTeacherId } from "@/lib/teacher-evaluations";
import { getTeacherSessionId } from "@/lib/server/teacher-accounts";
import TeacherDashboard from "./dashboard";

export default async function TeacherDashboardPage({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = await params;
  const sessionTeacherId = await getTeacherSessionId();
  if (!isTeacherId(teacherId) || sessionTeacherId !== teacherId) redirect("/");
  return <TeacherDashboard teacherId={teacherId} />;
}
