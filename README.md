# HUFS One AI

**한국외국어대학교 학생을 위한 근거 중심 개인화 정보·학업 지원 서비스**  
독립 학생 팀 프로젝트 · 학교 공식 서비스 또는 HUFSAbility 운영 시스템이 아닙니다.

> **현재 상태:** 합성 데이터로 실행 가능한 React 웹·Fastify API·개인화/학업 코어·PostgreSQL 통합 시험을 갖추고 있습니다. 실제 학교 계정, 공식 학사원본, NCP 운영환경, 유료 생성형 AI의 종단 검증은 아직 완료되지 않았습니다. 서비스 공개 상태는 **`RELEASE_BLOCKED`**입니다. 최신 구현/검증은 [STATUS](STATUS.md), 남은 개발은 [#253](https://github.com/minseong-hufs/HUFS-One-AI/issues/253), 실제 인수 조건은 [#252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252)에서 관리합니다.

## 1. 기획 배경

학생은 교과·비교과·장학·교외 활동·채용·학사 공지처럼 서로 다른 출처에 분산된 정보를 찾아야 합니다. 같은 공고라도 전공, 취득 학점, 관심 분야, 모집 자격, 마감 시점에 따라 의미가 달라집니다. 단순 목록 검색만으로는 **왜 나에게 관련 있는지**, **추가 자격을 확인해야 하는지**, **언제까지 무엇을 해야 하는지**를 판단하기 어렵습니다.

HUFS One AI는 기존 학생지원 서비스의 가치를 부정하거나 대체하는 대신, **출처와 조건을 확인한 개인화 탐색·학업 의사결정 보조**라는 보완점을 제안합니다. 공개 자료에서 확인한 메뉴 이름과 UI 정보구조는 참조하되, 학교 원본 코드·디자인·로그인·개인정보를 허가 없이 복제하지 않습니다.

## 2. 서비스 개요 및 차이점

<details>
<summary><strong>핵심 기능과 현재 구현 범위</strong></summary>

| 영역 | HUFS One AI의 접근 | 현재 검증 범위 |
| --- | --- | --- |
| 맞춤 기회·중요 공지 | 전공·관심·허용된 경험 신호, 자격·마감·정정·원문 근거로 정렬/설명 | 합성 공고 40건·공지 10건, 5개 가상 프로필 및 API/웹 |
| 학업·졸업 지원 | 취득·수강 중·계획 학점 분리, 전공/복수전공 What-if, 학칙 근거와 `UNKNOWN` 보류 | 버전형 RulePack·순수 코어·합성 계약; 공식 학칙/실원본 인수 전 |
| 경험·보관함·행동 계획 | 사용자가 직접 기록/수정/승인한 경험과 지원 초안·북마크를 분리 | 권한/버전 기반 API와 합성 화면 |
| 일정·시점 RAG | 학생 마감·행사·시점별 정정, SourceRevision/근거 표시 | 승인형 수집·판본·이미지/PDF 증거의 합성/격리 PG 시험 |
| 가상 동아리·심사 데모 | 관리자 게시·승인/정정/철회, 시연 데이터만 보는 REVIEWER·빈 계정 초기화 | 합성 ADMIN/BETA/REVIEWER·EMPTY_DEMO 및 브라우저 시험 |
| UI/접근성 | 독자적 상단 주요 메뉴·배너·홈 요약, 모바일 5탭, 미지원 기능 명시 | 반응형 React·Chrome E2E; 실제 스크린리더 인수 전 |

</details>

**차별점**은 추천 점수 자체가 아니라 **자격 판단의 근거, 불확실성 표시, 판본·시점 추적, 사용자 권한 분리**입니다. AI가 추천 문장이나 경험 태그의 후보를 만들더라도 학교 학칙·지원 자격·합격 여부를 확정하지 않습니다. 제공되지 않는 학교 메뉴는 **미지원**으로 표시합니다. 합성 시연 계정 5개는 실제 개인 학업 원본 제공자 4명과 별개입니다.

## 3. 생성형 AI 및 바이브코딩 활용 방식

이 프로젝트는 **AI를 제품 기능**과 **개발 생산성 도구**라는 두 층위에서 활용합니다.

**서비스의 생성형 AI 구조:** 출처별 수집·권리/동의 확인 → 원문·시간·이미지/PDF 증거 추출 → 결정론적 코드로 자격/학점·보수적 `UNKNOWN` 판단 → 필요할 때만 CLOVA OCR·HCX 기반 설명 후보 → JSON/스키마·인용·권한·예산 재검증 → 화면에 `NEEDS_REVIEW`와 근거를 함께 표시하는 방식입니다. 4개 제품 AI 작업(경험 기술 후보, 기회 조건 해석, 개인 행동 요약, 졸업 설명)을 구분합니다. **실 유료 모델 호출, 실제 기관 원본의 외부 전송과 Laya ON은 승인 전 비활성**입니다.

**바이브코딩/AI 보조 개발:** 자연어로 사용자 여정과 실패 조건을 설명한 후 생성형 AI 도구의 코드·테스트·문서 초안을 활용합니다. 사람이 TypeScript/React/Fastify/Zod·PostgreSQL/RLS·인증 경계를 검토하고, 실행 가능한 테스트·CI·PR 리뷰로 결과를 검증합니다. AI가 작성했다는 사실 자체를 품질 증명이나 사람의 독립 승인으로 세지 않습니다. 데이터 권리·비밀키·출시 의사결정은 자동 생성 결과가 아니라 승인된 담당자의 책임으로 남깁니다.

## 4. 구현 현황 및 실제 서비스 실현 가능성

**이미 코드와 자동화 시험으로 확인한 기반**은 TypeScript/Zod 공통 계약, 결정론 추천·학업 계산, React 반응형 UI, Fastify 인증/인가 경계, 분리 SQL role/실제 일회용 PostgreSQL 시험, SourceRevision/Temporal RAG, 예산/취소가 있는 AI 공급자 어댑터, NCP IaC·SSH 비공개 합성 미리보기·복구 스크립트입니다. 새 화면 구조와 홈 요약을 포함한 [UI PR #248](https://github.com/minseong-hufs/HUFS-One-AI/pull/248)은 병합했습니다.

**실서비스 전환은 기술적으로 단계적 검증이 필요합니다.** 운영 전용 조립·HTTPS/TLS·Google OIDC 및 학교메일 현재 소유 확인·최소권한 PG/백업·공식 출처 이용허가·실학생 자료별 동의·독립 사람 Gold/접근성 검수·NCP 비용과 복구 계획·최종 출시 승인을 갖춰야 합니다. 현재 합성 CI는 운영환경 검증이 아닙니다. 범위별 작업과 수락 판정은 [#253 구현](https://github.com/minseong-hufs/HUFS-One-AI/issues/253) / [#252 실인수](https://github.com/minseong-hufs/HUFS-One-AI/issues/252)로 분리합니다.

**개발용 실행** (실학생 원본·실계정·유료 API 불필요, Node.js `^22.22.2` 또는 `^24.15.0`):

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run check:privacy
npm run build:web
```

독립 빈 계정·가상 동아리 시연은 두 터미널에서 `npm run start:api:synthetic-empty-demo`와 `npm run dev:web -- --mode empty-demo`를 실행합니다. 로컬 주소와 검증 순서는 [시연 매뉴얼](docs/EMPTY_DEMO_RUNBOOK.md)에 따릅니다. 이 명령은 실제 서비스 개통이나 개인정보 반입을 수행하지 않습니다.

## 5. 기대 효과

- **탐색 비용 절감:** 학생에게 관련 있는 기회·마감·공지에 집중하고 원문으로 바로 돌아가 검증할 수 있습니다.
- **오판과 정보 누락 감소:** 자격 조건과 근거·정정/시점·공유 범위를 함께 표시하고 불명확한 결과는 판단을 보류합니다.
- **학업 계획 지원:** 취득·수강·계획 학점과 What-if를 분리하여 학생이 학과에 확인할 항목을 구체화합니다. 학교의 공식 졸업 사정을 대체하지 않습니다.
- **설명 가능한 AI 활용:** 생성형 AI의 편의와 코드 기반 검증·권리/비용 통제를 결합하는 재현 가능한 개발 사례를 제시합니다.
- **현실적 확장성:** 합성 데모 → 허가된 비공개 스테이징 → 실제 계정·출처 검수 → 정식 승인 순서로 위험과 비용을 통제할 수 있습니다.

이 효과는 **기대효과**이며 실제 사용자 만족도·절감 시간·정확도가 입증됐다는 주장은 아닙니다. 프로젝트의 공개 기능·정식 운영 여부는 [현재 상태](STATUS.md)와 [실수락 조건](https://github.com/minseong-hufs/HUFS-One-AI/issues/252)에서 확인하세요.

---

기술 설계 [Architecture](Architecture.md) · 팀 역할 [WORKSTREAMS](docs/WORKSTREAMS.md) · 개인정보/권리 [DATA_GOVERNANCE](docs/DATA_GOVERNANCE.md) · 검증 [INDEPENDENT_EVALUATION](docs/INDEPENDENT_EVALUATION.md) · 개발 규칙 [AGENTS](AGENTS.md)

---

## 6. 전체 문서 목록

각 문서의 현재 용도를 한 줄로 정리했습니다. 실제 구현·출시 여부는 [현재 상태](STATUS.md)와 연결된 검증 기록을 우선합니다.

### 프로젝트 소개·상태·설계

- [`AGENTS.md`](AGENTS.md) — 저장소 전체의 개발 규칙·책임 경계·검증 원칙.
- [`APPLICATION.md`](APPLICATION.md) — 공모전 제출 자료의 작성 항목과 사실 확인 체크리스트.
- [`Architecture.md`](Architecture.md) — 제품 아키텍처·권한·API·데이터·검증 계약의 기술 설계 기준.
- [`CLOUD.md`](CLOUD.md) — NCP 운영 배치·인증·접근 통제·보안 승인 기준.
- [`PROJECT.md`](PROJECT.md) — 서비스의 문제 정의·제품 방향·현재 제공 범위.
- [`Proposal.md`](Proposal.md) — 팀원·심사자를 위한 서비스 제안 배경과 구현·운영 계획.
- [`README.md`](README.md) — 프로젝트 소개·차별점·AI 활용·구현 현황·기대 효과를 정리한 시작 문서.
- [`REPORT.md`](REPORT.md) — 자동화 테스트와 사람·실환경 검증을 구분한 현재 평가 보고 기준.
- [`STATUS.md`](STATUS.md) — 현재 코드 구현·검증 상태와 출시 가능 여부의 기준.
- [`TEAM_SURVEY.md`](TEAM_SURVEY.md) — 학생 원본 자료·동의·공식 규칙 입력과 확인 항목.

### 서비스·시연·협업 문서 (`docs/`)

- [`docs/CONTRACT_BOUNDARIES.md`](docs/CONTRACT_BOUNDARIES.md) — 공통 TypeScript/Zod 계약과 각 소비 트랙의 책임 경계.
- [`docs/DATA_GOVERNANCE.md`](docs/DATA_GOVERNANCE.md) — 개인정보·공식 자료 이용권·동의·게시 및 외부 전송 기준.
- [`docs/DEMO_MANUAL.md`](docs/DEMO_MANUAL.md) — 가상 학생 데이터로 실행하는 기본 합성 시연 절차.
- [`docs/EMPTY_DEMO_RUNBOOK.md`](docs/EMPTY_DEMO_RUNBOOK.md) — 빈 합성 계정과 가상 동아리 관리자 시연 실행 방법.
- [`docs/GENERATED_CLUB_POSTER_20261105.md`](docs/GENERATED_CLUB_POSTER_20261105.md) — 가상 동아리 합성 포스터의 생성·파일·사용 권리 명세.
- [`docs/HUFSABILITY_UI_COMPONENT_ATLAS.md`](docs/HUFSABILITY_UI_COMPONENT_ATLAS.md) — HUFSAbility 학생 화면 76개를 관찰한 텍스트 기반 UI 구성요소 조사서.
- [`docs/HUMAN_ACCEPTANCE_GATE_20261104.md`](docs/HUMAN_ACCEPTANCE_GATE_20261104.md) — 실환경·자료 권리·비작성자 검증·출시 수락 체크리스트.
- [`docs/INDEPENDENT_EVALUATION.md`](docs/INDEPENDENT_EVALUATION.md) — 추천·포스터·시점 판단의 독립 평가 세트와 사람 검수 기준.
- [`docs/LAYA_CPU_SPIKE_PROTECTION.md`](docs/LAYA_CPU_SPIKE_PROTECTION.md) — Laya AI 워커의 CPU·메모리 격리와 안전 중단 정책.
- [`docs/NCP_OPERATIONS_2026.md`](docs/NCP_OPERATIONS_2026.md) — NCP 계정·비용·운영 책임·가동 승인 정책.
- [`docs/PR_WORKFLOW.md`](docs/PR_WORKFLOW.md) — 코드 검토·CI 확인·승인·병합의 협업 절차.
- [`docs/PRODUCT_ACTIVATION_RUNBOOK_20261105.md`](docs/PRODUCT_ACTIVATION_RUNBOOK_20261105.md) — 합성 제품에서 실제 운영 인수까지의 단계별 실행 절차.
- [`docs/REMAINING_IMPLEMENTATION_20261104.md`](docs/REMAINING_IMPLEMENTATION_20261104.md) — 아직 필요한 구현과 별도 실인수 항목의 진행 지도.
- [`docs/REVIEWER_ACCESS.md`](docs/REVIEWER_ACCESS.md) — 학교 심사자의 합성 데이터 전용 접근·초대·권한 제한 기준.
- [`docs/SERVICE_DELIVERY_PLAN.md`](docs/SERVICE_DELIVERY_PLAN.md) — 서비스 완성·승인된 배포·유지보수와 단계별 완료 조건.
- [`docs/TEAM_GUIDE.md`](docs/TEAM_GUIDE.md) — 팀원이 현재 서비스와 시연 범위를 설명하는 안내서.
- [`docs/TEAM_PROGRESS.md`](docs/TEAM_PROGRESS.md) — 팀별 담당 범위와 증거 기반 인수 진행 현황.
- [`docs/TRUSTED_RAG_MEDIA_VERSIONING.md`](docs/TRUSTED_RAG_MEDIA_VERSIONING.md) — 문서·이미지·PDF의 출처 판본·시점·검수·RAG 인용 계약.
- [`docs/UI_MENU_COVERAGE.md`](docs/UI_MENU_COVERAGE.md) — HUFS One AI 화면과 참고 HUFSAbility 메뉴의 기능 대응표.
- [`docs/WORKSTREAMS.md`](docs/WORKSTREAMS.md) — 팀원별 소유 코드·업무·공동 검수 책임 분장표.

### 웹·API·자산 문서

- [`apps/api/AGENTS.md`](apps/api/AGENTS.md) — Fastify API·인증·PostgreSQL·AI 개발의 소유권과 보안 규칙.
- [`apps/api/README.md`](apps/api/README.md) — API 서버의 모듈 구조·권한·데이터베이스·실행 및 검증 안내.
- [`apps/web/AGENTS.md`](apps/web/AGENTS.md) — React 웹·모바일 UI·접근성·시연 기능 개발 규칙.
- [`apps/web/README.md`](apps/web/README.md) — 웹 화면 경로·주요 기능·반응형 UI와 테스트 안내.
- [`apps/web/src/shell/assets/README.md`](apps/web/src/shell/assets/README.md) — 웹 배너 장식 이미지의 생성 이력·배포 권리·접근성 안내.
- [`assets/AGENTS.md`](assets/AGENTS.md) — 합성 이미지와 웹 자산의 저작권·검증·공개 기준.

### AI·공통 계약·코어 패키지

- [`packages/ai/AGENTS.md`](packages/ai/AGENTS.md) — CLOVA OCR·HCX·Laya AI 코드의 책임·안전 사용 규칙.
- [`packages/ai/README.md`](packages/ai/README.md) — 생성형 AI 네 가지 작업·OCR·HCX 계약과 사용 제한.
- [`packages/contracts/AGENTS.md`](packages/contracts/AGENTS.md) — 공통 타입·Zod 계약 변경과 소비자 교차 검증 규칙.
- [`packages/contracts/README.md`](packages/contracts/README.md) — 전체 제품에서 공유하는 API·데이터 타입·버전·권한 스키마 안내.
- [`packages/core/src/academics/AGENTS.md`](packages/core/src/academics/AGENTS.md) — 학점·졸업·학사 What-if 계산 코어의 개발·검증 기준.
- [`packages/core/src/forecast/AGENTS.md`](packages/core/src/forecast/AGENTS.md) — 과목 개설·학사 사건 전망의 근거와 불확실성 처리 규칙.
- [`packages/core/src/normalization/AGENTS.md`](packages/core/src/normalization/AGENTS.md) — 공고·관심사·TopicCode 정규화 코어의 구현 규칙.
- [`packages/core/src/notices/AGENTS.md`](packages/core/src/notices/AGENTS.md) — 학생별 중요 공지의 적용 조건·출처·시점 판단 규칙.
- [`packages/core/src/opportunities/AGENTS.md`](packages/core/src/opportunities/AGENTS.md) — 기회 추천·지원 자격·순위·판본 판단 코어의 개발 규칙.
- [`packages/core/src/opportunities/README.md`](packages/core/src/opportunities/README.md) — 기회 추천 순수 함수와 API 호출 전 권한·근거 검증 조건.
- [`packages/core/src/privacy/AGENTS.md`](packages/core/src/privacy/AGENTS.md) — 동의·공유 권한·자료 전송·철회에 관한 순수 정책 구현 규칙.
- [`packages/fixtures/AGENTS.md`](packages/fixtures/AGENTS.md) — 합성 테스트 자료의 생성·보관과 실제 학생 자료 반입 금지 기준.
- [`packages/ui/AGENTS.md`](packages/ui/AGENTS.md) — 공용 UI 컴포넌트·접근성·자산 사용 규칙.

### 인프라·배포

- [`infra/AGENTS.md`](infra/AGENTS.md) — NCP IaC·서버 배포·AI 워커의 개발 소유권과 실행 제한.
- [`infra/ai/PDF_RUNTIME.md`](infra/ai/PDF_RUNTIME.md) — 비공개 PDF 렌더링·OCR·페이지 근거 추출 런타임 안내.
- [`infra/ncp/AGENT_DEPLOYMENT_MANUAL.md`](infra/ncp/AGENT_DEPLOYMENT_MANUAL.md) — 개발 에이전트가 NCP 인프라 코드를 안전하게 검토·배포하는 절차.
- [`infra/ncp/OPERATIONS_HANDOFF_TEMPLATE.md`](infra/ncp/OPERATIONS_HANDOFF_TEMPLATE.md) — NCP 운영자의 승인·비용·배포·복구 증거 인수 양식.
- [`infra/ncp/QUICKSTART.md`](infra/ncp/QUICKSTART.md) — NCP 비공개 합성 미리보기와 적용 전 계획 점검 절차.
- [`infra/ncp/README.md`](infra/ncp/README.md) — NCP 네트워크·호스트·배포·복구 자동화 종합 안내.
- [`infra/ncp/terraform/host/README.md`](infra/ncp/terraform/host/README.md) — NCP Ubuntu 호스트 Terraform 모듈의 사전 검증과 승인 조건.
- [`infra/ncp/terraform/network/README.md`](infra/ncp/terraform/network/README.md) — NCP VPC·서브넷·방화벽 Terraform 모듈의 계획 및 검증 안내.

### 참고 자료·심사자 양식

- [`reference/hufsability/DATA_PERMISSION_GATE.md`](reference/hufsability/DATA_PERMISSION_GATE.md) — HUFSAbility 및 학생 자료의 수집·활용·재배포 권한 구분.
- [`reference/hufsability/INVENTORY.md`](reference/hufsability/INVENTORY.md) — HUFSAbility 공개 기능·학생 메뉴·조사 범위의 출처 목록.
- [`reference/ncp/COST_AND_ARCHITECTURE.md`](reference/ncp/COST_AND_ARCHITECTURE.md) — NCP 배치 구조·비용 후보·운영 책임과 승인 검토 기준.
- [`reference/ncp/SERVICE_CATALOG.md`](reference/ncp/SERVICE_CATALOG.md) — 제품에 필요한 NCP 서비스 후보와 보류·제외 기준.
- [`reference/reviewer/ReviewerInvitation.TEMPLATE.pdf`](reference/reviewer/ReviewerInvitation.TEMPLATE.pdf) — 학교 심사자를 위한 비활성 예시 초대장 PDF 양식.

### 검증·도구·GitHub 템플릿

- [`.github/ISSUE_TEMPLATE/agent-task.md`](.github/ISSUE_TEMPLATE/agent-task.md) — 에이전트 작업 이슈의 담당 범위·완료 조건·검증 증거를 작성하는 양식.
- [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md) — PR 변경 내용·권한 영향·테스트·리뷰 결과를 점검하는 양식.
- [`tests/AGENTS.md`](tests/AGENTS.md) — 합성·PG·Chrome·NCP 모의 시험과 실제 인수의 구분 원칙.
- [`tools/README.md`](tools/README.md) — API 계약·의존성·배포 산출물의 감사 도구 사용 안내.
