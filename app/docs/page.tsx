import GoogleDocsStudentApp from "./student-app";
import { decryptClassConfig } from "@/lib/class-config";

export default async function GoogleDocsPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const params = await searchParams;
  let classInfo;
  if (params.class) {
    try {
      const config = decryptClassConfig(params.class);
      classInfo = {
        classTitle: config.classTitle,
        assignment: config.assignment,
      };
    } catch {
      classInfo = undefined;
    }
  }
  return <GoogleDocsStudentApp classToken={params.class ?? ""} classInfo={classInfo} />;
}
