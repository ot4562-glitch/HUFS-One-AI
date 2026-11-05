# HUFS One AI — 현재 NCP 운영·비용·가동 승인 정책

**운영 상태:** NCP IaC/network/host·SSH 미리보기/복구 자동화 **코드와 오프라인 mock은 main에 존재**합니다. 실제 NCP 계정·VM/공인 IP·TLS/운영 PostgreSQL/유료 HCX·OCR 개통·지출/청구·반납에 대한 현장 영수증은 아직 없습니다. **RELEASE_BLOCKED**, 유료 AI/Laya OFF.

## 책임과 승인

- **심민성:** NCP 관련 모든 코드/SDK/worker·systemd/cgroup·IaC/Terraform/PowerShell/CI/배포 자동화, 운영 통합 문제 수정 [#253](https://github.com/minseong-hufs/HUFS-One-AI/issues/253).
- **이서연:** [#12](https://github.com/minseong-hufs/HUFS-One-AI/issues/12) NCP 비코드 계정·IAM/요금·SKU/크레딧·실서버/사용권/CPU·청구/종료·반납 영수증 담당.
- **최종 사용자/자료권리자:** 실제 리전/SKU·신규 과금/최대 비용·지출 중단/서버 공개/원본·외부 모델 전송을 **별도 명시 승인**. 이 문서의 비교 가격·합성 plan은 결제가 아니다.

## 적용 전에 필요한 현재 공식 확인

- [ ] NCP 실제 계정/권한/IAM/subaccount, 대한민국 리전의 해당 서버 SKU·Ubuntu x64 이미지 재고/버전, VM·50GB급 디스크 등 계획 용량·공인 IP·네트워크/스토리지/백업·트래픽.
- [ ] 콘솔 공식 요금(시간당 KRW, VAT, 크레딧·크레딧 만료/과금·종료 시 잔액), 1일 알림·하드 비용 상한/중지·반납 책임.
- [ ] 실제 General OCR/HCX-005/HCX-007 endpoint/quota·권리/요금·모델 정책/과금 단위·버전/토큰/finishReason, NCP 외부 전송 가능한 자료 종류.
- [ ] 실제 운영 URL·TLS/도메인·인증/현재 외대메일 수신권/공개 범위, direct origin/IPv6·Geo/Global Edge/ACL·미로그인 자산 차단.
- [ ] CA TLS PG 최소역할/FORCE RLS/backup/restore와 host CPU/RSS/p95, Cloud VM·AI·스토리지/트래픽 비용·키 rotation/rollback.

**가격·크레딧/기한은 사용자/운영자가 개통 당일 공식 콘솔로 재확인**하며 과거 조사표나 가정값을 실제 견적으로 표기하지 않는다.

## 비공개 합성 미리보기 vs 실제 서비스

| 단계 | 허용되는 행동 | 제외/추가 승인 |
| --- | --- | --- |
| 로컬 계획 `--plan` | 오프라인 정책·VPC/ACG/NACL/비밀 없는 plan SHA 검증 | VM·유료 호출/실 SSH/실학생 원본 반입 금지 |
| 승인된 SSH-only preview | 합성 allowlist ZIP·SSH 지문·127.0.0.1:5173 systemd·health/재시작/rollback 실측 | 80/443·실 Google/PG/HCX·실학생/기관 자료 공개 OFF |
| 승인된 제한 staging | production 조립·OIDC/메일/PG/TLS/WAF/LB/원 IP·AI 사용권·비용·복구 실증 | 인적 Gold/자료권리·D03 서명 전 public 출시 금지 |
| 서명된 공개 운영 | 최소권한/데이터 보호·비용/패치/복구·민감 로그/삭제/반납 지속 감사 | 목적/비용/기관/학생 허가 변경시 재인수 |

한국 리전만으로 **한국 IP 전용 접근 차단**이 생기지 않는다. 필요한 경우 Global Edge 승인된 실제 Geo 제어·직접 IP/IPv6/우회 부정시험을 거쳐야 한다.

## 기록 템플릿

```text
NCP account IAM/리전·SKU·OS/디스크·공인 IP(공개키만, 키/비밀번호 미기재):
사용자 승인 ID/날짜, 담당 운영자, 예상 KRW/h·VAT/크레딧·hard stop:
Terraform plan SHA / ACG/NACL/UFW·관리자 IPv4/32 / origin 접근 제한:
비공개 ZIP/SSH host fingerprint/배포 SHA·CPU/RSS/p95·health:
NCP VM·DB·OCR/HCX 실제 호출/청구 및 중단/반납:
PASS | FAIL | HOLD | NOT_RUN:
rollback·restore/권리 철회/잔여 위험:
[#252] 실제 인수 증거 ID / [#253] 코드 수정 PR:
```

**실무 문서:** [운영 가이드](../infra/ncp/README.md), [Quickstart](../infra/ncp/QUICKSTART.md), [운영자 인계](../infra/ncp/OPERATIONS_HANDOFF_TEMPLATE.md). 실제 비용·운영 승인은 [#252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252).
