# HUFS One AI — 현재 팀 역할·추가 기능 협업 정본

> 2026-11-11 전수 감사 기준. 11월 9일까지의 인계와 역할 기록은 보존하며 새로운 P0/P1 업무·승인 의존성은 아래 현행 표를 우선 적용한다. **고정 역할의 정의는 #355–#359 원래 본문이며, 최신 실행 가이드와 인수 기록은 해당 이슈의 댓글로만 추가**한다. #321–#325는 보관됐으며 과거 배정 방식·일정·담당을 현재 기준에 적용하지 않는다. 기능별 담당·실제 인수 상태의 최신 정본은 개별 `[추가 기능]` 이슈와 PR이다.

## 2026-11-11 현재 열린 과업·검수 책임과 의존성

**[PR 22건·Issue 31건 전수 감사](REVIEW_AND_ISSUE_AUDIT_20261111.md)**에 현재 HEAD/CI·협업자 리뷰·이슈별 미완 인수 근거를 기록했습니다. 최초 열린 PR 22건 모두 공식 코드 COMMENT 리뷰, 그중 #475만 정확 HEAD 동료 승인/CI 6/6 확인 후 main [05d78cd](https://github.com/ot4562-glitch/HUFS-One-AI/commit/05d78cdff03d68d1b711f9009bdbb335bc0e2939)에 병합됐습니다. **열린 31건 모두 자동 종결하지 않았으며**, 11월 9일의 기존 본선 전 담당 9건 완료·이관과 이후 새로 배정된 P0/P1 업무는 별도입니다.

