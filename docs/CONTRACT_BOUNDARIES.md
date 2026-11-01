# TASK-00 | 네 트랙이 공유할 계약의 잠금 기준

**2026-11-01 UI 소비 계약 검토:** #72~#76 HEAD 리뷰 5건 완료. #72 캘린더 실 API/versions, #75 sandbox `loaded.key` 및 미저장 `draft/note/picked` 학생 전환 격리 **변경 요청**, #73 취소된 세션 성공 콜백·#74 비공식 주의 안내·#76 실제 CI/E2E 증거는 COMMENT 후 수정 대기. 모두 미병합, 최신 HEAD Actions 0건. 코드/계약 소비자 4트랙 전체 인적 독립 수락 및 자료권리/실운영은 미완료. [STATUS](../STATUS.md).

## 2026-11-01 최신 소비 계약 — 코드 병합/실연동 구분

| 계약·API | 실제 확인된 코드/PR | 아직 충족하지 않은 완료 게이트 |
| --- | --- | --- |
| actor·Context·SharingGrant/인증·REVIEWER | 서버/PG #58·[#83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83), 비동기 등록/프로필 grant 최종 재확인 #105, URL fragment·REVIEWER 합성 end-to-end #110 | 실 Google OIDC/실학교 메일·실 DB/HTTPS·실 심사자 UI #73/#75 |
| CalendarResult 및 브라우저 GET | #50 계산/#53 wire/#58 `GET /api/demo/contexts/:id/calendar`, #77 브라우저, #95 늦은 overlay 후 응답 폐기·#100 합성 탭 분리 | [UI #72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72) 비합성 서비스 포트/버전 교체 잔상 문제 해결 및 UI #51 실제 E2E |
| OwnerWorkspace BOOKMARK 지원 단계 | #97 strict enum·CAS/원하는 한 단계 owner-only PATCH, #106 same-origin 브라우저·#115 탭 종료/actor 전환 후 성공 영수증 폐기 | #80 UI 보드·접근성, 공식 결과 자동 판정/제출은 의도적으로 없음 |
| STUDY_PLAN 검사 | [학업 순수 계산 #91](https://github.com/ot4562-glitch/HUFS-One-AI/pull/91)·[#116 strict 응답 호환](https://github.com/ot4562-glitch/HUFS-One-AI/pull/116), [인가/응답 계약·HTTP gate #103](https://github.com/ot4562-glitch/HUFS-One-AI/pull/103) | 실제 검수된 RulePack/전공·과목 rights 및 authorized provider 연결, #81 UI. provider 없음은 503, 임의 READY 금지 |
| 전공 What-if | [#107](https://github.com/ot4562-glitch/HUFS-One-AI/pull/107) 엄격한 hypothetical-only 요청/blocked/검증된 delta **DTO만** 병합 | #82 실제 다른 전공 학업 계산 코어·source rights·서버 인가 API·UI. RulePack 개정 비교 #90은 What-if 계산이 아님 |
| 출처/RAG·권리 | #58 Temporal RAG·SourceRevision, #99 원본 SHA/capture/문단 ordinal 거부, #113 PG session-level ingest lock | 실제 기관 원문 승인·사용조건·OCR 이미지 검수·독립 사실 근거/Recall@k |
| 공개 배포 게이트 | #92~#111 synthetic·PG Actions/민감 번들/브라우저 캐시/비밀 경로·release readiness 차단 | 실제 도메인/TLS·CDN/직접 IP·운영 NCP·학생 원본 및 권리/개인정보 동의. RELEASE_BLOCKED |

아래의 '캘린더 API 미구현', 'Google/OIDC/SourceRevision 계약 미구현' 표현은 당시 설계 이력이며, 이 표의 **main 코드 구현 상태**가 우선한다. 코드 병합/합성 PASS가 기관 승인·실학생 처리·UI 실브라우저 접속을 뜻하지는 않는다.



**정본:** [Architecture.md](../Architecture.md) A02~A09·A13. 기술 총괄 심민성(`ot4562-glitch`)이 `packages/contracts`·TopicCode·공통 설정/lockfile·DB migration을 조정한다. **TypeScript/Zod v0.1.0의 합성 계약 코드는 `packages/contracts/`에 구현되어 있으며, 최종 잠금은 전용 PR의 CI 및 4명 실제 소비자 검토 이후다.** 자동 소비 테스트와 실제 사람의 리뷰를 혼동하지 않는다. [사용법](../packages/contracts/README.md).

| 계약 | 정본 | 제공자 → 소비자 | 반드시 확인 |
| --- | --- | --- | --- |
| Actor, DemoContext, SharingGrant | A02 | API 심민성 → UI 이의상·QA 심민성 | 인증 actor와 선택 subject 분리; grant/만료/철회 |
| DemoSnapshot, VersionEnvelope | A02·A04·A13 | API 심민성 → UI/추천/학업 | 원자적 봉투, 지연 응답·다중 탭 격리 |
| TopicCode 24개·alias | A04.1~3 | 추천 김채윤 → 통합 심민성 → UI/AI | 24개 enum 단일 출처, UNKNOWN 보존 |
| FeedResult·적격성 | A04~05 | 추천 김채윤 → UI/API | 큰 카드 최대3, 작은 목록 최대6, 전체 목록 |
| NoticeResult | A07 | 김채윤 → UI/학업/API | #44 overdue Wire 및 #16 실제 items[].overdue 출력·합성 부정 테스트 **main 병합**; 서버/화면 권한 소비는 별도 |
| CalendarResult (#53 wire, #50 계산) | A07.3·A13 | 김채윤 계산 #50 → 심민성 서버 #58/브라우저 #77·경합 보호 #95 → 이의상 UI #72 미병합 | asOf/서울 날짜·확정/미정/적용 미확인·grant/철회. **API 코드 main 병합 ≠ 실제 UI 연결**; #72 비합성 port 미연결/동일 context 버전 잔상 CHANGES_REQUESTED, HEAD CI·실브라우저 검증 미완료 |
| RulePack, AcademicSummary, Outlook | A08~09 | 학업 박준영 → UI/API | 3원장, 정수학점, 검수/미확정, asOf |
| SafeLlmPacket·증거 | A06 | 심민성(웹 API/DTO·증거 검증) ↔ 이서연(NCP Provider SDK/실제 호출) → 추천·UI | 네 AI 작업, 안전 입력과 quote ID, NCP 외부 호출은 이서연 전담 |
| Forms 26열/과목 CSV 6열 | A03 | 제한 import → 학업/QA | **4인 입력 whitelist**, 미승인 자동 연결 금지 |
| 인증·오류 enum·API v1 | A02·A13 | 심민성(API) → 모든 팀 | 401/403/409/422/429/503, requestId |
| **외대 이메일 확인·Google 로그인 공개 접속 게이트 (P0, 미구현)** | A14.1a·A13 | 심민성 인증 API → 이의상 UI → 이서연 NCP ingress/TLS(환경만) | `외대.온라인.한국`, Google OIDC 토큰의 `sub`/`iss`/`aud`/nonce/PKCE, 검증된 Workspace `hd` 또는 외대 메일 OTP, beta allowlist, 익명 HTML/API·directIP/CDN 차단, 401/403·철회 E2E |

## 구현한 TypeScript/Zod v0.1.0 타입·동작 (A02/A04/A06/A13과 동일 의미)

- **Selector:** `SubjectAlias='S01'|'S02'|'S03'|'S04'|'S05'`; `DatasetMode='REAL_CONSENTED'|'SYNTHETIC'|'MIXED'`; readiness `READY|PARTIAL|PENDING|REVOKED`. 개발팀 5명과 실제 자료 제출자 **4명**은 다른 차원이다. 미제출·미승인은 PENDING/NOT_SHARED이고 실제 정보를 임의 생성하지 않는다.
- **DemoContext 필수:** `contextId,actorId,demoSubjectId,demoRunId,sessionIdHash,datasetVersion,projectionVersion,sharingGrantVersion,expiresAt`. **actorId는 인증한 서버만 결정**하며 subject 선택이 계정·권한을 바꾸지 않는다. 한 탭의 선택을 다른 탭 전역 변수에 저장하지 않는다.
- **Snapshot:** `contextId,demoSubjectId,datasetMode,asOf,versions,feed,notices,academics,forecast,aiProvenance`. `versions`에는 `profile,projection,consent,dataset,topics,rules,overlay,rankConfig`를 포함한다. 컨텍스트·subject·grant 버전·요청 epoch가 일치할 때만 UI에 적용한다.
- **공고/공지:** 닫힌 24 TopicCode, 미지정 UNKNOWN, 적격성 `ELIGIBLE|INELIGIBLE|UNKNOWN`, 단계별 근거·출처·dataMode. `FEATURED_LARGE` 최대3, `COMPACT_LIST` 최대6; 작게 표시된 원본 목록 접근권을 없애지 않는다.
- **학업:** `EARNED`/`IN_PROGRESS`/`PLANNED`를 분리하고 `creditUnits` 정수로 계산한다. `RulePackDraft`는 내부 작성/사람 승인 전 상태로, 공식 졸업 인정이나 새 공개 AI API가 아니다. Outlook은 확정/역사/UNKNOWN을 구분하고 asOf 이후 자료 유출을 금지한다.
- **CLOVA:** 제품 AI 업무는 `experience_skills`, `opportunity_terms`, `personal_action_brief`, `graduation_explanation`의 **네 작업**이다. 구조화 JSON/quote를 실제 자격·학점 검증 대신 사용하지 않으며 개인정보 원본/actor/subject 매핑을 제공자에 보내지 않는다.
- **API 오류:** 통일된 응답 봉투는 `{code,message,requestId,retryable,contextId?}`. 상태 401(인증), 403(미공유/철회), 409(버전), 422(스키마/근거), 429(한도), 503(서비스 장애). 세부 `code` literal과 Zod 스키마는 실제 계약 PR에서 하나의 정본으로 고정한다.
- **Intake:** Forms 원본은 **26열 헤더/4인 응답**, 과목 CSV는 동일 4명의 각 6열 파일이다. **사용자가 `까마르=김채윤` 별명 소유자를 직접 확인**했으므로 이 파일은 3번째 제출로 집계한다. 하지만 실명↔가명 매핑은 런타임의 별도 승인 registry에 주입하고 코드/CI에 하드코딩하지 않는다. main에 파일 4개/Forms 통합본이 존재해도 개인별 게시·열람·AI/NCP 처리 동의는 미확인; 원본 학업행은 합성 fixture에 사용 금지.

**변경 영향 — 구현 전:** 현재 v0.1.0 contracts/fixture는 Google OAuth/학교 메일 확인을 구현하지 않는다. 기존 `POST /api/auth/login` 초안은 인터넷 공개용으로 쓰지 않는다. 실제 callback·Google `sub`·OTP challenge/verify·session/401·403·재인증·확인 주기를 별도 **공통 인증 계약 PR**로 정의하고 4개 트랙이 검토한다. Google `email_verified=true`만으로 외대 메일 수신권을 주장하거나, 개인 Gmail만으로 로그인시키지 않는다. 학교 공식 SSO 허가는 필요 조건이 아니지만 Google OAuth+외대 메일 검증 미구현이면 인터넷 배포 BLOCKED.

## TASK-00 승인 체크리스트 — 합성 fixture만 사용

- [x] **계약 패키지 v0.1.0:** TypeScript/Zod strict enums·입출력·API errors; npm lockfile과 빌드 ESM·타입 선언을 고정하고 Node 직접 import를 로컬 확인.
- [x] **합성 파서 계약:** TopicCode 24개·Forms 원문 26헤더·과목 CSV 6열을 strict 검증하고 alias 충돌·불량 학점·수강 상태·추가 성적 열·미승인 파일명을 거부한다.
- [x] **5 demo/4 입력 분리:** PENDING/synthetic 반환·4인 합성 제출·명시된 파일명 binding 시험. 실제 이름→S번호 대응은 별도 private registry 주입이며 소스·CI에는 없음.
- [x] **합성 wire-level:** 정상 snapshot·403 철회·409 버전충돌·422 형식·429 제한·503 장애 응답, 20개 유향 cross-subject 거부, 선택 epoch·2탭 문맥 격리를 자동 검증. **실제 UI/API 동시성·DB 캐시 철회 E2E는 미구현**이며 별도 TASK-07/09/15 게이트다.
- [ ] A08 학점 9개·예외 누락 4개 독립 기준, A09 UNKNOWN/0/n·시간누출 차단을 소유 트랙의 소비 계약에 연결.
- [x] **로컬 계약 실행:** 학생 응답/키·외부 AI 호출 없이 TypeScript+Zod 자동 테스트 **107/107** 통과(계약 87·UI/추천/학업/API 소비 20). GitHub Action은 Private CSV/Forms/원문을 checkout에서 제외하는 sparse-checkout으로 구성. **GitHub Actions 원격 실행 성공 여부는 별도 확인 필요**.
- [ ] **실제 사람의 승인:** 이의상(UI), 김채윤(추천), 박준영(학업), 심민성(API)의 코드 검토와 심민성 최종 승인·PR merge SHA를 남긴다. **자동화된 4트랙 소비 테스트 20/20은 통과했지만 본인의 검토 서명이 아니다.**

**변경 순서:** TASK-00 이슈 → 이 문서/A02~A13 기준 합성 fixture → `chore/contracts-...` 전용 PR → 네 소비자 교차검토 → 통합 담당 최종 병합 → 각 기능 브랜치 재동기화. 소비자가 공통 타입을 독자 생성하거나 실제 CSV를 fixture로 업로드하는 것은 금지한다.

## 시간·이미지·RAG 계약 vNext 제안(구현·승인 별도)

이번 2026-10-31 설계 변경은 기존 TASK-00 Zod 스키마를 자동으로 변경하지 않는다. 기술 총괄 심민성이 `SourceRevision`(hash·게시/확인/검수/효력 시각·정정 상태), `SourceSpan`(TEXT 문자범위 | IMAGE bbox/ocrLine/page), `VerifiedClaim`(근거·검수·허용 scope), `RetrievalEnvelope`(권한·asOf·retrieval 정책/결과), `DecisionAdvice`(Laya 모델판본·선택·폴백)를 **별도 contracts vNext PR**로 제출한다. `Opportunity`·`NoticeResult`·`SafeLlmPacket`에 바뀐 `sourceVersion` 및 이미지 근거를 호환 가능한 optional 필드로 연결하며 미래 자료를 과거 시점에 노출하지 않는다. 4트랙 소비 테스트/독립 이미지·시간 fixture·API 게이트·OCR/Vision budget·CPU 메모리 조건이 잠금 조건이다. 상세: [TRUSTED_RAG_MEDIA_VERSIONING.md](TRUSTED_RAG_MEDIA_VERSIONING.md).

## 2026-10-31 합병된 선택적 계약 및 신규 캘린더 데이터 경계

- **main 병합 계약 및 실제 순수 소비:** [#36](https://github.com/ot4562-glitch/HUFS-One-AI/pull/36) 학업 검수 vNext, [#44](https://github.com/ot4562-glitch/HUFS-One-AI/pull/44) NoticeResult.items[].overdue optional·TopicCode alias, [#47](https://github.com/ot4562-glitch/HUFS-One-AI/pull/47) FeedCard.explanation?/programScope/deadlineKind, [#53](https://github.com/ot4562-glitch/HUFS-One-AI/pull/53) CalendarResult Wire. 여기에 [#16](https://github.com/ot4562-glitch/HUFS-One-AI/pull/16) 실제 overdue 직렬화, [#49](https://github.com/ot4562-glitch/HUFS-One-AI/pull/49) 부분공유 입력, [#40](https://github.com/ot4562-glitch/HUFS-One-AI/pull/40) 시점 gate, [#50](https://github.com/ot4562-glitch/HUFS-One-AI/pull/50) 캘린더 계산 코어도 main 병합. 각각 합성 CI/승인 뒤 병합됐지만 소비자가 응답에 실제 필드를 넣는 연결은 별개다.
- **캘린더 요청·응답:** 기존 DemoSnapshot을 무단 확장하지 않고 인증된 GET /api/demo/contexts/:contextId/calendar (**계약상 예정, 아직 미구현**)이 CalendarResult를 반환하도록 한다. `asOf/from/to`, `entries`(NOTICE/OPPORTUNITY; STUDENT_DEADLINE/APPLY_DEADLINE/EVENT), `undated`(상시/미정), `needsConfirmation`(적용 불확실), `ambiguousNoticeIds`(중복 충돌)을 구분한다. EVENT를 학생 지원마감으로 표시하지 않고, `seoulDate`/overdue/중복/확정 근거를 검증한다. 화면은 날짜를 독자 계산하지 않는다.
- **인가/출처 선행:** BETA는 actor/subject/context, 최신 grantVersion/sections, 철회/만료, 공유 학업·경험·관심 원천, 검수된 sourceRevision/rights, `asOf`와 `scopeKey`를 서버에서 검증한다. [#55](https://github.com/ot4562-glitch/HUFS-One-AI/pull/55) 원자적 조회와 [#35](https://github.com/ot4562-glitch/HUFS-One-AI/pull/35) PG 허가, [#49](https://github.com/ot4562-glitch/HUFS-One-AI/pull/49) 재계산이 연결되기 전에는 부분 공유에 대한 파생 일정이 화면에 나가면 안 된다. REVIEWER는 합성만. API/DB/화면 통합·철회 레이스 및 실제 PG는 아직 검증 전이다.
- **후속 소비자:** 김채윤 #16은 #44의 `overdue`를 실제 NoticeResult.items[]에 직렬화 완료했고 #50 계산은 #53 wire 합성 검증 통과·main 병합. **#41**도 #47 설명을 FeedCard에 직렬화하고 미공유 경험/전공 부정 테스트·fresh HEAD 승인/CI 후 **main 병합 완료**. 실제 React/API + 권한 데이터 소비는 별도. 이의상 **#51**은 캘린더 모바일/스크린리더/NOT_SHARED, 심민성 **#52**는 인증된 GET + scopeKey/source rights·철회 E2E가 남는다. 독립 코드 병합 기준은 비작성자 1명 이상 최신 HEAD 승인+CI+의존/보안 검증([PR_WORKFLOW](PR_WORKFLOW.md)).

## REVIEWER auth vNext 분리 계약 (Issue #25)

`VerifiedActor`는 기존 `BETA|ADMIN`(학교 메일 proof + 베타 allowlist)과 `REVIEWER`(OIDC의 검증된 `sub`·현재 이메일 소유 증거 + 공용 초대 DB grant)로 **구별된 타입**을 사용한다. REVIEWER는 이메일만으로 자동 승인되지 않으며 `reviewer_invitation` 등록 전에는 페이지 접근 403. 기존 `SharingGrant`와 팀원 5명 시연 선택 문맥을 우회하거나 계약 속에 암묵적으로 포함시키지 않는다. 오직 `ReviewerGrant`과 독립 `ReviewerDemoRepository`에서 SYNTHETIC 재현 데이터만 취득한다. 초대 32바이트 원문은 DB·Git·CI 저장 금지; SHA-256 digest와 Google sub·email, 심사 기간/철회만 원장으로 남긴다. `startsAt <= now < endsAt` 및 철회는 매 요청 서버 권한 검사와 트랜잭션 적용. 신규 역할을 공통 UI/웹 Zod auth contract로 확장할 때는 vNext 소비자 승인·UI 마이그레이션을 별도 PR로 추진한다. 전체: [REVIEWER_ACCESS.md](REVIEWER_ACCESS.md).

## 2026-10-31 기능·인프라 경계 재확인 (PR #31)

- 심민성 `ot4562-glitch`(#18/#19/#21/#25/#27): 웹·외부 REST/Fastify API, Google OIDC/초대/CSRF/세션, 일반 PostgreSQL·SourceRevision/Temporal RAG·정책/근거 DTO, synthetic REVIEWER actions, CI/통합.
- 이서연(`lhh42001`, #12/#20/#22; GitHub 이슈 assignee 확인): NCP VPC/VM·DB 호스팅·HTTPS ingress/IAM/키/비용/부하/워크플로, CLOVA Studio/OCR/HCX/Vision/NCP SDK 및 실제 provider API·Laya ONNX worker. 일반 웹 API/Google 애플리케이션 인증 라우트는 소유하지 않는다. 이 배정은 별도의 실제 원본/클라우드 권한 허가를 의미하지 않는다.
- 이의상 UI #9, 김채윤 추천/공지 #10, 박준영 학사 #11 역할/assignee 변경 없음. 공통 API↔provider 경계는 공급자 비종속 DTO만 공유한다.
- [공식 SKU/816h 견적](NCP_OPERATIONS_2026.md): KR Linux High Memory-g3 4vCPU/32GB 326원/h, CB 50GB 8원/h, 공인 IP 선택 5.6원/h, 본선 발표 11/16 이후 승인 시 실제 개통.
