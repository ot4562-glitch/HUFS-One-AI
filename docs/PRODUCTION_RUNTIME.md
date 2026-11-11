# HUFS One AI — 승인된 운영 API 실행

> **2026-11-11 현행 책임과 인수:** 본 파일은 DB/API/docker 운영 코드 구조 설명이며, 2026-11-08 이후 새 책임 범위 [#445 NCP 수집·갱신](https://github.com/ot4562-glitch/HUFS-One-AI/issues/445), [#447 전 기능 실데이터](https://github.com/ot4562-glitch/HUFS-One-AI/issues/447), [#449 운영 설계·계정/권한·버전·보존·비용](https://github.com/ot4562-glitch/HUFS-One-AI/issues/449)이 OPEN입니다. 옛 #276은 보관·이관 완료 이슈이고 최신 실행 결과를 기록하는 곳이 아닙니다. 실제 PostgreSQL/원본·Gold/키·NCP 실배포·백업/복원·운영 학교/AI 권리는 `NOT_RUN / CONFIGURATION_REQUIRED / RELEASE_BLOCKED`이며 [전체 감사](REVIEW_AND_ISSUE_AUDIT_20261111.md)를 참조합니다. 실제 source registry/학생정보·운영 로그/DB·Gold는 NCP 제한 환경에 보존하고 GitHub/외부 모델에 옮기지 않습니다.


프로젝트 승인 상태는 **OWNER_CONFIRMED_APPROVED**입니다. 2026-11-08 기준 인증된 PostgreSQL 조립/운영 엔트리 코드는 `main`에 존재하고, [PR #396](https://github.com/ot4562-glitch/HUFS-One-AI/pull/396)에서 CampusAssist의 **명시적 승인 source 포트 전달 경로만** 추가됐습니다. 그러나 실제 Google/학교 메일·현재 학생 동의/권리·관리형 PostgreSQL/NCP·실기관 자료/모델과 청구·복구·독립 사람 검증은 **`NOT_RUN/NOT_CONNECTED`**이며 실서비스는 **`RELEASE_BLOCKED`**입니다. 현행 열린 요구사항은 [상태](../STATUS.md), [공식 출처 요청 #360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360), [개인정보 공개 검토 #362](https://github.com/ot4562-glitch/HUFS-One-AI/issues/362), [기능 API 통합 #366](https://github.com/ot4562-glitch/HUFS-One-AI/issues/366), [CampusAssist 실연결 #367](https://github.com/ot4562-glitch/HUFS-One-AI/issues/367)에서 추적합니다. 이전 연혁은 [보관 이력](OWNER_TRACK_RELEASE_EVIDENCE_20261106.md)에 유지합니다.

## 구성

`createPostgresApplication({runtime:'production', ...})`은 Google OIDC·학교메일 서비스, 명시적 SQL pool과 HTTPS origin을 사용합니다. `prepareOperatorPostgres`는 기본 7개 role 및 선택 서비스의 별도 role/DSN/CA TLS를 관리합니다. 경험 승인, 계정/동의, owner workspace·추천·학업·Source ingestion/review 등 13개 확장 서비스는 `extensions`로 연결합니다. raw pool 주입이나 다른 역할을 재사용한 설정은 거부합니다.

현재 지원 목록은 `apps/api/src/operator-extensions.ts`의 `MANAGED_PLATFORM_EXTENSIONS`입니다. 학업 What-if는 `majorWhatIfPostgres` 확장에서 독립 관리 SQL 역할·현재 소스/원문·학업 승인·학생 권한을 검증한 읽기 전용 로더로 연결합니다. 직접 주입되는 loader-only 포트는 운영자 설정에서 계속 거부합니다.

### CampusAssist 운영 출처 연결 (#367 — 첫 단계)

`OperatorPostgresInputs.campusAssist`는 **root가 관리하는 비공개 operator factory가 승인된 포트를 명시적으로 공급할 때만** `createPostgresApplication`과 인증된 API로 전달됩니다. 현재 선택 가능한 포트는 `activities`, `exchange`, `faq`이며 각각 `read({actor,asOf})`와 `revalidate({actor,receipt,now})`를 반드시 구현해야 합니다. 모든 포트가 빠지거나 하나라도 인터페이스가 불완전하면 조립을 거부합니다. 설정이 없으면 해당 API route가 등록되지 않습니다. 임의 합성 fixture, 공개 CSV와 브라우저 입력을 운영 출처로 자동 연결하지 않습니다.

**여전히 필요한 실제 인수:** operator가 별도 검수된 현행 출처 저장소/동의·자료 권리·revision/receipt/세션 취소를 포트에 실제 구현해야 하며, 운영 PostgreSQL 읽기 역할·권한 및 원문 이용권 실증은 **NOT_CONNECTED/NOT_RUN**입니다. FAQ의 유료 `hcx007` adapter를 이 포트로 직접 공급하는 것은 거부하므로 운영 질문은 제공자 승인/예산 게이트가 별도로 조립될 때까지 `CONFIGURATION_REQUIRED`입니다. 이 조치는 경로 연결 누락만 해소하는 **단계별 구현**이며 #367 운영 E2E 수락을 완료했다는 뜻이 아닙니다.

### 의존성 취약점 감사 CI (#394)

[PR #394](https://github.com/ot4562-glitch/HUFS-One-AI/pull/394)의 `.github/workflows/npm-dependency-audit.yml`은 PR/main/주간/수동에서 **package lockfile 중심 sparse checkout** 후 `npm audit --json`(runtime `--omit=dev` 및 전체)으로 High/Critical 항목을 차단하고, registry/metadata 오류 시 `SCAN_UNAVAILABLE` 실패로 처리합니다. 실제 [검증 실행](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42490419934)은 parser 6개 PASS 및 검사된 lockfile의 runtime/dev-only high=0, critical=0으로 끝났습니다. GitHub Dependabot alerts·CodeQL 보안 설정의 실제 활성화는 확인되지 않아 [#378](https://github.com/ot4562-glitch/HUFS-One-AI/issues/378) OPEN입니다. 이것은 운영 host 이미지/OS/실서비스 취약점 무결성 인수가 아닙니다.

### 운영 AI 입력·경험 등록

- `managedAi`는 `HCX_007`의 입력/권한(`aiAuthority`), 예산(`aiBudget`), 정산·결과(`aiResults`)를 서로 다른 관리 SQL 역할로 조립합니다.
- 선택적 `aiInputRegistration`은 네 번째 독립 SQL 역할 `aiInputOperator`와 외부의 검증된 `reviewer.verify`를 요구합니다. **공개 API로 노출되지 않는** `operatorRegistration.service.register`가 현재 경험·동의·소스/검토 근거를 검증해 불변 provider input과 현재 HEAD를 같은 트랜잭션에 기록합니다. 이 서비스는 운영 설정 없이 자동 실행되지 않습니다.
- 선행 schema와 역할은 `20261103_ai_provider_inputs.sql` → `20261105_ai_consented_personal_inputs.sql` → `20261105_ai_experience_bindings.sql` → `20261106_ai_experience_input_operator.sql` 순서로 준비합니다. 후속 migration은 같은 운영 DB와 operator 검증용 비공개 역할에서만 적용합니다. 직접 개인 데이터·역할·계정·유료 모델을 자동 생성하지 않습니다.
- 경험 수정·삭제, 개별 모델 동의 철회, 버전·세션 변경은 기존 입력의 payload와 HEAD를 폐기/재검증합니다. 학생은 `POST /api/experience/ai-skills/prepare`에서 승인된 자신의 경험을 선택하고, 결과를 확인한 뒤 `tag-approval`에서 명시적으로 선택합니다. AI 후보는 숙련도 인증이 아닙니다.

## 실제 CSV/BETA 연결 — API 코드와 운영 준비의 차이

[#277](https://github.com/ot4562-glitch/HUFS-One-AI/pull/277)의 `PostgresApplicationConfig.ownerIntake` 선택 loader와 `/api/private-intake/self` BETA 본인 화면/route 코드는 병합됐습니다. **그러나 `OperatorPostgresInputs`·`prepareOperatorPostgres`의 실운영 조립에는 owner registry/loader/4인 실제 `actorId` 매핑이 자동 주입되지 않습니다.** 각 학생의 검증된 Forms 행·수강 CSV 해시·현재 소유권/동의/철회·운영 DB readback·교차 actor 거부/실서버 테스트를 완료해야 실화면으로 인정합니다. 단순히 공개 Git `csv/` 파일을 복구하거나 DB에 적재한다고 로그인 계정/실제 화면이 자동 연결되지 않습니다. `csv/` 원본 5개를 임의 수정·삭제·이동/재인코딩하지 않으며 공개 컨테이너·CI/에이전트 작업 공간에서는 제외합니다. 남은 실운영 과제는 [#445/#447/#449](https://github.com/ot4562-glitch/HUFS-One-AI/issues/445).

## 비공개 서버 factory

Linux 호스트의 `/etc/hufs-one/private/production.mjs`에서 `createOperatorConfig()`를 export합니다. 실제 DB 연결·CA·Google exchange·메일 sender·현재 권한 resolver와 선택 AI executor를 서버 비밀 저장소에서 구성합니다. 선택 `close()` export는 AI HTTP transport 등 보조 자원을 정리합니다.

파일과 모든 상위 디렉터리는 root 소유, group/world 쓰기 불가, symlink 불가 조건을 만족해야 합니다. 파일은 단일 regular file이며 서비스 계정에 필요한 읽기 권한만 제공합니다. 실제 키·비밀번호는 저장소나 공개 로그에 복사하지 않습니다.

## 빌드·계획·실행

```sh
npm run build:api
node dist/apps/api/src/production-main.js --plan
```

`--plan`은 factory를 읽거나 네트워크/DB를 열지 않고 승인 완료·구성 요구사항을 출력합니다. 빌드 위치는 `apps/api/tsconfig.build.json`의 저장소 rootDir와 `dist` outDir 기준입니다.

실제 구성 후:

```sh
HUFS_PRODUCTION_CONFIG=/etc/hufs-one/private/production.mjs \
HUFS_API_INTERNAL_PORT=3000 NODE_ENV=production APP_ENV=production \
node dist/apps/api/src/production-main.js --apply
```

`127.0.0.1`에서 TLS 인그레스 뒤에 바인딩합니다. 모든 관리 DB 역할을 확인한 뒤 HTTP를 엽니다. `infra/deploy/hufs-production-api.service`는 서비스 계정·읽기 전용 파일시스템·종료 처리·재시작 제한을 제공하는 설치용 unit입니다. unit이 저장소에 있다는 사실은 서버에 설치됐다는 의미가 아닙니다.

## AI

`createPostgresProviderRuntime`에 실제 정책·가격·secret·SQL 역할·`enabled:()=>true`를 주입하면 이미 확인된 프로젝트 승인을 별도 기본-false 플래그로 재차 차단하지 않습니다. 명시적인 `liveApproved:()=>false`는 비상 정지로 존중합니다. 입력 actor/현재 세션·버전·source 근거·예산/중복 정산은 그대로 검증합니다.

## 검증

OIDC·메일·운영 SQL migration/backup·NCP/TLS·실 client IP·실제 공급자와 요금은 [#445/#447/#449](https://github.com/ot4562-glitch/HUFS-One-AI/issues/445)에서 실제 실행 결과로 기록합니다. 구성 누락은 CONFIGURATION_REQUIRED, 미실행은 NOT_RUN입니다. 합성 launcher를 실제 사용자 인증으로 바꾸지 않습니다.

[승인 정본](AUTHORIZATION.md) · [현재 상태](../STATUS.md).
## 비공개 컨테이너 구성 (설정형, 실행·배포 검증 별도)

`infra/deploy/Dockerfile`의 API 이미지 진입점은 이제 `production-main.js --apply`입니다. 이전 개발용 `main.js`를 production에서 실행하지 않습니다. `infra/deploy/compose.private.yaml`의 `private-deployment` 프로필은 기본적으로 비활성이며, 실제 실행에는 **미리 구성된 비공개 운영 디렉터리, 이미지 및 네트워크**가 필요합니다.

- `${HUFS_OPERATOR_ROOT}/production.mjs`는 **컨테이너 이미지에 COPY하지 않고 읽기 전용으로** `/etc/hufs-one/private/production.mjs`에 연결합니다. 로그인한 API 프로세스 `node`가 읽을 수 있으면서 파일과 디렉터리는 root 소유, group/world 쓰기 불가, symlink와 hard-link 없는 상태여야 합니다. 예를 들어 검증된 운영 Linux에서 `root:node`와 파일 `0440`·디렉터리 `0750`을 점검합니다. 키·실자료를 Git/CLI 출력에 적지 않습니다.
- `HUFS_PRODUCTION_CONFIG`와 `HUFS_API_INTERNAL_PORT=3000`을 명시합니다. API는 포트를 공개하지 않고 관리형 역할·OIDC·학교메일이 모두 준비된 후 `127.0.0.1`에 바인딩합니다. 컨테이너에서는 `HUFS_API_BIND_HOST=${HUFS_API_BACKEND_IPV4}`로 *실제 API 전용 backend 인터페이스*를 명시하고, root가 관리하는 `production.mjs`가 `approvePrivateBridge()`로 정확히 같은 사설 IPv4를 승인해야 합니다. 예를 들어 `{mode:'CONTAINER_PRIVATE_IPV4',approvedHost:'172.22.4.9'}` 형식입니다(주소는 가짜 예시). 서버는 주소가 네트워크 네임스페이스에 할당됐는지 확인하고 공인 IP/와일드카드/불일치를 거부합니다. 별도 edge는 내부 Docker DNS `api:3000`으로만 연결합니다. 이 코드는 컨테이너 네트워크·client IP/방화벽 운영 검증을 대체하지 않습니다.
- API의 운영 DB·Google/메일·승인된 모델 egress는 미리 프로비저닝하고 방화벽으로 제한한 외부 Docker 네트워크 `HUFS_APPROVED_EGRESS_NETWORK`에만 연결합니다. 내부 `backend` 네트워크는 그대로 private이며, edge에 외부 egress를 주지 않습니다. 네트워크 이름의 존재 자체는 허가/차단 정책을 증명하지 않습니다.
- 기존 `infra/deploy/private-deployment.mjs`는 메타데이터만 검사하고 `RELEASE_BLOCKED`를 유지합니다. `PRODUCTION_RUNTIME_NOT_APPLIED`는 **실제 적용·인수 미검증**이지 코드 진입점 미구현을 뜻하지 않습니다.

실제 operator secrets/migrations, 신뢰 프록시·직접 origin·두 client IP, Docker-container loopback 연결 및 배포/복구는 [#445/#447/#449](https://github.com/ot4562-glitch/HUFS-One-AI/issues/445)의 현재 운영자 구성·실실행·복구 근거와 추가 조립/보안 부정시험을 거쳐야 합니다.