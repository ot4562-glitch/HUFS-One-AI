# HUFS One AI — 5인 담당 영역 구현·검증 현황 (2026-11-01 KST)


## 최신 PR 근거 보정 (2026-11-01)

| 트랙 | 확인된 통합 완료 | 남은 완료조건 |
| --- | --- | --- |
| 심민성 API·통합 | [#58](https://github.com/ot4562-glitch/HUFS-One-AI/pull/58) **main 병합**, 서버 캘린더·인증·동의/PG·RAG/SourceRevision 합성/일회용 PG 코드. [#77](https://github.com/ot4562-glitch/HUFS-One-AI/pull/77) 브라우저 캘린더 GET 코드/합성 회귀·CI 성공 | #77 타인 최신 HEAD 리뷰·병합/실 UI 연결; 실 OIDC/SMTP·학생 권리·운영 DB/NCP/모바일 E2E |
| 이의상 UI | [#28](https://github.com/ot4562-glitch/HUFS-One-AI/pull/28) 컨트롤러·[#64](https://github.com/ot4562-glitch/HUFS-One-AI/pull/64) 디자인/달력 모델·[#66](https://github.com/ot4562-glitch/HUFS-One-AI/pull/66) 의존성·[#68](https://github.com/ot4562-glitch/HUFS-One-AI/pull/68) React 셸/대상별 합성 분리 **main 병합** | #69/#72/#73/#74/#75/#76 스택 OPEN, 앱 전체 화면·실 인증/달력/REVIEWER·접근성 E2E |
| 김채윤 추천·공지 | 기존 #15/#16/#40/#41/#48/#49/#50 + #60/#65/#67 합성 코퍼스/snapshot **main 병합** | A15 독립 골드 200·실공고 사용권/자격·UI/실 API 성능 |
| 박준영 학업 | #56/#57/#62 학점·예측·계획 pure core **main 병합** | [#70](https://github.com/ot4562-glitch/HUFS-One-AI/pull/70) 시행기간/asOf 수정 요청, 공식 원문 사람 검수/학업 E2E |
| 이서연 NCP/모델 | #12/#20/#22 기획·SKU/비용/기본 OFF 설계 | 실제 provider/worker·권리·클라우드/비용 실측·승인; 유료 환경 미개통 |

**주의:** 아래 75/30/80/35/10% 수치는 #58/#56/#57/#62/#68 등이 병합되기 **이전**의 이력 추정으로 현재 진척률로 사용하면 안 된다. 같은 기준으로 전체 트랙을 재평가하지 않았으므로 최신 퍼센트를 지어내지 않는다. 팀원의 역량/노력·본선 준비율과도 무관하다.

## 이전 리뷰의 시점별 추정 (역사적 스냅샷, 현재 수치 아님)

**평가 성격:** 기술 총괄의 GitHub **확인 가능 산출물 기준** 진척 추정치이며 개인 역량·노력 평가가 아니다. 각자의 확정 담당 범위를 100%로 보고, 필수 기능 코드·테스트/CI·다른 트랙 소비·실자료/운영/인적 검증을 종합했다. **진척률 오차 ±10%p** 이상 가능: 공동작업, GitHub 밖 작업, 운영 승인을 아직 확인할 수 없다. PR 병합·합성 PASS·설계문서와 실 사용자/유료 NCP 검증은 별개다. 전체 평균 또는 본선 준비율로 환산하지 않는다.

| 담당·코드 소유자 | 증거 기반 담당 범위 진척(추정) | 검증된 완료 산출물 | 아직 완료로 셀 수 없는 핵심 항목 |
| --- | ---: | --- | --- |
| **심민성** `ot4562-glitch` — 공통 계약·API·인증·일반 PG·Temporal RAG·통합 | **75%** | [#58](https://github.com/ot4562-glitch/HUFS-One-AI/pull/58) 단일 미병합 통합 PR: OIDC/메일 증명 mock·PG RLS/SharingGrant·reviewer sandbox/출처 판본/RAG·캘린더·owner REST, synthetic + disposable PostgreSQL CI, 계약/권리 인가 및 입력 철회 경계. 김채윤의 [비작성자 APPROVED](https://github.com/ot4562-glitch/HUFS-One-AI/pull/58#pullrequestreview-5726210742)는 당시 HEAD `683ab98`의 추천/공지 소비 범위에 한정됨 | 이번 리뷰 대응 변경의 **현재 HEAD 재승인**, main 병합; 실제 Google/SMTP·공식/개인 자료 제공자 권한·실학생 동의·운영 TLS/PG·브라우저·p95/비용 검증; 운영 ADMIN/실제 provider 연결 |
| **이의상** `uisang2004-maker` — UI/모바일·접근성 | **30%** | 합성 selector/session/epoch·섹션 공개 게이트 [#28 MERGED](https://github.com/ot4562-glitch/HUFS-One-AI/pull/28), API 통합이 소비할 transport/세션 구조·합성 테스트 존재. 직접 확인한 `apps/web/src/features/demo/`에 구현·17개 안팎의 mock 테스트 | `apps/web/src/features/{today,opportunities,notices,experience,graduation,planner,settings}` 실 화면 미확인(현재 빈 디렉터리), [#51 캘린더 위젯](https://github.com/ot4562-glitch/HUFS-One-AI/issues/51) OPEN; reviewer 초대·다기능 React, 360px/스크린리더, 실제 API·다중탭·철회·모바일 E2E |
| **김채윤** `qamarrchae` — 추천·공지·일정 계산 | **80%** | 실제 main 병합된 [#15 추천](https://github.com/ot4562-glitch/HUFS-One-AI/pull/15)·[#16 공지](https://github.com/ot4562-glitch/HUFS-One-AI/pull/16)·[#40 출처시점](https://github.com/ot4562-glitch/HUFS-One-AI/pull/40)·[#41 관련도/이유](https://github.com/ot4562-glitch/HUFS-One-AI/pull/41)·[#48 합성 평가](https://github.com/ot4562-glitch/HUFS-One-AI/pull/48)·[#49 부분공유](https://github.com/ot4562-glitch/HUFS-One-AI/pull/49)·[#50 캘린더](https://github.com/ot4562-glitch/HUFS-One-AI/pull/50). #58 소비자 실제 코드 리뷰 APPROVED | 인적 독립 작성 실 공고 40×5 정답/실 기관 이용권과 source claim 완전성, 실제 추천 precision/Recall/공지 적용 정확도, React UI와 승인된 데이터까지 끝단 시연, rank-v1.1 운영/가중치 최종 채택 |
| **박준영** `taewangim-alt` — 학사/학점/수강계획·개설 전망 | **35%** | 학업 vNext 공통 계약 소비 및 합성 코드 PR [#56 3원장·재수강](https://github.com/ot4562-glitch/HUFS-One-AI/pull/56), [#57 시점별 개설 전망](https://github.com/ot4562-glitch/HUFS-One-AI/pull/57). [#59](https://github.com/ot4562-glitch/HUFS-One-AI/pull/59)의 #58 리뷰 3건 대응 커밋을 원작성자를 유지하여 통합 브랜치에 채택(승인 성적표 PLANNED 제외, 과목 개설/학업 scope 계약 검증; 아직 main 미병합). HEAD `981d23f`, `6958f0e` 모두 synthetic CI SUCCESS, 기존 문제 보강됨 | **두 PR OPEN/CHANGES_REQUESTED**: #56 과거 asOf 미래 취득 행, #57 공식 대체과목 ID 결속 문제 보류; 실 RulePack(표·각주·학번별 예외) 독립 승인, A08 CREDIT-07~09 수강계획/충돌, 두 cutoff 이상 실제 rolling-origin 및 공식 학적 검증 미완료 |
| **이서연** `lhh42001` — 기획 리드·NCP/CLOVA/OCR/Vision/Laya 운영/provider | **10%** | NCP High Memory-g3 조건부 비용·CPU/보안/worker 기본 OFF 설계와 이슈 [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12)·[#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20)·[#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22), [NCP 운영 문서](NCP_OPERATIONS_2026.md) 존재. 직접 확인한 main+통합 브랜치에서 `packages/ai`는 AGENTS.md뿐이며 `infra/ncp`는 실행 파일 없음 | 실제 provider-neutral NCP adapter/SDK·mock OCR/Vision·bbox 근거·ONNX Laya worker/cgroup 부하/kill switch·운영 IaC/키/비용 원장 코드 PR **확인 불가**. 실제 VM/유료 호출은 본선·크레딧·사용자 승인 전 **금지**이므로 미개통 사실을 무단 작업 태만으로 해석하지 않음 |

## 판단과 후속 확인 순서

- **현재 통합도 ≠ 실제 제품 완성도:** 추천 계산은 크게 진행됐지만 권리·출처·학업·UI·NCP/운영 등 교차 의존으로 실서비스 준비는 별도 BLOCKED. 학생 원본·실 공급자 권리/동의 없이는 ACTIVE/APPROVED를 합성 결과로 대체하지 않는다.
- **UI #9/#51:** 홈/5탭과 캘린더·reviewer 초대부터 실제 React, 기본 401/403/409·캐시 철회 및 접근성 E2E를 독립 PR로 제출.
- **학업 #11:** 두 최신 PR 변경요청의 반례 수정·독립 현재 HEAD 승인 뒤 병합. RulePack의 공식 자료 적용 예외, CREDIT-07~09, 역사적 개설 실측을 분리 진행.
- **추천 #10:** 비작성자 검수된 projection 마감/출처 claim ID 보존·rank 설정 잠금, 인적 골드 라벨·사용조건 확인과 UI/API 수치 대조.
- **NCP #12/#20/#22:** 유료 리소스 없이 합성 fake provider/OCR bbox·요금 reserve hard gate/worker OFF tests부터 독립 PR. 실제 서버/키/모델 다운로드/청구는 사용자 별도 명시 승인 후만.
- **플랫폼 #27/#58:** 리뷰 지적된 date provenance·`versions.rankConfig` 보강 후 최신 SHA CI/비작성자 재승인, 필요한 의존 PR 정리. **main 자동 병합·운영 배포 하지 않음**.

**근거 확인:** GitHub Issues #9/#10/#11/#12/#20/#22/#27/#51 및 위 PR의 실제 OPEN/MERGED, 현재 로컬 `apps/web`·`packages/ai`·`infra/ncp` 파일 트리, 테스트 실행 기록. 진척률은 GitHub 외 개인 로컬 진행분/학교·NCP 자격 권한/실환경 계측까지 확인한 숫자가 아니므로 팀원 각자의 현황 제출 시 정정해야 한다.
