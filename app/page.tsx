import StudentApp from "./student-app";
import TeacherLanding from "./teacher-landing";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const params = await searchParams;
  if (params.class) return <StudentApp classToken={params.class} />;
  return <TeacherLanding />;
}
