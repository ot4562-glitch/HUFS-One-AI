# HUFS One AI | 확정 5인 분업과 에이전트 작업 경계

## 2026-11-01 후속 PR 리뷰·인수인계 최신 상태

- **김채윤(추천/공지):** [#118](https://github.com/ot4562-glitch/HUFS-One-AI/pull/118) 권한 정책 버전 캐시 키는 총괄의 독립 승인/Actions 2 job 성공 후 **main merge `fdf0b09b`**. [#117](https://github.com/ot4562-glitch/HUFS-One-AI/pull/117) 추천 제외 사유는 조직별 노출 상한과 다양성에서 틀린 `OUTRANKED` 설명이 가능해 **CHANGES_REQUESTED**; 알고리즘과 설명의 반례 회귀 추가 필요.
- **심민성(공통 계약/API):** [#120](https://github.com/ot4562-glitch/HUFS-One-AI/pull/120) 검수된 공고 정정 비교·안전한 제외 사유 DTO → [#121](https://github.com/ot4562-glitch/HUFS-One-AI/pull/121) owner/rights 인가 read-only API 및 브라우저 클라이언트 **스택 미병합**. 두 HEAD 코드 리뷰 COMMENT·동일 HEAD Actions SUCCESS; 비작성자 리뷰어는 #120 김채윤·박준영, #121 박준영·이의상 요청 상태.
- **박준영(학업):** #121의 What-if는 인증된 실행 경계만 제공하고 **실제 두 RulePack 재계산 코어는 없음**. 수강계획 adapter도 승인 원장/공식 규칙팩/권리 provider 없이는 기본 503.
- **이의상(UI):** #72→#76 기존 스택 차단(#72/#75 CHANGES_REQUESTED) 유지. #119 정정 비교·#86 제외 이유·#81 계획·#82 What-if의 실제 React 화면/브라우저 E2E는 미완료.
- **릴리스/데이터:** #46 Private 원본 권리·개인정보 감사 2 FAIL, #61 독립 골드 0/200, #89 `RELEASE_BLOCKED`. 팀별 소유권/합성 코드/운영 승인 분리를 유지.

## 2026-11-01 추가 제안 4건 담당/의존성 (이슈 등록 완료, 기능 미완료)

- **P0 제안 · [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119) 공고 정정 전후 비교:** 이의상 `uisang2004-maker` 화면/접근성 소유, 심민성 `ot4562-glitch` 허용된 SourceRevision·검수 시각·permission/asOf/API, 김채윤 `qamarrchae` 정정/취소/추천 캐시 소비 검수. #19/#21 기존 출처 계약에 연결; 합성 11/20→11/25 예시와 401/403/409/철회/늦은 응답 테스트가 신규 수락 게이트.
- **P1 제안 · [#86](https://github.com/ot4562-glitch/HUFS-One-AI/issues/86) ‘왜 추천되지 않았나요?’:** 기존 issue 보강. 김채윤 core reason enum, 심민성 권한/비노출 API, 이의상 상세/피드 UI. 권한 없는 후보의 존재·숫자/미공유 개인정보를 이유로 노출하지 않음.
- **P1 제안 · [#80](https://github.com/ot4562-glitch/HUFS-One-AI/issues/80) 지원 준비·진행 보드:** 기존 issue 보강. #97/#106/#115의 owner API·CAS/웹 소비자 계약은 병합, 실제 학생용 React 단계 보드/할 일/D-day·다중탭/360px E2E는 이의상 미완료(착수 시기는 팀 결정, 종전 11/10 이후 권고 유지).
- **P2 제안 · [#82](https://github.com/ot4562-glitch/HUFS-One-AI/issues/82) 복수·이중전공 What-if:** 기존 issue 보강. 박준영 검수된 전공별 RulePack/가정 계산 → 심민성 인가 HTTP API(#107 DTO만 main) → 이의상 현재 vs 가정·불확실성 UI. 실제 학칙/학적 확인 전 합성 전용·‘공식 판정 아님’ 경고.

**통합 규칙:** 서로 다른 트랙의 소유 모듈을 임의 변경하지 않고 독립 현재 HEAD 리뷰·CI 후 병합. 네 기능의 우선순위는 **사용자 제안에 대한 구현 추천**이며 운영 리소스·실학생 자료 사용·출시 허가는 아니다.

**2026-11-01 UI 소유자 최신 핸드오프:** 이의상 담당 [#72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72)·[#75](https://github.com/ot4562-glitch/HUFS-One-AI/pull/75)는 최신 HEAD 변경 요청, #73·#74·#76은 COMMENT 검수(5건 리뷰 등록 완료). #72 실 calendar 소비/버전 잔상, #75 대상별 미저장 form state/새 snapshot 격리 재현 테스트가 우선이다. 다섯 HEAD Actions 기록 0건/병합 0건. 학업/추천/NCP/UI 소유권은 유지하며 기술 총괄은 타인 화면 코드를 임의 덮어쓰지 않는다.

## 2026-11-01 최신 역할별 병합/핸드오프 (정본)

- **심민성 — 웹 API·계약·PG·RAG·릴리스 보안/통합:** [#83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83)과 #92~#115 중 본인 담당/협업 승인 범위의 후속 PR을 병합했다. 인증 사후 재검증 #105, SourceReview #99, DB 철회 #102/#112, 수집 중복 실행 #113, 계약/API #97/#103/#107, 웹 소비자 #95/#100/#106/#110/#115, 오프라인 릴리스 보안 #92/#93/#94/#96/#98/#101/#104/#108/#109/#111이 main에 있다. **신규 PR의 자체 리뷰/병합은 이번 사용자 지시 예외로 기록한 COMMENT이며 독립 승인 아님.**
- **이의상 — UI/접근성/실브라우저:** #72 캘린더 비합성 포트 연결 및 snapshot 교체 시 잔상 가능성 해결이 필수. 후속 UI 스택 #73~#76은 선행 #72의 CHANGES_REQUESTED·스택 CI 차단으로 **OPEN**. 기술 총괄은 화면 코드를 임의 수정하지 않으며 재현 테스트·리뷰에 원인/계약을 전달한다.
- **박준영 — 학업 순수 코어:** [#90](https://github.com/ot4562-glitch/HUFS-One-AI/pull/90) RulePack 개정판 diff와 [#91](https://github.com/ot4562-glitch/HUFS-One-AI/pull/91) 수강계획 검사 코어 병합, [#116](https://github.com/ot4562-glitch/HUFS-One-AI/pull/116) #103 응답 strict wire 호환성 수정도 독립 승인·main 병합. #82 가상 전공 계산과 공식 학칙·독립 학생/조항 승인은 아직 미완료. #103은 API 인가·검토 계약이지 실학업 provider 자동 개통이 아니다.
- **김채윤 — 추천·공지 순수 코어:** [#84](https://github.com/ot4562-glitch/HUFS-One-AI/pull/84) 학업 결과→공지용 열린 요건 처리 병합. 실기관 출처 권리·독립 검토 200개 골드 라벨 [#61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61)은 OPEN.
- **이서연 — NCP/클라우드/provider:** NCP·CLOVA OCR/HCX/Laya·TLS/실 ingress·유료 실행은 별도 승인/실측 전 BLOCKED. 기술 총괄은 클라우드 리소스를 생성하지 않았다.
- **교차 의존:** #80는 owner 보관함 단계 API/웹(#97/#106/#115) 완료, UI 보드는 미완료. #81은 학기 계획 검사 코어 #91·응답 정합 #116/서버 계약 #103 완료, 실제 RulePack 승인·provider·나란히 보기 UI 미완료. #82는 What-if DTO #107만 완료, 학업 가상 계산·인가 API·UI 미완료. #52는 서버/클라이언트 계약 main 병합, 실제 달력 UI #72 미연결로 OPEN. #89는 오프라인 CI가 존재하나 인터넷 진입면/운영 검증이 없어 RELEASE_BLOCKED 유지.



## 2026-11-01 최신 역할·협업 핸드오프

- **11/10 이후 UI 제안의 현재 이슈 분담:** [#79](https://github.com/ot4562-glitch/HUFS-One-AI/issues/79) D-day는 `uisang2004-maker` UI 담당, [#80](https://github.com/ot4562-glitch/HUFS-One-AI/issues/80) 지원 현황 보드는 UI `uisang2004-maker` + 계약/API `ot4562-glitch`, [#81](https://github.com/ot4562-glitch/HUFS-One-AI/issues/81) 수강계획 나란히 보기 및 [#82](https://github.com/ot4562-glitch/HUFS-One-AI/issues/82) 졸업 What-if는 UI `uisang2004-maker` + 학업 `taewangim-alt` + API `ot4562-glitch` 공동 할당 확인. 이슈 배정은 작업 수락/실자료 권한 검증이 아니며 세부 계약·RulePack 검수는 미완료.

- **이전 핸드오프 정정:** 플랫폼 [#83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83)은 당시 리뷰 요청 단계였지만, 이후 main `3c6378c` 병합되었다. 이번 신규 UI #72~#76은 별개로 현재 열린 스택이고 검증 대기 중이다.

GitHub 이슈의 **현재 담당**은 심민성 `ot4562-glitch`(#27 API/인증/일반 PG/Temporal/공통 계약, #71 브라우저 캘린더 포트), 이의상 `uisang2004-maker`(#9 UI/접근성, #51 캘린더), 김채윤 `qamarrchae`(#10 추천·공지·합성 평가), 박준영 `taewangim-alt`(#11 학업/RulePack), 이서연 `lhh42001`(#12/#20/#22 NCP·CLOVA·OCR/Vision·Laya 환경/실 provider)이다. GitHub 할당은 개인정보 처리/기관 승인과 별개다.

- **통합/main:** API·출처·권한 합성 코드 #58와 React 셸 #68 모두 병합. [#68](https://github.com/ot4562-glitch/HUFS-One-AI/pull/68)의 데이터 혼합 P1은 최신 CI·반례 테스트 후 수정/승인됨.
- **UI 스택 현황(2026-11-01):** [#69](https://github.com/ot4562-glitch/HUFS-One-AI/pull/69) 현재 HEAD 독립 APPROVED/CI 2 jobs SUCCESS 후 merge commit `5617222f`로 **main 병합 완료**. 후속 [#72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72) → #73 → #74 → #75 → #76은 OPEN; #72 base를 main으로 바꿨으나 **비합성 loadCalendar 미연결로 CHANGES_REQUESTED**. 작성자 `uisang2004-maker`가 수정/새 CI 후 재검토하고, 합성 E2E/실서버 E2E는 구별한다.
- **API→UI 요청(#71 완료, UI #51 진행):** [#77](https://github.com/ot4562-glitch/HUFS-One-AI/pull/77) `HufsApiClient.getCalendar(contextId,signal)`와 응답 거부/취소/권한 검증은 **main squash `552ad35e` 병합**(UI 담당 독립 승인·Actions 2 jobs 성공). 작성자 UI #72의 `main.tsx` 실제 비합성 `AppServices.loadCalendar = (ctx, signal) => api.getCalendar(ctx.contextId, signal)` 연결 및 `DemoController.runContextOperation` + `validateCalendarWire(..., snapshot.asOf)`·401/403·late 응답 회귀가 남았다.
- **학업 코어 추가 병합:** [#70](https://github.com/ot4562-glitch/HUFS-One-AI/pull/70) 규칙 발효기간/asOf 수정·CI·재승인 후 main `0a8d44bd` 병합. 실제 학칙 사람 원문 검토·적용 학번 규칙은 별도.

이 아래의 날짜별 협업 메모는 해당 시점의 이력이다. 예전 "calendar API 미구현"/"웹 UI 전부 미구현" 주장은 최신 통합 코드/기초 셸 상태를 덮어쓰지 않는다.


**SKU·기간·비용 공식 확인:** [NCP 2026 운영 정본](NCP_OPERATIONS_2026.md). 11/6~12/9 816h 계획 상한, 본선 발표 11/16 이후 개통 승인. 4vCPU/32GB High Memory-g3 326원/h, CB 50GB 8원/h, 서버+CB 272,544원(최대).

기준: **2026-10-30 사용자가 직접 알려준 팀 구성**. 이서연은 **팀 결성·기획을 이끈 리드**, 심민성은 **기술 총괄·GitHub 저장소 소유자·공통 계약과 최종 통합 담당자**다. 사람의 구독 현황은 보고 당시 기준이며, GPT·Claude·Gemini 개발도구와 **제품이 사용하는 CLOVA**를 혼동하지 않는다.

| 담당자 | 확정 기술 책임 | 보고된 AI 구독 | 소유 경로 | TASK |
| --- | --- | --- | --- | --- |
| **심민성** | 기술 총괄, API·인증·DB·수집/RAG 서버 구현과 계약/QA·최종 PR 병합 | GPT | `apps/api`(웹/외부 HTTP API), `packages/core/src/privacy`, `packages/contracts`, `packages/fixtures`, `tests`, `.github`, `docs`, `infra/sql`(일반 DB 스키마), 루트 설정 | 00·07·08·09·12·16·19·21·25·27 및 트랙 사이 API 지원 |
| **이의상** | UI·모바일·UX·접근성 | Claude, Gemini | `apps/web`, `packages/ui`, `assets/synthetic` | 04 및 05·09·15의 화면 |
| **김채윤** | 개인화 추천·중요공지 | GPT, Claude, Gemini | `packages/core/src/normalization`, `opportunities`, `notices` | 06·14 |
| **박준영** | 졸업요건·학점·수강계획·미래 개설 전망 | GPT, Claude | `packages/core/src/academics`, `forecast` | 01·02·03·17 |
| **이서연** | 팀 결성·기획 리드 + NCP·CLOVA·OCR/Vision·Laya 모델/Provider 구현 및 운영 전체 전담 | **Gemini (2026-10-30 사용자 확인)** | `packages/ai`(NCP/CLOVA/OCR/HCX/Laya provider 구현), `infra`(NCP VPC·OS·TLS·클라우드 IaC·키·과금/worker), 일반 `apps/api` 제외 | **#12·#20·#22**, NCP/CLOVA/OCR/Vision/Laya Provider·환경만 |

### 이슈 배정으로 확인한 GitHub 작업 계정 (2026-10-31)

| 담당 | GitHub 계정 | 연결 근거 |
|---|---|---|
| **심민성** | [`ot4562-glitch`](https://github.com/ot4562-glitch) | 저장소 소유자·[#8](https://github.com/ot4562-glitch/HUFS-One-AI/issues/8), [#18](https://github.com/ot4562-glitch/HUFS-One-AI/issues/18) 할당 |
| **이의상** | [`uisang2004-maker`](https://github.com/uisang2004-maker) | [UI 이슈 #9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9) 담당자 지정 |
| **김채윤** | [`qamarrchae`](https://github.com/qamarrchae) | [추천·공지 이슈 #10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) 담당자 지정 |
| **박준영** | [`taewangim-alt`](https://github.com/taewangim-alt) | [학업 이슈 #11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11) 담당자 지정 |
| **이서연** | [`lhh42001`](https://github.com/lhh42001) | [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20), [#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22) GitHub assignee로 현재 확인. 이는 GitHub 업무 계정 배정 근거이지 신분/개인자료 동의 증명은 아님 |

**정확성 경계:** 위 다섯 계정은 프로젝트 GitHub 이슈의 **현재 assignee 기록**에 근거한다. 신분증 수준의 실제 인물 확인이나 실학생 데이터 공유·외부 처리 동의와 다르며, 계정 할당으로 신규 권한을 만들지 않는다.

- **공개 웹 도메인/Google 인증 P0 협업:** 심민성(API)은 독립 Google OAuth OIDC·외대 메일 OTP 발송/검증·세션/권한 코드를 담당한다. 이서연(NCP/Gemini 사용)은 ingress·TLS·스토리지·CLOVA SDK/HTTP 요청, 모델/OCR/Vision·Laya worker와 클라우드 비용/안전 운영을 모두 담당한다. 이의상(UI)은 Google 로그인·학교 메일 코드·403·재인증 UX와 민감 캐시 차단을 담당한다. 심민성은 공용 auth contract, `외대.온라인.한국` origin, `hd`/메일 OTP 우회 부정시험, CI/PR 통합 게이트를 맡는다. **공식 학교 SSO 허가는 전제하지 않으며** Google OAuth 클라이언트·메일 발송 서비스·NCP 비용·학생자료 공유는 별도 승인한다. 인증 전 앱 번들/API·directIP·preview 접근을 허용하는 PR은 병합 금지(Architecture A14.1a).

## 2026-10-31 신규 추가 기능: ‘내 주요 일정’ 캘린더 협업 지도

- **김채윤 `qamarrchae` — 계산 코어 완료:** [#50](https://github.com/ot4562-glitch/HUFS-One-AI/pull/50) `buildCalendar`의 학생 제출 마감/실제 신청마감/행사·시험, UNKNOWN/날짜 미정/모호한 notice와 서울 날짜 처리를 **main 병합 완료**. 선행 공식 `NoticeResult.items[].overdue` [#16](https://github.com/ot4562-glitch/HUFS-One-AI/pull/16)과 일부 미공유 입력을 먼저 제거하는 [#49](https://github.com/ot4562-glitch/HUFS-One-AI/pull/49)도 main 병합됐다. 서버 #52는 해당 함수를 **현재 권한으로 제한된 입력**에서만 실행해야 한다.
- **심민성 `ot4562-glitch` — 공통 계약·권한/API:** [#53](https://github.com/ot4562-glitch/HUFS-One-AI/pull/53) `CalendarResultSchema`와 [#50](https://github.com/ot4562-glitch/HUFS-One-AI/pull/50) 계산 코어는 2026-10-31 main에 병합됨. [#52](https://github.com/ot4562-glitch/HUFS-One-AI/issues/52)의 `GET /api/demo/contexts/:contextId/calendar`는 아직 미구현. 서버 인증 actor·subject·SharingGrant·source rights·`asOf`·`scopeKey`와 철회/동시성/partial sharing 검증 뒤 안전한 결과만 전달한다. 관련 #35/#39/#55.
- **이의상 `uisang2004-maker` — 웹 UI:** [#51](https://github.com/ot4562-glitch/HUFS-One-AI/issues/51), 오늘 탭 하단 2주/월간 보기·날짜 미정/적용 확인 필요 별도 목록·360px 모바일·키보드/스크린리더·텍스트+아이콘 보장. 컨텍스트 교체·철회 후 이전 학생 일정이 잠시도 남지 않게 한다.
- **박준영 `taewangim-alt` — 학사 검토:** 실제 학생 대상 졸업시험·인증 서류 마감, 적용 전공/입학학기·학적/졸업예정기간의 공식 근거를 독립 검토한다. 자기기재 목표학기를 공식 검증으로 승격하지 않는다.
- **이서연 `lhh42001`:** 제공자·NCP 환경 책임만 유지하며 캘린더 API/React 코어를 대신하지 않는다. 개인정보·실자료 전송/유료 호출은 별도 승인 전 금지.

**문서/계획 변경 절차:** 원래 계획에 없던 기능을 추가하면 새 이슈/담당자, 사용자 시나리오, 공통 계약, 권한·실패·비용, UI, 테스트, 남은 게이트를 정하고 [Proposal](../Proposal.md)·[Architecture](../Architecture.md)·[STATUS](../STATUS.md)·[README](../README.md)에 동시에 반영한다. `.ics`·푸시는 이번 미니 캘린더 범위 밖. **계약·계산 병합 != 실서비스 UI/API 구현 완료**. 사용자의 최신 PR 정책은 **작성자가 아닌 1명 이상 현재 HEAD 승인과 성공 CI, 미해소 blocker 해결 후 병합**이며 [PR_WORKFLOW](PR_WORKFLOW.md)를 따른다.

## 충돌 방지와 교차 검토

- **UI ↔ API:** 이의상은 `DemoContext`·`DemoSnapshot`을 합성 mock으로 사용하고, 심민성은 실제 권한/403/409/503 응답을 구현한다. 화면의 임의 타입·보안 판정·가짜 실제 데이터를 API에 강요하지 않는다.
- **추천 ↔ API:** 김채윤은 순수 정규화·매칭·점수·공지 코어, 심민성은 인증·DB·외부 REST API 및 provider-neutral 요청/결과 검증 경계를 맡고, CLOVA 호출·비용 처리는 이서연이 담당한다. `TopicCode` 등 공통 타입 변경은 심민성에게 계약 변경을 먼저 제안한다.
- **학업 ↔ API/UI:** 박준영은 공식 RulePack·세 원장·전망 및 합성 시험을 구현한다. 심민성은 권한·저장·API를, 이의상은 **공유 승인된 요약**만 표시한다. `RulePackDraft`를 공식 졸업 확정으로 다루지 않는다.
- **최종 중재:** 심민성은 4개 트랙의 계약·데이터·UX/API 충돌을 해결하고, **비작성자 현재 HEAD 승인 최소 1명**·필수 CI 성공·스택 의존·차단 이슈 해결을 확인해 병합한다. 과거의 전원 승인 요구는 더 이상 기본 병합 규칙이 아니다. 일방적인 main 직접 push나 자동 병합은 금지한다.
- **검토 매트릭스:** UI는 API+통합, 추천은 API+통합, 학업은 API+통합, API는 UI/추천 중 한 트랙+통합의 교차 검토를 받는다. 모델/사람의 검증은 실제 수행한 경우만 기록한다.

## 5명 개발팀 ≠ 5명 실학생 입력

- **학생 과목 CSV 4명 + Google Forms 통합 CSV 4명:** 김채윤·이의상·이서연·심민성. **박준영은 CSV/Forms 제출 대상이 아니다.**
- **파일 형식 관찰(2026-10-31):** Private `main`에 수강 CSV 4개(6열), 통합 Forms 1개(26열·응답 4행)가 존재한다. 수강 CSV 네 파일 모두 BOM 없는 UTF-8이다. `까마르`의 기존 제출자 대응은 사용자가 확인했으나, 네 번째 파일/Forms 개별 응답의 원본 게시 권한·개별 동의·인물 대조는 아직 검증하지 않았다. 데이터 연결은 `PENDING`/별도 동의 승인까지 차단한다.
- 5개 `S01`~`S05` 시연 슬롯을 유지하더라도 실제 자료 대상은 최대4명이다. 한 슬롯은 `PENDING` 또는 명시적 `SYNTHETIC`으로만 표현한다. 사람별 원본과 공유 projection은 별도의 동의를 요구한다.

## 독립 개발 시작 순서

1. **TASK-00부터:** [공통 계약 게이트](CONTRACT_BOUNDARIES.md) 및 [실행 가능한 계약 사용법](../packages/contracts/README.md)을 사용한다. TypeScript/Zod 계약·synthetic fixture·자동 4트랙 소비 검증 코드를 별도 브랜치에서 구현했으며, **PR 병합/CI 결과/실제 팀원 승인 여부는 별도로 확인**한다.
2. 4개 트랙이 자신의 API/타입 소비·실패 상태를 승인한 뒤 TASK-00을 병합하고, **그 커밋을 각 브랜치/worktree의 기준점으로 사용**한다.
3. 각 트랙은 해당 소유 경로만 변경한다. 독립 에이전트라도 공유 타입/DB migration/root lockfile을 임의 수정할 수 없다. 실제 원장·키·CLOVA/NCP 유료호출은 별도 승인 전 사용 금지.
4. 매 PR에서 `ownedPaths`, `input/outputContract`, 합성 fixture, `testsRun/testsFailed/notTested`, `privacyImpact`, rollback과 쉬운 설명을 제출한다.

상세 권한·입력 검증: [DATA_GOVERNANCE.md](DATA_GOVERNANCE.md) · [계약 경계](CONTRACT_BOUNDARIES.md) · [PR 방식](PR_WORKFLOW.md).

## 신뢰형 RAG·이미지 공고·Laya 교차 책임 (2026-10-31 설계)

- **심민성 / 웹·외부 API·통합:** `SourceRevision`·`SourceSpan(TEXT|IMAGE)`·`VerifiedClaim`·`RetrievalEnvelope`의 provider-neutral Zod/권한·asOf 검증/REST 출력과 계약·QA·PR 통합. **NCP·CLOVA·Laya SDK/실제 호출·모델 worker·비용 원장은 이서연**.
- **이서연 / NCP·CLOVA/모델 Provider 전체:** High Memory-g3 4vCPU·32GB VM/보안·키·스토리지·크레딧·비용, Laya 모델/ONNX worker, General OCR·HCX-005 Vision·HCX-007 SDK/HTTP provider 연동·전송권한/원문 검수·비용 중단/worker와 NCP 비공개 스토리지. 실제 모델 다운로드/유료 호출/서버 개통은 승인 전 금지.
- **김채윤 / 추천·공지:** 유효한 source revision과 APPROVED claim만 사용하고 연장/취소/정정에 따른 개인화 피드·공지 버전 및 캐시 무효화, 미래 자료 누출/구본 활성화 부정시험.
- **박준영 / 학사:** OCR/이미지로 수집된 학사 규칙의 표·각주·졸업예정학기·적용학번/RulePack 요구사항 독립 검수; LLM 추출을 공식 졸업 확정으로 승격 금지.
- **이의상 / UI:** 공식 출처 링크·원본 포스터 박스 하이라이트·최종 확인 시각·OCR 오독/UNKNOWN/STALE/REPLAY 배지와 접근·모바일·캐시 철회.

**병합 절차:** 이 **설계 PR은 기존 #15/#16의 공통 타입을 직접 수정하지 않음** → 소비자 교차검토 → 독립 contracts vNext PR → 합성 검증팩 → 비용·계정 권한 승인 후 구현. 세부: [검증형 RAG 계약](TRUSTED_RAG_MEDIA_VERSIONING.md).

## 2026-10-31 설계 PR 이후 작업 이슈 지도 (각 담당자 에이전트 확인)
- **통합 추적 [#23](https://github.com/ot4562-glitch/HUFS-One-AI/issues/23)**, 설계 [PR #17](https://github.com/ot4562-glitch/HUFS-One-AI/pull/17): 인프라 설치/결제 승인이 아닌 **문서 설계**이며, 병합해도 신규 기능 구현을 뜻하지 않는다.
- **심민성:** 공통 계약 v0.1.0 [#8](https://github.com/ot4562-glitch/HUFS-One-AI/issues/8)과 **새 vNext [#18](https://github.com/ot4562-glitch/HUFS-One-AI/issues/18)**는 분리. 새 SourceRevision·TEXT/IMAGE evidence·RAG/Laya 어댑터 계약 및 네 소비자 리뷰 담당.
- **이의상 [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9):** 포스터 bbox 근거 확대·latest verified / STALE / UNKNOWN / synthetic 표시, 권한철회/캐시·모바일.
- **김채윤 [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10):** 최신 승인 공고·정정·취소만 소비하며 [#15](https://github.com/ot4562-glitch/HUFS-One-AI/pull/15) 추천, [#16](https://github.com/ot4562-glitch/HUFS-One-AI/pull/16) 중요공지 overdue, [#40](https://github.com/ot4562-glitch/HUFS-One-AI/pull/40) 시점, [#49](https://github.com/ot4562-glitch/HUFS-One-AI/pull/49) 공유입력, [#50](https://github.com/ot4562-glitch/HUFS-One-AI/pull/50) 캘린더 코어는 **main 병합**. 설명 [#41](https://github.com/ot4562-glitch/HUFS-One-AI/pull/41)도 최신 HEAD 승인·CI 후 **main 병합**. React 설명 UI/인증된 API 참조·접근성은 별도.
- **박준영 [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11):** OCR 표·각주/예외/졸업예정학기·Requirement ID/룰팩 검증, 학사·공지 독립 교차리뷰.
- **이서연 NCP [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12):** API 수집 연계 심민성 [#19](https://github.com/ot4562-glitch/HUFS-One-AI/issues/19), NCP OCR·HCX-005 이서연 [#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20), 웹 API Temporal RAG 심민성 [#21](https://github.com/ot4562-glitch/HUFS-One-AI/issues/21), Laya CPU·High Memory-g3·비용 하드 게이트 [#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22). 실제 GitHub ID 매핑 확인 전 자동 assign/mention 금지.
- **모든 에이전트:** 다음 세션 시작 즉시 원격 최신 main/이슈/PR과 이전 이슈 댓글을 확인하고 담당 이슈만 분기·PR·테스트로 진행한다. 이슈와 문서 작성은 자동 실행 아님. NCP/이미지/개인원본 전송·실배포는 별도 명시 승인 전 금지.

## REVIEWER 보안 접근 추가: 심사자를 팀원 5명에 추가하지 않음 (#25)

- **심민성 / 인증·웹 API:** 심사자 이메일 사전 수집 없는 **공용 초대 코드**·등록 최대 계정 수·검증된 Google sub/email binding·PostgreSQL grant·role vNext·자동 만료/철회 및 합성 전체 기능 API/테스트, 권한 감사와 최종 병합.
- **이의상 `uisang2004-maker` / UI:** `/reviewer/invite` Google 로그인→**공용 초대장** 최초 등록→S01~S05 **전체 학생 기능 합성 시연**, 만료 안내/캐시 정리·시각적 SYNTHETIC·REPLAY/NO_REAL_DATA 표시, 접근성·모바일 검증.
- **이서연 NCP 전담:** VM/운영·DB 호스팅 환경과 CLOVA OCR/HCX/Laya 실제 provider 구현·성능·과금·키 보호를 준비. **Google OIDC/일반 DB·Fastify/REVIEWER API 코드는 심민성 소유.** 실제 인프라·DB 연결은 본선 진출·별도 승인 이후.
- **김채윤/박준영:** 심사 시연 데이터는 각 트랙의 **별도 합성 fixture**, 실학생 권한 공유나 공인 학칙·공고 live 상태로 보이게 하지 않는다.
- 담당 이슈 [#25](https://github.com/ot4562-glitch/HUFS-One-AI/issues/25), 정본 [REVIEWER_ACCESS.md](REVIEWER_ACCESS.md). 이 새 역할은 학교 공식 교직원 인증·개인정보 공유 동의를 대신하지 않는다.

## Laya CPU 스파이크 보호 후속 소유 (#22)

이서연 NCP/모델 실행 전담 (심민성 API와 분리)**: 승인된 VM에서 systemd cgroup `CPUQuota=100%`가 정확히 **1vCPU**로 적용되는지 확인, ORT single-thread/spin OFF, 별도 ingest queue·cache/중복 방지·과부하 PAUSE/OFF, Laya 기본 비활성/백업 코드 폴백을 구현한다. **심민성**은 NCP 요금/모델 license·RSS/latency 실측 및 계정·개통·한도 변경을 별도로 승인. **이의상 UI**는 심사자 재접속이 워커 호출을 일으키지 않고 SYNTHETIC REPLAY 표시가 명확하도록 검수. Laya ON/OFF 비교와 실측 없이 완성 체크 금지. 정본 [LAYA_CPU_SPIKE_PROTECTION.md](LAYA_CPU_SPIKE_PROTECTION.md).
