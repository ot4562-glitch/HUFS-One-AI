# HUFS One AI — 2026-11-11 PR·Issue 전수 감사 및 본선 전 인계

> **범위/시점:** 2026-11-11 KST, 공개 GitHub 저장소 최초 열린 PR **22건**과 열린 Issue **31건**의 최신 HEAD, 변경 diff, CI, 리뷰, 이슈 본문·인계 댓글을 대조한 감사 스냅샷입니다. 이후의 실제 상태는 GitHub를 재조회합니다.

**처리 결과:** 최초 PR 22건 전부에 작성자 계정의 **공식 COMMENT 리뷰**를 실제로 제출했습니다. 그중 #475만 같은 HEAD에 대한 **실제 다른 협업자 APPROVED**와 CI 6/6을 확인하고 main [05d78cd](https://github.com/ot4562-glitch/HUFS-One-AI/commit/05d78cdff03d68d1b711f9009bdbb335bc0e2939)로 병합했습니다. 최초 PR 21건은 대기 중입니다. 모든 열린 이슈 31건을 검토했지만 **이번에 완료 표시/종결한 이슈는 0건**입니다. 실 NCP·학교 원문·Gold·권리 인수가 확인되지 않아 **RELEASE_BLOCKED**를 유지합니다.

## 0. 최초 감사 이후 새로 열린 PR — 재조회 증분

