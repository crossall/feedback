# Feedforward 시스템 문서

이 디렉터리는 현재 저장소의 화면, Route Handler, 도메인 모델, 저장소, 외부 서비스 호출을 기준으로 Feedforward의 운영 파이프라인과 시스템 구조, 설계 철학을 정리합니다. 문서의 기준일은 2026년 11월 3일입니다.

## 문서 구성

- [시스템 파이프라인](01-system-pipeline.md): 교사 설계부터 학생 수행, AI 분석, 사람의 판단, 결과 전달, 다음 수업까지의 공통 흐름과 기능별 분기
- [시스템 구조](02-system-architecture.md): 사용자, 화면, API, 도메인 규칙, 저장소, 외부 서비스, 보안 경계, 배포 구조
- [시스템 철학](03-system-philosophy.md): 제품과 교육 설계에 적용할 판단 원칙, 비목표, 현재 구현과 원칙 사이의 긴장
- [실행 로드맵](04-implementation-roadmap.md): 개인정보, 인증, 보유기간, 공통 모듈, 자동 테스트를 순서대로 보완하는 계획
- [자동 API 인벤토리](generated-api-inventory.md): 실제 `app/api/**/route.ts`에서 생성한 Route Handler 목록
- [시스템 지도 원본](system-map.json): 역할, 기능, 파이프라인, 외부 시스템, 품질 게이트, 알려진 차이를 담은 기계 판독 원본

## 시각 자료

- [평가 파이프라인 SVG](diagrams/feedforward-system-pipeline.svg)
- [평가 파이프라인 PNG](diagrams/feedforward-system-pipeline.png)
- [시스템 구조도 SVG](diagrams/feedforward-system-architecture.svg)
- [시스템 구조도 PNG](diagrams/feedforward-system-architecture.png)

SVG는 확대해도 선명한 원본이고 PNG는 문서 삽입과 빠른 미리보기에 사용합니다. 두 그림 모두 `system-map.json`에서 생성됩니다.

## 재생성과 검증

```bash
npm run docs:system
npm run docs:system:check
```

첫 명령은 API 인벤토리와 SVG, PNG를 다시 만듭니다. 두 번째 명령은 선언된 API가 실제 Route Handler에 존재하는지 확인하고 생성 파일이 최신인지 검사합니다. 시스템 기능이나 API 경로를 바꾸면 `system-map.json`과 설명 문서를 함께 수정한 뒤 두 명령을 실행합니다.

## 전체 품질 파이프라인

```bash
npm run pipeline
```

이 명령은 시스템 문서 동기화, 애플리케이션 소스 린트, TypeScript 검사, Next.js 프로덕션 빌드를 순서대로 실행합니다. 같은 명령은 GitHub Actions의 `system-quality-pipeline` 작업에서도 실행됩니다.

## 문서 해석 원칙

이 문서는 세 가지를 구분합니다.

1. 현재 구현은 코드에서 확인한 실제 동작입니다.
2. 운영 원칙은 개인정보 처리방침과 제품 화면이 약속하는 방식입니다.
3. 목표 구조는 현재 구현과 운영 원칙이 어긋나는 부분을 해소하기 위한 결정입니다.

이 구분이 필요한 이유는 AI 전송 필드, 인증, 자동 파기처럼 설명과 코드가 동시에 맞아야 하는 영역이 있기 때문입니다. 차이가 발견되면 문구만 고치거나 코드만 바꾸지 않고 둘을 같은 변경 단위로 다룹니다.
