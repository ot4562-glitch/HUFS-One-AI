# HUFS One AI — 현재 NCP 네트워크·호스트·배포 안전 가이드

**현재 상태:** network/host Terraform·Windows→Ubuntu 계획/SSH 합성 프리뷰/롤백 **코드**가 존재하며 NCP 실제 리소스를 만들거나 운영·유료 모델을 실행한 것은 아니다. 실제 실서버/공개/학생 원본 전송을 승인하지 않으며 **`RELEASE_BLOCKED`**. 현재 구현 [#253](https://github.com/minseong-hufs/HUFS-One-AI/issues/253), 현장 인수 [#252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252), 운영 책임 [#12](https://github.com/minseong-hufs/HUFS-One-AI/issues/12).

## 운영 책임과 승인

- 심민성: Terraform·NCP SDK·배포 자동화/PowerShell·systemd/OS·worker·CI·rollback **모든 소프트웨어 코드**.
- 이서연: NCP 계정/IAM·리전/SKU/스토리지/요금·크레딧/quota·실서버·실측 CPU/RSS/중지/반납 **비코드 운영**.
- 최종 사용자/원본 권리자: 신규 비용/서버/공개·학생·학교 자료/AI 외부전송의 **별도 서면 승인**. 임의로 `-Apply`·`terraform apply`, 유료 모델/원본 반입 금지.

## 구성 단계

| 단계 | 네트워크·서버 기능 | 실제 상태 |
| --- | --- | --- |
| 00 plan | 승인 검토용 입력 구조/비밀·공개 포트 정책·비용 예측/해시 | 로컬 계획·mock 코드, 지출 없음 |
| 01 network | 독립 VPC/subnet/route·IGW, 관리자 IPv4/32 ACG·stateless NACL, `terraform/network` | offline IaC 검증, 실 apply 미실행 |
| 02 host | 승인된 NIC·종료 보호 Ubuntu host·Public IP·login key, `terraform/host` | 검토 가능한 계획 코드, 실 VM 미생성 |
| SSH-only preview | synthetic allowlist ZIP+SHA/SFTP/host fingerprint/Ubuntu UFW/systemd/127.0.0.1:5173·last-good rollback | 코드 존재, 실제 host 작업 승인/수락 전 |
| prod staging | 실제 인증/PG/TLS/Nginx/LB/Edge·RLS·worker·원본 권리·백업/복원·인적 검증 | 필수 코드/환경·인적 수락 전, 공개 차단 |

## 00 — 승인 전 계획만

```sh
node infra/ncp/setup/00-preflight.mjs --example
node --test tests/security/ncp-setup-plan.test.mjs
node --test tests/security/ncp-network-iac.test.mjs
```

실제 입력은 Git 추적 밖 `local_only/`에 저장한다. 예시 네트워크·금액·ID를 실제 NCP 콘솔의 현재 엔트리/가격/충돌 없는 CIDR·관리 IP로 바꾸는 것은 **승인된 운영자의 일**이다. 원본 학생·세션·키/비밀을 복사하거나 공개 로그로 출력하지 않는다.

## 01 — Network plan

- 독립 VPC·Subnet/IGW/route와 최소 inbound SSH 관리자 공인 IPv4/32. 공개 API/PG/Redis/worker/debug/preview/HTTP/HTTPS는 별도 공개 승인 전 닫힘.
- ACG(상태), NACL(stateless 양방향 반환 포트), UFW/관리키/IPv6·resolver 및 충돌 없는 임시 포트는 별도로 검토. 한국 리전 선택만으로 KR Geo 접근 차단된 것은 아님.
- `node infra/ncp/setup/01-network-plan.mjs`의 private 입력/vars, `infra/ncp/terraform/network`의 `terraform plan` 및 `check-offline.py`를 **plan only** 수행. `terraform apply`는 별도 승인 없으면 금지.

## 02 — Host plan

`node infra/ncp/setup/02-host-plan.mjs`는 승인된 network contract/plan SHA·실 Ubuntu image/SKU/자원·로그인 키·예상 시간/요금/상한·터미네이션 보호를 검증한다. NIC·server·Public IP는 **새 과금 리소스**이다. 운영자·최종 사용자 승인 없이 `terraform apply`를 실행하지 않음.

## SSH-only 합성 배포와 보안

- Windows에서 `Prepare-NcpPreview.ps1`로 현재 승인 main SHA/allowlist synthetic 파일의 ZIP+SHA를 생성. 실제 학생/원본·private repo·키/비밀/서버 .env는 artifact에 포함하지 않음.
- `Deploy-NcpPreview.ps1` 기본 plan을 살펴보고, **명시 `-Apply`는 해당 host/비용 승인 이후만**. 호스트키 지문/SSH 공개키 로그인 두 독립 세션 성공 후 root/password 차단. 원격 SFTP/SSH·127.0.0.1:5173 systemd/헬스/재기동·명시적 rollback을 실제 확인.
- 공개 80/443·API/PG·학교메일/Google/유료 CLOVA/실학생 데이터/외부 네트워크 배포는 **SSH 합성 preview에서 사용하지 않는다**.
- 운영 배포를 위한 안전 코드 수정과 인적/운영 검증은 [제품 런북](../../docs/PRODUCT_ACTIVATION_RUNBOOK_20261105.md)을 따른다. production 거부 환경변수를 강제로 바꿔 공개하지 않음.

## 운영 TLS·인증·관측/복구 조건

승인된 public 운영 진입점에서 Host/SNI/DNS/TLS/Nginx/LB/WAF/Edge KR whitelist·미인증 HTML/JS/API/media/CDN·직접 origin IP/IPv6/preview bypass, 실 Google sub/JWKS/학교메일 OTP·REVIEWER 세션/철회, PostgreSQL CA TLS/최소 RLS·backup/restore·role 분리를 검증해야 한다.

LB 앞단이라면 신뢰된 정확한 LB CIDR의 real_ip 또는 검토된 PROXY protocol과 **실제 서로 다른 두 client IP의 API `request.ip` 구분·임의 XFF 무효**를 증명한다. 키·로그/토큰/원본/AI prompt, p95/CPU/RSS/비용·크레딧/hard stop/모델 quota·중단/반납 영수증을 비공개 기록한다.

**검증/인계:** [QUICKSTART](QUICKSTART.md) · [운영 기록 양식](OPERATIONS_HANDOFF_TEMPLATE.md) · [현재 인수](../../docs/HUMAN_ACCEPTANCE_GATE_20261104.md).
