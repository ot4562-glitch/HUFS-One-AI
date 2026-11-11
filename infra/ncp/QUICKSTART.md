# HUFS One AI — NCP 비공개 합성 프리뷰 준비

**현재 코드:** NCP VPC/network/host IaC·Windows ZIP/SSH·Ubuntu systemd/복구 스크립트, plan/mock CI. **실 계정/요금·Terraform apply/실 SSH·TLS/PG/Google/유료 AI·학생 원본은 운영자 승인 및 실증 전**이다. `RELEASE_BLOCKED`. 실 운영 인수는 #445/#447/#449에서 추적하며, #276·#253은 이전 분할/이관 기록입니다.

## 2026-11-11 현행 운영 기준

이 문서는 **합성 NCP 설치 계획 및 제한된 프리뷰**의 사용법입니다. 실서비스 자료 수집/권리·Gold/실제 서버 설정/비용을 수락한 것이 아닙니다. 현행 [#445](https://github.com/ot4562-glitch/HUFS-One-AI/issues/445) 수집기·스케줄, [#447](https://github.com/ot4562-glitch/HUFS-One-AI/issues/447) 전 기능/실자료, [#449](https://github.com/ot4562-glitch/HUFS-One-AI/issues/449) 미정 보존·권한·예산 계약과 [전수 감사](../../docs/REVIEW_AND_ISSUE_AUDIT_20261111.md)를 우선 확인하십시오. 팀원 5인은 개별 IAM/SSH 키/최소권한을 사용하고 실제 원문·출처 운영 registry/Gold·비밀은 NCP 내부에만 저장합니다. 고정 SHA·스키마 확인/비특권 worker·백업·실제 인수 전 `RELEASE_BLOCKED` 유지.

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

NCP **권한 있는 운영 담당자**가 실제 IAM/한국 리전·Ubuntu amd64 서버 SKU/이미지·CB/공인 IP/요금·VAT/크레딧/quota/관리 공인 IPv4/32·SSH host key 및 반납 책임을 **공식 콘솔**에서 재확인하고, 최종 사용자가 지출/허가/중단 한도를 명시적으로 승인해야 한다. 승인 없으면 실제 키/VM/public IP/`terraform apply`/`-Apply`/모델 다운로드·외부 원본 전송 금지.

## 2. 승인된 SSH 합성 preview

승인된 Git SHA와 allowlist ZIP/hash만 `Prepare-NcpPreview.ps1`로 계획/준비, `Deploy-NcpPreview.ps1`는 기본 PLAN 모드로 먼저. 실제 전송/기동 옵션 `-Apply`는 승인된 운영자 환경에서만. 부팅 준비/SSH 지문·키 재로그인/UFW/ACG/NACL·Node/systemd를 검증하고 **127.0.0.1:5173 SSH tunnel**로만 접근한다. 외부 80/443, 실 API/Google/PG/학생 원본·OCR/HCX/Laya ON은 OFF.

실호스트 CPU/RSS/p95·서버 boot/restart·실패/last-good rollback·비용·종료/반납은 별도 영수증. 프리뷰 성공으로 공개 서비스를 활성화하지 않는다.

## 3. 운영 staging/공개는 별도

`production composition`·Google OIDC/외대메일·최소 PG RLS/TLS·Nginx/Edge·서로 다른 두 사용자 client IP/직접 IP·IPv6·CDN 보호·현재 원본 권리·독립 Gold/기기·D03의 **실제 설정/실행/인수 증거**가 없으므로 `RELEASE_BLOCKED/NO_GO`. 프로젝트 승인은 `OWNER_CONFIRMED_APPROVED`입니다.

[상세 NCP 가이드](README.md) · [Terraform network](terraform/network/README.md) · [host](terraform/host/README.md) · [운영 인계](OPERATIONS_HANDOFF_TEMPLATE.md).


## 2026-11-06 팀원 입문 가이드

- [NCP 서버 개설·SSH 보안](../../docs/BEGINNER_NCP_SERVER_SETUP.md), [NCP 제품+GPT(Codex)·Claude Code 설치](../../docs/BEGINNER_NCP_PRODUCT_AND_AGENTS.md), [제품 원리](../../docs/BEGINNER_PRODUCT_ARCHITECTURE.md).
- 오너·추천·학업 코어의 GitHub 병합/합성 Actions 결과는 [현재 STATUS](../../STATUS.md) 참고. **실 서버 apply/SSH·실비용·Google·학생별 자료·실 모델이 작동했다는 뜻이 아님**. 운영 통합 #276 후속, `RELEASE_BLOCKED`.
