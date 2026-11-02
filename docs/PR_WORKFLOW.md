# PR 운영과 파일 충돌 예방

## 2026-11-02 실제 리뷰/병합·후속 스택 게이트 (최신)

- [x] **#122** 정정판본·캐시/공지 회귀: HEAD 79a94d3 비작성자 APPROVED + [Actions 41317632398](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41317632398) 2/2 SUCCESS 후 **main merge bb5b76d**.
- [x] **#72** 미니 캘린더: HEAD e3b04d3 비작성자 APPROVED + [Actions 41376971823](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41376971823) 2/2 SUCCESS 후 **main merge 717ce979**. 실 API port/동일 문맥 snapshot 잔상 수정 확인.
- [x] **#73**는 #72 병합 후 base를 **main으로 retarget**, HEAD 9b8bd6f 성공한 getSession 비동기 콜백이 effect cleanup 이후 READY를 갱신할 수 있어 **CHANGES_REQUESTED**.
- [x] **#74** HEAD 1f341c9 및 **#75** HEAD d5f7905는 좁은 코드/UI 범위로 **APPROVED**, 각 HEAD 합성/PG CI 2/2 PASS. **#73 수정·병합 → #74 → #75** 스택 순서 필요. **#76** HEAD 782373a COMMENT: 현재 Actions는 Playwright/설치된 Edge 실제 브라우저 E2E를 실행하지 않음.
- [x] **#117** HEAD 709d285은 `OUTRANKED` 점수 동점 문구·그룹/다양성 반례 수정으로 비작성자 APPROVED/CI 2/2 SUCCESS. 다른 UI 리뷰어가 이전 HEAD에 남긴 CHANGES_REQUESTED의 최신 수락 전 병합 보류.
- [ ] **#120** HEAD 6b8e73e는 `GROUP_CAP/DIVERSITY/NO_PERSONAL_INPUT` wire enum 누락으로 소비자 CHANGES_REQUESTED(코어 #117과 API #121의 실제 불일치); #121은 #120 선행 승인/재검증까지 미병합.
- [ ] **#125** HEAD 37f0a2e 동아리 코어는 과거 asOf 조회에서 미래 updatedAt 게시물 노출 가능성으로 CHANGES_REQUESTED. 합성 APPROVED 플래그는 실제 서버 관리자 인증이 아님.
- [ ] 지금 **열린 PR 8건·Issue 30건/기존 closed Issue 5건**, 이번 신규 병합 2건/Issue 전체 종료 0. #46 원본 개인정보 검사 153/155 PASS·2 FAIL, #89 RELEASE_BLOCKED.

**일반 규칙 유지:** 코드/계약 PR은 변경 지적 해소+현재 HEAD 비작성자 APPROVED+동일 HEAD 적절한 CI+base/스택·권한 검수 후 병합. 이전 한시적 자기작성자 병합 예외를 재사용하지 않는다. CI PASS와 학교/학생 자료권리·NCP 배포 승인은 완전히 별개다.

## 2026-11-01 후속 코드 리뷰·병합 기록 (당시)

