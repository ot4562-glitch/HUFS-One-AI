# HUFS One AI — NCP 비공개 합성 프리뷰 준비

**현재 코드:** NCP VPC/network/host IaC·Windows ZIP/SSH·Ubuntu systemd/복구 스크립트, plan/mock CI. **실 계정/요금·Terraform apply/실 SSH·TLS/PG/Google/유료 AI·학생 원본은 운영자 승인 및 실증 전**이다. `RELEASE_BLOCKED`. 실 운영 티켓 [#252](https://github.com/ot4562-glitch/HUFS-One-AI/issues/252), 코드 준비 [#253](https://github.com/ot4562-glitch/HUFS-One-AI/issues/253).

## 0. 안전한 PLAN (신규 리소스 0)

현재 approved SHA와 변경/검증 결과를 확인하고 계정/키/개인 원본이 없는 승인된 checkout의 `local_only/`에 **합성 예시 입력**을 저장한다. 예시 IP/SKU/비용은 실제 허가값이 아니다.

```powershell
New-Item -ItemType Directory -Force local_only | Out-Null
node infra/ncp/setup/00-preflight.mjs --example |
  Set-Content local_only/ncp-setup.json -Encoding utf8
Get-Content local_only/ncp-setup.json -Raw |
  node infra/ncp/setup/00-preflight.mjs --plan
```

계획형 테스트:

```sh
node --test tests/security/ncp-setup-plan.test.mjs
node --test tests/security/ncp-network-iac.test.mjs
```

## 1. 실제 비용 적용 전 게이트

이서연 NCP 비코드 운영 담당이 실제 IAM/한국 리전·Ubuntu amd64 서버 SKU/이미지·CB/공인 IP/요금·VAT/크레딧/quota/관리 공인 IPv4/32·SSH host key 및 반납 책임을 **공식 콘솔**에서 재확인하고, 최종 사용자가 지출/허가/중단 한도를 명시적으로 승인해야 한다. 승인 없으면 실제 키/VM/public IP/`terraform apply`/`-Apply`/모델 다운로드·외부 원본 전송 금지.

## 2. 승인된 SSH 합성 preview

승인된 Git SHA와 allowlist ZIP/hash만 `Prepare-NcpPreview.ps1`로 계획/준비, `Deploy-NcpPreview.ps1`는 기본 PLAN 모드로 먼저. 실제 전송/기동 옵션 `-Apply`는 승인된 운영자 환경에서만. 부팅 준비/SSH 지문·키 재로그인/UFW/ACG/NACL·Node/systemd를 검증하고 **127.0.0.1:5173 SSH tunnel**로만 접근한다. 외부 80/443, 실 API/Google/PG/학생 원본·OCR/HCX/Laya ON은 OFF.

실호스트 CPU/RSS/p95·서버 boot/restart·실패/last-good rollback·비용·종료/반납은 별도 영수증. 프리뷰 성공으로 공개 서비스를 활성화하지 않는다.

## 3. 운영 staging/공개는 별도

`production composition`·Google OIDC/외대메일·최소 PG RLS/TLS·Nginx/Edge·서로 다른 두 사용자 client IP/직접 IP·IPv6·CDN 보호·현재 원본 권리·독립 Gold/기기·D03의 **실제 설정/실행/인수 증거**가 없으므로 `RELEASE_BLOCKED/NO_GO`. 프로젝트 승인은 `OWNER_CONFIRMED_APPROVED`입니다.

[상세 NCP 가이드](README.md) · [Terraform network](terraform/network/README.md) · [host](terraform/host/README.md) · [운영 인계](OPERATIONS_HANDOFF_TEMPLATE.md).
