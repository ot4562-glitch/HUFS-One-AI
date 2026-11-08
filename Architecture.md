# HUFS One AI — Architecture

**규범:** 이 문서는 현재 목표·권한·API·검증 계약이다. 실제 코드 정본은 [STATUS](STATUS.md)·GitHub `main`·[inventory](tools/api_contract_inventory.json). 기존 #252/#253/#257은 후속을 이관하여 종료되었으며, 실서비스 운영·실사용자/원본/기관/요금·출시 인수는 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)에서 검증한다. 계획/스키마·합성 CI는 실운영·공식 학교 증명이 아니고 현재 `RELEASE_BLOCKED`.

**업무 자동 배정/고정 역할 이슈 변경 금지:** [신규 에이전트 가이드](docs/ISSUE_ASSIGNMENT_PLAYBOOK.md) · [대규모 실제 데이터 요청 #360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360). 아래 과거 TASK 명칭은 코드 영역을 설명하는 참고이며 현행 사람별 기능 담당은 각 이슈의 최신 assignee/댓글을 따른다.

## A00. 정본·용어·판정

**HUFS One AI**는 기존 HUFSAbility에서 참조 가능한 기능·정보 구조를 이해하기 쉽게 연결하는 독립 학생 프로젝트이다. 학교 공식 운영 시스템/SSO/학사 판정이 아니며, 학교 원본 UI·코드·로고·데이터를 무단 복제하지 않는다.

**증거 단계:** `DESIGNED`(사양), `INTEGRATED`(main 코드), `TESTED_SYNTHETIC`(해당 SHA의 합성 자동화), `TESTED_DISPOSABLE_PG`(별도 PostgreSQL), `HUMAN_ACCEPTED`, `OPERATOR_ACCEPTED`, `RELEASE_APPROVED`를 구별한다. `UNKNOWN`, `NOT_SHARED`, `NEEDS_REVIEW`, `HOLD`, `NOT_RUN`, `RELEASE_BLOCKED`를 성공 상태로 덮어쓰지 않는다. 판정은 SourceRevision·RulePack·actor/grant·asOf에 묶는다.

**현재 개발 기준:** TypeScript/React/Vite·Fastify·Zod/PG·합성 데모·CI 코드가 존재하고, NCP/Google/학교메일/실원본/실모델의 실제 인수는 별도다.

## A01. 시스템 지도와 책임

```text
학생 / 합성 REVIEWER / 권한 있는 ADMIN
  ↓ HTTPS(실서비스 시 별도 승인이 필요한 TLS/Edge/접근제어)
React 웹: 정보 위계·메뉴·선택기·상태·출처/인용
  ↓ 쿠키 세션·CSRF·actor/context/expectedVersion
Fastify API: OIDC/메일 검증·BETA/REVIEWER/ADMIN 분리·인가
  ├─ pure core: 추천/공지·학점/계획·What-if·전망
  ├─ PostgreSQL: owner/RLS/CAS·SourceRevision·증거·예산/영수증
  ├─ 승인된 source/AI transport: OCR/HCX·비용·권리·후처리
  └─ Laya 선택 worker(기본 OFF·격리·CPU/메모리 제한)
```

**개인 원본**은 제한 저장소/private intake에만 두고, 사용자에게 보여 주는 것은 목적·권한·최신 검수에 맞는 projection이다. 에이전트 개발/운영 계정은 실학생/교직원 신원이나 학교 권한을 가질 수 없다.

## A02. 대상 선택·문맥·철회 계약

- 실제 로그인한 사람 `actorId`와 표시하려는 `demoSubjectId`는 다르다. 5개 합성 데모 슬롯 S01 / S02 / S03 / S04 / S05는 개인정보 원본 제공자 4명·REVIEWER·EMPTY_DEMO와 다른 네임스페이스다. `REAL_CONSENTED` 자료 모드는 해당 실제 원본·목적별 동의·접근권을 별도 증명하지 않은 합성 화면에서 활성화할 수 없다.
- 문맥은 `contextId`, `demoRunId`, `sessionIdHash`, `datasetVersion`, `projectionVersion`, `sharingGrantVersion`, `expiresAt`, `asOf`, `selectionEpoch`를 바인딩한다.
- 선택 A→B는 이전 요청 취소, 개인 UI·캐시/오버레이 비우기, B 권한을 조회한 뒤 **한 번에 새 snapshot 렌더**한다. 늦은 A 응답·다른 탭 결과·revoked Grant는 거절. B의 원본을 실제로 수정하지 않는다.
- 최소 유향 5×4=20 전환, 반복 10회, 두 탭·철회·만료·race·409·403·429·503을 synthetic/browser/PG로 검증하고 실제 인수와 분리.
- ADMIN 권한은 이름 선택으로 생성되지 않는다. REVIEWER는 기간제 초대/합성 전용 5슬롯, 실학생 데이터·유료 모델 호출 0을 기본으로 한다. 초대 발행·실계정 인증은 별도 승인.

## A03. 자료 인입: Forms 26열·CSV 6열·목적별 동의

- 실제 파일 소유자 4명, Forms 26개 컬럼/4응답, 개별 수강 CSV 6열/4개. **참가 동의 5명**과 실제 학업 원본 제공자 4명을 구별한다.
- 원본 문자열/헤더/BOM/CSV escaping/중복 헤더·학기·학점/재수강·owner alias/동명이인/관측 SHA를 확인한다. 임의 컬럼 추가·동의 없는 자동 추론 금지. 422/row_issue·미리보기·원본 불변·4-owner 원자 CAS/rollback.
- 읽기/적용은 인증된 별도 **private operator plan→preview→apply** 절차로만. HTTP 공개 업로드/검증되지 않은 권한 주입/실학생 자료를 CI 또는 외부 AI로 옮기지 않는다.
- 목적·필드·제공자·보관 기간·팀 공유·최초 Git 게시·클라우드/모델 외부 전송·발표/삭제·현재 철회는 서로 별도 권리 영수증. 사용자 확인된 자료 수집 허가는 보존하되 새 목적까지 자동 허용하지 않는다.

## A04. 폐쇄형 공통 타입·출처

공통 `@hufs-one/contracts`/Zod의 **TopicCode 24개**, Actor/Consent/SharingGrant/SourceRights, Context/VersionEnvelope, SourceRevision/SourceSpan/MediaEvidence, Academic/Forecast/Recommendation/AI 결과를 단일 정본으로 사용한다. `SourceClass`별 collect/store/display/AI transmit 허용 범위를 명시하고, 권리·원본 시점 불명은 `BLOCKED_RIGHTS/UNKNOWN`.

`datasetMode=SYNTHETIC|MIXED|REAL`·`aiProvenance=MOCK|VALIDATED_CACHE|LIVE_NCP|NONE`은 실제 실행 이력과 부합해야 한다. 출처가 없는 합성 공고를 실제 모집·지원 링크로 보여 주지 않는다.

## A05. 추천·자격·개인화

- 입력: 현재 승인한 profile/TopicCode/경험/학사 목적별 projection + 허가 출처 공고/학사 공지의 revision·asOf. 결정론 코드로 ELIGIBLE / INELIGIBLE / UNKNOWN, OPEN/UPCOMING/CLOSED 및 근거/제외 사유를 계산한다.
- 동일 입력·정책·버전은 동일 추천과 근거를 생성한다. 설명 가능한 featured 최대 3건/일반 compact 목록과 원문 근거·수정판/마감·대상별 차이를 표시한다. 실제 자동 지원 제출은 없음.
- 40개 가상 기회×5슬롯=200 독립 평가 대상과 공지 10건, 튜닝/보고 분리. 독립 Gold 0/200은 실측 아님. 자격 추론의 거짓 확정 0건과 조건 추출 recall 90% 등은 **평가 목표**로 남긴다.

## A06. 검증형 생성형 AI

**안전 순서:** source/consent/rights→원문/HTML/PNG/JPEG/PDF 검증·OCR 근거/bbox→필요시 Vision→Temporal RAG→코드가 만든 최소 `SafeLlmPacket`→HCX 의미 후보→Zod/정확한 citation/수치·권한 재검사→`NEEDS_REVIEW` UI.

제품 AI 작업은 정확히 네 가지다.

| task | 생성 결과 | AI가 확정해서는 안 되는 것 |
| --- | --- | --- |
| `experience_skills` | 경험에서 기술 태그 후보 | 활동 사실·수상·공식 승인 |
| `opportunity_terms` | 공고 자격/우대/날짜의 근거 있는 후보 | ELIGIBLE·합격/마감 확정 |
| `personal_action_brief` | 사용자가 할 일 후보·근거 | 실제 신청/성공 상태 |
| `graduation_explanation` | 코드 계산/RulePack의 이해 가능한 설명 | 공식 졸업 사정·새 학칙 |

`model/prompt/schema/policy` 버전·source SHA/asOf·input digest, PII 최소화/allowlist, JSON strict, exact quote/paragraph/claim/비식별·token/usage/finishReason 제한을 적용한다. 권리 철회/늦은 응답/프롬프트 주입·인용 없는 숫자/마감/지원 자격·자기모순은 검토 필요 또는 `AI_SKIPPED_PRIVACY`. 429/5xx 제한 재시도, RESERVED/DISPATCHED/SETTLED/UNKNOWN_BILLING 원자 budget ledger; 청구 불확실을 무료 재시도로 가정하지 않는다.

**Laya:** 옵션 분류 보조, 기본 OFF, 독립 프로세스·kill switch·CPUQuota/RSS/OOM·API 응답 우선. 프로젝트의 모델·비용·운영 승인은 완료 확인됐습니다. 실제 활성화에는 현재 원본 이용권·개인 동의/철회·host CPU/RSS 상한·공급자 구성·비용/복구 검증이 필요합니다. 학칙 초안 작성 도구는 내부 검수 전용이며 제품 다섯 번째 AI 작업이 아니다.

## A07. 학과 공지·마감·달력

중요공지는 학번·전공·수강·학적/공유 정보가 실제로 확인된 범위에서만 판정한다. 개인 제출 마감·학교 행사·행정 내부 보고·상시/미정 일정을 구분한다. 서버 asOf에서 **서울 달력 날짜**를 계산하되 확정된 마감/열린 공고에만 D-day를 표시한다. 개정/철회와 시간차·동시탭을 보호한다. 알림 **설정 저장**은 실제 이메일/푸시 발송이 아니다.

## A08. 학점·졸업·학업계획

- `earned / inProgress / planned` 학점 원장을 합산해 하나의 확정 취득 학점으로 만들지 않는다. 정수 `creditUnits`(1 unit=0.5학점), 동일과목/재수강·대체/중복인정·영역/그룹·AREA_SPREAD/GROUP_CHOICE·degreePath/track을 규칙에 따라 계산.
- RulePack은 **공식 학교 문서 판본·적용 학년도·전공/cohort·조항 SHA·예외·언어 속성·승인**이 맞아야 ACTIVE. 알 수 없는 규칙/이수 상태·출처는 DRAFT/UNKNOWN_APPLICABILITY/NEEDS_REVIEW; 자동 공식 졸업 판정 금지.
- Plan/What-if는 현재 원장 불변, 가정/공식 정보 분리, CAS/권한·시점/RulePack version과 학기·선수·시간 중복/학점 상한 검사. 독립 손계산/원본 4인 적용은 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) 인수.

