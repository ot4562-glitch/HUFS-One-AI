# HUFS One AI — NCP 승인형 host Terraform

**현재:** subnet/ACG/네트워크 contract가 있는 운영자의 명시 승인 이후에만 **단일 NIC·termination-protected Ubuntu Server·Public IP**를 준비하는 코드. 실제 NCP host/비용 생성·SSH 접속/HTTP 공개는 수행하지 않은 상태, RELEASE_BLOCKED. 이 모듈만으로 앱/학교 원본/실 Google/AI 기능이 기동하지 않는다.

## 실행 전 필수 검증

1. 네트워크 [network module](../network/README.md)의 현재 VPC/subnet/ACG/NACL/route·admin IPv4/32·정확한 plan/source SHA가 운영자 허가 계정에서 실제로 검토/적용됐는지 확인.
2. 실제 Ubuntu amd64 지원 이미지 ID·SKU/서버 zone·login-key 이름/공인 IP/디스크·대략 KRW/h/VAT/크레딧/운영 기간·예산 상한/중지 책임자 증거. 예제 ID/가격을 실제 지시로 복사하지 않음.
3. `node infra/ncp/setup/02-host-plan.mjs` plan-only 및 Terraform `init/plan`의 승인된 비공개 variables·hash/네트워크 계약 일치 여부를 독립 검토.
4. 사용자 별도 지출/실계정 승인·운영자 서명 없이 **`terraform apply` 금지**. 공개 80/443/앱/DB/유료 provider/원본 반입을 자동 수행하지 않음.
5. 실제 승인됐을 때만 Ubuntu SSH 키/호스트 지문·UFW/systemd/개인 SSH 로그인 후 root/password 차단·loopback synthetic preview/rollback/요금·반납을 별도 현장에서 검증.

오프라인 테스트: `node --test tests/security/ncp-host-plan.test.mjs`, `node --test tests/security/ncp-network-iac.test.mjs`. 실 NCP plan/apply와 다름.

[운영 총괄](../../README.md) · [승인 인수 #252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252).
