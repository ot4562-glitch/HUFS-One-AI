# HUFS One AI — 현재 운영 구성

**승인 상태: OWNER_CONFIRMED_APPROVED.** 문서에 기재된 NCP·모델/정보 전송·운영/출시 승인은 소유자가 완료 확인했습니다. 실제 배포와 성능/과금 결과는 #252에서 확인하며, 설정이 없으면 CONFIGURATION_REQUIRED로 분류합니다.

## 코드와 운영

심민성은 API/DB·AI/OCR/HCX·Laya/worker·NCP SDK/IaC/OS/CI·배포 코드를 담당합니다. 이서연은 계정·요금·실호스트·운영 결과의 비코드 담당입니다. 선택된 실제 대상/키·CA/TLS·domain이 설정된 뒤 운영 작업을 실행합니다.

`production-main.ts`는 plan-only 또는 명시적 apply로 실행됩니다. production 모드의 OIDC/학교메일과 managed SQL role/서비스 연결을 구성하고, HTTP는 loopback에서 실제 TLS 인그레스 뒤에 둡니다. 인증·RLS/CSRF·세션/현재 소유권·비밀키 보호는 끄지 않습니다.

## 실제 확인할 항목

실계정 OIDC/JWKS/PKCE·메일, DB CA TLS/독립 역할/migration/backup·restore, NCP 네트워크·TLS/Host·프록시 원 IP/직접 IP·IPv6·캐시, AI token/usage/청구/timeout·CPU/RSS, 운영 종료·복구를 실제 환경에서 측정합니다. 아직 수행하지 않은 검사는 NOT_RUN, 미측정은 NOT_MEASURED입니다.

[운영 실행](docs/PRODUCTION_RUNTIME.md) · [승인 정본](docs/AUTHORIZATION.md) · [실행 검증 #252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252).