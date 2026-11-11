# 현재 NCP 운영 상태

프로젝트 소유자는 문서에 기재된 NCP·클라우드/모델·자료 전송·운영 및 출시 승인을 모두 완료했다고 확인했습니다. **OWNER_CONFIRMED_APPROVED**입니다. 실현 대상의 계정·리전/SKU·주소·키·가격·청구/종료 구성이 필요하며 미설정은 CONFIGURATION_REQUIRED로 표시합니다.

## 2026-11-11 현재 — 승인 의사와 실제 NCP 구성은 별개

`OWNER_CONFIRMED_APPROVED`는 제품 방향에 대한 소유자 승인 기록입니다. **실제 NCP 서비스 개설·계정/키·SKU/과금, 사이트 사용권/실원본 인수·Gold·DB/백업/복원·테스트 완료가 아닙니다**. 현행 기술 담당 [#445](https://github.com/ot4562-glitch/HUFS-One-AI/issues/445)·[#447](https://github.com/ot4562-glitch/HUFS-One-AI/issues/447), 미설계 계약 [#449](https://github.com/ot4562-glitch/HUFS-One-AI/issues/449), 실자료 담당 [#446](https://github.com/ot4562-glitch/HUFS-One-AI/issues/446)와 [11월 11일 감사](REVIEW_AND_ISSUE_AUDIT_20261111.md)를 우선합니다. 실제 실자료 원장/비밀·개인정보는 NCP 비공개, GitHub에는 코드/합성 fixture만 저장합니다.

**NCP 5인 접근 원칙:** 팀원별 NCP Sub Account, 업무별 최소 권한 및 고유 SSH 공개키·MFA/회수·감사. 단일 root 개인키·메인 API 비밀키 공유 금지. Crawlee는 심민성이 **GitHub 코드로 개발·검수**, NCP에서 **전용 비특권 서비스 계정**으로 실행합니다. root/sudo는 제한된 서비스를 시작하는 조작에만 사용; 실제 계정 생성/배포·비용 확인은 권한 있는 운영자의 인수를 요구합니다. `NOT_RUN / CONFIGURATION_REQUIRED / RELEASE_BLOCKED` 유지.

## 2026-11-08 당시 협업자 업무·자료 요청 안내 (역사적 기록)

현행 [팀 역할](WORKSTREAMS.md) 및 [자동 이슈 배정 가이드](ISSUE_ASSIGNMENT_PLAYBOOK.md)를 따른다. **고정 역할 #355–#359는 읽기 전용**이며 운영/코드/데이터 요청을 그 이슈에 쓰지 않는다. 신규 추가 기능은 심민성이 가능한 일반 인프라/API/DB·통합 코드까지 진행하고, **코드 기반 AI 포함 AI 개발은 박준영/이의상에게 인계**한다. 자료/포스터/Gold가 필요하면 별도 `[데이터 요청]` 이슈를 김채윤에게 발행하고 해당 기능의 공동 assignee로 둔다. 기존 기능 자료 요청은 [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360). 웹 UI/기능 배치는 이서연, AI 기술 QA는 박준영, 총괄/통합은 심민성이 계속 검수한다.

## 책임

심민성은 API/DB·CLOVA/worker·IaC/OS·배포/CI 코드를 작성합니다. 이서연은 웹 UI/UX·실제 기능 배치를 담당합니다. 계정/IAM·호스트·가격/크레딧·서비스 설정/실측·반납은 실제 운영 접근 권한을 가진 담당자가 #445/#449의 인수 절차와 책임자 확인을 거쳐 수행하며, 임의로 특정 팀원의 NCP 계정 관리자 권한이 있다고 가정하지 않습니다. 개발자가 없는 계정/비밀번호·실측 결과를 만들어내지 않습니다.

## 실행

기존 NCP network/host Terraform과 SSH 합성 preview는 자신의 제한된 모드를 유지합니다. 실제 사용자 서비스는 `production-main`과 [운영 factory](PRODUCTION_RUNTIME.md)로 시작합니다. DB CA TLS·분리 role/RLS·OIDC/학교메일·TLS ingress와 실제 환경이 연결되어야 합니다.

실계정/실호스트에서 가격·VAT·크레딧·청구 상한과 종료 책임, VPC/ACG/Network ACL·UFW·SSH host fingerprint, HTTPS/Host/TLS·원 client IP·직접 IP/IPv6·캐시, backup/restore·키 회전·CPU/RSS/p95·실제 비용을 검증합니다. 한국 리전이라는 이유만으로 한국 IP만 접근된다고 주장하지 않습니다.

## 결과

[#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)에는 실제 실행 SHA/환경·명령·PASS/FAIL/NOT_RUN/CONFIGURATION_REQUIRED와 측정값을 기록합니다. 소유자의 승인 완료 확인은 인정하되 아직 실행하지 않은 서버 배포/유료 모델/DB 작업의 성공을 의미하지 않습니다.

## 2026-11-06 업데이트

- 오너의 NCP/운영 코드·IaC는 병합되어 있어도 **실 NCP 계정·서버 생성·SSH·HTTPS/OIDC/PG/CLOVA/실비용·롤백/반납은 미실행**. `RELEASE_BLOCKED`.
- [초보자 서버 개설 가이드](BEGINNER_NCP_SERVER_SETUP.md) · [NCP 제품·Codex/Claude 설치](BEGINNER_NCP_PRODUCT_AND_AGENTS.md) · [운영 증거 원장](OWNER_TRACK_RELEASE_EVIDENCE_20261106.md). `csv/` 원본 5개는 무단 변경/삭제하지 않으며 공개 배포에 넣지 않음.
