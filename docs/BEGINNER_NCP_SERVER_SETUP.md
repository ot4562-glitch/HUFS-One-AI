# NCP 서버 개설·초기 보안 가이드 — 처음 시작하는 사람용

> **2026-11-12 현행 문서 동기화:** [PR 36개·Issue 31개 감사 및 33/30 OPEN 스냅샷](REVIEW_AND_ISSUE_AUDIT_20261112.md). 이전 완료/PR 수치·운영 상태는 과거 시점 기록입니다. NCP 실운영·기관 권리/실원문·독립 Gold는 별도 인수이며 `NOT_CONNECTED / NOT_RUN / RELEASE_BLOCKED`를 유지합니다.

> **현행 2026-11-11 참고:** 아래 2026-11-06 예시는 실제 서버/요금/SKU 생성 완료 증거가 아닙니다. 이전 #276은 **보관·이관 완료** 이슈이며, 현행 개발은 [#445](https://github.com/ot4562-glitch/HUFS-One-AI/issues/445), 미확정 운영자 정책은 [#449](https://github.com/ot4562-glitch/HUFS-One-AI/issues/449)에서 관리합니다. 5명은 NCP 개별 Sub Account/SSH 키·최소권한으로 접근하고 운영 원본/권리·Gold/DB/키는 NCP 안에만 저장합니다. GitHub의 [전수 감사](REVIEW_AND_ISSUE_AUDIT_20261111.md) 및 [운영 상태](NCP_OPERATIONS_2026.md)를 확인하세요. `CONFIGURATION_REQUIRED / NOT_RUN / RELEASE_BLOCKED` 유지.