## A09. 학기별 과목 개설 전망

개설 확정은 허가된 공식 학기/수강 안내만으로 표시한다. **과거 개설 패턴은 미래 확정이 아님**. 학기 전체 목록/부분자료/미관측을 분리하고 누락≠미개설, 0/n와 UNKNOWN, 학년도·캠퍼스·학과·courseId·asOf가 바뀌면 전망을 다시 평가한다. 초기 P1 대상 약 20과목/8학기 비교 및 rolling-origin 오차·정확도는 실제 검증 전 목표다. 공식 override/가상 시나리오를 사용자가 식별 가능하게 표시한다.

## A10. 경험·보관함·행동

학생 경험 원본은 DRAFT/owner-approved만 사용자 권한으로 수정하고, AI 태그 후보·대상 overlay·실제 활동/수상/지원 완료를 서로 구별한다. 경험 수정/삭제·동의 철회 시 승인된 파생 태그/추천·캐시 무효화. 북마크·준비/행동 계획/지원 초안은 실제 학교/기업 접수 결과가 아니다. GET/POST/PATCH/DELETE owner CAS와 401/403/409/422/503, 다중탭·늦은 응답/다른 학생 경계를 검증한다.

## A11. UI·모바일·디자인·접근성

- 데스크톱 셸은 UIUX 96 마스터 명세(§2.1·§3.4·§4)를 따른다: 공통 네이비 상단 바(독립 학생 프로젝트 문구·계정 인사/설정, 별도 ONE AI 바로가기 없음) + **관찰된 HUFSAbility 11개 대분류 GNB** + 142px 네이비 분류 배너 + 230px LNB + 본문 + 공통 푸터. 각 대분류의 원래 메뉴명은 **미지원 텍스트**(링크 없음)이고 HUFS One AI 자체 화면만 해당 대분류 LNB의 링크다. 모바일은 **하단 5탭**(오늘·기회·경험·졸업·보관함) 유지. 공식 5분류/24기능·공개 4영역 manifest는 `/menu`. 학교 교표·로고·건물 사진·원본 코드/캡처, 학번·비밀번호를 받는 로그인 화면은 쓰지 않는다.
- v5 홈: 장식 배너, **맞춤 공고 / 확정 7일 내 마감 / 취득 학점** 요약. 스냅샷 범위 밖·미준비·미확정은 0으로 오인시키지 않는다. 졸업에서 요구 학점/남은 학점을 임의 계산하지 않는다.
- 색(마스터 명세 §3): 공식 참조색 `#146E7A` `#DADAD3` `#002D56` `#8D7150` `#9D9FA2`를 역할에 맞게 쓴다 — 헤더·배너·주버튼 NAVY `#002D56`, 활성 표시(GNB 밑줄·LNB 막대)·장식 GOLD `#8D7150`, 확정·긍정 GREEN `#146E7A`. 확장 토큰 bg `#F5F7FA`, surface `#FFFFFF`, text `#1F2933`, muted `#3E4C59`, link `#28699F`(밑줄), chip `#EAF3FC`, border `#DDE3EA`, gold bg `#F6F1E8`. 금색은 네이비 위 작은 글자에 쓰지 않고, 색만으로 상태를 구분하지 않는다. 색을 쓴다고 학교 공식 서비스가 되는 것은 아니다.
- 320/360/390/768/1024/1440 viewport·200% 확대·48px 터치 목표, 키보드/escape/focus/heading/breadcrumb/reduced motion/스크린리더·alt를 확인. Chrome 합성 자동화는 실 보조기기 사람이 직접 수락하는 증거가 아니다.
- 미로그인 개인 HTML/JS/API/asset 공개는 프런트 표시/라우터가 아니라 실제 인그레스/서버 인증으로 차단해야 한다.
- 원래 앱스토어/푸시/전면 오프라인·고급 timetable solver는 **이번 버전 P2 선택/미지원**.

