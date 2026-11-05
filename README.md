# HUFS One AI

**한국외국어대학교 학생의 기회 탐색·경험 기록·학업 계획을 근거와 연결하는 독립 학생 프로젝트입니다.** 학교 공식 행정 시스템이나 공식 졸업 사정을 대신하지 않습니다.

프로젝트 소유자가 문서상 자료·개인정보·기관·공유/게시·클라우드/모델·운영 승인을 모두 완료했다고 확인했습니다. 현재 승인 상태는 **`OWNER_CONFIRMED_APPROVED`**입니다. 실제 구현·자격증명 구성·시험·배포 여부는 [STATUS](STATUS.md)에서 별도로 관리합니다.

## 1. 기획 배경

학생에게 필요한 교과·비교과·장학·진로/채용·학사 공지는 여러 출처에 흩어져 있습니다. 같은 정보도 전공·이수 상태·관심·경험·마감에 따라 의미가 달라집니다. HUFS One AI는 학생이 무엇을 확인하고 다음에 어떤 행동을 선택할지, 원문과 개인 조건을 함께 보여 주는 서비스를 지향합니다.

## 2. 서비스 개요 및 차이점

맞춤 기회·공지/달력, 경험 기록과 학생이 승인한 역량 태그, 보관함·행동 계획, 취득/수강/계획 학점·전공 What-if를 연결합니다. 추천 점수를 합격률로 표현하지 않고 지원 자격과 관심 적합성, 확정 사실과 미확인 근거를 분리합니다. SourceRevision과 시점별 근거를 보존하고 개인 정보는 로그인한 사용자와 권한에 맞게 제공합니다.

기존 HUFSAbility의 기능을 전부 대체하거나 실제 연동이 없는 메뉴를 지원한다고 주장하지 않습니다. 독립 React UI의 넓은 화면 8개 주요 메뉴·모바일 5탭, 홈 요약·합성 REVIEWER/EMPTY_DEMO와 실제 사용자 경로를 구분합니다. 경험 기반 커리어 기능은 경험 사실→AI 후보→학생 확인→추천 활용의 단계로 구성합니다.

## 3. 생성형 AI 및 바이브코딩 활용 방식

서비스 AI는 경험 기술 후보, 공고 조건 해석, 개인 행동 요약, 졸업 설명의 네 작업을 다룹니다. 원문·이미지/PDF·시점 근거와 사용 권한을 연결한 뒤 필요한 OCR/HCX 결과를 구조화하고 JSON/인용·숫자/날짜·예산/취소 조건을 검증합니다. AI가 학칙·실제 활동·지원 적격·취업 성과를 임의 확정하지 않습니다. 승인된 실제 정보를 처리하는 것과 비밀키·타인 자료를 무분별하게 노출하는 것은 다릅니다.

개발에서는 자연어 요구와 반례로 코드·테스트·문서 초안을 만들고 실제 TypeScript·React·Fastify·SQL을 검토합니다. 회귀 테스트를 먼저 실패시키고 구현 후 CI로 확인하는 방식으로 AI 보조 개발 결과를 검증합니다. 모델이 생성한 초안·자체 리뷰를 독립 사람의 품질 측정으로 소개하지 않습니다.

## 4. 구현 현황 및 실제 서비스 실현 가능성