> 기준일: 2026-11-06 · 대상: Naver Cloud Platform(NCP) **한국 리전 / VPC / Ubuntu Server 22.04 또는 24.04 LTS / amd64**. 이 문서는 **설치 설명서**이며 NCP 서버를 실제 생성했다는 증거가 아니다. 프로젝트 소유자의 전체 개발·운영 승인은 `OWNER_CONFIRMED_APPROVED`이지만, 현재 서버·계정·요금·비밀키·사용자별 데이터 권리는 작업 대상별로 확인해야 한다. [현재 수집·운영 #445](https://github.com/ot4562-glitch/HUFS-One-AI/issues/445) 및 [설계 #449](https://github.com/ot4562-glitch/HUFS-One-AI/issues/449) 실제 인수 전 실서비스는 `RELEASE_BLOCKED`다.

**읽는 순서:** 이 문서(서버 만들기) → [제품·에이전트 설치](BEGINNER_NCP_PRODUCT_AND_AGENTS.md) → [제품 원리](BEGINNER_PRODUCT_ARCHITECTURE.md). 개발자용 세부 근거는 [NCP README](../infra/ncp/README.md), [NCP QUICKSTART](../infra/ncp/QUICKSTART.md), [운영 인계 양식](../infra/ncp/OPERATIONS_HANDOFF_TEMPLATE.md)에서 확인한다.

## 0. 한 문장으로 이해하기

NCP 서버는 **인터넷에 연결할 수 있는 원격 컴퓨터**다. NCP 계정으로 컴퓨터를 임대하고, 외부에서 접근할 수 있는 통로(네트워크·공인 IP)를 만들고, 비밀번호 대신 SSH 키로 안전하게 관리한다. 서버를 개설했다고 HUFS One AI가 자동 설치되는 것은 아니다.

| 용어 | 비전공자 설명 | 이 프로젝트의 기본 정책 |
| --- | --- | --- |
| 리전/존 | 컴퓨터가 위치한 데이터센터 구역 | KR, 실제 가용 존은 NCP 콘솔 확인 |
| VPC | 우리 팀만 사용하는 가상 사설 네트워크 | 다른 프로젝트·DB와 분리 |
| Subnet | VPC를 나누는 네트워크 구역 | 미리보기 서버는 Public Subnet, DB는 가능하면 Private |
| 공인 IP | 외부에서 서버를 찾을 주소 | 필요할 때만 부여; 별도 과금 가능 |
| ACG | 서버로 통하는 문을 관리하는 방화벽 | 초기에는 **SSH 22만 관리자 IP/32** |
| Network ACL | 서브넷 단위의 추가 방화벽 | 통신의 왕복 방향을 모두 검사 |
| SSH | 원격 컴퓨터의 터미널에 안전하게 들어가는 통로 | 키 로그인; 추후 root/암호 로그인 차단 |
| systemd | 서버 재부팅 후 프로그램을 실행·관리하는 기능 | 미리보기 서비스와 실서비스를 별도 관리 |
| HTTPS/TLS | 브라우저와 서버 간 암호화 | **실서비스 전용**; 설치 직후 자동 구성되지 않음 |

## 1. 어떤 서버를 만들 것인가

**가장 먼저 ‘SSH 전용 합성 미리보기’를 권장한다.** 실제 학생 자료, Google 로그인, DB, 유료 AI 없이 5173 포트를 서버 내부에만 열어 웹 UI를 확인하는 방식이다. [`infra/ncp`](../infra/ncp/)에는 이 목적의 검토·설치·롤백 스크립트가 있다. 공개 서비스용 80/443 포트를 처음부터 열지 않는다.

서버 선택 예시(견적·성능 보증 아님):

- OS: Ubuntu 24.04 LTS x86_64(amd64), 지원 이미지가 없으면 22.04 LTS.
- 용도: 일반적인 **Standard 계열 CPU 서버**. 입문 검증용은 2 vCPU·RAM 4~8 GiB 정도를 *출발점 후보*로 삼되, 실제 사용량/요금·Node 빌드·테스트의 메모리 요구를 본 후 결정한다. 서버형 GPU는 이 프로젝트의 기본 CLOVA API 호출에 필요하지 않다.
- 저장공간: 현재 NCP preflight 코드가 요구하는 범위는 50~200 GiB. 실제 서버 이미지/블록스토리지 상품 규칙과 용량을 콘솔에서 확인한다.
- 한 대 서버는 고장이 나거나 재시작하면 서비스가 멈춘다. 실제 운영은 백업 및 필요하면 다른 존의 이중화·Load Balancer를 따로 계획한다.

## 2. 준비물 체크

1. **NCP 계정**과 VPC/Server/Public IP/ACG/Network ACL을 다룰 수 있는 최소 권한. 가능하면 공용 최고관리자 계정을 쓰지 말고 담당자별 Sub Account를 사용한다.
2. **과금 확인:** 사용 리전·Ubuntu 이미지·서버 SKU·블록스토리지·공인 IP·네트워크 전송·스냅샷/백업·추가 서비스별 예상 요금, VAT, 크레딧 소멸일, 예산 경보, 중단·반납 책임자를 기록한다. 서버 **정지와 반납은 다르며** 정지해도 스토리지·IP 등은 과금될 수 있다. 예산 알림이 자동 차단을 보장하는지 별도 확인한다.
3. 팀 운영자 PC의 **현재 공인 IPv4**(관리자 1명이라면 `AAA.BBB.CCC.DDD/32` 형식). /32는 **정확히 한 IP**만 허용한다는 뜻이다. 위치가 바뀌면 이 IP도 바뀔 수 있다.
4. 운영자 PC의 SSH 클라이언트(Windows Terminal/OpenSSH 또는 PuTTY), 파일 전송 도구(선택: WinSCP), **운영자 공개키**. 서버 인증용 NCP PEM, SSH 개인키/PPK 파일은 GitHub·메신저·서버 공개 디렉터리에 두지 않는다.
5. 최신 `main` 커밋 SHA, 실패 시 원상복구할 사람과 NCP 자원 목록. 서버를 실제 생성한 시간·요금은 비공개 인계 문서에 남긴다.

## 3. NCP 콘솔에서 VPC·Subnet 생성

공식 콘솔의 화면 명칭은 변경될 수 있다. **[NCP VPC 시작 가이드](https://guide.ncloud-docs.com/docs/vpc-start-vpc)**와 실제 콘솔을 나란히 보고 진행한다.

1. [NCP 콘솔](https://console.ncloud.com/) 로그인 → **리전 KR, 플랫폼 VPC**를 선택한다. Classic과 VPC는 서로 다르며 저장소의 Terraform은 VPC를 대상으로 한다.
2. **Networking → VPC → VPC 생성**에서 새 프로젝트용 사설 주소 대역을 정한다. 예: `10.27.0.0/16`은 *문서상의 예시*이며, 회사 VPN·기존 VPC 주소와 겹치면 안 된다.
3. 새 VPC에서 **Subnet 생성** → 해당 한국 존 → 필요하면 **Public Subnet**을 만든다. 예: `10.27.10.0/24`. Public Subnet은 사설 IP만 쓰는 것과 다르며, 공인 IP·라우트·방화벽이 모두 갖춰져야 외부 SSH가 된다.
4. Public Subnet의 Internet Gateway/Route Table 상태, DNS resolver, IPv6 사용 여부를 확인한다. 실서비스 DB는 여기 직접 공개하는 대신 승인된 사설 경로로 연결한다.
5. **Network ACL**은 서브넷 방화벽이다. NCP 문서상 *stateless*이므로 SSH 요청뿐 아니라 응답에 필요한 반환 포트도 함께 고려해야 한다. 운영자 PC/서버의 실제 ephemeral 포트 범위를 확인하지 않고 인터넷 전체 허용 규칙을 복사하지 않는다.

## 4. ACG 보안그룹 생성

공식 [ACG 가이드](https://guide.ncloud-docs.com/docs/server-acg-vpc)와 [Network ACL 가이드](https://guide.ncloud-docs.com/docs/vpc-nacl-vpc)를 따른다.

- **서버 접속 허용(Inbound): TCP 22 / 운영자 공인 IPv4/32만**. 여러 운영자라면 각 IP를 명시적으로 추가한다. `0.0.0.0/0`에 SSH를 열지 않는다.
- **초기 공개 금지:** TCP 80, 443, 3000(API), 5173(합성 UI), 5432(PostgreSQL), 6379(Redis), 9229(디버그), 비공개 worker 포트.
- **Outbound:** 패키지 업데이트·DNS·시간 동기화·허가된 HTTPS에 필요한 통신만. 과도한 개방과 무분별한 모델 데이터 egress를 구분한다. 사용자별 외부 API 동의는 네트워크 연결만으로 보장되지 않는다.
- ACG는 상태를 기억하는 *stateful* 방화벽, Network ACL은 상태를 기억하지 않는 *stateless* 방화벽이다. Ubuntu의 `ufw`도 별도로 적용한다. 셋 중 하나만 설정하고 끝내지 않는다.

## 5. 서버 생성·접속 준비

공식 [서버 생성](https://guide.ncloud-docs.com/docs/server-create-vpc)·[접속](https://guide.ncloud-docs.com/docs/server-access-vpc)을 확인한다.

1. 콘솔에서 **Compute → Server → 서버 생성**을 연다.
2. Ubuntu 22.04/24.04 **amd64** 이미지, 검토한 SKU·스토리지, 3단계의 VPC/해당 Public Subnet을 선택한다.
3. 서버명과 운영 책임자를 정하고 **반납 보호** 여부를 검토한다. 소프트웨어가 잘못되더라도 다른 서버를 삭제하지 않도록 NCP 자원 ID를 기록한다.
4. **인증키**를 기존 안전한 키에서 선택하거나 새 키를 생성·다운로드한다. NCP `.pem`은 관리자 암호 조회에 필요할 수 있으며 **Windows PuTTY용 `.ppk`와 같은 파일이 아니다**. 반드시 로컬 비공개 보관한다.
5. 방금 만든 **전용 ACG**를 선택하고 최종 요금·권한·지역을 다시 확인한 후 서버 생성한다. 실제 생성은 유료 작업이다.
6. 필요하다면 **Server → Public IP**에서 해당 서버에 공인 IP를 연결한다. IP 할당만으로 SSH 보안이 완료되지 않는다.
7. 서버가 `운영중`인지, 공인 IP·사설 IP·서버 ID·존·이미지를 비공개 인계 양식에 적는다.

## 6. 관리자 PC에서 SSH 공개키 만들기

Windows PowerShell(OpenSSH 사용 시):

~~~powershell
# PC에서 실행. 파일명이 이미 존재하면 덮어쓰지 말 것.
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\hufs-ncp-admin" -C "hufs-ncp-admin"
# .pub = 공개키 / 확장자 없는 파일 = 절대로 공유하지 않는 개인키
~~~

- 반드시 **개인키 암호(passphrase)**를 지정하고 로컬 보호 폴더에 둔다.
- PuTTY를 쓰면 PuTTYgen에서 OpenSSH 개인키를 직접 가져와 `.ppk`를 만들고, PuTTY·WinSCP에 해당 `.ppk` 경로만 지정한다. **개인키 파일을 서버에 업로드하지 않는다.**
- 처음 root/관리자 계정의 로그인은 NCP 콘솔이 제공하는 초기 인증 절차에 따른다. 최초 호스트 키 지문은 NCP가 제공하는 신뢰 가능한 방식으로 별도 확인 후 SSH 프로그램에 고정한다. 무작정 ‘알 수 없는 호스트 키 수락’을 누르지 않는다.
- 운영자 공개키 파일(`*.pub`)만 root가 접근할 수 있는 서버의 `/root/hufs-admin.pub`로 안전하게 전달한다. 공개키를 주고받는 단계에도 IP·파일명·권한을 검증한다.

## 7. 저장소의 안전한 계획 코드 실행(비용 0)

이 단계는 **운영 PC의 승인된 저장소 체크아웃**에서 실행한다. 실행하지 않아도 NCP 콘솔로 수동 서버를 만들 수 있지만 설정 누락을 줄인다.

~~~powershell
git rev-parse HEAD
node --version
node infra/ncp/setup/00-preflight.mjs --example
node --test tests/security/ncp-setup-plan.test.mjs
node --test tests/security/ncp-network-iac.test.mjs
~~~

예시 JSON을 `local_only/ncp-setup.json`에 저장하고 **가짜 SHA/관리 IP/요금·VPC 주소**를 현재 확인한 실제 값으로 변경한다. 다음 명령은 **계획만** 검증한다.

~~~powershell
Get-Content local_only/ncp-setup.json -Raw |
  node infra/ncp/setup/00-preflight.mjs --plan
~~~

주의: `--example`의 `sourceSha`는 **0이 40개인 가짜 값**이며 그대로 `--plan`을 실행하면 실패한다. 실제 `origin/main`에 이미 존재하는 승인 커밋 SHA·캐시된 ref 검증과 가격·주소 검증이 필요하다. 실패 시 보호 검사를 꺼서 통과시키지 않는다. `01-network-plan.mjs`와 `02-host-plan.mjs`의 입력 형식·별도 Terraform 단계는 [infra/ncp/README](../infra/ncp/README.md)를 참조한다. `terraform apply`는 별도 실비용·계정 승인·계획 검토가 끝나기 전 절대 실행하지 않는다.

## 8. Ubuntu 초기 설치(관리자·개발자 동행 권장)

운영자는 **고정 SHA의 검토된 `infra/ncp/` 설치 번들**을 서버의 **root만 쓰기 가능한 디렉터리**(예: `/root/hufs-bundle/infra/ncp`)에 준비한다. 저장소 전체를 복사하지 않는다. 공개 Git에는 학생별 CSV 5개가 있으므로 통째로 서버에 복제하거나 공개 빌드 번들에 포함하지 않는다.

~~~bash
# 서버에서 검토용 계획만. OS 변경/설치 없음.
sudo bash /root/hufs-bundle/infra/ncp/setup/02-install-host.sh --plan

# 운영자가 검토한 설치 번들의 bootstrap 파일 SHA 확인
sha256sum /root/hufs-bundle/infra/ncp/bootstrap-ubuntu.sh
~~~

실제 적용 단계에서는 **root 소유·상위 경로 포함 쓰기 권한 제한·심볼릭 링크 없음**을 먼저 확인하고, 지문·공개키·ACG /32·예산·리뷰 SHA를 맞춰야 한다. 아래는 ***입력 위치를 보여 주는 템플릿***으로, 대괄호 placeholder를 운영자가 검증된 값으로 바꾸기 전에는 실행하지 않는다.

~~~bash
sudo bash /root/hufs-bundle/infra/ncp/setup/02-install-host.sh   --apply --ack-owner-approved --ack-acg-verified   --admin-public-key /root/hufs-admin.pub   --admin-ip <관리자_실제_공인_IP>/32   --reviewed-bootstrap-sha256 <검토된_bootstrap_SHA256_64자리>
~~~

설치 스크립트는 **Ubuntu 22.04/24.04 amd64만 수용**하고, 서명된 NodeSource 저장소를 통해 Node 24, SSH·UFW, `hufs-admin`(키 로그인), `hufs-preview`(서비스 전용), systemd helper를 설정한다. **root/암호 SSH를 스스로 바로 끄지는 않는다.** 이미 허용된 SSH 연결을 유지한 채 **두 번째 독립 PuTTY/SSH 창에서 `hufs-admin` 키 로그인이 성공한 뒤** 아래 단계로 진행한다.

~~~bash
# 반드시 두 번째 키 로그인에 성공한 hufs-admin 세션에서만
sudo /usr/local/sbin/hufs-ssh-harden --i-tested-new-key-login
~~~

스크립트가 UFW·SSH 유효 설정을 검증하지만, 서버 콘솔에서 ACG·Network ACL이 맞는지 재차 확인한다. 기존 SSH 접속을 끊기 전에 **세 번째 새 연결**도 시험한다.

## 9. 서버가 안전하게 준비됐는지 검사

~~~bash
cat /etc/os-release
uname -m
node --version
npm --version
sudo ufw status verbose
sudo systemctl status ssh --no-pager
sudo ss -lntp
~~~

**예상:** 승인된 관리 IP에서만 22/TCP 접근, 5173/3000/5432는 인터넷에 공개되지 않음. 지금은 제품 설치 전이므로 5173 리스너가 없어도 정상이다. `hufs-preview.service`는 아직 배포 ZIP이 없으면 실행되지 않는다.

## 10. 장애·비용·반납

| 증상 | 먼저 확인할 것 | 하면 안 되는 일 |
| --- | --- | --- |
| SSH 시간 초과 | 공인 IP, Server 상태, ACG 22 /32, Network ACL 왕복 규칙, 내 현재 IP | SSH를 전 세계에 개방 |
| 비밀번호/키 오류 | NCP 관리자 초기 절차, 정확한 계정, 개인키와 공개키의 짝, PuTTY `.ppk`, 호스트 지문 | 개인키를 Git에 업로드 |
| SSH 강화 후 접속 불가 | 기존 세션 유지, NCP 콘솔/구조 복구, `sshd -t` | 접속 수단 모두 끊기 |
| `node` 실행 불가 | 지원 Ubuntu/amd64, signed APT 저장소, Node 24 설치 로그 | 무심코 다른 Node major로 우회 |
| 요금 예산 초과 위험 | 서버 정지/반납, 공인 IP 해제, 스냅샷/볼륨/로드밸런서 잔여 자원, 알림 | 단순 전원 OFF를 전체 비용 종료로 간주 |

서버를 그만 쓰면 **승인된 자원 ID**만 확인한 후 스냅샷·볼륨·IP·서버·추가 서비스의 과금 여부까지 정리한다. 개인정보 보관/삭제 정책과 백업 보존 의무는 별도로 확인한다. 잔여 증거는 [인계 양식](../infra/ncp/OPERATIONS_HANDOFF_TEMPLATE.md)에 **기밀 값 없이** 기록한다.

## 11. 다음 단계와 공식 자료

이 문서가 끝나면 [제품·GPT(Codex)·Claude Code 설치 가이드](BEGINNER_NCP_PRODUCT_AND_AGENTS.md)의 **A안(합성 SSH 미리보기)**를 먼저 진행한다. 실서비스용 HTTPS·OIDC·관리형 PostgreSQL·유료 AI는 B안의 별도 검증 후에만 가능하다.

- [NCP 서버 생성(VPC)](https://guide.ncloud-docs.com/docs/server-create-vpc)
- [NCP 서버 접속(VPC)](https://guide.ncloud-docs.com/docs/server-access-vpc)
- [NCP VPC 시작](https://guide.ncloud-docs.com/docs/vpc-start-vpc)
- [NCP ACG](https://guide.ncloud-docs.com/docs/server-acg-vpc)
- [NCP Network ACL](https://guide.ncloud-docs.com/docs/vpc-nacl-vpc)
- [NCP 상품별 현재 요금](https://www.ncloud.com/charge/price/ko)
- [HUFS One AI 운영 책임](NCP_OPERATIONS_2026.md)
