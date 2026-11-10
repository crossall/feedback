# Feedforward 시스템 자동 인벤토리

이 파일은 `docs/system/system-map.json`과 실제 `app/api/**/route.ts`를 읽어 생성합니다. 직접 편집하지 않습니다.

## 기능 영역

| 기능 | 화면 진입점 | 주요 API | 결과 |
| --- | --- | --- | --- |
| 일반 AI 평가 | /, /docs, /teacher, /docs/teacher | /api/class, /api/evaluate, /api/evaluate-doc, /api/teacher/evaluation-token | 구조화된 루브릭 평가, 화면 피드백, PDF 또는 HTML 보고서, Google Docs 덧붙이기 |
| 동료평가와 자기평가 | /peer, /peer/teacher, /self | /api/peer/class, /api/peer/responses, /api/self/class, /api/self/responses, /api/ai/generate-questions | 루브릭 응답, 정성 의견, 교사 집계 화면 |
| 단계형 통합 평가 세션 | /session, /session/teacher | /api/session/class, /api/session/evaluate, /api/session/responses, /api/session/student-results | PDF 또는 Docs AI 평가, 동료평가, 자기평가, 성찰, 조건부 학생 결과 공유 |
| 계절의 비밀 프로젝트 | /project4 | /api/project4/storage, /api/project4/claude | 8단계 학습 흐름, 모둠과 개인 성장 데이터, 후배 평가, 성장 보고서 |
| 프로젝트별 평가 워크스페이스 | /project1, /project_expo, /meta1, /confesta | /api/project1/storage, /api/project1/claude, /api/project_expo/storage, /api/meta1/storage, /api/meta1/claude, /api/confesta/storage, /api/confesta/claude | 프로젝트별 루브릭, AI 피드백, 공유 저장공간 |
| 성과 전시와 방명록 | /showcase, /showcase/projects/[slug] | /api/showcase/guestbook, /api/showcase/guestbook/admin | 프로젝트 전시, 질문과 방명록, 관리자 검토와 답변 |

## Route Handler 목록

총 35개 Route Handler를 확인했습니다. Next.js 16에서 Route Handler는 공개 HTTP 경계이므로 각 경로에서 인증과 권한을 다시 확인해야 합니다.

| 경로 | 메서드 | 런타임 | 최대 실행시간 초 | 구현 파일 |
| --- | --- | --- | --- | --- |
| /api/ai/generate-questions | POST | nodejs | - | app/api/ai/generate-questions/route.ts |
| /api/class | POST | nodejs | - | app/api/class/route.ts |
| /api/confesta/claude | POST | nodejs | 60 | app/api/confesta/claude/route.ts |
| /api/confesta/storage | POST | nodejs | 60 | app/api/confesta/storage/route.ts |
| /api/evaluate | POST | nodejs | 120 | app/api/evaluate/route.ts |
| /api/evaluate-doc | POST | nodejs | 120 | app/api/evaluate-doc/route.ts |
| /api/google/oauth/callback | GET | nodejs | - | app/api/google/oauth/callback/route.ts |
| /api/google/oauth/start | GET | nodejs | - | app/api/google/oauth/start/route.ts |
| /api/google/oauth/status | GET | nodejs | - | app/api/google/oauth/status/route.ts |
| /api/meta1/claude | POST | nodejs | 60 | app/api/meta1/claude/route.ts |
| /api/meta1/storage | POST | nodejs | 60 | app/api/meta1/storage/route.ts |
| /api/peer/class | POST | nodejs | - | app/api/peer/class/route.ts |
| /api/peer/responses | POST | nodejs | - | app/api/peer/responses/route.ts |
| /api/project_expo/claude | - | nodejs | 60 | app/api/project_expo/claude/route.ts |
| /api/project_expo/storage | POST | nodejs | 60 | app/api/project_expo/storage/route.ts |
| /api/project-instances | GET, DELETE, POST | nodejs | - | app/api/project-instances/route.ts |
| /api/project1/claude | POST | nodejs | 60 | app/api/project1/claude/route.ts |
| /api/project1/storage | POST | nodejs | 60 | app/api/project1/storage/route.ts |
| /api/project4/claude | POST | nodejs | 120 | app/api/project4/claude/route.ts |
| /api/project4/storage | POST | nodejs | 60 | app/api/project4/storage/route.ts |
| /api/self/class | POST | nodejs | - | app/api/self/class/route.ts |
| /api/self/responses | POST | nodejs | - | app/api/self/responses/route.ts |
| /api/session/class | POST | nodejs | - | app/api/session/class/route.ts |
| /api/session/evaluate | POST | nodejs | 120 | app/api/session/evaluate/route.ts |
| /api/session/responses | POST | nodejs | - | app/api/session/responses/route.ts |
| /api/session/student-results | POST | nodejs | - | app/api/session/student-results/route.ts |
| /api/showcase/guestbook | GET, POST, PATCH | nodejs | 30 | app/api/showcase/guestbook/route.ts |
| /api/showcase/guestbook/admin | POST, DELETE, GET | nodejs | - | app/api/showcase/guestbook/admin/route.ts |
| /api/teacher/evaluation-token | POST | nodejs | - | app/api/teacher/evaluation-token/route.ts |
| /api/teachers/[teacherId]/api-keys | GET, POST | nodejs | - | app/api/teachers/[teacherId]/api-keys/route.ts |
| /api/teachers/[teacherId]/evaluations | GET, POST, DELETE | nodejs | - | app/api/teachers/[teacherId]/evaluations/route.ts |
| /api/teachers/[teacherId]/peer-responses | GET | nodejs | - | app/api/teachers/[teacherId]/peer-responses/route.ts |
| /api/teachers/[teacherId]/self-responses | GET | nodejs | - | app/api/teachers/[teacherId]/self-responses/route.ts |
| /api/teachers/[teacherId]/session-responses | GET | nodejs | - | app/api/teachers/[teacherId]/session-responses/route.ts |
| /api/teachers/auth | POST, DELETE | nodejs | - | app/api/teachers/auth/route.ts |

## 외부 시스템과 전송 데이터

| 외부 시스템 | 현재 전송 또는 저장 데이터 |
| --- | --- |
| OpenAI Responses API | 루브릭, 과제, 프롬프트, PDF 또는 문서 본문, 현재 구현에서는 제출자 정보 |
| Anthropic Messages API | 루브릭, 과제, 프롬프트, PDF 또는 문서 본문, 프로젝트별 평가 입력 |
| Google Docs API and OAuth | 공개 문서 읽기 또는 교사 소유 문서에 피드백 추가, OAuth 토큰 |
| Vercel Runtime and Blob | 평가 설정, 암호화된 API 키, 응답, 프로젝트 기록, 방명록 |

## 기능 플래그

| 이름 | 현재 값 | 영향 |
| --- | --- | --- |
| studentSubmissionLinksEnabled | false | 일반 PDF와 Docs는 교사 직접 평가 방식만 허용 |
| internalPeerCollectionEnabled | false | 기본 동료평가는 Google Form 운영 안내를 사용 |
| bundledEvaluationVisible | false | 통합 평가 기능의 기본 노출을 제한 |
