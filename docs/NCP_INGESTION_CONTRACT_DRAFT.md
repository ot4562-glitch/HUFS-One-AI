# #449 — NCP 데이터 계약 사전 구현 (제안/NOT_APPROVED)

이 문서와 `packages/contracts/src/ingestion/ncp-data-draft.ts`는 **실제 소스·NCP 서버·DB에 접근하지 않는 타입 계약 초안**입니다. `NcpIngestionDraft` 네임스페이스를 통해 데이터 파이프라인 담당자가 합성 fixture로 미리 합의할 수 있습니다. 이 코드를 실제 서비스 경로/SQL에 조립하지 않았고, 현재 운영 스키마로 승인한 것이 아닙니다.

## 2026-11-11 계약·코드 진척 및 미승인 경계

이 문서의 **타입/권리 초안은 NCP 운영 결정·실서비스 인수로 승격되지 않았습니다**. main에 병합된 #458/#460은 발견 후보 DTO·SourceRevision 결속을 제안하며, 열린 [#464](https://github.com/ot4562-glitch/HUFS-One-AI/pull/464)는 현재 등록/판본과 preflight 일치 검증을, [#477](https://github.com/ot4562-glitch/HUFS-One-AI/pull/477)→[#479](https://github.com/ot4562-glitch/HUFS-One-AI/pull/479)는 권한 있는 **단일 pinned Cheerio GET**과 운영자 출처/robots·terms·요청/바이트 예산 이중 사전 검사를 추가합니다. 모두 실제 비공개 운영자 current registry 결속·실 NCP 실행·협업자 승인 전 미완입니다.

열린 [#468](https://github.com/ot4562-glitch/HUFS-One-AI/pull/468) HWP/HWPX 실파일 포맷 파서(합성 원본), [#474](https://github.com/ot4562-glitch/HUFS-One-AI/pull/474) NEEDS_REVIEW 저장 연결 및 [#476](https://github.com/ot4562-glitch/HUFS-One-AI/pull/476) 통합 코드는 **실제 HUFS 원본 내용/레이아웃·기관 권리·Gold/실운영 migration을 검증한 것이 아닙니다**. 실제 NCP 보존·삭제 SLA/RPO·RTO, 팀별 최소권한, 감사, 예산·갱신 지표 결정은 [#449](https://github.com/ot4562-glitch/HUFS-One-AI/issues/449) OPEN의 A~G 계약으로 남아 있습니다. 전수 상태는 [감사 원장](REVIEW_AND_ISSUE_AUDIT_20261111.md)을 참조합니다.

## 선행 합의 가능한 계약
- 소스 발견 등록: `sourceId,canonicalUrl,permissionRef,publisher,sourceClass,observedAt` 및 COLLECT/STORE/SEARCH/EXTERNAL_TRANSFER 각각의 권리 플래그. URL·권리 플래그가 있다고 독립적인 운영자 허가가 생기는 것은 아닙니다.
- 원본/정규화 바이트 SHA와 NCP 비공개 원문 객체키 구분. 발행/수집/검수 시점·독립 검수자를 분리합니다.
- 상태 `DISCOVERED → FETCHED → PARSED → NEEDS_REVIEW → APPROVED → ACTIVE` (실패/철회 별도). **실제로 상태를 바꾸는 DB 트랜잭션은 구현하지 않았습니다.**
- ACTIVE에는 별도 승인, 원본·정규화 해시 검증, 검수자≠수집 작업자, 검색 목적의 권리 승인이 필요합니다. SYNTHETIC 자료는 ACTIVE로 승격 불가.
- `gitSha,buildSha,migrationVersion,adapterVersion,datasetRevision,schemaVersion`와 reader 지원 범위는 배포 전 비교 가능한 순수 함수. 운영 migration 실행/롤백/서명/수집기는 범위 밖입니다.

## NCP 연결 전/후 경계
사전 구현 가능한 것은 **객체 형태·유효성 검사·일부 승격 불가 조건과 합성 테스트**입니다. NCP 실행/허가된 실제 URL/Gold/사람 검수/백업/요금·크레딧 확인은 이 PR에서 수행하지 않습니다.

**미설계로 유지:** 고위험 분야별 검수 비율/자동승격 허용 여부, RPO/RTO, 실제 NCP SKU/스토리지·IAM, 유지기간·삭제/철회 SLA, HWP/HWPX **실원문 정확성·권리·운영 검증**, 사이트별 주기·예산, 검색 인덱스/캐시 원자적 교체, 운영 migration 파괴적 변경 승인. 이슈 #449의 체크리스트를 본 PR만으로 완료 처리하지 않습니다.

관련 [#445 수집·갱신](https://github.com/ot4562-glitch/HUFS-One-AI/issues/445) · [#446 독립 검수](https://github.com/ot4562-glitch/HUFS-One-AI/issues/446) · [#447 서비스](https://github.com/ot4562-glitch/HUFS-One-AI/issues/447).

## 필드 수준 미지수와 정정·취소 증거

- `NormalizedEvidenceRecordDraftSchema`는 `KNOWN / UNKNOWN / NOT_APPLICABLE`을 구분합니다. VERIFIED/KNOWN 필드는 같은 source revision의 실제 paragraphId에 연결되어야 하고, 누락/비적용 필드는 이유만 가지며 임의 값을 추측해 채우지 않습니다.
- `SourceChangeDraftSchema`는 새 판본이 **어느 과거 판본을 CORRECTED/REPLACED/CANCELLED 했는지**와 새 판본 근거를 기록합니다. URL 변경만으로 자동 취소하지 않으며 운영에서 사람이 권한·근거를 검토해야 합니다.
- 두 계약은 합성 데이터 타입/반례 시험을 위한 **초안**입니다. 문단 ID 실제 존재, 정정 시간 순서, PostgreSQL 활성화/검색 캐시 철회는 NCP DB 트랜잭션이 따로 검증해야 하므로 미완료로 남깁니다.

## 웹 후보·robots·terms 검토 계약 (합성 전용)

`CrawlScopeDraftSchema`는 출처별 허용 후보 경로와 robots/약관 검토 상태를 `UNKNOWN / REVIEWED_PERMITTED / RESTRICTED`로 구분해 기록합니다. `DiscoveryCandidateDraftSchema`는 같은 출처 origin에서 발견한 링크를 `REVIEW_REQUIRED`로 인계하고 **발견 자체가 자동 수집·권리 허가가 아님**을 보장합니다. 실제 robots/약관 판독·독립 확인·수집 요청 상한·운영 원장의 적용과 승인 여부는 NCP에서만 최종 결정합니다.

## 수집 후보 → 인적 검토 DTO 연결 (NCP 설치 전)

`prepareDiscoveryReviewDrafts`는 Crawlee/Cheerio가 **이미 허가받아 읽은 바이트**에서 뽑은 최대 100개 링크 제안을 `DiscoveryCandidateDraft`로 변환하고, 현재 입력된 동일 출처 origin·경로 prefix 범위 밖 URL과 중복을 제외합니다. 반환 항목은 오직 `REVIEW_REQUIRED`이며 자동 enqueue·수집·권리 확인·ACTIVE 승격은 없습니다. 예제는 합성 도메인만 사용하고 실제 소스/운영 registry는 NCP 비공개 원장에만 보관합니다. `UNKNOWN` robots/terms도 검토할 후보는 만들 수 있지만, 실제 수집 권한을 뜻하지는 않습니다.
