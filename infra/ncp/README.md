# HUFS One AI — 현재 NCP 네트워크·호스트·배포 안전 가이드

**현재 상태:** network/host Terraform·Windows→Ubuntu 계획/SSH 합성 프리뷰/롤백 **코드**가 존재하며 NCP 실제 리소스를 만들거나 운영·유료 모델을 실행한 것은 아닙니다. 자료·개인정보·기관·NCP/모델·운영/출시 승인은 소유자가 모두 완료 확인해 **`OWNER_CONFIRMED_APPROVED`**입니다. 실제 자격증명/호스트/요금·인그레스·복구 검증이 없어 **`CONFIGURATION_REQUIRED`** 및 **`RELEASE_BLOCKED`**로 관리합니다. 구현 현황 [STATUS](../../STATUS.md), 실운영 인수 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276), 비코드 운영 책임 [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12).

## 운영 책임과 승인

- 심민성: Terraform·NCP SDK·배포 자동화/PowerShell·systemd/OS·worker·CI·rollback **모든 소프트웨어 코드**.
- 이서연: NCP 계정/IAM·리전/SKU/스토리지/요금·크레딧/quota·실서버·실측 CPU/RSS/중지/반납 **비코드 운영**.
- 프로젝트의 자료·클라우드·모델·운영 승인은 **소유자 완료 확인**. 실제 기관 라이선스·학생별 현재 동의·역할/비밀·현행 요금/리전/SKU/계정 한도와 적용 대상은 운영 구성을 통해 별도 검증합니다. `-Apply`·`terraform apply`는 명시적인 현재 대상/복구 조건으로만 수행합니다.

## 구성 단계

| 단계 | 네트워크·서버 기능 | 실제 상태 |
| --- | --- | --- |
| 00 plan | 승인 검토용 입력 구조/비밀·공개 포트 정책·비용 예측/해시 | 로컬 계획·mock 코드, 지출 없음 |
| 01 network | 독립 VPC/subnet/route·IGW, 관리자 IPv4/32 ACG·stateless NACL, `terraform/network` | offline IaC 검증, 실 apply 미실행 |
| 02 host | 승인된 NIC·종료 보호 Ubuntu host·Public IP·login key, `terraform/host` | 검토 가능한 계획 코드, 실 VM 미생성 |
| SSH-only preview | synthetic allowlist ZIP+SHA/SFTP/host fingerprint/Ubuntu UFW/systemd/127.0.0.1:5173·last-good rollback | 코드 존재, 실제 host 작업 승인/수락 전 |
| prod staging | 실제 인증/PG/TLS/Nginx/LB/Edge·RLS·worker·원본 권리·백업/복원·인적 검증 | 필수 코드/환경·인적 수락 전, 공개 차단 |

## 00 — 승인 완료, 계획과 실제 적용은 별도

```sh
node infra/ncp/setup/00-preflight.mjs --example
node --test tests/security/ncp-setup-plan.test.mjs
node --test tests/security/ncp-network-iac.test.mjs
```

실제 입력은 Git 추적 밖 `local_only/`에 저장한다. 예시 네트워크·금액·ID를 실제 NCP 콘솔의 현재 엔트리/가격/충돌 없는 CIDR·관리 IP로 바꾸는 것은 **승인된 운영자의 일**이다. 원본 학생·세션·키/비밀을 복사하거나 공개 로그로 출력하지 않는다.

## 01 — Network plan

- 독립 VPC·Subnet/IGW/route와 최소 inbound SSH 관리자 공인 IPv4/32. 공개 API/PG/Redis/worker/debug/preview/HTTP/HTTPS는 현재 배포 대상·방화벽·TLS/Host/SNI와 독립 접근 테스트가 검증되기 전 기본 닫힘.
- ACG(상태), NACL(stateless 양방향 반환 포트), UFW/관리키/IPv6·resolver 및 충돌 없는 임시 포트는 별도로 검토. 한국 리전 선택만으로 KR Geo 접근 차단된 것은 아님.
- `node infra/ncp/setup/01-network-plan.mjs`의 private 입력/vars, `infra/ncp/terraform/network`의 `terraform plan` 및 `check-offline.py`를 **plan only** 수행. `terraform apply`는 실제 계정·권한·요금·rollback 대상을 운영자가 확인하고 명시적으로 선택한 경우에만 수행.

## 02 — Host plan

