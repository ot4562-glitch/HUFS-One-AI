# HUFS One AI — 5인 담당 범위 진척·증거 원장

> **검증 기준: 2026-11-03 KST**, GitHub `ot4562-glitch/HUFS-One-AI` `main`의 최신 확인 PR 병합·CI·리뷰, 현재 열린 이슈와 정해진 수락 게이트를 대조. 이 문서의 변경 자체는 **문서 전용**이며, 이번 회차에 실학생 원본·유료 NCP/CLOVA·실운영 E2E·독립 인적 평가를 실행하지 않았다. 이전 날짜별 원장은 [Git 이력](https://github.com/ot4562-glitch/HUFS-One-AI/commits/main/docs/TEAM_PROGRESS.md)에 남는다.

## 2026-11-03 추가 PR/이슈 인수 — 고정 게이트 수락률 그대로

- [x] [#153 UI 중앙 HUFSAbility 매니페스트](https://github.com/ot4562-glitch/HUFS-One-AI/pull/153) HEAD `959dc302`: **심민성 비작성자 APPROVED**, 합성·일회용 PostgreSQL·Chrome CI **3/3 SUCCESS**, main squash **`9b5cb81a` 병합**. [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124)/[#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141) 메뉴 정본화 하위만 [x]; **아틀라스 6개 누락 영역/실기기·서비스 전체 게이트는 [ ]**.
- [ ] 이의상 [#151 정정 비교](https://github.com/ot4562-glitch/HUFS-One-AI/pull/151), [#154 수강계획](https://github.com/ot4562-glitch/HUFS-One-AI/pull/154), [#155 What-if](https://github.com/ot4562-glitch/HUFS-One-AI/pull/155): 원래 HEAD CI 3/3 SUCCESS + 코드 COMMENT 리뷰, #153 이후 **mergeable=dirty**. 작성자 기존 브랜치 보존·최신 main 재기반/공유 `App/main/graduationPage/e2e/styles` 통합·새 HEAD CI/재리뷰 전 미병합.
- [ ] 이의상 [#152 이중전공](https://github.com/ot4562-glitch/HUFS-One-AI/pull/152): **REQUEST_CHANGES/P2**, 잘못된 `overlap.rowImpacts` 원소 입력을 strict 검증하지 않아 null 시 런타임 예외 가능. 부정 입력 회귀/통합 리베이스 후 새 HEAD 재검토.
- [ ] 심민성 [#150](https://github.com/ot4562-glitch/HUFS-One-AI/pull/150): **83파일/+6757줄 Draft 충돌**, 선행 #145/#148/#131 중복+권한/SQL/worker/배포 분리, 독립 리뷰/CI 필요. [#156](https://github.com/ot4562-glitch/HUFS-One-AI/pull/156): **Ready for review·미병합**, 최신 HEAD `dc350532` 합성/일회용 PG/Chrome CI **3/3 SUCCESS**·비작성자 승인 대기; Ubuntu/Windows 실환경·NCP 유료 서버 테스트 **NOT_RUN**, 비작성자 승인 0.
- [x] **심민성 #157 Provider 입력 권한 하위 코드**: [#157](https://github.com/ot4562-glitch/HUFS-One-AI/pull/157) HEAD `93817f24` 김채윤 **비작성자 독립 APPROVED** + 계약/일회용 PG/Chrome **3/3 SUCCESS** 뒤 main squash `7ac5a06c` **MERGED**. 현재 세션/동의/SourceRevision/asOf 승인 입력 하위만 완료, 실제 Google·자료권리/paid provider·운영 AI 종단·#27 및 고정 수락 게이트 **여전히 [ ]**, 수락률 변경 0.
- [ ] **심민성 #150 분리 잔여:** #157와 [#159](https://github.com/ot4562-glitch/HUFS-One-AI/pull/159)는 독립 승인·CI 3/3 후 main `7ac5a06c`·`638ed77a` 병합. #158 HEAD `fb135017`·#161 HEAD `a7ea62a`는 비강제 재정렬 후 CI 3/3 PASS, **현재 HEAD 독립 승인 대기**. 잔여 PR: [#158](https://github.com/ot4562-glitch/HUFS-One-AI/pull/158) SETTLED 결과, [#159](https://github.com/ot4562-glitch/HUFS-One-AI/pull/159)/[#161](https://github.com/ot4562-glitch/HUFS-One-AI/pull/161) Laya, [#160](https://github.com/ot4562-glitch/HUFS-One-AI/pull/160)/[#165](https://github.com/ot4562-glitch/HUFS-One-AI/pull/165)/[#167](https://github.com/ot4562-glitch/HUFS-One-AI/pull/167) raster·provider·HTTP, [#162](https://github.com/ot4562-glitch/HUFS-One-AI/pull/162)/[#163](https://github.com/ot4562-glitch/HUFS-One-AI/pull/163)/[#164](https://github.com/ot4562-glitch/HUFS-One-AI/pull/164) Owner, [#166](https://github.com/ot4562-glitch/HUFS-One-AI/pull/166) private 배포 Draft. **각 최신 HEAD 합성/PG/Chrome 3/3 PASS, 실 ONNX Linux cgroup·실 Provider/NCP/학생 권리 종단 NOT_RUN**, 독립 코드 승인·선행 병합 전에는 새 [x]/수락 분자 증가 0.
- [ ] **사람/외부 선행:** [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46) 보호 추적 원본 6경로·과거 전체 검사 2 FAIL(목적별 4/4 확인을 Git 최초 게시·협업 접근권 승인으로 확대 금지), [#61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61) 독립 gold **0/200**, [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27) 운영 OIDC·학교메일/OTP·PG/RLS·CSRF·권한 철회 및 [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) 실제 TLS/direct IP/Global Edge·브라우저/배포 실증. **RELEASE_BLOCKED**.
- **고정 증거 수락률 유지:** 심민성 **7/12 (58.3%)** / 이의상 **9/12 (75.0%)** / 김채윤 **7/12 (58.3%)** / 박준영 **8/12 (66.7%)** / 이서연 NCP 운영 **1/5 (20.0%)**. 현재 이슈 **OPEN 34 / CLOSED 7**, 부분 구현 [x]는 전체 제품 완성률의 증거가 아니다.

## 산정 기준과 현재 결과

**수락 게이트별 [x] 수 ÷ 각 담당 스코프의 명시된 분모**를 무가중·소수 첫째 자리로 표시한다. **심민성·이의상·김채윤·박준영의 기존 12칸 분모는 유지**하고, 이서연은 2026-11-03 사용자 지시에 따라 **NCP 비코드 운영 5개 항목으로 새 기준선(1/5)을 설정**한다. 따라서 이서연의 옛 1/8과 새 1/5는 동일한 목표의 퍼센트 증가가 아니다. 각각 한 범위의 증거 충족률이지 **제품 완성률, 배포 준비율, 작업량·개인 성과 순위가 아니다.** 병합된 PR이 있더라도 게이트 문장의 **모든 조건**이 충족돼야 체크한다. 합성 테스트, 일회용 PostgreSQL, Chrome E2E, 실제 스크린리더, 운영 클라우드, 학교/학생 데이터의 권리 및 독립 인적 평가는 서로 다른 증거다.

| 담당 및 확정 범위 | 이전 (11/02) | 현재 (11/03) | 이번 수락 변화 |
| --- | ---: | ---: | --- |
| **심민성** — 기존 API/보안·Temporal RAG + 신규 NCP/AI **전체 코드** | 7/12 · 58.3% | **기존 7/12 · 58.3%** | 0; #145 offline wire·#148 비용 원장 main 하위 코드 수락, #150 provider/Laya 통합은 Draft. 실운영·자료/인적 5개 복합 게이트는 미충족 |
| **이의상** — React UI, 접근성, 합성 시연 화면 | 6/12 · 50.0% | **9/12 · 75.0%** | **+3**: #73 심사자 초대, #74 졸업 뷰, #75 REVIEWER 격리 |
| **김채윤** — 추천·공지 순수 코어/합성 평가 | 7/12 · 58.3% | **7/12 · 58.3%** | 0; #125/#139/#140은 기존/신규 하위 기능 회귀 |
| **박준영** — 학점·RulePack·수강계획/전망 순수 코어 | 8/12 · 66.7% | **8/12 · 66.7%** | 0; #138 HTML·#147 이중전공 pure core·#149 CSV/handoff **P2 수정/독립 승인 후 main**. 공식 RulePack/실수강·학교 저장본별 권리/실 E2E는 미충족 |
| **이서연** — **NCP 계정·크레딧·운영·실측만(코드 0건)** | 종전 혼합 1/8 · 12.5% | **운영 전용 1/5 · 20.0%** | 사용자 지시로 SDK·bbox·worker·CI·IaC 코딩 5개 항목 제외, **분모 재정의(이전 값과 직접 비교 불가)** |

### 왜 심민성·김채윤은 코드 병합이 많은데 58.3%인가?

2026-11-03 GitHub PR **전체 기록(문서 PR 포함)** 기준으로 심민성 `ot4562-glitch` **57건 작성·46건 병합**, 김채윤 `qamarrchae` **16건 작성·16건 병합**이 확인됐다. 이는 실제 활동의 출처이지만 **병합 건수는 코드량·완성률·기여도 점수 자체가 아니다.** 각자의 기존 12칸 중 **7개 기술 구현·합성 게이트는 통과했고 나머지 5칸은 성격이 다르다.**

| 담당 | 남은 5개 수락 조건을 가로막는 실제 의존성 | 완화·해결 소유/선행 |
| --- | --- | --- |
| **심민성** | ① 실 Google OIDC/JWKS·외대메일·REVIEWER 초대 종단 ② 운영 PG·TLS·NCP 직접IP/preview 보안 ③ Private Git 원본·동의/이력과 privacy **2 FAIL** ④ UI·학업 provider 실제 종단 ⑤ 독립 골드/실출처 추천 검수 | ① owner/실 메일 권한 ② **이서연 NCP 운영 #12/#22** + 심민성 배포/보안 코드 ③ [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46) 권리·감사 ④ UI/학업 담당과 통합 ⑤ [#61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61) 독립 검토/자료권리 |
| **김채윤** | ① 독립 사람 gold 200/200 (**확인된 0/200**) ② 기관 공고 원본 권리·정정/자격 검수 ③ 실출처 품질·편향·Recall/latency 독립 평가 ④ 실권한 UI/캘린더 종단 ⑤ rank-v1.1 기본 정책 채택/인적 검증 | ① **독립 검토자/owner** #61(김채윤 자체검수 200은 gold와 별개) ② 심민성 source rights #19/#46 ③ 승인 데이터·평가 설계 ④ 이의상 UI·심민성 API ⑤ 최종 제품정책 승인 |

즉 **58.3% = 전체 코드가 58.3% 완성되었다는 뜻이 아니다.** 출시/실데이터·인적 검증을 억지로 [x]로 바꾸지 않고 **개발 구현 증거와 외부/통합 차단 목록을 병렬 관리**한다. 또한 2026-11-03 **NCP SDK/worker/chaos 코딩을 심민성에게 신규 할당**([#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20)/[#88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88)/[#143](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143))했지만 기존 고정 12칸의 분모에 가산하거나 아직 미작성인 코드를 완료로 처리하지 않는다.

### 이번에 새롭게 수락한 UI 3항목의 직접 증거

- [#73 심사자 초대 UI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/73): 최신 HEAD `5710a91`의 비작성자 **APPROVED**, [Actions 41395322771](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41395322771) 합성/PG **2/2 SUCCESS**, `main 3205063` 병합. `ReviewerInvite.test.tsx`에서 StrictMode/unmount/getSession 지연 성공·port 교체·redeem 취소/실패, 인증/코드 1회 사용 등 검증. **시연 UI·합성 포트의 수락이며 실제 Google 인증/실초대 발급은 미검증.**
- [#74 졸업 화면](https://github.com/ot4562-glitch/HUFS-One-AI/pull/74): HEAD `4acd41d` **APPROVED**, [Actions 41395325926](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41395325926) **2/2 SUCCESS**, `main fba53ba` 병합. `graduation.test.tsx`에서 취득/수강 중/계획 학점 분리, 미검증 학업·비공유·대기 상태, **공식 졸업 판정 아님** 문구 검증.
- [#75 REVIEWER 합성 보관함·경험·설정](https://github.com/ot4562-glitch/HUFS-One-AI/pull/75): HEAD `f369f75` **APPROVED**, [Actions 41395328942](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41395328942) **2/2 SUCCESS**, `main 1cbd771` 병합. `sandbox.test.tsx`에서 대상 전환 시 미저장 지원서 초안·경험·관심 설정 소거, 같은 context의 snapshot 교체 후 이전 기록 비노출, 늦은 저장 결과 격리를 확인.

**부분 진행이지만 이번에 추가로 [x]로 바꾸지 않은 항목:** [#76](https://github.com/ot4562-glitch/HUFS-One-AI/pull/76)은 `main 028f88d` 병합·HEAD 비작성자 APPROVED/합성·PG 2/2 성공. [#126](https://github.com/ot4562-glitch/HUFS-One-AI/issues/126)에서 확인된 [main Chrome Actions 41463272343](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41463272343)은 UI **14/14**·독립 합성 계정 **9/9** 성공. 현재 `apps/web/e2e/ui.spec.ts`는 320/360/390/768/1440px 오버플로, 390px 키보드 포커스와 접근성 이름 일부를 검사하지만 **실제 스크린리더 수락 결과가 없다**. 따라서 원래 **E2E + 360px + 키보드/스크린리더** 복합 게이트는 [ ] 유지.

## 수락 게이트 원장 — 4인 개발 고정 범위 + 이서연 NCP 운영 신기준

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
- [ ] 타 전공을 가정한 What-if 실제 계산 엔진·공식 학칙 근거·UI 소비 ([#82](https://github.com/ot4562-glitch/HUFS-One-AI/issues/82)). #107 DTO-only. [#138](https://github.com/ot4562-glitch/HUFS-One-AI/pull/138) 저장 시간표 변환기는 **최신 HEAD `44afcf6`의 결함 수정·독립 APPROVED·합성/PG/Chrome 3/3 SUCCESS 후 main `605144c` 병합**. 저장 HTML의 로컬 변환 하위 기능만 수락하며 실제 학교 원본 권리·실 4인 수강원장/RulePack·졸업 UI는 미완료. [#144](https://github.com/ot4562-glitch/HUFS-One-AI/issues/144) 현재 이중전공 졸업요건 표시도 별도 OPEN.

### 이서연 `lhh42001` — **NCP 운영 전용 1/5 (20.0%)**, 2026-11-03 새 기준선

> **역할 기준 변경:** 이전 8개 항목에는 General OCR/HCX SDK, bbox, Laya ONNX worker, offline chaos 등 **개발 코드 업무**가 혼합되어 있었다. 모두 **심민성** [#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20)·[#88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88)·[#143](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143)로 이전. 이서연에게 코드/스크립트/CI/IaC 개발 **0건** 배정. 옛 1/8(12.5%)은 역사적 수치일 뿐 지금의 1/5와 직접 비교 금지.

- [x] 조건부 High Memory-g3·NCP 크레딧/시간요금·서버/서비스 비용 상한, Laya 기본 OFF·CPU 보호의 **운영 계획 문서화** ([#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22), [NCP 운영](NCP_OPERATIONS_2026.md)). 실 콘솔/과금 승인 아님.
- [ ] **NCP 계정/리전/SKU/크레딧·요금/과금 기간·서비스 구독 승인**의 실제 콘솔/계약 영수증 확인 ([#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12)).
- [ ] 사용자 승인 후 NCP **VPC/스토리지/ACL/TLS/DNS/비밀키/IAM·백업/복원·직접 IP/preview** 운영환경 보안 확인. 설정 스크립트/자동화·코드 작성은 심민성 ([#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89)).
- [ ] **General OCR·HCX-005/007 서비스 이용권·endpoint·quota·실 과금·키 권한/운영 하드 한도** 확인/비코드 영수증. SDK/retry/비용 차단 구현은 심민성 ([#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20)).
- [ ] 승인된 **NCP 실제 호스트**의 CPU/RSS/p95/비용·중단/복원/반납/청구 종료 영수증 확보. Laya worker·systemd·측정 스크립트 개발은 심민성 ([#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22), [#143](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143)). 실제 NCP 미개통 상태를 PASS로 보지 않음.

**NCP 운영 증거 수락 1/5 = 20.0%.** 개인 기여·능력·개발 완성률의 점수가 아니다.

## 고정 분모 밖 새 구현의 인정 범위

| 병합 증거 | 인정된 범위 | 왜 담당 퍼센트를 늘리지 않았는가 |
| --- | --- | --- |
| UI [#127](https://github.com/ot4562-glitch/HUFS-One-AI/pull/127) `1c88b43`, [#128](https://github.com/ot4562-glitch/HUFS-One-AI/pull/128) `54a9176` | 확정 마감 D-day·본인 기록용 지원 보드/360px 합성 시연 | 고정 UI 게이트는 #81 계획 나란히 및 #82 What-if까지 요구 |
| UI [#129](https://github.com/ot4562-glitch/HUFS-One-AI/pull/129) `45ced48`, [#130](https://github.com/ot4562-glitch/HUFS-One-AI/pull/130) `5bf72fa` | HUFSAbility 공개 5분류/24기능+비로그인 4영역 메뉴 셸·🚫 비지원, 가상 동아리 목록/상세·합성 수작업 SVG 포스터 | [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124)의 관찰 11그룹·76화면 전체 대응/중앙 manifest·[#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141) 원본보다 나은 독립 디자인 미완료. AI 생성 포스터·실관리자 승인 아님 |
| 추천 [#125](https://github.com/ot4562-glitch/HUFS-One-AI/pull/125) `8f76c38`, [#139](https://github.com/ot4562-glitch/HUFS-One-AI/pull/139) `26c559e`, [#140](https://github.com/ot4562-glitch/HUFS-One-AI/pull/140) `41de619` | 승인 시점에 따른 가상 동아리 추천 코어, 합성 개인화 재계산·공고 정정 판본 회귀 **테스트-only** | 기존 추천·시점/캐시/평가의 합성 근거를 보강. 인적 평가·실기관 권리·운영 검증 새 수락은 아님 |
| 통합 [#137](https://github.com/ot4562-glitch/HUFS-One-AI/pull/137) `f593b61` | 빈 독립 합성 계정 및 본인 승인 자료/수강계획 API 경계·capability manifest **코드** | 실 4인 로그인/검수된 공식 RulePack·배포를 뜻하지 않음. 기존 owner 부분 게이트 보강 |
| 유지관리 [#142](https://github.com/ot4562-glitch/HUFS-One-AI/pull/142) MERGED | 브랜치 정리 dry-run 도구 + Node 안전 테스트 4/4. HEAD `53039bd`의 synthetic/PG/Chrome CI 3/3 SUCCESS, **김채윤 비작성자 APPROVED 후 main `719c576` 병합** | 운영 유지관리 별도 과제이며 제품 기능 게이트 아님. 실제 원격 브랜치 삭제 0건 |

## 2026-11-03 NCP 코드/운영 인계

- **심민성 단독 개발:** [#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20) OCR/HCX Vision provider SDK·bbox·근거/비용/권리, [#88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88) fake-provider/CPU/429/503 오프라인 chaos, [#143](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143) ONNX Laya worker·queue/cgroup/systemd/Docker/IaC·모니터링/CI 코드. **이슈 3건 모두 OPEN이나 하위 #145 offline wire·#148 예산 원장 코드는 병합·수락. #150 Laya/transport는 Draft·충돌/미병합이며 사용료/모델 다운로드·실운영 허가 아님**.
- **이서연 단독 NCP 비코드 운영:** [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12) 환경/서비스 사용권·예산/권한, [#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22) 호스트 CPU/비용 실측/중단·복원 영수증. UI/합성/학업 개발 이슈 [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124)·[#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141)·[#132](https://github.com/ot4562-glitch/HUFS-One-AI/issues/132)·[#133](https://github.com/ot4562-glitch/HUFS-One-AI/issues/133)에서 개발 assignee를 해제. **실자료 제공 대상 4명 중 1명이라는 사실은 유지**.

## 2026-11-03 최신 PR/하위 완료·보류 원장

- [x] **[#145](https://github.com/ot4562-glitch/HUFS-One-AI/pull/145) 심민성 CLOVA OCR/HCX offline wire:** HEAD `633d665` 김채윤 현재 HEAD 비작성자 APPROVED, 합성·일회용 PG·Chrome CI **3/3 SUCCESS** 후 main **`cade7c9b`** 병합. 실제 transport/모델/rights/OCR 20 평가 [ ].
- [x] **[#148](https://github.com/ot4562-glitch/HUFS-One-AI/pull/148) 심민성 PostgreSQL 예산 원장:** HEAD `54f09c6` 이의상·김채윤 APPROVED, CI **3/3 SUCCESS**, main **`e102516`** 병합. phase+actor 원자 예약·UNKNOWN_BILLING·kill switch/일회용 PG 코드만 수락; 실제 migration·billing/유료 승인 [ ].
- [x] **[#131](https://github.com/ot4562-glitch/HUFS-One-AI/pull/131) 이의상 BETA 설정 비교/되돌리기:** HEAD `8254dc17` 기존 P2 경합·REVIEWER 503 fall-open 수정 및 실제 remount/role 분리 합성 회귀, 심민성 APPROVED/CI 3/3 → main **`6efc532`**. 실 Google/스크린리더/4인 E2E [ ].
- [x] [#138](https://github.com/ot4562-glitch/HUFS-One-AI/pull/138) WIS HTML 로컬 변환 main `605144c`, [#147](https://github.com/ot4562-glitch/HUFS-One-AI/pull/147) 이중전공 독립 pure core main `2ae089f`, [#146](https://github.com/ot4562-glitch/HUFS-One-AI/pull/146) AI quote 최소 길이 main `ff226929`, [#142](https://github.com/ot4562-glitch/HUFS-One-AI/pull/142) 안전 브랜치 dry-run 도구 main `719c576`. **제품/실수강/실학칙/원격 실제 삭제까지 완료된 것은 아님**.
- [x] **[#149](https://github.com/ot4562-glitch/HUFS-One-AI/pull/149) 박준영 수동 WIS CSV/handoff:** HEAD `f797787`에서 `UNKNOWN` 캠퍼스 임의 확정 P2 수정·음성 회귀, 심민성 비작성자 **APPROVED**·합성/PG/Chrome **3/3 SUCCESS** 후 **main `efa13368`** 병합. 8열 CSV/원본·CSV SHA/보류 행·메모 인계 코드만 수락. 실제 학교 원본 권리/학생 4인/owner import·RulePack [ ] (same WIS URL의 파일별 권리 receipt 설계는 #27/#133).
- [ ] **[#134](https://github.com/ot4562-glitch/HUFS-One-AI/pull/134):** **CLOSED/미병합**, 과거 합성 UI HEAD CI 3/3는 실제 main 수락 증거가 아님. #132 고유 기능이 필요하면 새 비중복 PR에서 검증.
- [ ] **[#150](https://github.com/ot4562-glitch/HUFS-One-AI/pull/150):** 심민성 provider authority/transport·결과 저장·Laya/worker·owner 학업/시연 API·배포 템플릿 WIP, HEAD `2812806` CI 3/3이지만 **Draft·GitHub merge conflict·현재 HEAD 비작성자 승인 0**. #145/#148의 main 선행 구현과 충돌 통합/다중 영역 리뷰 미완료.
- [ ] **이슈 #144** 현재 이중전공 졸업요건의 실제 owner API/React/공식 RulePack·권한 있는 종단, [#133](https://github.com/ot4562-glitch/HUFS-One-AI/issues/133) 4인 출처/동의 데이터와 기관 이용권, [#61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61) 독립 인적 200 gold(확인 **0/200**)·[#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46)/[#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) 출시는 **별도 미완료**.

**고정 게이트 분모·현재 체크 수 불변:** 심민성 **7/12**, 이의상 **9/12**, 김채윤 **7/12**, 박준영 **8/12**, 이서연 NCP 비코드 운영 **1/5**. [x]는 *그 PR의 구현/검사 하위 범위 수락*이고 그 밖의 운영/독립 인간 평가 조건이 포함된 기존 [ ]는 그대로 둔다. main push 세 병합 커밋의 합성/PG/Chrome 워크플로도 SUCCESS 확인(실 운영 권한 아님).

**2026-11-03 담당자별 이슈 전수 분류:** GitHub 일반 이슈 OPEN **34건/주관 중복·미배정 0**, CLOSED **7건**. [WORKSTREAMS](WORKSTREAMS.md)에 심민성 **17**, 이의상 **11**, 김채윤 **2**, 박준영 **2**, 이서연 **2**건으로 34개 전부 번호별 수록. 다중 assignee 11건은 주관/협업을 기존 배정 유지하며 이슈 본문에 분리. 이 **이슈 주관 건수**는 아래 고정 수락 게이트 분모나 개인 작업량 평가가 아닙니다.

## 공통 차단 및 기록 주의

- **개인정보:** [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46)에서 마지막 보고된 Private Git 보호 경계 **178/180 PASS · 2 FAIL**, 파일 6건 최초 게시/공유 이력·자료 이용권 검증 미완료. 이 회차 **재실행하지 않음**. 별도 목적별 응답 4/4 확인을 Git 게시/팀 공유·실서비스 승인으로 확대하지 않음.
- **추천:** [#61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61)의 200개 합성 **초안/자체 검토 라벨**은 독립 인적 gold **확인된 0/200**과 구분. 실기관 자료 이용권·정확도·모델 운영 성능 없음.
- **출시:** [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) `RELEASE_BLOCKED`; 실제 Google/학교메일·TLS/CDN/직접 IP·운영 DB/NCP·기관 원본·학생 권리·실기기 QA 미완료. 기본 브랜치 보호도 미설정 관찰(11/03).
- **과제/시연:** #131/#145/#148/**#149**는 최신 HEAD 비작성자 리뷰·CI 뒤 **main 병합 완료**. [#134](https://github.com/ot4562-glitch/HUFS-One-AI/pull/134) CLOSED/미병합 UI 고유 기능 확인, [#150](https://github.com/ot4562-glitch/HUFS-One-AI/pull/150) owner provider/Laya Draft·충돌·독립 리뷰는 OPEN. #124/#141 UI와 #27/#133 파일별 권리, #46/#89 실운영 차단은 지속.
- **확인 기준:** GitHub 실제 PR `merged`/HEAD `APPROVED`/Actions job, [STATUS](../STATUS.md), [WORKSTREAMS](WORKSTREAMS.md), 관련 UI·계약 테스트·이슈 원문. CI와 문서만으로 완성률/데모 상용성/실사용 승인을 과장하지 않는다. 새로운 증거가 나오면 고정 수락 항목의 전 조건 충족 여부를 검토한 뒤 **같은 분모**로 재계산한다.