2026-11-11 KST 추가 조회에서 신규 [#483 FAQ 부정 표현 수정](https://github.com/ot4562-glitch/HUFS-One-AI/pull/483)과 **이 문서 업데이트 PR [#484](https://github.com/ot4562-glitch/HUFS-One-AI/pull/484)**가 생성되어, #475 병합 이후 **현재 열린 PR 23건**, 열린 이슈 31건을 확인했습니다. 아래 **22건 표는 감사 착수 당시 원본 스냅샷**이므로 없애거나 새 PR을 역사적 수치에 소급 포함하지 않습니다.

- **#483:** 박준영 `taewangim-alt` 작성, HEAD `4d8b911`, `faq-guard.ts`의 붙인 `못하다`와 단독 `안 되다` 부정 검사를 추가. FAQ 긍정 근거를 부정 답으로 뒤집거나 실제 부정 근거를 틀리게 거부하던 반례·회귀 10건. 공식 GitHub Actions **7/7 SUCCESS**, 2026-11-11 코드 diff/테스트를 확인하고 [공식 COMMENT 리뷰](https://github.com/ot4562-glitch/HUFS-One-AI/pull/483) 작성. 어중 `잘못합니다/잘못해도`를 부정으로 보는 오탐 여지는 비차단 제안으로 남겼습니다. **실제 사람 HEAD APPROVED/병합 없음, #341 OPEN 유지**하며 공식 FAQ/HCX/독립 Gold는 별도입니다. [#341 정정 댓글](https://github.com/ot4562-glitch/HUFS-One-AI/issues/341).
- **#484:** 본 문서·현행 README/STATUS/에이전트·아키텍처·본선/실 NCP 안내 등 **17개 Markdown 정본**을 최신 감사 기준으로 맞추는 비초안 문서 PR. **실제 동료 리뷰 요청** 등록, PR 자신도 CI/새 HEAD 리뷰 후 병합해야 합니다. 기능 코드·실자료·csv 변경 없음.
- **전체 이슈:** 새 이슈 없음; 31건 OPEN을 유지했습니다. 새 PR 출현으로 #341의 기존 “수정 PR 미확인” 진술은 그 당시 감사 시점에만 적용됩니다.

## 1. 최초 PR 22건 — 코드·CI·리뷰 점검 결과

| PR | 감사 HEAD | 관찰된 CI | 리뷰 결론/미완료 |
| --- | --- | --- | --- |
| [#431](https://github.com/ot4562-glitch/HUFS-One-AI/pull/431) | 6459915 | 7 PASS | 주석 속 시간표 허위 행/학기/캠퍼스 → #482 반영·새 승인 필요 |
| [#444](https://github.com/ot4562-glitch/HUFS-One-AI/pull/444) | 7aa6cb1 | 7 PASS | 공개 발견 vs robots/취득·재게시권 구분 및 독립 리뷰 |
| [#463](https://github.com/ot4562-glitch/HUFS-One-AI/pull/463) | 94461c0 | 8 PASS | URL/host·quota·refresh 보강; 기존 협업자 승인 이전 HEAD |
| [#464](https://github.com/ot4562-glitch/HUFS-One-AI/pull/464) | 8b91342 | 7 PASS | source·revision/preflight 결속, 실제 운영자 원장 검증 미실행 |
| [#465](https://github.com/ot4562-glitch/HUFS-One-AI/pull/465) | f8bf33c | 6 PASS | 승인된 PG V2 source, 이전 협업자 COMMENT 재리뷰 필요 |
| [#466](https://github.com/ot4562-glitch/HUFS-One-AI/pull/466) | 21c0c17 | 7 PASS, gate FAIL | 동료 현재 HEAD APPROVED 있음; #481 trusted main 부트스트랩 선행 |
| [#467](https://github.com/ot4562-glitch/HUFS-One-AI/pull/467) | a039b81 | 7 PASS | offline Cheerio 상세 파서, 실제 사이트 미검증 |
| [#468](https://github.com/ot4562-glitch/HUFS-One-AI/pull/468) | c0d5941 | 7 PASS | bounded HWPX/CFB 파서, 실제 원본·Gold 미검증 |
| [#469](https://github.com/ot4562-glitch/HUFS-One-AI/pull/469) | 76b20a0 | 7 PASS | offline 게시판 HTML 2계열, selector/권리 미검증 |
| [#470](https://github.com/ot4562-glitch/HUFS-One-AI/pull/470) | 554c220 | 7 PASS | Top-K/cursor 테스트, 기존 협업자 승인 이전 HEAD |
| [#471](https://github.com/ot4562-glitch/HUFS-One-AI/pull/471) | e39f703 | 7 PASS | V2 keyset; 5,100 proof lookahead 버그 #476에서 수리 |
| [#472](https://github.com/ot4562-glitch/HUFS-One-AI/pull/472) | c12028c | 6 PASS | #471 후속, MVCC exporter/새 snapshot; DB 운영 부하 미검증 |
| [#473](https://github.com/ot4562-glitch/HUFS-One-AI/pull/473) | 13d2804 | 7 PASS | DB LOCK_BUSY와 empty IDLE 구분, 운영 복구 미검증 |
| [#474](https://github.com/ot4562-glitch/HUFS-One-AI/pull/474) | ca33d65 | 8 PASS | #468 후속 HWP/HWPX NEEDS_REVIEW/SQL draft |
| [#475](https://github.com/ot4562-glitch/HUFS-One-AI/pull/475) | 4a0f906 | 6 PASS, 타인 승인 | **MERGED** main 05d78cd; 동적 API coverage UNKNOWN 유지 |
| [#476](https://github.com/ot4562-glitch/HUFS-One-AI/pull/476) | f1ff755 | 9 PASS, gate FAIL | 89파일 통합, 5,100 proof 보정; #481 선행/동료 승인 없음 |
| [#477](https://github.com/ot4562-glitch/HUFS-One-AI/pull/477) | e1135a8 | 8 PASS, gate SKIPPED | #476 후속 1회 bounded pinned Crawlee GET; 별도 승인 필요 |
| [#478](https://github.com/ot4562-glitch/HUFS-One-AI/pull/478) | cd1df17 | 7 PASS | 동일 FAQ 판본 충돌 입력순서 격리(#373); 미병합 |
| [#479](https://github.com/ot4562-glitch/HUFS-One-AI/pull/479) | 52be900 | 7 PASS, gate SKIPPED | #477 후속, 현재 rights/robots/예산 2회 preflight |
| [#480](https://github.com/ot4562-glitch/HUFS-One-AI/pull/480) | af6060a | 7 PASS | F1/MRR/Recall/span/오판율 합성 지표; 독립 Gold 미검증 |
| [#481](https://github.com/ot4562-glitch/HUFS-One-AI/pull/481) | 27782aa | 6 PASS | main용 독립 승인 평가기 부트스트랩; 본 PR 사람 승인 없음 |
| [#482](https://github.com/ot4562-glitch/HUFS-One-AI/pull/482) | f2c3805 | 7 PASS | #431 부모 branch 대상 HTML comment 수리, 부모 통합·재검증 필요 |

모든 행의 **GitHub 공식 COMMENT Review**는 실제 제출됐지만, 작성자 COMMENT는 **독립 사람 APPROVED를 대신하지 않습니다.** 기존 승인도 현재 HEAD인지 따져야 합니다. gate의 FAIL, SKIPPED, BOOTSTRAP_PENDING을 숨기거나 PASS로 바꾸지 않습니다. 확인된 CI는 합성/오프라인/일회용 PostgreSQL이며 실운영 NCP·학생자료/Gold의 통과를 뜻하지 않습니다.

### 병합 선후관계

- **#481 → #466:** #481의 독립 최신 HEAD 승인·병합으로 trusted main 검증기를 설치한 다음, #466의 BOOTSTRAP_PENDING gate를 다시 실행합니다. #466에는 현재 HEAD에 대한 동료 승인 기록이 존재합니다. GitHub 관리자의 required checks/approval/ruleset 설정은 별도 확인해야 합니다.
- **#482 → #431:** #482의 주석 속 가짜 시간표 행·학기·캠퍼스 방어 코드를 #431 부모 브랜치에 반영한 다음 부모의 새 HEAD CI/동료 승인을 받아야 합니다.
- **#465 → #471 → #472** 카탈로그 SQL/MVCC 스택과 **#468 → #474** 문서 파서 스택을 고려하고, **#476** 통합 후 중복 코드를 이중으로 병합하지 않습니다. **#476의 5,100 source-rights 증명 상한 수리**를 최종 main에서 유지합니다.
- **#476 → #477 → #479**는 Crawlee GET/운영 사전검사의 스택. #477/#479 승인 gate가 SKIPPED여도 독립 승인 완료가 아닙니다.
- #475는 이미 main 병합됐습니다. 각 후속 PR은 이후 변경된 main 대비 충돌·최신 HEAD CI·정확한 승인 기록을 다시 확인합니다.

## 2. 최초 열린 Issue 31건 — 인수·완료 기준 감사

**결론:** 31건 모두 현재 OPEN입니다. 본문에는 미완료 체크리스트가 있고, 코드 CI만으로 실자료·권리·실서버·독립 Gold를 인수한 증거가 없습니다. 기존 **본선 전 9건 완료·이관** 기록(#362/#366/#367/#375/#378/#381/#416/#430/#433)은 유지합니다.

| Issue | 담당 | 점검 결과와 OPEN 유지 이유 |
| --- | --- | --- |
| [#339](https://github.com/ot4562-glitch/HUFS-One-AI/issues/339) | 박준영·김채윤 | 활동·연례행사 실제 출처/사용권/예측 Gold·시연 미인수 |
| [#340](https://github.com/ot4562-glitch/HUFS-One-AI/issues/340) | 박준영·김채윤 | 교환 파견교/학기 공식 요강·어학/전공 예외 미인수 |
| [#341](https://github.com/ot4562-glitch/HUFS-One-AI/issues/341) | 이의상·김채윤 | FAQ #361 병합; 동료가 발견한 '못합니다/안 됩니다' 극성 반례, 실제 HCX/Gold 미인수 |
| [#343](https://github.com/ot4562-glitch/HUFS-One-AI/issues/343) | 이의상·김채윤 | 장학 코드 #420, 실제 모집판본·학생 자격/수급 권리 미인수 |
| [#344](https://github.com/ot4562-glitch/HUFS-One-AI/issues/344) | 박준영·김채윤 | 멘토 #353/#422, 공개동의·프로필/Gold·실사용 미인수 |
| [#345](https://github.com/ot4562-glitch/HUFS-One-AI/issues/345) | 이의상·김채윤 | 상담 #410, 실제 상담기관·신청 링크·권리/사용자 인수 미완 |
| [#346](https://github.com/ot4562-glitch/HUFS-One-AI/issues/346) | 이의상·김채윤 | 증빙 OCR #372, 실 CLOVA/PII·사람 Gold/학교 인정 미인수 |
| [#347](https://github.com/ot4562-glitch/HUFS-One-AI/issues/347) | 이의상·김채윤 | NCS #386/#422, 실제 승인 경험·NCS/Gold 미인수 |
| [#348](https://github.com/ot4562-glitch/HUFS-One-AI/issues/348) | 박준영·김채윤 | 검색 #417, 실 승인 원장·키셋 스택 및 UI 이슈 #418 미완 |
| [#349](https://github.com/ot4562-glitch/HUFS-One-AI/issues/349) | 박준영·김채윤 | 배지 #420/#424, 실제 발급기관 요건/증빙/검수 미인수 |
| [#350](https://github.com/ot4562-glitch/HUFS-One-AI/issues/350) | 박준영·김채윤 | 학습공동체 #353/#422, 실제 모집·정원/권리/Gold 미인수 |
| [#351](https://github.com/ot4562-glitch/HUFS-One-AI/issues/351) | 이의상·김채윤 | 취업통계 #353/#422, 표본억제·분모/재식별·권리/Gold 미인수 |
| [#352](https://github.com/ot4562-glitch/HUFS-One-AI/issues/352) | 이의상·김채윤 | 국제학생 KO/EN/ZH 번역·원문 판본·실사용 미인수 |
| [#355](https://github.com/ot4562-glitch/HUFS-One-AI/issues/355) | 이의상 | 본선 이후 역할; 원본/메타데이터 변경 금지 |
| [#356](https://github.com/ot4562-glitch/HUFS-One-AI/issues/356) | 박준영 | 본선 이후 역할; 원본/메타데이터 변경 금지 |
| [#357](https://github.com/ot4562-glitch/HUFS-One-AI/issues/357) | 이서연 | 본선 이후 역할; 원본/메타데이터 변경 금지 |
| [#358](https://github.com/ot4562-glitch/HUFS-One-AI/issues/358) | 김채윤 | 본선 이후 역할; 원본/메타데이터 변경 금지 |
| [#359](https://github.com/ot4562-glitch/HUFS-One-AI/issues/359) | 심민성 | 본선 이후 총괄/통합 역할; 원본/메타데이터 변경 금지 |
| [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360) | 김채윤 | 13개 기능 실자료/사용권/독립 Gold 및 과거 공개 CSV 5개 권리 문제 미완 |
| [#373](https://github.com/ot4562-glitch/HUFS-One-AI/issues/373) | 박준영 | 활동 #389 완료, FAQ 충돌 #478 미병합·실원장 검증 대기 |
| [#418](https://github.com/ot4562-glitch/HUFS-One-AI/issues/418) | 이서연 | 검색 409/422·429 세션 오표시, KST 표시 UX 버그 미수정 |
| [#427](https://github.com/ot4562-glitch/HUFS-One-AI/issues/427) | 이서연 | 상담 필터 바꾼 뒤 과거 async 결과가 다시 나타나는 버그 미수정 |
| [#445](https://github.com/ot4562-glitch/HUFS-One-AI/issues/445) | 심민성 | Crawlee/NCP 수집·timer/권리/원문·복원, 통합 PR/실서버 인수 미완 |
| [#446](https://github.com/ot4562-glitch/HUFS-One-AI/issues/446) | 김채윤 | NCP 실원문·Gold/독립 권리·검수 미실행 |
| [#447](https://github.com/ot4562-glitch/HUFS-One-AI/issues/447) | 심민성·김채윤 | P0 전 기능/실데이터 전환, NCP end-to-end 미인수 |
| [#449](https://github.com/ot4562-glitch/HUFS-One-AI/issues/449) | 심민성 | P1 NCP source/version/보존·백업/권한·예산 A~G NOT_DESIGNED |
| [#450](https://github.com/ot4562-glitch/HUFS-One-AI/issues/450) | 심민성 | 도구 연구 #457 문서, 팀원별 연결·A/B·보안 확인 미완 |
| [#451](https://github.com/ot4562-glitch/HUFS-One-AI/issues/451) | 이서연 | 디자인 도구 연구, 라이선스·연결/사용성 A/B 미인수 |
| [#452](https://github.com/ot4562-glitch/HUFS-One-AI/issues/452) | 박준영 | AI QA 연구, 지표 #480 PR 미병합·독립 Gold 실험 미실행 |
| [#453](https://github.com/ot4562-glitch/HUFS-One-AI/issues/453) | 이의상 | NLP/RAG 도구 연구, 실제 비교/라이선스·외부송신 검증 미실행 |
| [#454](https://github.com/ot4562-glitch/HUFS-One-AI/issues/454) | 김채윤 | 데이터 검수 도구 연구, NCP 접근·사람 검수 실험 NOT_RUN |

**새로운 GitHub issue 댓글로 추가 조치 기록:** #341, #373, #418, #427, #445, #447, #449, #450, #452, #360. 기존 #355–#359의 역할 이슈 **제목·본문·담당·라벨·상태를 수정하지 않았습니다.** 다른 이슈도 완료 근거 없이 체크박스/상태를 변경하지 않았습니다.

## 3. 본선 전 개발 종료·본선 이후 인수

1. **최종 main 검증:** 스택/충돌·권리·DB migration 검토, 변경된 실제 main SHA의 계약/타입/API/일회용 PG/Chrome/CodeQL/NCP offline/CSV 메타데이터 CI를 새로 확인. PR별 이전 결과를 병합 후 결과로 대체하지 않습니다.
2. **리뷰 보안:** 작성자가 아닌 협업자의 정확한 HEAD APPROVED, unresolved CHANGES_REQUESTED, GitHub branch protection/ruleset을 확인. 과거 COMMENT나 skipped gate는 승인으로 간주하지 않습니다.
3. **명시적 인계:** 코드 준비와 실 NCP source registry/권리·Gold/개인 Sub Account·worker/timer/백업/실인증 E2E를 분리합니다. #449의 미정 A~G 결정을 실환경 확인 없이 완료 처리하지 않습니다.
4. **열린 결함:** #341 FAQ negation, #418 카탈로그 세션/날짜 UX, #427 상담 async 경합, #373 source 판본 충돌, #431/#482 시간표 HTML comments를 후속 PR/재현 테스트로 추적합니다.
5. **자료 보호:** 실제 운영 URL 목록·학생 원본·source bytes·Gold·DB·backup·SSH/API 비밀·NCP 로그를 GitHub/CI/외부 모델에 전송하지 않습니다. 공개 저장소의 과거 CSV 5개 권리/재식별 검토는 #360에 남습니다.

**제품 개발 승인 OWNER_CONFIRMED_APPROVED ≠ 실서비스 출시 승인**입니다. RELEASE_BLOCKED를 유지하고, 공식 시연 자료/운영·인적 검증은 담당자가 독립 인수합니다.

역사적 스냅샷은 수정하지 않습니다: [2026-11-09 감사](REVIEW_AND_ISSUE_AUDIT_20261109.md), [STATUS](../STATUS.md), [PR 워크플로](PR_WORKFLOW.md), [WORKSTREAMS](WORKSTREAMS.md).
