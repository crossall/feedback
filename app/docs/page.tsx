import GoogleDocsStudentApp from "./student-app";
import { decryptClassConfig } from "@/lib/class-config";
import StudentSubmissionNotice from "@/app/student-submission-notice";
import { studentSubmissionLinksEnabled } from "@/lib/feature-flags";

export default async function GoogleDocsPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const params = await searchParams;
  if (!studentSubmissionLinksEnabled) {
    return <StudentSubmissionNotice kind="docs" />;
  }
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