| 실행 흐름 | 개발·검수 주책임 | 아직 완료하지 않은 조건 |
| --- | --- | --- |
| [#445 Crawlee/NCP 수집](https://github.com/ot4562-glitch/HUFS-One-AI/issues/445) P1 | **심민성** 코드/worker/DB·배포; **김채윤** 권한 있는 수집·실원문 검수 | #476 통합, #477→#479 preflight, 비공개 NCP source registry/권리·실서비스·복원/스케줄·비특권 실행 실제 인수 |
| [#447 전 기능 실데이터](https://github.com/ot4562-glitch/HUFS-One-AI/issues/447) P0 | **심민성** API/DB·코드/통합, **김채윤** 실자료/Gold; AI·웹 각 책임자 | #465→#471→#472 V2 스택, #470 Top-K, NCP 실제 원문→정규화→DB→API→화면 권리·실증 인수 |
| [#449 NCP 계약 설계](https://github.com/ot4562-glitch/HUFS-One-AI/issues/449) P1 | **심민성** 총괄·설계 결정; **김채윤** 권리/Gold 인수 의견 | 데이터 계약/보존·삭제/RPO·RTO/예산/크레딧/계정·실원장 운영 선택 A~G NOT_DESIGNED |
| [#418 검색 세션·KST](https://github.com/ot4562-glitch/HUFS-One-AI/issues/418), [#427 상담 async 경합](https://github.com/ot4562-glitch/HUFS-One-AI/issues/427) | **이서연** 프런트 UI, **박준영** QA, **심민성** API/인증 경계 검수 | 409·422·429/세션 분리, KST 날짜, 늦은 비동기 응답 폐기·브라우저 회귀 미완 |
| [#341 FAQ 극성 반례](https://github.com/ot4562-glitch/HUFS-One-AI/issues/341), [#373 동일 판본 충돌](https://github.com/ot4562-glitch/HUFS-One-AI/issues/373) | **이의상** FAQ AI/언어, **박준영** 독립 반례 QA | `못합니다`/`안 됩니다` 부정 회귀, 후속 #478 동료 검수·병합/원장 검증 |
| [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360) / [#446](https://github.com/ot4562-glitch/HUFS-One-AI/issues/446) 실제 자료·Gold | **김채윤** 공식 자료/권리·독립 Gold·시연 | NCP 사설 원장에 실제 출처/권리·재게시/외부 AI 송신·수정/철회 검수, 과거 공개 CSV 권리 문제 |
| [#466](https://github.com/ot4562-glitch/HUFS-One-AI/pull/466) 리뷰 gate / [#481](https://github.com/ot4562-glitch/HUFS-One-AI/pull/481) 선행 | **심민성** 통합·GitHub 설정, **작성자 아닌 동료 협업자** 실제 HEAD 승인 | #481 독립 승인→병합→#466 gate 재실행, 관리자 ruleset 활성화. 작성자 COMMENT는 승인 아님 |

**기본 운영:** 코드 리뷰/CI/일회용 PG와 실 NCP·실학교 원문·실학생/사람 Gold/사용권 승인은 분리. 합성 PASS를 운영 완료라고 표시하지 않고 `RELEASE_BLOCKED` 유지합니다. 본선 이후 고정 역할 #355–#359는 제목·본문·상태·담당을 수정하지 않으며 진행은 **새 댓글로만** 기록합니다.

## 1. 고정 팀 역할

| 담당 · GitHub 계정 | 역할 | 현재 이슈 |
| --- | --- | --- |
| **심민성** `ot4562-glitch` | 프로젝트 총괄, **모든 신규 기능의 최초 배정·구조/계약과 가능한 비AI 코어/API/DB/통합 직접 구현**, 주개발자 배정/인계, API/DB/보안 통합, 설계·구현·데이터·UI·QA·릴리스 **전 과정 검수** | [#359](https://github.com/ot4562-glitch/HUFS-One-AI/issues/359) |
| **박준영** `taewangim-alt` | AI 추천·랭킹·HCX-007·CLOVA OCR·코드 기반 AI 구현/실험, 이의상과 양방향 교차피드백, **AI 제품 기술 QA·정확도/오류 분석·수정 후 재시험** | [#356](https://github.com/ot4562-glitch/HUFS-One-AI/issues/356) |
| **이의상** `uisang2004-maker` | AI/NLP·OCR·문서 이해·FAQ/RAG/검색·규칙 기반 AI 구현, 박준영 모델/추천 결과의 의미·근거 검증과 **쌍방향 피드백** | [#355](https://github.com/ot4562-glitch/HUFS-One-AI/issues/355) |
| **이서연** `lhh42001` | React **UI/UX·웹 디자인 시스템·실제 기능 배치/API 연결**·데이터/포스터 콘텐츠 시각화, 사용자·팀 피드백을 제품 화면에 반영 | [#357](https://github.com/ot4562-glitch/HUFS-One-AI/issues/357) |
| **김채윤** `qamarrchae` | **실사용 동아리/공모전/학사·포스터 데이터 제작·출처·이용권·정정 관리**, 웹 디자인용 이미지/텍스트, 독립 AI Gold 정본, 직접 데이터를 입력해 **전 과정 사용자 시연·간단 이슈 제보** | [#358](https://github.com/ot4562-glitch/HUFS-One-AI/issues/358) |

- **역할 이슈 #355–#359 원래 본문·메타데이터 영구 동결:** 제목/본문/담당/라벨/마일스톤/상태를 수정하지 않는다. **본선 이후 계획·진행·인수는 해당 이슈의 새 댓글에만 작성**하고 기존 댓글은 덮어쓰거나 지우지 않는다. 별도 기능·공식자료 요청은 독립 기능/데이터 이슈에서 관리한다.
- **유연한 AI 협업:** 이의상·박준영을 LLM/비LLM으로 배타적으로 분리하지 않는다. HCX-007·CLOVA OCR·규칙/코드 기반 AI를 모두 사용할 수 있고, 모듈/기능별 주작성자 한 명과 상대 교차 리뷰어를 지정한다. 발견→상대방 피드백→수정→재시험을 양방향으로 운영한다.
- **검증 분담:** 박준영이 AI 기능 기술 QA를 담당하고, 김채윤은 본인 데이터를 사용한 **가벼운 사용자 시연·일반 이슈 제보**를 제공한다. 이서연은 UI/웹 배치를 구현한다. 일반 UI·서버의 기술적 조사 담당은 심민성이 영향 범위를 보고 지정한다.
- **데이터 규모:** 현재 대규모 자료 요청 [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)에 수집·권리/Gold 요구를 기록했다. 실제 포스터/공고 수량, 게시 허가 이미지 수, 사람 Gold 건수는 **미확정**이다. 실제 출처 수·권리·검수 비용·UI/AI의 기능별 필요량에 근거해 협의한다.

### 새 에이전트의 이슈 제목 규칙

**이슈를 만들 때 [플레이북의 최초 방문 절차](ISSUE_ASSIGNMENT_PLAYBOOK.md)를 먼저 따른다.** 제목 맨 앞을 `[추가 기능]`(심민성 최초), `[데이터 요청]`(김채윤), `[웹 구현]`(이서연), `[AI 구현]`(박준영·이의상 열린 이슈 수 기준 배정), `[AI QA]`(박준영 고정), `[기술 통합]`(심민성), `[분류 검토]`, `[버그]`, `[실증 인수]`(보류/사람 판단) 중 하나로 시작한다. 우선순위 `P0/P1/P2/P3`만 표시하고 난이도 라벨은 사용하지 않으며, `[TASK-xx]`나 `[코드 전수조사]`는 표준 접두어 뒤에 둔다.

이 봇은 **새 이슈 최초 분류·라벨·담당자만** 자동화한다. 새 기능의 AI 인계, 데이터 하위 이슈 작성/공동 담당, 사람 리뷰·AI 교차 검증은 아래 단계별 규칙으로 이어 간다. PR #382는 main에 병합됐으나 실제 자동 배정 성공은 이슈별 Actions/담당/라벨 기록으로 확인한다. [봇 세부 설정·예외](ISSUE_ROUTING_BOT.md). 팀 고정 역할 #355–#359의 **본문/제목/담당/라벨/상태를 봇도 절대 변경하지 않으며, 진행 기록은 새 댓글만 허용**한다.

**신규 규칙:** `[버그][코드 전수조사]`는 `type:bug`·`source:code-audit`를 표시하되 분류가 불명확하면 사람 검토, `[실증 인수]`는 독립 실제 환경/사람·권리/비용 검증으로 자동 배정·완료 처리하지 않는다. `P0`(또는 `priority:P0`)와 보안·개인정보 신고는 `triage:needs-review`로 자동 담당 배정을 보류한다. 비밀·실학생 자료·취약점 세부 내용은 공개 이슈가 아닌 비공개 채널로 전달한다. 새 표준 접두어의 단일 정본은 [라우팅 설정](../.github/issue-routing.json)이며, 데이터 정정에는 `[데이터 요청][정정]`을 사용한다.

## 2. 이슈 자동 배정·단계별 개발 절차

**신규 에이전트는 [ISSUE_ASSIGNMENT_PLAYBOOK](ISSUE_ASSIGNMENT_PLAYBOOK.md)을 실행 기준으로 사용**한다. [이슈 생성시 최초 자동 배정 workflow](../.github/workflows/issue-initial-routing.yml)와 [이슈 작성 양식](../.github/ISSUE_TEMPLATE/)을 함께 사용한다. AI/데이터 필요 여부 판단과 공동 assignee/인계는 에이전트가 수행한다. 담당자를 추측해 역할 이슈에 작업을 적는 대신 별도 기능/데이터 이슈를 생성한다.

1. **최우선 보호:** #355–#359 및 `[본선 진출 이후]`·`[본선진출이후]` 접두어 이슈는 **원래 제목/본문/담당·라벨/마일스톤/상태를 변경하지 않는다**. 계획/업데이트/이관은 **새 댓글 추가만 허용**한다(기존 댓글 수정·삭제 금지). API 수정 전 이슈 번호·제목을 재조회하고 보호 대상이면 업데이트를 중단한다. 2026-11-09 #359 본문 수정은 규정 위반으로 복구했고 작업 내용은 [정정 댓글](https://github.com/ot4562-glitch/HUFS-One-AI/issues/359#issuecomment-6739957305)에 옮겼다.
2. **신규 기능 최초 담당은 심민성:** `[추가 기능]` 또는 `[추가기능]` 이슈를 만들면 `ot4562-glitch`을 먼저 배정한다. 심민성이 현재 repo/Core/Contracts/API/DB·보안/개인정보·UI 구조를 분석해 **가능한 코드와 테스트를 직접 구현**한다. 사용 가능 시간/기술 범위 내에서 설계뿐 아니라 비AI 기능·서버·통합을 계속 담당한다.
3. **자료가 필요하면 독립 데이터 요청과 공동 배정:** `[데이터 요청][김채윤]` 새 이슈를 별도 발행한다(담당 `qamarrchae`). 공식 공고·포스터·학사/기관 규정·이미지 게시/외부 모델 사용권·독립 Gold·필드/판본·웹 디자인용 자산을 구체적으로 요청한다. 원 기능 이슈에도 **김채윤을 공동 assignee**로 추가하고 이슈를 상호 링크한다. 최초 기능 assignees=`[ot4562-glitch,qamarrchae]`. 13개 기존 기능의 자료는 [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)에서 함께 요청 중이다.
4. **코드 기반 AI까지 무조건 AI 개발자에게 인계:** HCX-007, CLOVA OCR, NLP/RAG, 의미 매칭뿐 아니라 **규칙·점수·가중치·분류·검색 관련도·랭킹·추천·예측/ML 등 AI 기능 코어**가 시작되면 `taewangim-alt` 또는 `uisang2004-maker`를 **AI 주구현자**로 지정한다. 기능 assignee를 `[AI 주담당]`+(데이터 필요 시 `qamarrchae`)로 바꾸며, 상대 AI 개발자는 교차 리뷰/반례를 제공한다. **심민성은 비AI 코드·통합을 계속 개발하고 전체 단계의 상위 검수를 유지한다.** AI가 없는 기능은 심민성이 구현 주담당을 계속 맡는다.
5. **웹·품질·사용자 시연:** 이서연은 김채윤 자료/디자인 자산을 활용한 React UI·실제 API 배치, 박준영은 AI 기술 QA와 수정 후 재시험, 김채윤은 데이터 직접 투입·가벼운 전체 사용자 시연/이슈 제보, 이의상·박준영은 상호 정확도 피드백, 심민성은 일반 기술 조사 담당 지정과 전체 코드 리뷰를 진행한다.
6. **인수:** 단계와 기여 코드는 해당 `[추가 기능]` 이슈 댓글·PR에, 데이터 요청/권리·원장/Gold 상태는 독립 `[데이터 요청]` 이슈에 기록한다. 합성 코어/CI/PR OPEN과 실서비스 인수를 구분한다.

## 3. 현재 추가 기능의 구조 인계/구현 담당 스냅샷

심민성의 초기 구조·합성 코어는 **이미 병합된** [PR #342](https://github.com/ot4562-glitch/HUFS-One-AI/pull/342), [PR #353](https://github.com/ot4562-glitch/HUFS-One-AI/pull/353)에서 확인할 수 있다. **기능 인수는 각 이슈의 최신 인계 댓글**이 우선한다.

| 본기능 구현 주담당 | 개별 추가 기능 이슈 |
| --- | --- |
| **박준영 — 6개** | [#339 활동 아카이브/연례 예측](https://github.com/ot4562-glitch/HUFS-One-AI/issues/339), [#340 교환 자격 비교](https://github.com/ot4562-glitch/HUFS-One-AI/issues/340), [#344 멘토 추천](https://github.com/ot4562-glitch/HUFS-One-AI/issues/344), [#348 서버 공고 통합 검색](https://github.com/ot4562-glitch/HUFS-One-AI/issues/348), [#349 오픈배지 준비도](https://github.com/ot4562-glitch/HUFS-One-AI/issues/349), [#350 학습공동체 추천](https://github.com/ot4562-glitch/HUFS-One-AI/issues/350) |
| **이의상 — 7개** | [#341 FAQ/RAG](https://github.com/ot4562-glitch/HUFS-One-AI/issues/341), [#343 장학 자격 대조](https://github.com/ot4562-glitch/HUFS-One-AI/issues/343), [#345 상담 경로 안내](https://github.com/ot4562-glitch/HUFS-One-AI/issues/345), [#346 교외활동 증빙/OCR](https://github.com/ot4562-glitch/HUFS-One-AI/issues/346), [#347 NCS 역량 비교](https://github.com/ot4562-glitch/HUFS-One-AI/issues/347), [#351 취업통계/AI 설명](https://github.com/ot4562-glitch/HUFS-One-AI/issues/351), [#352 국제학생 다국어 절차](https://github.com/ot4562-glitch/HUFS-One-AI/issues/352) |

**데이터 공동 배정:** 위 13개 기능 모두 공식 원문/포스터·규정/권리·독립 Gold가 필요하여 **김채윤 `qamarrchae`가 공동 assignee**이다. [데이터 요청 #360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)은 데이터 측 담당 이슈다. 심민성은 기존 PR의 뼈대 이후에도 API/DB/비AI 코어·통합 코드를 구현 가능한 만큼 계속 이어간다.

**실제 기능 구현 상태:** PR 오픈/합성 코어 구현은 운영 서비스 인수와 다르다. 13개 기능의 완료 판정은 각각의 자료·권한·실 웹 연결·AI 품질/시연·테스트·코드 리뷰 근거를 통해 관리한다. 신규 `[추가 기능]` 제안은 동일한 심민성 최초 배정 절차를 반복한다.

## 4. 제품·출처·릴리스 품질 계약

- **채택 AI:** HCX-007 + CLOVA OCR + 규칙/코드 기반 검색·추천/자격 처리. HCX-005 신규 호출 경로 제한 [PR #354](https://github.com/ot4562-glitch/HUFS-One-AI/pull/354)는 **main에 병합**됐습니다. 실제 배포·모델 사용은 별도 운영 검증을 요구합니다.
- **자료/Gold:** 학교·기관 공식 문서의 권리·판본·시점을 기록하고 실데이터·합성 시연·모델 실측을 구분한다. 합성 정답을 독립 사람 Gold로 대체하지 않는다.
- **CSV 보존:** `csv/`에 복구된 원본 5개는 변경·삭제·이동·재인코딩·공개/CI 번들 유입을 방지한다. 현행 actor·동의·권한·출처/철회·RLS/CSRF/비밀 보호를 적용한다.
- **검수:** 심민성은 초기 구조 설계 후에도 각 개발 PR·AI 교차검증·실자료 인수·UI 결과·시연/QA·수정/재시험을 지속 검수한다. 독립 사람 검토/운영 인수 증거가 생긴 뒤 해당 기능 이슈에서 GO/HOLD를 판단한다.

**함께 읽기:** [루트 AGENTS.md](../AGENTS.md) · [STATUS](../STATUS.md) · [PR 워크플로](PR_WORKFLOW.md) · [개별 역할 이슈](https://github.com/ot4562-glitch/HUFS-One-AI/issues/359).
