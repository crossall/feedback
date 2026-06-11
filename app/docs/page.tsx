import GoogleDocsStudentApp from "./student-app";

export default async function GoogleDocsPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const params = await searchParams;
  return <GoogleDocsStudentApp classToken={params.class ?? ""} />;
}
