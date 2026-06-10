import StudentApp from "./student-app";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const params = await searchParams;
  return <StudentApp classToken={params.class ?? ""} />;
}
