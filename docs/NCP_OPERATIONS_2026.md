# HUFS One AI — NCP 최종 서버·예산·운영 게이트 (2026-10-31)

> **2026-11-05 실행 링크:** 실제 제품 기능을 NCP에 옮기는 순서/차단은 [제품 활성화 런북](PRODUCT_ACTIVATION_RUNBOOK_20261105.md)·[실행 이슈 #222](https://github.com/minseong-hufs/HUFS-One-AI/issues/222) 참고. 독립 검수/실 4인 원본 권리 [#221](https://github.com/minseong-hufs/HUFS-One-AI/issues/221), 비코드 NCP 운영 #12, 최종 출시/보안 #89은 구분한다. 아래 비용표는 당시 계획·가정으로 실제 지출 승인이나 실서비스 사용 증거가 아니다.

> **2026-11-04 통합 후 현재 정본:** 2026-11-04: NCP 자동화 코드는 #207/#208/#211/#214(네트워크/호스트 IaC), #197/#209/#215(설치·preview/복구)가 [#216](https://github.com/minseong-hufs/HUFS-One-AI/pull/216)으로 **main 통합**. 별도 계정·실 SKU/크레딧·Ubuntu SSH/CPU/RSS·요금/반납 영수증은 **NOT_RUN**. 아래 2026-10-31 비용 가정값은 실제 청구 단가가 아니므로 승인 전 재검증. 자동화 코드는 심민성, NCP 비코드 실운영은 이서연. [현재 상태](../STATUS.md), [인적 수락](HUMAN_ACCEPTANCE_GATE_20261104.md).

> **2026-11-04 PR 상태 정정·2026-11-03 역할 변경 유지 · 개통 승인 전.** 가격은 2026-10-31 조사 시나리오이며 실제 SKU·원화 단가/적용 권리는 사용 전에 콘솔/공식 문서로 재검증한다. **NCP 비코드 운영 = 이서연; 모든 provider/worker/CI/IaC/OS 자동화 코드 = 심민성.** NCP SKU·일정·요금은 이 문서를 정본으로 사용하고, 2026-10-28 서버·VPN 비교는 참고 자료로 유지한다. 대외 발표는 [Proposal.md](../Proposal.md), 기술 계약은 [Architecture.md](../Architecture.md).

## NCP 실제 서버 구축·연결·GeoIP·설치 정본 길잡이 (2026-11-03)

**목적/단계:** GitHub 개발의 목표는 **실제 서비스 완성**이고, 출시 보안·권리·독립 QA와 사용자 유료 자원 승인을 받은 뒤 NCP로 배포하며, **배포 이후 유지보수·백업·보안/비용 관제**가 상시 목표다. 합성/오프라인 코어를 클라우드에 올렸다는 사실만으로 실서비스 출시로 간주하지 않는다. 실제 `apps/api/src/main.ts`는 `APP_ENV=production`에서 실행을 거부한다.

- **실제 서버 만드는 순서와 인프라 입력:** [main 병합된 #156 단계별 NCP 운영 가이드](https://github.com/ot4562-glitch/HUFS-One-AI/blob/main/infra/ncp/README.md): Korea VPC → Public Subnet/라우트·IGW → Ubuntu Server (22.04/24.04 amd64 지원 확인) → High Memory-g3 등 실제 SKU·부트 CB·인증키 → ACG/Network ACL → 공인 IP 할당. 요금·크레딧·리소스 생성은 사전 승인 필수.
- **IP/포트/관리자 SSH:** 서버의 공인 IP(접속 목적지), 서버 사설 IP(내부 통신), 운영자 공인 IPv4`/32`(SSH 허용 원본)를 별도 기록. ACG + stateless NACL + Ubuntu UFW에서 **SSH TCP 22 = 운영자 IPv4/32만**, 외부 `3000/5173/5432/6379/9229/3389` 차단, `80/443`은 릴리스 보안 통과 전 차단. PostgreSQL은 외부에 열지 않고 내부 ACG만 허용.
- **PuTTY/WinSCP·인증키 차이:** NCP 서버 **인증키 `.pem`은 콘솔의 초기 관리자 비밀번호 확인에 사용**. PuTTYgen이 생성한 `.ppk`는 Windows PC의 SSH 개인키이고 **NCP `.pem`과 기능/보관처가 다르다**. PuTTY SSH(서버 공인IP/22, 최초 root 비밀번호)와 WinSCP SFTP(같은 IP/22, 최초 root, 이후 `hufs-admin` 키 인증), 별도 새 세션의 공개키 로그인 성공 후 root/비밀번호 SSH 차단. **실제 키·비밀번호·스크린샷을 GitHub/에이전트에 저장하지 않는다.**
- **Windows→Ubuntu 자동 설치(합성 한정):** PR #156의 `infra/ncp/Prepare-NcpPreview.ps1`로 승인된 Git HEAD의 **합성 소스만 ZIP+SHA256 패키징** → WinSCP로 서버에 ZIP 전송 → Ubuntu `bootstrap-ubuntu.sh`와 `harden-ssh.sh`로 한 번 초기 준비 후 `sudo /usr/local/sbin/hufs-preview-deploy <SHA256>`로 설치·검사·실패 롤백. **SSH 터널 Windows `127.0.0.1:5174` → 서버 `127.0.0.1:5173`**. Ubuntu 22/24 amd64만 지원하며 Windows Server/Rocky/Alma는 현재 자동설치 지원하지 않는다. **서버 자동 생성/운영 공개/실 Google·DB·CLOVA/실원본 배포는 하지 않는다**. 승인된 NCP 서버가 **이미 준비된 뒤**에는 PR #156 [`Deploy-NcpPreview.ps1`](https://github.com/ot4562-glitch/HUFS-One-AI/blob/feat/ncp-safe-bootstrap-preview-20261103/infra/ncp/Deploy-NcpPreview.ps1)에서 기본 계획-only, 명시적 `-Apply`를 통해 **합성 소스 ZIP 생성+WinSCP SFTP 전송+plink SSH 원격 실행을 한 명령으로** 묶을 수 있다. 실제 Windows/서버에서의 실행은 아직 `NOT_RUN`.
- **한국 IP Wall (향후 운영만):** NCP 공식 [Global Edge Self Integration 접근제어의 Whitelist > Geo > Korea](https://guide.ncloud-docs.com/docs/globaledge-create)로 접근 국가를 제한하는 설계다. 한국 리전 선택이나 일반 ACG만으로 국가 제한되지 않으며 [일반 WAF(V2)는 국가별 차단 기본 미지원](https://www.gov-ncloud.com/support/faq/prod/4709?categoryCode2=SEC&categoryCode3=SV_0024)이다. **Global Edge의 KR whitelist + TLS + 직접 origin IP/LB·IPv6/preview 우회 차단 + 개인화 응답 Edge 캐시 방지 + 실 로그인/인가**를 별도로 수락해야 한다. 적용·실검증은 `NOT_RUN`.
- **다른 에이전트 인계:** PR #156 [NCP 운영 인수인계 양식](https://github.com/ot4562-glitch/HUFS-One-AI/blob/feat/ncp-safe-bootstrap-preview-20261103/infra/ncp/OPERATIONS_HANDOFF_TEMPLATE.md)에 실제 서버/스펙·CIDR·ACG/NACL·포트/OS·접속방법·키 **참조명**·승인·실증·장애·백업·반납 결과를 채운다. 비밀 원문은 기록하지 않으며 개인별 실제 값은 접근 제한된 `local_only/` 또는 승인된 비밀 보관함에만 둔다.
- **진척 관리:** [서비스 완성 → NCP 운영 → 유지보수 (PR #156)](https://github.com/ot4562-glitch/HUFS-One-AI/blob/feat/ncp-safe-bootstrap-preview-20261103/docs/SERVICE_DELIVERY_PLAN.md), [현재 STATUS](../STATUS.md), [출시 게이트 #89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89). **PR #156의 합성 SSH-only Preview 코드는 이미 main 2e39c86a에 병합되었지만, 실제 NCP 호스트·방화벽·한국 IP Wall 적용·유료 실행·공개 서비스 배포는 모두 NOT_RUN이며 사전 승인/보안·권리 증거가 필수**.

## 1. 실제 책임 및 작업 분리 — GitHub issues 검증

2026-11-03 현재 이슈 [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10), [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11), [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#18](https://github.com/ot4562-glitch/HUFS-One-AI/issues/18), [#19](https://github.com/ot4562-glitch/HUFS-One-AI/issues/19), [#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20), [#21](https://github.com/ot4562-glitch/HUFS-One-AI/issues/21), [#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22), [#25](https://github.com/ot4562-glitch/HUFS-One-AI/issues/25), [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27), [#29](https://github.com/ot4562-glitch/HUFS-One-AI/issues/29) 담당·assignee 대조. **기존 UI 이의상 `uisang2004-maker`·추천/공지 김채윤 `qamarrchae`·학업 박준영 `taewangim-alt`은 변경하지 않는다.** 이서연 GitHub assignee는 `lhh42001`으로 확인되며 NCP **운영 이슈 #12/#22만** 담당한다. AI 코드 이슈 #20/#88/#143은 `ot4562-glitch` 단독 담당.

| 소유자 | 범위 | 경계 |
|---|---|---|
| **심민성** | 모든 애플리케이션/API/DB/RAG 및 **NCP SDK·CLOVA OCR/HCX HTTP 호출/재시도/비용 hard-gate·VISION bbox·Laya ONNX worker/queue·CPU 자동 가드·fake-provider chaos/CI·OS/systemd/Docker·IaC/배포 스크립트 코드** | NCP 계정/유료 VM 직접 개통은 승인·운영 절차와 별개. 운영 자원·권한/요금/크레딧 확인은 이서연의 비코드 담당 (#12/#22) |
| **이서연** | **코딩 없이 NCP 계정/크레딧/SKU·VPC/ACG·서버/스토리지/비밀키/IAM/TLS/백업/모니터링/비용, CLOVA/OCR/HCX 서비스 이용권·endpoint/quotas/청구·허가된 실제 호스트 CPU/RSS/요금 관찰/중지·반납** | SDK·HTTP adapter·worker/ONNX·queue·bbox·Docker·CI·IaC·OS/cgroup 설정 스크립트·배포 자동화 등은 **모두 심민성의 코드**. 승인 전 유료 실행 금지 |
| **이의상 / 김채윤 / 박준영** | 각각 UI·모바일 / 추천·공지 / 학점·졸업·개설전망 | 기존 담당 유지, 변경 시 본인 이슈 및 독립 PR 리뷰 |

## 2. 공식 가격과 최적 서버 (한국 리전 VPC Linux, VAT 제외)

2026-10-31 [네이버클라우드 공식 Server 요금표](https://www.ncloud.com/charge/price/ko), [KVM Block Storage 상품 안내](https://www.ncloud.com/api-cms/service-product/static/blockStorage), [VPC 3세대 서버 사양](https://guide.ncloud-docs.com/docs/server-spec-vpc) 기준. 3세대는 공식 표 서버 디스크 칸이 '-'이므로 **기본 부트 볼륨 CB를 별도 가격에 포함**한다. NCP 콘솔/리전에서 정확한 인스턴스/CB1·CB2 생성 가능 여부와 크레딧 지원 품목을 개통 전에 재확인한다.

| 후보 | vCPU | RAM | 서버 시간당 | 816h 서버+CB 50GB | 평가 |
|---|---:|---:|---:|---:|---|
| 기존 Standard-g3 | 4 | 16GB | 237원 | 199,920원 | 가장 저렴하나 Node+PostgreSQL+인덱스+Laya 메모리 경쟁 |
| **권장 High Memory-g3** | **4** | **32GB** | **326원** | **272,544원** | 16GB 추가 메모리에 +89원/h, 단일 VM 연구 시연에 균형 |
| CPU 확장 Standard-g3 | 8 | 32GB | 481원 | 399,024원 | 동시 실행/CPU p95 실패 시 후보, 초기 과투자 가능 |

*Storage*: CB1/CB2 SSD **0.16원/GB·시간 × 50GB = 8원/h**. 운영 체제 및 애플리케이션별 실제 디스크 최소 크기와 성능은 콘솔 검증 필요. 

*Public IP*: 단일 공인 IP를 이용한다고 가정하면 **5.6원/h** 별도(공식 요금표). 실제 LB/ingress 경로에 따라 달라지며 추가 LB, egress, NAT, gateway, 스냅샷, 백업, AI API 호출, 세금은 위 합계에 **포함하지 않는다**. 월·시간 과금 방식이 달라지는 리소스와 개통 시점을 확인하기 전 합계는 **상한 시나리오 단순 시뮬레이션**이지 확정 청구액이 아니다.

**권고 결정:** High Memory-g3 4vCPU·32GB 단일 서버 + 50GB CB SSD(우선 CB1, 실제 지원 확인) + 필요 시 1 공인 IP. PostgreSQL/Node/lexical RAG를 로컬 VM에 우선 배치. 별도 managed DB, GPU VM, NCP model worker 추가 서버는 비용·성능 실측 전 자동 생성 금지. 오픈 Laya는 default OFF, 별도 cgroup에서 `CPUQuota=100%`(4vCPU 전체 25% CPU-time), `MemoryMax=3072M`, ONNX 1 thread, worker 1·queue≤16로 제한한다. 32GB 여유 RAM은 **4개 CPU 코어 수를 늘리지 않으므로** 동시 심사자 조회 p95/압박이 실패하면 Laya OFF 또는 8vCPU 검토 PR이 먼저다.

## 3. 2026-11-06~12-09 계획과 공식 본선 발표 불일치

**사용자 계획:** 2026-11-06 00:00 KST부터 **12-09 23:59:59 KST**, 종료/반납 기준 12-10 00:00 KST: **34일 = 816시간**. 그러나 [한국외대 공식 공모전 페이지](https://job.hufs.ac.kr/job/imng/icmpNsbjtPgm/findIcmpNsbjtPgmInfo.do?encSddpbSeq=1006089)는 **본선진출 10팀 발표일 2026-11-16**이라고 안내한다(운영 일정 변경 가능). 실제 개통일은 본선 진출, 크레딧 발급·SKU 적용/유효기간 확인, **사용자 최종 승인** 후 확정한다.

| 기간 (KST) | 시간 | High Memory-g3 서버 | CB 50GB | 공인 IP 1개 | 세 항목 합계 (VAT 별도) |
|---|---:|---:|---:|---:|---:|
| 11/06 00~12/10 00 (전체 계획 상한) | 816h | 266,016원 | 6,528원 | 4,569.6원 | **277,113.6원** |
| 11/16 00~12/10 00 (본선 발표일 이후 최대) | 576h | 187,776원 | 4,608원 | 3,225.6원 | **195,609.6원** |

정상적인 개통 시각이 11/16 당일 00시보다 늦으면 실제 소비시간은 576h보다 적다. 아래 예산은 50만 원 NCP 크레딧을 실제로 받은/사용할 수 있다는 보장과 **무관**하다. 크레딧 50만 원과 개발비 50만 원은 각기 다른 자금이며 지급/사용 범위를 혼동하지 않는다. VAT·예치/신용카드 청구 및 무료 사용량 여부도 별도.

**리스크 한도 제안(816h 전체를 가정한 경우, 실제 승인 전 미적용):** VM+CB+IP+약 10% VAT에 최대 305,000원 예상, 호출형 CLOVA/HCX 합계 상한 80,000원, OCR 20,000원, 네트워크/백업 등 25,000원, 미예상 비용 예비 70,000원 → 합계 500,000원 **내부 계획 모델**. VAT/크레딧 적용 범위·운영 방식에 따라 재산정. 토큰 API 별 hard quota/중단, 크레딧 초과 위험 모니터링, 사용승인 없는 인프라 자동 생성/재시작 금지.

## 4. NCP 개통·안전·승인 체크리스트 (이서연 비코드 운영 담당; 측정/배포 자동화 코드는 심민성)

- [ ] 본선 선정·크레딧 수령 및 범위·리전·서비스 정식 이용자 요금계산기 캡처 확인, 권한 있는 심민성 승인
- [ ] KR VPC/Linux High Memory-g3 4/32 SKU 재고·할인/중지/시간계산 확인, 50GB CB1 기본 OS 디스크/공인 IP/ACG/TLS 설계
- [ ] 단일 VM 장애·백업/스냅샷 복원 검증, DB 외부 공개 0, HTTPS/WAF/preview/direct-IP 인증 경계, NCP secret 접근 최소화
- [ ] Server/CB/Public IP, CLOVA, OCR/HCX, Laya 실제 사용 및 1일 비용 alert·killswitch·잔액 확인
- [ ] `LAYA_ENABLED=false`로 심사자 합성 5슬롯·20개 등록/동시 이용·API p95 / CPU/RAM 30분 baseline, 이후 승인받은 선택형 워커만 단독 검증
- [ ] 실제 학생 CSV/Forms/개인 원자료·권리 없는 학교 포스터를 NCP/모델 전송하지 않음, 대표자 동의/권한·개인정보 프로세스 별도
- [ ] 2026-12-09 종료 후 모든 유료 서버/스토리지/LB/Public IP·액세스 키·크레딧 청구 및 백업 보존 정책 점검, 반납 완료 기록

## 5. 코드·PR 의존과 기록

**이 문서는 2026-10-31 운영 가격 가정의 보존본이며, 2026-11-03 최신 소유 배정을 반영한다. NCP 자원·키 개통/실측 완료 증거가 아니다.** 클라우드 계약·권한/콘솔·인프라 준비/CPU/비용 관찰은 이서연 #12/#22, **일체의 NCP/AI 앱/SDK/ONNX/worker/CI/OS 자동화 코딩은 심민성 #20/#88/#143 및 일반 API #19/#21/#27** 소유다. UI #9, 추천 #10(#15→#16→#40→#41), 학업 #11 소유는 그대로다. 공통 root CI는 #29에서 반영됐고, 모든 신규 코드는 현재 `main` 기준 의존성과 최신 독립 리뷰·CI를 확인한 뒤 병합한다. 실제 학생 CSV·Forms 원본은 어떤 합성 회귀에도 사용하지 않는다.
