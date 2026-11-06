# HUFS One AI

**한국외국어대학교 학생의 기회 탐색·경험 기록·학업 계획을 근거와 연결하는 독립 학생 프로젝트입니다.** 학교 공식 행정 시스템이나 공식 졸업 사정을 대신하지 않습니다.

프로젝트 소유자가 문서상 자료·개인정보·기관·공유/게시·클라우드/모델·운영 승인을 모두 완료했다고 확인했습니다. 현재 승인 상태는 **`OWNER_CONFIRMED_APPROVED`**입니다. 실제 구현·자격증명 구성·시험·배포 여부는 [STATUS](STATUS.md)에서 별도로 관리합니다.

## 1. 기획 배경

학생에게 필요한 교과·비교과·장학·진로/채용·학사 공지는 여러 출처에 흩어져 있습니다. 같은 정보도 전공·이수 상태·관심·경험·마감에 따라 의미가 달라집니다. HUFS One AI는 학생이 무엇을 확인하고 다음에 어떤 행동을 선택할지, 원문과 개인 조건을 함께 보여 주는 서비스를 지향합니다.

## 2. 서비스 개요 및 차이점

맞춤 기회·공지/달력, 경험 기록과 학생이 승인한 역량 태그, 보관함·행동 계획, 취득/수강/계획 학점·전공 What-if를 연결합니다. 추천 점수를 합격률로 표현하지 않고 지원 자격과 관심 적합성, 확정 사실과 미확인 근거를 분리합니다. SourceRevision과 시점별 근거를 보존하고 개인 정보는 로그인한 사용자와 권한에 맞게 제공합니다.

기존 HUFSAbility의 기능을 전부 대체하거나 실제 연동이 없는 메뉴를 지원한다고 주장하지 않습니다. 독립 React UI의 넓은 화면 11개 대분류 GNB/실제 메뉴 LNB·모바일 5탭, 홈 요약·합성 REVIEWER/EMPTY_DEMO와 실제 사용자 경로를 구분합니다. 현재 공개 Pages 합성 미리보기는 학교 계정 인증과 다른 경로이며 실제 팀원 본인 데이터는 #297/#299 검증 전에 표시하지 않습니다. 경험 기반 커리어 기능은 경험 사실→AI 후보→학생 확인→추천 활용의 단계로 구성합니다.

## 3. 생성형 AI 및 바이브코딩 활용 방식

서비스 AI는 경험 기술 후보, 공고 조건 해석, 개인 행동 요약, 졸업 설명의 네 작업을 다룹니다. 원문·이미지/PDF·시점 근거와 사용 권한을 연결한 뒤 필요한 OCR/HCX 결과를 구조화하고 JSON/인용·숫자/날짜·예산/취소 조건을 검증합니다. AI가 학칙·실제 활동·지원 적격·취업 성과를 임의 확정하지 않습니다. 승인된 실제 정보를 처리하는 것과 비밀키·타인 자료를 무분별하게 노출하는 것은 다릅니다.

개발에서는 자연어 요구와 반례로 코드·테스트·문서 초안을 만들고 실제 TypeScript·React·Fastify·SQL을 검토합니다. 회귀 테스트를 먼저 실패시키고 구현 후 CI로 확인하는 방식으로 AI 보조 개발 결과를 검증합니다. 모델이 생성한 초안·자체 리뷰를 독립 사람의 품질 측정으로 소개하지 않습니다.

## 4. 구현 현황 및 실제 서비스 실현 가능성

