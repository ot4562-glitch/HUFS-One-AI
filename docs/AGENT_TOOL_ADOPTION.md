# HUFS One AI — Claude / GPT 도구 채택 기준 (이슈 #450)

> 제안된 설정과 후보 목록입니다. 이 파일은 협업자 5인의 계정에 플러그인을 설치하거나 권한을 부여하지 않습니다. 사용 환경의 연결·라이선스·요금·외부 전송 여부는 **각 사용자**가 확인합니다. [팀 업무](WORKSTREAMS.md), [PR 리뷰](PR_WORKFLOW.md), [자료 설계 #449](https://github.com/ot4562-glitch/HUFS-One-AI/issues/449).

## 2026-11-11 도입 연구와 PR·Issue 인수의 구분

[#450 개발 도구 연구](https://github.com/ot4562-glitch/HUFS-One-AI/issues/450), [#451 웹 디자인](https://github.com/ot4562-glitch/HUFS-One-AI/issues/451), [#452 AI QA](https://github.com/ot4562-glitch/HUFS-One-AI/issues/452), [#453 RAG](https://github.com/ot4562-glitch/HUFS-One-AI/issues/453), [#454 데이터 검수](https://github.com/ot4562-glitch/HUFS-One-AI/issues/454)는 **모두 조사/선택 단계의 열린 이슈**입니다. [#480 평가 지표 PR](https://github.com/ot4562-glitch/HUFS-One-AI/pull/480)의 합성 CI 성공은 실제 독립 Gold·외부 프레임워크 설치/모델 사용이 아닙니다. 팀원 개별 플러그인 설치·계정 권한·비용·NCP 접근을 자동 승인하지 않으며 실학교 원문/학생 파일·Gold는 외부 에이전트로 전송하지 않습니다.

2026-11-11 최초 열린 22개 PR에는 실제 GitHub COMMENT 리뷰를 제출했고, #475만 독립 협업자의 정확 HEAD 승인·CI 확인 후 병합했습니다. 새로운 코드를 작성하는 에이전트도 [전수 감사](REVIEW_AND_ISSUE_AUDIT_20261111.md)·[현행 PR 운영](PR_WORKFLOW.md)에서 **작성자 아닌 동료의 현재 HEAD APPROVED**를 확인하고, `BOOTSTRAP_PENDING`·`SKIPPED`를 통과로 처리하지 않습니다. Claude/GPT 도구/브라우저/MCP 자동 merge·prod deploy 설정은 기본 OFF.

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
