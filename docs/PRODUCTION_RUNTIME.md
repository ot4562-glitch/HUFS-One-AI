# HUFS One AI — 승인된 운영 API 실행 구성

프로젝트 승인은 **OWNER_CONFIRMED_APPROVED**입니다. 운영 앱은 소유자의 승인 여부가 아니라 실제 설정·연결/권한 검증 결과에 따라 시작합니다. 이 문서는 PR #264의 운영 진입점을 설명합니다.

## 1. 조립

`createPostgresApplication({runtime:'production', ...})`은 실제 Google OIDC·학교메일 증명 서비스와 명시적인 SQL pool을 요구합니다. `prepareOperatorPostgres`는 기본 7개 SQL role 및 `extensions`의 별도 role/DSN/CA TLS를 생성하며 임의 raw pool 주입이나 role 중복을 거부합니다. 경험 승인·owner workspace/계정·공고/추천·학업·Source ingestion/review 등 기존 어댑터를 관리되는 pool에 연결합니다.

실제 확장 항목은 `apps/api/src/operator-extensions.ts`의 `MANAGED_PLATFORM_EXTENSIONS`를 확인합니다. loader-only `majorWhatIf`의 직접 주입은 아직 관리형 어댑터와 연결되지 않아 거부되며, 이를 승인 대기라고 표현하지 않습니다.

## 2. 비공개 구성 파일

Linux 호스트의 `/etc/hufs-one/private/production.mjs`에서 `createOperatorConfig()`를 export합니다. 실제 로그인 비밀·DB CA·OIDC exchange·메일 sender·현재 사용자 권한 resolver·선택 AI executor를 이 서버 파일 또는 서버 비밀 저장소에 구성합니다. 저장소에는 실제 값을 커밋하지 않습니다.

구성 파일과 모든 상위 디렉터리는 root 소유이며 group/world writable·symlink를 허용하지 않습니다. 파일은 root 소유 단일 regular file이어야 하며, 서비스 계정의 읽기 권한은 운영자가 명시적으로 제공합니다. 선택적 `close()` export는 AI HTTP transport 등 별도 자원을 정리합니다.

## 3. 명령

```sh
npm run build:api
node apps/api/dist/apps/api/src/production-main.js --plan
```

`--plan`은 개인 구성 파일을 읽거나 DB/네트워크를 열지 않습니다. 실제 배포 산출물의 경로는 `apps/api/tsconfig.build.json`의 rootDir/outDir와 빌드 결과에서 확인합니다.

실제 구성 후:

```sh
HUFS_PRODUCTION_CONFIG=/etc/hufs-one/private/production.mjs \
HUFS_API_INTERNAL_PORT=3000 NODE_ENV=production APP_ENV=production \
node apps/api/dist/apps/api/src/production-main.js --apply
```

주소는 `127.0.0.1`이며 TLS/접근 제어를 수행하는 인그레스 뒤에서 사용합니다. 모든 SQL 연결은 현재 사용자/비-superuser/비-BYPASSRLS 등 기존 managed pool 검사를 거친 뒤 HTTP를 엽니다. 실패 시 pool과 app을 정리하고 자격증명을 로그에 노출하지 않습니다.

## 4. 실제 검증

OIDC·메일·운영 DB migration/role/backup·NCP/TLS·실 client IP·공급자/요금의 실행 결과는 #252에 기록합니다. 승인과 테스트 상태는 별개입니다. 로컬 `main.ts`, `operator-main.ts`, synthetic 계정 launcher는 각 진단/합성 범위를 유지하며 운영 인증을 흉내내지 않습니다.

[승인 정책](AUTHORIZATION.md) · [현재 상태](../STATUS.md).