React/Vite, Fastify/Zod, 개인화·학업 계산 코어, 7개 기본 SQL 역할/RLS·CAS, Source/RAG·AI 예산·NCP IaC/SSH 합성 미리보기 코드가 있습니다. 심민성 담당 분할 PR [#267](https://github.com/ot4562-glitch/HUFS-One-AI/pull/267)~[#275](https://github.com/ot4562-glitch/HUFS-One-AI/pull/275)의 실제 8건은 모두 병합되었고, [#277](https://github.com/ot4562-glitch/HUFS-One-AI/pull/277)에서 **BETA 본인 CSV 조회 UI/API 연결과 원본 5개 불변 보존**을 추가했습니다. 이전 대형 [PR #264](https://github.com/ot4562-glitch/HUFS-One-AI/pull/264)는 **분할 대체되어 미병합 종료**되었습니다. 박준영의 [#278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278)은 8학기 개설 전망을, 김채윤의 [#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279)은 합성 코퍼스 및 경험 승인 추천 신호를 각각 코어에 병합했습니다. 실제 NCP·Google/메일·관리형 DB/권한·CLOVA 실호출은 여전히 별도 구성/검증이 필요합니다.

**2026-11-06 후속 코드 통합:** [#285](https://github.com/ot4562-glitch/HUFS-One-AI/pull/285)(경험→AI 후보→학생 승인 **합성 UI 컴포넌트**, 라우트·실 API 미연결), [#286](https://github.com/ot4562-glitch/HUFS-One-AI/pull/286)(40개 원본 공고를 건드리지 않는 정정/취소/연장 5-chain 합성 overlay·quarantine 순서 결정성), [#287](https://github.com/ot4562-glitch/HUFS-One-AI/pull/287)(RulePack 개정 시 인정 영역 이동·`nextAttempts`/보수적 `UNKNOWN`), [#288](https://github.com/ot4562-glitch/HUFS-One-AI/pull/288)(rolling-origin 17개 추가 회귀), [#289](https://github.com/ot4562-glitch/HUFS-One-AI/pull/289)(학점 원장 10개 속성/경계 테스트와 [커버리지 지도](packages/core/src/academics/PROPERTY_COVERAGE.md))를 개별 리뷰·통합했습니다. **모두 합성/정적 검증**이며 #285는 아직 `/experience`에서 보이는 기능이 아니고, #286의 기본 `recommendationReport` 입력은 여전히 r1입니다. 실제 연동의 잔여 작업은 [#284](https://github.com/ot4562-glitch/HUFS-One-AI/issues/284), 본선 전 [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10)/[#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11)/[#258](https://github.com/ot4562-glitch/HUFS-One-AI/issues/258), 본선 후 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)·[#280–#283](https://github.com/ot4562-glitch/HUFS-One-AI/issues/280)에서 계속 추적합니다. 자동 에이전트의 리뷰는 독립 사람의 수락이 아닙니다.

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

**추가 UI 리디자인 병합:** [#290](https://github.com/ot4562-glitch/HUFS-One-AI/pull/290) — UIUX 96 마스터 명세를 참고한 **11개 관찰 대분류 GNB·분류 배너/LNB·합성 홈(P001)·공고 행 UI**를 `main`에 반영했습니다. 5개 핵심 탭·독립 프로젝트 고지/미지원 기능 표시 유지; 원래 HUFSAbility 화면 P002–P076의 기능 구현이나 실기기/스크린리더 사람 인수는 아님. 현 단계는 [UI 합성 QA #9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), 실현장 범위는 [#280](https://github.com/ot4562-glitch/HUFS-One-AI/issues/280)에서 진행합니다. 디자인 계약·지원 경계의 정본은 [Architecture A11](Architecture.md)과 [UI 메뉴 커버리지](docs/UI_MENU_COVERAGE.md)입니다.

**현재 작업:** [#284 경험 API 클라이언트 미연동](https://github.com/ot4562-glitch/HUFS-One-AI/issues/284), [#276 본선진출 이후 운영 통합](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) — 실 NCP/Google·DB·학생 4인 권리/동의·CLOVA·복구 검증은 **OPEN**. 협업 [#258 UI](https://github.com/ot4562-glitch/HUFS-One-AI/issues/258), [#260 학업 연계](https://github.com/ot4562-glitch/HUFS-One-AI/issues/260), [#261 운영·기획](https://github.com/ot4562-glitch/HUFS-One-AI/issues/261), [#10 추천 P0](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10), [#11 학업 P0](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11)은 미완료. [#259 추천 순수 코어](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259)는 완료로 닫았으며 #252/#253/#257은 잔여 운영 범위를 #276으로 이관한 과거 이슈입니다.

**협업 이슈도 시점별로 분리했습니다.** 이의상 [본선 전 UI #9·#119·#258](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9) → [본선 이후 실 UI #280](https://github.com/ot4562-glitch/HUFS-One-AI/issues/280); 김채윤 [본선 전 추천 #10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) → [이후 #281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281); 박준영 [본선 전 학업 #11·#260](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11) → [이후 #282](https://github.com/ot4562-glitch/HUFS-One-AI/issues/282); 이서연 [본선 전 비코드 #12·#261](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12) → [이후 #283](https://github.com/ot4562-glitch/HUFS-One-AI/issues/283). **본선 전 이슈는 합성 코드/계획, 본선 이후는 실데이터·계정·NCP·사람/운영 인수**만 추적합니다. 담당자를 변경하거나 이슈를 자동 완료 처리하지 않았습니다. [전체 이슈 지도](STATUS.md#협업-이슈-전후-분리-2026-11-06).

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

## 7. 중요 문서 — 처음 설치하는 분·비전공자용

**NCP 서버를 처음 만드는 팀원, 제품을 설치하려는 운영자, 소프트웨어 비전공자를 위한 상세 설명서입니다.** 아래 순서대로 읽으면 실제 NCP 비용 발생 단계와 합성 시연·제품 운영·GPT/Claude 개발 에이전트의 차이를 이해할 수 있습니다.

| 중요 문서 | 읽는 사람 / 핵심 내용 |
| --- | --- |
| **[① NCP 서버 개설·초기 보안 가이드](docs/BEGINNER_NCP_SERVER_SETUP.md)** | 비전공 운영자용: NCP 계정·KR VPC·Subnet·서버 생성·공인 IP·ACG/Network ACL·SSH 키·Ubuntu/Node 설치·비용/반납 |
| **[② NCP에 제품 및 GPT(Codex)·Claude Code 설치 가이드](docs/BEGINNER_NCP_PRODUCT_AND_AGENTS.md)** | 서버/개발 담당자용: 안전한 합성 미리보기 배포·SSH 터널·롤백, 운영 API·DB·TLS 준비, Codex/Claude Code 개인용 개발 환경 설치와 제품 AI의 차이 |
| **[③ 제품 구조와 동작 원리 — 비전공자 가이드](docs/BEGINNER_PRODUCT_ARCHITECTURE.md)** | 기획·심사·신규 팀원용: React↔API↔DB·추천/학업·RAG·AI 후보→학생 승인·개인정보·합성/실자료 구분·10분 발표 흐름 |

**설치 전 반드시 확인:** 개발용 합성 미리보기, GitHub Pages 미리보기, GPT/Claude 개발 CLI 설치는 **실제 학생 서비스의 배포 성공이 아닙니다.** 현재 실서비스 환경·사용자별 권한·NCP/Google/PG/유료 공급자·인수 검증은 [본선진출 이후 운영 통합 #276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276), [현재 구현 상태](STATUS.md), [PRODUCTION_RUNTIME](docs/PRODUCTION_RUNTIME.md)에서 확인합니다. 복구된 `csv/` 원본 5개는 무단 수정·삭제하지 않으며 공개 배포·CI/AI 작업공간에 포함하지 않습니다.

