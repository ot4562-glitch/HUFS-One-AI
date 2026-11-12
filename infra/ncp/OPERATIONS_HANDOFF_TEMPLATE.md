# HUFS One AI — NCP 운영자 인수 기록 템플릿

**공개 리포지토리에는 형식만 저장합니다. 실제 계정·서버/공인 IP/비밀·학생 자료/허가 원장은 `local_only/` 또는 승인이 있는 비공개 기록부에서 최소권한으로 관리합니다.** 운영 코드/SDK/IaC는 심민성, 계정·비용·실서버 비코드 운영은 이서연, 최종 사용/지출·공개/학생/기관 권리는 각 승인권자만 결정합니다. 상태: `RELEASE_BLOCKED`.

## A. 작업 목적과 승인

| 항목 | 작성/수락 방법 (실제 비밀 미기재) |
| --- | --- |
| 단계 | `PLAN_ONLY` / `SYNTHETIC_SSH_PREVIEW` / `APPROVED_STAGING` / `PRODUCTION_GO` |
| 대상 코드 | `main` 정확한 40자리 SHA·빌드 ZIP/이미지 SHA·필수 CI URL |
| 운영 IAM | 별도 계정 alias·minimum role·승인된 목적(비밀번호/토큰 미작성) |
| 최종 사용자 승인 | 비용/실환경 적용/자료·외부 모델/공개 범위별 **서면 승인 ID/일시** |
| 운영/코드 담당 | 이서연 (계정/호스트/비용), 심민성 (IaC/worker/OS/배포 코드) |
| 학생/기관 원본 권리 | 현재 per-file/출처/AI 외부 전송 허가 ID, 미확인 시 OFF |
| 공개 결정 | 기본 `NO_GO/RELEASE_BLOCKED`, D03 권한 있는 서면 GO 영수증 이후만 |

## B. 공식 NCP 콘솔 환경과 비용

```text
실제 리전/VPC/zone/SKU·Ubuntu amd64 image ID(민감 ID 비공개 또는 마스킹):
subaccount/IAM minimum scope·승인된 login key fingerprint:
VPC/subnet/ACG/NACL/route/IGW·NIC/public IP 식별자(공개 기록에는 생략):
관리자 현재 IPv4/32·resolver·TCP/ephemeral 범위:
VM/CB 디스크·트래픽·부하·예상 KRW/h/월·VAT/크레딧/할인/하드 중단 한도:
실제 OCR/HCX entitlement·quota/tokens/비용·개인 원본 처리 허가:
백업·실패 시 중지/반납·과금종료 책임자:
확인 일시/공식 콘솔 견적 URL·승인 ID:
```

## C. 네트워크/로그인 부정시험

- SSH/관리자 `/32`만 허용, root/password SSH·무단 다른 키 거부·host fingerprint 고정, 다른 포트/API/PG/preview/public 80/443 기본 불가.
- 직접 origin IP/IPv6/다른 hostname/HTTP/SNI·Edge KR Geo 우회, 미로그인 HTML/JS/API/media/CDN·캐시/인가 데이터 유출 0.
- 승인된 Nginx/LB/Edge의 exact trusted proxy IP/PROXY protocol 설정과 **서로 다른 2 client IP `request.ip` 분리**, 비인가 XFF 주소 위조 0.
- Google sub/JWKS/PKCE·외대 메일 OTP/REVIEWER 기간/철회·BETA/ADMIN 역할·다중탭/401/403/409/429/503·RLS 최소 역할/SQL 직접 쿼리 우회 실패 증거.

## D. 설치·복구·모델·성능 기록

```text
Terraform plan SHA / approval / apply 실제 수행 여부:
ZIP/SSH/SFTP/Ubuntu systemd·노드 health·restart·last-good rollback:
운영 PostgreSQL CA TLS/role/migration/backup restore·철회 유효 여부:
Laya 기본 OFF, 유료 Provider OFF 또는 별도 승인 실 사용 token/usage/UNKNOWN_BILLING:
p50/p95·CPU/RSS/OOM·네트워크/latency·실비용/크레딧/중단:
사용자/운영자·비작성자 검토자/일시/증거 ID:
PASS | FAIL | HOLD | NOT_RUN:
D03 NO_GO | GO(별도 서면 승인):
종료·반납·잔여 청구/비밀키 폐기 확인:
```

비밀/로그·원본·학번/연락처·결제 수단을 GitHub/프롬프트/CI/공유 PDF에 붙이지 않는다. 실제 요금/호스트 작업 전에는 **NOT_RUN/HOLD**. 인계/실운영 증거 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) · 운영 책임 [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12).


## 현재 인계 안내 (2026-11-06)

- 비전공자 운영자는 [NCP 서버 개설 안내](../../docs/BEGINNER_NCP_SERVER_SETUP.md) 및 [제품·개발 CLI 설치](../../docs/BEGINNER_NCP_PRODUCT_AND_AGENTS.md)를 참고하되 **가이드 작성·PR 병합·CI 오프라인 성공을 실 서버 인계/요금 증거로 대체하지 않는다**.
- `csv/` 원본 5개는 Git에서 보호·불변 확인하지만 **비공개 owner actor↔Forms/수강 자료 매핑/학생별 현재 동의/실제 백업·철회 증거**는 공개 템플릿에 적지 않고 제한된 보관소로 관리한다. 실제 설정/수락은 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) OPEN.
