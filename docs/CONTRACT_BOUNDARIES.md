# TASK-00 | 네 트랙이 공유할 계약의 잠금 기준

**정본:** [Architecture.md](../Architecture.md) A02~A09·A13. 기술 총괄 심민성(`ot4562-glitch`)이 `packages/contracts`·TopicCode·공통 설정/lockfile·DB migration을 조정한다. **TypeScript/Zod v0.1.0의 합성 계약 코드는 `packages/contracts/`에 구현되어 있으며, 최종 잠금은 전용 PR의 CI 및 4명 실제 소비자 검토 이후다.** 자동 소비 테스트와 실제 사람의 리뷰를 혼동하지 않는다. [사용법](../packages/contracts/README.md).

| 계약 | 정본 | 제공자 → 소비자 | 반드시 확인 |
| --- | --- | --- | --- |
| Actor, DemoContext, SharingGrant | A02 | API 이서연 → UI 이의상·QA 심민성 | 인증 actor와 선택 subject 분리; grant/만료/철회 |
| DemoSnapshot, VersionEnvelope | A02·A04·A13 | API 이서연 → UI/추천/학업 | 원자적 봉투, 지연 응답·다중 탭 격리 |
| TopicCode 24개·alias | A04.1~3 | 추천 김채윤 → 통합 심민성 → UI/AI | 24개 enum 단일 출처, UNKNOWN 보존 |
| FeedResult·적격성 | A04~05 | 추천 김채윤 → UI/API | 큰 카드 최대3, 작은 목록 최대6, 전체 목록 |
| NoticeResult | A07 | 김채윤 → UI/학업/API | 학년/학과/마감/근거 분리 |
| RulePack, AcademicSummary, Outlook | A08~09 | 학업 박준영 → UI/API | 3원장, 정수학점, 검수/미확정, asOf |
| SafeLlmPacket·증거 | A06 | 이서연 → 추천·UI | 네 AI 작업, 안전 입력과 quote ID |
| Forms 26열/과목 CSV 6열 | A03 | 제한 import → 학업/QA | **4인 입력 whitelist**, 미승인 자동 연결 금지 |
| 인증·오류 enum·API v1 | A02·A13 | 이서연 → 모든 팀 | 401/403/409/422/429/503, requestId |
| **외대 이메일 확인·Google 로그인 공개 접속 게이트 (P0, 미구현)** | A14.1a·A13 | 이서연 API/NCP(Gemini) → 이의상 UI → 심민성 통합/QA | `외대.온라인.한국`, Google OIDC 토큰의 `sub`/`iss`/`aud`/nonce/PKCE, 검증된 Workspace `hd` 또는 외대 메일 OTP, beta allowlist, 익명 HTML/API·directIP/CDN 차단, 401/403·철회 E2E |

## 구현한 TypeScript/Zod v0.1.0 타입·동작 (A02/A04/A06/A13과 동일 의미)

- **Selector:** `SubjectAlias='S01'|'S02'|'S03'|'S04'|'S05'`; `DatasetMode='REAL_CONSENTED'|'SYNTHETIC'|'MIXED'`; readiness `READY|PARTIAL|PENDING|REVOKED`. 개발팀 5명과 실제 자료 제출자 **4명**은 다른 차원이다. 미제출·미승인은 PENDING/NOT_SHARED이고 실제 정보를 임의 생성하지 않는다.
- **DemoContext 필수:** `contextId,actorId,demoSubjectId,demoRunId,sessionIdHash,datasetVersion,projectionVersion,sharingGrantVersion,expiresAt`. **actorId는 인증한 서버만 결정**하며 subject 선택이 계정·권한을 바꾸지 않는다. 한 탭의 선택을 다른 탭 전역 변수에 저장하지 않는다.
- **Snapshot:** `contextId,demoSubjectId,datasetMode,asOf,versions,feed,notices,academics,forecast,aiProvenance`. `versions`에는 `profile,projection,consent,dataset,topics,rules,overlay,rankConfig`를 포함한다. 컨텍스트·subject·grant 버전·요청 epoch가 일치할 때만 UI에 적용한다.
- **공고/공지:** 닫힌 24 TopicCode, 미지정 UNKNOWN, 적격성 `ELIGIBLE|INELIGIBLE|UNKNOWN`, 단계별 근거·출처·dataMode. `FEATURED_LARGE` 최대3, `COMPACT_LIST` 최대6; 작게 표시된 원본 목록 접근권을 없애지 않는다.
- **학업:** `EARNED`/`IN_PROGRESS`/`PLANNED`를 분리하고 `creditUnits` 정수로 계산한다. `RulePackDraft`는 내부 작성/사람 승인 전 상태로, 공식 졸업 인정이나 새 공개 AI API가 아니다. Outlook은 확정/역사/UNKNOWN을 구분하고 asOf 이후 자료 유출을 금지한다.
- **CLOVA:** 제품 AI 업무는 `experience_skills`, `opportunity_terms`, `personal_action_brief`, `graduation_explanation`의 **네 작업**이다. 구조화 JSON/quote를 실제 자격·학점 검증 대신 사용하지 않으며 개인정보 원본/actor/subject 매핑을 제공자에 보내지 않는다.
- **API 오류:** 통일된 응답 봉투는 `{code,message,requestId,retryable,contextId?}`. 상태 401(인증), 403(미공유/철회), 409(버전), 422(스키마/근거), 429(한도), 503(서비스 장애). 세부 `code` literal과 Zod 스키마는 실제 계약 PR에서 하나의 정본으로 고정한다.
- **Intake:** Forms 원본은 **26열 헤더/4인 응답**, 과목 CSV는 동일 4명의 각 6열 파일이다. **사용자가 `까마르=김채윤` 별명 소유자를 직접 확인**했으므로 이 파일은 3번째 제출로 집계한다. 하지만 실명↔가명 매핑은 런타임의 별도 승인 registry에 주입하고 코드/CI에 하드코딩하지 않는다. 아직 이서연 파일/Forms 통합본/동의는 미완료; 원본 학업행은 합성 fixture에 사용 금지.

