# #449 — NCP 데이터 계약 사전 구현 (제안/NOT_APPROVED)

이 문서와 `packages/contracts/src/ingestion/ncp-data-draft.ts`는 **실제 소스·NCP 서버·DB에 접근하지 않는 타입 계약 초안**입니다. `NcpIngestionDraft` 네임스페이스를 통해 데이터 파이프라인 담당자가 합성 fixture로 미리 합의할 수 있습니다. 이 코드를 실제 서비스 경로/SQL에 조립하지 않았고, 현재 운영 스키마로 승인한 것이 아닙니다.

## 선행 합의 가능한 계약
- 소스 발견 등록: `sourceId,canonicalUrl,permissionRef,publisher,sourceClass,observedAt` 및 COLLECT/STORE/SEARCH/EXTERNAL_TRANSFER 각각의 권리 플래그. URL·권리 플래그가 있다고 독립적인 운영자 허가가 생기는 것은 아닙니다.
- 원본/정규화 바이트 SHA와 NCP 비공개 원문 객체키 구분. 발행/수집/검수 시점·독립 검수자를 분리합니다.
- 상태 `DISCOVERED → FETCHED → PARSED → NEEDS_REVIEW → APPROVED → ACTIVE` (실패/철회 별도). **실제로 상태를 바꾸는 DB 트랜잭션은 구현하지 않았습니다.**
- ACTIVE에는 별도 승인, 원본·정규화 해시 검증, 검수자≠수집 작업자, 검색 목적의 권리 승인이 필요합니다. SYNTHETIC 자료는 ACTIVE로 승격 불가.
- `gitSha,buildSha,migrationVersion,adapterVersion,datasetRevision,schemaVersion`와 reader 지원 범위는 배포 전 비교 가능한 순수 함수. 운영 migration 실행/롤백/서명/수집기는 범위 밖입니다.

## NCP 연결 전/후 경계
사전 구현 가능한 것은 **객체 형태·유효성 검사·일부 승격 불가 조건과 합성 테스트**입니다. NCP 실행/허가된 실제 URL/Gold/사람 검수/백업/요금·크레딧 확인은 이 PR에서 수행하지 않습니다.

**미설계로 유지:** 고위험 분야별 검수 비율/자동승격 허용 여부, RPO/RTO, 실제 NCP SKU/스토리지·IAM, 유지기간·삭제/철회 SLA, HWP/HWPX 파서, 사이트별 주기·예산, 검색 인덱스/캐시 원자적 교체, 운영 migration 파괴적 변경 승인. 이슈 #449의 체크리스트를 본 PR만으로 완료 처리하지 않습니다.

관련 [#445 수집·갱신](https://github.com/ot4562-glitch/HUFS-One-AI/issues/445) · [#446 독립 검수](https://github.com/ot4562-glitch/HUFS-One-AI/issues/446) · [#447 서비스](https://github.com/ot4562-glitch/HUFS-One-AI/issues/447).
