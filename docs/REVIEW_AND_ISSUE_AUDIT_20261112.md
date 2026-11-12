# HUFS One AI — 2026-11-12 PR·Issue 전체 재감사 (NCP 연결 전)

> **정본 날짜: 2026-11-12 KST.** 이 표는 이번 사용자의 전수조사 요청에서 직접 조회한 GitHub 상태와 실제 리뷰/병합·이슈 댓글 쓰기 증거를 기록합니다. 11월 8/9/11일 역사적 원장은 보존합니다. 날짜 이후의 실시간 수는 [Pull requests](https://github.com/ot4562-glitch/HUFS-One-AI/pulls) / [Issues](https://github.com/ot4562-glitch/HUFS-One-AI/issues)를 다시 확인하세요.

## 1. 숫자와 작업 결과

|항목|작업 착수 당시|이번 처리 뒤|
|---|---:|---:|
|열린 PR|36|**33** (아래 3개 실제 병합)|
|열린 일반 Issue (PR 제외)|31|**30** (#427 단독 완료)|
|착수 당시 열린 PR 중 공식 GitHub 리뷰/병합 처리|기존 23개 리뷰, 신규 13개 리뷰 없음|**36/36**: 기존 23개에는 이미 COMMENT/승인/변경요청 기록, 신규 13개에는 최신 HEAD COMMENT 제출|
|새로 기록한 이슈별 점검|초기 31건|**31/31**: #427 종료 기록, 나머지 30건에는 현재 OPEN 사유 댓글 추가|

**GitHub main에 실제 squash 병합:** [#463](https://github.com/ot4562-glitch/HUFS-One-AI/pull/463) `7fff790` (권리/URL·quota 오류, 독립 최신 HEAD 승인/CI 8/8), [#470](https://github.com/ot4562-glitch/HUFS-One-AI/pull/470) `b72638e` (Top-K, 독립 최신 HEAD 승인/CI 7/7), [#465](https://github.com/ot4562-glitch/HUFS-One-AI/pull/465) `b3d6d47` (인증된 PG 카탈로그 원장 포트, 독립 최신 HEAD 승인/CI 6/6). 이 셋은 **실 NCP 배포·운영 데이터 활성화가 아님**.

**일반 이슈 #427만 `state=closed, state_reason=completed`:** [#485](https://github.com/ot4562-glitch/HUFS-One-AI/pull/485) merged + 최신 HEAD 7/7 CI 및 목적/캠퍼스/언어·actor/느린 응답 JSDOM 6건, 현재 main requestVersion guard를 재확인해 종료. #345 상담기관 공식 데이터·서비스 인수는 계속 OPEN.

## 2. 열린 기존 PR 20건 — 이전 COMMENT/승인 상태와 2026-11-12 미병합 이유

**주의:** 최초의 과거 23개 reviewed PR 중 3개 (#463/#465/#470)를 이번에 병합했으므로, 아래 20개는 기존에 리뷰가 있었더라도 별도 최신 독립 승인/의존성 조치가 필요합니다.

|PR|범위|차단/후속|
|---|---|---|
|[#431](https://github.com/ot4562-glitch/HUFS-One-AI/pull/431)|WIStimetable CodeQL 블록 절단|#482 미해결 변경 요청·부모 우선|
|[#444](https://github.com/ot4562-glitch/HUFS-One-AI/pull/444)|공개 웹 수집 정책 확대|권리/robots·기관별 실제 승인·가드 교차 검증 대기|
|[#464](https://github.com/ot4562-glitch/HUFS-One-AI/pull/464)|NCP 원문/판본 preflight|rights·추출/동시 버전 사용권 실검증 대기|
|[#466](https://github.com/ot4562-glitch/HUFS-One-AI/pull/466)|독립 최신 HEAD reviewer gate|#481 부트스트랩 미병합 / CI BOOTSTRAP_PENDING|
|[#467](https://github.com/ot4562-glitch/HUFS-One-AI/pull/467)|오프라인 Cheerio parser|수집 권리·입출력 검토 대기|
|[#468](https://github.com/ot4562-glitch/HUFS-One-AI/pull/468)|HWP/HWPX parser|후속 #474 스택·파일 경계 리뷰 대기|
|[#469](https://github.com/ot4562-glitch/HUFS-One-AI/pull/469)|학생 공고 board adapters|권리/약관·게시판 형식 검증 대기|
|[#471](https://github.com/ot4562-glitch/HUFS-One-AI/pull/471)|권리 PG keyset HMAC cursor|#465 병합 뒤 부모 squash/5,100 lookahead 통합 검증 필요|
|[#472](https://github.com/ot4562-glitch/HUFS-One-AI/pull/472)|MVCC 원자 keyset|#471 선행·PG 풀 연결 압박(동료 COMMENT) 개선 필요|
|[#473](https://github.com/ot4562-glitch/HUFS-One-AI/pull/473)|빈 큐 vs lock busy|PG 경합/운영 오류 인수 대기|
|[#474](https://github.com/ot4562-glitch/HUFS-One-AI/pull/474)|HWP parser DB 검토 저장|#468 선행 병합·실원장/마이그레이션 인수 대기|
|[#476](https://github.com/ot4562-glitch/HUFS-One-AI/pull/476)|NCP 전 코드 대규모 통합|89파일 중복/계층 스택 충돌·검증·부트스트랩 의존성|
|[#477](https://github.com/ot4562-glitch/HUFS-One-AI/pull/477)|고정 Crawlee 취득·원문 보존|#476 부모/rights preflight 검토 필요|
|[#478](https://github.com/ot4562-glitch/HUFS-One-AI/pull/478)|FAQ 동일판본 권리 충돌 격리|독립 승인·#373 종료 인수 대기|
|[#479](https://github.com/ot4562-glitch/HUFS-One-AI/pull/479)|Crawlee 요청 전 rights/robots/비용 gate|#477 부모 후 fresh CI/review|
|[#480](https://github.com/ot4562-glitch/HUFS-One-AI/pull/480)|macro-F1/Recall/MRR/span 평가|독립 모델/Gold 리뷰 및 실제 실험 대기|
|[#481](https://github.com/ot4562-glitch/HUFS-One-AI/pull/481)|독립 reviewer gate bootstrap|정확 HEAD 비작성자 APPROVED 선행 필요|
|[#482](https://github.com/ot4562-glitch/HUFS-One-AI/pull/482)|timetable comment/campus 필터|#431 자식 / 협업자 CHANGES_REQUESTED 미해결|
|[#483](https://github.com/ot4562-glitch/HUFS-One-AI/pull/483)|FAQ 한국어 못하다/안되다 극성|실 FAQ 반례/타인 HEAD 승인 대기|
|[#484](https://github.com/ot4562-glitch/HUFS-One-AI/pull/484)|문서 정합성·감사 원장|본 감사 갱신 후 문서 PR fresh CI/타인 승인 필요|

**구체적 병합 순서와 차단:** #481 reviewer bootstrap은 협업자 승인 전 **병합 불가**, 그 뒤 #466 trusted 검사 성공·독립 HEAD/관리자 설정 후 병합. #482는 현재 동료 `CHANGES_REQUESTED` (스크립트·주석 순서 문제)라서 #431에 바로 합치면 안 됩니다. #471은 #465가 squash 병합된 뒤 부모/중복·5,100 lookahead 한도 관련 수정 반영/새 CI를 확인하고 #472는 동료 검토에서 드러난 **PG 2연결/풀 압박**을 해결해야 합니다. #476 대규모 통합은 #444/#463/#465/#470 등과 코드를 비교해 이미 병합된 변경을 중복 덮어쓰지 않습니다.

## 3. 13개 신규 PR #486–#498 — 실제 이번 공식 COMMENT 리뷰 기록

아래 13개는 **각 최신 HEAD의 GitHub Actions 7/7 성공**을 확인하고 공식 `COMMENT` 리뷰를 제출했습니다. 작성자 자기 COMMENT는 제3자의 `APPROVED`가 아니므로 모두 미병합, 실제 NCP·기관권리/Gold/학생 QA도 별도입니다.

|PR|관련 이슈|합성/기능 검증 범위|
|---|---|---|
|[#486](https://github.com/ot4562-glitch/HUFS-One-AI/pull/486)|[#348](https://github.com/ot4562-glitch/HUFS-One-AI/issues/348)|커서 409/422·쿼터 429/KST·205건 회귀|
|[#487](https://github.com/ot4562-glitch/HUFS-One-AI/pull/487)|[#340](https://github.com/ot4562-glitch/HUFS-One-AI/issues/340)|교환학생 최대 3개 대학 비교/서류 준비|
|[#488](https://github.com/ot4562-glitch/HUFS-One-AI/pull/488)|[#339](https://github.com/ot4562-glitch/HUFS-One-AI/issues/339)|활동 조직·채널 intake/KST 아카이브|
|[#489](https://github.com/ot4562-glitch/HUFS-One-AI/pull/489)|[#341](https://github.com/ot4562-glitch/HUFS-One-AI/issues/341)|검수 FAQ 인용 링크·개인정보 게이트|
|[#490](https://github.com/ot4562-glitch/HUFS-One-AI/pull/490)|[#343](https://github.com/ot4562-glitch/HUFS-One-AI/issues/343)|장학 조건 체크리스트·권리 철회|
|[#491](https://github.com/ot4562-glitch/HUFS-One-AI/pull/491)|[#344](https://github.com/ot4562-glitch/HUFS-One-AI/issues/344)|멘토 20×30 합성 랭킹 nDCG/Recall/MRR|
|[#492](https://github.com/ot4562-glitch/HUFS-One-AI/pull/492)|[#345](https://github.com/ot4562-glitch/HUFS-One-AI/issues/345)|복합 상담목적 5개/지연응답 경합|
|[#493](https://github.com/ot4562-glitch/HUFS-One-AI/pull/493)|[#346](https://github.com/ot4562-glitch/HUFS-One-AI/issues/346)|OCR 증빙 후보 asOf/rights/owner 승인|
|[#494](https://github.com/ot4562-glitch/HUFS-One-AI/pull/494)|[#347](https://github.com/ot4562-glitch/HUFS-One-AI/issues/347)|NCS 요건·경험/분류판본 충돌 격리|
|[#495](https://github.com/ot4562-glitch/HUFS-One-AI/pull/495)|[#349](https://github.com/ot4562-glitch/HUFS-One-AI/issues/349)|오픈배지 증빙 ID 중복/충돌 격리|
|[#496](https://github.com/ot4562-glitch/HUFS-One-AI/pull/496)|[#350](https://github.com/ot4562-glitch/HUFS-One-AI/issues/350)|튜터링 마감 미검증 자격 UNKNOWN|
|[#497](https://github.com/ot4562-glitch/HUFS-One-AI/pull/497)|[#351](https://github.com/ot4562-glitch/HUFS-One-AI/issues/351)|취업통계 소표본 공개정책·표/UI 필터|
|[#498](https://github.com/ot4562-glitch/HUFS-One-AI/pull/498)|[#352](https://github.com/ot4562-glitch/HUFS-One-AI/issues/352)|국제학생 다국어 번역/체크리스트 판본|

**추가 코드 리뷰에서 발견한 #498 후속:** `reconcileGuideChecklist`에서 구형 `saved.locale`/ `saved.translationVersion`가 모두 누락된 레거시 경로는 번역판본 변화에도 `READY`일 수 있습니다. 본인용 지속 저장 API/DTO가 실제 번역 `translationVersion`을 반환·검증하도록 연결하고, 구형 체크리스트 재검토 후 실서비스 체크리스트 판본 인수를 하십시오. 이번 감사에서 이 점을 PR의 공식 COMMENT 리뷰로 남겼습니다.

## 4. 처음 열려 있던 기능 이슈 13건 — 전체 OPEN

|Issue|자체 코드/테스트 PR|남은 공식·NCP/사람 인수|
|---|---|---|
|[#339](https://github.com/ot4562-glitch/HUFS-One-AI/issues/339)|[#488](https://github.com/ot4562-glitch/HUFS-One-AI/pull/488)|단체 행사 원문/게시권·실연도 Gold|
|[#340](https://github.com/ot4562-glitch/HUFS-One-AI/issues/340)|[#487](https://github.com/ot4562-glitch/HUFS-One-AI/pull/487)|파견교·학교 모집/학기·어학 실규정|
|[#341](https://github.com/ot4562-glitch/HUFS-One-AI/issues/341)|[#489](https://github.com/ot4562-glitch/HUFS-One-AI/pull/489)|공식 FAQ·HCX-007·사람 Gold/인용|
|[#343](https://github.com/ot4562-glitch/HUFS-One-AI/issues/343)|[#490](https://github.com/ot4562-glitch/HUFS-One-AI/pull/490)|장학 요강·학적/소득 동의/권리|
|[#344](https://github.com/ot4562-glitch/HUFS-One-AI/issues/344)|[#491](https://github.com/ot4562-glitch/HUFS-One-AI/pull/491)|멘토 등록·연락 동의/독립 Gold|
|[#345](https://github.com/ot4562-glitch/HUFS-One-AI/issues/345)|[#492](https://github.com/ot4562-glitch/HUFS-One-AI/pull/492)|실상담기관·공식 신청 경로/실학생 QA|
|[#346](https://github.com/ot4562-glitch/HUFS-One-AI/issues/346)|[#493](https://github.com/ot4562-glitch/HUFS-One-AI/pull/493)|private OCR/인정 증빙 권리·owner RLS|
|[#347](https://github.com/ot4562-glitch/HUFS-One-AI/issues/347)|[#494](https://github.com/ot4562-glitch/HUFS-One-AI/pull/494)|실 NCS 분류/개인 경험/독립 Gold|
|[#348](https://github.com/ot4562-glitch/HUFS-One-AI/issues/348)|[#486](https://github.com/ot4562-glitch/HUFS-One-AI/pull/486)|전체 승인 원장 PG/NCP·실검색/성능|
|[#349](https://github.com/ot4562-glitch/HUFS-One-AI/issues/349)|[#495](https://github.com/ot4562-glitch/HUFS-One-AI/pull/495)|발급기관 규정·실배지/issuer receipt|
|[#350](https://github.com/ot4562-glitch/HUFS-One-AI/issues/350)|[#496](https://github.com/ot4562-glitch/HUFS-One-AI/pull/496)|학습 모집 마감·정원/학적 동의|
|[#351](https://github.com/ot4562-glitch/HUFS-One-AI/issues/351)|[#497](https://github.com/ot4562-glitch/HUFS-One-AI/pull/497)|공공 취업통계/분모·소표본 재식별|
|[#352](https://github.com/ot4562-glitch/HUFS-One-AI/issues/352)|[#498](https://github.com/ot4562-glitch/HUFS-One-AI/pull/498)|학기별 다국어 인간 번역 검수·저장 결속|

**개별 상태:** 합성 코어·UI·CI는 실제 공식 원문/기관 이용·게시권·학생 동의/비공개 원장·독립 Gold·실 NCP·Chrome/스크린리더/사람 QA를 대체하지 못합니다. 기능·통합 이슈를 “CI PASS = DONE”으로 종결하지 않습니다.

## 5. 그 밖의 처음 열린 이슈 18건 — 1건 완료/17건 OPEN

|Issue|2026-11-12 현행 판정|
|---|---|
|[#355](https://github.com/ot4562-glitch/HUFS-One-AI/issues/355)|이의상 AI/NLP 역할 — 원문/담당 불변|
|[#356](https://github.com/ot4562-glitch/HUFS-One-AI/issues/356)|박준영 AI QA 역할 — 원문/담당 불변|
|[#357](https://github.com/ot4562-glitch/HUFS-One-AI/issues/357)|이서연 웹/UI 역할 — 원문/담당 불변|
|[#358](https://github.com/ot4562-glitch/HUFS-One-AI/issues/358)|김채윤 데이터·독립 Gold 역할 — 원문/담당 불변|
|[#359](https://github.com/ot4562-glitch/HUFS-One-AI/issues/359)|심민성 총괄·NCP 역할 — 원문/담당 불변|
|[#360](https://github.com/ot4562-glitch/HUFS-One-AI/issues/360)|13개 실제 학교 원문·권리·독립 Gold 미인수|
|[#373](https://github.com/ot4562-glitch/HUFS-One-AI/issues/373)|FAQ 같은 판본 권리 충돌 PR #478 미병합|
|[#418](https://github.com/ot4562-glitch/HUFS-One-AI/issues/418)|공고 cursor/KST UX PR #486 자체 리뷰, 독립 승인·E2E 미완|
|[#427](https://github.com/ot4562-glitch/HUFS-One-AI/issues/427)|DONE — PR #485 병합, 필터 경합 6개 회귀+CI 7/7|
|[#445](https://github.com/ot4562-glitch/HUFS-One-AI/issues/445)|Crawlee/NCP 실제 수집·스케줄·rights/복구 미인수|
|[#446](https://github.com/ot4562-glitch/HUFS-One-AI/issues/446)|권리 있는 실데이터 수집·독립 Gold/실원장 미인수|
|[#447](https://github.com/ot4562-glitch/HUFS-One-AI/issues/447)|P0 HUFSAbility 전체 기능·실데이터/권리/사람 시연 미인수|
|[#449](https://github.com/ot4562-glitch/HUFS-One-AI/issues/449)|실 NCP 데이터 계약/비용/크레딧/보존·삭제 설계 미확정|
|[#450](https://github.com/ot4562-glitch/HUFS-One-AI/issues/450)|개발 도구 라이선스·비용/Claude↔GPT 실험 미인수|
|[#451](https://github.com/ot4562-glitch/HUFS-One-AI/issues/451)|UI 디자인 OSS·접근성/실기기 측정 미인수|
|[#452](https://github.com/ot4562-glitch/HUFS-One-AI/issues/452)|AI 평가 PR #480 미병합/실모델·인간 Gold 미인수|
|[#453](https://github.com/ot4562-glitch/HUFS-One-AI/issues/453)|문서/RAG OSS 비교·채택/보류 결정 미인수|
|[#454](https://github.com/ot4562-glitch/HUFS-One-AI/issues/454)|데이터 검수 OSS·Crawlee 비개발자 워크플로 실증 미인수|

고정 역할 #355–#359에는 원래 **제목·본문·담당자·라벨·마일스톤·상태를 변경하지 않았고 새 댓글만 추가**했습니다. 실제 30개 열린 이슈에는 각기 현재 상태·남은 DoD/근거 PR를 새 댓글로 기록했습니다.

## 6. 모든 문서에서 공통으로 보존할 현재의 사실

- **정본 소스:** `main` 코드와 현재 PR별 exact HEAD, CI, 댓글/리뷰. 과거 기록은 시점 표시가 있는 역사적 스냅샷으로 유지.
- **이번 회차의 직접 개발:** 사용자가 이번 회차에만 #339–#352 기존 배정과 무관하게 병렬 개발을 허용한 것이며 **영구 담당 변경 아님**. AI 주구현/검토 박준영·이의상, 자료 권리/Gold 김채윤, 웹 UI 이서연, 총괄 심민성 유지.
- **검증 경계:** `OWNER_CONFIRMED_APPROVED`는 소유자의 주장/프로젝트 범위 승인 표현일 수 있으나 **기관별 계약서/자료 재배포·AI 외부 전송 동의·운영 활성화·실모델 결과를 독립적으로 확인한 증거가 아님**. 실제 미검증 분야는 `NOT_CONNECTED/NOT_RUN/CONFIGURATION_REQUIRED` 및 `RELEASE_BLOCKED`.
- **금지:** 원본 `csv/` 5파일 변경/재인코딩/이동, 학생 식별 자료·NCP 운영 source/Gold/비밀을 공개 Git/CI/외부 AI로 복제, 실제 기관 예약·장학/배지 발급·취업/비자/수료 적격의 허위 확정, 작성자 본인 리뷰를 독립 승인으로 오인, CodeQL/CI 실패나 0개 승인 무시한 병합.
- **다음 단계:** 열린 33개 PR은 작성자 외 협업자의 **현재 SHA 승인 + 요구 CI 성공** 이후 의존성 스택 순서대로 재검증·병합. #449 보존/비용/크레딧 결정, #360/#446 실제 원문·권리/Gold, #445/#447 실 NCP PG·RLS/rollback·인적 시연 후 기능 이슈별 실제 DoD에 따라 완료.

문서 변경은 [#484](https://github.com/ot4562-glitch/HUFS-One-AI/pull/484)에서 관리하며, 이 문서 자체도 **미병합/동료 승인 대기**입니다.
