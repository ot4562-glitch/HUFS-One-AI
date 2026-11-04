# HUFS One AI | 현재 상태 (2026-11-04 확인)

> 현재 정본. 과거의 PR 숫자와 당시 HEAD 리뷰 기록은 Git 이력에서 확인한다. 근거: [PR #216](https://github.com/minseong-hufs/HUFS-One-AI/pull/216), [모든 이슈](https://github.com/minseong-hufs/HUFS-One-AI/issues), [인수 체크리스트](docs/HUMAN_ACCEPTANCE_GATE_20261104.md), [담당별 진척](docs/TEAM_PROGRESS.md).

## 1. GitHub와 CI

| 구분 | 2026-11-04 검증 결과 |
| --- | --- |
| main | **f23b86bb693a163c7f6a0330d1b9657c684724ff** — 통합 PR #216 merge commit |
| 열린 PR | **0건** |
| 열린 일반 이슈 | **15건** (정리 전 40건 중 중복 25건 이관·종료) |
| 통합 PR | [#216](https://github.com/minseong-hufs/HUFS-One-AI/pull/216) — 기존 기능·협업자 커밋·원본 조상을 보존하여 merge 방식 병합 |
| 병합 후 3종 CI | [TASK-00](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41815023022), [NCP IaC offline](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41815022904), [Chrome browser](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41815022895) **3/3 SUCCESS** |
| 닫힌 미병합 PR | **10건**의 최신 HEAD가 현재 main Git ancestry에 포함됨(Git compare 10/10). 개별 PR의 merged_at가 없으므로 MERGED라고 표시하지 않음 |
| 개인 원본 Git 추적 | 현재 main의 **811개 tracked path** 중 금지된 보호 경로 **0개** (#212). 전체 과거 이력/clone·full private checkout 개인정보 검사는 별도 |
| 공개 운영 | **RELEASE_BLOCKED** — 실제 Google/학교메일·운영 PostgreSQL/RLS·TLS/직접 IP·유료 NCP/SSH·사람 검증 미수락 |

**2026-11-04 예외:** 사용자가 소유자·협업자 작성 PR의 전수 직접 통합을 지시했고 #216을 병합했다. 해당 PR에 GitHub 비작성자 사람 APPROVED는 없었다. 작성자 또는 에이전트 COMMENT를 사람의 독립 APPROVED로 가장하지 않는다. 향후 일반 PR 정책은 [PR_WORKFLOW](docs/PR_WORKFLOW.md)대로 유지하며 이번 지시를 유료 인프라·운영 공개 승인으로 확장하지 않는다.

## 2. main에 반영된 코드와 경계

- **API·PostgreSQL:** 서버 소유 인증 및 영속 어댑터 조립, 구분된 7개 PostgreSQL TLS/ROLE 풀, 운영자 루프백 전용 API 진입점, 세션/권한/철회·SourceRevision/추천·Provider SQL, 권한 부정/PG 복구·혼잡 시험. 그러나 실제 운영용 인증/메일 서버·운영 DB·공개 서비스는 NOT_RUN. apps/api/src/main.ts의 APP_ENV=production 차단을 유지.
- **UI·학업·추천:** 공고 정정 전/후, 졸업·계획 나란히 보기, What-if 가정 UI, 합성 owner Provider/학업 화면, 추천 중복/정규화 benchmark·학점 속성 회귀 통합. **공식 학칙 RulePack·원본 권리·실학생 결과 및 독립 금지 경계 수락은 별개**.
- **NCP·AI:** 승인형 VPC/ACG/NACL·NIC/Ubuntu VM/Public IP Terraform, 오프라인 mock, plan 우선 설치·고정 SSH 합성 preview/rollback, CLOVA/HCX 오프라인 wire·원자 비용·Laya 기본 OFF 격리 프로세스. **실 NCP API apply·요금·SSH·OCR/HCX 유료 호출·실호스트 성능 확인은 0회/NOT_RUN**.
- **비공개 ingress:** Nginx/Docker/Compose는 검증 전 템플릿과 차단된 로컬 점검. 외부 포트/HTTPS/직접IP/운영 공개를 구현 완료로 간주하지 않음.
- **자료:** 사용자 확인으로 공모전 참여 **5명 전원 동의**, **HUFSAbility 자료 수집 허가 확보**. 실제 개인 수강/Forms 원본 제공자 **4명**과 구분. 공식 강의시간표에 공개된 교수명·강의명은 승인된 수업정보의 필요 범위로 제한하고 일괄 이름 마스킹을 필수 개발 게이트로 놓지 않음. 허가의 상세 필드/재배포/외부 모델 전송·철회는 별도 원장 검증.

## 3. 남은 구현 — 심민성 우선순위

| 우선 | 아직 구현/연결·검증되지 않은 완료 조건 | 관련 이슈 |
| --- | --- | --- |
| P0 | 신뢰된 Google code exchange/학교메일 OTP·allowlist/실세션·CSRF·철회 + 운영 PG/TLS + 공개 ingress의 **production 전용 안전한 서비스 진입점**, 실부정시험 | #27 #89 #25 |
| P0 | 승인된 실제 원본·출처별 권리 영수증/SourceRevision·외부모델 전송 범위·현재 철회, 실제 개인 4인 owner 자료 및 학교 RulePack 인적 검수/종단 | #19 #21 #39 #11 #133 #20 |
| P0 | 보호 파일 현재 트리 제거 이후 **full private checkout 개인정보 검사·과거 Git history/clone/접근 검토** | #46 |
| P0 | 합성 40공고×5슬롯 **200 라벨의 독립 사람 gold 승인(현재 확인 0/200)**, 실제 기관 공고 근거·Recall/설명 품질 수락 | #61 #10 #86 |
| P0 | NCP 실제 계정·요금·크레딧·SKU/VPC/ACG/SSH·Ubuntu 설치·백업/롤백 드릴·직접 IP/TLS 검증. 코드는 있지만 **사용자 별도 유료 승인과 현장 실증이 아직 없음** | #12 #22 #192 #89 |
| P1 | 미완성 HUFSAbility 11영역/76화면의 안전한 메뉴 매핑·미지원 UI, 빈 시연 계정/RESET 종단, 가상 AI 포스터 파일·게시 승인 API, 공식 RulePack 기반 실제 What-if 계산 | #9 #82 #123 #124 #132 #141 |
| P2 | role/error별 자동 접근성·스크린리더, 추천·학점/컨텍스트 bench 후속, 다중 인스턴스 quota, 실제 Laya CPU/RSS/p95, 진입점 원장 수락 | #88 #143 #199 #200 #201 #202 #203 |

**코드 병합 100%와 제품 기능 완성 100%는 다르다.** 기존 고정된 복합 인수 게이트는 심민성 **7/12(58.3%)**, 이의상 **9/12(75.0%)**, 김채윤 **7/12(58.3%)**, 박준영 **8/12(66.7%)**, 이서연 **운영 전용 1/5(20.0%)**. 합성 코드 진척만으로 실제 운영/사람 승인 분자를 증가시키지 않는다. 이 다섯 비율의 평균은 제품 전체 완성률이 아니다.

## 4. 정리 결정

- **PR 정리 종료: OPEN 0건.** 이미 main에 들어간 통합 코드를 중복 병합하거나 협업자에게 재작업 요청하지 않는다.
- **이슈 재편 완료:** 기존 OPEN 40건을 현재 **15건 OPEN + 25건 CLOSED(duplicate/이관)**로 통합했다. 각 열린 이슈는 **완료된 코드 설명 / 미완료만 체크리스트 / 명확한 책임자·연결 원본**으로 전면 교체했다. 닫힌 이슈는 완료를 가장하지 않고 정본 이슈로 이동·이력/댓글을 보존했다. 실서비스 인적 게이트 #46/#61/#89는 여전히 OPEN이다.
- [인적 승인·검증 인수서](docs/HUMAN_ACCEPTANCE_GATE_20261104.md)에서 실제 환경 수락을 별도로 관리. **RELEASE_BLOCKED** 유지.

## 5. 2026-11-04 이슈 구조 재정리 (기존 OPEN 40 → 현재 OPEN 15)

**확인:** 일반 이슈 47개 중 원래 CLOSED 7건은 변경하지 않고, 기존 OPEN 40건에서 **25건을 중복 통합 종료**, **15건 유지**했다. 15건 모두 본문에 완료 코드와 미완료 체크리스트를 분리하고 `enhancement`(해당하는 경우) 및 `duplicate`(통합 종료) 라벨을 적용했다. **주담당 한 명 11건**, 실제 공동 작업이 불가피한 **공동 배정 4건(#61/#123/#132/#133)**.

| 현재 OPEN 정본 | 주담당 | 이관한 이전 OPEN 이슈(현재 CLOSED) |
| --- | --- | --- |
| [#8 계약·CI](https://github.com/minseong-hufs/HUFS-One-AI/issues/8) | 심민성 | #18, #52, #199 |
| [#9 UI·메뉴·접근성](https://github.com/minseong-hufs/HUFS-One-AI/issues/9) | 이의상 | #51, #85, #124, #141, #200 |
| [#10 추천·품질](https://github.com/minseong-hufs/HUFS-One-AI/issues/10) | 김채윤 | #86, #201 |
| [#11 학업·규칙](https://github.com/minseong-hufs/HUFS-One-AI/issues/11) | 박준영 | #87, #202 |
| [#12 NCP 비코드 운영](https://github.com/minseong-hufs/HUFS-One-AI/issues/12) | 이서연 | #22 |
| [#19 Source/RAG](https://github.com/minseong-hufs/HUFS-One-AI/issues/19) | 심민성 | #21 |
| [#20 AI·Laya](https://github.com/minseong-hufs/HUFS-One-AI/issues/20) | 심민성 | #23 (Epic 범위는 #19/#20/#27/#89로 분산), #88, #143 |
| [#27 API·Auth·DB](https://github.com/minseong-hufs/HUFS-One-AI/issues/27) | 심민성 | #25, #39, #203 |
| [#46 개인정보·Git 감사](https://github.com/minseong-hufs/HUFS-One-AI/issues/46) | 심민성 | — |
| [#61 독립 gold](https://github.com/minseong-hufs/HUFS-One-AI/issues/61) | 심민성·이의상 공동 | — |
| [#89 NCP 코드·릴리스 게이트](https://github.com/minseong-hufs/HUFS-One-AI/issues/89) | 심민성 | #192 |
| [#119 UI 기능 종단](https://github.com/minseong-hufs/HUFS-One-AI/issues/119) | 이의상 | #80, #81, #82, #144 |
| [#123 가상 동아리](https://github.com/minseong-hufs/HUFS-One-AI/issues/123) | 이의상·심민성·김채윤 공동 | — |
| [#132 빈 시연 계정](https://github.com/minseong-hufs/HUFS-One-AI/issues/132) | 심민성·이의상 공동 | — |
| [#133 실제 4인 인입](https://github.com/minseong-hufs/HUFS-One-AI/issues/133) | 심민성·박준영 공동 | — |

**단일 주관 집계:** 심민성 9건, 이의상 3건, 김채윤 1건, 박준영 1건, 이서연 1건. 공동 담당은 중복으로 세지 않음. 기존 PR/이슈 댓글·편집 이력은 그대로 남고, **코드 CI 통과를 사람 승인이나 RELEASE_BLOCKED 해제로 계산하지 않는다**.

## 6. 설계/문서 요구사항 → 15개 정본 이슈 추적 (2026-11-04)

2026-11-04 [Architecture](Architecture.md) A00–A19, [Proposal](Proposal.md), [설계형 RAG/AI 운영 계약](docs/TRUSTED_RAG_MEDIA_VERSIONING.md), [데이터 권리](docs/DATA_GOVERNANCE.md), [REVIEWER 접근](docs/REVIEWER_ACCESS.md), [HUFSAbility 화면 아틀라스](docs/HUFSABILITY_UI_COMPONENT_ATLAS.md), [NCP 운영](docs/NCP_OPERATIONS_2026.md), [인적·운영 인수](docs/HUMAN_ACCEPTANCE_GATE_20261104.md)를 현행 이슈와 대조했다. 이전 15개 이슈의 소제목만으로 누락되던 **A09 개설 전망, A10 경험·보관함, A02 선택기, A03 26/6열 ingest, A06 제품 AI 4종, A12 제작 자산, A15 정확도·성능, A16 팀 인계, A19 라이선스**의 구체적인 미수락 항목을 담당 정본 이슈에 체크리스트로 추가했다. 추가 이슈 생성 없이 **15건 OPEN** 유지.

| 설계 요구사항 | 추적할 현재 열린 이슈 | 구현 판단 |
| --- | --- | --- |
| A00~A01 제품 단계·인증과 문서/모듈 책임 | #8, #27, #89 | P0/P1만 현재 인수, P2 후속 |
| A02 5슬롯 선택기·동시성/철회 | #9, #8, #27, #133 | 20방향·10연속·동시탭·실자료 분리 명시 |
| A03 Forms 26열·수강 CSV 6열/4인 | #133, #27, #8, #46 | 안전한 Preview/Apply·동의/권리 분리 |
| A04 TopicCode·SourceClass·계약 | #8, #10 | 계약/실소비자 교차검증 |
| A05 기회·추천·개인화 | #10, #61 | 결정론, 제외 설명, P@3/nDCG@3/gold |
| A06 SafeLlmPacket·제품 4종·OCR/HCX/Laya | #20, #19, #11, #61 | 내부 RulePack 도구는 별도 선택/승인, 제품 5번째 AI 아님 |
| A07 개인공지·일정/미니 캘린더 | #10, #9, #27 | 학생/행정 마감 분리·권한/원문 |
| A08 졸업·3원장·학점/RulePack/계획 | #11, #119, #133 | 학교 규정 검수 없으면 UNKNOWN |
| A09 미래 개설 전망·공식 사건·rolling-origin | #11, #119, #27 | P1 20과목/과거8학기 우선·가정 분리 |
| A10 경험·승인태그·북마크·행동계획 | #9, #27, #119 | owner CRUD·시연 overlay와 실제 행동 구분 |
| A11 학생 화면·브랜드·접근성 | #9, #119, #132 | 11영역·76화면은 미지원 표시 포함 |
| A12 40기회·10공지·이미지 10 brief·20포스터/12시간 | #132, #61, #10, #123 | 실제 제작·검증 수량과 설계 목표 구분 |
| A13 DB·전체 API·버전·세션·RLS | #27, #8, #19 | 현재 route와 설계 v1 경로 차이를 추적 |
| A14 NCP/Google/학교메일·비공개 인터넷 공개 | #89, #12, #27, #46 | 실제 운영/비용 승인 전 BLOCKED |
| A15 평가·성능·독립 정답 | #61, #10, #11, #20, #89 | 목표 수치와 실측/NOT_RUN 구분 |
| A16 팀원 이해·인수/설명 | #89, #132 | 사람 리허설/서명은 코드로 대체 불가 |
| A17 TASK-00~17·TASK-14C 검증 | #8(계약 대응 확인), 위 각 기능 이슈 | 1건당 주관1인, 4건 공동 수락 예외 |
| A18 일정·최종 발표·승인 | #89, #132, #61 | 실제 결재·공모전 제출은 사람이 실행 |
| A19 OSS 라이선스·부속/원본 권리 | #89, #8, #46 | release artifact/SBOM/NOTICE/비밀 노출 검사 |

**이슈만으로 가능한 것과 불가능한 것:** 15개 이슈는 **작업 큐·담당자·미완료 수락 기준의 단일 진입점**이다. 하지만 구현 시 [AGENTS](AGENTS.md)·담당 [Architecture](Architecture.md) 조항과 **현재 코드·테스트**를 읽어야 한다. 이슈를 체크했다고 계약/CI/권리·실환경 증거가 자동 충족되지 않는다. P2 확장(전교생·학교 DB/공식 SSO·앱스토어/푸시·완전 오프라인·고급 시간표 최적화)과 선택형 `.ics`·RulePack 작성 보조는 **명시 승인 전 현재 필수 구현으로 간주하지 않는다**. 단위 코드 완료·운영 배포·개인정보/출처·독립 인적 수락을 혼동하지 않고 #46/#61/#89 `RELEASE_BLOCKED`를 유지한다.
