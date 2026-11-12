# HUFS One AI — 통합 기술·사전 조사 기록

> **2026-11-12 정리:** 과거 pre-NCP 설계·레코드·원장·참고 및 운영 전 단계 메모 9건을 **삭제하지 않고 원문 그대로 이 파일에 보존**했다. 각 항목의 원본 경로와 Git blob SHA를 제공한다. 현재 기능·운영의 정본은 `README.md`, `STATUS.md`, `Architecture.md`, 각 모듈 `AGENTS.md`, 보안·데이터·릴리스 문서에 있다. 이곳에 기록된 오래된 상태·수치·권한/승인 추정은 최신 사실이나 운영 승인으로 해석하면 안 된다.

**내부 링크 주의:** 아래는 이전 원문 그대로의 보존본이므로 원문 내부의 상대 링크는 과거 경로 기준이다. 현재 문서로 이동할 때는 리포지토리의 현행 파일/이슈·PR을 확인한다. GitHub 커밋 히스토리에서 원본 문서의 전문을 별도 확인할 수 있다.

## 01. `docs/ACTIVITY_ARCHIVE_PRE_NCP.md`

<details>
<summary>원문 펼치기 (Git blob `864c3dceec36ec98dc5ca07dddf3b422090a444a`)</summary>

~~~~~~~markdown
# #339 활동 아카이브 — NCP 연결 전 구현·검증 경계

> 2026-11-12 KST. 이 문서는 코드에 실제로 연결된 **합성/오프라인** 경계를 설명합니다.
> 검증된 학교 공식 행사 데이터, 실 학생 정보, NCP·SNS 크롤링이 구현/승인됐다는 뜻이 아닙니다.

## 현재 기능과 계약

- `packages/contracts/src/campus-assist/index.ts`: 기존 `ActivityRecord`/예측/조회 DTO, 선택적 `channelId`와 오프라인 `ActivityOrganization`·`ActivityChannel` registry 계약. 조직은 안정적인 `organizationId`로 관리하고 이름 변경은 `aliases`로 **표시만** 하며, 명의가 비슷하다고 다른 ID에 자동 병합하지 않습니다.
- `packages/core/src/campus-assist/activity-intake.ts`: 별도로 준비한 합성 배열을 수동으로 검사하는 순수 함수 `reviewSyntheticActivityIntake`. URL의 **HTTPS origin + 경로 구간 경계**, 등록된 채널·조직·캠퍼스, 판본/검수일·게시 시점·권리를 검증합니다. 등록 누락·중복·권리 차단·미래 자료·실출처는 격리하며 거부된 원문을 결과/로그에 출력하지 않습니다. **실제 학교 자료는 여기서 항상 거부**됩니다. 이 함수는 HTTP/스크래핑·RLS·권리 승인 생성 기능이 아닙니다.
- `packages/core/src/campus-assist/activities.ts`: 최종 승인 출처 목록에서 현재 head·검증 시점·철회·충돌을 결정적으로 처리합니다. `archiveDay`는 **행사일이 확인된 경우 행사일을, 모르면 한국시간 공지일을 검색 분류에만** 사용합니다. 공지일을 개최일로 표기하지 않습니다. 종류/조직/연도/캠퍼스/검색어 필터, 연도별 중복 묶기 및 약 ±1주·산포 기반 전망이 있습니다. 미확인·취소는 `UNKNOWN/CANCELLED` 또는 보류합니다.
- `apps/api/src/modules/campus-assist-http.ts`: **서버가 독립 권리 검증한 자료 port를 명시적으로 주입받을 때만** BETA 세션으로 조회합니다. 검색 조건을 승인 데이터에 적용한 뒤 **최대 200건**으로 제한하고 `hasMore`를 표시합니다. 현재 **페이지네이션/증분 수집은 없습니다**. 포트 권리 영수증·actor를 요청 후 재검증하고 캐시 없이 전달합니다.
- `apps/web/src/features/campus-assist/OwnerPanels.tsx`: 권리 연결 시 서버 필터로 활동 목록을 재요청하고, 다른 필터·소유자 포트의 오래된 응답은 abort합니다. 이벤트일·게시일(KST)·마감일을 분리, 출처 링크와 revision 노출, 200건 상한/미수집 경고, 확정과 예상을 명시적으로 구별합니다. Pages/demo의 별도 가상 자료는 실제 학교 자료가 아닙니다.
- 오프라인 합성 회귀: `activity-intake.test.ts`, `activities.kst-boundary.test.ts`, `campus-activity-archive-offline.test.ts`, `OwnerActivityPanel.test.tsx`. 실제 출처 금지, URL 사칭, 정정·철회, KST 연말, 200건 제한과 오래된 요청 차단을 다룹니다. 테스트 실행 결과는 GitHub Actions의 **최신 HEAD**를 재확인해야 합니다.

## 실제 NCP 연결·권리 검수 전 반드시 남길 일

1. 독립 담당자 검토로 확인된 **실제 공식 조직/공식 채널 레지스트리**와 허가된 API/RSS/사이트만 등록. 학교 명칭·학생회 계정/조직 개편·채널 이관 이력 검증; 가짜 fixture와 실 인덱스 분리.
2. 채널별 robots·약관·API 제공/재게시·보존·외부 AI 사용 권한과 비공개/개인정보 범위 기록. 권리/기관 승인 없는 로그인 우회·SNS 웹 크롤링 금지. 허가된 수동 등록·원문 링크 메타데이터를 우선.
3. Crawlee/NCP 인프라를 연결할 때 서버 단독 네트워크·호스트/리다이렉트 확인·요청량 제한, 재시도·백오프, 원문 해시·SourceRevision/rights·권리 철회 삭제, 동시 작업 잠금, 실패/미수집 상태, 보존 정책을 독립 검증. 합성 `APPROVED`는 실운영 권리 증명이 아닙니다.
4. 현재 조회는 200건 단일 페이지/최대 12개 series 전망입니다. 전체 공식 아카이브를 위한 안정적인 source epoch 기반 커서·서버 검색/연도·학기 인덱스, 실제 행사 vs 모집·캘린더 연결, 수정/연기·동일 행사 교차채널 매핑을 별도로 구현·시험.
5. 과거 연도 0~1건, 동일 행사 vs 이름만 같은 행사, 학교/조직 개편, 정정·취소·연기, 학기 경계/윤년, 개인 정보 비수집에 대해 사람이 정한 독립 Gold와 운영 허가를 확인. 실학생·실브라우저 사용성/접근성 320~1440px 별도 평가.

**상태:** 합성 단위/통합 기능만 개발 가능, 실제 NCP `NOT_CONNECTED`, 공식 자료/재게시 권리·독립 Gold `NOT_RUN`, 실서비스 `RELEASE_BLOCKED`. 이슈 #339는 **OPEN**입니다.
~~~~~~~

</details>

---

## 02. `docs/AGENT_TOOL_ADOPTION.md`

<details>
<summary>원문 펼치기 (Git blob `4b72d991336ff999d730dbd248a12d8b29617299`)</summary>

~~~~~~~markdown
# HUFS One AI — Claude / GPT 도구 채택 기준 (이슈 #450)

