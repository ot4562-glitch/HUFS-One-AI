# HUFS One AI — 5인 담당 범위 진척·증거 원장

> **검증 기준: 2026-11-03 KST**, GitHub `ot4562-glitch/HUFS-One-AI` `main` `5a718e9`에서 PR 병합·CI·리뷰, 현재 열린 이슈와 정해진 수락 게이트를 대조. 이 문서의 변경 자체는 **문서 전용**이며, 이번 회차에 실학생 원본·유료 NCP/CLOVA·실운영 E2E·독립 인적 평가를 실행하지 않았다. 이전 날짜별 원장은 [Git 이력](https://github.com/ot4562-glitch/HUFS-One-AI/commits/main/docs/TEAM_PROGRESS.md)에 남는다.

## 산정 기준과 현재 결과

**고정 수락 게이트별 [x] 수 ÷ 담당별 고정 분모**를 무가중·소수 첫째 자리로 표시한다. 각각 한 범위의 증거 충족률이지 **제품 완성률, 배포 준비율, 작업량·개인 성과 순위가 아니다.** 병합된 PR이 있더라도 게이트 문장의 **모든 조건**이 충족돼야 체크한다. 합성 테스트, 일회용 PostgreSQL, Chrome E2E, 실제 스크린리더, 운영 클라우드, 학교/학생 데이터의 권리 및 독립 인적 평가는 서로 다른 증거다.

| 담당 및 확정 범위 | 이전 (11/02) | 현재 (11/03) | 이번 수락 변화 |
| --- | ---: | ---: | --- |
| **심민성** — 공통 계약, 인증·인가/PG/API·Temporal RAG, 통합보안 | 7/12 · 58.3% | **7/12 · 58.3%** | 0; #137 통합·#142 유지관리 제안은 기존/별도 범위 |
| **이의상** — React UI, 접근성, 합성 시연 화면 | 6/12 · 50.0% | **9/12 · 75.0%** | **+3**: #73 심사자 초대, #74 졸업 뷰, #75 REVIEWER 격리 |
| **김채윤** — 추천·공지 순수 코어/합성 평가 | 7/12 · 58.3% | **7/12 · 58.3%** | 0; #125/#139/#140은 기존/신규 하위 기능 회귀 |
| **박준영** — 학점·RulePack·수강계획/전망 순수 코어 | 8/12 · 66.7% | **8/12 · 66.7%** | 0; #135 상한 수정은 기존 코어 보강, #138 Draft |
| **이서연** — NCP·CLOVA OCR/HCX·Laya 및 운영 계획 | 1/8 · 12.5% | **1/8 · 12.5%** | 0; 기획/안전 정책 외 실 provider·운영 승인 미검증 |

### 이번에 새롭게 수락한 UI 3항목의 직접 증거

- [#73 심사자 초대 UI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/73): 최신 HEAD `5710a91`의 비작성자 **APPROVED**, [Actions 41395322771](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41395322771) 합성/PG **2/2 SUCCESS**, `main 3205063` 병합. `ReviewerInvite.test.tsx`에서 StrictMode/unmount/getSession 지연 성공·port 교체·redeem 취소/실패, 인증/코드 1회 사용 등 검증. **시연 UI·합성 포트의 수락이며 실제 Google 인증/실초대 발급은 미검증.**
- [#74 졸업 화면](https://github.com/ot4562-glitch/HUFS-One-AI/pull/74): HEAD `4acd41d` **APPROVED**, [Actions 41395325926](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41395325926) **2/2 SUCCESS**, `main fba53ba` 병합. `graduation.test.tsx`에서 취득/수강 중/계획 학점 분리, 미검증 학업·비공유·대기 상태, **공식 졸업 판정 아님** 문구 검증.
- [#75 REVIEWER 합성 보관함·경험·설정](https://github.com/ot4562-glitch/HUFS-One-AI/pull/75): HEAD `f369f75` **APPROVED**, [Actions 41395328942](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41395328942) **2/2 SUCCESS**, `main 1cbd771` 병합. `sandbox.test.tsx`에서 대상 전환 시 미저장 지원서 초안·경험·관심 설정 소거, 같은 context의 snapshot 교체 후 이전 기록 비노출, 늦은 저장 결과 격리를 확인.

**부분 진행이지만 이번에 추가로 [x]로 바꾸지 않은 항목:** [#76](https://github.com/ot4562-glitch/HUFS-One-AI/pull/76)은 `main 028f88d` 병합·HEAD 비작성자 APPROVED/합성·PG 2/2 성공. [#126](https://github.com/ot4562-glitch/HUFS-One-AI/issues/126)에서 확인된 [main Chrome Actions 41463272343](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41463272343)은 UI **14/14**·독립 합성 계정 **9/9** 성공. 현재 `apps/web/e2e/ui.spec.ts`는 320/360/390/768/1440px 오버플로, 390px 키보드 포커스와 접근성 이름 일부를 검사하지만 **실제 스크린리더 수락 결과가 없다**. 따라서 원래 **E2E + 360px + 키보드/스크린리더** 복합 게이트는 [ ] 유지.

## 고정 수락 게이트 원장 — 완료 체크는 원래 범위만

### 심민성 `ot4562-glitch` — 7/12 (58.3%)

- [x] 공통 TypeScript/Zod 계약·합성 fixture·소비자 검사 main 통합 ([#8](https://github.com/ot4562-glitch/HUFS-One-AI/issues/8), [PR #36](https://github.com/ot4562-glitch/HUFS-One-AI/pull/36), [#83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83)).
- [x] BETA/REVIEWER·invite/세션/CSRF/철회 **코드·합성/일회용 PG** ([#83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83), [#105](https://github.com/ot4562-glitch/HUFS-One-AI/pull/105), [#110](https://github.com/ot4562-glitch/HUFS-One-AI/pull/110)).
- [x] SharingGrant/owner overlay·CAS·저장 권한 철회/삭제 서버·DB 경계 ([#83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83), [#102](https://github.com/ot4562-glitch/HUFS-One-AI/pull/102), [#112](https://github.com/ot4562-glitch/HUFS-One-AI/pull/112)).
- [x] SourceRevision·Temporal RAG·승인 인용·원본 무결성·수집 동시성 보호 코드 ([#83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83), [#99](https://github.com/ot4562-glitch/HUFS-One-AI/pull/99), [#113](https://github.com/ot4562-glitch/HUFS-One-AI/pull/113)).
- [x] 캘린더 GET/브라우저 클라이언트/지연 응답 격리 **API 부분** ([#58](https://github.com/ot4562-glitch/HUFS-One-AI/pull/58), [#77](https://github.com/ot4562-glitch/HUFS-One-AI/pull/77), [#95](https://github.com/ot4562-glitch/HUFS-One-AI/pull/95)).
- [x] BOOKMARK stage·인가된 owner API, read-only 학업/What-if **DTO 안전 게이트** ([#97](https://github.com/ot4562-glitch/HUFS-One-AI/pull/97), [#103](https://github.com/ot4562-glitch/HUFS-One-AI/pull/103), [#107](https://github.com/ot4562-glitch/HUFS-One-AI/pull/107), [#137](https://github.com/ot4562-glitch/HUFS-One-AI/pull/137)). 실 What-if 계산/학교 승인 아님.
- [x] 합성·일회용 PostgreSQL CI/오프라인 릴리스·개인정보 산출물 차단 코드 ([#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89), [#92](https://github.com/ot4562-glitch/HUFS-One-AI/pull/92), [#104](https://github.com/ot4562-glitch/HUFS-One-AI/pull/104), [#108](https://github.com/ot4562-glitch/HUFS-One-AI/pull/108)).
- [ ] 실 Google OIDC/JWKS·학교 이메일 소유확인/OTP 발송·실 초대/로그인 종단 브라우저 ([#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27), [#25](https://github.com/ot4562-glitch/HUFS-One-AI/issues/25)).
- [ ] 운영 PG·HTTPS/TLS/직접 IP·CDN·preview 차단·NCP 별도 보안 실증 ([#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27), [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89)).
- [ ] Private Git 원본의 최초 게시·접근 범위/이력·개별 권리 검토 및 전체 개인정보 검사 통과 ([#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46)).
- [ ] 실제 UI·학업 provider·지원 흐름의 **운영/실자료 종단** ([#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), [#80](https://github.com/ot4562-glitch/HUFS-One-AI/issues/80), [#81](https://github.com/ot4562-glitch/HUFS-One-AI/issues/81), [#82](https://github.com/ot4562-glitch/HUFS-One-AI/issues/82)). #72~#76 **합성 UI 병합은 완료**, 실 provider는 아님.
- [ ] 사람 독립 gold 200건·실출처 추천 정확도/운영 성능 검수 ([#61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61), [#21](https://github.com/ot4562-glitch/HUFS-One-AI/issues/21)).

### 이의상 `uisang2004-maker` — 9/12 (75.0%)

- [x] 5개 시연 슬롯·요청 epoch·대상별 가드 ([#28](https://github.com/ot4562-glitch/HUFS-One-AI/pull/28)).
- [x] HUFS 디자인 토큰/대비·달력 2주 순수 화면 모델 ([#64](https://github.com/ot4562-glitch/HUFS-One-AI/pull/64)).
- [x] React/Vite·TSX·jsdom 기본 도구/설정 ([#66](https://github.com/ot4562-glitch/HUFS-One-AI/pull/66)).
- [x] React 셸/탭/대상 선택기·상태 안내 ([#68](https://github.com/ot4562-glitch/HUFS-One-AI/pull/68)).
- [x] 오늘/기회/공지 카드·목록·상세 합성 화면 ([#69](https://github.com/ot4562-glitch/HUFS-One-AI/pull/69)).
- [x] 달력 DOM·비합성 `loadCalendar` 포트·동일-context snapshot 즉시 소거 ([#72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72), [#51](https://github.com/ot4562-glitch/HUFS-One-AI/issues/51)). 실 Google 운영과 별개.
- [x] REVIEWER 초대 등록 **UI**, 늦은 getSession/redeem·unmount/StrictMode cleanup 합성 회귀 ([#73](https://github.com/ot4562-glitch/HUFS-One-AI/pull/73), 위 승인/CI).
- [x] 학점/확인 필요·과거 개설 전망의 졸업 안내 UI, 비공식 판정/비공유 구별 ([#74](https://github.com/ot4562-glitch/HUFS-One-AI/pull/74), 위 승인/CI).
- [x] REVIEWER 합성 보관함·경험·설정/모의지원 UI, 대상 변경/스냅샷·미저장 초안 격리 ([#75](https://github.com/ot4562-glitch/HUFS-One-AI/pull/75), 위 승인/CI).
- [ ] **Playwright 브라우저 E2E + 360px + 키보드/실제 스크린리더**를 모두 독립 수락: [#76](https://github.com/ot4562-glitch/HUFS-One-AI/pull/76)·[#126](https://github.com/ot4562-glitch/HUFS-One-AI/issues/126)의 합성 Chrome/viewport/키보드/접근성 이름 테스트는 완료, **실 AT 수락 증거 미확인**.
- [ ] D-day·지원 보드·계획 나란히/What-if **UI 전체 묶음**: [#127](https://github.com/ot4562-glitch/HUFS-One-AI/pull/127) D-day와 [#128](https://github.com/ot4562-glitch/HUFS-One-AI/pull/128) 지원 보드는 main, [#81](https://github.com/ot4562-glitch/HUFS-One-AI/issues/81) 계획 나란히와 [#82](https://github.com/ot4562-glitch/HUFS-One-AI/issues/82) What-if 실제 UI 수락 미완료. **부분 점수 0**.
- [ ] 실 Google/HTTPS·권한 철회·다중 탭·스크린리더/실기기·운영 종단 검수 ([#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), [#25](https://github.com/ot4562-glitch/HUFS-One-AI/issues/25), [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89)).

### 김채윤 `qamarrchae` — 7/12 (58.3%)

- [x] 결정론 개인별 추천·큰 카드/일반 피드 구성 ([#15](https://github.com/ot4562-glitch/HUFS-One-AI/pull/15)).
- [x] 학생 중요공지·기한/마감·고정 알림 순수 코어 ([#16](https://github.com/ot4562-glitch/HUFS-One-AI/pull/16)).
- [x] 시점·출처 revision/claim·캐시 분리와 권한 정책 버전 ([#40](https://github.com/ot4562-glitch/HUFS-One-AI/pull/40), [#118](https://github.com/ot4562-glitch/HUFS-One-AI/pull/118), [#140](https://github.com/ot4562-glitch/HUFS-One-AI/pull/140) 합성 판본 회귀).
- [x] 추천 이유/관련도·토픽 다양성 코어 ([#41](https://github.com/ot4562-glitch/HUFS-One-AI/pull/41), [#117](https://github.com/ot4562-glitch/HUFS-One-AI/pull/117) 제외 이유 후속).
- [x] 미공유 학업·경험 정보 scope 격리 ([#49](https://github.com/ot4562-glitch/HUFS-One-AI/pull/49)).
- [x] 확인된 마감·시험/행사·미정 일정의 캘린더 계산 ([#50](https://github.com/ot4562-glitch/HUFS-One-AI/pull/50)).
- [x] 합성 코퍼스 40 공고×5 프로필/200개 **초안** 및 P@k·nDCG 재현 평가 도구 ([#48](https://github.com/ot4562-glitch/HUFS-One-AI/pull/48), [#60](https://github.com/ot4562-glitch/HUFS-One-AI/pull/60), [#67](https://github.com/ot4562-glitch/HUFS-One-AI/pull/67)).
- [ ] 독립 사람이 검수한 정답 gold 200/200와 조건 일치 검증 ([#61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61)): **확인된 0/200**.
- [ ] 실 HUFSAbility/기관 공고의 이용권·원문/정정·마감/지원 자격 검수 ([#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10), [#19](https://github.com/ot4562-glitch/HUFS-One-AI/issues/19)).
- [ ] 실출처 개인화 품질/편향·Recall/latency의 독립 재현 ([#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10), [#21](https://github.com/ot4562-glitch/HUFS-One-AI/issues/21)).
- [ ] 실권한 피드/캘린더 UI와 운영 권한·브라우저 종단 검수; 합성 UI/테스트 병합은 별개 ([#51](https://github.com/ot4562-glitch/HUFS-One-AI/issues/51), [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89)).
- [ ] rank-v1.1 기본 채택을 위한 독립 A15/사용자 검증·정책 승인 ([#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10), [#61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61)).

### 박준영 `taewangim-alt` — 8/12 (66.7%)

- [x] 취득·수강 중·계획 세 원장/재수강·학점 순수 코어 ([#56](https://github.com/ot4562-glitch/HUFS-One-AI/pull/56)).
- [x] 과거 개설 패턴/불확실성·시점 전망 코어 ([#57](https://github.com/ot4562-glitch/HUFS-One-AI/pull/57)).
- [x] 한 학기 계획의 상한·선수·분반 시간 중복 검사 코어 ([#62](https://github.com/ot4562-glitch/HUFS-One-AI/pull/62), [#135](https://github.com/ot4562-glitch/HUFS-One-AI/pull/135) 60과목 제한 수정).
- [x] RulePack 효력·asOf/후보 거부·활성화 보호 ([#70](https://github.com/ot4562-glitch/HUFS-One-AI/pull/70)).
- [x] 학업 미충족 요건→중요공지 입력 계약 ([#84](https://github.com/ot4562-glitch/HUFS-One-AI/pull/84)).
- [x] old/new RulePack 개정 diff **합성 코어** ([#90](https://github.com/ot4562-glitch/HUFS-One-AI/pull/90)).
- [x] 수강계획 충돌·검토 보류/안전 계산 ([#91](https://github.com/ot4562-glitch/HUFS-One-AI/pull/91)).
- [x] owner 계획 응답 strict 버전/caveat 정합·독립 리뷰/CI ([#116](https://github.com/ot4562-glitch/HUFS-One-AI/pull/116)).
- [ ] 실제 학번·전공·이중전공·중복인정 학칙 원문을 독립 승인한 공식 RulePack ([#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11), [#87](https://github.com/ot4562-glitch/HUFS-One-AI/issues/87)).
- [ ] 권리 있는 학생 수강원장/입학년도·개인별 결과의 독립 손계산·동의 ([#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11), [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46)).
- [ ] 승인된 학업 provider→owner `/api/study-plans/check` 실제 연결·UI #81 종단 검증 ([#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27), [#81](https://github.com/ot4562-glitch/HUFS-One-AI/issues/81)). #137 승인 전 자료 gate만 운영.
- [ ] 타 전공을 가정한 What-if 실제 계산 엔진·공식 학칙 근거·UI 소비 ([#82](https://github.com/ot4562-glitch/HUFS-One-AI/issues/82)). #107 DTO-only. [#138](https://github.com/ot4562-glitch/HUFS-One-AI/pull/138) 저장 시간표 변환기는 **DRAFT·CHANGES_REQUESTED**, 고유 완료 증거 아님.

### 이서연 `lhh42001` — 1/8 (12.5%)

- [x] 조건부 NCP 비용·운영 아키텍처, Laya worker 기본 OFF·CPU/메모리 안전 정책 **문서 단계** ([#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22), [NCP 운영](NCP_OPERATIONS_2026.md)).
- [ ] General OCR 실제 provider adapter 또는 승인된 독립 fake-provider 계약 시험 ([#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20)).
- [ ] HCX-005 Vision bbox·이미지 원문/인용과 포스터 20개 독립 수락 ([#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20), [#23](https://github.com/ot4562-glitch/HUFS-One-AI/issues/23)).
- [ ] HCX-007 provider/요금·한도/안전 fallback 확인 ([#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88)).
- [ ] Laya CPU·ONNX 격리 worker, 실부하·OOM/복구 실험 ([#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22), [#88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88)).
- [ ] 429/503/지연·예산/철회/시점 경계 offline provider chaos 검증 ([#88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88)).
- [ ] NCP 권한/크레딧/라이선스·실네트워크/TLS/IAM·배포/롤백 승인 ([#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89)).
- [ ] 클라우드 p95/RSS·사용비용/중지·실자료/모델 외부전송의 인적·권리 승인 ([#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22), [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46)).

## 고정 분모 밖 새 구현의 인정 범위

| 병합 증거 | 인정된 범위 | 왜 담당 퍼센트를 늘리지 않았는가 |
| --- | --- | --- |
| UI [#127](https://github.com/ot4562-glitch/HUFS-One-AI/pull/127) `1c88b43`, [#128](https://github.com/ot4562-glitch/HUFS-One-AI/pull/128) `54a9176` | 확정 마감 D-day·본인 기록용 지원 보드/360px 합성 시연 | 고정 UI 게이트는 #81 계획 나란히 및 #82 What-if까지 요구 |
| UI [#129](https://github.com/ot4562-glitch/HUFS-One-AI/pull/129) `45ced48`, [#130](https://github.com/ot4562-glitch/HUFS-One-AI/pull/130) `5bf72fa` | HUFSAbility 공개 5분류/24기능+비로그인 4영역 메뉴 셸·🚫 비지원, 가상 동아리 목록/상세·합성 수작업 SVG 포스터 | [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124)의 관찰 11그룹·76화면 전체 대응/중앙 manifest·[#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141) 원본보다 나은 독립 디자인 미완료. AI 생성 포스터·실관리자 승인 아님 |
| 추천 [#125](https://github.com/ot4562-glitch/HUFS-One-AI/pull/125) `8f76c38`, [#139](https://github.com/ot4562-glitch/HUFS-One-AI/pull/139) `26c559e`, [#140](https://github.com/ot4562-glitch/HUFS-One-AI/pull/140) `41de619` | 승인 시점에 따른 가상 동아리 추천 코어, 합성 개인화 재계산·공고 정정 판본 회귀 **테스트-only** | 기존 추천·시점/캐시/평가의 합성 근거를 보강. 인적 평가·실기관 권리·운영 검증 새 수락은 아님 |
| 통합 [#137](https://github.com/ot4562-glitch/HUFS-One-AI/pull/137) `f593b61` | 빈 독립 합성 계정 및 본인 승인 자료/수강계획 API 경계·capability manifest **코드** | 실 4인 로그인/검수된 공식 RulePack·배포를 뜻하지 않음. 기존 owner 부분 게이트 보강 |
| 유지관리 [#142](https://github.com/ot4562-glitch/HUFS-One-AI/pull/142) OPEN | 브랜치 정리 dry-run 도구 + Node 안전 테스트 4/4. HEAD `53039bd`의 synthetic/PG/Chrome CI 3/3 SUCCESS, **비작성자 리뷰 0건/미병합** | 운영 유지관리 별도 과제이며 제품 기능 게이트 아님. 실제 원격 브랜치 삭제 0건 |

## 공통 차단 및 기록 주의

- **개인정보:** [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46)에서 마지막 보고된 Private Git 보호 경계 **178/180 PASS · 2 FAIL**, 파일 6건 최초 게시/공유 이력·자료 이용권 검증 미완료. 이 회차 **재실행하지 않음**. 별도 목적별 응답 4/4 확인을 Git 게시/팀 공유·실서비스 승인으로 확대하지 않음.
- **추천:** [#61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61)의 200개 합성 **초안/자체 검토 라벨**은 독립 인적 gold **확인된 0/200**과 구분. 실기관 자료 이용권·정확도·모델 운영 성능 없음.
- **출시:** [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) `RELEASE_BLOCKED`; 실제 Google/학교메일·TLS/CDN/직접 IP·운영 DB/NCP·기관 원본·학생 권리·실기기 QA 미완료. 기본 브랜치 보호도 미설정 관찰(11/03).
- **과제/시연:** [#131](https://github.com/ot4562-glitch/HUFS-One-AI/pull/131) CHANGES_REQUESTED, [#134](https://github.com/ot4562-glitch/HUFS-One-AI/pull/134) #131 스택, [#138](https://github.com/ot4562-glitch/HUFS-One-AI/pull/138) DRAFT/CHANGES_REQUESTED는 모두 미병합. 기존 기능/새 디자인 이슈 [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124)/[#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141)은 여전히 OPEN.
- **확인 기준:** GitHub 실제 PR `merged`/HEAD `APPROVED`/Actions job, [STATUS](../STATUS.md), [WORKSTREAMS](WORKSTREAMS.md), 관련 UI·계약 테스트·이슈 원문. CI와 문서만으로 완성률/데모 상용성/실사용 승인을 과장하지 않는다. 새로운 증거가 나오면 고정 수락 항목의 전 조건 충족 여부를 검토한 뒤 **같은 분모**로 재계산한다.
