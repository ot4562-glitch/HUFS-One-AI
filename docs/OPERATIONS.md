# HUFS One AI — 통합 데모·NCP 운영 매뉴얼

> **정본 경계:** 사용 중인 코드·인증·권한/동의·실서비스 출시 근거보다 이 문서의 과거 절차를 우선하지 않는다. 운영은 `docs/PRODUCTION_RUNTIME.md` 및 `infra/ncp/README.md`와 실제 승인된 환경을 확인한다. 이 문서는 8개 분산된 운영/시연/자원/의존성 문서를 통합하며 원본 경로·blob SHA를 남긴다. 2026-11-05/06 과거 계획은 현재 완료 사실이 아니다.

**바로가기:** [NCP operations 2026](#ncp-operations-2026) · [Product activation runbook](#product-activation-runbook) · [Demo manual](#demo-manual) · [Empty demo runbook](#empty-demo-runbook) · [Prefinal operations plan (historic)](#prefinal-operations-plan) · [Dependency security operations](#dependency-security-operations) · [Laya CPU spike protection](#laya-cpu-spike-protection) · [Source queue busy semantics](#source-queue-busy-semantics)


<a id="ncp-operations-2026"></a>
## NCP operations 2026

> 통합 이전 경로: `docs/NCP_OPERATIONS_2026.md` · Git blob `f6e8b7660be9fb08395c5779aed5ad4977287ecc`. 원래 내용과 운영 적용 여부는 구분한다.

### 현재 NCP 운영 상태

프로젝트 소유자는 문서에 기재된 NCP·클라우드/모델·자료 전송·운영 및 출시 승인을 모두 완료했다고 확인했습니다. **OWNER_CONFIRMED_APPROVED**입니다. 실현 대상의 계정·리전/SKU·주소·키·가격·청구/종료 구성이 필요하며 미설정은 CONFIGURATION_REQUIRED로 표시합니다.

#### 최신 협업자 업무·자료 요청 안내 (2026-11-08)

현행 [팀 역할](WORKSTREAMS.md) 및 [자동 이슈 배정 가이드](ISSUE_ASSIGNMENT_PLAYBOOK.md)를 따른다. **고정 역할 #355–#359는 읽기 전용**이며 운영/코드/데이터 요청을 그 이슈에 쓰지 않는다. 신규 추가 기능은 심민성이 가능한 일반 인프라/API/DB·통합 코드까지 진행하고, **코드 기반 AI 포함 AI 개발은 박준영/이의상에게 인계**한다. 자료/포스터/Gold가 필요하면 별도 `[데이터 요청]` 이슈를 김채윤에게 발행하고 해당 기능의 공동 assignee로 둔다. 기존 기능 자료 요청은 [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360). 웹 UI/기능 배치는 이서연, AI 기술 QA는 박준영, 총괄/통합은 심민성이 계속 검수한다.

#### 책임

심민성은 API/DB·CLOVA/worker·IaC/OS·배포/CI 코드를 작성합니다. 이서연은 계정/IAM·실호스트·가격/크레딧·서비스 설정·실측/반납의 비코드 담당입니다. 개발자가 없는 계정/비밀번호·실측 결과를 만들어내지 않습니다.

#### 실행

기존 NCP network/host Terraform과 SSH 합성 preview는 자신의 제한된 모드를 유지합니다. 실제 사용자 서비스는 `production-main`과 [운영 factory](PRODUCTION_RUNTIME.md)로 시작합니다. DB CA TLS·분리 role/RLS·OIDC/학교메일·TLS ingress와 실제 환경이 연결되어야 합니다.

실계정/실호스트에서 가격·VAT·크레딧·청구 상한과 종료 책임, VPC/ACG/Network ACL·UFW·SSH host fingerprint, HTTPS/Host/TLS·원 client IP·직접 IP/IPv6·캐시, backup/restore·키 회전·CPU/RSS/p95·실제 비용을 검증합니다. 한국 리전이라는 이유만으로 한국 IP만 접근된다고 주장하지 않습니다.

#### 결과

[#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)에는 실제 실행 SHA/환경·명령·PASS/FAIL/NOT_RUN/CONFIGURATION_REQUIRED와 측정값을 기록합니다. 소유자의 승인 완료 확인은 인정하되 아직 실행하지 않은 서버 배포/유료 모델/DB 작업의 성공을 의미하지 않습니다.

#### 2026-11-06 업데이트

- 오너의 NCP/운영 코드·IaC는 병합되어 있어도 **실 NCP 계정·서버 생성·SSH·HTTPS/OIDC/PG/CLOVA/실비용·롤백/반납은 미실행**. `RELEASE_BLOCKED`.
- [초보자 서버 개설 가이드](BEGINNER_NCP_SERVER_SETUP.md) · [NCP 제품·Codex/Claude 설치](BEGINNER_NCP_PRODUCT_AND_AGENTS.md) · [운영 증거 원장](ENGINEERING_ARCHIVE.md#owner-track-release-evidence). `csv/` 원본 5개는 무단 변경/삭제하지 않으며 공개 배포에 넣지 않음.

---

<a id="product-activation-runbook"></a>
## Product activation runbook

> 통합 이전 경로: `docs/PRODUCT_ACTIVATION_RUNBOOK_20261105.md` · Git blob `c93e9c703c2ded38e33126ff6bf24361db95583d`. 원래 내용과 운영 적용 여부는 구분한다.

### HUFS One AI — 제품 실행·검증·실서비스 전환 순서

> **현행 판정(2026-11-06):** 프로젝트 범위 승인 `OWNER_CONFIRMED_APPROVED`, 코드 병합·합성 CI는 검증됨. **실 NCP 서버/Google/학교메일/운영 PostgreSQL·학생 4명 DB 적재/실 CLOVA·비용/복원은 `NOT_RUN` 또는 `CONFIGURATION_REQUIRED`; 공개 서비스는 `RELEASE_BLOCKED`.** 과거 문서의 #252/#253/#257 이슈는 후속을 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)에 이관하며 종료됨.

#### 최신 코드 통합 확인 (2026-11-06)

- [PR #292](https://github.com/ot4562-glitch/HUFS-One-AI/pull/292)(학업 독립 참조모형·탐색 예산) · [PR #293](https://github.com/ot4562-glitch/HUFS-One-AI/pull/293)(학사공지 SourceRevision/mock claim·clean HEAD 벤치) · [PR #295](https://github.com/ot4562-glitch/HUFS-One-AI/pull/295)(교과코드 미확인 원장/전망 `forecast-offering-v3`, API `NOT_CONNECTED`) · [PR #304](https://github.com/ot4562-glitch/HUFS-One-AI/pull/304)(공통 UI/발표 S04·공개 합성 Pages 자동배포 유지). 네 PR의 각 **PR HEAD** GitHub Actions 4/4 SUCCESS를 확인하고, 사용자의 일괄 병합 지시에 따라 squash merge했습니다. GitHub 리뷰는 `COMMENT` 중심이며 독립 사람의 `APPROVED`가 아닙니다. 병합된 마지막 코드 `main` SHA는 [`5c17255`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/5c172552a8145cec61ac8f1729b60b1514fc965d)입니다. **이 뒤의 문서 커밋을 포함한 최신 SHA의 CI는 별도로 확인해야 하며 이전 PR HEAD 검사 결과를 전용하지 않습니다.**
- 합성 브라우저 자동 Pages 배포는 막지 않습니다. **정적 공개 Pages와 인증된 운영 사이트는 별개**이며 본인 권한과 실 NCP/Google/PG/CLOVA·자료/비용/복원 영수증 없이 운영 GO로 승격하지 않습니다. 운영 학교 로그인 #297/#299, 수집 자료 진입 #301, 모델 캐시 증거 시연 #302는 아직 OPEN.
- 실제 학교 인증·팀원 4명 개인별 데이터/학수번호 132개 공식 매핑·NCP/PG/CLOVA 실행·포스터/모바일/스크린리더 사람 인수는 `NOT_RUN/CONFIGURATION_REQUIRED` 또는 미완료입니다. 운영 제품은 `RELEASE_BLOCKED`이며, 공개 GitHub Pages는 **실자료·외부 AI 호출 없는 합성 시연**으로 `main` push 때 자동 배포를 계속합니다. 원본 `csv/` 다섯 파일은 내용·경로/이름·인코딩·추적 상태를 그대로 유지합니다.

#### 1. 코드를 먼저 고정

- 현재 `main` SHA와 변경 파일·담당 규칙([AGENTS](../AGENTS.md)) 확인. 동료 dirty worktree·CSV 원본 5개 변경 금지.
- 오너 PR #267~#275 중 실제 분할 8건 및 #277, 동료 [#278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278)·[#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279)은 **main MERGED**. 구 대형 #264 **CLOSED 미병합**.
- 코드 통합 기준 `48134da`의 [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752742), [Chrome](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752741), [NCP IaC offline](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752743), [합성 Pages](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752761) **4/4 SUCCESS**. 새로운 문서/코드 commit은 해당 HEAD의 CI를 다시 확인한다.

#### 2. 계획/합성 화면만 먼저 검증

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run build:api
npm run build:web
node dist/apps/api/src/production-main.js --plan
```

`--plan`은 비밀·DB/NCP·실자료를 읽지 않고 구성 요구만 출력한다. 로컬 합성 데모는 [DEMO_MANUAL](OPERATIONS.md#demo-manual), 실제 NCP의 안전한 SSH 전용 합성 preview는 [NCP 서버 만들기](BEGINNER_NCP_SERVER_SETUP.md) → [NCP 제품/AI 개발 에이전트 설치](BEGINNER_NCP_PRODUCT_AND_AGENTS.md)를 참고한다. 합성 5계정/REVIEWER는 실학생 정보가 아니다.

#### 3. 본선진출 이후 실서비스 운영자 구성(#276)

1. NCP IAM·비용 상한/크레딧/리전/SKU/호스트·공인 IP·VPC/ACG/NACL/UFW/중단 책임을 실제 콘솔에서 확인.
2. 별도 신뢰된 operator factory `/etc/hufs-one/private/production.mjs`에 Google OIDC/외대메일, 인증·세션/CSRF, PostgreSQL 기본 7개+활성 확장 독립 role/CA TLS·FORCE RLS·백업/복원·rights을 구현. [PRODUCTION_RUNTIME](PRODUCTION_RUNTIME.md).
3. `csv/` Forms 1 + 수강 4 = 5개 원본 유지; 배포/CI 번들에 넣지 않는다. 각 학생별 현재 consent/rights↔Forms 행↔CSV 파일 해시↔**BETA actorId**를 실제 검증된 비공개 registry로 매핑한다. 단순 CSV DB INSERT 또는 PR #277 병합만으로 실화면 연결 완료를 주장하지 않는다.
4. 운영자 분리된 민감 data intake/SQL migration을 plan→현재 권리/학생별 검토→실 DB apply/readback→철회/삭제/rollback 순으로 실행. 실제 원장·RulePack/학수번호 미확인을 공식 판정으로 바꾸지 않는다.
5. 실제 CLOVA OCR/HCX/Vision는 서버 전용 키, 예산·요금·타임아웃/취소·원문 이용권·사용자별 동의·출처 검증 후에만 호출. 개발 Codex/Claude Code 설치와 구분.
6. 도메인/DNS/TLS/Host/SNI, 신뢰 프록시·다른 실제 client IP·직접 origin/IPv6 우회·API/DB 비공개 포트, 로그·개인정보 비노출, 재시작·백업/복원·rollback을 증명.

#### 4. 출시 전 실수락

- BETA/REVIEWER/ADMIN 역할·로그아웃/만료/복구·401/403/409/422/429/503, 두 사용자 자료 교차 거부·동의 철회 및 레이스.
- 학생 경험→AI 후보→**본인 승인**→추천→철회 종단의 실제 모델/데이터와 UI #258·학업 #260 소비자 검수.
- 학교 공식 자료·RulePack/학점·수업 개설 증거, 실제 기기/모바일/스크린리더, 모델 청구·CPU/RSS/p95, 운영 중단/반납. 독립 사람 Gold는 이번 범위에서 제외되었으므로 **미완료**로 두고 달성률로 포장하지 않는다.
- **현재 상태:** 실계정/서버·요금/학생별 최신 권리·복구/검증이 없으므로 출시 `RELEASE_BLOCKED`. 완료 증거를 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) 및 [운영 증거 원장](ENGINEERING_ARCHIVE.md#owner-track-release-evidence)에 반영.

#### 5. 문서와 운영 인계

[초보자용 제품 원리](BEGINNER_PRODUCT_ARCHITECTURE.md) · [운영 인수 #276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) · [NCP 인계 양식](../infra/ncp/OPERATIONS_HANDOFF_TEMPLATE.md) · [팀 담당 범위](WORKSTREAMS.md).

---

<a id="demo-manual"></a>
## Demo manual

> 통합 이전 경로: `docs/DEMO_MANUAL.md` · Git blob `ed84b00ac2274c2bd26cbd06fa8028375f656ab2`. 원래 내용과 운영 적용 여부는 구분한다.

### HUFS One AI — 현재 합성 시연 매뉴얼

이 문서는 **실제 학생·학교 운영 데이터와 분리된 로컬 시연**을 실행하기 위한 안내다. 최신 UI는 데스크톱 11개 참고 대분류 GNB/실제 화면 LNB·모바일 하단 5탭, 공통 상단 합성 계정 영역, HUFSAbility 원래 메뉴는 미지원 상태 안내, 홈 배너/요약 카드다. 운영 로그인·NCP·외부 유료 AI·실학생 원본/학교 자료의 허가는 포함하지 않는다.

#### 실행 준비

Node.js `^22.22.2` 또는 `^24.15.0` 및 npm을 사용한다. 개인 CSV/Forms·학번·비밀번호/키를 합성 실행 환경이나 CI에 넣지 않는다.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run check:privacy
```

#### 선택 A — 5개 가상 학생 슬롯

API와 웹을 **별도 터미널**에서 실행한다.

```sh
npm run start:api:synthetic-accounts
```

```sh
npm run dev:web -- --mode synthetic
```

로컬 브라우저 `http://127.0.0.1:5173/local-demo`에서 S01–S05 중 2개 이상을 선택한다. 동일 공고 40·공지 10을 비교하면서 개인화 목록·추천 이유·확정 마감/D-day·정정 시점/출처·중요 일정·학사 정보의 `UNKNOWN/NOT_SHARED` 상태를 확인한다. 설정·북마크·경험 DRAFT·계획/What-if는 **가상 저장·보수적 계산**이며 실제 지원 완료나 공식 졸업 판정이 아니다.

#### 최신 합성 홈·기회 인터랙션 (병합 PR #307)

1. 가상 S01을 선택하고 홈 `/`의 **오늘의 액션 가이드**에서 맞춤 기회/확정 7일 내 일정/취득 학점을 버튼으로 바꿉니다. 값이 공유되지 않았다면 숫자 0이 아닌 `—`를 확인합니다.
2. `/opportunities`에서 `공고 검색`으로 현재 표시된 제목·분야·추천 이유를 필터하고, `자격 확인 필요` 및 `7일 내 마감` 버튼/확정 마감 정렬을 사용합니다. 빈 목록에서는 `검색 조건 초기화`가 동작합니다.
3. 합성 대상 S02로 전환하면 이전 선택자의 검색어와 필터가 초기화됩니다. 브라우저 360px에서 키보드·reduced-motion 확인은 [PR HEAD Chrome CI](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685929) 근거가 있으며, **실기기/스크린리더 사람이 직접 확인한 결과는 아닙니다**.
4. 7일 기준은 현재 날짜 조회가 아니라 합성 **snapshot `asOf`**에 상대적입니다. `hasMore`로 생략된 공고를 검색하는 기능이 아니며, 실제 지원 자격·졸업/학점 공식 판정이나 실시간 전체 모집 공고가 아닙니다.

#### 선택 B — 독립 EMPTY_DEMO·가상 동아리

**선택 A 서버 두 개를 종료한 후** 다음 API/웹을 별도 터미널에서 실행한다.

```sh
npm run start:api:synthetic-empty-demo
```

```sh
npm run dev:web -- --mode empty-demo
```

- 학생 BETA: `http://127.0.0.1:5173/api/dev/empty-demo/bootstrap` → `/demo-profile`
- 합성 ADMIN: **별도 브라우저 프로필**에서 `http://127.0.0.1:5173/api/dev/synthetic-clubs/bootstrap` → `/clubs/admin`
- BETA: 주전공·취득학점(0과 미입력 구분)·관심·이중전공 선택 → 저장 → 공고/공지/달력·계획/경험/북마크 → 다른 설정 B → RESET/새 세션/다중탭.
- ADMIN: 가상 모집글 초안 → 승인 → BETA 목록·상세/보호 PNG에서 확인 → 수정(재승인 필요) → 철회 → 직접 원문 이미지 URL의 권한/상태 차단 확인.
- 모바일 360px·키보드/포커스/미지원 상태·기기 네트워크 끊김 시 안전한 빈 값 처리 확인.

```sh
npm run test:e2e:empty-demo
npm run assets:check
```

실제 Chrome E2E는 자동화 시험이지 **별도 실제 스크린리더/기기에서 사람이 확인한 수락**이 아니다. 로컬 합성 메모리 저장소를 재기동해 정보가 초기화되는 것도 운영 PostgreSQL 영속성 실패라고 단정하지 않는다.

#### 공개 GitHub Pages 합성 미리보기 (#304)

- **`main`에 병합하면 GitHub Pages 자동 공개 재배포는 그대로 실행**됩니다. 공개 페이지는 정적 합성 UI이며 실제 학교 계정 로그인·권한 보호·NCP/유료 AI/개인 CSV 호출을 하지 않습니다. 이 사이트가 열린다고 실학생 정보가 공개 API를 통해 접근 가능한 것은 아닙니다.
- 공개 Pages에서는 가상 학생 4(S04)에 기본으로 주입되던 `SHARING_REVOKED` 부정시험을 제거했습니다. **로컬 synthetic 개발 모드에서는 그 실패 주입이 유지**됩니다. 실제 학생 4인의 본인 로그인·원본 권리/동의 연결과 권한철회 후 캐시 소거는 #297/#299/#303에서 아직 검증되지 않았습니다.
- 앞으로 실제 학교 로그인으로 본인 정보 4명을 시연하려면 **각자 확인된 실제 BETA actor**와 운영 서버 권한/현재 동의로만 로그인해야 합니다. 임의 가상 시연 계정을 실서비스용으로 추가할 계획이 아닙니다. 자료 수집/학업 화면 연결은 #301, 실제 CLOVA/Laya 호출과 캐시 재생 증거는 #302.
- 설명은 `LIVE_PROVIDER_RUN`(실제 영수증 있을 때), `CACHED_PREVIOUS_RUN`(원래 실행/시각·근거 제시), `SYNTHETIC`(비과금 합성 예시)로 분리하며 실제 저장/작동까지 구현했다고 주장하지 않습니다.

#### 본선 발표용 전체 사이트 시연 루트 초안 — 김채윤 담당

**시연 담당: [김채윤 #358](https://github.com/ot4562-glitch/HUFS-One-AI/issues/358)** — 자료를 직접 넣으며 전체 화면을 학생 사용자 관점에서 가볍게 시연·이슈 제보하고 발표 흐름(60초/10분)을 구성한다. 기술적 AI 정확도 시험은 **[박준영 #356](https://github.com/ot4562-glitch/HUFS-One-AI/issues/356)**, AI 개발/교차검토는 **[이의상 #355](https://github.com/ot4562-glitch/HUFS-One-AI/issues/355)**, 웹 디자인·배치는 **[이서연 #357](https://github.com/ot4562-glitch/HUFS-One-AI/issues/357)**, 전 과정 코드 검수는 **[심민성 #359](https://github.com/ot4562-glitch/HUFS-One-AI/issues/359)**가 수행한다. 실제/합성 자료·운영 상태는 별도 인수한다.

**시연 전 안전 게이트:** 공개 GitHub Pages·S01–S05는 **합성 데이터/모의 AI**다. 실제 학생의 경험/포스터/성적·실 CLOVA/Laya/NCP 호출은 허가된 비공개 서버·본인/목적별 동의·금액/모델 호출 제한·권한/철회 검증을 갖춘 경우에만 사용한다. 공개 라이브 화면·PR·영상/로그에는 개인정보·비밀 키를 넣지 않는다. 권한 미확보 시 **인공 문장과 합성 승인 흐름만 보여 주고 실모델 처리라고 설명하지 않는다**.

##### 기본 화면 동선 (60초 요약 → 10분 전수 시연으로 확장)

1. **시작·대상 선택** — 로컬 `/local-demo` 또는 승인된 합성 Pages에서 S01 선택 후 `/` 첫 화면: '독립 학생 프로젝트·합성 시연', 맞춤/확정 마감·학점 카드와 자료 기준일·출처 고지. S01/S02는 가상 대상이고 실제 로그인과 다름.
2. **관심·경험 입력** — `/settings`에서 관심 분야/희망 직무 설정, `/experience`에서 **시연용 가상 경험**을 선택·입력하고 목적별 분석 동의·승인 범위를 확인. 현재 합성 3개 예시/미지원 AI 버튼은 미지원 이유를 보여주고, 임의 문장을 실제 모델이 분석했다고 말하지 않음.
3. **AI가 해석한 결과 확인** — 경험 원문 → HCX-007·CLOVA OCR 또는 규칙 기반 처리 사용 여부·AI 역량 태그 후보/근거·`NEEDS_REVIEW` → 학생 수정·명시 승인/철회(실제로 구현된 범위만). **합성 예시 vs 실제 신규 호출 vs 검증된 캐시 재생**은 세 모드로 따로 설명. 실모델 재현은 이의상·박준영의 AI 공급자/정확도 검증과 심민성의 API·권리/보안 확인, 이서연의 웹 연결 인수 후 실제 증거가 있을 때 표시한다.
4. **맞춤 추천 연결** — `/opportunities` 검색·자격 확인 필요/확정 마감/정렬, 공고 상세에서 추천 근거·불확실성·출처·현재 승인 경험 반영 여부를 설명. 승인 전/후 추천 결과가 달라지는지 기대/실측 비교해 기록.
5. **공지·학업·기타 주요 영역** — `/notices`의 학사공지/기한·자료 검증 상태, `/` 미니 캘린더, `/graduation`·What-if의 취득/수강/계획 학점과 미확인 학칙, `/saved`·`/applications`·`/clubs`의 보관·지원·동아리 가상 흐름을 순서대로 확인. 공식 졸업/지원/동아리 참여 확정이라고 말하지 않음.
6. **학생별 권한·오류 대응** — S01 → S02 전환·미공유/UNKNOWN/EMPTY 표시, 철회·로그아웃·새 탭/오프라인/느린 응답 등 구현·허가된 범위에서 타인 데이터 0건을 검증. BETA 운영 인증/실자료 권한 인수는 별도.

**60초 버전 권장:** (1) 합성/독립 서비스 고지 → (2) 학생 관심/경험 → (3) AI 태그 후보와 학생 승인 경계 → (4) 공고 추천/불확실성 → (5) 학업과 일정, 단 실제 처리·공식 판정 여부를 과장하지 않음. **10분 버전:** 위 1–6 단계에 모바일/키보드 상태·다른 프로필 대비·실패/복구 시나리오를 추가.

##### 김채윤의 데이터 직접 입력·가벼운 사용자 시연

- [ ] 실제 이용권이 확인된 공고/포스터·동아리/학사 자료 또는 명시된 합성 예시를 제품에 입력하고 목록→상세→추천·FAQ→공식 링크의 **사용 흐름**을 사용자 관점에서 체험한다.
- [ ] 이서연의 웹 UI가 포스터 이미지·제목·마감·출처를 제대로 보여 주는지 살펴보고, 화면·링크·가독성·관찰한 이상을 **한두 문장의 이슈/선택적 익명화 캡처**로 제보한다.
- [ ] 데이터 담당자로서 별도 [#360 대규모 자료 요청](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)의 공식 원문/게시권/독립 Gold를 공급한다. 실제 수량·이미지 허가·Gold 건수는 확보/검수 난이도를 보며 결정한다.
- [ ] 시연 환경·코드 SHA·사용한 실제/합성 자료 유형·미연결 기능을 구분해 기록하고, 발표/가벼운 사용 의견을 공유한다.

##### 박준영의 AI 제품 기술 QA 및 이의상과 교차검증

- [ ] 박준영은 김채윤의 독립 Gold와 같은 입력·sourceRevision을 바탕으로 추천/랭킹·HCX-007·CLOVA OCR·코드 기반 AI의 정확도·인용·모델/규칙 버전을 측정한다.
- [ ] 이의상과 박준영은 OCR/FAQ/RAG·추천 의미/근거의 **양방향 반례와 수정 제안**을 교환하고 해당 개발자 수정 후 동일 사례를 재시험한다.
- [ ] 기술적 원인·모델/규칙 버전·비용/지연/오류율/권한 경계와 `PASS/FAIL/NOT_RUN`을 기록한다. UI 등 일반 결함의 기술 조사는 심민성이 담당자를 정한다.
- [ ] 이서연은 승인된 웹 구현 개선 항목을 실제 사이트에 연결하며, 심민성은 구조·코드·시연·기술 QA·변경/통합의 **전 과정**을 검수한다.

**역할 이슈 #355–#359는 읽기 전용**이다. 시연 제보·AI 오류·자료 요청은 새로운 기능·결함/데이터 이슈에 기록하며 고정 역할 이슈에 댓글을 추가하지 않는다. [업무 자동 배정](ISSUE_ASSIGNMENT_PLAYBOOK.md) · [팀 역할](WORKSTREAMS.md).

#### 시연 시 정직한 설명

- 이 화면은 **독립 학생 프로젝트**, 학교 공식 서비스가 아님.
- 합성 5슬롯과 실원본 제공자 4명, REVIEWER를 혼동하지 않음.
- AI 예시/보류/미지원, 공식 RulePack 미검증·실지원 기능 부재, 운영 미가동을 명확히 밝힘.
- 발표 목표는 **60초 핵심 시연, 10분 설명·5분 질의응답**이며 실제 팀원/비작성자 리허설은 [#252 D02](https://github.com/ot4562-glitch/HUFS-One-AI/issues/252)에서 검수.

실행·승인 경계: [EMPTY_DEMO](OPERATIONS.md#empty-demo-runbook) · [STATUS](../STATUS.md) · [인수서](HUMAN_ACCEPTANCE_GATE_20261104.md).

---

<a id="empty-demo-runbook"></a>
## Empty demo runbook

> 통합 이전 경로: `docs/EMPTY_DEMO_RUNBOOK.md` · Git blob `93240782eea9a404b9c76ba522691d0f5cd5838d`. 원래 내용과 운영 적용 여부는 구분한다.

### HUFS One AI — 빈 합성 계정과 가상 동아리 실행

**기본:** 실제 학생 이력 4명과 완전히 분리된 합성 `EMPTY_DEMO`·가상 관리자. 기능 코드/Chrome/일회용 PG 자동검증은 존재하지만 운영 계정·실원본/실기관·스크린리더 수락은 전이다.

#### 시작 명령 (서로 다른 터미널)

```sh
npm run start:api:synthetic-empty-demo
```

```sh
npm run dev:web -- --mode empty-demo
```

서버 시작은 **로컬 127.0.0.1 전용**이며 실학교 계정·외부 모델/유료 NCP를 호출하지 않는다. 학생 계정은 `/api/dev/empty-demo/bootstrap`로 발급되어 `/demo-profile`에서 설정하고, 합성 ADMIN은 **다른 브라우저 프로필**로 `/api/dev/synthetic-clubs/bootstrap`→`/clubs/admin`에 진입한다. 운영용 관리 권한/프로덕션 부트스트랩이 아니다.

#### 빈 계정에서 보이는 4개 기본 입력

1. 주전공(본인 선택)
2. 취득 학점: `null`(미입력)과 `0`(명시적 0)을 다른 상태로 보존
3. 관심 분야(1–5개)
4. 이중전공·복수전공 상태

저장하면 현재 설정/권한·fixture 버전의 추천/공지·일정, 학업 `UNKNOWN/NOT_SHARED`와 북마크·경험 DRAFT·행동/계획·알림 선호가 갱신된다. A→B 전환 때 이전 응답/캐시/오버레이가 남지 않아야 하고 RESET은 자료 버전 CAS로 원래 빈 계정 상태를 복원한다. 실제 지원·졸업 확정은 하지 않는다.

#### 가상 동아리 종단

ADMIN가 **합성 모집글만** 만들고 보류→승인→정정(재승인 보류)→재승인→철회한다. BETA는 현재 승인된 글·관련성 추천/보호된 창작 PNG만 보며, 철회·권한 축소 후 기존 이미지 직접 URL/React 캐시가 열리면 FAIL이다. 포스터는 합성 창작물이며 실학교/실동아리 공식 게시 권한이 아니다.

#### 60초 시연(목표, 사람 인수 아님)

| 구간 | 시나리오 |
| --- | --- |
| 0–15초 | EMPTY·합성 배지, 기본 4개 설정(학점 0/미입력 구분) |
| 15–35초 | 추천/공지·마감·출처·상태 차이, 결정론 자격 |
| 35–45초 | 관심/전공 변경→재계산, 북마크·경험 초안 |
| 45–55초 | 학업/개설 전망·달력, 확인 불가 항목 `UNKNOWN` |
| 55–60초 | RESET/원본 불변·미지원 경계 |

10분 발표/5분 질의응답에서는 코드→API/SQL·SourceRevision/AI 검증·개인정보/실운영 차단과 실패 시 복구를 설명한다. **실제 담당자 리허설·스크린리더 독립 서명은 #252 D02 필요**.

#### 자동 검증

```sh
npm run test:e2e:empty-demo
npm run test:web
npm run assets:check
node tools/evaluation/run.mjs fixtures --action check
```

CI/로컬 로그는 실행한 SHA·브라우저/OS·PASS/FAIL/SKIP만 기록한다. 외부 과금·실자료·개별 동의/기관/사람 검수는 이 시험에 포함되지 않는다. 상태 [STATUS](../STATUS.md), 실제 수락 [#252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252).

---

<a id="prefinal-operations-plan"></a>
## Prefinal operations plan (historic)

> 통합 이전 경로: `docs/PREFINAL_OPERATIONS_PLAN.md` · Git blob `e45543680da2c3072a418106fe46560aced6e066`. 원래 내용과 운영 적용 여부는 구분한다.

### 본선 전 운영·경험 기능 사전 계획

> **현재 업무 배정 주의(2026-11-08):** 이 문서의 이전 시점 담당 이슈 #317·#321–#325 및 당시 인수/운영 분장은 **역사적 기록**이다. 현행 정본은 [루트 AGENTS](../AGENTS.md) · [업무 자동 배정 플레이북](ISSUE_ASSIGNMENT_PLAYBOOK.md) · [팀 역할](WORKSTREAMS.md)이다. 고정 역할 #355–#359는 **완전 읽기 전용**으로 수정·댓글/담당 변경을 하지 않는다. 신규 추가기능은 **심민성 최초 배정·가능한 비AI 코드 직접 구현 → 코드 기반 AI까지 포함해 박준영/이의상에게 AI 구현 인계**한다. 공식 문서·포스터·Gold 자료가 필요하면 **별도 `[데이터 요청]` 이슈**를 김채윤에게 만들고 원 기능에도 김채윤을 공동 assignee로 추가한다. 현재 13개 기능의 요청은 [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)이다. 김채윤은 사용자 관점 경량 시연, 박준영은 AI 제품 기술 QA, 이서연은 실제 웹 디자인/배치, 심민성은 전 과정 검수를 맡는다.


대상: #12 · #261 · 상위 #255. 기준일: **2026-11-06**. 이 문서는 합성 MVP의 요구사항·설정 검수·견적·인계 양식을 확정한다. 프로젝트 승인은 `OWNER_CONFIRMED_APPROVED`이며, 실제 계정·SKU·현재 개인별 동의·청구·독립 사람 검수는 구성/실행 증거로 따로 확인한다. 담당자를 대신해 사람 리뷰나 운영 시험을 수행했다고 기록하지 않는다.

#### 1. 제품과 합성 사용자 여정

HUFS One AI는 독립 학생 프로젝트다. HUFSAbility/MY커리어는 기능 분류를 참고하는 출처이며 학교 공식 제품·계정·활동 시스템과의 연결을 뜻하지 않는다. 원래 학교 메뉴의 미지원 표시는 유지한다.

1. 사용자가 직접 경험을 작성하거나 현재 권한으로 볼 수 있는 합성 경험을 선택한다. 비공유·철회·삭제 자료는 선택 목록과 추천 입력에서 제외한다.
2. AI 결과는 `NEEDS_REVIEW` 후보다. 원문 근거, 생성 판본, 현재 동의와 한계를 함께 표시한다. 처리 전·실패·비용 중단 시 후보를 만들어 내지 않는다.
3. 학생이 후보를 수정하고 현재 경험·동의 판본을 명시 승인해야 추천 신호가 된다. 철회·원문 수정·동의 변경 시 이전 신호는 무효다.
4. 역량 지도/활동 추천은 승인된 입력을 설명한다. 역량 후보는 능력 입증·학점 인정·지원 적격·취업 성과를 보장하지 않는다. 일부 portfolio 페이지를 전체 이력이라고 표시하지 않는다.

**사용자 안내:** “공유하지 않은 정보예요”(`NOT_SHARED`), “확인할 근거가 부족해요”(`UNKNOWN`), “후보를 검토하고 승인해 주세요”(`NEEDS_REVIEW`), “정보가 바뀌어 다시 확인해야 해요”(409), “접근 권한이 변경되어 이전 내용을 지웠어요”(403). 학교 공식 확인과 합성 예시는 별도 라벨로 표시한다.

#### 2. 자료·목적·권리 확인표

| 자료 유형 | 수집·저장·표시 | 개인화·외부 AI·공유 | 보존·정정·철회 |
| --- | --- | --- | --- |
| 합성 공고/경험/포스터 | 버전·출처·SYNTHETIC 표시; 실명·실학생 원문 없음 | 합성 미리보기만 사용; Pages 외부 API 호출 없음 | fixture 기준선과 이미지 해시 보존; 수정 시 별도 판본 |
| 본인 입력 경험 | 인증 actor와 owner 일치, 목적/동의 판본 확인 | 추천은 명시 승인 후; 외부 AI 전송은 그 목적의 현재 권리 검사 | 보존 만료일/삭제 요청은 비공개 기록; 철회 후 캐시·추천·후속 job 차단 |
| Forms 및 수강 CSV | 원본 제공 4명과 일반 참여 동의 5명을 구분; Forms↔파일↔actor 연결 검증 | Git 원본 존재나 일반 YES를 표시/AI 전송 권한으로 승격하지 않음 | `csv/` 5개 원본 불변; 현재 삭제·철회 권리의 처리는 운영 절차에서 별도 확인 |
| 학교 공지·학칙·화면 | 원문 URL·판본·확인 시점·이용 조건 기록; 직접 연동 미구현 표시 | 열람, 복제/스크린샷, 재배포, 모델 전송을 각각 확인 | 정정/취소/권리 만료 시 SourceRevision 게이트 재검사 |
| AI 생성 후보 | 모델/job·근거·내용/동의 판본과 학생 승인 분리 | 승인 전 역량/공식 사실로 공개하지 않음 | 원문/동의 변경·철회 시 폐기 또는 재검토 |

실자료 기록 양식: `자료유형 / 익명 evidence ID / 소유 actor(비공개) / 목적 / 허용 수신자 / 동의·권리 판본 / 유효시점 / 보존만료일 / 철회·삭제 상태 / 검토자 / 증거 위치`. 공개 저장소에는 이 양식만 둔다. 기간·허용 수신자가 설정되지 않은 실제 처리는 `CONFIGURATION_REQUIRED`다. 기존 승인 완료를 다시 승인 대기로 되돌리지 않는다.

#### 3. NCP 구성 후보와 비용표

한국 VPC·Ubuntu 22.04/24.04 amd64·**Standard-g3 2 vCPU/8 GB**를 소규모 합성 preview의 비교 후보로 삼는다. 실제 zone 가용성·이미지 ID·쿼터·계정 유형·학생 크레딧은 콘솔 확인 전 `CONFIGURATION_REQUIRED`다. 대표 계정에는 결제/IAM 관리만 두고 운영 하위계정과 배포 역할을 분리한다. 학습용 GPT/Claude 개발 CLI와 제품 CLOVA 공급자 비용도 분리한다.

아래는 **KRW, VAT 별도, 2026-11-06 공개 요금표 조회, ESTIMATE**다. 지출 승인이나 실제 청구가 아니다. 크레딧/할인은 0으로 가정하고, 알 수 없는 항목을 0원으로 합산하지 않는다.

| 항목 | 사전 사용량 가정 | 추정 계산·설정 조건 |
| --- | --- | --- |
| Standard-g3 2 vCPU/8 GB | 72시간 합성 preview | 공식 표 시간당 115원 → **8,280원**, VAT 10%를 가정한 예산 계산 9,108원. 월정액 표는 82,240원; 시간제와 중복 합산하지 않음 |
| OS/추가 디스크·snapshot/backup | OS 디스크 50 GiB 후보, 백업 1개 | g3 표의 디스크는 별도. 정확한 SSD 종류·GiB/월·보존일·snapshot 증분 단가를 콘솔 견적에 추가; **미확정** |
| 공인 IP·egress·LB/NAT·DNS/TLS | SSH preview는 IP 1개, 예상 egress 5 GiB, LB/NAT 0개 후보 | 적용 SKU·시간/트래픽 요금 확인 전 **미확정**. 필요 없다고 선택한 자원을 이미 무료라고 주장하지 않음 |
| DB | 합성 preview의 외부 DB 0개; 운영 관리형 PG 별도 | 운영 인스턴스·HA/backup·전송 가격 **미확정**, preview 견적을 운영 전체 비용으로 사용하지 않음 |
| General OCR 글자 | 최대 200회(기획 가정) | 공개 표 3원/건 → 600원 상한 추정, 무료 제공량은 차감하지 않음. 표 추출은 글자 포함 25원/건으로 별도 계산 |
| OCR API Gateway | 위 OCR 호출에 연결 | 별도 과금 항목; 요청·전송 단가 **미확정** |
| CLOVA Studio | 최대 200요청, 요청당 입력 3천/출력 1천 토큰(가정) | 입력 600천·출력 200천 토큰. 선택 모델의 천 토큰 단가를 각각 곱함. 공개 동적 표의 가격 미표시로 현재 단가 **미확정**, 실호출 OFF |
| 선택 Laya | 기본 OFF | 모델/메모리/호스트 비용 미측정. 기존 VM 여유 용량이나 무비용이라고 가정하지 않음 |

**합계 확정 조건:** 계정별 전체 견적 + VAT + 잔여 고정요금 − 유효 크레딧. 현재는 일부 항목만 산출 가능하므로 총액은 **미확정**이다. 계획용 운영 상한은 72시간/30,000원, 알림은 50%·80%, 100% 전에 신규 유료 job 차단으로 제안한다. 실제 상한/알림/결제 제한은 운영자가 설정해야 하며 문서 작성으로 활성화되지 않는다. 요금 미확정·청구 상태 UNKNOWN·예산 예약 실패 때는 유료 호출을 멈춘다.

공식 근거: [NCP 한국 요금표](https://www.ncloud.com/charge/price/ko), [공식 견적 계산기](https://www.ncloud.com/charge/calc/ko), [CLOVA Studio](https://www.ncloud.com/product/aiService/clovaStudio), [CLOVA OCR](https://www.ncloud.com/product/aiService/ocr), [OCR 사용 준비](https://guide.ncloud-docs.com/docs/clovaocr-spec). 계산기 결과도 예상 금액이며 실제 정산과 다를 수 있다. 실제 개통 시 최신 가격·VAT·크레딧 만료를 다시 대조한다.

#### 4. 설정 검수·중단·복구 인계

| 게이트 | 사전 검수 항목 | 실제 증거 상태/담당 |
| --- | --- | --- |
| C01 계정·예산 | 계정 유형/하위 IAM/최소권한/리전·SKU/쿼터/크레딧 만료/금액 상한·종료시각 | `CONFIGURATION_REQUIRED`; 이서연 설정·심민성 기술 대조 |
| C02 네트워크 | VPC/subnet/ACG/NACL/UFW 일치, SSH 관리자 IPv4 /32, 앱·PG 포트 비공개, DNS/TLS/Host·trusted proxy, 직접 IP/IPv6·위조 XFF 부정시험 | 실환경 `NOT_RUN`; 심민성 구현·이서연 기록 |
| C03 호스트·설치 | 별도 경로로 확인한 host-key pin, 개인키 비공개 전달, 절대 실행파일 경로, root/password 로그인 차단, 정확한 Git/번들 SHA | offline 회귀와 실제 SSH 결과 분리; 실 SSH `NOT_RUN` |
| C04 비용·성능 | 호출수/토큰/과금 예약·취소/일일 청구/CPU·RSS·p50/p95·오류율; 측정 구간·동시성·하드웨어 기록 | `NOT_MEASURED`; 예상 비용과 영수증 분리 |
| C05 복구·반납 | last-good rollback·재시작·DB backup restore·철회 유지, 남은 디스크/IP/LB/백업/모델 도메인과 청구 확인, 키 회전/폐기 | `NOT_RUN`; 서버 정지만으로 반납·과금종료 판정 금지 |

장애 대응 순서: 신규 job/시연 쓰기 중단 → 민감 내용 없는 incident ID와 시각 기록 → 현재 권한/동의 확인 → 마지막 검증 번들 또는 백업으로 복구 → 같은 검증 재실행 → 재개 여부 기록. 보안·권리 이상이면 과거 권한/캐시를 복구하지 않는다. 비용/자원 종료 담당은 이서연, 코드·rollback 담당은 심민성이다. 사용자/해당 자료 권리자의 승인 범위는 [AUTHORIZATION](AUTHORIZATION.md)과 현재 권리 기록을 따른다.

실행 기록은 [OPERATIONS_HANDOFF_TEMPLATE](../infra/ncp/OPERATIONS_HANDOFF_TEMPLATE.md)에 `정확한 SHA / OS·도구 버전 / 시작·종료 시각 / 명령 / 기대·실제 결과 / PASS·FAIL·HOLD·NOT_RUN / 익명 증거 ID / 담당·검토자 / 복구·반납 결과`를 채운다. 실제 인수는 [#283](https://github.com/ot4562-glitch/HUFS-One-AI/issues/283)와 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)에서 계속한다.

#### 5. 피드백·성과·교차 검토

사람 피드백 질문: (1) 합성 예시와 실제 모집을 구별했는가? (2) 추천 이유와 미확인 조건을 설명할 수 있는가? (3) AI 후보의 정정/승인/철회를 찾았는가? (4) 정보 미공유와 0건을 구별했는가? (5) 모바일·키보드로 목표를 완료했는가? (6) 외부 AI 전송과 보존/삭제 선택을 이해했는가?

측정 설계: 과제 성공/포기율·완료 시간·오류 회복 시간·오해 수·접근성 문제를 익명으로 기록한다. 비교군·동일 과제·표본 수·시점이 없는 시간 절감/정확도 수치는 주장하지 않는다. 현재 사용자 성과와 독립 Gold는 `NOT_MEASURED/NOT_RUN`이다.

본선 전 코드/합성 소비자 검토는 통합 변경에서 확인하고, **지정 팀원들의 실제 교차 의견·사람 수락은 수행한 것으로 처리하지 않는다**. UI 수락은 #280, 추천은 #281, 학업은 #282, 비용·권리·피드백은 #283에서 담당자가 실제 결과를 남긴다. 사전 계획 이슈 종결은 이 후속 인수를 완료하거나 출시 `RELEASE_BLOCKED`를 해제하지 않는다.

---

<a id="dependency-security-operations"></a>
## Dependency security operations

> 통합 이전 경로: `docs/DEPENDENCY_SECURITY_OPERATIONS.md` · Git blob `5caa93af67b4a11859af73d8ee8a37c453d3cf0a`. 원래 내용과 운영 적용 여부는 구분한다.

### Dependency / source security controls (#378)

**Code presence is not proof of activation:** The read-only npm advisory job, Dependabot configuration and CodeQL workflow are committed, but repository security settings, alert ingestion, branch protection, private findings, actual operating images and response times need a repository administrator's separate verification. Do not claim alerts or CodeQL were enabled solely because these files exist.

#### Independent checks

1. **Lockfile SCA:** [npm-dependency-audit.yml](../.github/workflows/npm-dependency-audit.yml) uses sparse checkout; PR, main and Monday schedule; High/Critical from the checked package-lock and unavailable registry both fail. Other severities remain visible in the job report; no `npm audit fix` or lockfile mutation occurs.
2. **Dependabot suggestions:** [dependabot.yml](../.github/dependabot.yml) monitors npm and GitHub Actions. It opens proposals, never merges or deploys them automatically. Repo owner must separately check **Settings → Security & analysis → Dependabot alerts / security updates** availability, enablement and notification permissions.
3. **CodeQL:** [codeql-source-analysis.yml](../.github/workflows/codeql-source-analysis.yml) checks out *only* code and configuration (never `csv/`, `reference/`, `assets/`), runs JS/TS CodeQL, and uploads to the repository's Code scanning interface. Repo owner must verify Actions permissions/security-events write, successful run and alerts visibility; `NOT_RUN` or an upload failure is **not success**.

#### Finding triage / ownership

- Record the **package and installed lockfile version, direct/transitive scope, runtime/dev-only use, CVE or GHSA, affected execution path, fixed version, proof/reference and date** privately for sensitive findings. Avoid disclosing student data, secrets, exploit steps or private alert JSON in public issues.
- **Critical / exploitable High:** do not override failing CI just to merge. Evaluate whether the affected production path is reachable, freeze release if necessary, and prioritize a smallest compatible fix with a review PR and failing-then-passing test. Security findings require human triage; do not auto-assign by code-owner heuristics.
- **False positive, unreachable or no upstream fix:** record reviewer, time-limited exception with expiry, compensating mitigation, affected versions, responsible owner and date of review. No indefinite broad ignore, no editing `audit_dependency_vulnerabilities.mjs` to hide a finding. Escalate by private security advisory if sensitive.
- After a patch: re-run audit and impacted tests on the **exact HEAD**, review lockfile diff/license compatibility, check CodeQL; only then merge. Verify production base image, runtime policy and actual deployment separately. An npm pass is not a host/container security attestation.

#### Data boundary

The existing five tracked `csv/` originals are not scanned, copied or transmitted by these CI jobs; their **historical public exposure remains independently unresolved** ([#362](https://github.com/ot4562-glitch/HUFS-One-AI/issues/362)). Do not alter, re-encode, remove or rewrite them without an approved privacy/legal process. A sparse-checkout does not revoke any earlier public fork or download.

[Security reporting](../SECURITY.md) · [Production runtime](PRODUCTION_RUNTIME.md) · [Current status](../STATUS.md).


#### 2026-11-09 추가 의존성 갱신·검증 스냅샷

- [#406 TypeScript 7.0.2](https://github.com/ot4562-glitch/HUFS-One-AI/pull/406) → [main `4bc5968`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/4bc5968af4ef765a161ce500a796e64b9ba44d6d): 타입 검사·빌드는 TypeScript 7 CLI, 기존 JS AST 정적 감사 두 도구만 별도 `typescript-legacy`(TypeScript 5.9.3) 호환 alias로 고립했습니다. 합성 TASK-00/Chrome/PG/CodeQL/lockfile 감사 통과는 해당 버전의 테스트 사실이며 **모든 TS7 런타임/타사 프로그램 호환성 보장이나 운영 인수는 아닙니다.**
- [#405 github-script v9](https://github.com/ot4562-glitch/HUFS-One-AI/pull/405) → [main `c4628ab`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/c4628abe485b9e19dcbf4c9de01e6411cd43ad1c): 이슈 라우팅 합성 Node24 이벤트 회귀를 추가했습니다. GitHub 실제 웹훅 운영 증거는 별도 확인해야 합니다.
- [#421 CSV 기록 메타데이터 도구](https://github.com/ot4562-glitch/HUFS-One-AI/pull/421) → [main `ff0d317`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/ff0d31714fc5ebce32a7bece2a0d3369579410bb): `csv/` 디렉터리 안의 **로컬 Git 기록 메타데이터만** 세며, 다른 경로의 과거 CSV·외부 포크/클론·권리·동의는 UNKNOWN/NOT_VERIFIED입니다. 코드가 병합됐다고 실제 조사를 완료한 것은 아닙니다.

승인 강제 검사 제거 [PR #425](https://github.com/ot4562-glitch/HUFS-One-AI/pull/425)는 **필수 lockfile audit·CodeQL·보안/CSV 경계 검사를 제거하지 않습니다.** 보안 이슈 #378/#362는 실제 관리자·권리 담당 인수 전 OPEN입니다.

---

<a id="laya-cpu-spike-protection"></a>
## Laya CPU spike protection

> 통합 이전 경로: `docs/LAYA_CPU_SPIKE_PROTECTION.md` · Git blob `d1250a38b55bdeee07b8945c8a837533733e7d3a`. 원래 내용과 운영 적용 여부는 구분한다.

### HUFS One AI — Laya CPU/메모리 격리 및 안전 중단

**현재 상태:** Laya ONNX·child IPC/supervisor·스케줄/압력 방어와 Linux cgroup/systemd 관련 **안전 코드/샘플 설정**이 존재하지만 실제 승인된 NCP 호스트의 CPUQuota/RSS/OOM/p95·모델 weight/라이선스·서비스 비용·실현성은 미수락입니다. **`LAYA_ENABLED=false`/AI 기본 OFF, RELEASE_BLOCKED.**

#### 원칙

- 학생에게 보이는 API/인증·PostgreSQL/권한·원문 근거가 **Laya 실험보다 항상 우선**.
- worker는 Web/API와 같은 프로세스/동기 요청을 점유하지 않고 독립 child/process, job/queue·결과/timeout/cancel/unknown과 재시작·kill-switch를 분리.
- 실제 cgroup v2 CPUQuota/MemoryMax/MemoryHigh·OOM kill/재시작·rootless sandbox/systemd 권한, 네트워크 차단·모델 아티팩트/원본·runtime hash를 최소 권한으로 pin.
- 대기열 한도/동시성/워커 20초 안팎·준비 45초 안팎 등 설정은 **초기 보호 목표**이며 실제 4vCPU/32GB(승인된 경우)에서 CPU/RSS/p95·OS 정책 검증으로 조정.
- 실패/미승인/CPU 초과·늦은 결과/권리 철회 때 `UNKNOWN/NEEDS_REVIEW` 및 결정론 코드 fallback. API 응답 차단·무한 retry·비용 없는 새 HCX 호출/자격 확정 금지.
- 필요 없는 OCR/HCX/Vision/Laya 호출을 5슬롯 전환에 따라 무의미하게 발생시키지 않는다(100회 전환 새 LLM 호출 0 목표).

#### 검증 순서

- [ ] 합성 경계: Laya OFF, payload/schema/bounds, queue·중복/취소/late response·provider OFF·budget/권리/캐시 거부.
- [ ] 격리된 Linux test host의 실제 cgroup v2/systemd·CPUQuota/RSS/OOM·worker kill/restart·네트워크 차단·모델 hash/native 의존성/라이선스 확인.
- [ ] 사용자 사전 지출·원본/모델 이용권 승인·운영자 서명 후에만 NCP SKU에서 API p50/p95/CPU/RSS/청구·kill switch·비상 rollback을 측정.
- [ ] 정상·압력·동시 사용자·AI provider 장애에서 API 우선/보수적 fallback/개인정보 비노출을 재현하고 사람·운영자 별도 수락.

**코드 이슈:** [#253](https://github.com/minseong-hufs/HUFS-One-AI/issues/253) · **실호스트/비용 수락:** [#252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252) · [NCP 운영](OPERATIONS.md#ncp-operations-2026). 승인 없이 모델 다운로드/ON/유료 외부 호출 금지.

---

<a id="source-queue-busy-semantics"></a>
## Source queue busy semantics

> 통합 이전 경로: `docs/SOURCE_QUEUE_BUSY_SEMANTICS.md` · Git blob `e305aee0fcc0d1efd208c62a6f4d9a710343fb5b`. 원래 내용과 운영 적용 여부는 구분한다.

### #445 Source ingestion queue: busy is not empty

**Pre-NCP code review only.** No real source inventory, HTTP activity,
operator credentials, or live refresh are created by this change.

`PostgresSourceIngestionQueue.runOne()` returns two distinct, wire-local
states for the durable one-shot worker:

- `IDLE` — under the transaction lock a SELECT EXISTS query proves that
  **no PENDING job** is visible, and no live lease blocks execution.
- `LOCK_BUSY` — the process-wide PostgreSQL session advisory lock, claim
  transaction guard, a live leased worker, or `FOR UPDATE SKIP LOCKED`
  prevents a reliable claim. An unexecuted refresh **must not** claim
  successful completion, even if a previous timer tick was successful.

Crawlee's `dispatchApprovedCrawleeQueue` accepts only a verified `IDLE`
as an empty batch and treats `LOCK_BUSY` as a failed one-shot operation.
It immediately stops additional durable SQL dispatches, never retries the
potentially active external action, and redacts source/SQL/actor details.
`runApprovedRefreshWorker` catches this failure, closes the private queue
and exits unsuccessfully. NCP operator monitoring must report this generic
failure without exposing private sources.

An expired lease is already moved into durable `NEEDS_REVIEW` quarantine by
the queue: operator review is mandatory, not automatic resume or replay.

Synthetic tests: `tests/api/source-ingestion-global-lease.test.ts` and
`tools/ingestion/crawlee-approved-dispatch.node.test.mjs`.
The pinned Crawlee 3.18.2 synthetic smoke runs in the dedicated
`.github/workflows/crawlee-real-smoke.yml` workflow.

Real NCP cron/systemd execution, provider requests, worker restart after host
power loss, source rights and operator-alert acceptance remain `NOT_RUN`
and release remains `RELEASE_BLOCKED`.

---