`node infra/ncp/setup/02-host-plan.mjs`는 승인된 network contract/plan SHA·실 Ubuntu image/SKU/자원·로그인 키·예상 시간/요금/상한·터미네이션 보호를 검증한다. NIC·server·Public IP는 **새 과금 리소스**이다. 사용자 프로젝트 승인은 확인 완료. 실제 리전/SKU·비용/한도·운영자 책임·복구 대상 검증 및 명시적 apply 없이 리소스를 생성하지 않음.

## SSH-only 합성 배포와 보안

- Windows에서 `Prepare-NcpPreview.ps1`로 현재 승인 main SHA/allowlist synthetic 파일의 ZIP+SHA를 생성. 실제 학생/원본·private repo·키/비밀/서버 .env는 artifact에 포함하지 않음.
- `Deploy-NcpPreview.ps1` 기본 plan을 살펴보고, **명시 `-Apply`는 해당 실제 host/현재 요금·복구 대상 확인 이후만**. 호스트키 지문/SSH 공개키 로그인 두 독립 세션 성공 후 root/password 차단. 원격 SFTP/SSH·127.0.0.1:5173 systemd/헬스/재기동·명시적 rollback을 실제 확인.
- 공개 80/443·API/PG·학교메일/Google/유료 CLOVA/실학생 데이터/외부 네트워크 배포는 **SSH 합성 preview에서 사용하지 않는다**.
- 운영 배포를 위한 안전 코드 수정과 인적/운영 검증은 [제품 런북](../../docs/PRODUCT_ACTIVATION_RUNBOOK_20261105.md)을 따른다. production 거부 환경변수를 강제로 바꿔 공개하지 않음.

### Windows 경로·호스트키 및 설치 공개키 계약

