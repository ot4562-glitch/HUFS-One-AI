# HUFS One AI — REVIEWER 공용 초대·전체 합성 체험 계약

> **2026-11-04 최신 상태 (과거 일자별 기록보다 우선):** 2026-11-04 REVIEWER 현재 코드: 합성 기간제 초대·세션·권한·철회·Google OIDC/학교메일 PostgreSQL 어댑터의 구현은 통합 [#216](https://github.com/minseong-hufs/HUFS-One-AI/pull/216)을 통해 main에 포함, OPEN PR 0/기본 CI 3/3 SUCCESS. 아래 #72~#76 등의 미병합·실행 미검증 문구는 각 과거 시점 기록이며 현재 브랜치 상태가 아니다. **실 Google OIDC·운영 SMTP/메일 수신권·실 REVIEWER/PG/TLS·직접 URL/서버권한은 NOT_RUN / RELEASE_BLOCKED.** [STATUS](../STATUS.md), [인수 원장](HUMAN_ACCEPTANCE_GATE_20261104.md).

## 2026-11-02 REVIEWER UI 최신 후속 수락/미완료

- [x] [#72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72) 비합성 Calendar GET/같은 context snapshot 무효화 **main merge `717ce979`**. 401/403/409/동일문맥 overlay·늦은 응답 합성 테스트 PASS.
- [ ] [#73](https://github.com/ot4562-glitch/HUFS-One-AI/pull/73) 초대 UI HEAD `9b8bd6f`는 원래 부모 #72 병합 후 **main으로 retarget**. 현재 `getSession` 성공 Promise의 abort/lifecycle 확인 누락으로 독립 CHANGES_REQUESTED. 화면 unmount·로그아웃·StrictMode에서 늦은 성공 응답이 READY를 만들면 안 됨.
- [x] [#75](https://github.com/ot4562-glitch/HUFS-One-AI/pull/75) 합성 sandbox HEAD `d5f7905`의 정확한 snapshot/log 결속과 미저장 초안·경험·관심/초기화 확인의 S01/S02 격리 개선에 **비작성자 APPROVED**. **코드 승인만**: 아직 미병합이며 #73→#74 선행해야 함.
- [ ] [#76](https://github.com/ot4562-glitch/HUFS-One-AI/pull/76) Playwright Edge 테스트는 작성자의 로컬 결과와 원격 Actions 합성·PG 2개를 혼동하지 않으며 별도 브라우저 재현이 필요. 실제 초대 메일·Google OIDC·TLS·REVIEWER 운영 세션 권한 검증/학생원본·NCP 처리 허가 없음. #46/#89 `RELEASE_BLOCKED`.

## 2026-11-01 심사자 UI 최신 HEAD 안전 리뷰

- [x] [#73](https://github.com/ot4562-glitch/HUFS-One-AI/pull/73) `1cfc61f` 초대 화면 및 [#75](https://github.com/ot4562-glitch/HUFS-One-AI/pull/75) `0a19d1e` 합성 sandbox 독립 코드 리뷰를 등록. 이는 리뷰 완료 체크일 뿐 기능 수락·운영 초대 발송 완료가 아니다.
- [ ] #73 `getSession`의 성공 응답도 abort/언마운트 후 READY로 반영되지 않도록 회귀 확인. #75는 **같은 context에서 snapshot 버전 교체 시 이전 action log가 잠시 READY로 보이는 문제**와 S01→S02 전환 때 미저장 **지원서 초안·경험 작성·관심 분야 선택** 값이 남지 않도록 렌더 단계에서 즉시 격리/초기화 필수. #75 CHANGES_REQUESTED.
- [ ] #72 선행 미병합, #73/#75 현재 HEAD Actions 0건, 스택 후속 #76 local Edge 실행과 CI 증거 분리. 실 OIDC/HTTPS/기간 만료·철회/다중 탭 브라우저 시험과 관리자 초대 발급은 BLOCKED. `actualBrowserUiVerified:false` 유지.

## 2026-11-01 최신 구현/미검증 구분

- **main 서버·권한 완료(코드/합성 기준):** [#83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83) 생성 합성 코퍼스/REVIEWER sandbox·일회용 PostgreSQL, [#105](https://github.com/ot4562-glitch/HUFS-One-AI/pull/105) `redeem()` 영속 기록 후 원 세션·동일 email/sub·활성 초대 재검증, [#100](https://github.com/ot4562-glitch/HUFS-One-AI/pull/100) 20회 대상 전환 2탭 합성 격리, [#110](https://github.com/ot4562-glitch/HUFS-One-AI/pull/110) URL fragment 1회 소비·선제 history 정리·실제 synthetic Fastify→브라우저 요청 검증. #110 HEAD Actions #41300314453 2 jobs 성공.
- **UI 연동 미완료:** [#73 초대 화면](https://github.com/ot4562-glitch/HUFS-One-AI/pull/73)·[#75 합성 sandbox](https://github.com/ot4562-glitch/HUFS-One-AI/pull/75) 및 #74/#76은 #72 UI 선행 차단 때문에 OPEN. `actualBrowserUiVerified:false`를 임의 true로 바꾸지 않는다.
- **실심사자 배포 불가:** 실제 Google OIDC/메일 검증·운영 PostgreSQL·TLS·공용 초대 토큰 발급/전달·실브라우저/접근성 검증은 `NOT_RUN/BLOCKED`. 합성 REVIEWER 권한은 실학생 정보·공식 자격·유료 AI 접근을 부여하지 않는다.


> 합성 REVIEWER API는 `main`에 반영됐다. 실제 Google OIDC·PostgreSQL·웹 화면·NCP 배포는 출시 전 연동·검증 게이트다. **심민성 [API #27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27)** · **이의상 [UI #9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9)** · **이서연 [NCP #12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12)**. 제안서는 [Proposal.md](../Proposal.md)를 따른다.

## 0. 합성 API 범위와 웹 연동 조건

- 신규 `GET /api/reviewer/capabilities`는 **활성 초대가 검증된 REVIEWER에게만** 학생용 10개 화면 범주(TODAY/OPPORTUNITIES/NOTICES/EXPERIENCE/GRADUATION/COURSE_PLANNER/OUTLOOK/SAVED/APPLICATIONS/SETTINGS)를 반환한다. 웹 화면과의 실제 연결은 이의상 UI 트랙의 후속 작업으로 관리한다.
- 기존 BOOKMARK/MARK_READ/CHECKLIST/EXPERIENCE/APPLICATION_DRAFT/SIMULATE_APPLICATION 외에 SET_INTERESTS(공유 24 TopicCode), SET_DESIRED_JOBS, PLAN_COURSE, SET_SEARCH, SET_NOTIFICATIONS, RESET_SANDBOX를 각 reviewer·invite·합성 프로필별로 격리한다. 초기 구현은 메모리 샌드박스이고 **심민성 통합 PR #58에 옵션형 PostgreSQL 영속 adapter**를 추가했다(실 운영 DB 적용·실 Google 로그인은 별도). 타 계정/실제 학생 데이터·실제 지원·외부 요금 호출은 차단.
- session/redeem의 `readOnly:false,sandboxOnly:true`는 **합성 sandbox 안에서만 수정 가능**한 접근을 뜻한다. `actualBrowserUiVerified:false`가 표시되는 한 공개 사용 준비 완료로 판정하지 않는다.
- 이의상 [UI #9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9)가 웹 프런트 화면/인증 흐름/접근성 담당, 심민성 [API #27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27)이 OIDC·REST·DB·sandbox/권한 담당, 이서연 [NCP #12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12)는 **비코드 Cloud 계정·크레딧/권한·요금·운영** 담당. 모든 NCP SDK·provider HTTP 호출·Laya worker 및 운영 자동화 코드는 **심민성 [#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20)/[#88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88)/[#143](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143)** 전담. [운영 요금·시기](NCP_OPERATIONS_2026.md).

## 1. 심사자 이메일을 사전에 모르는 공용 초대장

- 제출 자료에는 공용 초대장을 첨부한다. 심사자의 이름·이메일 주소 목록은 **필요하지 않다**. 32바이트 CSPRNG 원문 코드는 비공개 발급 후 초대장이나 제한된 제출 문서에 넣고, 서버는 SHA-256 digest만 보관한다. GitHub에 공유하는 양식 PDF는 **비활성**, 활성 토큰이 없다.
- 검증된 Google OIDC 인증(sub, 발급자, 서명, aud, nonce, state, PKCE) 및 현재 이메일 확인을 마친 뒤 초대 코드를 등록한다. 첫 등록 시 Google sub·verified email을 **계정별로 저장**하고, 다른 사람이 해당 계정으로 가장할 수 없게 서버 세션을 검증한다. 초대 링크만으로 학교 심사위원 신분을 확인할 수 있는 것은 아니다.
- **공용 코드 하나로 여러 명이 별도 계정을 최초 등록**한다. 기본 상한 20계정(허용 1~50), 등록은 5회/15분/actor 이상 시 429; 실서비스에서는 중앙/분산·IP 제한·코드 회수·이상 접근 모니터링을 추가한다. 심사자 명단을 모르므로 링크가 유출되어 비심사자가 선등록할 위험은 남는다. 반드시 실제 학생 자료가 없는 합성 환경만 허용한다.
- 등록 후 같은 검증된 Google 계정은 기간 안에서 브라우저를 닫거나 세션을 재로그인해도 무제한 접속한다. 새 등록 인원만 상한을 둔다. 최초 등록된 Google sub/email에 다른 이메일·sub로 접근하는 것은 실패한다.
- 초대 URL은 예정 origin의 `/reviewer/invite#code=...`처럼 fragment로 전달, 브라우저가 메모리에서 추출해 즉시 주소에서 제거한 뒤 exact Origin·CSRF로 등록 POST 전송한다. 접근 로그/리퍼러/query/analytics/Sentry에 raw token 기록 금지.

## 2. 전체 웹사이트 기능을 **합성 시연 모드**에서 직접 체험

심사자는 독립 `REVIEWER` 역할로 접속한다. **UI의 모든 학생용 탭·상호작용을 재현하되 데이터/효과를 합성 격리**한다. 미구현 기능은 '시연 준비 중'으로 표시하고 남은 브라우저 E2E 작업을 추적한다.

| 학생용 기능 | REVIEWER 실제 허용 범위 |
|---|---|
| 시연 프로필 전환 | 가상 S01~S05 모두 준비된 합성 사본만 전환. 팀원 실제 SharedGrant/CSV/Forms 접근 불허 |
| 추천·검색·공지·마감 | 미리 검증한 합성 피드/공지/근거 시점, 원문 근거·수정/취소 상태 배지 탐색 |
| 졸업지원·학점·개설 전망 | 가상 학점 원장과 `NEEDS_REVIEW` RulePack·불확실한 전망의 전체 UX 체험. 공식 판정인 척하지 않음 |
| 경험·관심 수정·북마크·읽음·체크리스트 | 계정·컨텍스트별 합성 sandbox 상태만 변경. 실제 Forms/학생 원본 및 외부 저장소 미변경 |
| 지원서 작성·지원 버튼 | 합성 `APPLICATION_DRAFT`·`SIMULATE_APPLICATION`까지만. 실제 기업/학교로 신청·메일 발송·자격 확정 불가 |
| AI 기능 네 작업 | 서버 승인 synthetic SafeLlmPacket과 **로컬 MOCK+NEEDS_REVIEW** 출처 인용. NCP·HCX·Laya·OCR 실제 유료 호출 0 |

공통 API UI 재사용: `GET /api/demo/profiles`, `POST /api/demo/contexts`, `GET /api/demo/contexts/:id/{snapshot,notices,graduation,outlook}`는 REVIEWER에게 합성 사본으로만 응답한다. 작업모의 API는 `/api/reviewer/demo/contexts/:id/actions` GET/POST. 네 작업 `/api/ai/:task`는 REVIEWER일 때 합성 packet + contextId로만 실행해 MOCK 후보를 돌려준다. 모든 요청은 관리자 아닌 REVIEWER role, 현재 초대·시간·계정 확인 후 허용. 원본 수집, 실제 관리/다른 팀원 데이터·재학 확인 API는 금지.

**코드 현재 상태(2026-11-01 PR #58):** Fastify API, 초대 등록·만료, 메모리 sandbox 및 임의 클라우드 호출 없는 합성 리포지토리 DI 경계에 더해 `PostgresReviewerSandboxStore`·`20261101_reviewer_sandbox.sql`을 작성했다. 초대-actor-대상별 SQL row lock, 원자 저장, 만료/철회 차단, 복원/리셋을 **일회성 disposable DB에서 검증하는 통합 테스트**를 포함한다. 실제 영속 데이터베이스/Google/브라우저 UI/인증 배포는 별도 작업이다. '모든 기능이 실운영 준비 완료'와 혼동하지 않는다.

## 3. 기간·철회

- 사용자 요청 최대 계획: 2026-11-06 00:00~12-10 00:00 KST (12월9일 종료까지). 그러나 [학교 공식 공고](https://job.hufs.ac.kr/job/imng/icmpNsbjtPgm/findIcmpNsbjtPgmInfo.do?encSddpbSeq=1006089)상 본선 발표는 **11월16일**이므로 실제 활성 초대는 본선 진출·배포 준비·심사 일정 확인 **이후** 발급한다. 예상 11월16일~12월9일이지만 운영자가 정확한 시각을 확정해야 한다.
- 서버의 UTC `startsAt <= now < endsAt`가 정본; KST는 사용자 표시일 뿐. 모든 GET/POST마다 PostgreSQL `readActive`로 만료·철회·sub/email 검증. 종료시각/철회 후 기존 session cookie가 있어도 403. 앱 캐시/Service Worker·로그에서 합성 정보라도 오래 열린 화면을 정리하도록 UI 처리.
- 운영자만 `revoke`해 공용 초대 전체를 즉시 중단. 유출 시 코드 회수·새 코드 발급·등록계정 감사. 등록 성공을 **무제한 유료 추론·트래픽** 권한으로 해석하지 않는다.
- PostgreSQL의 초대 row를 `SELECT ... FOR UPDATE`로 잠가 신규 등록 경쟁 상태에서도 최대 계정 수 준수. 이메일·Google sub/서버 세션/등록 기록은 비공개이며 직접 접근 가능한 DB 권한은 API 서비스로 제한한다.

## 4. 초대장·관리도구

- 공개 저장소의 `reference/reviewer/ReviewerInvitation.TEMPLATE.pdf`는 **단일 A4 비활성 공용 양식**, 개인별 이메일 입력은 필요 없음.
- 서버와 Google OIDC/DB/TLS 연결이 끝나고 운영 승인을 받은 뒤 `npm run admin:reviewer -- issue`에서 HTTPS origin, UTC 유효기간, 등록 최대 계정 수, 별칭·DB URL을 설정한다. 원문 링크 JSON은 `local_only/reviewer_invitations/<uuid>.json`에만 저장하고, 해당 JSON에서 활성 공용 PDF를 별도로 비공개 출력한다. Git, PR, CI, issue body에 활성 URL 금지.
- 운영자 파기·종료 도구는 `npm run admin:reviewer -- revoke`; DB 철회가 모든 세션에 즉시 적용되는지 테스트.

## 5. 병합·실서비스 준비 게이트

- [x] 로컬 합성 테스트: 공용 초대 두 Google 계정 등록, 20명 상한, 70회 반복, 종료 경계, 철회, CSRF, 실제 학생 저장소를 쓰지 않는지, UI 호환 demo context·학업·공지, 합성 북마크·가상 신청 및 AI 네 작업.
- [ ] 실제 Google OAuth OIDC/메일 검증·실 PG transaction/migration·분산 rate limiting·세션 revoke 및 보안 E2E·초대장 발행/전달 테스트.
- [ ] 이의상 UI #9: `/reviewer/invite` fragment 처리, 프로필/모든 화면 연결, 합성/REPLAY 배지, 기한 종료 시 화면 삭제, 모바일·접근성·다중 탭·실 데이터 미노출 E2E.
- [ ] 심민성 API #27: `PostgresReviewerSandboxStore` 영속 어댑터/원자 격리·철회·복원 코드를 #58에서 구현했다. **이슈 전체 완료 조건**은 실제 Google 인증·실 운영 DB/프런트 연계·최신 독립 리뷰 및 브라우저 E2E까지 포함하므로 아직 미충족이다.
- [ ] 이서연 NCP #12: High Memory-g3 4vCPU32GB·CB 50GB·CLOVA/보안/크레딧 운영환경. 본선 확정 전 NCP 개통 없음.
- [x] PR #24 기초 API → 원본 #26 코드 [복구 PR #30](https://github.com/ot4562-glitch/HUFS-One-AI/pull/30) 순서로 main 반영 확인(기존 GitHub PR #26은 #24 브랜치에 병합된 기록 보존). 추천/공지 #15/#16 공유 설정 충돌 여부 확인. 교차 코드 리뷰와 원격 CI 및 실제 시연 화면 시험 전 자동 병합 금지.

관련: [API 개발 #27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27), [심사자 #25](https://github.com/ot4562-glitch/HUFS-One-AI/issues/25), [기술 계약](../Architecture.md), [Laya CPU](LAYA_CPU_SPIKE_PROTECTION.md).
