# NCP에 HUFS One AI 제품과 GPT(Codex)·Claude Code 설치하기

> 기준: 2026-11-06. **설치 절차 문서이지 실제 배포 완료 보고가 아니다.** 먼저 [NCP 서버 개설·보안 가이드](BEGINNER_NCP_SERVER_SETUP.md)를 읽는다. 실서비스 준비는 [운영 통합 이슈 #276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)에서 추적하며 `RELEASE_BLOCKED` 상태다. 공개 Git의 `csv/` 원본 5개는 **함부로 변경·삭제하지 않고**, 웹·서버 이미지·에이전트 작업 디렉터리에 **포함하지 않는다**.

## 1. 먼저 세 가지를 구분한다

| 구분 | 하는 일 | 기존 코드/상태 | 어디에 설치? |
| --- | --- | --- | --- |
| **제품(React/서버 API/DB)** | 학생에게 추천·학업·경험 화면 제공 | UI·Fastify·SQL 코드 있음. 실운영 자격증명·인수 별도 | NCP 서버/사설 DB |
| **제품 내 AI(CLOVA OCR/HCX)** | 허가된 자료에서 텍스트 추출, 구조화된 AI 후보 | `OCR_GENERAL`(이미지 문자인식), `HCX_007`(구조화 자연어) 공급자 코드. 실제 API·비용 미검증 | 제품 서버에서 승인된 NCP API 호출 |
| **GPT(Codex)·Claude Code** | 개발자의 코드를 분석·수정 제안·테스트 | **개발 에이전트 CLI**. 학생 서비스 모델과 별개 | 개발 PC 권장, 필요하면 **격리된 NCP 개발 호스트** |

**중요:** `codex`/`claude`를 설치한다고 학생 웹사이트에 GPT/Claude AI가 자동 연결되지 않는다. 현재 제품 서버의 모델 호출은 CLOVA 기반이며 OpenAI/Anthropic 제품용 provider adapter는 별도 구현·검증이 필요하다.

## 2. 선택할 설치 경로

| 설치 경로 | 목적 | 결과 | 사용 가능 여부 |
| --- | --- | --- | --- |
| **A. 비공개 합성 웹 미리보기** | 디자인·화면 확인 | SSH 터널만 통해 `127.0.0.1:5173` 접속 | NCP 서버 준비 후 실행 가능 |
| **B. 운영 제품(실제 사용자)** | 학생 계정/실 DB/HTTPS/AI | `production-main.js --apply` + 비공개 factory + DB/TLS/권한 | 현재 환경·인수 요건 추가 필요 |
| **C. Codex·Claude Code 개발 에이전트** | 개발/코드 리뷰 | 개발용 CLI | 제한된 별도 계정/워크스페이스에서 선택 설치 |

**추천: A → C(필요 시) → B.** A 또는 C의 성공을 서비스 공개/실자료 인입 완료로 오해하지 않는다.

---

## A. SSH 전용 합성 미리보기 배포(처음 설치 권장)

### A-1. Windows PC의 준비물

- Git, PowerShell 5.1+, Node.js `^22.22.2` 또는 `^24.15.0`, WinSCP/`WinSCP.com`, PuTTY/`plink.exe`.
- NCP Ubuntu 22.04/24.04 amd64 호스트에 `infra/ncp/bootstrap-ubuntu.sh`로 운영자 `hufs-admin`·서비스 계정 `hufs-preview`가 준비되고, 두 번째 SSH 키 로그인 후 SSH 강화가 끝나 있어야 한다.
- 서버 공인 IPv4, **독립 확인한 SSH host-key fingerprint**, 로컬 보안 저장소의 `.ppk` 개인키.
- 저장소의 승인된 정확한 commit SHA. 다른 사람의 미커밋 작업이나 원본 CSV를 건드리지 않는다.

~~~powershell
# 내 PC의 HUFS-One-AI 저장소 루트에서 실행
node --version
git status --short
$sha = (git rev-parse HEAD).Trim()
$sha
npm ci --ignore-scripts --no-audit --no-fund
npm run check
~~~

테스트 실패를 건너뛰지 않는다. 위 검사 성공은 *합성 개발 검증*이지 운영자·학생 실인증 성공은 아니다.

### A-2. PLAN(아무 것도 배포하지 않음)

~~~powershell
powershell -NoProfile -File .\infra\ncp\Deploy-NcpPreview.ps1
~~~

`PLAN ONLY` 출력은 정상이며 서버/IP/개인키가 없어도 실행 가능하다.

### A-3. 실제로 전송할 합성 ZIP 생성

~~~powershell
$sha = (git rev-parse HEAD).Trim()
powershell -NoProfile -File .\infra\ncp\Prepare-NcpPreview.ps1 -Ref $sha
Get-FileHash .\local_only\ncp-preview.zip -Algorithm SHA256
~~~

`local_only/ncp-preview.zip`은 고정된 Git 파일 목록만 내보내며 **`csv/`, 학생 원본·개인 매핑, Google/DB/API 키, 서버 비밀 factory를 제외**한다. `.sha256.txt`로 해시를 확인한다. ZIP을 GitHub·공개 공유 드라이브에 올리지 않는다.

### A-4. NCP 서버로 SFTP/SSH 배포

서버의 부트스트랩·ACG 관리자 IP/32·키 로그인·지문을 확인한 후, PC의 **비공개 값**을 입력받아 전송한다.

~~~powershell
$ServerIPv4 = Read-Host '실제 승인된 NCP 서버 공인 IPv4'
$PpkPath = Read-Host '로컬 .ppk 개인키의 전체 경로'
$HostKeyFingerprint = Read-Host '독립 검증한 SSH 지문 (ssh-ed25519 256 SHA256:...)'
$sha = (git rev-parse HEAD).Trim()
powershell -NoProfile -File .\infra\ncp\Deploy-NcpPreview.ps1 -Apply -ServerIPv4 $ServerIPv4 -PrivateKeyPath $PpkPath -HostKeyFingerprint $HostKeyFingerprint -Ref $sha
~~~

이 `-Apply`는 **실제 NCP 서버에 파일을 올리고 서비스 실행**하므로 실제 대상·요금·허가를 확인하고 실행한다. 내부적으로 WinSCP로 ZIP 전송, 서버에서 ZIP SHA256/경로/허용목록 검증, Node 빌드, systemd 재시작·실패 시 이전 합성 배포로 롤백한다. 직접 서버에 공개 Git을 통째로 복사하거나 `npm start`로 실서비스를 켜지 않는다.

### A-5. SSH 터널로 브라우저 확인

운영 PC에서 PuTTY → Connection → SSH → Tunnels: Source port `5174`, Destination `127.0.0.1:5173` → Add. 해당 SSH 세션을 로그인 상태로 유지하고 **PC 브라우저**에서:

~~~text
http://127.0.0.1:5174
~~~

서버 상태 확인:

~~~bash
sudo systemctl status hufs-preview.service --no-pager
curl -I --max-time 3 http://127.0.0.1:5173/
sudo ss -lntp
sudo journalctl -u hufs-preview.service -n 30 --no-pager
~~~

**통과:** UI는 SSH 터널에서만 표시, 공인 IP의 5173/3000/5432는 접근 불가, 로그인·추천 자료는 **합성**임을 분명히 표시. SSH 터널 끊김은 서버 장애가 아닐 수 있으므로 분리해 확인한다.

### A-6. 롤백(문제 생겼을 때 되돌리기)

서버에는 `/usr/local/sbin/hufs-preview-rollback`이 설치된다. 현재 릴리스와 **이미 존재하는 이전 ZIP SHA256**를 확인하고 먼저 계획만 본다.

~~~bash
sudo /usr/local/sbin/hufs-preview-rollback --target <이전_ZIP_SHA256> --expected-current <현재_ZIP_SHA256>
~~~

실제 실행은 승인된 `hufs-admin` 세션에서만 `--apply --ack-owner-approved` 추가. 이 스크립트는 **합성 preview 포인터와 서비스만** 복구하며 운영 DB·NCP 자원·개인 데이터를 되돌리지 않는다. [NCP 롤백 코드](../infra/ncp/rollback-preview.sh).

---

## B. 운영 제품을 설치하려면

### B-1. 준비 상황과 실현 조건

단순히 `git clone`, `npm install`, `node apps/api/src/main.ts`를 실행하는 것은 운영 배포가 아니다. `apps/api/src/main.ts`는 **인증/AI가 모두 차단된 로컬 harness**다. 실제 운영 진입점은 `apps/api/src/production-main.ts`이며 Linux의 **root 소유 전용 설정 모듈**과 Google/외대메일·분리 PostgreSQL 역할·HTTPS 인그레스가 있어야 한다.

| 구성 요소 | 실제 요구 사항 |
| --- | --- |
| 운영 빌드 | 승인된 source SHA, Node 버전/lockfile, `npm run check`·빌드, 학생·비밀 제외한 산출물 |
| Google 로그인 | 실제 OIDC client ID/secret, HTTPS origin, callback URI, 신뢰 가능한 로그인 세션 |
| 외대 메일 | 인증 도달/재확인·발신 계정·실 BETA admission |
| DB | 기본 7개 **분리 SQL 역할**(sessions/admission/attempts/projections/calendar/personal/evidence) 및 확장 역할, CA 검증 TLS, FORCE RLS, 백업/복원 |
| 학생 자료 | 현재 BETA actor와 실제 Forms 행·CSV 해시·동의·철회 연결을 검증하는 **비공개 operator registry** |
| 공개 웹 | 공식 도메인, 인증서, Nginx/edge 또는 LB, Host/SNI/IP·IPv6·CSRF·원본 IP 검사 |
| AI | 실제 NCP CLOVA/OCR 자격증명, 입력별 권한·예산·요금/종료, worker 자원 통제 |
| 복구 | 실패 시 last-good rollback, 실 DB 복원 연습, 비용 반납·담당자·시험 영수증 |

**현재 준비가 안 된 실제 값은 `CONFIGURATION_REQUIRED`, 미실행 시험은 `NOT_RUN`으로 표시한다.** 사용자 프로젝트 승인 `OWNER_CONFIRMED_APPROVED`가 곧 실환경 성공은 아니다.

### B-2. 안전한 소스·이미지 반입

공개 저장소의 `csv/`에 학생 원본 5개가 복구되어 있으므로 **운영 서버에서 전체 저장소 이력을 `git clone`하지 않는다.** 신뢰된 개발/빌드 기기에서 승인 commit의 **앱 소스·의존성·필수 스크립트만** 허용목록으로 내보내고, 만들어진 릴리스에 `csv/`, `local_only/`, `.env`, 원본·자격증명·실로그가 없음을 검증한다.

기존 [`infra/deploy/Dockerfile`](../infra/deploy/Dockerfile)은 Node 빌드 후 `api`·`edge` 이미지를 생성한다. 다만 컨테이너 이미지 준비가 곧 운영 시작은 아니다. [`infra/deploy/compose.private.yaml`](../infra/deploy/compose.private.yaml)은 `private-deployment` 프로필로 기본 비활성, operator 제공 이미지·사설 네트워크·정확한 backend IPv4·승인 egress 네트워크·TLS 등을 요구한다. 이미지에 원본 CSV와 factory를 COPY하지 않는다.

빌드/정적 검증 명령(승인된 **격리 빌더**에서):

~~~bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run check:privacy
npm run build:api
npm run build:web
node dist/apps/api/src/production-main.js --plan
~~~

`--plan`은 설정·네트워크·DB를 사용하지 않는다. 프로젝트의 Node 요구 버전은 `^22.22.2 || ^24.15.0`이다. `--plan`에서 보이는 `PRIVATE_FACTORY_REQUIRED`는 **정상적인 설정 안내**이며 실제 배포 성공이 아니다.

### B-3. 비공개 운영 설정

실제 서비스를 시작할 때 Linux 경로 `/etc/hufs-one/private/production.mjs`에서 `createOperatorConfig()`를 export한다. 이 factory는 **공개 저장소에 만들지 말 것**. 개발자는 [`OperatorPostgresInputs`](../apps/api/src/operator-postgres-runtime.ts)를 보고 Google OIDC, 학교메일, SQL role·TLS CA, 현재 소유권 권리 resolver, 선택 CLOVA transport/요금을 구성한다.

보안과 권한:

- 전용 서비스 계정 `hufs-one`(로그인·sudo 불필요)과 root 관리 소스 `/opt/hufs-one/current`(승인된 릴리스). preview의 `hufs-preview`와 구분.
- `production.mjs`는 **root 소유·symlink 금지**, group/world 쓰기 금지, 읽기 권한은 서비스에 필요한 최소 범위만. 예: `root:hufs-one` 파일 `0440`, 디렉터리 `0750`. 상위 디렉터리까지 검증한다.
- OIDC callback은 예를 들어 `https://<승인된_호스트>/api/auth/google/callback`. **실제 호스트/인증서와 일치**해야 한다. Google/학교 메일 비밀은 Git·CI 로그·shell 인수로 출력하지 않는다.
- DB는 운영용 여러 사용자 역할을 분리하고 SSL CA 검증·정확한 DB/host/role·각 테이블 RLS·backup/restore를 검증한다. 사용자별 CSV는 DB에 넣기만 하면 계정과 연결되지 않는다.
- **현재 주의:** `createPostgresApplication`에 owner-intake port는 있으나 운영 `OperatorPostgresInputs` 조립과 실제 owner loader/attestation 배포는 현장 검증이 필요하다. 이 단계를 생략한 채 실제 계정 연결이 완료됐다고 표시하지 않는다.

### B-4. PostgreSQL migration은 안전한 계획으로만 시작

운영자가 비공개로 준비한 **해시 고정 migration plan JSON**에 대해서만 다음을 사용한다.

~~~bash
node tools/check_postgres_migration_plan.mjs --plan /path/to/reviewed-migration-plan.json
~~~

없는 파일을 자동 생성해 주는 명령은 아니다. plan을 만들지 않았다면 멈추고 DB 구조·의존 SQL 순서/테스트·백업·복원을 설계한다. `--database-env`는 별도의 **READ ONLY 확인**용이며 실제 SQL 적용은 개별 검토·승인·회수 가능성 확인 후 진행한다. `infra/sql`에는 7역할 외에 기능별 학사/동의/AI SQL이 다수 있어 일괄 슈퍼유저 적용은 허용하지 않는다.

### B-5. systemd로 실행하는 선택지

비밀 factory, 운영 빌드, DB, HTTPS 인그레스가 **모두 검증된 후** [`infra/deploy/hufs-production-api.service`](../infra/deploy/hufs-production-api.service)를 관리자가 검토·설치한다. 이 unit의 핵심은 다음과 같다.

- 작업 디렉터리 `/opt/hufs-one/current`
- 계정 `hufs-one`
- 진입점 `/usr/bin/node .../dist/apps/api/src/production-main.js --apply`
- 환경 `NODE_ENV=production`, `APP_ENV=production`, `HUFS_API_INTERNAL_PORT=3000`, `HUFS_PRODUCTION_CONFIG=/etc/hufs-one/private/production.mjs`
- API **127.0.0.1:3000** 리스닝(전용 TLS proxy 뒤). 3000을 공인 인터넷에 공개하지 않는다.

관리자가 실제 구성을 완료한 뒤의 관리 명령:

~~~bash
sudo systemctl daemon-reload
sudo systemctl enable hufs-production-api.service
sudo systemctl start hufs-production-api.service
sudo systemctl status hufs-production-api.service --no-pager
sudo journalctl -u hufs-production-api.service -n 40 --no-pager
~~~

**구성 전에는 `enable/start`를 실행하지 않는다.** 컨테이너 방식은 정확한 컨테이너 내부 사설 IP `HUFS_API_BACKEND_IPV4`와 root 통제 `approvePrivateBridge()`, 제한된 외부 egress가 추가로 필요하다. 단순 `docker compose up -d`를 공식 운영 배포 명령이라고 오해하지 말 것.

### B-6. 학생에게 공개하기 전 수락표

- **인증:** 실 Google + 학교메일 → 2개의 다른 BETA 사용자, 만료/철회/REVIEWER 차단, 세션·CSRF.
- **자료:** 현재 사용자 A가 B의 CSV/프로필/학사 자료를 볼 수 없고, 잘못된 연결은 403/503이며 합성 데이터로 대체하지 않음.
- **DB:** SQL role/RLS/CA TLS, migration, 영구 저장 및 실패 복구를 실제 실행·증거화.
- **인그레스:** HTTPS/Host/SNI, 직접 IP/IPv6/프록시 우회 차단, 실제 여러 client IP에서 검증.
- **AI:** CLOVA 실 모델/토큰·청구/취소/예산/철회, 민감 원문 최소 전송·결과 검증. 미설정이면 공급자 OFF.
- **운영:** CPU/RSS/p95·백업/복원·원복/서비스 중단·NCP 요금/반납 및 사용자 인수.
- **학사/추천:** 미검증 RulePack/개설/합격·졸업 요건은 `UNKNOWN/NEEDS_REVIEW`. 사람 검토 없이 공식 판정하지 않음.

하나라도 필수 항목이 미실행이면 실제 서비스 출시 상태는 계속 `RELEASE_BLOCKED`이다. [운영 코드 설명](PRODUCTION_RUNTIME.md)·[제품 활성화 순서](PRODUCT_ACTIVATION_RUNBOOK_20261105.md)를 함께 참고한다.

---

## C. Codex와 Claude Code 개발 에이전트를 NCP에 설치(선택)

### C-1. 설치할지 먼저 결정

**개발 PC에서 쓰는 편이 우선**이다. NCP 서버에 설치하는 경우는 **운영 서비스와 분리된 제한된 개발 환경**에서만 하며, 제품 사용자 계정이나 DB root, `hufs-preview` 시스템 서비스 계정에 AI 에이전트를 두지 않는다. 운영 에이전트가 스스로 인프라 변경, 데이터베이스 삭제, 코드 배포 또는 인터넷 공개를 실행하도록 무인 권한을 주지 않는다.

운영자가 통제하는 Ubuntu 로그인 계정의 **읽기/쓰기 가능 범위를 검수한 별도 workspace**를 준비한다. 이 디렉터리에는 **학생 CSV·구글 원본·`/etc/hufs-one/private`·`/run/operator`·개인키·생산 DB 연결값·전체 Git 히스토리**가 없어야 한다. `AGENTS.md`와 필요한 공개 코드만 별도로 제공한다.

### C-2. Node·일반 사용자 설치 경로

~~~bash
id -un
uname -m
node --version
npm --version
# 전역 npm 패키지도 root가 아닌 개인 계정에만 설치
mkdir -p "$HOME/.local/npm"
npm config set prefix "$HOME/.local/npm"
export PATH="$HOME/.local/npm/bin:$PATH"
~~~

새 SSH 세션에서도 쓰려면 사용자 `~/.profile`에 검토된 PATH 설정을 추가한다. Node 버전·네트워크 egress가 맞지 않으면 먼저 고친다. `sudo npm install -g`나 `root` 사용자로 CLI 설치하지 않는다.

### C-3. GPT 개발 에이전트 — OpenAI Codex

[OpenAI Codex CLI 공식 가이드](https://learn.chatgpt.com/docs/codex/cli)·[공식 저장소](https://github.com/openai/codex)에서 설치 방법을 다시 확인한 뒤 일반 사용자로:

~~~bash
npm install -g @openai/codex
codex --version
cd /path/to/approved-sanitized-workspace
codex
~~~

첫 실행의 안내에 따라 개인 ChatGPT/Codex 계정이나 지원되는 별도 인증 방법으로 로그인한다. 원격 SSH에서 브라우저/device 방식은 버전에 따라 달라질 수 있으므로 화면과 공식 안내를 따른다. **계정 비밀번호·인증 코드·API 키를 GitHub/채팅/서버 로그에 복사하지 않는다.** Codex CLI가 설치됐다고 OpenAI API 비용/권한이 제품에 자동 부여되지 않는다.

시작 프롬프트 예시:

> AGENTS.md와 README를 읽고 제품을 설명해 줘. 첫 단계는 읽기 전용 코드 분석만 하고, 학생 원본 CSV·운영 비밀·SSH 키·실 DB에는 접근하지 마. 코드 변경·외부 모델 호출·배포는 나의 범위 확인 후에만 제안해.

### C-4. Claude 개발 에이전트 — Anthropic Claude Code

[Claude Code 공식 설치](https://code.claude.com/docs/en/setup)는 Ubuntu 20.04+를 지원하며 **native installer를 권장**한다. 출처를 확인한 뒤 다음처럼 **스크립트를 다운로드해 검토**하고 실행할 수 있다.

~~~bash
curl -fsSL https://claude.ai/install.sh -o "$HOME/claude-install.sh"
less "$HOME/claude-install.sh"
# 내용과 설치 위치를 운영자가 검토한 뒤 일반 사용자로 실행
bash "$HOME/claude-install.sh"
claude --version
claude doctor
cd /path/to/approved-sanitized-workspace
claude
~~~

공식 문서의 간편 방식 `curl -fsSL https://claude.ai/install.sh | bash`보다 검토 절차를 선호한다. 설치기가 업데이트될 수 있으므로 실제 실행 시 공식 문서를 다시 확인한다. Claude 계정/Console API 과금은 별도이며, **개인 키를 제품 factory나 공개 `.env`로 복사하지 않는다**.

시작 프롬프트 예시:

> AGENTS.md와 STATUS.md를 참고하여 버그 가능성을 표로 정리해 줘. 실제 개인정보·서버 secrets·Git 이력 전체를 읽지 말고, 우선 파일 수정 없이 보고해 줘. 배포와 실 모델 요청은 실행 금지.

### C-5. 두 에이전트의 권장 협업

1. 같은 기준 `main` SHA를 알고 시작하되 서로 다른 **작업 디렉터리/브랜치**에서 일한다.
2. Codex는 API/테스트 코드 검토, Claude Code는 설계/예외·문서 검토 등 **작업 초점을 분리**할 수 있다. 두 AI의 동의는 제삼자 품질 보증이 아니다.
3. 먼저 읽기 전용 → diff/변경 계획 → 팀원 검토 → `npm run check`/필요한 테스트 → PR/리뷰 → 운영자가 배포한다.
4. NCP admin/root, Docker socket, 프로덕션 SQL, OAuth 키, 학생 CSV 원본 접근권은 기본 차단한다. 셸 명령·외부 호출·설치 권한을 무제한 승인하지 않는다.
5. 비용 한도·에이전트 종료 절차·세션 자격증명 저장 위치를 확인한다. 정기 무인 실행/자동 GitHub push/서버 업그레이드는 별도 설계 없이는 만들지 않는다.

### C-6. 학생에게 GPT/Claude를 사용시키고 싶다면?

**다른 작업이다.** 현재 `apps/api/src/modules/ai/provider-transport.ts`는 CLOVA Studio/General OCR용이다. `OPENAI_API_KEY`·`ANTHROPIC_API_KEY`를 넣는다고 호출되지 않는다. 새 공급자별 API transport, 모델·응답 Zod 계약, 예산/정산·에러·취소, 현재 BETA actor·학생별 동의/철회·외부 전송 권리, 비공개 로그, 품질·인간 검토·실사용 테스트를 별도 개발해야 한다. 기존 CLOVA 공급자와 무검증 교체하지 않는다.

## 3. 자주 막히는 문제

| 증상 | 확인 순서 | 잘못된 우회 |
| --- | --- | --- |
| `npm ci` 실패 | Node 지원 버전, lockfile, 네트워크·권한 | `--force`로 실패 숨김 |
| `codex`/`claude` 명령이 없음 | 설치 결과·현재 PATH·사용자별 npm prefix | root 권한으로 덮어쓰기 |
| SSH 터널 페이지 열리지 않음 | SSH 창 유지→PuTTY 5174→`curl 127.0.0.1:5173`→`systemctl` | 서버 공인 IP:5173 개방 |
| 합성 계정만 보임 | A안은 **가상 시연**임 | 합성 계정으로 실학생 신분 표시 |
| 실제 CSV가 안 나옴 | 현재 사용자별 소유·동의·원본 해시/레지스트리·API/운영 조립 | CSV 파일명으로 사용자 임의 매칭 |
| API가 503/401 | 비공개 factory/DB/Google/학교메일·인그레스 권한 | 인증 가드 삭제 |
| GPT/Claude 호출 안 됨 | 에이전트 CLI와 제품 AI adapter의 차이 | 비밀 키만 `.env`에 추가 |
| 비용 청구 계속 | 서버 외 IP·스토리지·스냅샷·네트워크·유료 API 사용량 | 전원 OFF만 하고 종료로 간주 |

## 4. 완료 기준

- **A 완료:** 승인된 commit·SHA ZIP, 터널 UI, 외부 포트 비공개, 재시작/last-good 롤백 확인.
- **C 완료:** `codex --version` / `claude --version`과 격리 workspace의 읽기 전용 작은 작업 확인. 제품 운영 AI와 혼동하지 않는다.
- **B 완료:** 사용자별 인증/권리·실 DB·HTTPS·비용/복원·실 공급자·비작성자 인수를 **실제로 검증**해 기록. 하나라도 빠지면 `RELEASE_BLOCKED`.

**이어서 읽기:** [비전공자 제품 구조](BEGINNER_PRODUCT_ARCHITECTURE.md) · [PRODUCTION_RUNTIME](PRODUCTION_RUNTIME.md) · [NCP 운영 인계](../infra/ncp/OPERATIONS_HANDOFF_TEMPLATE.md).
