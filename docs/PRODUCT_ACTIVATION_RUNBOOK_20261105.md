# HUFS One AI — 기능 시연 → NCP 스테이징 → 실서비스 활성화 실행 런북
> 기준: 2026-11-05 KST. **자동으로 전체 제품을 활성화하는 명령서는 아니다.** 현재 검증된 기능을 로컬에서 그대로 재현하고, 승인된 실제 NCP 환경에서 부족한 구현/보안/인적 인수를 단계별로 채우는 현장 체크리스트다. 최종 출시 상태는 **RELEASE_BLOCKED**, 유료 AI/Laya 기본 OFF. 실제 허가, 결제, 서버 접근과 비작성자 승인 기록을 이 문서가 대신하지 않는다.
>
> 실행 티켓: [#222 NCP/제품 활성화](https://github.com/minseong-hufs/HUFS-One-AI/issues/222) · [#221 인적·원본·접근성 인수](https://github.com/minseong-hufs/HUFS-One-AI/issues/221) · [#89 릴리스/보안](https://github.com/minseong-hufs/HUFS-One-AI/issues/89) · [#12 NCP 운영](https://github.com/minseong-hufs/HUFS-One-AI/issues/12) · [#46 개인정보](https://github.com/minseong-hufs/HUFS-One-AI/issues/46). 위 상대 이슈 링크 대신 실제 GitHub 정본은 파일 하단의 절대 링크 참고.

## 0. 용어·범위 — 무엇이 바로 되고, 무엇은 아직 안 되는가

**합성 테스트 통과 ≠ 운영 서버에서 전 기능 이용 가능.** 실제 main은 `APP_ENV=production` 등 운영 모드에서 기동을 거부하도록 설계되었다. PR #216/#219/#220은 운영을 위한 자동화·연결 코드를 상당 부분 구현했지만, **전체 production composition root / 검증된 TLS·Google·PG·NCP 배포 자동 전환이 완료된 것은 아니다.** `RELEASE_BLOCKED` 또는 운영 차단 가드를 단순 환경변수·패치로 해제하지 않는다.

| 기능/여정 | 현재 실행 가능한 정도 | 운영에서 남은 것 |
| --- | --- | --- |
| 가상 5프로필·맞춤 공고40·학사공지10·개인화/근거·상태 배지 | 로컬 합성 브라우저/순수 코어 및 일부 API 검증 | 권리 있는 최신 자료·실계정·독립 품질평가 |
| 빈 계정 EMPTY_DEMO: 전공·0/미입력 학점·관심·이중전공·저장·A→B·RESET | **로컬 loopback** UI/API+Chrome, 별도 일회용 실제 PostgreSQL 시험 | 운영 역할/영속 PG/재시작/접근성·비작성자 인수 |
| 북마크·경험 초안/overlay·검색·계획·알림 **설정**, 일정 | 합성 저장/계산·화면 여정 | 실계정 영속화·실원본·실 알림 전송은 별도 |
| 가상 동아리 ADMIN 생성·승인/수정/철회, BETA 목록/추천·AI 생성 PNG | 로컬 합성 구현·인가 URL/PNG/Chrome·격리 PG 회귀 | 실 관리자/기기 인수. **실동아리 게시 권한 없음** |
| 졸업/복수전공/What-if/수강계획 | 코어+합성 RulePack/원장·보수적 UNKNOWN | 공식 규칙·학년도·문서 SHA·실 4명 결과 대조 |
| 네 AI 작업·출처/인용, 이미지/PDF, OCR·HCX·Laya | 안전한 계약/모의·로컬 일부 추출/검증. **유료 공급자 경로 OFF** | 실제 허용 원본·provider 이용권/할당량·품질/비용/운영 측정 |
| Google 로그인·외대 메일/OTP·REVIEWER 초대, 영속 PG | 인증/DB 구성 요소와 합성 검증 코드 | 실제 OIDC/메일·운영 SQL TLS/역할·세션/초대/철회 인수 |
| 실제 학교 공고·4인 원본·공개 HTTPS 서비스 | **금지/보류**. 기존 동의·HUFSAbility 수집 허가는 문서에 기록됨 | 목적별 최신 권한·계정대응·Git history 감사·학교 규칙·출시 승인 |
| 실제 지원·푸시 알림·학교 공식 SSO·관찰된 76개 기존 화면 전부 | **구현/인가 범위 밖 또는 🚫 미지원** | 기능별 별도 구현/이용 허가. 서버 개통만으로 생기지 않음 |

**실행 결과 표기:** `PASS`(이번 SHA/환경에서 직접 성공), `FAIL`, `HOLD`(승인/정답 미비), `NOT_RUN`, `SYNTHETIC_ONLY`를 섞지 않는다. HTML_ONLY 합성 조건 recall 27/49=55.1%는 목표 90% 통과가 아니며, 실제 OCR/HCX 결과로 설명하지 않는다.

## 1. 공통 시작: 안전한 코드·환경

1. 저장소 루트에서 [AGENTS](../AGENTS.md), [README](../README.md), [STATUS](../STATUS.md), [인적 인수서](HUMAN_ACCEPTANCE_GATE_20261104.md)를 읽고, 최신 `main` 커밋 40자리 SHA와 **그 SHA의 CI/Chrome/PG 실행 결과**를 기록한다. 과거 검증 SHA `8eb7730a100bafe5514d1dddedd88144ed60b3e2` 및 merge `d4d6874c6d59929cdabb6a0e74adccb9eeb1ef69`은 참고 기준선이지 언제나 최신 HEAD라는 의미가 아니다.
2. **원본 보호 파일을 재추적하거나 통째 복사하지 않은** 승인된 작업 checkout을 사용한다. 다른 사람이 수정 중인 dirty worktree, 개인 원본·credential 폴더에 `reset/clean` 또는 ZIP/동기화를 하지 않는다.
3. **Node.js ≥22.22.2(22.x) 또는 ≥24.15.0(24.x)**, npm, 필요한 브라우저를 사용한다. 필요하다면 새 승인 checkout에서 다음 순서로 검증한다. 실제 파일/키/학생 기록을 외부 네트워크·CI에 보내지 않는다.

```sh
node --version
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run check:privacy
npm run assets:check
```

- `npm run check:privacy`가 **FAIL**이면 중지하고 #46에 민감 데이터를 노출하지 않는 요약만 기록한다. 기존 Git 과거 커밋/clone 권한은 단순 현재 파일 트리 검사로 통과시키지 않는다.
- `npm ci`와 `npm run check`는 **네트워크/의존성 설치와 검사**를 수행할 수 있다. 사용자·운영자가 승인한 로컬 개발 환경에서만 실행하며, 새로운 NCP 자원이나 유료 API 사용을 의미하지 않는다.
- 운영 모드 보호 오류, 미지원 엔트리포인트, 불일치 SHA, 권한 거절은 **중지 사유**이지 명령을 바꿔 강행할 이유가 아니다.

## 2. 로컬에서 **지금 사용 가능한** 합성 기능 전체 흐름 (NCP 비용 0)

이 절은 **서버가 시작된 관리 PC의 127.0.0.1**에서만 동작한다. 실학생 원본·학교 계정·외부 AI를 연결하지 않는다. 충돌을 피하려면 **2A와 2B를 동시에 실행하지 않는다.** 각 모드마다 API/Web 두 터미널이 필요하며, 포트가 이미 점유되었으면 기존 프로세스의 소유를 확인한 뒤 중단하거나 별도 개발 환경을 사용한다.

### 2A. 합성 계정 5개 / 주요 제품 메뉴

**터미널 A**
```sh
npm run start:api:synthetic-accounts
```

**터미널 B**
```sh
npm run dev:web -- --mode synthetic
```

로컬 브라우저: `http://127.0.0.1:5173/local-demo`

1. SYNTHETIC 표시와 실제 학업 원본 4인·REVIEWER 계정 분리를 확인한다.
2. 5개 가상 프로필에 대해 같은 40개 공고·10개 공지의 추천 정렬, 우대/필수/수료, 시간·정정·출처, 개인 마감·달력의 변화를 확인한다.
3. 경험·북마크·알림 설정·학업/수강계획·진로 안내에서 저장·조회·취소·계정전환 및 `UNKNOWN`/`NOT_SHARED`/`🚫 미지원` 구분을 기록한다.
4. 외부 지원 버튼은 `DEMO_DISABLED`이고 실제 신청/메일/푸시가 아님을 확인한다. 시연 세부 동작은 [DEMO_MANUAL](DEMO_MANUAL.md)을 따른다.

### 2B. 독립 EMPTY_DEMO + 가상 동아리/ADMIN (가장 완전한 통합 데모)

2A API/웹 터미널을 종료하고 새 두 터미널에서 실행한다.

**터미널 A**
```sh
npm run start:api:synthetic-empty-demo
```

**터미널 B**
```sh
npm run dev:web -- --mode empty-demo
```

**학생 BETA 브라우저 A:** `http://127.0.0.1:5173/api/dev/empty-demo/bootstrap` → `/demo-profile`

**관리자 ADMIN 브라우저 B(반드시 별도 브라우저 프로필/시크릿):** `http://127.0.0.1:5173/api/dev/synthetic-clubs/bootstrap` → `/clubs/admin`

- BETA: 주전공/이중전공/관심/학점 `0`으로 저장→추천 상세/인용/UNKNOWN→다른 전공/관심으로 변경→다시 계산→경험 DRAFT 및 선택 overlay→북마크/검색·수강계획/알림/달력→RESET 확인/취소→재확인/종료. 학점 `null`과 `0`을 구분한다.
- ADMIN: `SYN-CLUB-090` 등 가상 글을 **검토 대기**로 생성→승인→BETA의 `/clubs`/상세에서만 노출 확인→정정/재승인/철회→비승인 상태의 직접 포스터 URL은 거부 확인. BETA에 ADMIN 권한이 없는지 확인한다.
- 실제 PNG는 1672×941 / 1,528,702 bytes이며 SHA-256 `93446df5cc9a2859585e4801df7a74b7f602d71ae8084a4a51f5b563855af842`다. 2MiB hard limit 내, 1MiB 선호 상한 **초과**. 로컬에서 새 AI 이미지를 생성하거나 비용을 청구하지 않는다.
- 두 프로필이 아닌 같은 브라우저에서 관리자/학생 bootstrap을 오가면 쿠키가 교체되니 **권한 확인 시 이전 화면을 가리고** 새로 연다. 두 BETA 슬롯 비교는 `?slot=B`와 별도 프로필을 사용한다.
- **로컬 server는 메모리 저장소:** 재시작하면 상태가 사라진다. 이는 운영 PostgreSQL 지속성 PASS가 아니다. 실제 저장 영속성은 별도 PG 통합 시험 결과만 인정한다.

검증 후 (각 명령의 독립 실행 결과를 저장):

```sh
npm run test:e2e:empty-demo
node tools/evaluation/run.mjs fixtures --action check
```

자동 E2E는 자체 포트를 사용하므로 3000/5175 점유·Chrome 설치 상태를 먼저 확인한다. 360px/키보드/권한 회귀 증거가 되지만 **별도 사람 스크린리더/발표 PASS로 승격하지 않는다.** 전체 시연 순서와 60초·10분 목표는 [EMPTY_DEMO_RUNBOOK](EMPTY_DEMO_RUNBOOK.md)에 있다.

## 3. 독립 품질 및 실제 원본 인수 — **NCP 없이 진행 가능**

### 3A. 추천 200건 + 포스터20·시간12 검수 (#221/D01)

```sh
npm run build:contracts
npm exec -- tsc -p tools/evaluation/tsconfig.json
node tools/evaluation/run.mjs fixtures --action check
node tools/evaluation/run.mjs export --head <검토_대상_40자리_SHA> --out local_only/evaluation/review-run-001
```

새 `local_only` 출력에서 `recommendation/review.html`·`media/review.html`과 원문을 **실제 비작성자**가 확인·수정·서명해야 한다. 검토자 identity/Ed25519 권한 pin/append-ledger 및 정답 비교는 [INDEPENDENT_EVALUATION](INDEPENDENT_EVALUATION.md)에 정의됐다. 검토하지 않은 자료에 REVIEWED 시각·실명 서명·gold 판정을 만들지 않는다. **인적 카운트 현재 0/200, 0/32**. AI 리뷰는 `AI_ASSISTED`로 별도 보관해 품질 피드백으로 활용할 수 있지만 `HUMAN_REVIEW`로 표시하지 않는다.

### 3B. 실 4인 원본·공식 학사 규칙 (#221/#46/#11)

- 공모전 5명 참여 동의·HUFSAbility 자료 수집 허가 및 실원본 4명의 기존 목적별 동의 **확인 기록은 보존**한다. 다만 최초 Git 게시/clone의 접근 권한, 현재 철회·보관 기한, NCP 저장·모델 전송·발표 허용 범위를 **원본별**로 별도 제한 등록부에서 검증한다.
- 실제 6열 과목 CSV 4개 / 통합 26열 Forms(4응답)의 SHA·소유자↔actor·alias·중복·입학/전공/과정/코호트·학점/중복인정의 수기 대조는 **권한 있는 개인 로컬 영역**에서만 수행한다. 박준영은 실제 4인 원본 제공자가 아니다.
- 공식 RulePack의 문서별 SHA·학년도/대학/전공·언어속성·선수/중복/그룹 규칙, WIS 시간표의 판본과 허가를 검토한다. 검증 불가 팩은 `DRAFT/UNKNOWN_APPLICABILITY`를 유지한다.
- 제품의 restricted intake `plan/preview/apply`는 current owner/purpose/receipt·CAS/rollback 경계가 있는 **비공개 승인 factory** 경로다. 단순 HTTP public upload, 원본 Git 재게시 또는 편의상 staging DB 임의 삽입을 사용하지 않는다. 새 실제 적용은 각 원본별 인가·승인 서면 증거와 별도 실행 계획이 없으면 **NOT_RUN**으로 둔다.

## 4. NCP 실계정 전: **계획 전용(preflight, 실제 비용 없음)**

담당: **심민성 = 소프트웨어/IaC/스크립트**, **이서연 = NCP 비코드 계정·요금·서버·청구 영수증**, **최종 사용자 = 지출·공개 허가**. 이 문서 작성 자체는 NCP 사용 허가가 아니다.

Windows PowerShell 관리 PC, 승인된 checkout 루트:

```powershell
New-Item -ItemType Directory -Force local_only | Out-Null
node infra/ncp/setup/00-preflight.mjs --example |
  Set-Content local_only/ncp-setup.json -Encoding utf8
Get-Content local_only/ncp-setup.json -Raw |
  node infra/ncp/setup/00-preflight.mjs --plan
```

**예시는 합성값이므로 실제 서버 지시가 아니다.** 운영자는 승인된 실제 SKU·온디맨드/VAT/CB·공인 IP·트래픽·크레딧·서비스 쿼터·운영자 IPv4/32·비충돌 CIDR·승인 SHA를 비공개 `local_only` 파일에 입력하고 plan digest·예상 비용·반납 책임을 검토한다. `--plan`은 리소스를 만들지 않는다. 공급자 가격/지원 SKU는 **개통일 NCP 콘솔에서 재확인**한다. 승인이 없으면 이 단계에서 중지한다.

```sh
node --test tests/security/ncp-setup-plan.test.mjs
```

기존 정본 [NCP QUICKSTART](../infra/ncp/QUICKSTART.md), [운영 실무 가이드](../infra/ncp/README.md), [비용/권한 정본](NCP_OPERATIONS_2026.md), [인수 양식](../infra/ncp/OPERATIONS_HANDOFF_TEMPLATE.md)에 따른다.

## 5. NCP **비공개 합성 미리보기** — 별도 유료 운영 승인 후에만

### 개통 순서와 인수 영수증
1. NCP 실제 계정/IAM, 한국 리전·정확한 Ubuntu amd64 서버 SKU/CB/공인 IP·KRW/h·VAT·크레딧 잔고·API 이용권을 **운영자와 최종 사용자가 승인**. 지출 상한/실측/중단·반납자를 정한다. 본선 여부나 특정 개통일은 확정 승인이 아니다.
2. VPC/subnet/route/IGW와 ACG·stateless NACL·Ubuntu UFW를 **각각** 확인한다. SSH 22는 **승인된 관리자 공인 IPv4/32만**, 외부 3000/5173/5432/6379/9229/3389 차단. 공개 80/443은 릴리스 승인 전 **차단**. 직접 공인 IP·IPv6·preview·도메인 우회는 별도 시험.
3. NCP 서버 초기 관리자 인증키와 관리자 개인 SSH 키를 구별한다. 실제 private key/password/host 주소는 Git·챗·CI·Issue에 올리지 않는다. 기존 [README](../infra/ncp/README.md)의 bootstrap→새 SSH 키로 **독립 세션 성공**→root/password SSH 차단 순서를 따른다.
4. **검증한 Git SHA의 합성 데이터만 허용목록 ZIP**으로 패키징(`Prepare-NcpPreview.ps1`), 기존 허용 프로토콜 SFTP/SSH에서 **127.0.0.1:5173** systemd 미리보기 구동. 운영 PC의 SSH 로컬 터널로만 접속한다. 명시적 전송/실행 모드 `Deploy-NcpPreview.ps1 -Apply`는 **승인 후에만**, 처음에는 동일 스크립트의 **plan 전용**을 확인한다.
5. 실제 서버의 SSH host fingerprint·app SHA/ZIP SHA·IP/포트·CPU/RSS/p95·부팅/재시작·헬스·last-good rollback·DB/스토리지·요금·반납 영수증을 작성한다. 실패하면 신규 공개/실학생/유료 provider 활성화로 넘어가지 않는다.

**이 단계에서 가능:** SSH 터널 전용 **합성 화면**의 서버 기동·복구·비용/CPU 실측. **불가:** 운영 Google/실원본/유료 OCR/HCX/외부 공용 도메인. 프리뷰 성공으로 실서비스 READY 표기 금지.

## 6. NCP 스테이징에서 **제품 전 기능(허가된 구현 범위)** 활성화까지의 미완료 구현/검증

현행 앱의 production 차단 경로를 우회하지 않는다. **다음 항목은 현재 코드·CI·권한/공급자 환경을 확인하여 부족하면 별도 PR로 실제 구현해야 한다.** 따라서 **이 런북만으로 모든 향후 기획 메뉴가 활성화된다는 보장은 없다.** 각 PR은 현재 main에 rebase, 소유자 분리·비작성자 APPROVED·동일 SHA CI 후 병합한다.

| 작업 | 선행/실제 인수 | 성공 조건 |
| --- | --- | --- |
| 정식 운영 composition/entrypoint·이미지 빌드·비공개 migration | #89, #27, #222 | 더미 인증 제거, 운영 아닌 주소로의 우회 실패, 정확한 릴리스 SHA 재현·rollback |
| 도메인/DNS/TLS, Nginx/LB/WAF/Global Edge KR whitelist, 원본 IP/IPv6/preview 차단 | #12, #89 | 미로그인 HTML/JS/API/스토리지까지 차단, 직접 IP 우회 없음, HTTPS·host·cache 검증 |
| 실 Google OIDC/PKCE/JWKS + 외대 메일 현재 소유/OTP + BETA/ADMIN/REVIEWER | #27, #222 | 독립 실계정 교차 401/403/409/429/503, CSRF, 초대 만료·철회 및 재로그인 금지 |
| PostgreSQL 운영 TLS·기본 7역할/활성 확장 RLS, migration·owner 재시작 영속성·백업 복원 | #27, #89 | 실제 권한 격리, 다른 사용자 직접 SQL 접근 거부, CAS/RESET, 장애→last-good 재현 |
| 공고/추천/공지/경험/북마크/캘린더/전공·졸업·What-if/계획/동아리/REVIEWER | #221, #222 | **UI→API→PG** 역할·시점·수정·UNKNOWN·철회·동시탭 전체 여정별 PASS 로그 |
| 실제 한국외대 RulePack/WIS·실 4인 원본 | #221, #46, #11 | 현재 원본별 consent/권리+actor receipt 및 4인 수기 대조; 미승인=NOT_SHARED |
| 실제 허용 이미지/PDF·OCR/HCX-005/007·출처 인용, Laya 선택 동작 | #20, #221, #222 | 별도 이용 허가/사용자 예산 승인, 조건 recall·bbox/시점/출처·false eligible, quota·429/503·token/KRW·Laya OFF 대비 |
| 전기능 모바일/스크린리더/접근성·부하/복구·청구, 비작성자 QA | #221, #222, #89 | 각 기능 PASS/FAIL/HOLD/NOT_RUN 분리, 예산/CPU/RSS/p95·데이터 최소화·복구 성공 |

**사람 수락 조건은 사람이 수행:** #221의 200 추천 인적 gold·32 미디어 인적 gold, 스크린리더 기기 검수, 실제 4인/기관 원본의 최신 이용범위·학교 공식 학칙 판본은 AI mock/코드 검사/운영 서버 기동으로 자동 해결되지 않는다. **실제 지원 제출, 푸시 발송, 공식 HUFS SSO, 원래 76개 화면을 그대로 쓸 권한/구현**은 본 제품의 확인된 구현 범위가 아니므로 허가·추가 코드 없는 한 사용 불가다.

## 7. 최종 출시 판단 및 안전한 중단·복구

- **GO 전제:** #221 인적/권리/실원본, #46 Git 개인정보, #12 실제 NCP 운영, #89 보안/출시, #222 전 기능 스테이징의 *모든 적용 필수 체크박스*가 민감정보 없는 증거와 함께 완료되고 별도 최종 **D03 서면 승인**이 있어야 한다.
- **NO_GO:** 프로그램 단순 실행 성공·AI 116 PASS·GitHub CI 성공·비공개 preview·가짜 AI 결과·유료 크레딧 존재만으로 배포를 공개하면 안 된다. fail-closed 상태에서 차단 유지.
- **rollback:** 승인된 last-good SHA, server+DB 상태, 민감 로그 보호, 퇴행 기능/보안/비용 이상 시 해당 릴리스 중단 및 운영자 복구 판단. 롤백이 개인정보 동의 철회 기록을 복원/재노출하면 안 된다.
- **유지보수:** 운영 승인 이후 OS/Node/의존성 패치·SSH/AI키 회전·세션 철회·backup/restore·에러/요금·반납 영수증, 원본 수정/삭제·정정 반영과 비용 hard-stop 주기 점검.

## 8. 증거 제출 템플릿 (실제 작업 후 해당 후속 이슈에 댓글)

```text
대상: #221 | #222, 기능/Phase:
정확한 main SHA, GitHub Actions URL:
환경: LOCAL_SYNTHETIC | NCP_PRIVATE_PREVIEW | NCP_STAGING | PRODUCTION
계정/운영 승인 증거 ID(키·개인자료 제외):
원본 권리/검토자 승인 증거 ID(개인자료 제외):
실행 명령 / 입력은 합성인지 허가 자료인지:
검증한 UI→API→DB→인용/권한/수정·RESET:
실제 관측 PASS / FAIL / HOLD / NOT_RUN:
브라우저·스크린리더 / CPU·RAM·p95 / token·KRW:
복구 / rollback / 미지원 기능·잔여 위험:
비작성자 인간 검토자·서명 시각(실제로 있을 때만):
D03 최종 출시 결정: NO_GO(기본) | GO(승인 증거 링크 필요)
```

**관련 정본:**
- [기능/검증 현황](../STATUS.md), [사람/실원본 인수 #221](https://github.com/minseong-hufs/HUFS-One-AI/issues/221), [실 NCP 활성화 #222](https://github.com/minseong-hufs/HUFS-One-AI/issues/222)
- [실제 NCP/공개 보안 #89](https://github.com/minseong-hufs/HUFS-One-AI/issues/89), [NCP 운영/비용 #12](https://github.com/minseong-hufs/HUFS-One-AI/issues/12), [과거 개인정보/권리 #46](https://github.com/minseong-hufs/HUFS-One-AI/issues/46)
- [기존 합성 시연 상세](EMPTY_DEMO_RUNBOOK.md), [평가 CLI/인적 서명](INDEPENDENT_EVALUATION.md), [승인 인수서](HUMAN_ACCEPTANCE_GATE_20261104.md), [NCP Quickstart](../infra/ncp/QUICKSTART.md), [NCP 운영](NCP_OPERATIONS_2026.md)
