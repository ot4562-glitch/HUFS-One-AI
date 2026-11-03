# HUFS One AI — NCP 운영자 ↔ 개발 에이전트 인수인계 템플릿

> **템플릿만 GitHub에 보관. 실제 값을 채운 복사본은 Git이 추적하지 않는 `local_only/ncp-operations-handoff.md`에 보관하거나 승인된 접근통제 문서함을 사용한다.** 다른 에이전트에게는 문제 해결에 필요한 **비밀이 아닌 항목만 최소 공유**한다. 실제 서버 생성·유료 호출·공개·학생 자료 반입은 사용자 승인 전 금지. [NCP 운영서](README.md)·[#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12)·[#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22)·[#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89)와 함께 읽는다.

## 0. 책임·허가와 구분

| 항목 | 기입 예시/형식 (실제 값 아님) |
| --- | --- |
| 작업 목적 | `synthetic-preview` / `production (RELEASE_BLOCKED until #89)` |
| 현재 상태·마지막 확인(KST) | `NOT_CREATED / STOPPED / RUNNING / NOT_VERIFIED`·시간 |
| 사용자 유료 자원 승인 근거 | 승인 날짜·이슈/별도 증빙 **식별자만**; 없으면 `NOT_APPROVED` |
| 운영 담당(비코드) | 이서연 `lhh42001` — 콘솔·요금·VPC/IAM/TLS·실측·반납 |
| 모든 스크립트/SDK/자동화 담당 | 심민성 `ot4562-glitch` |
| 공개 서비스 판정 | `RELEASE_BLOCKED` 또는 #89 독립 승인 근거(추정 금지) |
| 라이선스/원본 권리 | #46 감사 2 FAIL 해소·기관/제공자별 승인이 없으면 실자료/유료 AI OFF |

## 1. NCP 콘솔 환경과 비용 (비밀 아닌 서버 메타데이터만)

- 계정/리전/플랫폼: (서브계정 별칭; **로그인 ID/인증 비밀 금지**) / `Korea` / `VPC`
- VM: Server 인스턴스 식별자(권한 있는 운영 기록 내부에만), 이미지 `Ubuntu Server 24.04 LTS amd64` 또는 지원 `22.04`, 스펙/SKU, 초기 부팅 스토리지 CB 크기·종류
- VPC/서브넷/라우트: VPC ID, CIDR, Public/Private Subnet ID, Internet Gateway/라우트 표 연결 여부, IGW egress/NAT 필요 여부
- IP: 서버 **공인 IPv4**(SSH 목적지), VM **사설 IPv4**(내부 통신), 관리자 **현재 공인 IPv4/32**(ACG 허용 원본)는 **서로 다른 값**. 운영자에게 보여줄 때 필요에 따라 마스킹
- ACG/ACL: 이름·ID·연결 NIC/Subnet, 마지막 변경 시각/작성자, inbound·outbound 허용 표의 증거, 우선순위·stateless 리턴 패킷 검증
- 부가 리소스: Public IP·Block Storage·LB·Global Edge·WAF·DB·백업·알림/로그 과금·현재 상태·사용/반납 확인
- 실측: 시간당 예상 단가와 실제 콘솔 단가 구분, 크레딧/유효기간/적용 상품·세금·예산 상한, 알림 기준·최종 청구 확인

### 필수 포트 정책 (실적용 전에는 모두 NOT_APPLIED)

| 위치 | Inbound 원본 → 대상 포트 | 승인/적용·검증 영수증 |
| --- | --- | --- |
| ACG + NACL + Ubuntu UFW | **관리자 현재 공인 IPv4/32 → TCP 22** | 문서/콘솔·실접속 대조 |
| ACG + NACL + Ubuntu UFW | **0.0.0.0/0 → TCP 22 거부** | 실접속 거부 증거 |
| NCP 외부 공개 | TCP `5173/3000/5432/6379/9229/3389` **불허** | ACG+ACL+ss 점검 |
| PostgreSQL (운영 승인 후) | 앱 서버의 **사설 IP/ACG만 → TCP 5432** | 외부 공인IP 없음 |
| HTTPS (운영 승인 후) | 검증된 **Edge/LB 경유만 → TCP 443** | 직접IP/다른 vhost/IPv6·preview 우회 차단 |
| HTTP | 80 기본 불허; 운영 필요 시 승인된 **80→443 리다이렉트만** | 별도 수락 |
| Outbound | 패키지 apt/npm 설치용 DNS/TLS·NTP 등 필요한 흐름만 명시 | 방화벽 차단·설치 시 통신 검증 |

공인 IP 예시로 `203.0.113.10`, 관리자 CIDR 예시로 `198.51.100.20/32`를 문서화할 수 있으나 이들은 **테스트용 예약 대역이지 실제 사용 IP가 아니다**. 실 운영자 공인 IP 확인 후 /32를 입력한다. IPv6 활성화 시 IPv6 ACG/방화벽/AAAA 검증을 별도로 수행한다.

## 2. 인증/접속 인수인계 — 민감값 원문 저장 절대 금지

| 항목 | 비밀 대신 남길 안전한 정보 |
| --- | --- |
| NCP 서버 인증키 `.pem` | **NCP 콘솔 초기 관리자 비밀번호 확인용**. 로컬 암호화 저장소의 별칭, 키 담당자/회수계획만 |
| 최초 root 관리자 비밀번호 | 콘솔에서 `.pem`으로 확인한다는 절차만. 실제 비밀번호/캡처/키 원문은 **Git/챗/로그 금지** |
| PuTTY/WinSCP `.ppk` | PuTTYgen 생성 **별도 Ed25519 SSH 개인키**. 개인키 파일·패스프레이즈를 Git/NCP/챗에 올리지 않음 |
| 공개키 `authorized_keys` | 서버의 `/home/hufs-admin/.ssh/authorized_keys`에 **공개키만** 설치; 개인키는 절대 업로드하지 않음 |
| SSH 계정/포트 | 최초 `root`/22 → 두 번째 키 인증 검증 후 `hufs-admin`/22 |
| PuTTY 세션 | Host=서버 공인 IPv4, Port=22, Connection=SSH, Auth=로컬 `.ppk`, host-key fingerprint 검증 |
| WinSCP 세션 | File protocol=SFTP, Host/Port=위와 동일, User=`hufs-admin`, Advanced>SSH>Authentication=로컬 `.ppk` |
| SSH 서버 host-key 지문 | 안전하게 검증한 **공개 지문/검증 경로/시각**만; 첫 접속 때 무검증 수락 금지 |
| 운영용 API/Google/DB 비밀 | **비밀 관리자 내 참조명**과 담당자/회전일만; 값·토큰·암호는 어떤 Git 파일에도 저장하지 않음 |

- 첫 키 로그인 성공: `NOT_TESTED` / 증거 시각·접속 주체.
- `harden-ssh.sh` 적용: `NOT_RUN` / 키 로그인 재검증 이후만. 기존 관리 세션 유지하며 별도 새 세션 검증.
- 키 분실/방화벽 잠김 복구 담당, NCP 콘솔 복구 경로, root 로그인 회수·퇴사/인원 변경 시 키 회전 계획.
- PuTTY SSH 터널: **Windows 127.0.0.1:5174 → 서버 127.0.0.1:5173**, 브라우저 `http://127.0.0.1:5174` (합성 미리보기 전용).

## 3. 배포/유지보수 영수증

- 소스: GitHub `main` 승인 HEAD SHA, 작성자 외 PR 리뷰/필수 CI 링크·결론; 깨끗한 소스 확인.
- 로컬 Windows 준비: `powershell -ExecutionPolicy Bypass -File .\infra\ncp\Prepare-NcpPreview.ps1` → `local_only/ncp-preview.zip` SHA256 (비밀 없는 해시만 기록).
- **Windows 선택 자동화:** 승인된 서버/bootstrap 후 `Deploy-NcpPreview.ps1`의 `-Apply`로 SHA ZIP/WinSCP/plink를 한 명령으로 실행할 수 있음. 기본 계획-only; 실제 Windows·NCP 수행 `NOT_RUN`. 서버 IP·개인키 **경로**·검증한 SSH host-key 지문만 인수인계하며 개인키/암호 원문은 절대 공유하지 않음.
- 전송: WinSCP SFTP → `/home/hufs-admin/ncp-preview.zip` (저장소 전체 clone/CSV/Forms/real 자료 업로드 금지).
- 실행: `sudo /usr/local/sbin/hufs-preview-deploy <SHA256>`; 실제 서버 미승인/미접속이면 **NOT_RUN**.
- 검사: SSH 터널만 성공, `systemctl status hufs-preview`, `journalctl -u hufs-preview -n 30`, `ss -ltnp`, SSH 외 외부 포트 닫힘, 합성 계정/개인정보 유출 없음. 현재 합성 스모크는 실서비스 E2E의 대체가 아님.
- 실패: 로그·실패 유형·previous release/rollback 결과·담당자와 복구 시각. **운영 본선의 DB 마이그레이션·백업/복원은 별도 검토/승인 필요**.
- 유지보수: OS/Node 패치·취약점/비밀 회전, 비용·CPU/RSS·디스크·API 지연/에러·권한 철회, 백업 점검·월 1회 이상 복원 연습, 장애/문제 원장, 자원 정지/반납 시 잔여 비용 확인.
- NCP 실제 자원 생성/키 발급·실학생 원본·OCR/HCX/Laya 실행은 사용자 별도 승인·권리·#46/#89 수락 전 **모두 금지**.

## 4. 미래 운영 공개(443) 전용 KR Geo / 권한 증거

- [ ] **Global Edge Self Integration > 접근제어 > Whitelist > Geo > Korea** 정책 생성·배포를 담당자 승인 하에 검증 ([공식 안내](https://guide.ncloud-docs.com/docs/globaledge-create)); 서비스 지역 Korea 선택만으로 국가 접속 제한이 되지 않는다.
- [ ] Edge/LB origin의 직접IP·다른 hostname·IPv6/preview·우회 경로 거부 입증. 단지 `X-Forwarded-For` 헤더나 DNS 설정만으로 신뢰하지 않는다.
- [ ] 쿠키/인증/개인 HTML·JS·API·OTP/REVIEWER 초대·권한 철회 등 Edge 캐시 비활성화/무단 응답 0.
- [ ] 해외 접근 차단/국내 정상·VPN/GeoIP 오분류·직접 원본 접근 실패 테스트를 독립 환경에서 영수증으로 확보.
- [ ] 실제 Google OIDC/JWKS·외대 메일 현재 수신권·초대 allowlist·RLS/권한철회·HTTPS/DNS/TLS·익명 자산 통제 검증 + #46 privacy FAIL 해소.
- [ ] 실승인/운영 QA 전에는 **Geo 미적용, 운영 443 닫힘, RELEASE_BLOCKED 유지**.

**개발 에이전트에게 전달 가능한 안전한 요약:** 변경 전/후의 오류 메시지(민감정보 제거), OS/Node 버전, NCP 상품 종류, 포트·대역 규칙(필요 시 마스킹), 로그 중 비밀/학생 자료 제거한 발췌, Git 커밋 SHA·CI 상태, 증상 재현 단계·승인 범위. **키/비밀번호/인증 토큰/실학생 자료/원본 파일 경로의 민감 정보는 전달하지 않는다.**
