# 현재 NCP 운영 상태

프로젝트 소유자는 문서에 기재된 NCP·클라우드/모델·자료 전송·운영 및 출시 승인을 모두 완료했다고 확인했습니다. **OWNER_CONFIRMED_APPROVED**입니다. 실현 대상의 계정·리전/SKU·주소·키·가격·청구/종료 구성이 필요하며 미설정은 CONFIGURATION_REQUIRED로 표시합니다.

## 책임

심민성은 API/DB·CLOVA/worker·IaC/OS·배포/CI 코드를 작성합니다. 이서연은 계정/IAM·실호스트·가격/크레딧·서비스 설정·실측/반납의 비코드 담당입니다. 개발자가 없는 계정/비밀번호·실측 결과를 만들어내지 않습니다.

## 실행

기존 NCP network/host Terraform과 SSH 합성 preview는 자신의 제한된 모드를 유지합니다. 실제 사용자 서비스는 `production-main`과 [운영 factory](PRODUCTION_RUNTIME.md)로 시작합니다. DB CA TLS·분리 role/RLS·OIDC/학교메일·TLS ingress와 실제 환경이 연결되어야 합니다.

실계정/실호스트에서 가격·VAT·크레딧·청구 상한과 종료 책임, VPC/ACG/Network ACL·UFW·SSH host fingerprint, HTTPS/Host/TLS·원 client IP·직접 IP/IPv6·캐시, backup/restore·키 회전·CPU/RSS/p95·실제 비용을 검증합니다. 한국 리전이라는 이유만으로 한국 IP만 접근된다고 주장하지 않습니다.

## 결과

[#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)에는 실제 실행 SHA/환경·명령·PASS/FAIL/NOT_RUN/CONFIGURATION_REQUIRED와 측정값을 기록합니다. 소유자의 승인 완료 확인은 인정하되 아직 실행하지 않은 서버 배포/유료 모델/DB 작업의 성공을 의미하지 않습니다.

## 2026-11-06 업데이트

- 오너의 NCP/운영 코드·IaC는 병합되어 있어도 **실 NCP 계정·서버 생성·SSH·HTTPS/OIDC/PG/CLOVA/실비용·롤백/반납은 미실행**. `RELEASE_BLOCKED`.
- [초보자 서버 개설 가이드](BEGINNER_NCP_SERVER_SETUP.md) · [NCP 제품·Codex/Claude 설치](BEGINNER_NCP_PRODUCT_AND_AGENTS.md) · [운영 증거 원장](OWNER_TRACK_RELEASE_EVIDENCE_20261106.md). `csv/` 원본 5개는 무단 변경/삭제하지 않으며 공개 배포에 넣지 않음.
