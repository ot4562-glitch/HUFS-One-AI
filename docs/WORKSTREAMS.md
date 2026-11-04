# HUFS One AI | 확정 5인 분업과 작업 경계

## 2026-11-04 PR 전수 통합에 따른 담당 상태

- 사용자 지시로 [통합 PR #216](https://github.com/minseong-hufs/HUFS-One-AI/pull/216)을 main `f23b86bb`로 병합하여 **열린 PR 0건 / 일반 이슈 40건**. 각 팀원 UI/추천/학업의 기존 PR 변경은 통합 조상으로 보존했으며, 과거 개별 스택 PR 중 CLOSED·unmerged가 있어도 **코드 미포함으로 단정하지 않는다**. 아래 과거 33건·34건·32건 기록은 역사 스냅샷이다.
- **담당 범위 변경 없음:** 심민성은 모든 NCP 관련 코드·API·보안/통합, 이서연은 실제 NCP 비코드 운영·요금/실측, 이의상 UI, 김채윤 추천, 박준영 학업. 이번 회차 동료에게 별도 PR 처리/승인을 요청하지 않았다.
- 실제 계정/클라우드·학교 근거·독립 gold·접근성/현장 복구는 이슈 수락 조건에 남으며 `RELEASE_BLOCKED`. [STATUS](../STATUS.md), [검증 인수서](HUMAN_ACCEPTANCE_GATE_20261104.md) 참조.


> **담당 범위 기준 2026-11-03, 현재 PR·이슈 대조 2026-11-04 KST.** 이 문서는 **지속되는 담당자·작업 경계**만 적습니다. PR별 실적/차단은 [STATUS](../STATUS.md), 수락 항목 증거율은 [TEAM_PROGRESS](TEAM_PROGRESS.md), 과거 기록은 [Git 이력](https://github.com/ot4562-glitch/HUFS-One-AI/commits/main/docs/WORKSTREAMS.md)에서 확인합니다. 과거 PR 상태를 '현재'로 재사용하지 않습니다.

## 팀 책임

| 담당자 (GitHub) | 최종 책임 / 작업 이슈 | 명확한 범위 |
| --- | --- | --- |
| **심민성** `ot4562-glitch` | 기술 총괄·통합·보안·공통 계약·API/인증/DB·Temporal RAG, **NCP 관련 모든 코드** [#8](https://github.com/ot4562-glitch/HUFS-One-AI/issues/8) [#19](https://github.com/ot4562-glitch/HUFS-One-AI/issues/19) [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27) [#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20) [#88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88) [#143](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143) | SourceRevision·actor/grant·CAS·central manifest, OCR/HCX provider SDK·HTTP adapter·bbox/권리·AI 비용 hard gate·Laya ONNX worker/queue·CPU 안전 제어 및 테스트·CI·OS/systemd·Docker/IaC/배포 스크립트 구현. UI/추천/학업 타인의 코드 소유 경계는 존중 |
| **이의상** `uisang2004-maker` | React UI·모바일·접근성·학생 흐름·시연 화면. [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9) [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124) [#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141) | HUFSAbility 원래 학생 메뉴 보존·🚫 미지원 상태, 더 나은 독립 UI/UX, 화면 route/상태·360px/키보드·스크린리더, #131 합성 설정 비교 main 병합; #134 CLOSED/미병합으로 고유 화면 필요시 #132·#163 owner API를 별도 UI PR로 개발. API/계약 권한은 기술 총괄과 조정 |
| **김채윤** `qamarrchae` | 추천·공지 순수 코어/정렬·근거/합성 평가. [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) [#86](https://github.com/ot4562-glitch/HUFS-One-AI/issues/86) | TopicCode/공고·자격·마감/정정·시점/노출·재계산·합성 **200개 라벨 초안 작성**. **독립 인간 gold 최종 판정은 #61의 심민성·이의상 담당**, 생성자 자체검수를 독립 수락으로 세지 않음. AI 후보를 공식 판정으로 승격하지 않음 |
| **박준영** `taewangim-alt` | 학업·학점·교육과정/개설·졸업 RulePack 순수 코어 및 공식 교과 조사. [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11) [#133](https://github.com/ot4562-glitch/HUFS-One-AI/issues/133) | 학수번호·이중전공·중복/대체/선수·기간/규칙, `UNKNOWN/NEEDS_REVIEW`, #138 HTML·#149 CSV/handoff **로컬 변환 코드 병합 완료**(기관 수집 허가 아님). 실제 교과 사이트 수집/이용허가를 추정하지 않음 |
| **이서연** `lhh42001` | **NCP 클라우드 운영·계정·권한·크레딧·요금·비코드 인프라·실측 전담** [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12) [#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22) | VPC/서버/스토리지/TLS/IAM/DNS·CLOVA/OCR/HCX 서비스 이용권·SKU/예산·호스트 CPU/RSS/비용 영수증·중지/반납. **SDK·worker·HTTP·ONNX·IaC·OS 스크립트·CI·자동화 코딩 0건 배정**. UI·추천·학업 개발 이슈에서 assignee 해제. 유료 실행은 별도 사용자 승인 필요 |

**2026-11-04 데이터 수집·참여 범위 최신 사용자 확인:** 공모전 5명 전원 동의 및 HUFSAbility 자료 수집 허가 확보. 공식 강의시간표의 공개 교수명·강의명은 허가된 수업정보 범위로 관리하며 교수명 일괄 마스킹은 필수 게이트 아님. **개인 수강·Forms 원본 제출 4명**과 참여 5명은 별개. 원본 6경로 Git 추적 정리 [#212](https://github.com/minseong-hufs/HUFS-One-AI/pull/212)는 **main 병합** 후 금지 경로 0(총 810경로) 확인. 다만 과거 history/clone·full private checkout 검사와 #46·#89 실운영 게이트는 미완료. 권한 정본은 [DATA_GOVERNANCE](DATA_GOVERNANCE.md).

**2026-11-04 최신 담당/수락 정정 (실시간 상태는 STATUS/GitHub):** 열린 일반 이슈 **40건**을 기존 주관 기준으로 심민성 20건(#192/#199/#203 추가), 이의상 12건(#200 추가), 김채윤 3건(#201 추가), 박준영 3건(#202 추가), 이서연 2건으로 분류한다. 이 수치는 **주관 업무 1회 집계**이며 공동 assignee를 중복 세지 않는다. **당시 2026-11-04 오전 스냅샷**은 열린 PR 33건이었으나, 현재 [#216](https://github.com/minseong-hufs/HUFS-One-AI/pull/216) 통합 병합으로 **0건**. #189 박준영의 승인 동일교과 pure core(main 5718fd2)와 #152 이의상의 현재 이중전공 합성 UI(main 28d4827)는 최신 HEAD 비작성자 리뷰·CI를 확인해 병합했으며 **공식 RulePack·4인 원본 권리·실서비스 수락은 아님**. #151/#154/#155/#191/#205/#210 리뷰는 COMMENT(사람의 승인 아님). #46/#61/#89 RELEASE_BLOCKED를 유지한다. 2026-11-03 당시 34건 전수 원장은 아래에 **역사 기록**으로 남겨 담당 변경/승인을 암시하지 않는다.

**2026-11-03 #150 분리·통합 의존성 (최신 코드 기준):** 모든 새 코드는 심민성 소유, 타인 UI 작업 트리는 보존한다. #145 wire·#148 budget SQL/adapter는 이미 main에 병합되어 재구현하지 않는다.

1. **Provider 권한 → 원장 → 결과:** [#157](https://github.com/ot4562-glitch/HUFS-One-AI/pull/157) `provider-authority-postgres.ts`·`20261103_ai_provider_inputs.sql`의 actor/session·consent·SourceRevision/asOf·권리 철회 재검증을 먼저 수락. 이후 `provider-results-postgres.ts`·`20261103_ai_provider_results.sql`의 actor/session/epoch·`SETTLED` 결과 쓰기 및 RLS 부정시험을 독립 PR로; 마지막에 `provider-runtime.ts`·`provider-transport.ts`·`provider-postgres.ts`를 기존 `budget-postgres.ts`와 연결해 cancel/timeout/429/503/UNKNOWN_BILLING·replay를 합성 시험한다. **승인 없는 provider IO 기본 0건.**
2. **Owner UI↔API:** `owner-double-major-{http,source,postgres}.ts`, `approved-revision-claims-postgres.ts`, `demo-profile-{http,postgres}.ts`, 관련 SQL/DTO는 #157 이후 권한·출처/학사 승인 계약과 서비스 세션 종단을 선행. #144 현재 이중전공과 #82 What-if는 별도.
3. **Raster/OCR·Laya:** `packages/ai/src/{raster*,ocr-evidence,laya-*}.ts`, `infra/ai/raster-worker.mjs`, `infra/laya/*`는 승인 입력/결과 프로토콜 이후 worker 격리·CPU/RSS·취소/시간초과·late result·kill switch 단독 검증. 타 팀 core/UI 덮어쓰기 없음.
4. **운영 composition root/배포:** `apps/api/src/main.ts` production 차단을 유지한 채 기존 OIDC/OTP/PG adapter를 실세션·CSRF·영속 철회·TLS/익명 자산 정책으로 안전하게 조립하는 별도 #27 PR; `infra/deploy/*` 및 #156 SSH-only preview는 그 이후 #46/#89·NCP 운영 #12/#22의 사람 승인까지 production 적용 금지.

**최신 #150 코드 분리 경로:** [#157](https://github.com/ot4562-glitch/HUFS-One-AI/pull/157)→[#158](https://github.com/ot4562-glitch/HUFS-One-AI/pull/158) provider 권한·정산결과, [#160](https://github.com/ot4562-glitch/HUFS-One-AI/pull/160)→[#165](https://github.com/ot4562-glitch/HUFS-One-AI/pull/165)→[#167](https://github.com/ot4562-glitch/HUFS-One-AI/pull/167) raster·provider·BETA HTTP, [#159](https://github.com/ot4562-glitch/HUFS-One-AI/pull/159)→[#161](https://github.com/ot4562-glitch/HUFS-One-AI/pull/161) Laya 오프라인/프로세스, [#162](https://github.com/ot4562-glitch/HUFS-One-AI/pull/162)·[#163](https://github.com/ot4562-glitch/HUFS-One-AI/pull/163)·[#164](https://github.com/ot4562-glitch/HUFS-One-AI/pull/164) Owner, [#166](https://github.com/ot4562-glitch/HUFS-One-AI/pull/166) private 배포 Draft. **합성 CI는 각 3/3 PASS, 독립 승인·실 NCP/유료 Provider·현재 자료권리 확인은 별도**. 연결은 #157/#158 및 최신 session/rights 종단 승인 이후.


**2026-11-03 최신 역할 우선:** 이서연은 NCP 운영 담당만 유지하고 OCR/HCX/Laya 코드 등 모든 개발작업은 심민성에게 재배정했다. 기존 작업 이슈 #12/#22의 운영 범위와 #20/#88/#143의 구현 범위를 엄격히 구분한다. 이전 문서/과거 이슈의 혼합 배정은 효력 없음.

**#160 현재 통합 경계:** `a741e5b` 비강제 main merge로 CI allowlist 충돌 2곳 해소, 소스/lockfile 원래 승인본 그대로·고유 11파일. 새 HEAD CI/독립 재승인 후만 #165→#167 진행. [검증](../STATUS.md).

**심민성 #27 현재 선행 연결:** [#168](https://github.com/ot4562-glitch/HUFS-One-AI/pull/168) PostgreSQL 인증 factory·새 API 인스턴스/철회 HTTP 시험, 현 HEAD CI 3/3 PASS·qamarrchae 독립 승인 대기/미병합. [검증 범위](../STATUS.md). 타인 UI/추천/학업 브랜치·이서연 비코드 운영 배정 및 고정 수락률 변경 없음.

**#162 실제 SQL 검증 보완:** 심민성이 HEAD `4699269`에서 기존 Owner opt-in PG 시험 4개를 필수 CI로 연결했다(포트/빈 DB 보호 유지). Owner 4/4·전체 PG 46/46 PASS, 새 HEAD 독립 재승인 전 미병합. [검증 범위](../STATUS.md). UI #152·공식 RulePack/운영 수락과 구분한다.

**팀원 5명 ≠ 실자료 제출 5명.** 실제 학업/Forms 자료 제출 대상은 **심민성·이의상·김채윤·이서연 4명**으로, 박준영은 학업 코어 담당일 뿐 이번 실 4인 자료 제출 대상이 아닙니다. 별도의 빈 SYNTHETIC 계정·S01~S05·REVIEWER도 실 4인과 섞지 않습니다. 당사자 목적별 동의 확인과 Git 게시/클라우드/공개 사용 동의는 [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46) 기준으로 구분합니다.

<!-- full-issue-roster-20261103:start -->
## 2026-11-03 당시 담당자별 이슈 전수 원장 — 당시 OPEN 34 / CLOSED 7 (역사 기록)

**집계 정의:** GitHub `state=open, is:issue` 조회. **열린 이슈 34개를 정확히 한 명의 주관으로 배치**(중복/미배정 0). 괄호의 공동 담당은 기존 GitHub 다중 assignee와 교차 의존을 뜻하며, **기존 assignees·labels는 삭제·변경하지 않았다**. 닫힌 이슈 7개는 뒤에 별도 기록. 새로운 PR이나 코드량이 담당자 고정 수락 게이트의 분모/퍼센트를 자동 변경하지 않는다. 최종 상태/병합·차단은 [STATUS](../STATUS.md), 기존 담당 스코프는 [TEAM_PROGRESS](TEAM_PROGRESS.md) 참조.

| 주관 | OPEN 건수 | 가장 가까운 독립 작업 |
| --- | ---: | --- |
| **심민성** `ot4562-glitch` | **17** | #150 83파일 Draft 분리·#27 실운영 인증/PG·#46/#89 권리/보안 |
| **이의상** `uisang2004-maker` | **11** | #153 메뉴 하위 완료, #152 P2 코드 수정·리뷰 승인(최신 CI 실패)·#151/#154/#155 최신 main 통합, #124/#141 UX |
| **김채윤** `qamarrchae` | **2** | #10 인용 의미·#86 근거 설명 |
| **박준영** `taewangim-alt` | **2** | #149 변환 인계·실공식 RulePack |
| **이서연** `lhh42001` | **2** | #12 계정/크레딧·#22 승인 후 호스트 실측 |

### 심민성 주관 — 17건

| 이슈 | 본인 주관 다음 수락 | 공동 담당·의존 |
| --- | --- | --- |
| [#8](https://github.com/ot4562-glitch/HUFS-One-AI/issues/8) | 공통 Zod/합성 fixture — 4트랙 계약 인적 승인·실자료 권리 증거 | 모든 개발 트랙 |
| [#18](https://github.com/ot4562-glitch/HUFS-One-AI/issues/18) | SourceRevision·IMAGE/Temporal 계약 — OCR 20건/시간 12건 인적 검증 | 김채윤·박준영·이의상 소비 |
| [#19](https://github.com/ot4562-glitch/HUFS-One-AI/issues/19) | 공고 수집·불변 revision — 기관 원문 이용권/실 PG·수집 인가 | 김채윤 추천 |
| [#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20) | OCR·HCX SDK — #145/#148 오프라인 병합, #150 transport·권한 통합 후 검증 | 이서연 서비스 entitlement(비코드) |
| [#21](https://github.com/ot4562-glitch/HUFS-One-AI/issues/21) | Temporal RAG — 독립 citation/Recall·시간 정답과 실원문 권리 | 김채윤 평가 |
| [#23](https://github.com/ot4562-glitch/HUFS-One-AI/issues/23) | RAG·OCR·Laya 상위 EPIC — #20/#88/#143·#12/#22 수락 의존 추적 | 각 트랙 |
| [#25](https://github.com/ot4562-glitch/HUFS-One-AI/issues/25) | REVIEWER 초대 — 실제 OIDC·메일 소유·기간/철회·TLS 종단 | 이의상 UI 소비 |
| [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27) | HTTP/owner·DB — #150 통합 충돌 해소, WIS 동일 URL의 **파일별 SHA/권리 receipt** 설계 | 박준영 #133, 이의상 UI |
| [#39](https://github.com/ot4562-glitch/HUFS-One-AI/issues/39) | 추천·공지 API 허가 — 실 source rights·grant/epoch·멀티탭/철회 | 김채윤 코어 |
| [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46) | Private Git 원본 6경로 최초 게시·공유 권리 감사, privacy **2 FAIL** 해소 | 자료 제출 당사자별 독립 검증 |
| [#52](https://github.com/ot4562-glitch/HUFS-One-AI/issues/52) | 캘린더 API/계약 main 완료, 공식 일정·권한 철회/실 E2E 후 수락 | 이의상 #51 |
| [#61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61) | 합성 라벨 **독립 인간 gold 0/200**, 생성자 외 평가/서명 기록 | 이의상 독립 검토 |
| [#88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88) | OCR·HCX·Laya fake-provider 429/503/중복 과금/취소/OOM·CPU chaos | #150 통합 후 |
| [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) | Google·TLS·direct IP·PG·권한·NCP·데이터 권리 **RELEASE_BLOCKED** 검증 | 전원, 배포 승인 별도 |
| [#132](https://github.com/ot4562-glitch/HUFS-One-AI/issues/132) | 독립 빈 합성 계정 — #134 CLOSED/미병합 기능 재검토, #150 owner API, reset/권한 E2E | 이의상·김채윤·박준영 |
| [#133](https://github.com/ot4562-glitch/HUFS-One-AI/issues/133) | 실 4인 학업 연결 — #149 **병합 완료**, 저장본별 권리·원장/4인 동의·비Git 인계 | 박준영·김채윤·이의상 |
| [#143](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143) | Laya worker/OS·cgroup/IaC 코드 — #150 Draft 독립 리뷰·격리/OOM/CPU 수락 | 이서연 #22 실호스트 비코드 |

### 이의상 주관 — 11건

| 이슈 | 본인 주관 다음 수락 | 공동 담당·의존 |
| --- | --- | --- |
| [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9) | UI 종합 — #153 메뉴 계약 하위 병합, #152 P2 코드 수정·리뷰 승인이나 최신 CI 실패, #151/#154/#155 통합 충돌과 #124/#141 IA·운영 접근성 | 심민성 API |
| [#51](https://github.com/ot4562-glitch/HUFS-One-AI/issues/51) | 2주 미니 캘린더 #72 main; 학교 일정·실스크린리더/철회 검증 | 심민성 #52 |
| [#80](https://github.com/ot4562-glitch/HUFS-One-AI/issues/80) | 지원 단계/자가기록 보드 #128 main; 401/403/409·다중탭 E2E | 심민성 owner/CAS |
| [#81](https://github.com/ot4562-glitch/HUFS-One-AI/issues/81) | 졸업+수강계획 나란히 — 실 RulePack/계획 안전 DTO·권한 UI | 박준영·심민성 |
| [#82](https://github.com/ot4562-glitch/HUFS-One-AI/issues/82) | 가정 전공 What-if — 엔진·공식 RulePack+비교 UI (#144와 구분) | 박준영·심민성 |
| [#85](https://github.com/ot4562-glitch/HUFS-One-AI/issues/85) | BETA 개인화 비교 #131 main; 운영 역할/권한·실 AT·다중탭 수락 | 심민성 role API |
| [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119) | 공고 정정 전후 화면 — source 권한·필드 인용·접근성 E2E | 김채윤·심민성 |
| [#123](https://github.com/ot4562-glitch/HUFS-One-AI/issues/123) | 가상 동아리 게시판/AI 포스터 — 실제 이미지·관리자 승인·접근성 | 김채윤·심민성 |
| [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124) | HUFSAbility 메뉴 — 공개 5/24/4와 관찰 11영역/76화면 전체 manifest 대응 | 심민성 capability |
| [#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141) | 독립 디자인/UI 개선 — 11/76 매핑·360px/스크린리더·미지원 UX | 심민성 제품·인가 |
| [#144](https://github.com/ot4562-glitch/HUFS-One-AI/issues/144) | **현재 선택된 이중전공** 졸업요건 UI (#147 코어 main, #150 API Draft) | 박준영·심민성 |

### 김채윤 주관 — 2건

| 이슈 | 본인 주관 다음 수락 | 공동 담당·의존 |
| --- | --- | --- |
| [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) | 추천·공지 코어 — 인용/토픽 의미 독립 검증·실기관 권리·rank 품질 | 심민성 source/인적 평가 |
| [#86](https://github.com/ot4562-glitch/HUFS-One-AI/issues/86) | 제외/보류 사유 #117 main — 실인가 설명 API·UI·브라우저 근거 검증 | 이의상 UI·심민성 API |

### 박준영 주관 — 2건

| 이슈 | 본인 주관 다음 수락 | 공동 담당·의존 |
| --- | --- | --- |
| [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11) | 졸업·수강·개설 코어 — #138/#147/#149 병합, 공식 RulePack·실원장/What-if 남음 | 심민성 owner/권리 |
| [#87](https://github.com/ot4562-glitch/HUFS-One-AI/issues/87) | RulePack 개정 영향 diff — 학칙 2판 독립 승인·K-of-N/중복인정 등 증거 | 심민성 source rights |

### 이서연 주관 — 2건

| 이슈 | 본인 주관 다음 수락 | 공동 담당·의존 |
| --- | --- | --- |
| [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12) | **NCP 비코드 운영**: 계정·SKU·크레딧·쿼터·IAM/VPC/TLS·청구/종료 영수증 | 심민성 인프라 코드 |
| [#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22) | **NCP 비코드 실측**: 승인된 4vCPU/32GB 호스트 CPU/RSS/p95·비용·중단/복원 | 심민성 Laya worker/#143 코드 |

### 완료 처리된 일반 이슈 — CLOSED 7건 (중복 집계 금지)

- **심민성 담당 6건:** [#29](https://github.com/ot4562-glitch/HUFS-One-AI/issues/29) UI CI, [#38](https://github.com/ot4562-glitch/HUFS-One-AI/issues/38) 공지 overdue 계약, [#42](https://github.com/ot4562-glitch/HUFS-One-AI/issues/42) 추천 점수 계약 결정, [#63](https://github.com/ot4562-glitch/HUFS-One-AI/issues/63) React/Vite 의존성, [#71](https://github.com/ot4562-glitch/HUFS-One-AI/issues/71) 캘린더 브라우저 API, [#126](https://github.com/ot4562-glitch/HUFS-One-AI/issues/126) Chrome E2E Actions.
- **이의상 담당 1건:** [#79](https://github.com/ot4562-glitch/HUFS-One-AI/issues/79) D-day.

**중복·선후 구분:** #8·#9·#10·#11·#23·#27은 상위 수락 원장이라 자식 기능 PR 병합만으로 종료하지 않음. #124 정보구조와 #141 디자인 개선은 같은 UI 루프, #82 가정 전공 What-if와 #144 **현재 선택된 이중전공 요건 표시**는 별개, #12/#22 NCP **운영**과 #20/#88/#143 **개발 코드**는 분리, #61 독립 인간 평가(0/200)는 #10 본인 생성 라벨과 분리. #51 UI와 #52 API는 캘린더 종단의 서로 다른 수락 책임.

**신규 누락 의존:** [#149](https://github.com/ot4562-glitch/HUFS-One-AI/pull/149) 로컬 CSV/handoff **main `efa13368`** 병합 뒤, WIS URL은 저장 학과·학기와 관계없이 동일하므로 [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27)/[#133](https://github.com/ot4562-glitch/HUFS-One-AI/issues/133)에서 `sourceUrl + original SHA-256` 등 **파일별 권리 receipt**, `.handoff.json`의 이수구분/비고 안전 전달·철회/동의/E2E를 수락해야 함. 기관 이용권을 URL의 접속 가능성으로 대체하지 않음.

**공통 불변 차단:** [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46) Private Git 원본 권리/검사 **2 FAIL**, [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) **RELEASE_BLOCKED**. 실 NCP 리소스 생성/유료 호출·모델 다운로드·실학생/학교 자료 외부 전송·공개 배포는 별도 승인과 독립 검증 전 금지.
<!-- full-issue-roster-20261103:end -->

## 협업자 결정 → 다음 구현 책임 (2026-11-03)

이 항목은 실제 [GitHub 이슈 댓글](https://github.com/ot4562-glitch/HUFS-One-AI/issues)에서 **명시적 답변이 된 기술 방향**만 요약한다. 결정을 승인했다고 코드·학교 규정·자료 권리·유료 실행이 승인된 것은 아니다.

| 결정 / 관련 이슈 | 주관·다음 구현·검증 책임 |
| --- | --- |
| [#133 학업](https://github.com/ot4562-glitch/HUFS-One-AI/issues/133): `degreePath/track`를 `curriculumVersion`과 분리, multi-source documents/조항 SHA·권리, AREA_SPREAD·과목 묶음·언어조건은 공식 근거 전 `NEEDS_REVIEW`; 7+2 학수번호/교시 변환 추정 금지 | **박준영:** Git 밖 local-only DRAFT·합성 반례 및 순수 코드 PR, 학교 근거 수집. **심민성:** additive contracts/권한·PG/파일별 SHA receipt 검토. **김채윤·이의상:** 추천·UI에서 미승인 READY/졸업 확정 차단 |
| [#61 합성 평가](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61): legacy snapshot 유지 + corpus snapshots 별도, 독립 gold 0/200 | **김채윤:** 생성·자체 검수/fixture 출처. **이의상:** 200쌍 독립 사람 라벨·anchor 검토. **심민성:** 결과 수락·API 소비자 계약 |
| [#141/#124 메뉴](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141): 공개 5/24/4 정본 변경 금지, 로그인 관찰 6개는 비활성 `UNVERIFIED observedAreas` 별도 추가 계약 | **심민성:** 공통 manifest additive Zod·음성 시험 PR. **이의상:** 계약 병합 후 텍스트-only 비활성 360px·키보드·스크린리더 렌더링 |
| [#119 정정 비교](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119): owner `compareOpportunityRevisions`는 main; 두 개의 현재 승인 revision-id 발견 경로 미구현 | **심민성:** owner/SourceRevision 권한 메타 전용 조회·부정 테스트. **이의상:** #151 UI 별도 owner `liveServices` 연결·구판 잔상/401/403/409/503 제거 |
| [#144/#81/#82 학업 UI](https://github.com/ot4562-glitch/HUFS-One-AI/issues/144): main의 현재 이중전공 GET, `checkStudyPlan`, `checkMajorWhatIf`를 owner 세션에만 주입; 가정 후보는 승인 owner catalog 근거 필요 | **심민성:** #171 선택적 API DI 및 권한 있는 전공 후보 조회. **박준영:** 공식 RulePack 없을 때 BLOCKED. **이의상:** #152 P2 rowImpacts strict 원소 검증·#151/#154/#155 main 충돌 해결·실 E2E |
| [#132 EMPTY_DEMO](https://github.com/ot4562-glitch/HUFS-One-AI/issues/132): #163 PG CAS/RESET main; GET/PATCH/POST reset·snapshot 정본 사용, #134 중복 UI 종료 | **심민성:** #170 실제 SQL 검증 + #171 optional owner PG DI. **이의상:** 기존 LocalAccountWorkbench를 중복 실계정으로 만들지 않고 BETA owner-client 소비·시연 접근성 E2E |
| [#123 동아리](https://github.com/ot4562-glitch/HUFS-One-AI/issues/123): main 합성 club route + owner browser client 소비, 실제 AI 포스터 아님 | **이의상:** 실제 BETA owner session DI·404/403/늦은 응답/360px 합성 소비. **김채윤:** 가상 추천 core 유지. **심민성:** role/source rights 검증 |
| [#52/#86](https://github.com/ot4562-glitch/HUFS-One-AI/issues/52) calendar/추천 사유 | **심민성:** 계약의 calendar ID 유일성·needsConfirmation/asOf/grant 묶음 및 `explainOpportunity` 권한 경계 유지. **김채윤:** core와 실제 표시 사유/증거 혼동 방어. **이의상:** owner UI 표시·실브라우저 검증 |

**실행 관리:** 최신 코드·PR/CI 판정은 [STATUS](../STATUS.md). 독립 비작성자 리뷰 승인 없이 PR 강제 병합 금지. 사용자 별도 승인이 없는 학교 원본/실학생/NCP 유료 서비스 사용·출시 금지. #46/#61/#89 수락 게이트는 열린 상태 유지.

## 주요 교차 의존

| 작업 | 입력 주관 → 소비자 및 완료 게이트 |
| --- | --- |
| [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124) + [#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141) 전체 메뉴·디자인 | 심민성 manifest/실기능 상태·사용자 가치/공식 표현 검수 → 이의상 원래 메뉴 노출·독립 디자인. [UI 텍스트 아틀라스](HUFSABILITY_UI_COMPONENT_ATLAS.md)의 11개 대분류·76화면과 공개 5/24/4 대응. 미구현 메뉴도 보이되 동작 금지 |
| [#132](https://github.com/ot4562-glitch/HUFS-One-AI/issues/132) 독립 빈 시연 계정 | 심민성 owner API·CAS·데이터 격리·시연 설명/매뉴얼 검수 → 김채윤 재계산 검증·박준영 학업 공백 확인 → 이의상 설정/초기화 화면 |
| [#133](https://github.com/ot4562-glitch/HUFS-One-AI/issues/133) 실제 4인 학업·교과 | 박준영 공식 교육과정/개설·학점/이수구분 근거 조사 → 심민성 4인 actor/rights/DB·원본/변환 검수 → 김채윤 추천 소비·이의상 학생별 UI. 무단 크롤링/외부 원본 업로드·가짜 계정 금지 |
| [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119) 정정 전후 비교 | 김채윤 판본/피드 합성 코어 → 심민성 승인 claim·권리/API → 이의상 필드별 비교/접근성. 테스트-only #140 병합은 실제 비교 UI 완료 아님 |
| [#80](https://github.com/ot4562-glitch/HUFS-One-AI/issues/80)·[#81](https://github.com/ot4562-glitch/HUFS-One-AI/issues/81)·[#82](https://github.com/ot4562-glitch/HUFS-One-AI/issues/82) 지원/졸업/What-if | 심민성 인가·저장/API + 박준영 공식 학업 계산(해당 시) → 이의상 권한 있는 화면/실브라우저. 실학생의 공식 합격·졸업 판정 표시 금지 |
| [#23](https://github.com/ot4562-glitch/HUFS-One-AI/issues/23) RAG·OCR/Vision·Laya | **심민성** 출처/인가·Temporal RAG+OCR/HCX SDK·Vision bbox·Laya ONNX/queue·비용 차단·offline chaos **모든 코드**([#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20), [#88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88), [#143](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143)) ↔ **이서연** NCP 계정·entitlement·VPC/한도/실측·비코드 운영 영수증(#12/#22). 사용자 승인 없는 외부 전송·유료 호출 기본 OFF |

## 협업 안전·PR 검수

- **담당별 브랜치/PR/worktree/포트/일회용 DB 격리**. NCP 구성값·모델/리소스 보호가 코드(스크립트·YAML·IaC·CI 포함)인 경우에는 심민성 소유이며, 이서연은 운영 콘솔·계약·권한/비용/호스트 검증의 비코드 소유다. shared Zod/TopicCode, migrations, lockfile, GitHub Actions, auth/scope 변경은 기술 총괄과 소비자 리뷰를 거칩니다. 작성자 본인 APPROVED만으로 병합 불가. [PR_WORKFLOW](PR_WORKFLOW.md).
- API·UI·코어의 동일한 `asOf`/actor·grant/epoch·version·revocation·401/403/409·늦은 응답에서 이전 학생 데이터가 보이지 않게 하는 것이 공통 비기능 요구입니다.
- 자료·원문·학교 아이덴티티·실 개인정보를 권한 없이 공개하지 않습니다. 합성/SKIP/NOT_RUN·외부 권리/실운영을 구분합니다. [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46)과 [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) 해결 전 공개 출시 차단.
- 진척율은 증거 기반 **고정 게이트 수락률**일 뿐 제품 완성도/개인 역량 평가가 아닙니다. [TEAM_PROGRESS](TEAM_PROGRESS.md) 참고.
