# HUFS One AI — 남은 구현·운영 설정·검증 (2026-11-06 현행)

> **`OWNER_CONFIRMED_APPROVED`는 프로젝트 승인**이지 실 NCP/학생 자료/공식 학칙/유료 AI 실행 성공이 아닙니다. 정확한 통합 코드 증거는 [STATUS](../STATUS.md), 실제 운영 통합과 검수는 [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276)에서 확인합니다. 파일명의 20261104는 기존 링크 호환을 위해 유지합니다. 현재 `RELEASE_BLOCKED`.

## 코드 구현 완료(운영 완료와 구별)

- 오너 분할 병합 PR **#267·#268·#269·#270·#272·#273·#274·#275**, BETA 본인 CSV UI/API [#277](https://github.com/ot4562-glitch/HUFS-One-AI/pull/277) 모두 `main` 반영. 구 대형 #264는 **미병합 종료**. 합성 계약/권한·관리형 PostgreSQL/Source/AI 비용, 경험/포트폴리오→AI 후보→학생 명시 승인·철회, 운영 런타임 plan/apply 코드가 있습니다.
- 학업 [#278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278): **정규 과거 8학기·동일 계절 최대 4·NOTICE_ONLY/UNKNOWN 보수 판정·`forecast-offering-v2`**, 합성 회귀, MERGED.
- 추천 [#279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279): **합성 40공고+10학사공지 커버리지 감사**, 경험 인용/키워드 후보(항상 `NEEDS_REVIEW`)·현재 학생 승인 신호/철회·버전/선택형 보완 주제, MERGED. [#259](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259) 순수 코어 이슈 완료, 실 UI/실학생은 별개.
- 비전공자 [NCP 서버](BEGINNER_NCP_SERVER_SETUP.md)·[제품/개발 AI CLI](BEGINNER_NCP_PRODUCT_AND_AGENTS.md)·[구조](BEGINNER_PRODUCT_ARCHITECTURE.md) 가이드가 README 하단에 연결. 문서 작성은 서버 생성·실설치 성공과 다름.
- 코드 통합 기준 [`48134da`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/48134dae3b16157ebcc294f744c320fdd64a115c) 4종 합성/격리 PG·Chrome·NCP IaC·Pages Actions **4/4 SUCCESS**. 새 commit의 CI는 별도 확인.

## 2026-11-06 합성 코드의 후속 통합

- [#285](https://github.com/ot4562-glitch/HUFS-One-AI/pull/285): 경험 원문/AI 후보/사용자 승인을 분리한 합성 UI 컴포넌트·테스트만 반영. **운영/실라우트에는 아직 미연결**이고 #284 API 메서드·jobId·#258 추천 소비자 연결 및 실제 Chrome 상호작용 검증이 남음.
- [#286](https://github.com/ot4562-glitch/HUFS-One-AI/pull/286): 40건 원본 코퍼스를 바꾸지 않는 **5개 revision-chain 별도 overlay**, quarantine `(id, revisionId)` 결정성 수정·검사. 기존 `recommendationReport`의 r1 코퍼스는 유지. #201 합성 벤치는 dirty 작업트리에서 측정되어 clean HEAD/운영 p95가 아님.
- [#287](https://github.com/ot4562-glitch/HUFS-One-AI/pull/287)/[#288](https://github.com/ot4562-glitch/HUFS-One-AI/pull/288)/[#289](https://github.com/ot4562-glitch/HUFS-One-AI/pull/289): `nextAttempts`로 영역 재분류를 알 수 없으면 `UNKNOWN/NEEDS_REVIEW`, rolling-origin NOTICE_ONLY·0/n·사건/20과목 반례, 학점 원장 속성 및 [PROPERTY_COVERAGE](../packages/core/src/academics/PROPERTY_COVERAGE.md). **공식 학칙·실학생 4인 대조는 #282 NOT_RUN**.
- AI 보조 PR 코드 `COMMENT`와 합성 Actions 통과는 독립 사람 승인/실환경 수락이 아닙니다. `csv/` 원본 5개는 수정·삭제·재인코딩하지 않았고, 현행 출시 게이트는 `RELEASE_BLOCKED`.

### UI 리디자인 [#290](https://github.com/ot4562-glitch/HUFS-One-AI/pull/290) 추가 통합

A11 공통 디자인 계약과 11개 대분류 GNB·네이비 배너/왼쪽 LNB·합성 홈 P001·공고 상태 행을 `main`에 통합했습니다. 관찰된 원래 HUFSAbility 기능은 **미지원 텍스트**, 학교 자격 증명/기관 시스템 직접 연동 없음. HEAD 4/4 Actions SUCCESS는 합성 CI만 의미하며 전체 [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9)의 접근성/권한 회귀 및 [#280](https://github.com/ot4562-glitch/HUFS-One-AI/issues/280) 실기기·계정 현장 인수는 NOT_RUN/미완료. 실서비스 `RELEASE_BLOCKED`는 유지됩니다.

## 아직 미완료인 실서비스와 일부 소비자 연계

1. **실 NCP:** 계정/IAM·SKU/비용 한도·VPC/ACG/NACL·SSH·TLS/Host/SNI·프록시 원 IP/IPv6·롤백/복구·요금·반납 영수증 `CONFIGURATION_REQUIRED/NOT_RUN`. [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12) 비코드, [#276](https://github.com/ot4562-glitch/HUFS-One-AI/issues/276) 운영 통합.
2. **Google/학교메일/DB:** 실제 OIDC·학교메일·역할·RLS/CSRF, PostgreSQL 7개 기본+확장 SQL roles/CA TLS/migration/backup·복구, 비공개 operator factory/현재 자료 권리/실 DB readback `NOT_RUN`.
3. **학생 자료:** `csv/`에 **Forms 1개+수강 CSV 4개, 총 5개 복구**, 176행 중 학수번호 공란 132행. 실제 4명의 Forms↔수강 파일 해시↔BETA actor↔목적별 현재 consent/rights를 **검증된 private registry/loader**로 연결·인입·조회·철회/삭제·복구할 것. PR #277은 read port/UI 코드이며 배포 완료가 아님. 원본을 무단 수정·삭제하지 않고 공개 deploy·CI·AI 프롬프트에 원본을 담지 않는다.
4. **실 CLOVA/OCR/RAG:** 운영 키/허용 egress/가격·청구·중복/취소·source 권리, Vision/PDF native worker/NOTICE/SBOM·실성능/비용, 운영 경로 검증. 개발 Codex/Claude Code CLI 설치와 제품 AI 연동은 별개.
5. **UI/학업/권리:** [#258](https://github.com/ot4562-glitch/HUFS-One-AI/issues/258) 경험 합성 컴포넌트 이후 실제 라우트/#284 API·로드맵 화면, [#260](https://github.com/ot4562-glitch/HUFS-One-AI/issues/260) 교과/비교과 연계·정식 근거, [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9)/[#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119) UI, [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) 추천 실원본/benchmark/골드, [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11) 공식 RulePack/8학기 소스·독립 검산; [#261](https://github.com/ot4562-glitch/HUFS-One-AI/issues/261) 비코드 기획·권리·비용.
6. **실효성/사람 인수:** 사용자 요청으로 독립 Gold 평가는 현재 작업에서 제외되었으나 **NOT_RUN/NOT_MEASURED**, 공식 학교 판정·실서비스 품질 PASS로 주장하지 않음.

## 종료된 이슈와 유지 이슈

과거 **#252(실환경 후속 이관)·#253(코드)·#257(경험 API)**는 CLOSED, 운영/실소스 남은 항목은 #276에 집약. #259 순수 코어 CLOSED. **#10·#11·#255·#258·#260·#261·#276 및 #9·#12·#119는 OPEN**이며 다른 담당자 업무를 임의 종료하지 않습니다. 요청받은 `csv/` 원본 5개 불변 보존은 [AGENTS](../AGENTS.md)/[DATA_GOVERNANCE](DATA_GOVERNANCE.md)를 따르며, 법적 삭제/철회 의무는 별개입니다.
