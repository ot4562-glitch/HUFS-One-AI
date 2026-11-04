# 처음 준비하는 NCP 합성 미리보기

> **2026-11-04 현재 코드:** 통합 [PR #216](https://github.com/minseong-hufs/HUFS-One-AI/pull/216)로 NCP 네트워크·호스트·설치/배포·롤백 코드 main 반영, OPEN PR 0건. 실제 계정/요금 승인·Terraform apply·SSH·TLS 공개·복구 현장 드릴은 **NOT_RUN / RELEASE_BLOCKED**. [STATUS](../../STATUS.md).

현재 실행 가능한 배포는 **기존 #156의 SSH 터널 전용 합성 preview**다.
`setup/00-preflight.mjs`는 계정 없이 비용·네트워크·SHA 계획만 검증한다.
네트워크 IaC는 [별도 모듈](terraform/network/README.md)로 준비했으며 서버·NIC·IP
구성은 후속 구현이다. 운영 배포/수동 rollback/반납 자동화는 아직 별도 구현·수락
대상이며 이 Quickstart가 완료됐다는 뜻으로 해석하지 않는다. #46/#89
`RELEASE_BLOCKED`와 사용자 과금/호스트 승인은 계속 필요하다.

1. **관리 PC에서** 저장소의 AGENTS/STATUS, [운영 인계 양식](OPERATIONS_HANDOFF_TEMPLATE.md)을
   확인한다. Node/npm은 현재 승인된 `package.json` engines와 lockfile을 따른다.
   원본 CSV·Forms·키를 열거나 서버로 복사하지 않는다.
2. 작업 checkout에서 `git fetch origin main` 후, GitHub의 승인된 merge SHA와
   최신 CI를 확인한다. 계획 도구는 캐시된 `origin/main` 조상만 인정하며 실제
   원격 최신 상태나 독립 승인을 자동 증명하지 않는다.
3. 다음 예시를 **무시되는 local_only 폴더**에 저장한다. 예시 IP·SKU·가격은
   모두 합성이며 연결 대상/실제 견적이 아니다. 실제 관리자 공인 IPv4/32,
   충돌 없는 사설 CIDR, 운영자가 확인한 SKU·시간·저장소·IP 보유료·VAT·추가비용,
   예산, 승인된 40자리 SHA로 바꾸고 `OPERATOR_QUOTE` 여부를 정확히 기록한다.

```powershell
New-Item -ItemType Directory -Force local_only | Out-Null
node infra/ncp/setup/00-preflight.mjs --example |
  Set-Content local_only/ncp-setup.json -Encoding utf8
Get-Content local_only/ncp-setup.json -Raw |
  node infra/ncp/setup/00-preflight.mjs --plan
```

출력의 `planSha256`·예상 금액·리소스·차단 항목·00~06 단계를 함께 검토한다.
비용은 입력 견적의 정밀 소수 계산·원 단위 올림이며 **실제 청구 hard limit이
아니다**. 누락 트래픽/라이선스/중지 후 IP·스토리지 보유 비용과 크레딧 적용은
운영자 확인 사항이다. 입력은 64 KiB 이하 strict JSON이며 키/토큰 필드를
추가하면 거부한다. `--apply`는 지원하지 않으며 아무 계정·호스트도 변경하지 않는다.

4. **사용자 승인 후 이서연 운영 담당**이 [기존 가이드 1~2절](README.md)의
   VPC→subnet→ACG/NACL→Ubuntu→공인 IP를 준비한다. 관리자 PC의 공인 IP와
   서버 공인/사설 IP를 구별한다. ACG SSH /32 및 NACL 반환 트래픽을 확인한다.
   공인 IP 없이 접근하면 별도 승인된 bastion/VPN이 선행돼야 한다.
5. [기존 가이드](README.md)의 bootstrap을 사용하고 두 번째 SSH 키 세션을
   확인한 뒤 harden한다. 기존 `Deploy-NcpPreview.ps1 -Ref <승인SHA>` 기본 plan을
   검토한다. 실제 전송/실행에는 사용자 승인·독립 확인된 host fingerprint·로컬
   SSH 키·명시적 `-Apply`가 추가로 필요하다. 통째 Git clone/원본 동기화를 피하고
   `Prepare-NcpPreview.ps1`의 고정 allowlist ZIP만 사용한다.
6. systemd/loopback 5173/SSH 터널을 검증한다. 80/443/3000/5432 외부 공개,
   실제 Google/메일/학생/유료 Provider는 이번 preview에 포함되지 않는다.
   실패 시 기존 deploy의 자동 rollback 결과를 확인하고 수동 복구가 필요하면
   중단한다. 반납은 실제 리소스 ID·소유·보존·과금 확인과 운영자 영수증 없이
   자동 삭제하지 않는다.

계획 오류는 입력을 수정해 다시 실행한다. 예산 초과·CIDR 충돌·원격 SHA 불확실을
우회하지 않는다. 소프트웨어 검사: `node --test tests/security/ncp-setup-plan.test.mjs`.
Codex/Claude Code의 준비·작업 분기는 [에이전트 매뉴얼](AGENT_DEPLOYMENT_MANUAL.md)을 따른다.
