# HUFS One AI — 개발 에이전트의 NCP 작업 절차

**현재 범위:** 심민성은 코드/IaC/OS/worker/CI/설치·복구 자동화만 개발하고, 이서연은 운영 계정·리전/SKU·요금/IAM/실 host/비밀·청구/중단·반납의 **비코드 증거**만 제공합니다. 사용자는 문서상 자료·클라우드/모델·운영·출시 승인을 완료 확인했습니다(**OWNER_CONFIRMED_APPROVED**). 실제 지출·VM 생성·학교 원본·유료 AI/공개 배포는 **현재 계정·비용 상한·자격증명·원본 및 학생별 권리·실행 대상·rollback 검증이 없으면 실행하지 않으며**, 실운영 인수 미완료로 RELEASE_BLOCKED입니다. 에이전트가 사용자·학교/원본 권리·사람 승인 기록을 생성할 수는 없습니다.

## 개발 PC/에이전트 실행

- 신뢰할 수 있는 공식 개발 도구 배포 및 설치 방법/서명·버전 검증 후 **관리 PC의 제한된 개발자 계정**에서만 실행. 운영 서버에 관리자 에이전트·개인 API 키/기밀 대화를 기본 설치하지 않음.
- 운영자와 작업 목적·권한 최소화·소유 코드/ref/테스트 DB/포트·실제 비용 및 실패 후 책임자를 사전에 명확하게 구분. 프로젝트 사용 승인은 완료했으나, 명시적 현재 대상·실제 역할·비용/실동의·rollback 검증 없이 shell 관리자 명령·SSH 비밀/원본 파일 수집·모델 전송·결제 실행을 하지 않음.
- 현재 `main`의 exact SHA와 필수 CI/리뷰, `AGENTS.md`·[#253 코드](https://github.com/ot4562-glitch/HUFS-One-AI/issues/253)·[#252 실인수](https://github.com/ot4562-glitch/HUFS-One-AI/issues/252)를 확인.

## 적용 순서

1. **PLAN ONLY:** `node infra/ncp/setup/00-preflight.mjs --example`과 operator가 사전 승인한 무비밀 `local_only/` 입력의 `--plan`, network/host plan·mock 테스트. 크레딧·가격은 당일 콘솔 확인.
2. **실제 실행 대상 확인:** 프로젝트 승인은 완료 상태다. 정확한 host key·실 리전/SKU·관리자 공인 IPv4/32·ACG/NACL/SSH/VPC·예산 하드 상한·운영자 적용 정보와 복구 대상을 비공개 인계한다. 값이 없으면 CONFIGURATION_REQUIRED로 실행하지 않음.
3. **비공개 합성 preview:** 승인된 `Prepare-NcpPreview.ps1` ZIP/hash와 `Deploy-NcpPreview.ps1` 기본 plan을 우선 검증, 명시 `-Apply`는 승인된 호스트에서만. `127.0.0.1:5173` SSH 터널, 외부 80/443·API/PG/실Google/HCX·학생 데이터 OFF.
4. **실서비스 staging:** 프로젝트 승인 완료와 별개로 실제 운영 composition/OIDC/학교메일·TLS/LB/원본 IP·FORCE RLS/복구·비밀 회전·현재 권리/비작성자 인수 통과 후에만 공개 활성화. 임의로 production guard 해제 금지.
5. **검증/반납:** SHA·명령/승인 범위·PASS/FAIL/HOLD/NOT_RUN·보안 부정시험·실 청구/CPU/RSS/p95·last-good rollback·비밀 폐기/반납 영수증. 외부 서비스 비용/원본 파일명을 공개 GitHub로 보내지 않음.

**현재 실 계정/SSH/클라우드 성공 증거 없음.** 코드의 오프라인 PASS가 운영 호스트 접속/배포/실제 비용 종료를 의미하지 않음.

[NCP QUICKSTART](QUICKSTART.md) · [운영 인계](OPERATIONS_HANDOFF_TEMPLATE.md) · [인수 게이트](../../docs/HUMAN_ACCEPTANCE_GATE_20261104.md).