## A12. 합성 데이터와 이미지 자산

고정 합성 공고 40/공지 10/프로필 5·원본 SVG 10을 실제 개인 자료와 구별하며 byte/hash/manifest를 관리한다. 별도 평가용 **PNG/HTML 20쌍·Temporal 12건**은 사람 Gold와 구분, bbox/문단·source/asOf 근거를 부착한다. 가상 동아리 PNG는 생성형 AI의 **창작 합성 자산**으로 제품 CSS 배경용 `hero.webp`와 별개다.

이미지 제작·배포는 사용한 생성 도구/모델·권리 조건·source prompt/asset SHA·메타데이터/개인/학교 로고 여부·alt/CSS 장식 구분을 검토한다. 원본 외부 사진·학생·학교 캡처를 허가 없이 재배포하지 않는다. 현재 `hero.webp` 생성 도구 영수증은 추가 확인 대상([#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)).

## A13. DB·API·런타임 계약

**DB 핵심 집합:** actor/session/role/consent/SharingGrant; private owner mapping/intake receipt(민감 영역), profile/academic transcript/RulePack/plan/major-What-if/forecast, experience/tag approval/bookmark/action, SourceRevision·media/PDF/OCR·verified claims·rights/reviewer·temporal index, recommendation/notice/context/overlay, AI job·budget usage·receipt.

- 원본과 공유 projection은 다르고, owner/actor+context+scope+version·current right/asOf를 SQL/FORCE RLS/서버 양쪽에서 확인한다. 역할 최소화, 주입된 미검증 pool/권한 포트 거절, 읽기 전용/서명된 사용량 집계. `ai_budget_admin_usage()`/adminUsage role은 코드만 구현됐으며 운영 GRANT·migration은 미수락.
- GitHub 계약 inventory **현재 등록 99개 route**, 설계 39개 contract, TASK 19개. **설계상 직접 미매핑 경로 7개**는 공개 endpoint 신설로 간주하지 않는다. 병합된 [#270](https://github.com/ot4562-glitch/HUFS-One-AI/pull/270) 및 `tools/api_contract_inventory.json`에서 비밀번호 로그인 폐기1·scope가 다른 대안 API3·operator-private3으로 분류하고 자동 감사한다. 대안 API는 설계 URL의 별칭이 아니다. `POST /api/auth/login`의 비밀번호 로그인은 retired; 실학생 파일 import는 private operator 전용.
- 현재 `GET /api/admin/usage`는 ADMIN 독립 authority·비공개 PG read-only·정확한 집계/금액 문자열, 미수집 token/error=`NOT_COLLECTED`. 실제 프로덕션 계측 또는 활성화 허가 없음.
- 상태변경 요청은 CSRF/Origin·expectedVersion·actor/role, 쿠키는 HttpOnly/Secure/SameSite/host-only. HTTP `401` 인증 · `403` 권한 · `409` version · `422` 입력/근거 · `429` 한도 · `503` 공급자/미설정. 서버 내부 오류/SQL 원문·키·학생 다른 사람 메타데이터 비노출.
- Google OAuth Authorization Code+PKCE/OIDC는 서버가 iss/aud/exp/signature/JWKS/nonce/state/`sub`·hd를 검증. Google 계정 `email_verified`만으로 현재 학교 이메일 소유권을 인정하지 않고 외대 메일 OTP·계정 allowlist를 결속한다. 실 계정 검증은 #276.
- owner experience/saved/actions, studies/What-if, demo snapshot/calendar/overlay, synthetic REVIEWER, Source/AI worker는 **서로 다른 DTO·scope**로 동작한다. 설계 API 경로를 현재 다른 route와 동치라 주장하려면 실제 등록·소비자를 대조한다.

## A14. NCP·서비스 운영·공개 접근제어

프로젝트 자료·클라우드/모델·운영/출시 승인은 소유자가 완료 확인해 `OWNER_CONFIRMED_APPROVED`다. 실제 NCP 계정/비용/IAM/리전·SKU·스토리지/요금 hard stop과 외부기관 자료·개인별 현재 동의는 실제 운영자 구성 및 증거로 대조한다. IaC/SSH preview는 루프백 **합성 경로**이며 실제 운영 서비스 공개는 ingress·인증·DB·복구·독립 인수 검증 전까지 차단한다. 운영 배포에서 production entrypoint/실 SQL/TLS·Google·메일·권리/실원본·secret·backup/rollback·관측·WAF/Edge·Nginx/LB를 각각 인증해야 한다.

직접 public origin IP/IPv6/다른 host/preview URL·익명 로그인 전 asset/CDN/SW cache의 bypass를 부정시험한다. 신뢰된 프록시만 `real_ip`를 설정하고 실제 두 사용자 원 IP와 forged XFF를 독립 확인한다. 의도하지 않은 OS/systemd·NCP apply·유료 모델·외부 네트워크 호출은 개발 검증에서 금지한다.

## A15. 평가·정확도·성능

| 항목 | 현재 기준 | 추가 인수 |
| --- | --- | --- |
| 추천 | 40공고×5합성, 200개 리뷰 패키지 | 비작성자 Gold **0/200**, P@3/nDCG@3·조건 precision/recall·거짓 ELIGIBLE·근거 평가 |
| 미디어/시간 | 20 PNG/HTML쌍 + 12 시점 판본 테스트 | 독립 사람 판정 **0/32**, bbox·정정·asOf·인용/오독 검사 |
| 학업 | 합성 순수 코어·학기 전망 | 공식 적용 RulePack/4인 원장 별도 독립 손계산 |
| 브라우저/DB | Chrome·일회용 PG 자동 실행 | 실 Google/학교메일·NCP/운영 PG/스크린리더·중단/복원 |
| 성능 | 초기 목표: 캐시 전환 p95≤700ms, 일반 snapshot p95≤2초, 작은 순수 계산 p95≤100ms | 환경·n·cold/warm·CPU/RSS/비용과 실패 포함 **실측** |
| AI | 4종 안전 계약·budgets, Laya OFF | 실 provider tokenizer/청구/정확도·GPU/CPU 호스트/선택 Laya ON은 별도 승인 |

UI 대상 전환만 100회면 새 LLM 호출 **0**이 목표다. 정량 수치·누락된 데이터는 통계적으로 검증하지 않고 임의로 채우지 않는다. 실제 권리/독립 인수 없으면 출시 NO_GO다.

## A16. 다섯 팀원·AI 보조 개발

**현행 정본(2026-11-08):** [루트 AGENTS](AGENTS.md) · [이슈 자동 배정 플레이북](docs/ISSUE_ASSIGNMENT_PLAYBOOK.md). 고정 역할 이슈 **#355–#359는 읽기 전용**으로 수정·댓글·담당/상태 변경을 수행하지 않는다.

- **심민성:** 신규 `[추가 기능]` 최초 assignee, 가능한 Core/Contracts/API/DB/보안/인증·일반 비AI 기능/통합을 실제로 구현하며 전 과정 코드 검수·개발 조정을 수행한다.
- **박준영 ↔ 이의상:** 규칙/가중치·검색 관련도·추천/랭킹/예측 같은 **코드 기반 AI**와 HCX-007·CLOVA OCR·NLP/RAG 등 AI 범위가 생기면 두 사람 중 기능 주작성자를 반드시 지정해 구현을 넘긴다. 다른 AI 개발자는 상호 피드백/교차 리뷰, **박준영은 AI 제품 기술 QA 및 재시험**을 수행한다.
- **김채윤:** 공식 동아리/공모전/학사 공고·포스터/이미지·출처/권리·독립 Gold 및 웹 디자인 자산을 관리하고 실제 데이터를 입력해 사용자로 가볍게 시연/제보한다. 자료가 필요한 기능마다 **독립 `[데이터 요청]` 이슈**를 만들고 김채윤을 원 기능의 **공동 assignee**로 둔다. 현재 13개 기능의 자료는 [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)에 요청했다.
- **이서연:** 기존 React 웹의 UI/UX·데이터 시각화·실제 API/기능 배치와 콘텐츠 디자인을 구현한다. 심민성은 기능의 비AI API/DB/계약 통합을 계속 개발하며 품질을 총괄한다.

신규 기능/데이터의 진행·PR·QA 결과는 **각 기능/자료 요청 이슈**에 적는다. **역할 이슈 #355–#359에 새 작업이나 댓글을 추가하지 않는다.** 공통 계약·마이그레이션은 소비자들과 교차 검토한다.

Claude/GPT 기반 바이브코딩은 초안 코드·문서·테스트/재현을 보조하지만 **생성물은 검증 전 사실이 아니다**. 비작성자 GitHub REVIEW, exact HEAD CI, 사용자/기관/자료·비용/출시 승인과 구분한다. 팀 각자는 actor/권한·시점/근거·AI·학점·운영 실패 경로를 5문장과 요청 흐름도로 설명할 수 있어야 한다.

## A17. TASK 실행·검증 매핑

여기 표는 현재 모듈·검증 책임의 **작업 종류**를 정의하며 완료/미완료 건수는 [STATUS](STATUS.md)·[#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)·각 트랙 이슈로 판단한다. P2/선택 확장은 P0 릴리스 조건과 구분.

| 작업 | 담당 우선·읽을 절 | 완료 증거·독립 검토 |
| --- | --- | --- |
| TASK-00 공통 계약 | A00·A02·A04·A13 / 심민성 | Zod·TopicCode·subject/consent·버전·4트랙 소비·합성/격리 PG CI |
| TASK-01 이수원장 | A03·A08 / 박준영 | 고유 취득학점·재수강/중복 및 독립 수기 근거 |
| TASK-02 졸업·계획 | A08 / 박준영 | 학칙 scope·예외/조항·UNKNOWN/RulePack 버전·owner API |
| TASK-03 학업후보 | A08·A09 / 박준영·이의상 | 과목/선수·조건·간단 계획; 고급 solver P2 제외 |
| TASK-04 UI·모바일 | A02·A11 / 이서연 | 상단/모바일 메뉴·접근성·합성 E2E와 실기기 수락 분리 |
| TASK-05 경험·보관함 | A10·A13 / 심민성·이서연 | owner CRUD·승인/철회·권한·계획/지원 초안 분리 |
| TASK-06 추천 | A04·A05·A15 / 박준영·이의상 개발, 김채윤 Gold | 결정론·근거/자격·고정 평가·독립 Gold |
| TASK-07 DB·인증 | A02·A03·A13·A14 / 심민성 | OIDC/학교메일·RLS/SQL roles·초대·CSRF·부정시험 |
| TASK-08 CLOVA | A06·A15 / 이의상·박준영 AI 구현, 심민성 전송/보안 통합 | 4 task·safe packet·OCR/HCX·quota/중복 정산·fallback |
| TASK-09 통합 여정 | A02·A05·A10·A11 / 전 트랙 | 동일 actor/grant/asOf·UI→API→PG·권한/시점/캐시 |
| TASK-10 복구/오프라인 | A11·A14 / 심민성·이서연 | OFFLINE_READONLY·STALE·권한 복귀·late 응답 안전 |
| TASK-11 NCP | A14 / 심민성 코드·이서연 운영 | IaC/SSH preview와 승인된 실 host/TLS/요금 구분 |
| TASK-12 출시 보안 | A14·A15·A18 / 독립 검증 | 401/403·direct-IP·데이터 원본/비밀·role·롤백/권리 |
| TASK-13 합성·미디어 | A12 / 김채윤 자료·이서연 디자인·심민성 검수 | 40공고·10공지·이미지/판본/alt·20+12 독립 평가 |
| TASK-14 개인공지 | A07 / 김채윤 출처·박준영/이의상 AI/기능·이서연 UI | 적용 학사조건/마감·시점/UNKNOWN·캘린더 |
| TASK-15 대상 문맥 | A02·A13 / 심민성·이서연 | 20방향·다중탭/취소·그랜트 철회·CAS/overlay |
| TASK-16 팀 인수 | A01·A16·A18 / 전원 | 지도·10질문·시연/설명 및 사람 서명 |
| TASK-17 개설 전망 | A09 / 박준영 | 확정·누락/UNKNOWN·rolling-origin·공식 근거/What-if |

**TASK-14C — 개인 주요 일정 확장:** A07/A11/A13의 권한 있는 CalendarResult·확정 마감/행사·UI 2주 달력; 실제 알림 전송/미공유 정보 노출은 이 기능이 아니다.

## A18. 일정·완료 게이트·공동 결정

**코드 병합과 공개 출시를 혼동하지 않는다.** 완료 조건은 필요한 기능이 **권한/자료·전체 API·DB·브라우저·운영/복구·독립 사람/기관** 범위에서 해당 증거로 수락되는 것이다. 승인 없는 공모전 제출/자료게시·비용/VM·유료 AI·실 사용자 초대/공개 전환은 수행하지 않는다.

**공동 승인 대상:** 학생 원본별 사용/팀 공유/외부 모델/NCP/보관·철회, 학교 자료·RulePack·브랜드 사용, 도메인/실 Google/메일·NCP 계정/비용/리전·운영 공개/반납, 실제 제출·발표·D03 출시 결정. 현재는 **RELEASE_BLOCKED / NO_GO**.

## A19. OSS·외부 자료·출처

참조 기술/서비스의 **사용자 문제 해결 원리**만 비교하여 채택하고 학교/외부 제품 UI·코드를 그대로 복제하지 않는다. npm direct/transitive/CycloneDX SBOM과 native/Python/pypdf/Poppler/bubblewrap·폰트·모델/그림·외부 원문·학교 로고의 LICENSE/NOTICE/상업·재배포/게시/전송 이용권을 별도 검수. UNKNOWN 증거는 배포 가능으로 승인하지 않는다.

**정본 링크:** [HUFSAbility 공개 참고와 권리](reference/hufsability/INVENTORY.md) · [데이터 거버넌스](docs/DATA_GOVERNANCE.md) · [REVIEWER 접근](docs/REVIEWER_ACCESS.md) · [NCP 운영](docs/NCP_OPERATIONS_2026.md) · [실제 인수](docs/HUMAN_ACCEPTANCE_GATE_20261104.md).


## 2026-11-06 현행 구현 보충 (규범 및 출시 조건은 그대로)

- 오너 분할 #267~#275 중 8건, 본인 CSV 화면 [#277](https://github.com/ot4562-glitch/HUFS-One-AI/pull/277), 박준영 전망 [#278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278), 김채윤 추천/역량 [#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279) 모두 **main 병합**. 구 #264는 미병합 종료.
- A09/TASK-17: #278은 정규 직전 **8학기/동일 계절 최대 4개**, `NOTICE_ONLY`/UNKNOWN·rolling-origin 합성 코어 테스트로 한정; 실학교 8학기 official course identity·RulePack 인수는 #11/#276에 남음.
- A05/A06/A15: #279는 합성 40기회+10학사공지 분포 및 **AI 후보 ≠ 학생의 ACTIVE 승인 경험 신호**에 관한 결정론 코어. #259 한정 코어 완료, 실제 UI #258·독립 Gold·실출처/추천 전체 #10은 미완료.
- A08/A13: `csv/`의 기존 Forms 1 + 학생별 수강 CSV 4개 총 5개 원본은 **무단 변경/삭제 금지**, 현행 Git blob SHA 검사. 운영 BETA actor↔4인 source rights/동의/owner registry·실 PG 적용/본인 조회는 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) 별도 검증; 단순 CSV 복구/DB 적재로 실학사 판정 완성 아님.
- [NCP 서버 개설](docs/BEGINNER_NCP_SERVER_SETUP.md) · [제품·GPT(Codex)/Claude 설치](docs/BEGINNER_NCP_PRODUCT_AND_AGENTS.md) · [비전공자 제품 구조](docs/BEGINNER_PRODUCT_ARCHITECTURE.md). 자세한 병합·실운영 상태는 [STATUS](STATUS.md).
