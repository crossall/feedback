import StudentApp from "./student-app";
import TeacherLanding from "./teacher-landing";
import { decryptClassConfig } from "@/lib/class-config";
import StudentSubmissionNotice from "./student-submission-notice";
import { studentSubmissionLinksEnabled } from "@/lib/feature-flags";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const params = await searchParams;
  if (params.class) {
    if (!studentSubmissionLinksEnabled) {
      return <StudentSubmissionNotice kind="pdf" />;
    }
    let classInfo;
    try {
      const config = decryptClassConfig(params.class);
      classInfo = {
        classTitle: config.classTitle,
        assignment: config.assignment,
      };
    } catch {
      classInfo = undefined;
    }
    return <StudentApp classToken={params.class} classInfo={classInfo} />;
  }
  return <TeacherLanding />;
}
