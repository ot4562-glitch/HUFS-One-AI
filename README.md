<div align="center">

# 🎓 HUFS One AI

### 학생의 기회, 경험, 학업을 하나의 근거 있는 선택으로

흩어진 **교과·비교과·장학·채용·학사 정보**를 학생의 조건과 연결하고,  
**왜 추천했는지 · 무엇을 확인해야 하는지 · 다음 행동은 무엇인지** 보여 주는 AI 기반 학생 지원 플랫폼입니다.

![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-5-202020?logo=fastify&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-5-6E9F18?logo=vitest&logoColor=white)

**한국외국어대학교 학생팀의 독립 프로젝트 · 2026 AI 캠퍼스 바이브코딩 경진대회 관련**

[서비스 소개](#해결하려는-문제) · [주요 기능](#주요-기능) · [시스템 구조](#시스템-구조) · [실행 방법](#실행-방법) · [팀](#팀과-협업)

</div>

> [!IMPORTANT]
> **현재 공개 가능한 범위는 합성 데이터 기반 시연 및 자동 검증된 코드입니다.** 실서비스 출시는 `RELEASE_BLOCKED`이며, 학교 공식 인증·졸업 판정·실학생 데이터 사용·실 NCP/AI 유료 호출의 완료를 뜻하지 않습니다. 프로젝트 소유자의 `OWNER_CONFIRMED_APPROVED`와 실제 환경 구성·권리·검증은 별개입니다. [현재 상태](STATUS.md) · [데이터 승인·권리](docs/AUTHORIZATION.md)

![HUFS One AI 시스템 아키텍처: 학생/합성 시연, React 프런트엔드, Fastify API, 추천·학업 코어, PostgreSQL 데이터 경계, 선택적 AI 및 NCP 출시 게이트](docs/images/hufs-one-ai-architecture.svg)

*아키텍처 이미지는 저장소 구현을 이해하기 쉽게 정리한 논리도입니다. 배포 완료 화면이나 실제 운영망을 뜻하지 않습니다.*

## 해결하려는 문제

대학생은 같은 정보도 **학과·학년·이수 현황·관심사·지원 자격·마감일**에 따라 다르게 판단해야 합니다. 하지만 학교 공지, 장학·비교과·채용 공고, 학점과 개인 경험은 서로 다른 곳에 흩어져 있습니다.

HUFS One AI는 학생이 직접 확인해야 할 근거를 연결합니다.

1. **찾기** — 내 조건에 관련 있는 공고와 학사 정보를 모읍니다.
2. **판단하기** — 자격 충족 여부, 근거와 시점, 미확인 항목을 분리합니다.
3. **계획하기** — 경험·학업·지원 준비를 다음 행동으로 이어 갑니다.

추천 점수는 합격 확률이 아니며, 지원 자격과 공식 졸업요건을 AI가 임의로 확정하지 않습니다.

## 주요 기능

| 기능 | 학생에게 보이는 가치 | 현재 구현 경계 |
|---|---|---|
| **맞춤 기회 탐색** | 관심사와 이수 조건에 맞는 비교과·장학·진로/채용 정보 | 고정 합성 공고 40건·공지 10건 기반 시연 및 관련 코어 |
| **공지·마감 캘린더** | 확정 마감, 변경된 공지와 확인할 일정 파악 | `SourceRevision` 및 `asOf` 기준; 모든 실시간 공고 수집 아님 |
| **학점·졸업·What-if** | 취득·수강·계획 학점을 나누고 전공 선택 시나리오 비교 | `RulePack`·합성 원장 기반, 공식 졸업 사정 아님 |
| **경험·역량·커리어** | 경험 초안 → AI 역량 후보 → 학생 승인·철회 → 추천 활용 | 본인 권한·현재 작업 결과의 일치성 검증; 실데이터 인수 별도 |
| **북마크·행동 계획** | 관심 공고·지원 초안·해야 할 일 정리 | 실제 지원서 제출·기관 합격 판정 제공하지 않음 |
| **동아리·캠퍼스** | 동아리 기회와 학생 활동을 탐색하는 화면 | 합성 동아리·가상 ADMIN 시연; 공식 게시 권한 없음 |
| **설명 가능한 AI** | 공고 조건 해석·행동 요약·졸업 설명·경험 기술 후보 | OCR/HCX/Laya와 외부 모델은 승인된 서버 구성에서 선택적 실행 |

웹에는 데스크톱 11개 대분류 메뉴와 모바일 5탭, 합성 계정 선택·빈 계정·REVIEWER 시연이 있습니다. 기존 HUFSAbility의 모든 메뉴를 구현했다고 주장하지 않으며, 미지원 기능은 미지원으로 표시합니다. [화면별 범위](docs/UI_MENU_COVERAGE.md) · [제품 방향](PROJECT.md)

## 사용자 흐름

학생은 공고를 보기 전에 개인정보와 입력 조건을 스스로 확인하고, 결과를 받은 후에도 원문·날짜·권한을 확인합니다. AI는 검토할 **후보**를 작성할 수 있지만 확정 사실을 대신 만들지 않습니다.

```mermaid
flowchart LR
    P["학생 조건 / 가상 시연 프로필"] --> S["권한과 최신 출처 확인"]
    S --> E["추천 · 자격 · 학업 RulePack"]
    E --> V{"근거가 충분한가?"}
    V -- "확인됨" --> R["근거를 붙여 결과 설명"]
    V -- "미확인" --> U["UNKNOWN / NEEDS_REVIEW"]
    R --> A["경험 승인 · 보관 · 행동 계획"]
    U --> A
    AI["선택적 OCR / LLM 후보"] -. "학생 승인·검증 후" .-> A
    classDef trust fill:#e0f2fe,stroke:#0284c7,color:#0c4a6e
    classDef caution fill:#fef3c7,stroke:#d97706,color:#78350f
    class S,E,R,A trust
    class V,U,AI caution
```

## 시스템 구조

위의 **[아키텍처 이미지](docs/images/hufs-one-ai-architecture.svg)**는 실제 코드와 운영 준비 단계를 구분합니다. 기술 계약의 정본은 [Architecture.md](Architecture.md)입니다.

| 영역 | 구성 | 책임 |
|---|---|---|
| **웹** | React 19 · Vite 8 · TypeScript | 기회·학업·경험 화면, 현재 사용자와 근거/불확실성 표시 |
| **API** | Fastify 5 · Zod 4 | 입력 검증, 세션·권한·CSRF, API 응답과 취소/철회 경계 |
| **순수 코어** | `packages/core` | 추천·자격, 공지·정규화, 학점·What-if·개설 전망 |
| **공통 계약** | `packages/contracts` | 타입·API DTO 버전, 호출자와 공급자 사이의 검증 |
| **데이터** | PostgreSQL · RLS · CAS | 사용자별 데이터, 출처 판본, 승인·철회, 감사 및 예산 경계 |
| **AI** | `packages/ai` · 선택적 OCR/HCX/Laya | 근거 있는 후보 생성, 인용·수치·JSON 검증 및 비용 제한 |
| **검증** | Vitest · Playwright · GitHub Actions | 합성/계약 테스트, Chrome 시나리오, 오프라인 NCP IaC 검사 |
| **운영 준비** | GitHub Pages 합성 프리뷰 · NCP 구성 코드 | 공개 시연과 실서버 운영을 명확히 분리 |

### 원문·데이터·AI의 책임 분리

```mermaid
flowchart TB
    SRC["허용된 원문 / 공고 / 학사 규칙"] --> REV["출처 판본·시간·권한 검사"]
    REV --> CORE["결정적 자격·학업 코어"]
    REV -. "승인된 입력만" .-> MODEL["선택적 OCR / HCX / Laya"]
    MODEL --> CHECK["인용·숫자·형식 검증"]
    CORE --> OUT["근거 / 조건 / 미확인 상태"]
    CHECK --> CAND["AI 제안 후보"]
    OUT --> VIEW["현재 사용자 화면"]
    CAND --> OK["사용자 검토·승인 / 철회"]
    OK --> VIEW
    classDef core fill:#dbeafe,stroke:#2563eb,color:#1e40af
    classDef opt fill:#fef3c7,stroke:#d97706,color:#78350f
    class REV,CORE,OUT,VIEW core
    class MODEL,CHECK,CAND,OK opt
```

**자료 이용과 개인정보:** 합성 시연의 S01–S05/REVIEWER/EMPTY_DEMO는 실제 학생 기록과 다릅니다. `csv/`에 복구·보존된 **원본 CSV 5개**는 무단 수정·삭제·이동하지 않으며 공개 웹 번들·CI·모델 추론에 넣지 않습니다. 실제 학생 정보는 인증된 actor와 목적별 권리·동의·현재 접근권 검증을 통과할 때만 전용 API로 접근해야 합니다. [데이터 정책](docs/DATA_GOVERNANCE.md)

## 실행 방법

### 준비물

- Node.js **22.22.2 이상(22계열)** 또는 **24.15.0 이상(24계열)** (저장소 `package.json`의 범위 확인)
- npm, Git; 브라우저 E2E를 실행하려면 Playwright/Chrome 환경
- 기본 합성 시연에는 실제 학생 원본·학교 계정·유료 AI 키를 넣지 않습니다.

### 1. 설치

```bash
git clone https://github.com/ot4562-glitch/HUFS-One-AI.git
cd HUFS-One-AI
npm ci --ignore-scripts --no-audit --no-fund
```

### 2. 합성 시연 실행

먼저 **터미널 A**에서 합성 계정 API를 실행합니다.

```bash
npm run start:api:synthetic-accounts
```

다른 **터미널 B**에서 웹을 실행합니다.

```bash
npm run dev:web -- --mode synthetic
```

시연 프로필과 실제 사용자 인증은 다른 체계입니다. 독립 빈 계정/가상 ADMIN은 [EMPTY_DEMO_RUNBOOK](docs/EMPTY_DEMO_RUNBOOK.md)에 따라 별도 모드로 실행합니다. [웹 사용 설명](apps/web/README.md) · [API 사용 설명](apps/api/README.md)

### 3. 검증

```bash
npm run check
npm run assets:check
npm run check:privacy
npm run build:api
npm run build:web
npm run test:e2e:web
```

각 명령이 검사하는 범위와 실제 실행 성공은 서로 다릅니다. **이 README 편집 자체로 위 명령의 통과나 실제 NCP/실학생 인수를 주장하지 않습니다.** 최신 근거는 [STATUS](STATUS.md) · [REPORT](REPORT.md) · [Actions](https://github.com/ot4562-glitch/HUFS-One-AI/actions)에서 확인합니다.

## 프로젝트 구조

```text
HUFS-One-AI/
├── apps/
│   ├── web/                # React/Vite 학생·시연 화면
│   └── api/                # Fastify API, 인증·인가·DB 연계
├── packages/
│   ├── core/               # 추천·학업·공지·개인정보 로직
│   ├── contracts/          # 공통 DTO / Zod 계약
│   ├── ai/                 # 선택적 AI 공급자·후보 검증
│   ├── fixtures/           # 합성 테스트용 자료
│   └── ui/                 # 공통 UI
├── infra/ncp/              # NCP IaC·배포·운영 절차
├── tests/                  # 계약·통합·회귀 검증
├── docs/                   # 사용/팀/운영 문서
│   └── images/             # 이 README 아키텍처 그림
├── csv/                    # 보호 대상 원본 5개; 배포 금지
└── tools/                  # 검사·평가·감사 도구
```

## 현재 상태와 출시 조건

| 항목 | 상태 |
|---|---|
| 프로젝트 소유자 승인 | `OWNER_CONFIRMED_APPROVED` — 실제 구성/이용권·검증과 구별 |
| 합성 웹·코어·API 및 자동 검증 | 코드와 CI 근거 존재; 각 정확한 SHA 기준 |
| 실제 대학 계정·실학생 2명 이상 검증 | 실제 인수 미확인 · `NOT_RUN / CONFIGURATION_REQUIRED` |
| 공식 학칙·교과코드·실원본 통합 검증 | 개별 검토·연계 필요 |
| 실제 NCP 운영·유료 HCX/OCR 호출·과금 | 별도 운영 구성·영수증·복구 확인 필요 |
| 실서비스 릴리스 | **`RELEASE_BLOCKED`** |

GitHub Pages는 **실자료 없이 동작하는 합성 UI 미리보기**를 위한 것이며 프로덕션 API/학교 계정 로그인과 다릅니다. 자동 배포 구성은 [Pages 워크플로](.github/workflows/pages-synthetic-preview.yml), 실제 서비스 구성 기준은 [PRODUCTION_RUNTIME](docs/PRODUCTION_RUNTIME.md)에서 확인하세요.

**2026-11-09 PR·이슈 정리:** [#386 NCS↔경험 의미 매칭 후보](https://github.com/ot4562-glitch/HUFS-One-AI/pull/386)는 코드 검토·독립 교차리뷰와 HEAD 5개 CI 성공 후 `e8d3c9c`로 병합했습니다. 다만 실제 학교/NCS 자료·학생 원장·UI/API/사람 Gold는 여전히 미연결·미인수이므로 [기능 #347](https://github.com/ot4562-glitch/HUFS-One-AI/issues/347)은 OPEN입니다. [#361 FAQ](https://github.com/ot4562-glitch/HUFS-One-AI/pull/361)은 부정 서술어 검증, [#372 OCR](https://github.com/ot4562-glitch/HUFS-One-AI/pull/372)는 기관명 동일성 검증의 추가 결함으로 `REQUEST_CHANGES`·병합 보류 상태입니다. **열린 이슈 26건, 출시 `RELEASE_BLOCKED` 유지.** 상세 근거는 [11/09 PR·이슈 감사](docs/REVIEW_AND_ISSUE_AUDIT_20261109.md) 및 [STATUS](STATUS.md)에서 확인하세요.

**2026-11-08 코드·이슈 정리:** 최근 [#391–#396 PR 6건](docs/REVIEW_AND_ISSUE_AUDIT_20261108.md)을 HEAD CI·오너 COMMENT 리뷰 후 main에 병합했습니다. 영수증 TTL·인코딩된 상세 URL·통계 ID 충돌·폐기 안내 체크리스트·일시 503 사용자 재확인·npm 감사·CampusAssist 포트 조립을 수정했습니다. 단, 운영 출처/권리·실학생 UI/실제 학교 계정·NCP/HCX 과금 및 독립 사람 Gold는 **NOT_RUN/NOT_CONNECTED**이며 **RELEASE_BLOCKED**입니다. [현재 열린 버그·변경 요청 PR·완료 이슈](STATUS.md)를 기준으로 후속 인수를 관리합니다.

## 새 에이전트·협업자: 이슈 생성 1분 가이드

**저장소를 처음 보는 코딩 에이전트도 반드시 [AGENTS.md](AGENTS.md)와 [이슈 배정 플레이북](docs/ISSUE_ASSIGNMENT_PLAYBOOK.md)을 먼저 읽고 GitHub 이슈 제목 맨 앞에 표준 접두어를 사용합니다.** 이슈 템플릿을 선택하면 해당 접두어가 채워집니다.

| 접두어 | 용도/첫 담당 |
| --- | --- |
| `[추가 기능]` | **신규 기능 전체** — 심민성 초기 분석·비AI 구현 후 단계별 인계 |
| `[데이터 요청]` | **독립 자료·권리·Gold 요청** — 김채윤 |
| `[웹 구현]` | **독립 UI/UX·React 구현** — 이서연 |
| `[AI 구현]` | **독립 AI·규칙 AI 구현** — 박준영/이의상 업무량 기반 배정 |
| `[AI QA]` | **AI 기술 품질·재시험** — 박준영 |
| `[기술 통합]` | **비AI API·DB·보안·CI·NCP 작업** — 심민성 |
| `[분류 검토]` | **영역 불명확/복합 이슈** — 자동 배정 대신 사람 검토 |
| `[버그]` | **재현 가능한 결함** — 명확한 역할에 배정, 혼합/불분명하면 사람 검토 |
| `[실증 인수]` | **실학교·실NCP·실자료 권리·사람 검증** — 담당/수락은 사람이 판단 |

예: `[웹 구현] P2 모바일 검색 UI 수정`, `[AI 구현] OCR 인용 근거 매칭`. 코드 전수조사 또는 `[TASK-xx]`를 추가로 붙일 때도 위 접두어를 **가장 앞에** 넣습니다. 구체적 재현/코드 경로·완료 기준을 본문에 적고, 사람이 판단한 강도 라벨 `effort:S/M/L`을 붙이면 업무량 점수에 반영됩니다. 기본적으로 기존 담당자를 강제로 교체하지 않습니다.


**P0·보안 이슈:** P0 및 보안·개인정보 관련 내용은 자동 배정하지 않고 사람 검토로 보냅니다. 공격 재현법·비밀·학생 원본은 공개 이슈에 올리지 말고 GitHub의 비공개 보안 신고 또는 관리자 비공개 채널을 사용하세요. 결함 조사에는 `[버그][코드 전수조사]`, 정정해야 할 공식 데이터에는 `[데이터 요청][정정]`을 사용합니다. 문서/성능/리팩터링은 새로운 제목 접두어를 만들기보다 `type:docs`, `type:performance`, `type:refactor` 라벨로 관리합니다.

**[보안 취약점 비공개 신고](SECURITY.md)** · **[봇 자동 라벨·공정 배정 가이드](docs/ISSUE_ROUTING_BOT.md)** · **[새 이슈 템플릿](.github/ISSUE_TEMPLATE/)** · **[Actions](https://github.com/ot4562-glitch/HUFS-One-AI/actions)**. **PR #382는 main에 병합되었습니다.** 자동 분류가 실제로 실행/적용됐는지는 이슈별 Actions·라벨·담당 결과를 확인해야 합니다. 고정 역할 #355–#359는 읽기 전용이며 `csv/` 원본 5개의 공개 게시 동의/재식별 위험 [#362](https://github.com/ot4562-glitch/HUFS-One-AI/issues/362)은 아직 검토 중입니다.

## 팀과 협업

| 담당 | 현행 역할 | 고정 역할 이슈 |
| --- | --- | --- |
| **심민성** | 전체 총괄·코드 검수, 신규 기능의 **최초 배정 및 가능한 일반 Core/API/DB/계약/통합 직접 구현**, AI 겹침 시 구현 인계 | [#359](https://github.com/ot4562-glitch/HUFS-One-AI/issues/359) |
| **박준영** | 추천/랭킹·HCX-007/OCR·규칙/코드 기반 AI 개발, 이의상 교차검증, **AI 제품 기술 QA·재시험** | [#356](https://github.com/ot4562-glitch/HUFS-One-AI/issues/356) |
| **이의상** | AI·NLP·OCR·RAG·코드 기반 AI 개발, 박준영 구현/모델의 의미·근거 교차검증 | [#355](https://github.com/ot4562-glitch/HUFS-One-AI/issues/355) |
| **이서연** | React UI/UX·웹 디자인·실제 기능/API 배치·김채윤 데이터 시각화 | [#357](https://github.com/ot4562-glitch/HUFS-One-AI/issues/357) |
| **김채윤** | 실사용 동아리·공모전·학사/포스터 데이터/권리/독립 Gold, 디자인 자산 제공 및 **가벼운 전체 사용자 시연/이슈 제보** | [#358](https://github.com/ot4562-glitch/HUFS-One-AI/issues/358) |

**고정 역할 이슈 #355–#359는 이제 읽기 전용이며 댓글을 포함해 절대 수정하지 않습니다.** 신규 `[추가 기능]`은 심민성에게 최초 배정하고 구현 가능한 비AI 부분을 직접 진행합니다. **규칙·코드 기반 AI·LLM·OCR·추천/랭킹 등 AI가 겹치면 이의상/박준영에게 구현을 넘깁니다.** 데이터가 필요한 기능에는 **별도의 `[데이터 요청]` 이슈**를 김채윤에게 만들고 기능 이슈에도 김채윤을 **공동 assignee**로 지정합니다.

현재 13개 `[추가 기능]` 중 박준영이 6개, 이의상이 7개를 개발하며 **김채윤이 모두 데이터 공동 담당**입니다. [대규모 공식자료·포스터·독립 Gold 요청 #360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)에서 실제 자료를 관리합니다. [신규 에이전트용 자동 배정 절차](docs/ISSUE_ASSIGNMENT_PLAYBOOK.md) · [팀 역할/기능 인수](docs/WORKSTREAMS.md) · [에이전트 기본 규칙](AGENTS.md).

## 중요 문서 — 처음 읽는 분부터 개발자까지

| 문서 | 대상 및 내용 |
|---|---|
| **[① NCP 서버 생성·기본 보안](docs/BEGINNER_NCP_SERVER_SETUP.md)** | 비전공 운영자 — VPC/ACG, 인스턴스, SSH, 요금·반납 |
| **[② 제품·GPT(Codex)·Claude Code 설치](docs/BEGINNER_NCP_PRODUCT_AND_AGENTS.md)** | 서버/개발 담당자 — 배포·SSH·롤백과 개발용 CLI 구분 |
| **[③ 제품 구조와 동작 원리](docs/BEGINNER_PRODUCT_ARCHITECTURE.md)** | 비전공자·심사자 — React/API/DB, 추천/학업, RAG, 개인정보 |
| **[기술 아키텍처 정본](Architecture.md)** | 개발자 — A00–A19 인터페이스·시점·권한 계약 |
| **[현재 구현·검증](STATUS.md)** | 전체 팀 — 검증된 것과 미실행·구성 필요 영역 |
| **[시연 매뉴얼](docs/DEMO_MANUAL.md)** | 심사자·발표자 — 합성 시연 경로와 설명 |
| **[보안·데이터 정책](docs/DATA_GOVERNANCE.md)** | 전체 팀 — 원본 CSV, 권리, 철회, 접근 제어 |
| **[에이전트 자동 배정·데이터 요청 절차](docs/ISSUE_ASSIGNMENT_PLAYBOOK.md)** | 처음 참여하는 코딩 에이전트 — 고정 역할 이슈 동결, 새 기능/데이터 분리 배정, AI 인계 규칙 |
| **[대규모 실제 자료 요청 #360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)** | 김채윤 및 AI/웹 개발팀 — 13개 기능 공식 데이터/포스터·권리·Gold 요구 |
| **[PR·리뷰 기준](docs/PR_WORKFLOW.md)** | 개발자 — CI·독립 리뷰·병합 절차 |

<details>
<summary><b>모든 개발·검증·운영 문서 링크 펼치기</b></summary>

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
- [본선 전 운영·권리·비용 사전 계획](docs/PREFINAL_OPERATIONS_PLAN.md) — #12/#261 요구사항·견적·설정/인수 양식.
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

</details>

---

**HUFS One AI는 학교가 운영하는 공식 시스템이 아닌 독립 학생 프로젝트입니다.** 실제 학생·공고·기관 정보의 사용과 출시 상태는 [STATUS](STATUS.md) 및 승인된 운영 기록으로만 판단합니다.
