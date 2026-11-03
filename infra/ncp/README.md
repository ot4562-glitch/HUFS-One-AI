# HUFS One AI — NCP 서버·접속·네트워크·자동설치 운영 가이드

> **2026-11-03 | 현재 가능한 자동화는 SSH 터널 전용 합성 시연 설치까지. 실제 학생 서비스 배포는 RELEASE_BLOCKED.** 이 스크립트는 NCP 서버·공인 IP·유료 CLOVA 서비스를 생성하지 않는다. 사용자 승인 뒤 운영 담당자가 콘솔에서 리소스를 준비하고 심민성 코드 담당자가 검증/업데이트한다. 기존 Private Git의 원본 학생 파일·기관 자료·키를 NCP에 통째로 복사하는 것을 금지한다(#46). 승인 없이 배포/유료 자원 생성/모델 다운로드 금지(#89).

**다른 운영자·개발 에이전트에게 인계할 때:** [운영 인수인계 양식](OPERATIONS_HANDOFF_TEMPLATE.md)을 복사해 `local_only/` 아래 실제 값으로 작성하고, 외부에는 비밀을 제거한 요약만 공유한다. 이 가이드는 **NCP 화면에서 누르는 절차**와 **Ubuntu에서 실행하는 명령/Windows에서 쓰는 도구**를 구분한다.

## 0. 빠른 순서

1. **NCP 콘솔**에서 **VPC·Public Subnet·Ubuntu Server·전용 ACG·공인 IP**를 설정한다. 실제 생성은 **과금 가능**하므로 사전 사용자 승인 필요.
2. Windows **PuTTYgen**으로 관리자 SSH 공개/개인키를 새로 생성하고, **NCP의 서버 인증키(.pem)와 구분**한다.
3. PuTTY **root + NCP 관리자 비밀번호**로 초기 접속. WinSCP SFTP로 이 폴더의 `bootstrap-ubuntu.sh`·`harden-ssh.sh`·`deploy-preview.sh`·`hufs-preview.service`와 관리자 **공개키 한 줄만** 복사한다.
4. `bootstrap-ubuntu.sh`를 1회 실행해 Ubuntu/Node24, 안전한 hufs-admin 사용자·127.0.0.1 전용 시연 서비스·SSH UFW /32를 준비한다.
5. **별도 새 PuTTY 창에서 hufs-admin 공개키 인증이 된 것을 확인한 후** `harden-ssh.sh`로 root/SSH 비밀번호 로그인 차단.
6. Windows에서 `Prepare-NcpPreview.ps1`로 **허용된 합성 소스만 ZIP**을 만들고 **SHA256** 확인. WinSCP로 서버의 `/home/hufs-admin/ncp-preview.zip`에 전송.
7. 서버의 `sudo /usr/local/sbin/hufs-preview-deploy <SHA256>`를 실행하면 npm 설치·빌드·합성 Vite 미리보기 시작·검사·실패 시 롤백. 외부 웹 포트는 열리지 않는다.
8. PuTTY SSH 터널 **Windows 5174 → 서버 127.0.0.1:5173**을 추가하고 **http://127.0.0.1:5174**에서 **합성 시연만** 확인한다. **실제 Google/학생/PG/NCP AI는 연결되지 않는다.**

기준 OS는 **Ubuntu Server 24.04 LTS amd64** (SKU/리전 이미지가 없으면 22.04 LTS amd64). **Rocky/Alma/Windows Server는 스크립트 지원 밖**이고 실행하면 실패하도록 했다. Windows 개발 PC는 PowerShell 5.1+ 및 Git for Windows, PuTTY, WinSCP를 이용한다. 최신 Git HEAD에서 정상 merge·CI 확인된 소스만 포장한다.

## 1. NCP 콘솔에서 VPC 서버 만들기 — 운영 담당자 이서연, 승인 전 생성 금지

**1. 지역/요금:** NCP **VPC > 한국 리전** 선택. 요금 견적·크레딧 적용·CPU/RAM·스토리지·공인 IP·LB/WAF·유휴 비용·종료 책임 확인. 기존 4vCPU/32GB High Memory-g3 계획은 실제 가용 SKU/가격 확인 필요. 단순 합성 시연에는 적은 CPU를 써도 좋지만 Laya 실측과 같은 성능이라고 주장하면 안 된다.

**2. 네트워크:** Console > Networking > VPC > VPC, Subnet 생성. 예시 CIDR은 VPC `10.27.0.0/16`, Public Subnet `10.27.10.0/24` (실제 선택값 아님); 대학 VPN/기존 VPC·내부망과 중복 금지. Internet Gateway/Route/Network ACL 연결 확인. 운영 DB를 만든다면 **Private Subnet**, 공인 IP 없이 애플리케이션 서버만 접근.

**3. 서버:** Console > Compute > Server > Server > [서버 생성] > Ubuntu 24.04 LTS amd64(지원 여부 재확인) → 스펙/부트 스토리지/반납 보호 → Public Subnet → NCP **인증키를 생성·저장** → 전용 ACG 적용 → 최종 요금 확인 후 생성. NCP Init Script를 임의로 지정해 자동 실행하지 않는다. 서버 Running 확인.

**4. Public IP:** Compute > Server > Public IP > [공인 IP 신청] → 서버에 할당. 미할당 공인 IP도 보유요금이 발생할 수 있다. Public Subnet의 Internet Gateway 경로 확인. 이 IP는 **SSH 접속할 대상 서버 공인 IP**이고, ACG에 넣을 **내 PC 관리자 공인 IP**와 다르다.

**5. root 비밀번호:** 서버 선택 > [서버 관리 및 설정 변경] > [관리자 비밀번호 확인] → **서버 생성 때 내려받은 NCP 인증키 .pem**을 로컬 콘솔에 제공해 표시된 비밀번호 확인. **NCP .pem은 기본 root 초기 비밀번호 조회를 위한 것이며, PuTTY SSH 개인키 .ppk와 역할이 다르다.** NCP .pem/초기 암호를 GitHub/에이전트/WinSCP 원격 파일로 올리지 않는다.

공식: [서버 생성](https://guide.ncloud-docs.com/docs/server-create-vpc) / [Public IP](https://guide.ncloud-docs.com/docs/server-publicip-vpc) / [관리자 비밀번호](https://guide.ncloud-docs.com/docs/server-manage-vpc).

## 2. ACG / Network ACL / UFW / 포트표 (반드시 각각 확인)

| 대상 | TCP 포트 | 공개 Inbound 설정 | 비고 |
| --- | ---: | --- | --- |
| SSH, PuTTY, WinSCP SFTP | **22** | **관리자 자신의 현재 공인 IPv4/32 한 개만** | 관리자 IP가 바뀌면 ACG·ACL·UFW 동시 검증 |
| 합성 Vite | **5173** | **공개 금지** | 서버 `127.0.0.1:5173`에만 바인딩; PuTTY SSH 포워딩 |
| API | **3000** | **공개 금지** | main은 로컬 fail-closed harness이고 APP_ENV=production에서 중단 |
| PostgreSQL | **5432** | **공개 금지** | 운영 승인 뒤 private subnet/전용 ACG만 |
| Redis/Node debug | **6379/9229** | **공개 금지** | 외부 모니터링·디버그 포트도 기본 차단 |
| HTTPS/HTTP | **443/80** | **현재 공개 금지** | 인증된 WAF/LB·TLS·익명 JS 차단·한국 IP 경계 전체 수락 후 제한된 ingress만 |
| Windows RDP | **3389** | **불허** | Ubuntu 서버에 불필요 |

**ACG:** Compute > Server > ACG > [ACG 설정] → Inbound `TCP`, Source `내 공인 IPv4/32`, Port `22`. ACG는 **상태 저장(stateful)** NIC 수준 방화벽이며 IP/CIDR/ACG 단위 허용 규칙을 쓴다. 관리자 SSH에 `0.0.0.0/0`을 넣지 않는다. 초기 공개 웹 80/443은 열지 않는다.

**Network ACL:** Networking > VPC > Network ACL > ACL Rule. ACG와 달리 **stateless**, Subnet 수준이므로 **Inbound/Outbound 리턴 패킷 규칙도 직접 검증**해야 한다. NCP 시나리오의 ephemeral `32768-65535`는 하나의 예시일 뿐이며 OS의 `/proc/sys/net/ipv4/ip_local_port_range`, 패키지 HTTPS/기타 아웃바운드 연결과 ACL 우선순위를 확인한다. 무작정 마지막 DENY를 추가해 SSH나 apt를 고립시키지 말 것.

**UFW:** Ubuntu bootstrap은 들어오는 연결 기본 차단, 관리자 IPv4/32에서 22만 허용하며 외부 5173/3000/5432/443은 열지 않는다. SSH 설정 변경 전 **두 번째 새 PuTTY 키 로그인** 검증. 공인 IPv6/AAAA 사용 시 IPv6 필터와 원본 우회 경로를 별도 검증하기 전 활성화하지 않는다.

**Outbound:** 패키지 다운로드를 위한 DNS·HTTPS/시간 동기화 등 필요하며 ACG/ACL에서 무조건 차단하면 설치가 실패한다. 향후 NCP provider 도메인으로의 egress는 권리·예산·IAM 승인 뒤 추가한다.

공식: [ACG](https://guide.ncloud-docs.com/docs/server-acg-vpc) / [Network ACL stateless](https://guide.ncloud-docs.com/docs/vpc-nacl-vpc) / [VPC 서버 접속](https://guide.ncloud-docs.com/docs/server-ts-access-architecture-vpc).

### 한국 IP 전용 Wall — NCP Global Edge로 구성 (운영 게이트: 아직 미적용)

**한국 리전/한국 Edge 서버 선택만으로 한국 방문자 전용 정책이 되지는 않는다.** 현재 미리보기는 외부 80/443/5173 포트가 모두 닫혀 있고 SSH 자체도 운영자 IPv4/32만 허용한다. **운영 공개 승인 전 Geo 정책을 실행·적용하지 않는다.**

**확인된 공식 NCP 선택지: [Global Edge Self Integration](https://guide.ncloud-docs.com/docs/globaledge-create)의 `Access control > Whitelist > Geo`.** NCP [WAF(V2) 공식 FAQ](https://www.gov-ncloud.com/support/faq/prod/4709?categoryCode2=SEC&categoryCode3=SV_0024)는 **국가 단위 IP 차단을 기본 제공하지 않는다**고 설명한다. NCP WAF의 패턴 방어와 Global Edge의 국가 접근 제한은 다른 기능이며, 둘의 비용·이용권도 별도 확인한다.

운영 전환 시 **승인 후** 콘솔 작업 순서:

1. **Console > Content Delivery > Global Edge > Management**에서 프로필 생성 > **Edge 생성 > Self Integration** (Quick Start는 이 앱의 쿠키/API 요구에 안전한 기본값이 아님). 서비스 도메인은 승인된 도메인으로 지정하고 TLS 인증서·갱신/도메인 검증을 준비한다.
2. **원본 설정**에서 승인된 NCP Load Balancer/API Gateway 등 운영 진입점을 선택한다. 처음부터 단일 VM 공인 IP를 무제한 원본으로 두지 말고, Edge 경유 전용으로 **origin 주소 직접 접근을 차단할 수 있는 구조**를 먼저 확정한다.
3. **접근제어 > Whitelist > Geo > Add Geo > 대한민국(Korea)**만 선택하고 정책을 저장·배포한다. **Global Edge의 서비스 지역 '한국'은 Edge 인프라 지역을 고르는 옵션이며 이 국가 화이트리스트와 다르다.** IPv4/IPv6 및 정책 예외를 별도로 점검한다.
4. **캐시 규칙은 기본값 그대로 사용 금지.** 공식 Quick Start 예시는 30일 캐시/쿼리 무시가 기본이므로, 사용자별 HTML·JS 진입 경계, `/api`, 로그인·callback·OTP·계정·개인응답·REVIEWER 초대·세션/권한 철회에 **Edge/브라우저/중간 캐시 금지**를 설계한다. 개인응답의 `Cache-Control: no-store`뿐 아니라 Edge 실제 우회 동작을 테스트하고, 익명 응답에서 보호 번들·민감 데이터가 새지 않도록 별도 릴리스 검증한다.
5. **원본 우회 차단이 선행**: DNS만 Edge로 돌려도 공인 origin IP·LB 주소·IPv6·staging/preview가 열려 있으면 비한국 IP가 직접 접속할 수 있다. 승인된 구조에서 ACG/NACL/LB/프록시 원본 접근을 Edge에서만 허용하도록 검증하고, 네트워크상 검증된 프록시로부터의 클라이언트 IP만 신뢰한다. 임의 요청의 `X-Forwarded-For`를 국가 판정에 직접 사용하지 않는다. Edge 원본 IP 대역·사설 접근 가능성이 확인되지 않으면 **공개 443 개통을 보류**한다.
6. **수락 시험**: 국내 정상 접속, 해외 IP 차단(가능한 독립 환경), VPN/프록시·GeoIP 오분류, 직접 공인 IP/LB/다른 호스트 헤더/AAAA/Preview·원본 스토리지 우회, 사용자별 데이터/쿠키 캐시 누출, 로그·정책 변경 시 롤백을 검증한다. **국내 IP라는 사실은 인증/동의/접근 권한의 대체가 아니다.** NCP 정책 스크린샷/테스트와 비용 증빙을 [운영 인수인계 서식](OPERATIONS_HANDOFF_TEMPLATE.md)에 기록한다.

한국의 모든 네트워크/해외 로밍·VPN을 정확히 판별한다는 보장은 없으며, 비KR 사용자가 한국 VPN 경유로 접속할 수 있다. 국가 제한은 **방어층 하나**일 뿐 Google OIDC·외대 이메일 증명·초대 allowlist·owner/SharingGrant·로그인 전 보호를 대체하지 않는다.

공식 근거: [NCP Global Edge 생성 및 Geo 접근제어](https://guide.ncloud-docs.com/docs/globaledge-create) · [Global Edge 과금/쿼터](https://guide.ncloud-docs.com/docs/globaledge-quotas) · [NCP WAF(V2) 국가별 차단 기본 미지원 FAQ](https://www.gov-ncloud.com/support/faq/prod/4709?categoryCode2=SEC&categoryCode3=SV_0024).

## 3. Windows에서 PuTTY·WinSCP·SSH 공개키를 안전하게 사용하는 방법

1. **PuTTYgen** > Ed25519 공개/개인키 생성, **키 passphrase** 설정. 로컬에 개인키 `hufs-admin.ppk` 암호화 보관. PuTTYgen의 **Public key for pasting into OpenSSH authorized_keys file** 한 줄을 `hufs-admin.pub`로 저장. **이 공개키만 서버에 전송**한다. NCP 인증키 `.pem`과 혼동하지 않는다.
2. **PuTTY** > Session: NCP 서버 **공인 IP**, SSH, port `22` > Open. 첫 접속의 서버 host key fingerprint는 콘솔/별도 안전 경로에서 대조. 초기 `login as: root`와 NCP 관리자 비밀번호 사용.
3. **WinSCP** 첫 접속: File protocol **SFTP**, NCP 서버 공인IP, Port 22, Username `root`, NCP 관리자 비밀번호. `infra/ncp/bootstrap-ubuntu.sh`, `deploy-preview.sh`, `harden-ssh.sh`, `hufs-preview.service`만 `/root/hufs-ncp/`에 올리고 공개키 `hufs-admin.pub`를 `/root/hufs-admin.pub`로 복사. **FTP 포트 21/Passive 20xxx은 필요 없음**.
4. 초기 root PuTTY 콘솔에서 다음 명령의 `YOUR_ADMIN_PUBLIC_IP`를 **본인 PC의 현재 공인 IPv4**로 바꿔 실행(실서버에서 패키지 설치·방화벽 적용됨).

    sudo bash /root/hufs-ncp/bootstrap-ubuntu.sh --admin-public-key /root/hufs-admin.pub --admin-ip YOUR_ADMIN_PUBLIC_IP/32 --ack-acg-ready

5. bootstrap이 완료되면 **두 번째 PuTTY 창**에서 `login as: hufs-admin`, Connection > SSH > Auth > Credentials > Private key file에 로컬 `hufs-admin.ppk`를 지정해 **키 로그인 성공 확인**. **그 다음** 두 번째 창에서:

    sudo /usr/local/sbin/hufs-ssh-harden --i-tested-new-key-login

   원래 root SSH와 비밀번호 로그인 잠금. **기존 세션을 닫지 않고 새 키 전용 세션을 재확인**. 실패 시 NCP 콘솔/기존 연결로 원복. 키를 SSH/웹 브라우저/ChatGPT 메시지에 붙여넣지 않는다.
6. **WinSCP 이후:** SFTP, port 22, user `hufs-admin`, Advanced > SSH > Authentication에서 로컬 `.ppk` 선택. Private repo·원본 학생 자료 업로드 금지.

[WinSCP 연결](https://winscp.net/eng/docs/guide_connect) / [PuTTYgen](https://winscp.net/eng/docs/ui_puttygen) / [WinSCP 개인키 인증](https://winscp.net/eng/docs/public_key).

## 4. Windows 한 번 패키징 → WinSCP 전송 → Ubuntu 합성 자동배포

Windows PowerShell **5.1+**에서 GitHub에서 받은 **본인 Git 체크아웃**의 프로젝트 루트:

    powershell -ExecutionPolicy Bypass -File .\infra\ncp\Prepare-NcpPreview.ps1

`local_only/ncp-preview.zip` + SHA256 텍스트 생성. 소스는 **Git 커밋 기준 허용 목록만**: 앱 프런트 소스·계약/코어·합성 fixture·lockfile/빌드설정·이 배포 스크립트. 개인정보 CSV/Forms/비밀키/`reference`/`private`/`local_only`와 Git 전체 기록은 **원격 ZIP에 포함하지 않는다**. 원본 전체 Private repo를 NCP에서 clone하면 **#46 보호 경계 위반 위험**이 있다.

WinSCP SFTP로 **ZIP 한 개**를 `/home/hufs-admin/ncp-preview.zip`로 올린다. Windows에서 표시된 **64자리 SHA256** 값을 확인한 뒤 **hufs-admin PuTTY**에서:

    sudo /usr/local/sbin/hufs-preview-deploy ACTUAL_64_HEX_SHA256_FROM_WINDOWS

스크립트가 SHA256·압축 경로·총 크기·심볼릭 링크·금지 파일·필수 경로를 검증하고, `hufs-preview` 비권한 계정으로 `npm ci --ignore-scripts` / 계약 빌드 / 프런트 빌드를 수행한다. 시스템 서비스가 **`127.0.0.1:5173` + synthetic DEV 모드로만** 실행되고, `/` 및 `/src/main.tsx`를 검사하며 실패 시 기존 릴리스 symlink로 자동 복구한다. **APP_ENV=production, 운영 API/PG/NCP Provider는 사용하지 않는다.**

**Windows PuTTY SSH 터널:** 새 PuTTY 세션 > Connection > SSH > Tunnels > Source port **5174**, Destination **127.0.0.1:5173**, Local > Add. `hufs-admin`으로 연결한 채 Windows 웹 브라우저에서 **http://127.0.0.1:5174**를 열면 합성 시연 화면이 열린다. Windows에서 5174 포트를 이미 쓰고 있다면 다른 빈 로컬 포트로 변경 가능. Windows 웹 주소를 공인 NCP IP/5173으로 열지 말 것.

### 선택: Windows에서 ZIP 생성·SFTP 전송·Ubuntu 배포를 한 명령으로

**Ubuntu 서버가 이미 승인·생성·bootstrap/SSH hardening 완료**된 경우, [`Deploy-NcpPreview.ps1`](Deploy-NcpPreview.ps1)이 기존 세 단계(허용 목록 ZIP 패키징 → WinSCP SFTP 전송 → plink SSH에서 제한 sudo 배포)를 하나로 묶는다. **기본값은 계획만 출력하고 아무것도 배포하지 않으며**, `-Apply`를 명시해야 원격 업로드·배포한다. NCP 서버 생성·유료 AI/Google/PG·공개 운영은 지원하지 않는다.

**-Apply 실행 전 준비:** **Windows 10/11 PowerShell 5.1+, Git for Windows, WinSCP.com, plink.exe (PuTTY)** 설치, 운영자 검증된 NCP 서버 공인 IPv4·고정 SSH 서버 host-key 지문, `hufs-admin` 키 로그인, passphrase가 있는 로컬 `.ppk`. 필요하면 **Pageant**에 암호가 걸린 로컬 키를 미리 로드하되 passphrase를 명령 인자·파일·GitHub/에이전트에 넣지 않는다. WinSCP/plink 경로가 PATH 밖이면 `-WinSCPExe`/`-PlinkExe`로 절대 경로를 지정한다.

```powershell
# 프로젝트 루트의 PowerShell에서 실행. 각 대괄호 자리는 운영자가 직접 확인한 실제 값으로 교체.
# PLAN: IP·키·WinSCP·plink 설치 없이도 절차만 출력, 원격 작업 없음
powershell -ExecutionPolicy Bypass -File .\infra\ncp\Deploy-NcpPreview.ps1

# 서버·비용/네트워크 승인, bootstrap, 본인 SSH 키 테스트 완료 뒤에만:
powershell -ExecutionPolicy Bypass -File .\infra\ncp\Deploy-NcpPreview.ps1 -ServerIPv4 "SERVER_PUBLIC_IPV4" -PrivateKeyPath "C:\secure\hufs-admin.ppk" -HostKeyFingerprint "ssh-ed25519 256 SHA256:VERIFIED_FINGERPRINT" -Apply
```

위 문자열은 **절차 예시**로 바로 실행 가능한 IP/지문/계정 비밀이 아니다. 서버 SSH host-key fingerprint를 첫 접속에서 무조건 승인하지 말고 독립 경로로 대조한다. 수동 WinSCP+PuTTY 절차는 장애 시 복구 경로로 유지한다. 이 Windows 원커맨드 자동화는 **오프라인 정적 CI만 검증**, 실제 PowerShell/WinSCP/Ubuntu 통합 실행 **NOT_RUN**.

### 운영자 점검·오류·유지보수

- SSH 안 됨: NCP 서버 Running·공인IP/IGW/라우팅 → ACG 관리자 IP/32:22 → ACL 양방향 → UFW → PuTTY 키/계정·host key 지문. **0.0.0.0/0 SSH 열어서 해결하지 않는다.**
- 서버 준비 상태: Ubuntu `/etc/os-release`, `node --version`(24.x), `ss -ltnp`, `ufw status verbose`, `systemctl status hufs-preview`, `journalctl -u hufs-preview -n 30`, CPU/RSS/디스크/로그와 NCP 요금 대시보드 확인. 제한 sudoers 계정은 서비스 상태 조회에 대한 별도 OS 권한이 필요할 수 있다.
- 배포 실패: ZIP SHA·파일명/확장자, Node24/설치 로그, localhost Vite import 오류, `systemd` 로그, SSH tunnel 소스 포트 충돌, UFW/ACL 확인. 서빙 중인 previous release는 health 실패 시 symlink 복구; 저장된 릴리스가 없는 최초 실패라면 서비스 중지.
- 업데이트: main에서 승인된 코드로 Windows **새 SHA ZIP** 생성 → WinSCP 재전송 → 동일 deploy 명령. root 배포/운영 비밀키·클라우드 API 호출 자동화는 하지 않는다.
- 종료/비용: 사용자 승인하에 서버, 부트·추가 볼륨, **미할당 공인 IP**, LB/WAF·백업/로그·AI 요청 등 별도로 반납/보존 확인. 서버를 Stop만 하더라도 일부 요금은 남을 수 있다. 운영 로그와 계정·SSH 키 회전/호스트 패치/권한 철회도 보수적으로 점검.

## 5. 실제 HTTPS 서비스·NCP 원클릭 운영 배포가 아직 차단된 이유

**현재 main의 `apps/api/src/main.ts`는 `APP_ENV=production`이면 예외로 직접 중단한다.** 합성 UI를 5173에 띄우는 것으로 실제 서비스가 완성되지 않는다. 다음 전부가 **현물/실환경 근거로 합격**한 뒤에만 HTTPS 443·원클릭 운영 배포 PR을 별도 승인한다.

- Google OIDC/JWKS + 학교 메일 현재 수신권(Workspace hd 증명 또는 OTP) + 베타 초대·권한 철회·인증 전 JS/HTML/Asset 직접 URL 차단 + 실브라우저/다중탭/세션 CSRF.
- 운영 PostgreSQL Private Subnet·RLS·백업/복원·암호화·사용자/자료별 SharingGrant·actor/SourceRevision/Revocation·감사. #27/#133의 WIS 동일 URL **파일별 원본 SHA/권리 receipt**와 #46 Private Git/실자료 권리 인적 검수.
- 검증된 HTTPS/TLS 인증서·IDN 도메인·DNS·LB/WAF/원본 직접 IP·Preview/캐시/IPv6 우회 차단, KR GeoIP 국가 필터·원본 보호·접근/거부 로그, 제한된 80→443 처리.
- [#150](https://github.com/ot4562-glitch/HUFS-One-AI/pull/150) Provider/Laya/API 통합·충돌/비작성자 승인/CI, OCR/HCX 서비스 사용 허가·키/요금/예산 kill switch·부하/429/503/timeout/OOM/중복 과금·CPU/RSS·실 호스트 수락.
- UI [#134](https://github.com/ot4562-glitch/HUFS-One-AI/pull/134) 충돌·실 React/빈 계정 시연·#61 독립 인간 gold 200건·정식 RulePack/실스크린리더·로그/장애 대응/운영 유지보수.
- #46 원본 권리·보호 검사 **2 FAIL 해결** 및 [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) RELEASE_BLOCKED 해제 요건을 정식 독립 검수. 사용자 명시적 유료/공개 승인.

**운영 서비스 배포를 가장한 가짜 원클릭은 만들지 않는다.** 지금의 설치 자동화는 안전한 **단일 VM 합성 미리보기** 준비용이다.

공식 참조: [NCP Server](https://guide.ncloud-docs.com/docs/server-create-vpc), [Public IP](https://guide.ncloud-docs.com/docs/server-publicip-vpc), [ACG](https://guide.ncloud-docs.com/docs/server-acg-vpc), [NACL](https://guide.ncloud-docs.com/docs/vpc-nacl-vpc), [NCP Access](https://guide.ncloud-docs.com/docs/server-access-vpc), [NodeSource](https://github.com/nodesource/distributions), [WinSCP](https://winscp.net/eng/docs/guide_connect).
