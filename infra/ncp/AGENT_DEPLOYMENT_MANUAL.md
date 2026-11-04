# Codex / Claude Code의 NCP 작업 매뉴얼

> **현재 상태 안내:** 2026-11-04 코드 인계 최신: 네트워크/host Terraform, Ubuntu 설치 및 ZIP·SSH preview/rollback은 [#216](https://github.com/minseong-hufs/HUFS-One-AI/pull/216) main에 들어있고 열린 PR 0건. 에이전트가 실 NCP 서버를 생성하거나 비용/계정·실 SSH/실자료권리/공개 TLS 승인까지 완료한 것은 **아님**. 기본 plan과 사용자 별도 비용·운영 인수 게이트 유지. [STATUS](../../STATUS.md)·[인수서](../../docs/HUMAN_ACCEPTANCE_GATE_20261104.md).

코드 담당 심민성은 자동화·검증·PR을 제공하고, 이서연은 계정·서비스 이용권·SKU·
요금·승인된 호스트·실측·반납 영수증을 확인한다. 에이전트는 사람 승인이나
기관/학생 권리를 생성하지 않는다. 기본 설치 위치는 **관리자 개발 PC 또는
격리된 관리 runner**이며, 앱 서버에 관리자 권한 에이전트를 기본 설치하지 않는다.

## 관리 PC에 설치·업데이트·연결

2026-11-04 공식 문서 확인 기준이다. 실제 설치·인증·업데이트는 이 구현에서
실행하지 않았다. 배포용 Node 버전과 개발 에이전트 버전을 별도로 기록한다.

- Codex: [공식 CLI 설치 탭](https://learn.chatgpt.com/docs/codex/cli)을 따른다.
  macOS/Linux/WSL에서 standalone installer를 사용할 때 공식 HTTPS 원본을 파일로
  받아 읽고, 제공되는 릴리스 무결성 자료·출처와 로컬 해시를 확인한 뒤 일반 사용자로
  실행한다. root `curl | sh`를 자동화에 넣지 않는다. Windows는 같은 페이지의
  Windows 탭을 따른다. 설치/업데이트 후 `codex --version`, 관리 PC의 작업 폴더에서
  `codex`로 사람 로그인을 진행한다. 버전/설치 경로만 증거에 남기고 인증정보는 남기지 않는다.
- Claude Code: [공식 setup](https://code.claude.com/docs/en/setup)의 서명/설치 경로를
  확인한다. Windows WinGet 설치는 `winget install Anthropic.ClaudeCode`, 업데이트는
  `winget upgrade Anthropic.ClaudeCode`를 사용한다. Linux는 공식 signed apt 경로
  또는 검증된 native installer를 선택한다. native 설치 업데이트는 `claude update`.
  `claude --version`·`claude doctor`로 확인하며 sudo 전역 npm 설치를 기본값으로 쓰지 않는다.
- GitHub: 관리 PC에서 `gh auth login`으로 사람 OAuth를 수행하고 저장소 최소 권한을
  부여한다. Codex 앱의 GitHub 플러그인을 쓰면 연결된 계정에서 이 Private 저장소가
  보이는지 읽기 도구로 확인한다. 배포 secret·NCP admin 키는 이 연결에 주지 않는다.
  CLI MCP 목록은 `codex mcp list`; Claude는 `claude mcp list` 및 `/mcp`로 확인한다.
  [Claude 공식 GitHub MCP 연결 안내](https://code.claude.com/docs/en/mcp#example-connect-to-github-for-code-reviews)의
  endpoint/인증 절차를 현재 문서로 확인하고 토큰을 명령 이력·소스·이슈에 적지 않는다.
  읽기/PR/Actions 변경 권한을 분리하고 필요 없으면 연결을 해제·토큰을 폐기한다.
- OpenAI 공식 문서만 필요한 경우 [Docs MCP](https://developers.openai.com/learn/docs-mcp)를
  선택할 수 있다. `codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp`
  후 목록을 확인한다. 문서 MCP는 OpenAI API 호출 권한이나 NCP 배포 권한이 아니다.

## 매 작업의 읽기와 실행 순서

1. 상위/프로젝트 AGENTS → 현재 STATUS → #192 및 연결 #12/#22/#46/#89 → 비밀을
   제외한 운영 handoff → 현재 main/PR HEAD·CI·비작성자 승인을 확인한다. 다른
   담당자의 dirty worktree·UI/추천/학사 코어를 덮어쓰지 않는다.
2. [Quickstart](QUICKSTART.md)의 strict JSON을 stdin으로 넣어 `00-preflight.mjs`를
   실행한다. `planSha256`·승인 SHA·예상 비용과 아직 확인하지 않은 gate를 검토한다.
   출력이 plan이라고 실제 생성/설치 완료로 기록하지 않는다.
3. `01-provision`은 현재 코드/운영 승인 대기다. 기존 콘솔 가이드가 수동 대안이며
   사용자의 유료 리소스 승인 없이는 API/Terraform/콘솔 생성으로 진행하지 않는다.
4. `02-bootstrap`·`03-deploy-preview`는 기존 스크립트를 재사용한다. 승인된 호스트와
   IP/host fingerprint/두 번째 SSH 세션을 확인한 후에만 별도 apply한다. preview ZIP의
   allowlist·SHA256과 source SHA를 검증하고, 원본/키/Git 전체를 전송하지 않는다.
5. `04-verify`: systemd 상태·loopback listener·SSH 터널·외부 앱/DB 포트 차단·로그
   비밀 누출 여부를 확인한다. 실 nginx/TLS/영속 PG/권한/직접 IP 검증이 없으면 NOT_RUN.
6. 실패하면 자동 rollback 로그와 이전 current 포인터를 확인한다. rollback 실패면
   재시작/재설치를 반복하지 말고 운영자에게 정확한 실패·복구 조건을 인계한다.
   `05` 수동 rollback/`06` 자동 반납은 아직 미수락이므로 실행했다고 기록하지 않는다.

GitHub 배포는 승인된 merge SHA와 workflow_dispatch·환경별 독립 승인을 사용해야
한다. [GitHub 공식 환경 보호 문서](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)의
플랜별 기능을 실제 Private 저장소에서 확인한다. required reviewers를 지원하지
않으면 **GitHub 밖의 독립 승인 게이트**가 필요하며, 이름만 붙인 Environment를
승인으로 세지 않는다. push→production 자동 공개는 설정하지 않는다.

증거는 source/plan SHA, 변경 단계, 합성 PASS/FAIL/SKIP/NOT_RUN, host 적용 여부,
리뷰/CI, 실패/복구, 다음 입력 담당자만 짧게 남긴다. 키·초기 암호·OTP·실학생 원문·
전체 호스트 정보는 제외한다. #46/#89 및 과금/도메인/실자료 승인은 별도다.
