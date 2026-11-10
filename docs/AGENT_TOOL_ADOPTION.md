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
