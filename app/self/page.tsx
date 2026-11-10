import SelfStudentApp from "./student-app";
import { decryptSelfClassConfig } from "@/lib/self-token";

export default async function SelfPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const params = await searchParams;
  let config;
  if (params.class) {
    try {
      config = decryptSelfClassConfig(params.class);
    } catch {
      config = undefined;
    }
  }
  return <SelfStudentApp classToken={params.class ?? ""} config={config} />;
}
