# HUFS One AI — 현재 운영 구성

> **2026-11-12 현행 재감사:** [36개 PR·31개 이슈 전수 기록](docs/REVIEW_AND_ISSUE_AUDIT_20261112.md). 새로 PR 3개 병합·버그 #427만 완료해 **PR 33건 / Issue 30건 OPEN**(감사 시점). 아래 옛 수치/상태는 기록 당시 스냅샷입니다. 합성 CI는 실 NCP·공식 출처 권리/사람 Gold 인수를 대신하지 않으며 `RELEASE_BLOCKED` 유지.

**승인 상태: OWNER_CONFIRMED_APPROVED.** 프로젝트 소유자가 개발·운영 방향의 승인을 확인했으나 실제 현재 학생·원문 이용권/동의·NCP/PG·HCX-007/OCR 청구/운영/복구 인수는 **NOT_RUN/NOT_CONNECTED/RELEASE_BLOCKED**입니다. 현행 코드·배포/비용·권한 증거는 [STATUS](STATUS.md)·[운영 절차](docs/PRODUCTION_RUNTIME.md)·[데이터 요청 #360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)·[보안 #362](https://github.com/ot4562-glitch/HUFS-One-AI/issues/362)·[CampusAssist #367](https://github.com/ot4562-glitch/HUFS-One-AI/issues/367)에서 추적합니다. 과거 #276은 실서비스 현재 OPEN 여부를 대신하지 않습니다.

## 코드와 운영

심민성은 API·DB·보안·CI·운영 조립 및 전체 코드 통합을 검수합니다. **박준영/이의상**은 HCX-007·CLOVA OCR 및 AI 코드/QA를 상호 교차검증하며, **이서연**은 React UI/UX·실제 API 배치를 담당합니다. **김채윤**은 기관 자료·게시권·원문/독립 Gold와 사용자 시연을 담당합니다. 실제 NCP 인스턴스·키/CA/TLS·도메인/과금의 배포 권한과 사람 수락은 별도 운영 증거·책임자를 확인하고 진행합니다.

`production-main.ts`는 plan-only 또는 명시적 apply로 실행됩니다. production 모드의 OIDC/학교메일과 managed SQL role/서비스 연결을 구성하고, HTTP는 loopback에서 실제 TLS 인그레스 뒤에 둡니다. 인증·RLS/CSRF·세션/현재 소유권·비밀키 보호는 끄지 않습니다.

## 실제 확인할 항목

실계정 OIDC/JWKS/PKCE·메일, DB CA TLS/독립 역할/migration/backup·restore, NCP 네트워크·TLS/Host·프록시 원 IP/직접 IP·IPv6·캐시, AI token/usage/청구/timeout·CPU/RSS, 운영 종료·복구를 실제 환경에서 측정합니다. 아직 수행하지 않은 검사는 NOT_RUN, 미측정은 NOT_MEASURED입니다.

[운영 실행](docs/PRODUCTION_RUNTIME.md) · [승인 정본](docs/AUTHORIZATION.md) · [현재 코드·실증 현황](STATUS.md).
## 2026-11-06 현재 NCP 코드와 문서

- NCP/SSH 합성 미리보기·Terraform·private runtime **코드 존재**와 **실계정/실서버 미실행**을 구별. 학생 계정/원본/PG/유료 CLOVA 및 요금은 **2026-11-06 당시** #276에서 OPEN으로 추적했으며, 현재 실증 증거·업무는 [STATUS](STATUS.md)와 열린 이슈를 확인합니다. `RELEASE_BLOCKED`는 유지합니다.
- [초보자용 NCP 서버 설치](docs/BEGINNER_NCP_SERVER_SETUP.md) · [제품·Codex·Claude CLI 설치](docs/BEGINNER_NCP_PRODUCT_AND_AGENTS.md) · [제품 구조](docs/BEGINNER_PRODUCT_ARCHITECTURE.md). 이 문서들의 설치 명령은 **실배포 성공 영수증이 아님**.
- `csv/` 원본 5개는 무단 변경/삭제하지 않되 공개 빌드·컨테이너·CI·모델 입력으로 넣지 않는다. 현재 학생별 actor/동의/원본 연결 및 실제 DB readback은 미완료.
