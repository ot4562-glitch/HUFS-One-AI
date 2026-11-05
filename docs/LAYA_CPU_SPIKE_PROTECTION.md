# HUFS One AI — Laya CPU/메모리 격리 및 안전 중단

**현재 상태:** Laya ONNX·child IPC/supervisor·스케줄/압력 방어와 Linux cgroup/systemd 관련 **안전 코드/샘플 설정**이 존재하지만 실제 승인된 NCP 호스트의 CPUQuota/RSS/OOM/p95·모델 weight/라이선스·서비스 비용·실현성은 미수락입니다. **`LAYA_ENABLED=false`/AI 기본 OFF, RELEASE_BLOCKED.**

## 원칙

- 학생에게 보이는 API/인증·PostgreSQL/권한·원문 근거가 **Laya 실험보다 항상 우선**.
- worker는 Web/API와 같은 프로세스/동기 요청을 점유하지 않고 독립 child/process, job/queue·결과/timeout/cancel/unknown과 재시작·kill-switch를 분리.
- 실제 cgroup v2 CPUQuota/MemoryMax/MemoryHigh·OOM kill/재시작·rootless sandbox/systemd 권한, 네트워크 차단·모델 아티팩트/원본·runtime hash를 최소 권한으로 pin.
- 대기열 한도/동시성/워커 20초 안팎·준비 45초 안팎 등 설정은 **초기 보호 목표**이며 실제 4vCPU/32GB(승인된 경우)에서 CPU/RSS/p95·OS 정책 검증으로 조정.
- 실패/미승인/CPU 초과·늦은 결과/권리 철회 때 `UNKNOWN/NEEDS_REVIEW` 및 결정론 코드 fallback. API 응답 차단·무한 retry·비용 없는 새 HCX 호출/자격 확정 금지.
- 필요 없는 OCR/HCX/Vision/Laya 호출을 5슬롯 전환에 따라 무의미하게 발생시키지 않는다(100회 전환 새 LLM 호출 0 목표).

## 검증 순서

- [ ] 합성 경계: Laya OFF, payload/schema/bounds, queue·중복/취소/late response·provider OFF·budget/권리/캐시 거부.
- [ ] 격리된 Linux test host의 실제 cgroup v2/systemd·CPUQuota/RSS/OOM·worker kill/restart·네트워크 차단·모델 hash/native 의존성/라이선스 확인.
- [ ] 사용자 사전 지출·원본/모델 이용권 승인·운영자 서명 후에만 NCP SKU에서 API p50/p95/CPU/RSS/청구·kill switch·비상 rollback을 측정.
- [ ] 정상·압력·동시 사용자·AI provider 장애에서 API 우선/보수적 fallback/개인정보 비노출을 재현하고 사람·운영자 별도 수락.

**코드 이슈:** [#253](https://github.com/minseong-hufs/HUFS-One-AI/issues/253) · **실호스트/비용 수락:** [#252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252) · [NCP 운영](NCP_OPERATIONS_2026.md). 승인 없이 모델 다운로드/ON/유료 외부 호출 금지.