- 두 Windows 진입점은 `NcpPreview.Common.ps1`의 동일 검증을 사용한다. `-PlinkExe`/`-WinSCPExe`를 명시할 때는 로컬 드라이브의 **절대 파일 경로**를 지정한다. 개인키의 상대 경로는 PowerShell의 현재 위치를 기준으로 한 번만 해석하고 그 결과를 검증·실행에 그대로 사용한다. UNC/드라이브 상대 경로·symlink 파일·따옴표/개행/`%NAME%` 확장은 거부한다.
- 독립 확인한 `ssh-ed25519 255 SHA256:<43자>` 또는 OpenSSH의 `256` 표기를 입력한다. 같은 32바이트 digest를 plink에는 `SHA256:<43자>`, WinSCP에는 `ssh-ed25519 255 <43자>=`로 전달한다. RSA/P-256도 같은 digest 계약을 사용한다. [PuTTY 지문 규칙](https://www.chiark.greenend.org.uk/~sgtatham/putty/0.85/htmldoc/Chapter4.html#config-ssh-kex-manual-hostkeys) · [WinSCP 지문 형식](https://winscp.net/eng/docs/message_key_fingerprint_does_not_match).
- WinSCP 명령은 UTF-8 임시 `/script` 파일로 전달해 PowerShell 5.1의 중첩 인용 문제를 피하고 성공/실패 모두 `finally`에서 삭제한다. 핀/전송 오류가 발생하면 원격 apply는 실행하지 않는다. 올바른 형식의 지문이 실제 서버와 일치하는지는 SSH 핸드셰이크에서 판단하므로, 서버 접촉 없이 실제 일치를 확인했다고 주장하지 않는다. [WinSCP 명령 인용 규칙](https://winscp.net/eng/docs/commandline).
- 설치기 및 직접 bootstrap 모두 **정규 절대 경로로 `/root` 바로 아래에 둔 root 소유 0600/0644 공개키**만 허용한다. `../`, 파일/부모 symlink, 다른 소유자, group/other 쓰기와 실행·특수 권한을 실행 전 거부한다. `/root` 역시 root 소유이며 다른 사용자가 수정할 수 없어야 한다.
- `Operator-NcpPreview.ps1`의 `Target`/`ExpectedCurrent`는 Rollback에만 전달한다. Deploy/Verify/Plan에서 혼합하면 실패한다. 두 Windows 진입점과 Ubuntu 설치기의 주소 정책은 `1.1.1.1`을 허용하고 사설·공유·예약·문서·벤치마크·멀티캐스트 주소를 거부한다.
- `NCP IaC offline contracts`는 SHA256으로 고정한 공식 **WinSCP 6.7.0 NuGet DLL의 실제 `SessionOptions` 지문 파서**(변환 후 수락/기존 형식 거부, `Check` 정책 보존), Windows PowerShell 5.1의 네트워크 기능 없는 native stub 회귀, Ubuntu 22.04/24.04의 임시 root 소유 키/번들 검증, Terraform mock을 실행한다. **실제 WinSCP/plink 서버 교환 및 실제 NCP 인수는 #276의 별도 실행 증거**이며 로컬 파서/stub 성공으로 대체하지 않는다.

### 실제 도구·거부 포트와 안전 검증

- Windows 운영 PC에서 **PuTTY**로 서버가 제공한 SSH host key 지문을 고정해 비교하고, **WinSCP** SFTP로 승인된 합성 ZIP/hash만 전송한다. 관리자 **비밀번호** 또는 root SSH 로그인을 일시적인 설치 편의로 남기지 않으며 새 키의 두 번째 독립 로그인 성공 후만 차단 정책 적용.
- 실제 **Network ACL**(stateless의 출발지/목적지·반환 포트), **ACG**(상태 추적), Ubuntu UFW를 서로 다른 정책/영수증으로 검수. 합성 preview는 **5173** 루프백 전용, 운영 API 포트 **3000** 및 PostgreSQL **5432**/worker/debug는 인터넷에서 직접 접근할 수 없어야 한다.
- **한국 IP** 제한은 대한민국 리전 선택만으로 활성화되지 않는다. 별도 승인된 **Global Edge** 접근정책 **Whitelist > Geo**에서 Korea와 제외/우회 경계를 확인해야 하며, 직접 원본 IP·IPv6·다른 호스트/preview 경로 차단과 실제 정상/비정상 지역 테스트가 필요하다.
- **실제 운영 서비스의 공개는 A01–D03의 기술·인적 검증 전까지 차단**하며 `RELEASE_BLOCKED`입니다. 소유자 프로젝트 승인은 완료됐지만 네트워크·서버·사용자 인수 미검증을 통과로 대체하지 않습니다. `APP_ENV=production` 보호 거부를 값만 바꿔 우회하지 않는다. 코드 합성 mock, preview/계획을 실제 운영 준비/지출 완료로 승격하지 않는다.
- **현재 CI 보안 검사 식별자:** `#46`(개인 원본 위험), `#89`(출시/인그레스 보안)는 `tests/release/test_ncp_preview_safety.py`의 검증 기준에 아직 포함된 **정적 호환 표기**이다. 이 번호들은 현재 열린 작업이나 승인 상태가 아니며, 현재 실운영 이슈는 **#276(본선진출 이후 통합)**이며 #252/#253은 이관·종료됐다.

## 운영 TLS·인증·관측/복구 조건

승인된 public 운영 진입점에서 Host/SNI/DNS/TLS/Nginx/LB/WAF/Edge KR whitelist·미인증 HTML/JS/API/media/CDN·직접 origin IP/IPv6/preview bypass, 실 Google sub/JWKS/학교메일 OTP·REVIEWER 세션/철회, PostgreSQL CA TLS/최소 RLS·backup/restore·role 분리를 검증해야 한다.

LB 앞단이라면 신뢰된 정확한 LB CIDR의 real_ip 또는 검토된 PROXY protocol과 **실제 서로 다른 두 client IP의 API `request.ip` 구분·임의 XFF 무효**를 증명한다. 키·로그/토큰/원본/AI prompt, p95/CPU/RSS/비용·크레딧/hard stop/모델 quota·중단/반납 영수증을 비공개 기록한다.

**검증/인계:** [QUICKSTART](QUICKSTART.md) · [운영 기록 양식](OPERATIONS_HANDOFF_TEMPLATE.md) · [현재 인수](../../docs/HUMAN_ACCEPTANCE_GATE_20261104.md).


## 2026-11-06 입문용 설치 문서 연결

NCP 운영자가 실제 서버를 준비할 때는 [처음부터 NCP 서버 만들기](../../docs/BEGINNER_NCP_SERVER_SETUP.md) → [제품·Codex·Claude Code 설치](../../docs/BEGINNER_NCP_PRODUCT_AND_AGENTS.md) → [비전공 제품 구조](../../docs/BEGINNER_PRODUCT_ARCHITECTURE.md) 순으로 참조한다. 문서는 `main`에 반영됐으나 **실 NCP 계정/서버 SSH·도메인·PG·Google·CLOVA/요금·복구 인수는 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) OPEN**, 서비스 `RELEASE_BLOCKED`. `csv/` 원본 5개는 Git에 보존·SHA로 고정하며 공개 ZIP/이미지·에이전트 작업영역으로 반입하지 않는다.
