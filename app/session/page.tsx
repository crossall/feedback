import SessionStudentApp from "./student-app";
import { decryptSessionClassConfig } from "@/lib/session-token";

export default async function SessionPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const params = await searchParams;
  let config;
  if (params.class) {
    try {
      config = decryptSessionClassConfig(params.class);
    } catch {
      config = undefined;
    }
  }
  return <SessionStudentApp sessionToken={params.class ?? ""} config={config} />;
}