React/Vite, Fastify/Zod, 개인화·학업 순수 코어, SQL role/RLS·영수증/CAS, Source/RAG·AI 예산·NCP 자동화 기반이 존재합니다. 민성 담당 [PR #264](https://github.com/ot4562-glitch/HUFS-One-AI/pull/264)는 **운영 API·관리형 DB/AI 역할·What-if의 승인 자료 로더**, 경험/포트폴리오·복수 경험 선택, 외부 검토 기반 AI 입력 등록 및 학생의 AI 후보 검토 API를 연결합니다. 모델 후보는 학생이 명시적으로 선택하기 전에는 역량 인증이나 추천 입력으로 취급하지 않습니다. 실제 접속 주소·Google/메일·CA TLS DB 역할·공급자 자격증명은 서버에 구성되어야 합니다.

승인은 완료 상태로 처리합니다. 실제 환경이 아직 설정되지 않았다면 `CONFIGURATION_REQUIRED`, 시험을 수행하지 않았다면 `NOT_RUN`으로 표시하며, 승인 완료만으로 배포 성공이나 정확도 성과를 만들지 않습니다. 소유권·세션/CSRF·비밀키 보호·삭제/철회는 운영 기능의 일부로 유지합니다.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run build:api
npm run build:web
```

운영용 앱은 [PRODUCTION_RUNTIME](docs/PRODUCTION_RUNTIME.md)의 명시적 구성과 실행 절차를 사용합니다. 로컬 합성 계정 서버를 실사용자 인증으로 대체하지 않습니다.

## 5. 기대 효과

관련 있는 공고·마감을 찾는 비용을 줄이고, 경험을 설명 가능한 기록으로 정리하며, 학업·진로 계획에서 확인해야 할 근거를 명확히 할 수 있습니다. 코드 기반 판단과 생성형 AI 후보를 분리하여 오판·비용·권한 문제를 관리하는 개발 사례를 제공합니다. 시간 절감·추천 정확도·학생 만족도 향상은 실제 측정 전에는 기대효과로만 표현합니다.

**현재 작업:** [#253 구현](https://github.com/ot4562-glitch/HUFS-One-AI/issues/253), [#257 경험 API](https://github.com/ot4562-glitch/HUFS-One-AI/issues/257), [#252 실행 검증](https://github.com/ot4562-glitch/HUFS-One-AI/issues/252).

## 6. 전체 문서 목록

문서별 기술 범위와 구현을 구분합니다. 현재 프로젝트 승인 상태는 [AUTHORIZATION](docs/AUTHORIZATION.md), 실제 코드·실행 상태는 [STATUS](STATUS.md)를 기준으로 합니다.

### 프로젝트 소개·상태·설계

- [AGENTS.md](AGENTS.md) — 전체 개발 규칙·소유권·검증 원칙.
- [APPLICATION.md](APPLICATION.md) — 공모전 제출과 사실 확인.
- [Architecture.md](Architecture.md) — A00–A19 기술·데이터·권한 계약.
- [CLOUD.md](CLOUD.md) — 실제 클라우드 구성·인증·접근 통제.
- [PROJECT.md](PROJECT.md) — 문제 정의와 제품 범위.
- [Proposal.md](Proposal.md) — 팀원용 서비스 제안과 계획.
- [README.md](README.md) — 기획·차이점·AI 활용·구현·기대효과.
- [REPORT.md](REPORT.md) — 테스트와 사람/실환경 결과 보고.
- [STATUS.md](STATUS.md) — 현재 구현·구성·검증.
- [TEAM_SURVEY.md](TEAM_SURVEY.md) — 학생 원본 입력·내용 확인.

### 서비스·시연·협업

- [AUTHORIZATION](docs/AUTHORIZATION.md) — 소유자가 확인한 승인 완료와 실제 검증 구분.
- [PRODUCTION_RUNTIME](docs/PRODUCTION_RUNTIME.md) — production 구성·진입점·실행 명령.
- [CONTRACT_BOUNDARIES](docs/CONTRACT_BOUNDARIES.md) — 공통 계약과 소비자 범위.
- [DATA_GOVERNANCE](docs/DATA_GOVERNANCE.md) — 승인된 데이터 처리·사용자별 보호.
- [DEMO_MANUAL](docs/DEMO_MANUAL.md) — 합성 시연 실행.
- [EMPTY_DEMO_RUNBOOK](docs/EMPTY_DEMO_RUNBOOK.md) — 빈 계정·가상 동아리 시연.
- [GENERATED_CLUB_POSTER](docs/GENERATED_CLUB_POSTER_20261105.md) — 합성 이미지 명세와 근거.
- [HUFSABILITY_UI_COMPONENT_ATLAS](docs/HUFSABILITY_UI_COMPONENT_ATLAS.md) — 학생 화면 76개의 텍스트 UI 조사.
- [HUMAN_ACCEPTANCE_GATE](docs/HUMAN_ACCEPTANCE_GATE_20261104.md) — 실제 기능·환경·품질 검증표.
- [INDEPENDENT_EVALUATION](docs/INDEPENDENT_EVALUATION.md) — 추천/미디어/시간의 독립 평가.
- [LAYA_CPU_SPIKE_PROTECTION](docs/LAYA_CPU_SPIKE_PROTECTION.md) — 선택 worker의 자원·중단 정책.
- [NCP_OPERATIONS](docs/NCP_OPERATIONS_2026.md) — NCP 계정·비용·운영 담당.
- [PR_WORKFLOW](docs/PR_WORKFLOW.md) — 최신 HEAD 리뷰·CI·병합.
- [PRODUCT_ACTIVATION_RUNBOOK](docs/PRODUCT_ACTIVATION_RUNBOOK_20261105.md) — 실제 구성·실행 순서.
- [REMAINING_IMPLEMENTATION](docs/REMAINING_IMPLEMENTATION_20261104.md) — 잔여 코드와 실제 검증 구분.
- [REVIEWER_ACCESS](docs/REVIEWER_ACCESS.md) — 심사자 초대·합성 접근 범위.
- [SERVICE_DELIVERY_PLAN](docs/SERVICE_DELIVERY_PLAN.md) — 서비스 운영·유지보수 조건.
- [TEAM_GUIDE](docs/TEAM_GUIDE.md) — 팀원 설명·시연 안내.
- [TEAM_PROGRESS](docs/TEAM_PROGRESS.md) — 담당별 실제 검증 현황.
- [TRUSTED_RAG_MEDIA_VERSIONING](docs/TRUSTED_RAG_MEDIA_VERSIONING.md) — SourceRevision/미디어/시점·인용 계약.
- [UI_MENU_COVERAGE](docs/UI_MENU_COVERAGE.md) — 실제 메뉴와 지원 범위.
- [WORKSTREAMS](docs/WORKSTREAMS.md) — 협업자별 책임.

### 웹·API·자산

- [API AGENTS](apps/api/AGENTS.md) — 서버/SQL/AI 코드 규칙.
- [API README](apps/api/README.md) — API 모듈·실행·검증.
- [웹 AGENTS](apps/web/AGENTS.md) — UI·모바일/접근성 규칙.
- [웹 README](apps/web/README.md) — 화면 경로와 테스트.
- [웹 배너 자산](apps/web/src/shell/assets/README.md) — 이미지 provenance·접근성.
- [자산 AGENTS](assets/AGENTS.md) — 이미지 검증·배포 범위.

### AI·계약·코어

- [AI AGENTS](packages/ai/AGENTS.md) — OCR/HCX/Laya 개발 책임.
- [AI README](packages/ai/README.md) — 네 가지 AI 작업·공급자 계약.
- [계약 AGENTS](packages/contracts/AGENTS.md) — Zod/타입 변경 절차.
- [계약 README](packages/contracts/README.md) — 공통 DTO·버전.
- [학업 AGENTS](packages/core/src/academics/AGENTS.md) — 원장·졸업·What-if 규칙.
- [전망 AGENTS](packages/core/src/forecast/AGENTS.md) — 개설·시점/불확실성.
- [정규화 AGENTS](packages/core/src/normalization/AGENTS.md) — TopicCode/공고 입력.
- [공지 AGENTS](packages/core/src/notices/AGENTS.md) — 적용 조건과 날짜.
- [추천 AGENTS](packages/core/src/opportunities/AGENTS.md) — 순위·자격·근거.
- [추천 README](packages/core/src/opportunities/README.md) — 순수 코어 호출 전 계약.
- [개인정보 정책 AGENTS](packages/core/src/privacy/AGENTS.md) — 현재 사용자 권한·삭제/철회.
- [fixture AGENTS](packages/fixtures/AGENTS.md) — 합성 회귀 데이터.
- [공용 UI AGENTS](packages/ui/AGENTS.md) — UI 컴포넌트·접근성.

### 인프라·배포

- [인프라 AGENTS](infra/AGENTS.md) — IaC/OS·worker·CI 책임.
- [PDF_RUNTIME](infra/ai/PDF_RUNTIME.md) — PDF 페이지 렌더/OCR 근거.
- [NCP 에이전트 매뉴얼](infra/ncp/AGENT_DEPLOYMENT_MANUAL.md) — 실제 배포 절차.
- [NCP 인계 양식](infra/ncp/OPERATIONS_HANDOFF_TEMPLATE.md) — 설정·비용·복구 결과.
- [NCP QUICKSTART](infra/ncp/QUICKSTART.md) — 계획과 비공개 preview.
- [NCP README](infra/ncp/README.md) — 네트워크/호스트·복구 코드.
- [Terraform host](infra/ncp/terraform/host/README.md) — host 구성.
- [Terraform network](infra/ncp/terraform/network/README.md) — VPC/방화벽 계획.

### 참고 자료·심사자

- [자료 사용 범위](reference/hufsability/DATA_PERMISSION_GATE.md) — 학교·학생 자료 처리 구분.
- [학교 기능 INVENTORY](reference/hufsability/INVENTORY.md) — 공개 기능·관찰 범위·출처.
- [NCP 비용·구조](reference/ncp/COST_AND_ARCHITECTURE.md) — 실제 비용 항목/구성 후보.
- [NCP 서비스 목록](reference/ncp/SERVICE_CATALOG.md) — 서비스 선택 범위.
- [심사자 초대 PDF](reference/reviewer/ReviewerInvitation.TEMPLATE.pdf) — 비활성 예시 양식.

### 검증·도구

- [작업 이슈 양식](.github/ISSUE_TEMPLATE/agent-task.md) — 범위·완료·증거.
- [PR 양식](.github/PULL_REQUEST_TEMPLATE.md) — 변경/검증·롤백.
- [테스트 AGENTS](tests/AGENTS.md) — 자동검증과 실제 인수 구분.
- [tools README](tools/README.md) — 계약·의존성·산출물 감사.
