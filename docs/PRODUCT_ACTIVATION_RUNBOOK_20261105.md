# HUFS One AI — 제품 실행·검증·실서비스 전환 순서

> **현행 판정(2026-11-06):** 프로젝트 범위 승인 `OWNER_CONFIRMED_APPROVED`, 코드 병합·합성 CI는 검증됨. **실 NCP 서버/Google/학교메일/운영 PostgreSQL·학생 4명 DB 적재/실 CLOVA·비용/복원은 `NOT_RUN` 또는 `CONFIGURATION_REQUIRED`; 공개 서비스는 `RELEASE_BLOCKED`.** 과거 문서의 #252/#253/#257 이슈는 후속을 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)에 이관하며 종료됨.

## 1. 코드를 먼저 고정

- 현재 `main` SHA와 변경 파일·담당 규칙([AGENTS](../AGENTS.md)) 확인. 동료 dirty worktree·CSV 원본 5개 변경 금지.
- 오너 PR #267~#275 중 실제 분할 8건 및 #277, 동료 [#278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278)·[#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279)은 **main MERGED**. 구 대형 #264 **CLOSED 미병합**.
- 코드 통합 기준 `48134da`의 [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752742), [Chrome](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752741), [NCP IaC offline](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752743), [합성 Pages](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42138752761) **4/4 SUCCESS**. 새로운 문서/코드 commit은 해당 HEAD의 CI를 다시 확인한다.

## 2. 계획/합성 화면만 먼저 검증

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run build:api
npm run build:web
node dist/apps/api/src/production-main.js --plan
```

`--plan`은 비밀·DB/NCP·실자료를 읽지 않고 구성 요구만 출력한다. 로컬 합성 데모는 [DEMO_MANUAL](DEMO_MANUAL.md), 실제 NCP의 안전한 SSH 전용 합성 preview는 [NCP 서버 만들기](BEGINNER_NCP_SERVER_SETUP.md) → [NCP 제품/AI 개발 에이전트 설치](BEGINNER_NCP_PRODUCT_AND_AGENTS.md)를 참고한다. 합성 5계정/REVIEWER는 실학생 정보가 아니다.

## 3. 본선진출 이후 실서비스 운영자 구성(#276)

1. NCP IAM·비용 상한/크레딧/리전/SKU/호스트·공인 IP·VPC/ACG/NACL/UFW/중단 책임을 실제 콘솔에서 확인.
2. 별도 신뢰된 operator factory `/etc/hufs-one/private/production.mjs`에 Google OIDC/외대메일, 인증·세션/CSRF, PostgreSQL 기본 7개+활성 확장 독립 role/CA TLS·FORCE RLS·백업/복원·rights을 구현. [PRODUCTION_RUNTIME](PRODUCTION_RUNTIME.md).
3. `csv/` Forms 1 + 수강 4 = 5개 원본 유지; 배포/CI 번들에 넣지 않는다. 각 학생별 현재 consent/rights↔Forms 행↔CSV 파일 해시↔**BETA actorId**를 실제 검증된 비공개 registry로 매핑한다. 단순 CSV DB INSERT 또는 PR #277 병합만으로 실화면 연결 완료를 주장하지 않는다.
4. 운영자 분리된 민감 data intake/SQL migration을 plan→현재 권리/학생별 검토→실 DB apply/readback→철회/삭제/rollback 순으로 실행. 실제 원장·RulePack/학수번호 미확인을 공식 판정으로 바꾸지 않는다.
5. 실제 CLOVA OCR/HCX/Vision는 서버 전용 키, 예산·요금·타임아웃/취소·원문 이용권·사용자별 동의·출처 검증 후에만 호출. 개발 Codex/Claude Code 설치와 구분.
6. 도메인/DNS/TLS/Host/SNI, 신뢰 프록시·다른 실제 client IP·직접 origin/IPv6 우회·API/DB 비공개 포트, 로그·개인정보 비노출, 재시작·백업/복원·rollback을 증명.

## 4. 출시 전 실수락

- BETA/REVIEWER/ADMIN 역할·로그아웃/만료/복구·401/403/409/422/429/503, 두 사용자 자료 교차 거부·동의 철회 및 레이스.
- 학생 경험→AI 후보→**본인 승인**→추천→철회 종단의 실제 모델/데이터와 UI #258·학업 #260 소비자 검수.
- 학교 공식 자료·RulePack/학점·수업 개설 증거, 실제 기기/모바일/스크린리더, 모델 청구·CPU/RSS/p95, 운영 중단/반납. 독립 사람 Gold는 이번 범위에서 제외되었으므로 **미완료**로 두고 달성률로 포장하지 않는다.
- **현재 상태:** 실계정/서버·요금/학생별 최신 권리·복구/검증이 없으므로 출시 `RELEASE_BLOCKED`. 완료 증거를 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) 및 [운영 증거 원장](OWNER_TRACK_RELEASE_EVIDENCE_20261106.md)에 반영.

## 5. 문서와 운영 인계

[초보자용 제품 원리](BEGINNER_PRODUCT_ARCHITECTURE.md) · [운영 인수 #276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) · [NCP 인계 양식](../infra/ncp/OPERATIONS_HANDOFF_TEMPLATE.md) · [팀 담당 범위](WORKSTREAMS.md).