- [x] [#118](https://github.com/ot4562-glitch/HUFS-One-AI/pull/118) HEAD `830a8eaf` 비작성자 APPROVED·[Actions #41307796839](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41307796839) synthetic-contracts/postgres-integration **2/2 SUCCESS**·expected-head 확인 뒤 **일반 merge `fdf0b09b`**.
- [x] [#117](https://github.com/ot4562-glitch/HUFS-One-AI/pull/117) HEAD `68063d0a` CHANGES_REQUESTED: 순위보다 그룹별 최대 2개·주제 다양성 규칙으로 제외되는 반례를 설명/테스트에 반영해야 함.
- [x] [#120](https://github.com/ot4562-glitch/HUFS-One-AI/pull/120) 계약 HEAD `6b8e73e`, [#121](https://github.com/ot4562-glitch/HUFS-One-AI/pull/121) API HEAD `1d43960` COMMENT 리뷰·각자 CI 2 job SUCCESS. 작성자 본인 승인 불가. #120 김채윤/박준영·#121 박준영/이의상 독립 리뷰 요청; **선행 계약 병합 후 후속 API 최신 HEAD 재검증**.
- [ ] 열린 PR 8건(#72~#76, #117, #120, #121), 열린 Issue 28/기존 닫힌 5. **이번 신규 병합 1건(#118)**, 신규 전체 Issue 종료 0건. #46 자료권리/Privacy 2 FAIL·#89 RELEASE_BLOCKED. 이전 “신규 UI 병합 0건” 기록은 UI 스택에만 해당한다.

## 2026-11-01 이전 UI 5개 PR 리뷰·병합 게이트 재검증

- [x] #72~#76 **최신 HEAD에 리뷰 5건 등록**: #72, #75는 `CHANGES_REQUESTED`; #73, #74, #76은 `COMMENTED`. 리뷰 등록만 완료했으며 최신 HEAD 승인 또는 병합 완료가 아니다.
- [ ] **#72:** 실 API port와 동일 context snapshot 버전 갱신 READY 잔상 수정. **#73:** 초대 getSession 완료 후 abort 검사. **#74:** PENDING/비공유 학업에서도 비공식 졸업 판정 안내. **#75:** sandbox action 로그·미저장 form/초안/메모/관심 분야의 대상·snapshot 버전 격리. **#76:** 로컬 Edge E2E 주장과 독립/Actions 실행 증거 분리.
- [ ] 다섯 HEAD의 Actions run/check-run **0건**, 선행 스택 미병합, #72/#75 blocker 유효. **이번 신규 merge 0건**. 새 커밋/선행 병합 후 최신 HEAD 리뷰와 CI 다시 확인하고 순차 merge로 스택을 보존한다.
- **운영/개인정보:** #46 전체 Private 개인정보 검사 153/155 PASS·2 FAIL, #89 `RELEASE_BLOCKED`; 이미 병합된 #83/#116을 미병합으로 오기한 과거 절은 당시 상태로만 읽는다.

## 2026-11-01 최신 리뷰·병합 실적과 한시적 예외 (정본)

- **정상 원칙:** 코드/공통계약 PR은 독립 비작성자 현재 HEAD APPROVED 최소 1명, 같은 HEAD CI 성공, 유효한 CHANGES_REQUESTED 해소, 현재 main diff/스택·보안 검증 후 병합. 합성 CI PASS와 실제 공개·NCP·개인정보 처리 허가는 별도다.
- **이번 사용자 직접 지시의 한시적 예외:** 기술 총괄 `ot4562-glitch` 작성 PR도 **코드 diff/반례/독립 가능한 기술 검토 및 실제 두 CI job을 확인하고** 총괄이 직접 병합했다. GitHub 리뷰는 `COMMENTED`로 남기고 **비작성자 `APPROVED`가 있었다고 쓰지 않는다**. 이는 2026-11-01의 이 통합 검토 회차에만 적용하고, 이후 코드 PR 일반 정책을 영구 완화하지 않는다. 증거: [#83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83), [#105](https://github.com/ot4562-glitch/HUFS-One-AI/pull/105), [#107](https://github.com/ot4562-glitch/HUFS-One-AI/pull/107), [#109](https://github.com/ot4562-glitch/HUFS-One-AI/pull/109), [#110](https://github.com/ot4562-glitch/HUFS-One-AI/pull/110), [#115](https://github.com/ot4562-glitch/HUFS-One-AI/pull/115).
- **정상 비작성자 독립 승인 실적:** 박준영 작성 [#116](https://github.com/ot4562-glitch/HUFS-One-AI/pull/116)은 심민성의 CURRENT HEAD `APPROVED`, Actions #41301183012 두 작업 성공, 별도 로컬 41/41·전체 1,425 PASS/실PG opt-in 32 SKIP·API build PASS 후 `main` merge `6e287a0`. 앞서 기록한 **심민성 본인 PR 예외와 다른 정상 승인**이다.
- **스택 병합:** #83 기반 개인/인증/PG·RAG PR과 #92→#111 보안·#97→#115 웹 PR의 선행 HEAD를 순서대로 main에 일반 merge, 원인별 합성/일회용 PostgreSQL 검증 확인. #90/#103/#107의 `index.ts` export 충돌·#83/#112의 PG 시험 충돌은 양쪽 기존 테스트/기능을 **모두 유지**해 해결했다. 기존 branch/dirty tree 강제 reset·force push 금지.
- **남은 UI 차단:** [#72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72)는 비합성 `AppServices.loadCalendar` 미연결, 동일 epoch에서 snapshot 재작성 후 이전 일정 잔상 가능성으로 **CHANGES_REQUESTED** 유지. 후속 #73→#76은 #72 변경/독립 현재 HEAD 검토·CI 성공 전까지 stacked OPEN; 후속 PR의 구 HEAD `COMMENTED`는 승인 아님.
- **CI/데이터 보호:** 합성·일회용 PostgreSQL job 분리, sparse checkout에서 원본 CSV/Forms·`local_only` 제외, GitHub action immutable SHA, 오프라인 정책 PASS와 외부 조건 `NOT_RUN/BLOCKED` 구분. #89 릴리스는 운영 OIDC/TLS/도메인/CDN/실브라우저·자료권리 검증 전 `RELEASE_BLOCKED`.
- **문서-only main 정정 예외:** 아래 기존 사용자 합의대로 최신 main/원문 변경을 검사한 뒤 총괄이 문서 변경만 직접 커밋한다. 이 예외는 코드·CI·migration·lockfile을 포함하지 않는다.



## 2026-11-01 최신 PR 검증·squash 스택 관리

- **병합 기록 정정(최신):** [#77](https://github.com/ot4562-glitch/HUFS-One-AI/pull/77)은 비작성자 UI 현재 HEAD 승인·Actions 두 작업 성공 후 squash `552ad35e`로 병합했고 #71은 CLOSED. **[#83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83)은 이미 사용자 해당 회차 한시적 예외 절차로 `3c6378c` main 병합**; 작성자 COMMENT/CI와 비작성자 APPROVED를 혼동하지 않는다. 그 외 #116은 정상 타인 APPROVED·CI 뒤 main 병합 완료.

- **병합 게이트:** 비작성자의 *현재 HEAD* APPROVED 최소 1명, 관련 GitHub Actions 실제 SUCCESS, 해결된 CHANGES_REQUESTED, 개인정보/권한/시간 경계, 현재 main과의 충돌/의존 확인 뒤 통합 담당이 최종 병합. 작성자 본인 승인으로 독립 검토를 대체할 수 없다. 스택의 후속 PR은 선행 PR 병합 사실만으로 자동 승인하지 않는다.
- **#68 squash 이후 #69 ancestry 실제 해결(2026-11-01):** 작성자 `uisang2004-maker`가 force push 없이 `main 0a8d44b`를 #69 브랜치에 일반 merge하여 #68 squash 후손 단절을 복구했다(HEAD `5679c8a`, 본인 diff 11파일, Actions 2 jobs SUCCESS). 문서·이력 [#78](https://github.com/ot4562-glitch/HUFS-One-AI/pull/78)은 **merge commit `83b4dab8`**, [#69](https://github.com/ot4562-glitch/HUFS-One-AI/pull/69)도 **merge commit `5617222f`**로 병합했다. #72의 base는 `main`으로 retarget됐지만 코드 누락 및 CHANGES_REQUESTED로 병합 보류. 후속 #73→#76는 선행 정상 병합/현재 HEAD 검증 후 base를 순차 main으로 변경한다. 스택을 끊을 수 있는 squash/rebase, 타인의 HEAD 강제 push 금지; tree 동일성·의존 그래프와 리뷰 증거를 먼저 확인한다.
- 문서가 최신 상태를 잘못 표시하면 정본 문서와 이슈에서 구체 PR·커밋·CI를 기입해 정정하고, 이전 이력은 "당시"로 분리한다. 체계적 운영을 위한 문서-only main 정정 예외는 아래 기존 계약대로 유지된다. **주석·체크박스 작성은 검증이 아니며 미완료/불확실성은 열린 상태로 남긴다.**


- **코드/공통 계약 변경:** 한 TASK = 한 브랜치 = 한 주 편집자 = 한 PR. 리뷰/CI와 소유 경계 준수 후 병합하며, 코드의 main 직접 푸시는 금지한다.
- **운영 문서 예외(2026-10-31 사용자 최신 지시):** 기술 총괄 `ot4562-glitch`는 문서(`Proposal.md`, `Architecture.md`, `STATUS.md`, `README.md`, `docs/*.md` 등)를 최신 `main` blob SHA 충돌 확인 후 **직접 커밋**한다. 문서 정정만을 위한 PR은 열지 않는다. 이 예외로 코드, 데이터, 공통 TS/Zod 계약, lockfile, CI, 배포 설정을 우회하지 않는다.
- 브랜치 예시: feat/ui-, feat/recommendation-, feat/academics-, feat/platform-, chore/contracts-, docs/.
- 동시 실행 에이전트는 브랜치·worktree·포트·테스트 DB를 분리. 팀원은 각자의 clone.
- API·TopicCode·DB migration·lockfile·공통 타입은 통합 담당자 사전 승인 없이 수정하지 않는다.
- PR에 소유 경로, 변경한 계약, 테스트 환경/결과, 실패/미실행을 명시한다.
- **2026-10-31 새 사용자 병합 기준:** 코드 PR은 작성자가 아닌 사람 **최소 1명의 최신 HEAD `APPROVED`**를 받으면 최종 병합할 수 있다. 필수 CI 성공, 실제 diff/스택 의존 확인, 미해소 보안·개인정보 차단 사유는 여전히 선결한다. 독립 리뷰어 전원 승인은 더 이상 기본 조건이 아니다. 총괄 `ot4562-glitch`는 독립 팀원 PR에 직접 리뷰·승인할 수 있고 본인 작성 PR에는 타인 승인이 필요하다.
- CODEOWNERS는 소유자 안내이고 GitHub 플랜의 보호 정책 강제를 보장하지 않는다.
- CI·합성 fixture에 실제 학생 CSV를 포함하지 않는다. NCP 결제/서버 생성/공개 릴리스는 별도 사용자 승인.
- **공개 접속 Google 인증 계약:** 주소 `외대.온라인.한국` 및 **Google OAuth + 실제 외대 메일 소유 검증 + 베타 allowlist**는 신규 P0 설계다. 기관 공식 SSO 허가는 전제하지 않는다. Google token (`sub`,`iss`,`aud`,`hd`), 외대 메일 OTP의 일회성/유효기간/계정 결속, 세션·401/403·로그아웃, 익명 HTML/API/CDN/storage/direct-IP/preview 우회 부정시험을 별도 계약·운영 PR로 입증한다. 메일 접미사/Google `email_verified` 단독 체크 금지. 이 설계 PR은 NCP 개통이나 실학생 자료 이전을 승인하지 않는다.
- **TASK-00 초기 검사 게이트(현재 보완):** shared TS/Zod 계약과 synthetic fixtures가 main에서 구현·병합됐고, 각 최신 PR은 `npm ci --ignore-scripts --no-audit --no-fund` → `npm run check`와 필수 Actions/독립 현재 HEAD 리뷰를 검증한다. 이전 "4인 전체 리뷰 대기 후 착수"는 초기 병렬개발 준비 기록이며, 현재는 병합된 #58/#68/#69/#77 코드와 미병합 #72~#76/#83의 실제 차이를 기준으로 통합한다. 공통 계약/API를 담당 승인 없이 독자 변경하지 않는다.
- **확인된 역할·이슈 assignee (2026-10-31):** 심민성 `ot4562-glitch`(#8/#18/#27), 김채윤 `qamarrchae`(#10), 박준영 `taewangim-alt`(#11), 이의상 `uisang2004-maker`(#9), 이서연 `lhh42001`(#12/#20/#22). GitHub 할당 사실은 실제 학생 개인정보·클라우드 처리 동의나 신원 인증을 의미하지 않는다. [WORKSTREAMS.md](WORKSTREAMS.md) 기준.
- **실제 학생자료 주의:** 개발팀 5인과 Forms/과목 CSV 제출 4인은 다르다. 박준영은 제출하지 않는다. 사용자가 `까마르` 파일의 소유자가 **김채윤**임을 확인했지만, **매핑 확인=팀 공유/외부 AI/NCP 동의가 아니다**. 파일명 대응은 제한된 import registry에서만 주입하고 CI/mock/PR에는 합성 fixture만 사용한다.
- **계약 변경:** API·TopicCode·응답·오류·DB 스키마·lockfile 수정은 영향·마이그레이션·합성 검증과 소비자 리뷰를 첨부해 심민성에게 별도 계약 PR로 요청한다.

## 2026-10-31 협업 지원·재검토 필수 절차

1. **전수 조회:** 이슈·PR 전체(open/closed/merged), 최신 커밋 SHA, base/head 스택, `CHANGES_REQUESTED` 이후 신규 커밋, CI/배포 미검증을 구별한다. 과거 리뷰 상태만으로 최신 HEAD을 합격 처리하지 않는다.
2. **2026-11-01 현재 선행 관계:** 추천 #15/#16/#40/#41, 부분공유 #49, 달력 #50/#53, 통합 API/PG/Temporal RAG [#58](https://github.com/ot4562-glitch/HUFS-One-AI/pull/58), React 셸 #68, 오늘·기회·공지 #69, 캘린더 브라우저 API #77은 **main 병합 완료**. 옛 #33→#34는 개별 CLOSED/unmerged이고 상응 코드는 #58에 통합돼 별도 미병합 PR을 재활성화하지 않는다. #72 실제 UI port 연결이 선행하며 #73→#76 순차 스택, #83 플랫폼 추가 기능은 타인 리뷰/PG 검증 전 미병합. `rank-v1.1`은 A15/UX 검증 전 opt-in 유지.
3. **병합 기준(최신 사용자 지시):** (a) 비작성자 **1명 이상이 현재 HEAD SHA에 `APPROVED`**, (b) 동일 HEAD 필수 GitHub Actions 성공, (c) draft 아님/mergeable, (d) 스택 안에 아직 미승인·미병합 선행 변경이 잠입하지 않음, (e) 유효한 `CHANGES_REQUESTED`/보안·권한 차단이 해결됨을 확인한다. `COMMENTED`, 과거 HEAD 승인, 본인 PR 자기 승인, 합성 CI만으로 실배포 승인을 대신하지 못한다. 선행 PR 병합 후 base 동기화로 HEAD가 달라지면 최신 변경을 검토하고 다시 승인받는다. GitHub가 리뷰 수를 기술적으로 강제하지 않는 경우도 총괄이 수동으로 지킨다.
4. **파일·권한:** 팀원 소유 모듈을 총괄자가 덮어쓰지 않는다. 문제는 재현·근거 링크를 적은 리뷰/이슈로 남기고 작성자가 수정하도록 요청한다. 공통 타입은 독립 리뷰 PR로 수정하고 문서는 총괄자가 main에 직접 커밋한다. 실제 과목 CSV·Forms 원문이 이미 Private Git에 추적된 이력은 [DATA_GOVERNANCE](DATA_GOVERNANCE.md)에 기록하고 목적별 승인 없이 코드·CI·모델·배포로 옮기지 않는다.

## 새 기능 발견 시 계획·문서 동기화 의무 (캘린더 #50~#53)

- **PR 대체/재기반:** #54 → [#55](https://github.com/ot4562-glitch/HUFS-One-AI/pull/55)처럼 main 선행 변경과 테스트 충돌이 있을 때 기존 PR을 미병합 폐쇄하고 최신 main 기반 successor에서 해결한다. CI가 실패한 PR을 예전 승인만으로 병합하지 않는다.

- 계획에 없던 사용자 기능(예: 홈 하단 **'내 주요 일정' 미니 캘린더**)이 제안되면 담당 이슈·기술 계약·UI 소비자·권한/검증 테스트를 함께 정의하고 **Proposal.md, Architecture.md, STATUS.md, README.md, docs/WORKSTREAMS.md**에 설계/구현/미구현을 구별해 반영한다. 단순 리뷰나 타입 PR 병합을 기능 출시로 기록하지 않는다.
- **캘린더 최신 상태(2026-11-01):** #50 계산/#53 Wire, #58 actor·grant·asOf 서버 `GET /api/demo/contexts/:contextId/calendar`, [#77](https://github.com/ot4562-glitch/HUFS-One-AI/pull/77) 브라우저 `getCalendar`는 모두 **main 병합**. [#72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72)의 실제 비합성 `main.tsx` `AppServices.loadCalendar` 소비가 미연결이라 #51 UI 완료/실운영 API 연결은 **미완료**. 리뷰 요청에서 401/403 revoke, late response/epoch·snapshot.asOf, 비공유 scope, 브라우저 E2E를 확인한다. 미정 날짜/UNKNOWN/중복과 행정 보고 마감은 학생 마감으로 승격하지 않는다. `.ics`/push는 범위 밖.
- 문서 정정은 위의 운영 문서 예외에 따라 총괄이 최신 SHA 확인 후 `main`에 바로 기록할 수 있다. 코드/공통 계약은 항상 리뷰 PR을 거친다.

## 통합 PR 의존 및 공유 CI 경계 (#15/#16/#28/#29/#31)

[PR #31](https://github.com/ot4562-glitch/HUFS-One-AI/pull/31) 병합으로 루트 `package.json`/`tsconfig.json`/`vitest.config.ts`/`.github/workflows/task00-contracts.yml`에 API·추천/공지 core·UI 합성 테스트가 통합됐다. 추천 #15→공지 #16은 **후속 overdue 수정·최신 검토·CI 뒤 순서대로 모두 main 병합됐으며**, 신뢰형 출처 #40, 공유범위 #49, 캘린더 #50도 개별 승인/CI 후 main 병합됐다. #28 UI 상태관리 코드도 `main`에 병합됐으며 공통 CI는 #29 통합 담당 심민성이 관리한다. 충돌·이력 정리는 각 작성자 PR을 승인 없이 덮어쓰거나 병합하는 조치가 아니다. 실제 CI 및 독립 리뷰 미완료 상태에서 merge 하지 않는다. 모든 CI는 실제 학생 CSV·Forms·local_only·원시자료를 checkout하지 않는다.

## 신규 OCR·RAG·Laya 설계와 기존 TASK/PR 충돌 방지

**2026-10-31 당시 설계 결정을 기록한 절(현재 코드 구현 상태는 위 최신 요약 우선):** SourceRevision·IMAGE span·VerifiedClaim·Temporal RAG 공통 계약과 permission-first PG/API 코드는 [#58](https://github.com/ot4562-glitch/HUFS-One-AI/pull/58)로 main 통합됐다. 새 운영 provider SDK/권리 검수/실 OCR·원본 bbox/학사 학칙/모델 메모리·요금·CPU 검증을 구현 완료로 혼동하지 않는다. #83의 신규 증빙 검수/attestation/overlay SQL 등은 추가 리뷰·일회용 PG 검증과 권한 gate 확인이 필요하다. [세부 설계](TRUSTED_RAG_MEDIA_VERSIONING.md).

## 심사자 초대·기간제 접근 PR 리뷰 게이트 (#25)

- **최신 REVIEWER 통합:** #24의 기반 API는 #58 합성/PG 통합으로 main 병합. UI 초대 [#73](https://github.com/ot4562-glitch/HUFS-One-AI/pull/73)·합성 sandbox [#75](https://github.com/ot4562-glitch/HUFS-One-AI/pull/75)는 #72 선행 수정/병합 및 별도 현재 HEAD 리뷰/CI 전 **OPEN**. 외부 REVIEWER가 실제 학생 projection·Forms·관리자/유료 AI로 접근하지 못함을 UI/API 교차 권한 E2E에서 검증한다.
- [REVIEWER_ACCESS.md](REVIEWER_ACCESS.md)의 이메일/Google sub 바인딩·초대 digest·기간 끝 경계·철회·다중 세션·CSRF·RATE 제한/재시작 후 DB 지속성·민감 화면 접근 거부 합성 테스트를 요구한다. 초대 링크/실제 수신 이메일을 GitHub/PR/테스트 출력에 공개하지 않는다.
- 실제 Google 로그인/메일 검증·지속 DB·배포·초대 발송은 별도 운영 승인 없이 동작했다고 표시하지 않는다. 현재 PDF는 **비활성 양식**만 공유한다. 초대장이 있다고 해서 공식 학교 SSO/학교 승인이 부여되는 것은 아니다.
