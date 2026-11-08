# HUFS One AI — 현재 팀 역할·추가 기능 협업 정본

> 2026-11-08 현재 팀 운영 정책. **새 역할 이슈 #355–#359와 해당 이슈의 최신 실행 가이드 댓글만 현재 고정 역할을 정의**한다. #321–#325는 보관됐으며 과거 배정 방식·일정·담당을 현재 기준에 적용하지 않는다. 기능별 담당·실제 인수 상태의 최신 정본은 개별 `[추가 기능]` 이슈와 PR이다.

## 1. 고정 팀 역할

| 담당 · GitHub 계정 | 역할 | 현재 이슈 |
| --- | --- | --- |
| **심민성** `ot4562-glitch` | 프로젝트 총괄, **모든 신규 기능의 초기 아키텍처·계약·기본 코어 설계**, 주개발자 배정/인계, API/DB/보안 통합, 설계·구현·데이터·UI·QA·릴리스 **전 과정 검수** | [#359](https://github.com/ot4562-glitch/HUFS-One-AI/issues/359) |
| **박준영** `taewangim-alt` | AI 추천·랭킹·HCX-007·CLOVA OCR·코드 기반 AI 구현/실험, 이의상과 양방향 교차피드백, **AI 제품 기술 QA·정확도/오류 분석·수정 후 재시험** | [#356](https://github.com/ot4562-glitch/HUFS-One-AI/issues/356) |
| **이의상** `uisang2004-maker` | AI/NLP·OCR·문서 이해·FAQ/RAG/검색·규칙 기반 AI 구현, 박준영 모델/추천 결과의 의미·근거 검증과 **쌍방향 피드백** | [#355](https://github.com/ot4562-glitch/HUFS-One-AI/issues/355) |
| **이서연** `lhh42001` | React **UI/UX·웹 디자인 시스템·실제 기능 배치/API 연결**·데이터/포스터 콘텐츠 시각화, 사용자·팀 피드백을 제품 화면에 반영 | [#357](https://github.com/ot4562-glitch/HUFS-One-AI/issues/357) |
| **김채윤** `qamarrchae` | **실사용 동아리/공모전/학사·포스터 데이터 제작·출처·이용권·정정 관리**, 웹 디자인용 이미지/텍스트, 독립 AI Gold 정본, 직접 데이터를 입력해 **전 과정 사용자 시연·간단 이슈 제보** | [#358](https://github.com/ot4562-glitch/HUFS-One-AI/issues/358) |

- **역할 vs 기능:** 사람별 이슈 **본문은 역할만**, 상세 작업·기술 방법·변경사항은 해당 이슈의 댓글로 유지한다. 별도의 **기능 제안 이슈**에는 기능 자체의 사양/구현 주작성자/PR/인수 근거를 기록한다.
- **유연한 AI 협업:** 이의상·박준영을 LLM/비LLM으로 배타적으로 분리하지 않는다. HCX-007·CLOVA OCR·규칙/코드 기반 AI를 모두 사용할 수 있고, 모듈/기능별 주작성자 한 명과 상대 교차 리뷰어를 지정한다. 발견→상대방 피드백→수정→재시험을 양방향으로 운영한다.
- **검증 분담:** 박준영이 AI 기능 기술 QA를 담당하고, 김채윤은 본인 데이터를 사용한 **가벼운 사용자 시연·일반 이슈 제보**를 제공한다. 이서연은 UI/웹 배치를 구현한다. 일반 UI·서버의 기술적 조사 담당은 심민성이 영향 범위를 보고 지정한다.
- **데이터 규모:** 실제 포스터/공고 수량, 게시 허가 이미지 수, 사람 Gold 건수는 **미확정**이다. 실제 출처 수·권리·검수 비용·UI/AI의 기능별 필요량에 근거해 협의한다.

## 2. 신규 `[추가 기능]` 이슈의 강제 2단계 소유권

1. **최초 배정 = 심민성 `ot4562-glitch`:** 제목이 `[추가 기능]` 또는 `[추가기능]`으로 시작하는 새 제안은 최초 assignee가 심민성이다. 먼저 관련 Core/Contracts/API/DB/Web 및 출처·보안 경계를 검토한다.
2. **구조 설계 = 심민성:** 아키텍처, 재사용 코드, 기본 Core·DTO/계약, 권한·출처·불확실성, 테스트/PR 분할을 결정한다. 구조를 설명하는 댓글 또는 확인 가능한 코드/PR을 기능 이슈에 남긴다.
3. **실제 개발자 인계 = 박준영 또는 이의상:** 구조가 만들어졌으면 두 AI 개발자 중 **주담당 1명에게 GitHub assignee를 변경**한다. 댓글에 현재 기능 요구사항·설계/PR 링크·구현 주도자·교차 리뷰어를 남긴다. 심민성은 전체 코드/제품 검수를 계속한다.
4. **협력:** 데이터·독립 Gold/디자인 자산은 김채윤, 웹 UI·기능 배치는 이서연, AI 정확도 기술 QA는 박준영, AI 결과·문장 의미의 교차 검토는 이의상/박준영이 수행한다. 필요한 업무는 기능의 실제 요구에 따라 조정한다.
5. **지속 개선·인수:** 설계→구현/테스트→자료·UI 연결→김채윤 사용자 시연/박준영 AI QA→이의상↔박준영 피드백→수정·재시험→총괄/독립 코드 리뷰/CI→운영 인수. 실자료·실모델·배포·QA가 미측정이면 그대로 `NOT_RUN/NOT_CONNECTED/RELEASE_BLOCKED`로 표시한다.

## 3. 현재 추가 기능의 구조 인계/구현 담당 스냅샷

심민성의 초기 구조·합성 코어는 열린 [PR #342](https://github.com/ot4562-glitch/HUFS-One-AI/pull/342), [PR #353](https://github.com/ot4562-glitch/HUFS-One-AI/pull/353)에서 확인할 수 있다. **기능 인수는 각 이슈의 최신 인계 댓글**이 우선한다.

| 본기능 구현 주담당 | 개별 추가 기능 이슈 |
| --- | --- |
| **박준영 — 6개** | [#339 활동 아카이브/연례 예측](https://github.com/ot4562-glitch/HUFS-One-AI/issues/339), [#340 교환 자격 비교](https://github.com/ot4562-glitch/HUFS-One-AI/issues/340), [#344 멘토 추천](https://github.com/ot4562-glitch/HUFS-One-AI/issues/344), [#348 서버 공고 통합 검색](https://github.com/ot4562-glitch/HUFS-One-AI/issues/348), [#349 오픈배지 준비도](https://github.com/ot4562-glitch/HUFS-One-AI/issues/349), [#350 학습공동체 추천](https://github.com/ot4562-glitch/HUFS-One-AI/issues/350) |
| **이의상 — 7개** | [#341 FAQ/RAG](https://github.com/ot4562-glitch/HUFS-One-AI/issues/341), [#343 장학 자격 대조](https://github.com/ot4562-glitch/HUFS-One-AI/issues/343), [#345 상담 경로 안내](https://github.com/ot4562-glitch/HUFS-One-AI/issues/345), [#346 교외활동 증빙/OCR](https://github.com/ot4562-glitch/HUFS-One-AI/issues/346), [#347 NCS 역량 비교](https://github.com/ot4562-glitch/HUFS-One-AI/issues/347), [#351 취업통계/AI 설명](https://github.com/ot4562-glitch/HUFS-One-AI/issues/351), [#352 국제학생 다국어 절차](https://github.com/ot4562-glitch/HUFS-One-AI/issues/352) |

**실제 기능 구현 상태:** PR 오픈/합성 코어 구현은 운영 서비스 인수와 다르다. 13개 기능의 완료 판정은 각각의 자료·권한·실 웹 연결·AI 품질/시연·테스트·코드 리뷰 근거를 통해 관리한다. 신규 `[추가 기능]` 제안은 동일한 심민성 최초 배정 절차를 반복한다.

## 4. 제품·출처·릴리스 품질 계약

- **채택 AI:** HCX-007 + CLOVA OCR + 규칙/코드 기반 검색·추천/자격 처리. HCX-005 신규 호출 경로 제한은 [PR #354](https://github.com/ot4562-glitch/HUFS-One-AI/pull/354)에서 작업 중이며 배포 적용 여부를 PR/HEAD로 확인한다.
- **자료/Gold:** 학교·기관 공식 문서의 권리·판본·시점을 기록하고 실데이터·합성 시연·모델 실측을 구분한다. 합성 정답을 독립 사람 Gold로 대체하지 않는다.
- **CSV 보존:** `csv/`에 복구된 원본 5개는 변경·삭제·이동·재인코딩·공개/CI 번들 유입을 방지한다. 현행 actor·동의·권한·출처/철회·RLS/CSRF/비밀 보호를 적용한다.
- **검수:** 심민성은 초기 구조 설계 후에도 각 개발 PR·AI 교차검증·실자료 인수·UI 결과·시연/QA·수정/재시험을 지속 검수한다. 독립 사람 검토/운영 인수 증거가 생긴 뒤 해당 기능 이슈에서 GO/HOLD를 판단한다.

**함께 읽기:** [루트 AGENTS.md](../AGENTS.md) · [STATUS](../STATUS.md) · [PR 워크플로](PR_WORKFLOW.md) · [개별 역할 이슈](https://github.com/ot4562-glitch/HUFS-One-AI/issues/359).
