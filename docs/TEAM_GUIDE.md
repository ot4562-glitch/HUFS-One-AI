# HUFS One AI — 팀원이 설명하는 현재 서비스

> **2026-11-09 현행 정본:** [STATUS](../STATUS.md) · [팀 역할](WORKSTREAMS.md) · [PR/이슈 감사](REVIEW_AND_ISSUE_AUDIT_20261109.md). 기존 작업 PR 17건 병합·현재 OPEN PR 0건·OPEN 이슈 28건(고정 역할 5건 포함)이며 제품은 `RELEASE_BLOCKED`입니다. 아래 2026-11-06~08 수치와 #321–#325는 역사적 배정 기록입니다. 자동 라우팅 봇 #382는 main에 병합됐으나 실제 이벤트별 성공/운영 권한은 별도로 검증합니다.

**HUFS One AI는 공식 학교 시스템이 아닌 독립 학생 프로젝트**입니다. 학생의 맞춤 기회·공지·마감·학업/졸업 계획을 **근거와 불확실성을 함께** 보여 주는 제품을 개발합니다. 현재는 합성 시연과 검증용 코드 단계이며 공개 운영 `RELEASE_BLOCKED`입니다.

**과거 PR 증거(#292/#293/#295/#304)와 최신 통합:** [PR #306](https://github.com/ot4562-glitch/HUFS-One-AI/pull/306)에서 본선 전 11개를 종결하고 [PR #307](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307)에서 합성 홈 3단계/공고 검색·필터·정렬을 추가(정확한 PR HEAD 및 병합 main `d8e2144` Actions 각 4/4 PASS). 실제 학교 계정·NCP/학사 원장/사람 인수는 여전히 NOT_RUN/RELEASE_BLOCKED. 이하 기존 개별 근거: [PR #292](https://github.com/ot4562-glitch/HUFS-One-AI/pull/292)(학업 독립 참조모형·탐색 예산) · [PR #293](https://github.com/ot4562-glitch/HUFS-One-AI/pull/293)(학사공지 SourceRevision/mock claim·clean HEAD 벤치) · [PR #295](https://github.com/ot4562-glitch/HUFS-One-AI/pull/295)(교과코드 미확인 원장/전망 `forecast-offering-v3`, API `NOT_CONNECTED`) · [PR #304](https://github.com/ot4562-glitch/HUFS-One-AI/pull/304)(공통 UI/발표 S04·공개 합성 Pages 자동배포 유지). 실제 학교 인증·팀원 4명 개인별 데이터/학수번호 132개 공식 매핑·NCP/PG/CLOVA 실행·포스터/모바일/스크린리더 사람 인수는 `NOT_RUN/CONFIGURATION_REQUIRED` 또는 미완료입니다. 운영 제품은 `RELEASE_BLOCKED`이며, 공개 GitHub Pages는 **실자료·외부 AI 호출 없는 합성 시연**으로 `main` push 때 자동 배포를 계속합니다. 원본 `csv/` 다섯 파일은 내용·경로/이름·인코딩·추적 상태를 그대로 유지합니다. 학생용 실제 학교 로그인(#297/#299), 박준영 학사 수집자료의 서버/화면 적용(#301), 모델 실호출·캐시 재생 증빙(#302)은 아직 준비가 필요합니다.

## 처음 합류한 에이전트·팀원의 이슈 작성

기능/버그를 발견하면 먼저 [루트 AGENTS](../AGENTS.md)와 [이슈 배정 플레이북](ISSUE_ASSIGNMENT_PLAYBOOK.md)을 읽고 기존 이슈/PR 중복을 확인하세요. **제목 맨 앞에 `[추가 기능]` / `[데이터 요청]` / `[웹 구현]` / `[AI 구현]` / `[AI QA]` / `[기술 통합]` 중 알맞은 접두어를 붙이세요.** 어느 분야가 책임져야 할지 모르면 `[분류 검토]`, `[버그]`, `[실증 인수]`로 작성하면 사람 검토 대상으로 남습니다. AI가 포함된 **신규 기능 전체**는 항상 `[추가 기능]`으로 시작해 심민성 최초 구현·별도 데이터 요청·AI 인계를 거칩니다.

우선순위 `P0/P1/P2/P3`와 작업 강도 `effort:S/M/L`은 별도로 표기하고, 정확한 재현·수용 기준과 실자료/권리 경계를 적으세요. `[TASK-xx]`만으로는 자동 배정이 보장되지 않습니다. 자동화는 [봇 설명](ISSUE_ROUTING_BOT.md) 및 PR #382의 병합 상태를 확인하세요. **역할 이슈 #355–#359는 절대 수정하지 않습니다.**

**신규 규칙:** `[버그][코드 전수조사]`는 `type:bug`·`source:code-audit`를 표시하되 분류가 불명확하면 사람 검토, `[실증 인수]`는 독립 실제 환경/사람·권리/비용 검증으로 자동 배정·완료 처리하지 않는다. `P0`(또는 `priority:P0`)와 보안·개인정보 신고는 `triage:needs-review`로 자동 담당 배정을 보류한다. 비밀·실학생 자료·취약점 세부 내용은 공개 이슈가 아닌 비공개 채널로 전달한다. 새 표준 접두어의 단일 정본은 [라우팅 설정](../.github/issue-routing.json)이며, 데이터 정정에는 `[데이터 요청][정정]`을 사용한다.

## 현재 업무·추가 기능 인계 (2026-11-09)

팀원의 현행 고정 역할 이슈 **#355–#359는 이제 읽기 전용**이다. 제목·본문·댓글·담당자·상태를 변경하지 않는다. 상세 실행은 [팀 운영 정본](WORKSTREAMS.md)과 [에이전트 자동 배정 플레이북](ISSUE_ASSIGNMENT_PLAYBOOK.md), 실제 데이터 요청은 [#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)에서 관리한다.

| 사람 | 현행 역할·이슈 |
| --- | --- |
| **심민성** | [#359](https://github.com/ot4562-glitch/HUFS-One-AI/issues/359) — 전체 코드/품질 검수, 신규 기능 **최초 배정·가능한 일반 Core/API/DB/계약/통합 실제 구현**, AI 교차 작업 인계 |
| **박준영** | [#356](https://github.com/ot4562-glitch/HUFS-One-AI/issues/356) — 추천·규칙/코드 기반 AI·HCX-007/OCR 개발, 이의상 교차 피드백, **AI 제품 기술 QA·재시험** |
| **이의상** | [#355](https://github.com/ot4562-glitch/HUFS-One-AI/issues/355) — NLP/OCR·RAG·모델/코드 기반 AI 개발, 박준영의 추천·언어·근거 결과 교차 검증 |
| **이서연** | [#357](https://github.com/ot4562-glitch/HUFS-One-AI/issues/357) — 웹 UI/UX·React·실제 API/기능 배치, 데이터 기반 콘텐츠·포스터 디자인 |
| **김채윤** | [#358](https://github.com/ot4562-glitch/HUFS-One-AI/issues/358) — 공식 실데이터/포스터·출처권리·독립 Gold·웹 디자인 자산, 데이터를 직접 넣어 가볍게 사용자 시연·이슈 제보 |

**기능/데이터 배정 규칙:** 새 `[추가 기능]` 이슈에는 심민성이 최초로 배정되어 구현 가능한 **비AI 부분을 직접 최대한 진행**한다. 추천/랭킹·규칙/코드 기반 AI·RAG/OCR 등 AI 개발이 겹치면 이의상 또는 박준영 중 주작성자에게 구현을 인계한다. 공식 자료·포스터/Gold가 필요하면 **새 `[데이터 요청]` 이슈**를 김채윤에게 만들고 원 기능에도 김채윤을 공동 담당자로 추가한다. 현재 13개 추가 기능의 데이터는 #360으로 관리하며 **13개 모두 김채윤 공동 assignee**다.

**발표/시연 흐름:** 김채윤은 데이터를 넣고 사용자의 눈으로 기능을 가볍게 시연해 이슈를 제보한다. 박준영의 **AI 기술 QA·정량 정확도/재시험**은 별도로 진행한다. 이서연은 화면 연결·디자인 개선, 이의상과 박준영은 AI 결과 교차 피드백, 심민성은 기획부터 통합/릴리스까지 상시 검수한다.

### 과거 업무 배정 기록의 읽기 원칙

아래의 2026-11-06~07 자료는 당시 설계/구현·발표 방향의 **역사적 참고 기록**이다. 포함된 #317·#321–#325 역할/진척·인수 책임은 현재 담당자를 뜻하지 않으며 최신 배정은 위 표와 각 추가기능 이슈의 최신 댓글이 우선한다.

## 한눈에 보는 흐름

1. **화면 선택:** 데스크톱 HUFSAbility 참고 대분류 11개 GNB/실제 화면 LNB(휴대폰 하단 5탭), HUFSAbility 원 메뉴는 이름/순서만 참고·미지원. 학교 원본 UI/계정을 복제하지 않는다.
2. **상태/대상 선택:** 현재 상단 가상 대상 선택기는 합성 시연이며 실제 학교 로그인은 별도임을 알리고, 로그인 actor와 시연 대상 가상 슬롯을 구분하고, 허가된 공고/학업 원장만 표시. A→B·RESET·철회 시 다른 학생의 캐시를 즉시 비움.
3. **추천·달력:** 같은 40개 가상 공고/10개 공지를 다른 관심·경험/전공으로 정렬하고 지원 조건·출처·수정판·확정 마감/미정·학생 일정 분리.
4. **AI 보조:** 출처·동의 확인 후 OCR/RAG·필요한 HCX 후보를 검증된 인용·JSON/수치·코드 판정과 결합. AI가 지원 적격·졸업·수상 결과를 확정하지 않음.
5. **학업:** 취득/수강 중/계획 학점과 What-if를 구분하고 규칙이 불명확하면 `UNKNOWN/NEEDS_REVIEW`. 학과/학사지원팀 공식 판정과 다름.
6. **운영:** React→Fastify→PostgreSQL→Source/AI·별도 NCP를 안전하게 조립할 코드가 존재해도 실계정·자료권리/서버비용/보안/사람 인수는 아직 남음.

## 본선 진출 전 역할 기록 (현행 업무 분장 아님)

심민성: 전체 API/DB·권한·Source/AI/NCP 관련 **코드**, 이의상: UI/접근성, 김채윤: 추천·공지, 박준영: 학사/전망, 이서연: **NCP 계정/요금/서버 비코드 운영**. 서로의 계약과 결과를 교차 검수합니다.

## 과거 본선 진출 전/후 역할 및 점검 이슈 (현재 배정 아님)

| 담당 | 본선 진출 전 — 정리 종결(CLOSED) | 본선 진출 이후 — 실제 운영/실자료 수락 |
| --- | --- | --- |
| 이의상 UI/접근성 | [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119), [#258](https://github.com/ot4562-glitch/HUFS-One-AI/issues/258) | [#280](https://github.com/ot4562-glitch/HUFS-One-AI/issues/280) 실 BETA UI·모바일/스크린리더/학업·경험 종단 |
| 김채윤 추천/공지 | [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) 합성 코퍼스·정정/성능(순수 코어 [#259](https://github.com/ot4562-glitch/HUFS-One-AI/issues/259)는 완료) | [#281](https://github.com/ot4562-glitch/HUFS-One-AI/issues/281) 실제 허가 출처·추천 정확성 주장 방지/운영 실측 |
| 박준영 학업 | [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11), [#260](https://github.com/ot4562-glitch/HUFS-One-AI/issues/260) 합성/교차 검토; #260 PR #262 정책/테스트 완료, 소비자 리뷰는 미완료 | [#282](https://github.com/ot4562-glitch/HUFS-One-AI/issues/282) 공식 RulePack·4인 학업 원장·8학기 개설 실증 |
| 이서연 비코드/운영 | [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#261](https://github.com/ot4562-glitch/HUFS-One-AI/issues/261) 계정·비용·권리 사전검토/문서 | [#283](https://github.com/ot4562-glitch/HUFS-One-AI/issues/283) 실 NCP 계정·청구/복구/반납·실원본 이용권 검수 |

**공통 원칙:** 본선 전 지정 11개 이슈는 CLOSED(10 completed, #260 사람 검토 이관 not_planned)입니다. 본선 이후에는 **#321~#325 개인별 이슈 + #317 추가 기능(심민성), 총 6개가 OPEN·담당 지정**됐습니다. #316은 원본 요구 이관 후 CLOSED. 실제 NCP·SQL/AI/비밀키/학업 원본·사람 인수는 증거 전 NOT_RUN이며, 심민성이 통합 품질을 총괄합니다.

본선 이후의 업무 분장은 이미 확정했으나, 검증된 운영 환경·실자료·실서버 권리/비용 준비가 되기 전에는 합성 화면/코어 테스트와 UX·문서/보안/비용 사전 계획만 수행합니다. 실제 허가된 학생 경험은 비공개 서버에서만 처리합니다.

## 발표에서 답해야 하는 10가지

1. 학교 공식 서비스와 어떤 관계인가?
2. 왜 학생마다 다른 추천이 필요한가?
3. 추천 적격/마감/학점과 AI 문장을 누가 확정하는가?
4. 가상 5슬롯과 실원본 4명은 왜 다른가?
5. 선택·로그아웃·권한 철회가 발생하면 어떻게 캐시를 비우는가?
6. 원본·학칙의 권리/출처/판본·asOf는 어떻게 보존하는가?
7. 어떤 부분이 실제로 동작하고 어떤 것이 합성/미지원인가?
8. 생성형 AI와 개발 과정의 바이브코딩을 어떻게 검증하는가?
9. NCP의 비용/CPU/RSS·보안·실재 원본 전송을 누가 승인하는가?
10. 실제 서비스 공개를 위한 인적 Gold·접근성·D03 출시 조건은 무엇인가?

**실제 팀원 재설명·60초/10분 발표 및 5분 질의응답 인수는 아직 미완료**이며 [김채윤 #324](https://github.com/ot4562-glitch/HUFS-One-AI/issues/324)에 증거를 남깁니다. 기획 요약 [README](../README.md) · 실행 [DEMO_MANUAL](DEMO_MANUAL.md).


## 처음 참여하는 비전공자에게 보여 줄 중요 문서 (2026-11-06)

1. [NCP 서버 개설·기본 보안](BEGINNER_NCP_SERVER_SETUP.md) — 콘솔/VPC/SSH/비용/반납.
2. [NCP 제품·GPT(Codex)·Claude Code 설치](BEGINNER_NCP_PRODUCT_AND_AGENTS.md) — 합성 미리보기와 운영/개발 에이전트 차이.
3. [제품 구조·추천·학업·AI 흐름](BEGINNER_PRODUCT_ARCHITECTURE.md) — 10분 발표/비전공 용어집.

**현재(2026-11-07, #318→#323 통합 반영):** 본선 이전 11개와 PR #306/#307은 종료/병합 이력입니다. **OPEN은 #321/#322/#323/#324/#325/#317 여섯 개, 전부 assignee 지정**. 구 #316 및 과거 #280~#283/#297~#303/#310~#314는 이관/보관 CLOSED이며 실서비스 RELEASE_BLOCKED는 유지합니다.
