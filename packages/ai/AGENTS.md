# OCR/HCX·Laya 코드 소유/안전 계약

> **2026-11-03 사용자 역할 변경:** 이 디렉터리의 SDK/LLM/OCR/Vision/ONNX/worker·오프라인 테스트는 **심민성 `ot4562-glitch` 단독 개발 소유**. [루트 AGENTS](../../AGENTS.md) 및 [담당 정본](../../docs/WORKSTREAMS.md) 우선. 과거 "이서연 provider 코드" 지시는 폐기되었다.

- **심민성 구현:** NCP CLOVA General OCR·HCX-005 Vision·HCX-007 adapter/HTTP·bbox/좌표·SourceSpan/인용·worker/queue/idempotency·budget/키/429/503·rights/sourceRevision/asOf/SharingGrant guard·`UNKNOWN/NEEDS_REVIEW` 검증, Laya ONNX 모델 runtime·CPU/메모리 hard gate·오프라인 fake provider chaos/CI·systemd/Docker/IaC/측정 자동화. 코드 이슈 [#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20), [#88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88), [#143](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143).
- **이서연 `lhh42001`는 개발 소유자가 아니다.** NCP/CLOVA 계약·계정·endpoint/쿼터·실제 비코드 운영/호스트·요금 검증만 [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12)/[#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22)에서 담당한다. SDK·스크립트·CI/ONNX 개발을 이서연에게 배정하지 않는다.
- Laya multilingual ONNX는 공개 출처가 승인된 문서의 **비동기 선택 조언**에만, 기본 `LAYA_ENABLED=false`·worker 1·queue≤16·CPUQuota=100%(4vCPU에서 1 vCPU CPU time)·MemoryMax=3072M 목표. 이 설정은 **운영 실측 전 가설**이다.
- OCR/HCX/Laya 출력은 **검증 전 주장/후보일 뿐** 학칙·자격·마감/지원 결과 확정 근거가 아니다. source revision/permission/시점·원문 근거·bbox·token 사용량/지출 hard gate·재시도·권한 철회를 확인한다. 무권한/예산0/취소/출처불명 시 실제 호출 0·거짓 `VERIFIED` 0을 목표로 한다.
- 사용자 별도 승인·법적/기관 원본 권리·실호스트 quota·NCP 비용·서비스 사용권 없으면 **모델 weight 다운로드·VM 생성·유료 AI 호출·학생/학교 원자료 외부 전송 0건**. 테스트는 fake provider와 합성 데이터로 수행. 코드 PR에는 독립 리뷰·재현 CI가 필요하다.
