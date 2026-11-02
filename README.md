# HUFS One AI

**2026-11-02 최종 병합 후 정정:** [동아리 추천 코어 PR #125](https://github.com/ot4562-glitch/HUFS-One-AI/pull/125)의 과거 시점 미래 수정·승인 후 변경 노출 결함이 새 HEAD에서 수정되어 **비작성자 APPROVED·Actions 2/2 성공 후 main `8f76c388`로 병합**. 이번 회차 실제 병합은 **#122·#72·#125 총 3건**, 열린 PR **7건**·Issue **30건**(닫힌 5). #123에는 12개 승인된 **가상 모집 게시글/결정론 코어**만 구현; AI 창작 포스터 파일/React 게시판/서버 관리자 승인 검증은 미완료. #124 기존 HUFSAbility 모든 메뉴 존중·🚫 미지원 배치도 UI 구현 전. #46/#89 자료권리·출시 차단 유지. 아래 'PR 8/병합 2/#125 CHANGES_REQUESTED'는 **병합 이전 회차** 기록.

**2026-11-02 최신 정본:** HUFS One AI는 **기존 HUFSAbility 메뉴·학생 경험을 존중하고 AI 개인화로 보강하는 서비스명**이다. 원래 메뉴 전체를 화면 정보구조에 보존하고, 이번 데모에서 실제로 구현하지 않은 기능은 **🚫 미지원**으로 분명하게 표시한다([#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124)). [#123 동아리 모집](https://github.com/ot4562-glitch/HUFS-One-AI/issues/123)은 실제 동아리/에브리타임 자료 대신 가상 동아리·AI 합성 포스터·관심사 추천만 시연하는 별도 제안으로, 학교 공식 게시 허가는 없음.

**이번 실제 GitHub 처리:** [#122](https://github.com/ot4562-glitch/HUFS-One-AI/pull/122) 정정 회귀 및 [#72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72) 인증된 캘린더 UI를 타인 HEAD 승인·Actions 2/2 성공 후 각각 main **bb5b76d·717ce979 병합**. #73 초대·#125 동아리 추천은 CHANGES_REQUESTED, #74 졸업·#75 sandbox·#117 추천 이유는 APPROVED(후행 병합 차단 존재), #76 E2E COMMENT, #120 계약과 #121 API는 미병합. **열린 PR 8, Issue 30, 기존 닫힌 Issue 5, 신규 Issue 전체 종료 0**. #46 Privacy 2 FAIL·#89 RELEASE_BLOCKED. [STATUS](STATUS.md)·[PR 기준](docs/PR_WORKFLOW.md). 아래 2026-11-01 수치는 당시 기록이다.

**2026-11-01 당시 GitHub 검증:** [#118](https://github.com/ot4562-glitch/HUFS-One-AI/pull/118) 권한 정책 버전 캐시 무효화는 독립 승인·Actions 2/2 성공 후 **main 병합 `fdf0b09b`**. [#117](https://github.com/ot4562-glitch/HUFS-One-AI/pull/117)은 추천 사유 설명 반례로 변경 요청; 계약 [#120](https://github.com/ot4562-glitch/HUFS-One-AI/pull/120)→API [#121](https://github.com/ot4562-glitch/HUFS-One-AI/pull/121)은 합성 CI 성공·COMMENT 리뷰·비작성자 승인 요청 상태로 **미병합**. UI #72~#76도 차단 그대로. **열린 PR 8/Issue 28, 기존 닫힌 Issue 5, 신규 완료 폐쇄 0건**. #46 원본 권한 검사 2 FAIL·#89 RELEASE_BLOCKED 유지. 아래 “이번 신규 병합 0/Issue 27”은 이전 회차 기록. [정본](STATUS.md) · [PR 운영](docs/PR_WORKFLOW.md).

**2026-11-01 기능 제안 4건(이슈 등록·수락 기준 정리만):** **P0 제안** [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119) 공고 정정 전후 비교 화면(신규), **P1 제안** [#86](https://github.com/ot4562-glitch/HUFS-One-AI/issues/86) 추천 제외 이유(기존), [#80](https://github.com/ot4562-glitch/HUFS-One-AI/issues/80) 지원 준비 보드(기존·API 단계 계약만 완료), **P2 제안** [#82](https://github.com/ot4562-glitch/HUFS-One-AI/issues/82) 복수/이중전공 What-if(기존·#107 DTO만 완료). 구현 완료나 공식 일정·운영 승인을 의미하지 않으며 원문 권리·학칙·권한·실브라우저 E2E 선결 사항은 이슈에 기록했다.

**2026-11-01 이전 UI 리뷰 기록:** UI #72~#76 최신 HEAD 리뷰 5건 완료(#72·#75 CHANGES_REQUESTED, #73·#74·#76 COMMENT), **신규 병합 0건**. 해당 HEAD GitHub Actions 성공 증거는 없으며, #72 비합성 캘린더 port/스냅샷 잔상과 #75 REVIEWER sandbox의 미저장 입력·버전 격리가 차단 상태다. 열린 Issue 27건/종료 5건을 확인했고 관련 7개 Issue에 감사 체크를 남겼다. #46 개인정보 전체 checkout 2 FAIL·#89 `RELEASE_BLOCKED` 및 실제 기관/운영 검증은 여전히 미완료. [STATUS.md](STATUS.md)·[PR 정책](docs/PR_WORKFLOW.md)이 기준이다.

## 2026-11-01 최신 코드 통합·출시 경계 (정본)

- **main 통합 완료:** [#83 플랫폼/인가·일반 PG·출처/Temporal RAG/owner API](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83); 학업·개정 비교 [#84](https://github.com/ot4562-glitch/HUFS-One-AI/pull/84)·[#90](https://github.com/ot4562-glitch/HUFS-One-AI/pull/90)·[#91](https://github.com/ot4562-glitch/HUFS-One-AI/pull/91); 데이터 철회·삭제/수집 경합 [#99](https://github.com/ot4562-glitch/HUFS-One-AI/pull/99)·[#102](https://github.com/ot4562-glitch/HUFS-One-AI/pull/102)·[#105](https://github.com/ot4562-glitch/HUFS-One-AI/pull/105)·[#112](https://github.com/ot4562-glitch/HUFS-One-AI/pull/112)·[#113](https://github.com/ot4562-glitch/HUFS-One-AI/pull/113); 본인 보관함 계약/HTTP/웹 [#97](https://github.com/ot4562-glitch/HUFS-One-AI/pull/97)·[#106](https://github.com/ot4562-glitch/HUFS-One-AI/pull/106)·[#115](https://github.com/ot4562-glitch/HUFS-One-AI/pull/115); 수강계획 확인 **인가 gate** [#103](https://github.com/ot4562-glitch/HUFS-One-AI/pull/103)와 전공 What-if **계약만** [#107](https://github.com/ot4562-glitch/HUFS-One-AI/pull/107).
- **학업 #116 새 검증:** [박준영의 계획 검사 출력→API strict wire 정합 수정](https://github.com/ot4562-glitch/HUFS-One-AI/pull/116)이 심민성 **독립 승인**·동일 HEAD CI 두 작업 성공 후 `main` 병합(`6e287a0`). 학업 순수 검사/응답 호환만 해결한 것이며 검수된 RulePack/권리 adapter/실 UI #81은 아직 미완료.
- **보안 CI:** [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) 관련 #92~#94/#96/#98/#101/#104/#108/#109/#111의 오프라인 정책·릴리스 차단 검증이 병합됐다. 공식 actions/* SHA pin과 민감 원본 제외를 유지한다. **실서비스 출시는 여전히 RELEASE_BLOCKED.**
- **미병합 UI:** [#72 캘린더](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72) → #73 심사 초대 → #74 학업 → #75 합성 리뷰어 → #76 브라우저 E2E는 OPEN. #72 비합성 캘린더 포트/버전 갱신 race는 CHANGES_REQUESTED 상태다.
- **실제 Private 로컬 파일 경계 검사:** 2026-11-01 `npm run check:privacy`는 **153/155 PASS·2 FAIL**(Git 추적 보호 경로 6건, 원본 미열람). 합성 CI PASS와 구별하며 공개/배포를 계속 차단한다. [#46 데이터·동의 감사](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46).
- **아직 실제로 제공되지 않은 것:** 공식 학칙·원장 승인, 실 Google/외대메일 인증 운영, 실학생 동의·기관 자료 권리, 실제 NCP/HTTPS·도메인·CDN 검증, #80 지원 현황 보드 UI·#81 계획 UI/공식 계산 연결·#82 What-if 계산/화면. 구현과 공식 학교 판정·실학생 처리 승인을 혼동하지 않는다. 현재 작업 상태는 [STATUS.md](STATUS.md), 담당 경계는 [WORKSTREAMS.md](docs/WORKSTREAMS.md) 기준.
- 이번 자체 작성 PR의 기술 총괄 직접 리뷰/병합은 사용자 **해당 회차 명시 예외**로만 시행했으며, GitHub의 비작성자 `APPROVED`를 허위로 기록하지 않았다.



## 최신 구현·병합 상태 (2026-11-01, GitHub HEAD 기준)

- **main 병합:** [#58 플랫폼·인증/영속 PG·권한/RAG/캘린더 서버 합성 통합](https://github.com/ot4562-glitch/HUFS-One-AI/pull/58), 학업 [#56](https://github.com/ot4562-glitch/HUFS-One-AI/pull/56)·[#57](https://github.com/ot4562-glitch/HUFS-One-AI/pull/57)·[#62](https://github.com/ot4562-glitch/HUFS-One-AI/pull/62), 코어/합성 [#60](https://github.com/ot4562-glitch/HUFS-One-AI/pull/60)·[#65](https://github.com/ot4562-glitch/HUFS-One-AI/pull/65)·[#67](https://github.com/ot4562-glitch/HUFS-One-AI/pull/67), UI 기초 [#64](https://github.com/ot4562-glitch/HUFS-One-AI/pull/64)·[#66](https://github.com/ot4562-glitch/HUFS-One-AI/pull/66)·[#68](https://github.com/ot4562-glitch/HUFS-One-AI/pull/68). #68은 대상별 S01–S05 합성 스냅샷 혼합 P1 수정·최신 CI 성공 후 `51c3c11c`로 병합했다.
- **2026-11-01 추가 main 병합:** 문서·스택 ancestry [#78](https://github.com/ot4562-glitch/HUFS-One-AI/pull/78) merge `83b4dab8`, 캘린더 브라우저 GET [#77](https://github.com/ot4562-glitch/HUFS-One-AI/pull/77) squash `552ad35e` (비작성자 UI 승인·Actions 두 job SUCCESS), 오늘·기회·공지 [#69](https://github.com/ot4562-glitch/HUFS-One-AI/pull/69) merge `5617222f` (비작성자 총괄 승인·Actions 두 job SUCCESS). #69 작성자는 force push 없이 main merge로 #68 스택 조상을 복구했고, 남은 스택 보전을 위해 #69는 merge commit을 사용했다. [API 이슈 #71](https://github.com/ot4562-glitch/HUFS-One-AI/issues/71)는 범위 완료로 CLOSED.
- **현재 UI 스택:** [#72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72)→[#73](https://github.com/ot4562-glitch/HUFS-One-AI/pull/73)→[#74](https://github.com/ot4562-glitch/HUFS-One-AI/pull/74)→[#75](https://github.com/ot4562-glitch/HUFS-One-AI/pull/75)→[#76](https://github.com/ot4562-glitch/HUFS-One-AI/pull/76) 전부 OPEN. **#83은 이미 main 병합**되었고, #72/#75 변경 요청·현재 HEAD CI 미확인·선행 스택 미병합으로 이 UI PR들은 승인/병합 대기 중. 학업 #70은 main 병합, 공식 규칙 독립 검토는 별도.
- **운영 완료 아님:** 합성/일회용 PostgreSQL 검증과 실 Google OIDC·SMTP·학교 권리/허가·학생별 동의/철회·NCP/CLOVA 운영·실브라우저 인증 E2E를 구별한다. 현재 유료 환경 개통·정식 출시 승인은 없다. [최신 상태와 차단사항](STATUS.md) 및 [팀별 역할](docs/WORKSTREAMS.md)을 먼저 확인한다.

아래 날짜별 기록에 남아 있는 "main 미병합"·"API 미구현" 등 표현은 **당시 상황의 이력**이며 이 최신 절보다 우선하지 않는다.

## 2026-11-01 심민성 플랫폼 통합 당시 기록 (#58 병합 전)

`feat/platform-integration-20261101`에서 기존 인증 #32·공통 계약 #33·출처/RAG #34·DB #35·원자 권한 조회 #55를 최신 main과 통합했다. 인증된 캘린더 GET, 권한별 추천/공지 재계산, 개인 상태 HTTP CRUD와 명시적 PostgreSQL 서비스 조립을 추가했다. `npm ci --ignore-scripts --no-audit --no-fund`, `npm run check`, `npm run build:api`로 재현한다. [현재 증거와 남은 게이트](STATUS.md) · [API 연결법](apps/api/README.md). 아래 2026-10-31 기록은 당시 main 기준이며 새 브랜치 구현을 main 병합이나 실서비스 개통으로 해석하지 않는다.

**NCP 새 운영 정본:** [NCP_OPERATIONS_2026.md](docs/NCP_OPERATIONS_2026.md) — 2026-11-06~12-09(816h 예산 상한), 실제 본선 발표 11/16 및 크레딧·사용자 승인 이후 개통. 한국 VPC Linux High Memory-g3 4vCPU/32GB 326원/h + 50GB CB SSD 8원/h(선택 공인 IP 5.6원/h); 816h 서버+CB 272,544원, IP 포함 277,113.6원(VAT 등 제외).



## 2026-10-31 PR 병합 현황·추가된 캘린더

**병합 규칙:** PR 작성자가 아닌 **최신 HEAD 승인 1명 이상 + 필수 CI 성공 + 선행 의존/보안 차단 해결**이면 병합한다. 팀원 전원 리뷰는 필수 아님. 코드/공통계약은 PR, 문서는 [총괄의 main 직접 정정 예외](docs/PR_WORKFLOW.md)를 적용한다.

**확인된 main 병합 12건:** 추천 #15, 학업 vNext #36, 공지 overdue 계약 #44·코어 #16, 설명 계약 #47·실제 추천 이유/관련도 코어 [#41](https://github.com/ot4562-glitch/HUFS-One-AI/pull/41), 캘린더 Wire #53·계산 #50, Fastify–React 합성 통합 #37, 평가 #48, 일부 미공유 입력 #49, 시점·정정/검증 #40. **#41도 최신 HEAD 승인·CI 뒤 2026-10-31 main 병합**했고 미공유 경험/학업의 추천 설명 누출 음성 테스트를 추가했다. 실제 UI와 운영 인증 API까지 완료했다는 뜻은 아니다.

**계획 외 신규 홈 기능 — ‘내 주요 일정’:** 학생 본인에게 적용이 확정된 서류 제출·실제 신청 마감과 시험/행사를 별도 기호·문구로 표시한다. UNKNOWN 적용/중복은 확인 대기, ROLLING/날짜 미정은 달력 바깥. **#53 결과 계약과 #50 순수 계산은 main 구현 완료**, [#52 인증·SharingGrant 기반 GET API](https://github.com/ot4562-glitch/HUFS-One-AI/issues/52)와 [#51 UI/모바일/접근성](https://github.com/ot4562-glitch/HUFS-One-AI/issues/51)은 아직 미구현이다. [제품 설명](Proposal.md) · [설계 A07.3](Architecture.md) · [진행 상태](STATUS.md). 캘린더 내보내기(ICS)/푸시는 이번 기능 범위 밖.

**남은 PR 5건:** Google OIDC/외대 메일 #32, EvidenceScope #33→Temporal PG #34, DB 공유권한 #35, 원자적 HTTP 스냅샷 [#55](https://github.com/ot4562-glitch/HUFS-One-AI/pull/55). 모두 **타인 현재 HEAD 승인, main 충돌/이전 변경요청, 실환경 안전 게이트**의 미완료를 검토 중이며 임의 병합하지 않았다. 기존 #54는 #55로 미병합 대체. [#42 계약·추천설명 리뷰 이슈](https://github.com/ot4562-glitch/HUFS-One-AI/issues/42)는 완료로 종료했지만 실제 React 추천 설명·권한/소스 검증은 #9/#27/#39에서 계속 추적한다. 캘린더 #51 UI·#52 인증 API도 미구현. 배포·실학생 동의·PG·Google/OIDC·NCP/실출처 권한·브라우저 E2E는 별도 차단 사항.

## 합성 API 구현 상태

심민성이 담당한 Fastify 합성 API 코드가 `main`에 반영됐다. Fastify 서버·권한/SharingGrant/버전 검사·합성 AI 작업·로컬 시의성 근거 인덱스가 [API README](apps/api/README.md)에 정리되어 있다. **127.0.0.1 전용 local harness는 신뢰된 Google OIDC/외대메일 인증 어댑터가 없어 모든 실제 요청을 401로 차단**한다. Google OIDC·영속 DB·NCP 제공자 연동은 출시 전 검증 과제다. 추천·공지 core #15/#16은 main 병합 완료이며 공식 `NoticeResult.items[].overdue`도 연결됐다. 단, 실제 actor/grant/실학생 인증 API와 출처 권한·시연 브라우저 통합은 별도 출시 검증 전이다. 담당 GitHub 계정은 [WORKSTREAMS.md](docs/WORKSTREAMS.md)의 이슈 assignee 기반 표를 참고한다.

**HUFSAbility의 기존 취업·진로·비교과 정보를 AI로 학생별로 재배치하고, 졸업지원까지 확장하는 한국외대 바이브코딩 공모전 제안.**

## 문서 두 개: 읽는 사람에 따라 역할을 분리

| 문서 | 독자와 역할 | 바꾸어야 할 때 |
| --- | --- | --- |
| **[Proposal.md](Proposal.md)** | **팀원·심사자용**: 1쪽 요약, 학교 문제와 실제 근거, 개인화 핵심 기능, 60초 시연, 구현계획, 공식 심사배점·예상 효과의 측정법, 학내 도입안 | 아이디어·기능 우선순위·심사 메시지가 바뀔 때 |
| **[Architecture.md](Architecture.md)** | **다중 AI 개발·검증 에이전트용**: 공고-관심 공통 분류코드 24개, 실제 Forms 26열 입력 계약, CSV·규칙팩, 화면·API·AI·DB·NCP·동의·시험·TASK-00~17 | 구현 계약·데이터·테스트·에이전트 실행순서가 바뀔 때 |
| **[AGENTS.md](AGENTS.md)** | 에이전트의 지속 안전·권한 규칙. 최신 지시와 자료 사용·동의 경계가 우선 | 실행·보안 정책이 바뀔 때 |
| **[STATUS.md](STATUS.md)** | 현재 확인된 사실·미완료·검증 결과 | 실제 수행/검증 직후 |

**읽는 순서:** 팀원은 `Proposal.md` → `APPLICATION.md`, 구현·검증 에이전트는 상위 `AGENTS.md` → 이 폴더 `AGENTS.md` → `Architecture.md` A0~A3 → 담당 절과 `STATUS.md` 순이다.

## 확정된 제품 방향과 우선순위

- **P0 (우선):** 같은 HUFSAbility 공고라도 학생의 관심 직무·전공·승인 경험에 따라 **관련 3건은 큰 강조 카드**로, 그 외 일반 항목은 작은 목록으로 노출. AI는 경험·공고를 해석하고 코드가 추천순위·지원자격을 검증한다. 전체 공고 접근은 유지한다.
- **P1 (추가):** **학번·전공별 졸업요건, 부족학점·미이수 필수과목·수강계획, 최대20개 관심/필수 과목의 제한적 개설 전망**을 별도 `졸업지원` 탭에서 안내. 공식 졸업사정·미래 확정 공고와 구분한다.
- **P2 (확장):** 상세 시간표 최적화·확장 전망·학과/전교생·학교 DB 및 공식 SSO 연동(기관 허가가 있을 경우만)·장기 운영. **P0 인터넷 공개 시에는 학교 공식 SSO 대신 Google OAuth + 현재 외대 이메일 확인을 필수로 한다.**
- **본선 핵심 시연:** 같은 공고 묶음의 서로 다른 두 학생 홈 → AI 숨은 조건·지원 행동 → 경험 승인 후 추천 변경 → 추가 졸업지원. 공식 발표는 2026-12-09이며 본선 개발기간은 11/16~12/06이다(공식 변경 가능).

**학업 선행 연구:** [Course Compass 준비 보고](sandbox/taewangim-alt/academics-readiness.md)는 경제학부 학사·전망 기능의 검토 후보이며 제품 코드·원자료의 이식/검증 완료를 뜻하지 않는다. AI로 만드는 RulePack 초안은 사람이 조항별로 검수하며 제품의 네 가지 CLOVA 작업과 구분한다(Architecture A06.8·A08.6·A09.5).

## 접속 예정 주소와 HUFS 계정 전용 접근

- **도메인 확보(사용자 확인):** `외대.온라인.한국` · 정규 origin `https://외대.온라인.한국`. **DNS/TLS/사이트 개통은 아직 검증되지 않았으므로 현재 접속 가능한 서비스로 안내하지 않는다.**
- **예정 운영:** 공개 HTTPS 주소에서 **Google 로그인 + `@hufs.ac.kr` 메일의 현재 소유 확인 + 베타 초대 승인**을 거친 경우에만 앱/UI/API에 진입한다. Google Workspace `hd=hufs.ac.kr`이 실제 검증되면 기관 메일 증명으로 사용하고, 그 밖의 Google 계정(개인 Gmail 포함)은 외대 메일 일회용 인증코드(OTP)를 필수로 한다. 이메일 접미사·Google `email_verified` 단독으로 허용하지 않는다. **학교 SSO 허가는 출시 조건이 아니다.** Google OAuth/OTP 설정·보안시험은 아직 미구현이다.
- **보안/승인:** 익명 요청의 HTML·API·다운로드·스토리지/CDN·직접IP/preview 우회를 차단하고, 로그인 시작/회신용 최소 화면만 사전 공개한다. 실제 서비스 배포·학생자료 클라우드 이동·유료 NCP와 GitHub 저장소 공개 전환은 각각 별도 게이트다. [운영 요약](CLOUD.md) · [구현 정본](Architecture.md) A14.1a.

## 현재 자료와 개인정보 경계

**2026-10-31 Private `main` 구조 검사:** 수강 CSV 4개(61/39/48/28 데이터 행, 공통 6열), Forms 통합 CSV 1개(26열·응답 4행)가 **BOM 없는 UTF-8**로 존재한다. 이는 과거 문서의 '과목 3개·Forms 미완료'와 달리 **파일이 있다**는 사실만 확인한 결과다. 개별 인물/표시이름 연결, 학칙·내용 오류, 최초 Git 게시 승인, 목적별 공유/NCP/AI 처리 동의는 **미검증**이며 원본을 시연/합성 CI/외부 AI에 쓰면 안 된다. 제출 목표 4명(김채윤·이의상·심민성·이서연), 박준영은 자료 제출 대상 아님. 과거 3개 수강 파일의 명시 허가와 추가 파일의 게시 근거는 구별한다. [데이터 거버넌스](docs/DATA_GOVERNANCE.md).

**외부 AI 전사 전에는 과목표 외 이름·학번·성적 등이 보이지 않도록 분리하고 별도 동의를 확인**한다. 동의가 없으면 사람이 전사한다. 성적/GPA·전체 학번·사진·원본 성적증명서를 시연 데이터에 수집하지 않는다.

프로젝트가 GitHub에 올라가더라도 `local_only/`, `templates/real5-intake/*.csv`, `HUFS_UI.pdf`, `reference/**/raw/`·`screenshots/`·원문 파생물, `retire/`는 **보존만 하고 공개·배포에서 제외**한다. 자체 작성한 근거 요약과 합성 시험은 별도 이용조건·개인정보 검사 후 협업 가능하다.

## 독립 개발 준비 (공통 계약·합성 API 일부 구현, 실제 브라우저/UI·인증 미완성)

- **확정 5인 분담:** 심민성(GPT, 기술 총괄·TASK-00/통합), 이의상(Claude·Gemini, UI/모바일), 김채윤(GPT·Claude·Gemini, 추천/공지), 박준영(GPT·Claude, 졸업·전망), **이서연(Gemini 사용 확인, 팀 결성·기획 리드 + NCP·CLOVA·OCR/Vision·Laya 모델/Provider 전담)**. [작업/구독/경계](docs/WORKSTREAMS.md) · [팀원 구조지도](docs/TEAM_GUIDE.md).
- **TASK-00 공통 계약:** [TypeScript/Zod 패키지 사용법](packages/contracts/README.md)과 [계약 경계](docs/CONTRACT_BOUNDARIES.md). 24 TopicCode·DemoSnapshot/SharingGrant·4인 CSV/Forms 입력·오류/AI 스키마와 **합성 자동 소비자 검증**을 구현했다. `npm ci --ignore-scripts` → `npm run check`로 재현하고 네 트랙이 같은 계약을 사용한다. **실제 팀원 리뷰와 전용 PR/CI 병합 여부는 별도 게이트**다. 심민성이 공유 계약·lockfile을 조정한다.
- **독립 브랜치/PR:** [docs/PR_WORKFLOW.md](docs/PR_WORKFLOW.md)와 각 폴더의 AGENTS.md. main은 통합 담당자가 검토 후 병합.
- **실자료 접근:** 과거 승인된 Private 수강 파일 3개 외에도 현재 `main`에 추가 수강/Forms 파일이 있으므로, Git 추적 이력·당사자 동의·협업자 접근을 별도 감사해야 한다. 형식 검사는 게시·열람·외부 AI/NCP 처리 승인이 아니다. [DATA_GOVERNANCE](docs/DATA_GOVERNANCE.md).

## 일정·도구와 근거

- 1차 공식 배점: **한국외대 현안 관련성 40 / 독창성 30 / AI 활용 30**. 2차: **구현 30 / 학내 적용 30 / 파급효과 25 / 발표 15**, NCP 실제 활용 최대 +5점. 공식 페이지: https://contest.hufs.ac.kr/
- 기존 HUFSAbility 근거: [2026-10-29 스냅샷](reference/hufsability/snapshots/2026-10-29/README.md) · [후속 공개자료 색인](reference/hufsability/snapshots/2026-10-29-followup/README.md). 자료 권한: [DATA_PERMISSION_GATE.md](reference/hufsability/DATA_PERMISSION_GATE.md).
- **검증:** `python.exe tools/verify_release_boundary.py` 및 관련 정적 경계 검사는 원본 권한·개인정보 동의를 입증하지 않는다. 현재 Private Git 이력에서 수강/Forms 실제 파일이 관찰되므로 자료별 승인 근거와 배포 제외를 확인하기 전에는 외부·CI·웹 정적 번들로 재배포하지 않는다. GitHub 공개 전환·실학생 데이터 외부 전송·서비스 개통은 서로 별도 승인 사항이다.

## 신규 신뢰형 AI·이미지 수집 설계 (2026-10-31, 아직 미구현)

- **서버:** NCP `High Memory-g3` Linux 4 vCPU·32GB + 별도 CB 50GB 단일 호스트를 설계 SKU로 선택. 오픈 가중치 **Laya multilingual 322M**은 CPU 비동기 문서 라우팅(검수 우선도) 전용이며 장애·부하 시 확정 코드로 폴백한다. 실제 서버 생성/배포/모델 설치/실측은 미완료다.
- **포스터:** 권리 확인된 HTML·이미지·PDF만 수집, 변경된 포스터에 General OCR, 누락/충돌/표 등 복잡 사례에 조건부 **HCX-005 Vision**, 안전한 문장 구조화에 기존 HCX-007. 이미지 원문 위치와 인용을 보존한다.
- **RAG:** 인용 가능한 근거를 문서버전/게시·수집·확인·적용기간/`asOf`로 선필터하는 **Temporal RAG**. 직접 만든 PostgreSQL lexical 검색부터 시작하고 벡터DB·managed RAG는 필수가 아니다.
- **지원금:** 본선팀 개발비 50만원과 **별도 NCP 크레딧 50만원 상당**은 수령·사용가능성 미검증; 실제 지출은 승인 전 0원. OCR·Vision·CPU 작업에도 비용·메모리 하드 게이트를 둔다.
- **정본:** [기술 계약](Architecture.md) A04/A06/A12~A15, [세부 신뢰형 RAG·멀티모달·버전·비용 설계](docs/TRUSTED_RAG_MEDIA_VERSIONING.md), [갱신 제안서](Proposal.md). 기존 공통 `packages/contracts`는 이번 설계 PR에서 수정하지 않는다.

## 담당자 심사 시연: `REVIEWER`(2026-10-31 개발 브랜치)

학교 담당자는 팀원 5명 계정으로 위장하지 않고 **공용 초대장 + Google OIDC 이메일/계정 검증**을 거쳐 `REVIEWER`로 접근한다. 등록 후 심사 기간 중 반복 방문 제한은 없지만 **실학생 자료·실외부 신청·유료 모델 호출은 불가**하며 합성 전용 S01~S05 슬롯/리플레이만 조회한다. 자동 종료는 UTC `endsAt` 배타 경계를 매 요청 서버/DB가 검사하고, 관리자 즉시 철회도 지원한다. 실제 이메일·기한·유효한 코드는 **미발급**, PDF는 비활성 양식. 합성 API는 `main`에 반영됐으며 OIDC/DB/도메인 운영 E2E는 후속 검증 과제다. [정본](docs/REVIEWER_ACCESS.md) · [Issue #25](https://github.com/ot4562-glitch/HUFS-One-AI/issues/25).

## CPU 보호형 Laya 운영 설계 (2026-10-31 추가)

Laya multilingual 322M은 파인튜닝 없이 합성 30~50개 공고로 우선 검증하며, **기본 OFF**. 향후 High Memory-g3 4vCPU/32GB에서 사용한다면 **별도 worker/CPUQuota 100%(1vCPU)/ONNX 1 thread/MemoryMax 3GiB**를 강제하고 API·REVIEWER 요청에서는 Laya를 직접 실행하지 않는다. host CPU/API p95/RAM이 불안정하면 즉시 폴백·자동 재활성화 금지. 현재 CPU/NCP 실측·모델 설치 완료가 아니라 설계다. [상세 운영 게이트](docs/LAYA_CPU_SPIKE_PROTECTION.md), [Issue #22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22).

### 현재 PR #31: REVIEWER 웹 전체 기능을 위한 안전한 합성 API 계약

심사자는 기존 학생용 메뉴(홈·공고·공지·경험·졸업·수강계획·개설전망·북마크·가상지원·설정)에서 **같은 화면 기능을 합성 자료로 이용할 수 있도록** [capabilities API](apps/api/src/server.ts)와 계정별 sandbox 액션이 추가되었다. `GET /api/reviewer/capabilities`, `/api/reviewer/demo/contexts/:id/actions`는 매 요청 초대·세션·만료를 확인한다. SET_INTERESTS/SET_DESIRED_JOBS/PLAN_COURSE/SET_SEARCH/SET_NOTIFICATIONS/RESET_SANDBOX를 포함한다. 실제 React UI·Google OIDC/DB/실 배포는 **미완료**, 이는 백엔드 기능 계약이며 공개 사이트 사용 가능 완료를 의미하지 않는다. 웹 구현은 이의상 [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9)/[PR #28](https://github.com/ot4562-glitch/HUFS-One-AI/pull/28), API는 심민성 [#27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27)이며 NCP는 이서연 #12 단독이다.