> 제안된 설정과 후보 목록입니다. 이 파일은 협업자 5인의 계정에 플러그인을 설치하거나 권한을 부여하지 않습니다. 사용 환경의 연결·라이선스·요금·외부 전송 여부는 **각 사용자**가 확인합니다. [팀 업무](WORKSTREAMS.md), [PR 리뷰](PR_WORKFLOW.md), [자료 설계 #449](https://github.com/ot4562-glitch/HUFS-One-AI/issues/449).

## 모두에게 동일하게 적용할 부분

- Claude Code: 루트 [`CLAUDE.md`](../CLAUDE.md)에서 `@AGENTS.md`로 동일한 정본을 참조합니다. 프롬프트 파일에 서로 다른 의사결정·권한 규칙을 복제하지 않습니다.
- GPT/Codex: 기존 [`AGENTS.md`](../AGENTS.md)를 정본으로 사용합니다. Claude 전용 `/plugin install` 명령은 Codex 설치 명령이 아닙니다.
- GitHub: [공식 MCP 서버](https://github.com/github/github-mcp-server) **또는** 기존 연결된 ChatGPT GitHub 플러그인 하나를 사용합니다. 동일한 서비스를 여러 고권한 도구로 중복 연결하지 않습니다.
- 각자 고유 계정·최소 toolset과 읽기 권한을 기본값으로 하며, 쓰기·PR 관리·관리자 권한은 실제 담당 작업에 한해서만 개별 승인합니다. 에이전트의 자동 merge·삭제·실운영 배포를 기본 활성화하지 않습니다.
- 승인된 NCP 실데이터(실제 source registry/원문·DB/Gold·학생 자료·비밀·키·로그)는 GitHub, 외부 MCP, Figma, 프롬프트 평가 API로 반출하지 않습니다. 합성 데이터로만 도구를 검증합니다.
- 도구 도입은 라이선스/유지관리/설치·OS 지원/호출 비용/외부 전송/최소 권한/기존 도구와의 중복/성능 영향으로 평가합니다. **도입하지 않는 선택도 합격**입니다.

## 5인 역할별 Claude vs GPT/Codex 도구 매트릭스

| 담당 | Claude Code 우선 검토 | GPT/Codex 우선 검토 | 현재 판단 |
|---|---|---|---|
| 심민성 — 통합·API·NCP | Anthropic [공식 플러그인 카탈로그](https://github.com/anthropics/claude-plugins-official)의 code-review, code-simplifier, security-guidance | [OpenAI Codex](https://github.com/openai/codex), [GitHub MCP](https://github.com/github/github-mcp-server), 필요 시 [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp) | 기존 GitHub/코딩 에이전트와 중복 우선 확인. 개발 서버·합성 DB로만 검증 |
| 박준영 — 추천·AI QA | code-review 또는 PR 검증 스킬 하나, 테스트 비교 | [OpenAI Evals](https://github.com/openai/evals) **평가 포맷만 시범**, [Meta fastText](https://github.com/facebookresearch/fastText) | HCX와 평가 포맷 호환/오탐·실패 사례 측정 전 도입 보류 |
| 이의상 — RAG·NLP | code-review, 필요 시 Anthropic [Skills](https://github.com/anthropics/skills) 문서 예시 | [Google LangExtract](https://github.com/google/langextract), [Microsoft MarkItDown](https://github.com/microsoft/markitdown), [Meta FAISS](https://github.com/facebookresearch/faiss) | 기존 PostgreSQL·권리/원문 근거 검증 유지, 외부 모델 호출 차단 |
| 이서연 — 웹 UI/UX | frontend-design, Figma 플러그인(연결 동의 필요), playwright | [Figma MCP](https://github.com/figma/mcp-server-guide), [Meta Astryx](https://github.com/meta/astryx), [Google Lighthouse](https://github.com/GoogleChrome/lighthouse) | 기존 React·Vite 기반 소형 화면 1개만 비교, 메인 UI 프레임워크 교체 금지 |
| 김채윤 — 수집·검수 | 문서/검수 절차 스킬, GitHub 읽기 도구 | GitHub 읽기/이슈 정리, [Crawlee](https://github.com/apify/crawlee) 운영 UI(서버 구현은 개발 담당), 필요 시 [Microsoft Presidio](https://github.com/microsoft/presidio) 결과 검토 | 개발 플러그인 전부 설치 금지, NCP 원문을 외부 대화에 전송 금지 |

## 직접 설치하지 않을 것

- 제3자 상업 MCP/디자인 생성 사이트를 **오픈소스 라이브러리로 오인**하지 않습니다.
- Claude, GPT/Codex 에이전트 각각에 GitHub write + 브라우저·쉘·NCP 관리자 권한을 일괄 부여하지 않습니다.
- Figma 개인 연결을 팀원에게 자동 전파하지 않습니다.
- GraphRAG/FAISS/Agents SDK 등 새 런타임은 기존 HCX/PG/RAG 기능의 부족함을 증명하기 전 도입하지 않습니다.
- pstack, 자동 PR 병합 플러그인, 복잡한 스킬 모음은 기존 테스트·리뷰 워크플로와 중복하면 적용하지 않습니다.

## PR/설치 수락의 단계

1. 각 담당자가 현재 연결·권한·비용·실패 가능성을 확인합니다. 여기서는 실제 팀원 계정 상태를 확인하지 않았습니다.
2. 합성 fixture로 동일 작업을 기존 경로와 새 도구 각각 실행한 뒤 정확도·오탐·속도/비용·외부 전송·권한을 비교합니다.
3. 도움이 되는 후보 1개만 채택합니다. 설치 방법은 해당 공식 문서의 **현재 버전**을 확인하고 개인별로 연결합니다.
4. 도구 변경 시 로그·권한·검증 결과를 PR에 남깁니다. NCP 실환경·권리·실데이터 인수는 별도입니다.

**상태:** 레포 지침 연결 *구현 제안*, 실제 플러그인 설치 *NOT_RUN*, 실 NCP 접속 *NOT_RUN*.
## 2026-11-10 추가 조사: Superpowers, 디자인 스킬, 공식/커뮤니티 구분

**이 문서는 설치 목록이 아닌 우선순위가 있는 팀 선택지입니다.** #450–#454 담당자별 실험 이슈에 동일한 결과를 댓글로 남깁니다. 후보가 많다는 이유로 일괄 설치하거나 GitHub/로컬 폴더에 자동 설정을 생성하지 않습니다.

### 5인 공통 기준: 무엇이 진짜 필수인가

1. 모든 에이전트: `AGENTS.md` / Claude의 `@AGENTS.md` 지침 공유, 개인 계정·최소권한 GitHub 접근, 현재 HEAD/할당 이슈 확인, 합성 fixture의 테스트 결과, NCP 비공개 원본 외부 반출 금지. **이것이 필수 공통분모**.
2. 개발·리뷰 담당(심민성/박준영/이의상/이서연): [Superpowers — obra, MIT](https://github.com/obra/superpowers)를 **우선 실험**. 브레인스토밍→명세→계획→TDD·디버깅→코드 리뷰 순서. 복잡한 기능에만 적용하고, 단순 버그까지 매번 긴 계획·수십 개 중복 검사를 강제하는 경우 제외. **Anthropic 제작이 아닌 제3자 플러그인이 공식 Claude 마켓에 등재**된 것.
3. 데이터 운영·검수 담당 김채윤: Superpowers 전체 코딩 워크플로 **기본 강제 대상 아님**. GitHub 읽기와 검수 체크리스트/원본 권리 경계가 우선. 코드 작성이 실제로 할당될 때 별도 시험.
4. 정확한 팀원 계정의 Claude/Codex 설치 상태, 플러그인 설치 권한 및 요금은 아직 확인하지 않았습니다. 라이브 환경에 대한 사전 권한 승인은 별개입니다.

### Claude Code — 우선 후보 / 설치 문법 예시

Claude Code 안에서 **각자 직접 승인 후** 사용합니다. 공식 [Claude Marketplace](https://claude.com/marketplace/plugins)와 [Anthropic 카탈로그](https://github.com/anthropics/claude-plugins-official)의 현재 지원 상태를 확인합니다.

| 우선 | 명령 또는 공식 출처 | 목적/주의 |
|---|---|---|
| 우선 시험 | `/plugin install superpowers@claude-plugins-official` | 개발자의 명세·계획·TDD·디버깅 기본 흐름, 기존 CI/AGENTS와 중복 주의 |
| 공통 | `/plugin install github@claude-plugins-official` | 공식 GitHub MCP, 기본 읽기 권한·개인 write 개별 승인 |
| 필요 시 | `/plugin install context7@claude-plugins-official` | Upstash 호스팅 *제3자* 버전별 문서 조회; 외부 문서 MCP이므로 기밀 코드/원문 전송 금지 |
| 코드 담당 | `code-review` **또는** `code-simplifier` | 둘 다 상시 중복 강제 X; 수동 리뷰·실행된 CI 대체 아님 |
| 이서연 필수 시험 | `/plugin install frontend-design@claude-plugins-official` | Anthropic 제작 UI 시각품질 지침 |
| 이서연 필수 시험 | `/plugin install figma@claude-plugins-official` | **Figma 제공** 공식 MCP·스킬; 이서연 본인 Figma 인증/좌석·요금 조건 확인 |
| 이서연 선택 | `/plugin install playwright@claude-plugins-official` | Microsoft 제작 Playwright MCP, 합성 브라우저만 |
| 문제 발생 시 | `Chrome DevTools`, `TypeScript LSP`, `Serena (Oraios)` | 각각 성능·TS 심볼·LSP 탐색용. 기존 개발 도구가 충분하면 보류 |

**Superpowers 텔레메트리:** 저장소가 optional visual companion에 대한 익명 버전 이미지 호출 가능성을 밝힘. 내부 작업용 에이전트에는 `SUPERPOWERS_DISABLE_TELEMETRY=1` 또는 관련 호스트의 비필수 트래픽 차단을 검토합니다. [공식 Superpowers 설치/README](https://github.com/obra/superpowers).

### GPT / Codex — Claude 명령과 별개

- **Superpowers:** Codex 앱의 Plugins → Superpowers 또는 Codex CLI `/plugins` → `superpowers` 검색 → 설치. Claude의 `/plugin install`을 Codex 명령이라고 가정하지 않는다. [obra/superpowers 공식 안내](https://github.com/obra/superpowers).
- **OpenAI 공식 Plugins:** [`openai/plugins`](https://github.com/openai/plugins)의 `figma`, `build-web-apps` 후보와 GitHub 연결. `figma`는 **Figma Developer Terms**, 개인별 Figma 인증이 필요. `build-web-apps`의 Stripe/결제/Supabase는 HUFS One AI에 불필요하므로 해당 부분 설치·연결하지 않는다.
- **Vercel 공식 에이전트 스킬:** [`vercel-labs/agent-skills`](https://github.com/vercel-labs/agent-skills)에서 `web-design-guidelines`, `react-best-practices`/React composition 규칙은 이서연이 기존 React 19·Vite에 필요한 부분만. 자동 코드 변경 대신 diff 검수.
- **Google Labs Stitch:** [`google-labs-code/stitch-skills`](https://github.com/google-labs-code/stitch-skills) 는 Claude/Codex 양쪽 지원, `code-to-design`·`generate-design`·`react-components` 후보. **Google 공식 보증 제품이 아닌 Labs 커뮤니티 저장소**라고 명시됨. Stitch 서비스와 별도 계정·MCP 연결 필요, UI/HTML 업로드 경로 주의.
- GPT/Codex의 `AGENTS.md`가 공통 정책이며 각 플러그인에 동일 규칙·전권한을 복제하지 않는다.

### 이서연: 디자인 선택지는 '생성 1개 + 검수 1개 + 실제 UI 컴포넌트 0~1개'

| 종류 | 후보 | 결정 기준 |
|---|---|---|
| 디자인 방향 | Anthropic `frontend-design` | 새 랜딩/대시보드 시각 방향 1순위 |
| 생성 결과 다듬기 | [Impeccable — pbakaus, Apache-2.0](https://github.com/pbakaus/impeccable) | `npx impeccable install` (Claude/Codex 지원); 사용자 승인 후 프로젝트 범위·hook 실행 확인 |
| 디자인 참고 DB | [UI UX Pro Max — nextlevelbuilder, MIT](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 색·폰트·스타일·접근성/차트; CLI/Python 실행 요구 확인 |
| 실제 디자인 정본 | [Figma MCP 공식 문서](https://developers.figma.com/docs/figma-mcp-server/) | 기존 디자인 컴포넌트/변수/Code Connect 읽기·편집. 서비스는 **오픈소스 아님** |
| 디자인→코드/코드→디자인 | OpenAI Codex Figma Plugin, Google Labs Stitch skills | 하나만 작은 합성 화면에 시험; 부가적인 외부 업로드·요금/좌석 확인 |
| 디자인 품질 감사 | Vercel `web-design-guidelines` | 시맨틱 HTML·키보드·초점·`prefers-reduced-motion` 감사 |
| 브라우저 검증 | Microsoft [Playwright MCP](https://github.com/microsoft/playwright-mcp), Google [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) | 기능 확인 vs 렌더/네트워크·성능 추적, 실제 학생 세션 연결 금지 |
| 컴포넌트 선택 | Meta [Astryx](https://github.com/meta/astryx) (**beta, React 19+**), Adobe [React Aria](https://github.com/adobe/react-spectrum), Microsoft [Fluent UI](https://github.com/microsoft/fluentui) | 모두 깔지 않고 현행 UI와 후보 하나만 카드/폼/검색 화면 비교 |
| 아이콘/스타일 | Google [Material Symbols](https://github.com/google/material-design-icons), Meta [StyleX](https://github.com/facebook/stylex) | 기존 아이콘/CSS를 교체할 확실한 사유가 없으면 보류. Google npm 패키지 배포 주체는 별도 확인 |
| 특수 에디터 | Meta [Lexical](https://github.com/facebook/lexical) | 실제 리치텍스트 작성 필요할 때만 도입 |

### 역할별 추가 핵심 후보 (기존 이슈 #450~#454 참조)

- 심민성: Superpowers + GitHub MCP, `code-simplifier`, Google Chrome DevTools, [Google OSV-Scanner](https://github.com/google/osv-scanner). **Microsoft AutoGen은 2026년 보관/관리 중단** 상태이므로 신규 도입 제외; 필요하다면 [Microsoft Agent Framework](https://github.com/microsoft/agent-framework)만 별도 조사.
- 박준영: OpenAI 계열 [Promptfoo](https://github.com/promptfoo/promptfoo) (2026-03 OpenAI 인수 발표, MIT/다중 모델 평가) + [OpenAI Evals](https://github.com/openai/evals) 지표/포맷, Google LangExtract. *HCX 전용 adapter가 없는 상황에서 외부 모델 API 호출 시험 금지*.
- 이의상: Google [LangExtract](https://github.com/google/langextract), Microsoft [MarkItDown](https://github.com/microsoft/markitdown), Meta [FAISS](https://github.com/facebookresearch/faiss), Microsoft [GraphRAG](https://github.com/microsoft/graphrag). 기존 PG/HCX와 비교해 비용/원문 위치 정확도 우위가 없으면 보류.
- 김채윤: Apify [Crawlee](https://github.com/apify/crawlee) NCP 내부 운영 UI, MarkItDown/구조화 출력에 대한 **사람 검수**, [Presidio](https://github.com/microsoft/presidio) **현재 커뮤니티 주도** 개인정보 탐지 결과 검토. 모든 자동 검수는 민감정보 미탐 가능성을 전제로 운영. 수집기 직접 개발 책임 부여 X.

### 도입 실험/완료 판단

- [ ] 심민성/박준영/이의상/이서연: Superpowers 유무로 **서로 다른 실제 합성 코드 이슈 1건씩** 완결. 작업 시간·계획 길이·실제 결함 검출·불필요 테스트 수·권한/호스트 hook·비용 기록. 단순 수정은 기존 작업방식 유지 선택 가능.
- [ ] 이서연: `frontend-design`+Figma, Impeccable, UI UX Pro Max 중 **최소 2개 대안**으로 동일 1개 합성 모바일 검색/장학 화면 비교. 복잡도·접근성·LCP/INP/CLS·디자인 정본 충실도·수정 시간·라이선스·서비스 가격 기록.
- [ ] Claude/GPT 각각 tool listing 및 최소 권한 확인. 실제 연결 여부를 알 수 없으면 **NOT_INSTALLED/NOT_VERIFIED**.
- [ ] 5명 모두 공통 `AGENTS.md`, 업무 책임자, RAG/NCP 자료 외부 송신 금지·공개 CI 합성 데이터 사용 검증.
- [ ] 각자 1~2개만 채택/보류·제외 결론. 실제 설치/설정 파일·새 의존성은 개별 PR/사용자 승인을 거친다.

### Superpowers와 비슷한 개발 방법론 — 대안 3종, 동시에 설치 금지

| 도구/출처 | Claude·Codex 지원/활용 | HUFS One AI 판단 |
|---|---|---|
| [Superpowers — obra](https://github.com/obra/superpowers) (MIT, 제3자) | 양쪽 공식 마켓플레이스, 명세·계획·TDD·디버깅·리뷰 | **최초 기준선**: 복잡한 기능 한 건에 적용하고 기존 PR·리뷰 규칙과 중복 측정 |
| [GitHub Spec Kit — github/spec-kit](https://github.com/github/spec-kit) (GitHub 공식) | Claude/Codex 포함 다양한 에이전트에 Spec → Plan → Tasks → Implement 및 버그 수정 워크플로 | **2차 비교 후보**: #449처럼 미설계 범위가 크고 여러 모듈 협의가 필요한 작업에만; 산출물 과다 생성 금지 |
| [BMad Method — bmad-code-org](https://github.com/bmad-code-org/BMAD-METHOD) (MIT, 제3자) | Claude/Codex 마켓플레이스 또는 CLI, 다중 역할/아키텍처/테스트 계획 | **보류**: 5인 실협업과 GitHub 업무 분장이 이미 존재해 중복 agent/문서/토큰 비용 큼 |
| [GSD Core](https://github.com/open-gsd/gsd-core) (커뮤니티) | 기존 Get Shit Done 저장소는 이전되어 현재 정본·변경 내역 검증 필요 | **보류**: 기존 gsd-build/get-shit-done에서 곧바로 설치하지 않음 |

**결정 규칙:** 첫 실험은 Superpowers로 하고, 설계가 특히 복잡한 경우 **GitHub Spec Kit만 대조 실험**. Superpowers + Spec Kit + BMad + 기존 팀 이슈 봇을 한꺼번에 강제하지 않습니다. #450이 실험 결과를 모아 공통 지침에 반영하도록 합니다.
~~~~~~~

</details>

---

## 03. `docs/CSV_HISTORY_METADATA_AUDIT.md`

<details>
<summary>원문 펼치기 (Git blob `cce1f0e5aede12bb230c00f40943e5e8823d70f8`)</summary>

~~~~~~~markdown
# 공개 Git 기록의 CSV 메타데이터 조사 — #362

**공식 게시·개인정보 동의 판정 문서가 아닙니다.** 현재 공개 저장소에 보호되어 있는 5개 원본은 사용자 지시에 따라 내용·경로·커밋 기록을 변경하지 않습니다.

## 조사 범위

- 현재 [tracked-csv-change-guard](../.github/workflows/tracked-csv-change-guard.yml)는 새로운 PR의 원본 경로 변경만 GitHub 메타데이터로 검사합니다. 이 검사나 .gitignore로 과거 공개 기록·포크를 감출 수 없습니다.
- **경로 제한:** 조사기는 과거 각 커밋의 `csv/` 디렉터리 아래 tracked blob 메타데이터만 셉니다. `csv/` 밖의 과거 CSV, 디렉터리 이동 이전 기록, 유실된 로컬 ref, 다른 포크·캐시의 CSV는 **조사하지 않습니다(UNKNOWN)**. `NO_CSV_IN_FETCHED_LOCAL_REFS`는 “이 제한된 경로에서 관측되지 않음”만 뜻하며, 저장소 전체 또는 외부 공개 노출이 없다는 뜻이 **절대 아닙니다**. 전체 노출 및 동의/권리는 별도 인적 조사입니다.
- 과거 CSV가 일반 파일(`100644`)이 아닌 실행권한·심볼릭 링크·서브모듈 모드로 기록된 경우 **AUDIT_UNAVAILABLE**가 나오며, 해당 모드는 권한 있는 담당자가 비공개로 원인을 확인해야 합니다. 자동으로 안전/무노출이라고 판정하지 않습니다.
- [로컬 기록 조사기](../tests/release/audit_tracked_csv_history.py)는 **수동 실행 전용**입니다. Git rev-list, ls-tree의 로컬 커밋/트리 메타데이터만 검사하며 Git blob 본문이나 개인 파일은 열지 않습니다. 결과는 커밋 수, CSV 기록이 있는 커밋 수, 중복 제거된 blob 버전 수, 한 커밋의 최대 파일 개수뿐입니다. 학생 파일명, 실응답, SHA와 commit 메시지를 출력하지 않습니다.
- 별도 Git 클론에는 원본 blob이 이미 포함될 수 있으므로 권한 있는 신뢰 환경에서만 조사합니다. 스크립트가 원격 fetch, git checkout, git add, 삭제/재작성은 하지 않습니다.
- shallow clone, 읽기 실패, 너무 많은/비어 있는 기록은 **AUDIT_UNAVAILABLE**로 종료합니다. 일반 CI에서는 새 unittest의 **합성 메타데이터 회귀만** 실행하며 실제 Git history CLI는 실행하지 않습니다.
- **원격 fork·미수집 refs·미러·캐시·제3자 공개 기록은 UNKNOWN**. 로컬 조사에서 0건이어도 실제 동의·권리·공개 위험이 없다는 뜻이 아닙니다.

## 수동 실행과 사람 인수

권한 있는 완전한 로컬 클론에서 명령:

    python tests/release/audit_tracked_csv_history.py

출력은 집계 건수와 owner_publication_rights_and_consent=NOT_VERIFIED를 포함합니다. GitHub 관리자/권리 담당자는 포크와 과거 노출을 별도 확인하고 김채윤/자료 제공자에게 **비공개로** 최초 동의 목적, 게시권, 공개 범위, 재식별성, 철회 절차의 근거를 인수해야 합니다. 실제 원본과 학생 개인정보를 공개 이슈/로그에 적지 않습니다.

허가된 공개판 분리/접근 제한 등은 사용자와 데이터 권리자의 승인을 받은 뒤에만 적용하며, 원본 5개나 Git 기록을 임의로 변경하지 않습니다. 따라서 **#362 OPEN / RELEASE_BLOCKED 유지**.
~~~~~~~

</details>

---

## 04. `docs/MENTOR_RELEVANCE_PRE_NCP.md`

<details>
<summary>원문 펼치기 (Git blob `4fd7eb818897c274c4db04b9c430d8b9463989a2`)</summary>

~~~~~~~markdown
# #344 현직자·졸업생 멘토 추천 — NCP 전 평가/보안 기초

> 2026-11-12 KST. 아래는 **가상 멘토 20명 × 가상 질문 30개**를 이용한 오프라인 판정·평가 계약입니다. 실제 졸업생 명단·연락처·대외 서비스·실학생이 없으며, 스스로 만든 합성 정답을 독립 전문가 Gold 또는 AI 성능 향상 증거로 간주하지 않습니다.

## 현재 구현·검증 가능 코드

- `packages/core/src/feature-additions/mentors-v2.ts` (기존): 현재 원문/사용 권리·sourceRevision 검증, mentor 활성·동일 ID 충돌 격리, 전공·직무·학생이 승인한 경험 코드의 결정적 weighted/Jaccard 유사도. 캠퍼스·언어 hard filter에 어긋나거나 철회된 멘토는 후보 제외. `APPROVED` 모델 결과도 허가된 최대 15 후보·실근거 코드/버전 digest 검증을 거쳐 **완전한 세트**일 때만 적용.
- [추가] `mentor-evaluation.ts`: 별도 손으로 만든/독립 검수된 `mentorId → relevance (0/1/2)` 표와 순위 목록을 받아 **nDCG@5·Recall@5·MRR@5**를 계산하는 bounded 순수 함수. 중복 레이블·허위 멘토 ID·불가능한 k·등급을 거부하고, **관련 멘토가 없는 질문에는 100% 점수를 꾸미지 않고 null**을 반환. 개인정보·전공별 편향 점수 또는 모델 통신 없음.
- [추가] `mentor-evaluation.test.ts`: 가상 멘토 20명과 30개 합성 질의/고정 평가 등급을 생성해 현재 권리·후보·경험 근거/점수 범위·metric 계산 경계를 검사. 이 오라클은 **자체 합성 정답**이므로 실제 관련성/편향/적중률을 실증하지 않습니다.
- 현재 명시적 실 HCX port/발송 API/멘토 연락처에 연결하지 않습니다. AI 사용이 불가능하면 `modelOutcome:'NOT_REQUESTED'`인 **규칙 추천**만 검증하며, 이미 있는 모의 AI 재정렬 테스트는 실 공급자 호출 증거가 아닙니다.

## NCP/실사용 단계에서 추가 구현·수락할 일

1. **실제 멘토의 명시적 등록/공개·경력·학교 소속/전공·연락 동의**와 기록 검증, 관리자 삭제/기록 정정, source/권리/기관 계약, 민감 식별 정보 보호. 학생의 자기 승인 경험만 사용, 원문 이력서·GPA·민감 개인정보를 불필요하게 AI에 전달하지 않기.
2. 검수된 **멘토 20명 이상·질문 30개×0/1/2 관련성 등급을 독립 전문가가 작성**. 이 문서의 자동 합성 판단표를 독립 Gold로 전용 금지. 후보 ID/모델 버전/권리판본을 같은 조건에 고정한 AI 모델 유무 비교, 실제 nDCG@5·Recall@5 값과 통계적 변동성 기록. 값이 없으면 `NOT_RUN`, 모델이 없으면 AI 성능 비교 불가.
3. 독립 승인된 mentor postgres 권리/consent/RLS adapter, actor 인증·쿼터·전용 목적·CSRF/동시 조회·권리철회/429/503 fail-closed API, 접근성 있는 멘토 카드 UI/전공/직무/프로젝트 근거 목록 비교와 연락·신청 기능 별도 승인.
4. 무관한 인기 멘토가 유사한 승인 경험·프로젝트 근거를 이길 수 없는지, 고유 ID·AI 환각 근거/새 출처·친족/학교 민감 사항 편향, 소수 표본/학과별 편중, 320~1440px 키보드·스크린리더/실학생 피드백 동의를 독립 검증.

**상태:** NCP `NOT_CONNECTED`, 공식 멘토·권리/Gold·실AI `NOT_RUN`, 사용자 연락·학교 보증 불가, `RELEASE_BLOCKED`, #344 OPEN.
~~~~~~~

</details>

---

## 05. `docs/NCP_INGESTION_CONTRACT_DRAFT.md`

<details>
<summary>원문 펼치기 (Git blob `9dcb2aac25f1bf323ba7eca35d2c119524b95078`)</summary>

~~~~~~~markdown
# #449 — NCP 데이터 계약 사전 구현 (제안/NOT_APPROVED)

이 문서와 `packages/contracts/src/ingestion/ncp-data-draft.ts`는 **실제 소스·NCP 서버·DB에 접근하지 않는 타입 계약 초안**입니다. `NcpIngestionDraft` 네임스페이스를 통해 데이터 파이프라인 담당자가 합성 fixture로 미리 합의할 수 있습니다. 이 코드를 실제 서비스 경로/SQL에 조립하지 않았고, 현재 운영 스키마로 승인한 것이 아닙니다.

## 선행 합의 가능한 계약
- 소스 발견 등록: `sourceId,canonicalUrl,permissionRef,publisher,sourceClass,observedAt` 및 COLLECT/STORE/SEARCH/EXTERNAL_TRANSFER 각각의 권리 플래그. URL·권리 플래그가 있다고 독립적인 운영자 허가가 생기는 것은 아닙니다.
- 원본/정규화 바이트 SHA와 NCP 비공개 원문 객체키 구분. 발행/수집/검수 시점·독립 검수자를 분리합니다.
- 상태 `DISCOVERED → FETCHED → PARSED → NEEDS_REVIEW → APPROVED → ACTIVE` (실패/철회 별도). **실제로 상태를 바꾸는 DB 트랜잭션은 구현하지 않았습니다.**
- ACTIVE에는 별도 승인, 원본·정규화 해시 검증, 검수자≠수집 작업자, 검색 목적의 권리 승인이 필요합니다. SYNTHETIC 자료는 ACTIVE로 승격 불가.
- `gitSha,buildSha,migrationVersion,adapterVersion,datasetRevision,schemaVersion`와 reader 지원 범위는 배포 전 비교 가능한 순수 함수. 운영 migration 실행/롤백/서명/수집기는 범위 밖입니다.

## NCP 연결 전/후 경계
사전 구현 가능한 것은 **객체 형태·유효성 검사·일부 승격 불가 조건과 합성 테스트**입니다. NCP 실행/허가된 실제 URL/Gold/사람 검수/백업/요금·크레딧 확인은 이 PR에서 수행하지 않습니다.

**미설계로 유지:** 고위험 분야별 검수 비율/자동승격 허용 여부, RPO/RTO, 실제 NCP SKU/스토리지·IAM, 유지기간·삭제/철회 SLA, HWP/HWPX 파서, 사이트별 주기·예산, 검색 인덱스/캐시 원자적 교체, 운영 migration 파괴적 변경 승인. 이슈 #449의 체크리스트를 본 PR만으로 완료 처리하지 않습니다.

관련 [#445 수집·갱신](https://github.com/ot4562-glitch/HUFS-One-AI/issues/445) · [#446 독립 검수](https://github.com/ot4562-glitch/HUFS-One-AI/issues/446) · [#447 서비스](https://github.com/ot4562-glitch/HUFS-One-AI/issues/447).

## 필드 수준 미지수와 정정·취소 증거

- `NormalizedEvidenceRecordDraftSchema`는 `KNOWN / UNKNOWN / NOT_APPLICABLE`을 구분합니다. VERIFIED/KNOWN 필드는 같은 source revision의 실제 paragraphId에 연결되어야 하고, 누락/비적용 필드는 이유만 가지며 임의 값을 추측해 채우지 않습니다.
- `SourceChangeDraftSchema`는 새 판본이 **어느 과거 판본을 CORRECTED/REPLACED/CANCELLED 했는지**와 새 판본 근거를 기록합니다. URL 변경만으로 자동 취소하지 않으며 운영에서 사람이 권한·근거를 검토해야 합니다.
- 두 계약은 합성 데이터 타입/반례 시험을 위한 **초안**입니다. 문단 ID 실제 존재, 정정 시간 순서, PostgreSQL 활성화/검색 캐시 철회는 NCP DB 트랜잭션이 따로 검증해야 하므로 미완료로 남깁니다.

## 웹 후보·robots·terms 검토 계약 (합성 전용)

`CrawlScopeDraftSchema`는 출처별 허용 후보 경로와 robots/약관 검토 상태를 `UNKNOWN / REVIEWED_PERMITTED / RESTRICTED`로 구분해 기록합니다. `DiscoveryCandidateDraftSchema`는 같은 출처 origin에서 발견한 링크를 `REVIEW_REQUIRED`로 인계하고 **발견 자체가 자동 수집·권리 허가가 아님**을 보장합니다. 실제 robots/약관 판독·독립 확인·수집 요청 상한·운영 원장의 적용과 승인 여부는 NCP에서만 최종 결정합니다.

## 수집 후보 → 인적 검토 DTO 연결 (NCP 설치 전)

`prepareDiscoveryReviewDrafts`는 Crawlee/Cheerio가 **이미 허가받아 읽은 바이트**에서 뽑은 최대 100개 링크 제안을 `DiscoveryCandidateDraft`로 변환하고, 현재 입력된 동일 출처 origin·경로 prefix 범위 밖 URL과 중복을 제외합니다. 반환 항목은 오직 `REVIEW_REQUIRED`이며 자동 enqueue·수집·권리 확인·ACTIVE 승격은 없습니다. 예제는 합성 도메인만 사용하고 실제 소스/운영 registry는 NCP 비공개 원장에만 보관합니다. `UNKNOWN` robots/terms도 검토할 후보는 만들 수 있지만, 실제 수집 권한을 뜻하지는 않습니다.
~~~~~~~

</details>

---

## 06. `docs/OWNER_V2_CATALOG_POSTGRES_SOURCE.md`

<details>
<summary>원문 펼치기 (Git blob `6746c59a3cceae9648ceccbeabd2fa8836dfcb24`)</summary>

~~~~~~~markdown
# #447 — Owner V2 approved catalog source (NCP-independent implementation)

The existing GET `/api/owner/features/v2/catalog` accepted a trusted source
port but had no PostgreSQL implementation. The opt-in
`PostgresOwnerV2CatalogSource` is now a SELECT-only adapter built on the
existing `PostgresApprovedOwnerReader`. It reads a **new independently
reviewed** `V2_CATALOG` projection kind and checks the actor, consent,
currently authorized SEARCH source/permission pairs, immutable original and
review hashes, current active source HEAD/revocation, receipt time, and
corresponding projection payload under one repeatable-read snapshot.

Each V2 item must contain the **actual independently curated**
`FeatureAdditions.OpportunityCatalogItem` including source revision ID,
verified evidence span IDs and permission state. No item, semester, deadline,
eligibility, approval or evidence is inferred from demo/legacy records. A
provided `sourceUrl` is compared **exactly** with the current private
`source_rights_receipts.canonical_url` for the source/permission pair.
Cross-site and same-domain-but-different-page citations are rejected.

### Private operator assembly (after approvals only)

1. Review and optionally apply `infra/sql/20261111_owner_v2_projection_kind.sql`
   **after** the original owner projection migration. The new kind adds no
   grants, default roles, inserts, activation or new source records.
2. Independently provision a *read-only* role and the existing trusted
   `OwnerCatalogAuthority`, source-rights and reviewed V2 projection writers.
   Insert only operator-verified V2 payloads with exact approved source
   receipts and authentic evidence spans. The API never populates these rows.
3. Construct `PostgresApprovedOwnerReader(pool,authority,clock)`, pass it to
   `new PostgresOwnerV2CatalogSource(reader,clock)`, then supply that source,
   the separately keyed `CatalogCursorSigner`, and
   `PostgresOwnerV2CatalogQuota` in `ownerV2Catalog` operator config.
   Partial three-port activation is forbidden by the existing API.
4. The new source revalidates actor consent, rights, source HEAD, canonical
   URL and the exact snapshot fingerprint on each response. 30-second
   in-process receipts are **only lookup references**, never permission
   grants; unknown/expired tickets deny. Real deployments require session
   affinity or a separately reviewed distributed receipt design.
5. The inherited **unpaged** reader still stops at 500 approved rows
   per actor and the current HTTP route has a 2,000-row input ceiling.
   As a separately callable, non-HTTP operator primitive,
   `PostgresApprovedOwnerReader.readV2KeysetPage` now pages 1–50
   `V2_CATALOG` rows at a time by actor/kind/entity_id (C collation)
   using a partial index. A **lookahead row also goes through all** current
   consent, projection hash, exact source revision, rights and independent
   attestation checks before `hasMore` is exposed. The 1,250-row disposable
   PostgreSQL regression covers 25 pages, duplicate-free order, RLS index
   metadata and revocation.
6. These individual page fingerprints are **not** stable whole-catalog
   versions and are intentionally NOT accepted as cross-page public cursors.
   A trusted whole-catalog revision/evidence epoch bound to full actor grants,
   source rights and HEAD changes, plus database-side filters matching the
   pure search semantics (including Korean normalization), are still needed
   before changing the actual HTTP `TrustedOwnerV2CatalogSource` activation.
   Never return unverified total counts or call all actor rows 'approved'
   merely because page 1 was valid.

Synthetic test: `tests/api/owner-v2-catalog-source-postgres.test.ts`.
No production PostgreSQL/NCP/real student data migration, independent Gold or
human rights approval was run. `NOT_CONNECTED / NOT_RUN / RELEASE_BLOCKED`
remains the correct status until an operator explicitly supplies the private
data, current rights, and reviewed deployment.
~~~~~~~

</details>

---

## 07. `docs/OWNER_V2_CATALOG_QUOTA.md`

<details>
<summary>원문 펼치기 (Git blob `a691ed3aec3c64745a29a98940908fc135737f0d`)</summary>

~~~~~~~markdown
# #447 — V2 owner catalog durable quota (pre-NCP)

`PostgresOwnerV2CatalogQuota` provides the **existing**
`TrustedOwnerV2SearchQuota` interface for the private owner V2 search route.
It is replica-shared via a PostgreSQL security-definer function with a
purpose-separated, 32-byte minimum HMAC key. Only digests, minute buckets
and counts are stored, never actor IDs, student details or search text.

**Fail-closed deployment:** the migration creates an **empty** quota policy
table. Until the owner approves a per-minute limit between 1 and 120 and an
independent operator enters it, every call fails closed as an operator
configuration error (`PROVIDER_UNAVAILABLE`), **not** a misleading
per-actor `RATE_LIMITED` response. Actual quota exhaustion returns false
and maps to `RATE_LIMITED`. The SQL file does not
automatically grant EXECUTE, create roles, or enable catalog data sources.
Only a reviewed operator role can call the function. DB time, rather than an
untrusted browser clock, is authoritative, and one UPSERT arbitrates concurrent
requests across replicas. Retention cleanup, separate SQL roles, backup and
release-time quotas require approved NCP operations.

After migration review, provide the port as
`ownerV2Catalog:{source,signer,quota:new PostgresOwnerV2CatalogQuota(pool,key)}`
in the existing operator application configuration. The `source` must still
recheck **current consent, actor/source rights and publication HEAD** and
the `signer` must be a secret server-held cursor signer. This quota does
**not** turn on a real catalog or grant rights.

**Verification:** `tests/api/owner-v2-catalog-quota-postgres.test.ts`
uses synthetic SQL fake and tests invalid input, fail-closed responses,
digest separation and no DB connection during construction. NCP SQL apply,
operator grants/policy, real load, backup/restore and rates are **NOT_RUN**.
~~~~~~~

</details>

---

## 08. `docs/PUBLIC_SOURCE_PRIVACY_362.md`

<details>
<summary>원문 펼치기 (Git blob `ee606b8e8668fe042f83d995040988c321ad458b`)</summary>

~~~~~~~markdown
# Public tracked CSV exposure review — #362

**Status: OPEN / HUMAN RIGHTS REVIEW REQUIRED (2026-11-09).**

Five previously committed original CSV files under `csv/` are already tracked in the **public** repository. A `.gitignore` entry does **not** hide existing tracked objects or remove historical downloads or forks. This status is **not** a finding that anyone violated a law and not proof of a privacy breach; publication rights and reidentification risks remain unverified. Existing original names, data and history are not copied into this file.

## Executable containment

The metadata-only [protected CSV PR gate](../.github/workflows/tracked-csv-change-guard.yml) rejects *new PR changes* to either the previous or current `csv/` path (including renames/removals), case-variant aliases, and **byte-identical copies of the already tracked original blobs under any other path** by comparing Git tree and PR file SHA metadata. It **does not checkout, print, transform or read** those original files. GitHub workflow permissions are read-only. Existing [release boundary verification](../tools/verify_release_boundary.py) continues to protect distribution bundles. CI cannot identify edited, reformatted or partially copied versions solely from blob hashes, nor revoke already public Git objects, forks or local downloads. PR file lists over 3,000 or truncated base trees are denied pending private review. Do not interpret a successful gate as consent or remediated historical exposure.

## Restricted human review (record outside public GitHub/CI)

For each of the five tracked originals, privately capture:
- Data owner and publication decision maker, original collection scope and intended student/competition/public uses
- Explicit permissions for **public raw CSV distribution**, search indexing, derived summaries, screenshot/demo, OCR/AI transmission, retention and withdrawal; record separately, never infer one permission from another
- Indirect identifiers (course combinations, response details and file basenames), linkage/reidentification risk, and whether every affected participant approved the *actual public scope*
- Date/time and reviewer, evidence location outside the repo, proposed mitigation and consent withdrawal/contact process
- Public Git history, PR attachments, GitHub Pages output, caches, tags, forks and existing links assessment by maintainers

A private worksheet may mark each original **APPROVED_FOR_RAW_PUBLICATION**, **NOT_APPROVED** or **UNKNOWN**. `UNKNOWN` is **not** public reuse permission. Never place identities, raw rows, file basenames, consent proofs or contact details in public issues or Actions logs.

## Decision and response

1. Project owner + data/rights reviewer reconcile source-by-source public scope and document a written decision in a restricted channel. Public repository source code must not infer this from regex scanning alone.
2. **Until confirmed:** no new use of these originals in CI, demos, hosted assets, AI inputs, derived indexes or new PRs. Continue preserving files unchanged under current instructions; do not force-push, untrack, delete, overwrite or rewrite Git history.
3. If rights are denied or exposure is actionable, involve the data owner and project administrator to agree on safe publication/visibility actions, historical object/fork notifications and notices. Any deletion/rewrite/visibility change requires explicit informed approval and a rollback plan; this PR takes none of those actions.
4. Verify concrete public URLs/build artifacts and any retained copies after the human decision. Record closure evidence privately and publish only a nonsensitive decision summary. A PR guard passing is not an issue closure criterion.

**Unresolved:** participant-specific permission and lawful use review, historical exposure/remediation scope, actual forks/caches and human sign-off. Issue #362 must remain open. This file does not authorize anyone to modify or remove original data.

[Issue #362](https://github.com/ot4562-glitch/HUFS-One-AI/issues/362) · [AGENTS policy](../AGENTS.md) · [Data governance](DATA_GOVERNANCE.md) · [Release status](../STATUS.md).
~~~~~~~

</details>

---

## 09. `docs/SCHOLARSHIP_PRE_NCP.md`

<details>
<summary>원문 펼치기 (Git blob `fb8d2f98f28a33ed1f095de3fc22f33207128a19`)</summary>

~~~~~~~markdown
# #343 장학금 자격·준비 체크리스트 — NCP 연결 전

> 2026-11-12 KST. 학생의 **자기신고**와 승인된 공식 출처/학업 자료 증거를 구별하는 코드 인수 범위입니다. 학교의 장학금 지급·합격/접수·공식 지원 자격 판정이 아니며 실제 장학금 지급에 사용할 수 없습니다.

## 합성·NCP 전 구현

- 기존 `checkScholarship` (`packages/core/src/feature-additions/scholarships-v2.ts`)은 서명된 현재 source 검증, 조건별 필수/선택·`ALL/ANY` 삼상 상태를 계산하고, 검증된 출처/학업 사실이 없는 경우 `UNKNOWN`, 본인 미공유 GPA/학적·장학 중복 수혜를 `MET`으로 승격하지 않습니다.
- 기존 `apps/api/src/modules/owner-preparation-http.ts`는 검증된 **BETA owner**, 별도 전용 목적/consent·권리·최신 head·지속 가능한 요청 제한 source port를 운영자가 주입한 경우에만 장학·배지 준비 상태를 리턴합니다. 없으면 `NOT_CONNECTED`. `officialDecision:null`, 지원서/실수혜 원장 DB 쓰기 없음.
- [이번 회차] `OwnerPreparationPanel`은 장학금별 `groups[]/conditions[]`를 펼쳐 **필수/선택 조건, 묶음 ALL/ANY, 충족/미충족/확인 필요, 문단 span ID, 부족 증빙 키**를 보여 줍니다. 원본 GPA·가구소득 등 숫자값은 표시하지 않고, 공식 지급·자동 지원을 수행하지 않습니다. owner 세션 epoch·권한/기능 kind/port 변경이나 unmount 시 늦게 돌아오는 옛 API 응답은 폐기합니다.
- 승인되지 않거나 취소/철회된 출처에는 규칙의 달력상 모집기간이 있더라도 `OPEN`을 표시하지 않고 `UNKNOWN`으로 격리합니다.
- `scholarships-offline-matrix.test.ts`: GPA 0~4.5 **24개 개별 독립 합성 오라클**, 승인/권리/학기/캠퍼스·증거 불일치·중복 조건/미래 학업 데이터의 반례, 지급 결정 누락 보장.
- `OwnerPreparationPanel.test.tsx`: 조건별 출력/개인 수치 미출력, `NOT_CONNECTED`, 기능 전환/소유자 권한 변경 중 오래된 결과 격리, 미확인 규정 checklist 보류. 최신 HEAD CI 결과와 사람의 독립 승인 여부는 PR에서 확인해야 합니다.

## NCP 연결 전에도 남아 있는 코드·자료 인수

1. **실제 장학 모집요강 12건 이상**의 기관/학년도·학기·유형·필수 서류·조건별 원문 문단/bbox·정정/철회/중복 조건 충돌 등 독립 source registry 검수. 합성 fixture를 실규정으로 표시하지 않음.
2. 학교의 실제 학업/성적·수혜 기록과 소득/가구의 **학생별 동의/목적 제한·현행 권리·RLS·철회/삭제** 확인. 동의하지 않아도 일반 공고 조회 가능해야 하고, 근거가 없으면 `UNKNOWN`.
3. 승인된 계약 아래에서 `GET .../scholarships`+서명 커서·`POST /:id/check`의 제한/409/422·운영 학기 버전과 SSR/CSRF 인수, DB schema/PG 테스트 및 공식 제출 링크 연결. 현재 이슈에서 원래 제안한 두 엔드포인트는 **아직 추가되지 않았고**, 합성 BETA 준비 조회 API만 존재합니다.
4. `/notices` 장학 카테고리/캘린더·행동계획 연결, 실제 신청 마감 vs 학내 행정 마감 분리, 검증되지 않은 금액/장학 가능성을 허구로 예측하지 않는 화면, 320~1440px 키보드/스크린리더 QA.
5. 익명/REVIEWER/BETA A/B와 교내 권리·비밀·API/RLS/429/503·실제 학생 E2E 및 독립 Gold; 최소 24 합성 회귀가 **독립 사람이 만든 Gold를 대체하지 않음**.

**상태:** `NCP NOT_CONNECTED`, 실학교 출처 사용권·인간 Gold·실학생 E2E `NOT_RUN`, `RELEASE_BLOCKED`. 이슈 #343 OPEN.
~~~~~~~

</details>

---

## 추가 통합 기록 · `docs/EXCHANGE_PRE_NCP.md`

<details><summary>원문 펼치기 (Git blob `1a2ee4b4e4a84bcbfc54b4a13a6a616a3cbcad4c`)</summary>

~~~~~~~markdown
# #340 교환학생 지원 조건 비교 — NCP 연결 전 개발/인수

> 2026-11-12 KST, 합성 대학·합성 규칙만 검증한 코드 경계입니다. 학교의 실제 합격·서류 제출·학점 인정·모집 마감에 대한 공식 판정이 아닙니다.

## 이번 단계에서 실제로 구현한 것

- `packages/core/src/campus-assist/exchange.ts`: 소스 판본/asOf/KST 유효일, 경로 OIA/DEPARTMENT·기간/학기/학적/평점/편입/취소/어학과 검수된 해외대학 추가 기준을 결정적으로 비교. 누락/중복/권리 철회 규정은 `UNKNOWN` 또는 차단, 현재 적용되는 단 하나의 검수판본만 평가. 기존 합성 자격 결정표가 있습니다.
- `apps/api/src/modules/campus-assist-http.ts`: 주입된 공식/검수 데이터 port가 있을 때만 BETA actor 인증·권리 receipt 재확인 후 파견대학 목록과 자격 결과 제공. NCP 미연결이면 그 port 자체가 없습니다. 학점을 프런트 모델/로그에 저장·전송하는 추가 AI 기능은 없습니다.
- `apps/web/src/features/campus-assist/OwnerPanels.tsx`: 서버에서 검증받은 파견대학을 **최대 3곳** 같은 `asOf`와 같은 자기 입력으로 독립 비교. 파견경로 `partnerId+track`을 별개 식별, 결과 판본 충돌·인증 전환·필터 변경·어느 한 API 실패 시 전체 비교 격리. 각 대학 공식 원문 링크/판본을 보여 줍니다.
- `packages/core/src/campus-assist/exchange-preparation.ts`: 검증받은 `ExchangeResult`의 **7개 규칙 검토 결과**로부터 대학별 안내 체크리스트만 만듭니다. URL·정확한 판본·asOf가 일치하지 않으면 `STALE_POLICY`로 안내를 보류합니다. `PASS`도 학생 **자기신고 입력**과 공통 규정의 비교일 뿐 실제 학교 검증 성적이 아닙니다. `FAIL/UNKNOWN/NOT_APPLICABLE`는 명확히 분리합니다.
- **모집 마감일·확정 신청 일정/학점 인정 계획이 없는 계약에서는 날짜를 만들지 않습니다.** 실제 지원서 작성·제출·학점 인정·비자 판정은 제공하지 않습니다.
- `exchange-preparation.test.ts`, `OwnerExchangePanel.compare.test.tsx`와 기존 `exchange.test.ts`의 합성 회귀; 최신 HEAD의 테스트 결과와 동료 승인 여부는 GitHub Actions/PR 리뷰를 별도로 확인해야 합니다.

## NCP/실자료 연결 이전 미완료

1. 공식 OIA·학과·파트너별 최신 모집공고/파견 대학 요강의 **원문 사용·지속 보관·AI 전송 권리**, sourceRevision·공고 유형·학년도/학기·경로·예외의 독립 검수.
2. 일반 소개 vs 모집연도/학과/파트너 특칙의 우선순위 계약과 잘못된 중복·미효력·권리철회 quarantine, source manifest·변경 알림·재평가.
3. 학생 본인의 **실제 학적/성적/어학 자료**는 별도 동의·목적 제한·RLS/철회/삭제와 원본 비저장 원칙이 확보된 뒤에만 연결. 현재 입력은 개인 자기신고로만 취급.
4. 최신 공고에 명시된 **실제 공식 제출기한/시험 만료/서류·비자/학점 인정 일정**이 검증될 때만 캘린더·What-if와 연계. 일반 연례 예상과 공고 확정을 섞지 않음.
5. 공식 선발 담당자·실학생/교환학생 코디네이터의 독립 Gold·학년도 경계·캠퍼스/트랙·320/360/390/768/1440px 키보드/스크린리더 테스트, 권리 변경·동시 다중탭·NCP 401/403/409/429/503 확인.

**상태:** 합성 코어·웹/비교·준비 체크리스트는 NCP 없이 개발 가능. `NCP NOT_CONNECTED`, 실제 학교 자료/학생 권리/Gold `NOT_RUN`, `RELEASE_BLOCKED`. 이슈 #340 OPEN.
~~~~~~~

</details>

---

<a id="owner-track-release-evidence"></a>
## 추가 통합 기록 · `docs/OWNER_TRACK_RELEASE_EVIDENCE_20261106.md`

<details><summary>원문 펼치기 (Git blob `5ca72225b532d480c632487272318b42ab214751`)</summary>

~~~~~~~markdown
# HUFS One AI — 코드·원본·운영 실행 증거 원장 (2026-11-06)

> **현재 업무 배정 주의(2026-11-08):** 이 문서의 이전 시점 담당 이슈 #317·#321–#325 및 당시 인수/운영 분장은 **역사적 기록**이다. 현행 정본은 [루트 AGENTS](../AGENTS.md) · [업무 자동 배정 플레이북](ISSUE_ASSIGNMENT_PLAYBOOK.md) · [팀 역할](WORKSTREAMS.md)이다. 고정 역할 #355–#359는 **완전 읽기 전용**으로 수정·댓글/담당 변경을 하지 않는다. 신규 추가기능은 **심민성 최초 배정·가능한 비AI 코드 직접 구현 → 코드 기반 AI까지 포함해 박준영/이의상에게 AI 구현 인계**한다. 공식 문서·포스터·Gold 자료가 필요하면 **별도 `[데이터 요청]` 이슈**를 김채윤에게 만들고 원 기능에도 김채윤을 공동 assignee로 추가한다. 현재 13개 기능의 요청은 [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)이다. 김채윤은 사용자 관점 경량 시연, 박준영은 AI 제품 기술 QA, 이서연은 실제 웹 디자인/배치, 심민성은 전 과정 검수를 맡는다.


> **기준:** `OWNER_CONFIRMED_APPROVED`는 프로젝트 승인이다. 개인별 현재 동의·권리, 실 Google/학교메일·NCP/TLS·DB CA·모델·운영비·실학생·사람 인수 통과를 의미하지 않는다. 운영 책임은 [이서연 #323](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323), 전체 보안/DB·출시 게이트는 [심민성 #325](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325)으로 분리 인수. 현행 구현 상태 [STATUS](../STATUS.md).

## 2026-11-07 당시 이슈 분리·담당 배정 — 역사적 기록 (현행 배정 아님)

| 현재 OPEN 7개 | 담당 |
| --- | --- |
| [#321 이의상 AI/NLP](https://github.com/ot4562-glitch/HUFS-One-AI/issues/321) | `uisang2004-maker` |
| [#322 박준영 AI·학업](https://github.com/ot4562-glitch/HUFS-One-AI/issues/322) | `taewangim-alt` |
| [#323 이서연 NCP 서버](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323) | `lhh42001` |
| [#324 김채윤 시연/검증](https://github.com/ot4562-glitch/HUFS-One-AI/issues/324) | `qamarrchae` |
| [#325 심민성 통합/릴리스](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325) | `ot4562-glitch` |
| [#317 추가 기능](https://github.com/ot4562-glitch/HUFS-One-AI/issues/317) | `ot4562-glitch` |
| [#318 UI/UX](https://github.com/ot4562-glitch/HUFS-One-AI/issues/318) | `lhh42001` |

구 통합 [#316](https://github.com/ot4562-glitch/HUFS-One-AI/issues/316)은 기존 POST-01~20을 개인별 #321~#325로 중복 없이 옮긴 뒤 **CLOSED(이관)**했습니다. 추가 기능 #317→심민성, UI/UX #318→이서연; 각 OPEN 이슈는 담당자 1명입니다. 이전 이슈 본문/댓글은 이력 보존. **코드/합성 PASS는 실제 NCP·학교 데이터·실 AI·사람 수락 완료를 뜻하지 않으며 `RELEASE_BLOCKED` 유지**.
## 이전 운영 증거 기준 (2026-11-06 원장 기록)

**이 표의 이전 PR #267~#304는 개별 SHA의 당시 검증 기록입니다.** 현재 기준은 본선 이전 11개 이슈를 종결한 [PR #306](https://github.com/ot4562-glitch/HUFS-One-AI/pull/306)(merge `462f6d3`) 및 합성 홈·공고 인터랙션 [PR #307](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307)(merge [`d8e2144`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/d8e2144184d06577ff76d8e5e1ed3a13be09af4c))입니다. #307 PR HEAD와 병합된 main SHA는 각각 TASK-00·Chrome·NCP·Pages 4/4 성공으로 별도 검증했으며, [#305](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305)는 `main` 대비 변경 파일 0개인 중복으로 리뷰 후 미병합 종료했습니다. **본선 이전 11개는 CLOSED(10 completed, #260 이관 not_planned)**이고, 이 문단의 2026-11-06 당시 후속 #276/#280–#283·신규 제품 #297–#303은 OPEN이었으나, 2026-11-07 이후 현재 **#276·#298·#255만 OPEN**이며 나머지는 통합 CLOSED입니다. 실제 운영 `RELEASE_BLOCKED`는 같습니다. 추가 문서 SHA의 CI는 그 SHA에서 다시 확인합니다.

## 병합된 PR 근거

| 코드/자료 | PR 또는 commit | 확정된 사실 | 여전히 미검증 |
| --- | --- | --- | --- |
| 운영 API/계약/권한·AI budget/Source/경험 HTTP | [#267](https://github.com/ot4562-glitch/HUFS-One-AI/pull/267)~[#275](https://github.com/ot4562-glitch/HUFS-One-AI/pull/275) 중 실제 합병된 #267/268/269/270/272/273/274/275 | 단계별 코드·합성/일회용 PG·브라우저/오프라인 CI | 실제 운영자 키·Google·DB·CLOVA·학생 실동의 |
| BETA 본인 CSV 학업 화면/운영 요청 포트 | [#277](https://github.com/ot4562-glitch/HUFS-One-AI/pull/277) MERGED | 5개 CSV SHA 보존, `/api/private-intake/self` 브라우저 계약, BETA 읽기 UI와 인증된 actor 요구 | 실제 operator private registry/loader와 4명 매핑·로그인/DB readback |
| 전망/rolling-origin 8학기·NOTICE_ONLY | [#278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278) MERGED (`5a36a38`) | `forecast-offering-v2`, 합성 경계·정합성 테스트, PR HEAD 4/4 CI | 학교 8학기 정식 목록·과목 동등성·실사용자 공식 판단 |
| 추천 코퍼스·경험 승인 신호 | [#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279) MERGED (`48134da`) | 40+10 합성 분포, 키워드/인용·동의/버전·철회·결정론 테스트, PR HEAD 4/4 CI | 실출처·독립 Gold·공식 실원본 권리·사람 검수; 뒤의 PR #286/#306에서 합성 revision chain·경험 UI 연결 추가 |
| 비전공자 설치/제품 안내 | [문서 commit `a0043c5`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/a0043c569dd0518919b9f3ed243c9d8836a66403) | 새 가이드 3개와 README 하단 중요 문서 연결 | 실제 NCP/제품/에이전트 설치 **NOT_RUN** |
| 학점 독립 참조모형/예산 경계 | [PR #292](https://github.com/ot4562-glitch/HUFS-One-AI/pull/292) MERGED (`e0a5b73`) | AREA_SPREAD/GROUP_CHOICE 작은 입력 참조모형, 5만회 탐색 예산 초과 보류·1000과목 단일영역 회귀; PR HEAD CI 4/4 | 공식 학칙/학생 원장, 큰 다중영역 전수 대조 |
| 학사공지 검증 판본·clean 벤치 | [PR #293](https://github.com/ot4562-glitch/HUFS-One-AI/pull/293) MERGED (`02e7d91`) | 합성 5 revision 시나리오, VERIFIED mock claim·학생/행정 마감 분리, 2회 clean HEAD 정규화 벤치; PR HEAD CI 4/4 | 실제 권리/원본, 추천 보고서 별도 시나리오·운영 p95 |
| 미확인 과목 동등성·전망 | [PR #295](https://github.com/ot4562-glitch/HUFS-One-AI/pull/295) MERGED (`81a9f53`) | `forecast-offering-v3`, 원장/전망의 불확정 입력 보수 판정·합성 검증; PR HEAD CI 4/4 | `COURSE_IDENTITY_API_CONNECTION=NOT_CONNECTED`; 실데이터 132행·공식 RulePack/actor mapping |
| 합성 UI/Pages S04 분리 | [PR #304](https://github.com/ot4562-glitch/HUFS-One-AI/pull/304) MERGED (`5c17255`) | 공통 헤더/폼·지원보드/보관함, S04 public Pages 기본 revoke 제거, 정적 Pages 자동 재배포 보존; PR HEAD CI 4/4 | 학교 로그인/4명 독립 권한/실 UX·캐시·AI 호출 |

기존 대형 PR **#264는 분할 대체로 미병합 종료**. #252/#253/#257 완료/종료 후 잔여 운영 업무는 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)에 이관. 과거 코드 통합 기준 [`48134da`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/48134dae3b16157ebcc294f744c320fdd64a115c)의 [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752742) · [Chrome](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752741) · [NCP offline](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752743) · [Pages synthetic](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752761)은 **4/4 SUCCESS**. 이 기록은 정확히 **해당 SHA에 한정**되며 문서 커밋 이후의 HEAD CI는 다시 확인한다.

## `csv/` 다섯 원본의 현재 상태(공개 자료 내용 재인용 금지)

- Forms **1개**, 표 구조 **26열·4개 응답**; 수강 CSV **4개·총176행·6열**, **학수번호 공란 132행**. 과거 ‘수강 CSV 3개/총128행/4번째 부재’ 기록은 **2026-11-06 복구 이전의 불완전한 검색 결과**이며 현행 상태가 아니다.
- Git의 **정확한 다섯 원본 파일 경로/blob SHA**를 `tools/verify_release_boundary.py`에서 검사한다. 무단 삭제·수정·이동·재인코딩 금지; 추가 CSV/키·SID/identity map은 공개 반입 금지. 권리자 철회·삭제는 별도 법적 의무에 따름.
- 파일은 Git에 있다고 자동으로 로그인 사용자와 연결되지 않음. **실제 Forms row↔CSV 파일↔본인 BETA actor↔동의·rights·해시**의 비공개 attest/DB source·회수 검증이 필요. 과목코드 공란 때문에 공식 course identity/RulePack·학점 사정 확정은 `UNKNOWN/NEEDS_REVIEW`.
- PR #277은 BETA UI/route 연결 **코드**이고 운영용 `OperatorPostgresInputs`·실비밀 factory·loader·4명 identity attestation은 **현장 구성/추가 조립 검증 필요**. 실 NCP/PG로 import/readback을 수행한 증거 없음.

## 당시 #292/#293/#295/#304 통합의 운영 경계 (과거 SHA에 한정)

네 PR의 각 **PR HEAD** GitHub Actions 4/4 SUCCESS를 확인하고, 사용자의 일괄 병합 지시에 따라 squash merge했습니다. GitHub 리뷰는 `COMMENT` 중심이며 독립 사람의 `APPROVED`가 아닙니다. 당시 최종 코드 `main` SHA는 [`5c17255`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/5c172552a8145cec61ac8f1729b60b1514fc965d)였습니다. **이후 #306/#307이 병합됐으며 현행 기준은 문서 상단과 STATUS를 따릅니다.** **이 뒤의 문서 커밋을 포함한 최신 SHA의 CI는 별도로 확인해야 하며 이전 PR HEAD 검사 결과를 전용하지 않습니다.** 실제 학교 인증·팀원 4명 개인별 데이터/학수번호 132개 공식 매핑·NCP/PG/CLOVA 실행·포스터/모바일/스크린리더 사람 인수는 `NOT_RUN/CONFIGURATION_REQUIRED` 또는 미완료입니다. 운영 제품은 `RELEASE_BLOCKED`이며, 공개 GitHub Pages는 **실자료·외부 AI 호출 없는 합성 시연**으로 `main` push 때 자동 배포를 계속합니다. 원본 `csv/` 다섯 파일은 내용·경로/이름·인코딩·추적 상태를 그대로 유지합니다. 본선 전/후 담당자 책임과 개인 수락률은 합성 코드가 늘었다고 자동 상향하지 않습니다.

## 실환경 인수 현황

| 항목 | 상태 | 인수에 필요한 실근거 |
| --- | --- | --- |
| 프로젝트 범위 승인 | `OWNER_CONFIRMED_APPROVED` | 사용자 기준 승인. 현재 각 원본 제공자·학교권리 별도 |
| TypeScript/합성 HTTP/Chrome·격리 PG/NCP IaC | `TESTED_SYNTHETIC`/일회용 PG | 과거 통합 `48134da` Actions 4/4·새 PR #292/#293/#295/#304 각각 HEAD 4/4 성공. 이는 과거 `48134da` 기준 실험이며 이후 `462f6d3`·`d8e2144`의 main 4/4 CI는 별도 PASS 확인. 향후 문서 PR HEAD/merge SHA는 각각 별도 검증. 실 NCP와 다름 |
| Google OIDC/학교메일/BETA·REVIEWER 세션 | `CONFIGURATION_REQUIRED` | 실제 ID/메일·만료/철회·다른 사용자 부정시험 |
| 관리형 운영 PG·CA TLS·role/RLS·실 backup | `CONFIGURATION_REQUIRED` | 실제 migration/roles/RLS·복원 영수증 |
| 실제 학생 4명 매핑·인입/조회 | `NOT_RUN` | 현재 소유권·원본 SHA·동의·actor 연결·DB 적용/읽기/정정/철회 |
| 실제 NCP host·domain/TLS/ingress·비용 | `CONFIGURATION_REQUIRED/NOT_RUN` | 계정/VM/VPC/실 IP·비용·CPU/RSS·종료/반납 |
| CLOVA OCR/HCX Vision·실결제·native worker | `CONFIGURATION_REQUIRED/NOT_RUN` | 실제 공급자 비밀·호출/청구/timeout·취소·보호 |
| UI #258/학업 #260/비코드 #261 | `CLOSED` (본선 이전 이슈; #260은 `not_planned` 이관) | 남은 지정 담당자 교차 리뷰·실자료/사람 인수는 #280/#281/#282/#283 `NOT_RUN`, 원 이슈 완료와 별개 |
| 추천·미디어 독립 Gold | `EXCLUDED_BY_REQUEST / NOT_MEASURED` | 이번 작업에서 제외, 합성 평가를 실제 Gold로 주장 금지 |
| 프로덕션 공개 | **`RELEASE_BLOCKED`** | [#323](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323)의 실제 운영·복구 및 [#325](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325)의 권리·보안/릴리스 인수 후만 |

## 2026-11-06 당시 팀별 인수 배정표 (현재 배정 아님)

| 담당 | 본선 진출 전 — 정리 종결(CLOSED) | 본선 진출 이후 — 실제 운영/실자료 수락 |
| --- | --- | --- |
| 이의상 UI/접근성 | [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119), [#258](https://github.com/ot4562-glitch/HUFS-One-AI/issues/258) | [#280](https://github.com/ot4562-glitch/HUFS-One-AI/issues/280) 실 BETA UI·모바일/스크린리더/학업·경험 종단 |
| 김채윤 추천/공지 | [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) 합성 코퍼스·정정/성능(순수 코어 [#259](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259)는 완료) | [#281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281) 실제 허가 출처·추천 정확성 주장 방지/운영 실측 |
| 박준영 학업 | [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11), [#260](https://github.com/ot4562-glitch/HUFS-One-AI/issues/260) 합성/교차 검토; #260 PR #262 정책/테스트 완료, 소비자 리뷰는 미완료 | [#282](https://github.com/ot4562-glitch/HUFS-One-AI/issues/282) 공식 RulePack·4인 학업 원장·8학기 개설 실증 |
| 이서연 비코드/운영 | [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#261](https://github.com/ot4562-glitch/HUFS-One-AI/issues/261) 계정·비용·권리 사전검토/문서 | [#283](https://github.com/ot4562-glitch/HUFS-One-AI/issues/283) 실 NCP 계정·청구/복구/반납·실원본 이용권 검수 |

**공통 원칙:** 본선 전 11개 이슈는 CLOSED(10 completed, #260 사람 검수 미완료 이관), 본선 이후 실제 인수는 현재 **#321~#325 및 #317/#318의 7개 OPEN·전부 담당 지정** 상태입니다. 구 통합 #316·#276은 보관 CLOSED. 서버·운영은 이서연 #323, SQL·AI 영수증·보안/출시 통합은 심민성 #325, AI 모델/정확도는 이의상·박준영 #321/#322, 시연은 김채윤 #324가 담당합니다. 실제 NCP·실학생·법적 권리·사람 검토 결과는 증거가 없으면 NOT_RUN입니다.

과거 팀원 후속 #280~#283은 중간 통합 #276/#298로 이관된 뒤 CLOSED이며 실제 수락은 NOT_RUN이다. **현재 실인수/사람 검증은 지정된 #321~#325, #317/#318에서만 OPEN으로 추적**한다. 과거 #9/#10/#11/#12/#119/#258/#260/#261은 CLOSED이며, 기존 자료·키의 새로운 공개 업로드는 하지 않는다.

## 인계와 운영 원칙

1. 코드·문서 SHA와 CI는 공개 URL로 추적. 서버/IP/키/원본 대응표·학생별 동의 파일·실비용 영수증은 별도 최소권한 저장소에 기록.
2. 본선 이후 **NCP 계정·IAM·SKU·도메인/HTTPS·청구·복구**는 [이서연 #323](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323), **Google/학교메일·관리형 PG·원본 권리·API/DB**는 [심민성 #325](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325), **CLOVA/Laya/HCX 정확도**는 [이의상 #321](https://github.com/ot4562-glitch/HUFS-One-AI/issues/321)·[박준영 #322](https://github.com/ot4562-glitch/HUFS-One-AI/issues/322)에서 각자 증거를 기록합니다.
3. **현재 사람별 후속:** 이서연 웹·접근성 [#318](https://github.com/ot4562-glitch/HUFS-One-AI/issues/318)·서버 [#323](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323), 김채윤 시연/AI 검증 [#324](https://github.com/ot4562-glitch/HUFS-One-AI/issues/324), 박준영 AI·학업 [#322](https://github.com/ot4562-glitch/HUFS-One-AI/issues/322), 이의상 AI/NLP [#321](https://github.com/ot4562-glitch/HUFS-One-AI/issues/321), 심민성 통합 [#325](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325)·추가 기능 [#317](https://github.com/ot4562-glitch/HUFS-One-AI/issues/317)에서 검증. 원래 #280~#283 및 #316은 기록용 CLOSED, 인적 실검수는 별도.
4. 실제 수락에는 테스트 HEAD·환경·권리/원문 판본·실행 명령·PASS/FAIL/HOLD/NOT_RUN/CONFIGURATION_REQUIRED·비용·rollback과 검증자 기록을 요구한다. 미실시 항목은 성공 처리하지 않는다.

[NCP 서버 운영 #323](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323) · [실인증·릴리스 #325](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325) · [코드 리뷰 #278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278) · [코드 리뷰 #279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279) · [현행 팀 상태](../STATUS.md).
~~~~~~~

</details>