**변경 영향 — 구현 전:** 현재 v0.1.0 contracts/fixture는 Google OAuth/학교 메일 확인을 구현하지 않는다. 기존 `POST /api/auth/login` 초안은 인터넷 공개용으로 쓰지 않는다. 실제 callback·Google `sub`·OTP challenge/verify·session/401·403·재인증·확인 주기를 별도 **공통 인증 계약 PR**로 정의하고 4개 트랙이 검토한다. Google `email_verified=true`만으로 외대 메일 수신권을 주장하거나, 개인 Gmail만으로 로그인시키지 않는다. 학교 공식 SSO 허가는 필요 조건이 아니지만 Google OAuth+외대 메일 검증 미구현이면 인터넷 배포 BLOCKED.

## TASK-00 승인 체크리스트 — 합성 fixture만 사용

- [x] **계약 패키지 v0.1.0:** TypeScript/Zod strict enums·입출력·API errors; npm lockfile과 빌드 ESM·타입 선언을 고정하고 Node 직접 import를 로컬 확인.
- [x] **합성 파서 계약:** TopicCode 24개·Forms 원문 26헤더·과목 CSV 6열을 strict 검증하고 alias 충돌·불량 학점·수강 상태·추가 성적 열·미승인 파일명을 거부한다.
- [x] **5 demo/4 입력 분리:** PENDING/synthetic 반환·4인 합성 제출·명시된 파일명 binding 시험. 실제 이름→S번호 대응은 별도 private registry 주입이며 소스·CI에는 없음.
- [x] **합성 wire-level:** 정상 snapshot·403 철회·409 버전충돌·422 형식·429 제한·503 장애 응답, 20개 유향 cross-subject 거부, 선택 epoch·2탭 문맥 격리를 자동 검증. **실제 UI/API 동시성·DB 캐시 철회 E2E는 미구현**이며 별도 TASK-07/09/15 게이트다.
- [ ] A08 학점 9개·예외 누락 4개 독립 기준, A09 UNKNOWN/0/n·시간누출 차단을 소유 트랙의 소비 계약에 연결.
- [x] **로컬 계약 실행:** 학생 응답/키·외부 AI 호출 없이 TypeScript+Zod 자동 테스트 **107/107** 통과(계약 87·UI/추천/학업/API 소비 20). GitHub Action은 Private CSV/Forms/원문을 checkout에서 제외하는 sparse-checkout으로 구성. **GitHub Actions 원격 실행 성공 여부는 별도 확인 필요**.
- [ ] **실제 사람의 승인:** 이의상(UI), 김채윤(추천), 박준영(학업), 이서연(API)의 코드 검토와 심민성 최종 승인·PR merge SHA를 남긴다. **자동화된 4트랙 소비 테스트 20/20은 통과했지만 본인의 검토 서명이 아니다.**

**변경 순서:** TASK-00 이슈 → 이 문서/A02~A13 기준 합성 fixture → `chore/contracts-...` 전용 PR → 네 소비자 교차검토 → 통합 담당 최종 병합 → 각 기능 브랜치 재동기화. 소비자가 공통 타입을 독자 생성하거나 실제 CSV를 fixture로 업로드하는 것은 금지한다.
