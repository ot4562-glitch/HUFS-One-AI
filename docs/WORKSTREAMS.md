# HUFS One AI | 확정 5인 분업과 에이전트 작업 경계


**SKU·기간·비용 공식 확인:** [NCP 2026 운영 정본](NCP_OPERATIONS_2026.md). 11/6~12/9 816h 계획 상한, 본선 발표 11/16 이후 개통 승인. 4vCPU/32GB High Memory-g3 326원/h, CB 50GB 8원/h, 서버+CB 272,544원(최대).

기준: **2026-10-30 사용자가 직접 알려준 팀 구성**. 이서연은 **팀 결성·기획을 이끈 리드**, 심민성은 **기술 총괄·GitHub 저장소 소유자·공통 계약과 최종 통합 담당자**다. 사람의 구독 현황은 보고 당시 기준이며, GPT·Claude·Gemini 개발도구와 **제품이 사용하는 CLOVA**를 혼동하지 않는다.

| 담당자 | 확정 기술 책임 | 보고된 AI 구독 | 소유 경로 | TASK |
| --- | --- | --- | --- | --- |
| **심민성** | 기술 총괄, API·인증·DB·수집/RAG 서버 구현과 계약/QA·최종 PR 병합 | GPT | `apps/api`(웹/외부 HTTP API), `packages/core/src/privacy`, `packages/contracts`, `packages/fixtures`, `tests`, `.github`, `docs`, `infra/sql`(일반 DB 스키마), 루트 설정 | 00·07·08·09·12·16·19·21·25·27 및 트랙 사이 API 지원 |
| **이의상** | UI·모바일·UX·접근성 | Claude, Gemini | `apps/web`, `packages/ui`, `assets/synthetic` | 04 및 05·09·15의 화면 |
| **김채윤** | 개인화 추천·중요공지 | GPT, Claude, Gemini | `packages/core/src/normalization`, `opportunities`, `notices` | 06·14 |
| **박준영** | 졸업요건·학점·수강계획·미래 개설 전망 | GPT, Claude | `packages/core/src/academics`, `forecast` | 01·02·03·17 |
| **이서연** | 팀 결성·기획 리드 + NCP·CLOVA·OCR/Vision·Laya 모델/Provider 구현 및 운영 전체 전담 | **Gemini (2026-10-30 사용자 확인)** | `packages/ai`(NCP/CLOVA/OCR/HCX/Laya provider 구현), `infra`(NCP VPC·OS·TLS·클라우드 IaC·키·과금/worker), 일반 `apps/api` 제외 | 11·20·22, NCP/CLOVA/OCR/Vision/Laya Provider·환경만 |

### 이슈 배정으로 확인한 GitHub 작업 계정 (2026-10-31)

| 담당 | GitHub 계정 | 연결 근거 |
|---|---|---|
| **심민성** | [`ot4562-glitch`](https://github.com/ot4562-glitch) | 저장소 소유자·[#8](https://github.com/ot4562-glitch/HUFS-One-AI/issues/8), [#18](https://github.com/ot4562-glitch/HUFS-One-AI/issues/18) 할당 |
| **이의상** | [`uisang2004-maker`](https://github.com/uisang2004-maker) | [UI 이슈 #9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9) 담당자 지정 |
| **김채윤** | [`qamarrchae`](https://github.com/qamarrchae) | [추천·공지 이슈 #10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) 담당자 지정 |
| **박준영** | [`taewangim-alt`](https://github.com/taewangim-alt) | [학업 이슈 #11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11) 담당자 지정 |
| **이서연** | **미확인·자동 할당 금지** | [플랫폼 이슈 #12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12)에는 GitHub assignee가 없음; Gemini 사용은 사용자 확인 |

**정확성 경계:** 위 네 계정의 대응은 사용자가 지정한 이슈 담당자·GitHub assignee 기록에 근거한다. 이는 사람의 신분증 검증이나 새로운 학생자료 공유 동의가 아니다. 이서연 계정은 임의 유추하지 않으며, 다른 사람의 계정에 대신 배정하지 않는다.

- **공개 웹 도메인/Google 인증 P0 협업:** 심민성(API)은 독립 Google OAuth OIDC·외대 메일 OTP 발송/검증·세션/권한 코드를 담당한다. 이서연(NCP/Gemini 사용)은 ingress·TLS·스토리지·CLOVA SDK/HTTP 요청, 모델/OCR/Vision·Laya worker와 클라우드 비용/안전 운영을 모두 담당한다. 이의상(UI)은 Google 로그인·학교 메일 코드·403·재인증 UX와 민감 캐시 차단을 담당한다. 심민성은 공용 auth contract, `외대.온라인.한국` origin, `hd`/메일 OTP 우회 부정시험, CI/PR 통합 게이트를 맡는다. **공식 학교 SSO 허가는 전제하지 않으며** Google OAuth 클라이언트·메일 발송 서비스·NCP 비용·학생자료 공유는 별도 승인한다. 인증 전 앱 번들/API·directIP·preview 접근을 허용하는 PR은 병합 금지(Architecture A14.1a).

## 충돌 방지와 교차 검토

- **UI ↔ API:** 이의상은 `DemoContext`·`DemoSnapshot`을 합성 mock으로 사용하고, 심민성은 실제 권한/403/409/503 응답을 구현한다. 화면의 임의 타입·보안 판정·가짜 실제 데이터를 API에 강요하지 않는다.
- **추천 ↔ API:** 김채윤은 순수 정규화·매칭·점수·공지 코어, 심민성은 인증·DB·외부 REST API 및 provider-neutral 요청/결과 검증 경계를 맡고, CLOVA 호출·비용 처리는 이서연이 담당한다. `TopicCode` 등 공통 타입 변경은 심민성에게 계약 변경을 먼저 제안한다.
- **학업 ↔ API/UI:** 박준영은 공식 RulePack·세 원장·전망 및 합성 시험을 구현한다. 심민성은 권한·저장·API를, 이의상은 **공유 승인된 요약**만 표시한다. `RulePackDraft`를 공식 졸업 확정으로 다루지 않는다.
- **최종 중재:** 심민성은 4개 트랙 산출물의 계약·데이터·UX/API 충돌을 해결하고, CI·독립 리뷰·실제 실패와 미실행 항목을 확인한 후에만 최종 병합한다. 일방적인 main 직접 push나 자동 병합은 금지한다.
- **검토 매트릭스:** UI는 API+통합, 추천은 API+통합, 학업은 API+통합, API는 UI/추천 중 한 트랙+통합의 교차 검토를 받는다. 모델/사람의 검증은 실제 수행한 경우만 기록한다.

## 5명 개발팀 ≠ 5명 실학생 입력

- **학생 과목 CSV 4명 + Google Forms 통합 CSV 4명:** 김채윤·이의상·이서연·심민성. **박준영은 CSV/Forms 제출 대상이 아니다.**
- **사용자가 직접 확인:** `이수과목_까마르.csv`는 김채윤의 제출 파일이다. 현재 과목 CSV **3/4명(김채윤·이의상·심민성)의 파일 소유자가 확인**됐으며, 이서연 파일은 미확인이고 Forms 응답도 아직 미제출이다. 별명 대응을 private 입력 단계에서만 사용하고, 제출은 팀 공유/공식 졸업판정/AI 전송 동의와 구분한다.
- 5개 `S01`~`S05` 시연 슬롯을 유지하더라도 실제 자료 대상은 최대4명이다. 한 슬롯은 `PENDING` 또는 명시적 `SYNTHETIC`으로만 표현한다. 사람별 원본과 공유 projection은 별도의 동의를 요구한다.

## 독립 개발 시작 순서

1. **TASK-00부터:** [공통 계약 게이트](CONTRACT_BOUNDARIES.md) 및 [실행 가능한 계약 사용법](../packages/contracts/README.md)을 사용한다. TypeScript/Zod 계약·synthetic fixture·자동 4트랙 소비 검증 코드를 별도 브랜치에서 구현했으며, **PR 병합/CI 결과/실제 팀원 승인 여부는 별도로 확인**한다.
2. 4개 트랙이 자신의 API/타입 소비·실패 상태를 승인한 뒤 TASK-00을 병합하고, **그 커밋을 각 브랜치/worktree의 기준점으로 사용**한다.
3. 각 트랙은 해당 소유 경로만 변경한다. 독립 에이전트라도 공유 타입/DB migration/root lockfile을 임의 수정할 수 없다. 실제 원장·키·CLOVA/NCP 유료호출은 별도 승인 전 사용 금지.
4. 매 PR에서 `ownedPaths`, `input/outputContract`, 합성 fixture, `testsRun/testsFailed/notTested`, `privacyImpact`, rollback과 쉬운 설명을 제출한다.

상세 권한·입력 검증: [DATA_GOVERNANCE.md](DATA_GOVERNANCE.md) · [계약 경계](CONTRACT_BOUNDARIES.md) · [PR 방식](PR_WORKFLOW.md).

## 신뢰형 RAG·이미지 공고·Laya 교차 책임 (2026-10-31 설계)

- **심민성 / 웹·외부 API·통합:** `SourceRevision`·`SourceSpan(TEXT|IMAGE)`·`VerifiedClaim`·`RetrievalEnvelope`의 provider-neutral Zod/권한·asOf 검증/REST 출력과 계약·QA·PR 통합. **NCP·CLOVA·Laya SDK/실제 호출·모델 worker·비용 원장은 이서연**.
- **이서연 / NCP·CLOVA/모델 Provider 전체:** High Memory-g3 4vCPU·32GB VM/보안·키·스토리지·크레딧·비용, Laya 모델/ONNX worker, General OCR·HCX-005 Vision·HCX-007 SDK/HTTP provider 연동·전송권한/원문 검수·비용 중단/worker와 NCP 비공개 스토리지. 실제 모델 다운로드/유료 호출/서버 개통은 승인 전 금지.
- **김채윤 / 추천·공지:** 유효한 source revision과 APPROVED claim만 사용하고 연장/취소/정정에 따른 개인화 피드·공지 버전 및 캐시 무효화, 미래 자료 누출/구본 활성화 부정시험.
- **박준영 / 학사:** OCR/이미지로 수집된 학사 규칙의 표·각주·졸업예정학기·적용학번/RulePack 요구사항 독립 검수; LLM 추출을 공식 졸업 확정으로 승격 금지.
- **이의상 / UI:** 공식 출처 링크·원본 포스터 박스 하이라이트·최종 확인 시각·OCR 오독/UNKNOWN/STALE/REPLAY 배지와 접근·모바일·캐시 철회.

**병합 절차:** 이 **설계 PR은 기존 #15/#16의 공통 타입을 직접 수정하지 않음** → 소비자 교차검토 → 독립 contracts vNext PR → 합성 검증팩 → 비용·계정 권한 승인 후 구현. 세부: [검증형 RAG 계약](TRUSTED_RAG_MEDIA_VERSIONING.md).

## 2026-10-31 설계 PR 이후 작업 이슈 지도 (각 담당자 에이전트 확인)
- **통합 추적 [#23](https://github.com/ot4562-glitch/HUFS-One-AI/issues/23)**, 설계 [PR #17](https://github.com/ot4562-glitch/HUFS-One-AI/pull/17): 인프라 설치/결제 승인이 아닌 **문서 설계**이며, 병합해도 신규 기능 구현을 뜻하지 않는다.
- **심민성:** 공통 계약 v0.1.0 [#8](https://github.com/ot4562-glitch/HUFS-One-AI/issues/8)과 **새 vNext [#18](https://github.com/ot4562-glitch/HUFS-One-AI/issues/18)**는 분리. 새 SourceRevision·TEXT/IMAGE evidence·RAG/Laya 어댑터 계약 및 네 소비자 리뷰 담당.
- **이의상 [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9):** 포스터 bbox 근거 확대·latest verified / STALE / UNKNOWN / synthetic 표시, 권한철회/캐시·모바일.
- **김채윤 [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10):** 최신 승인 공고/정정·취소만 추천·공지 소비, [#15](https://github.com/ot4562-glitch/HUFS-One-AI/pull/15) 미래 `asOf` 노출 및 [#16](https://github.com/ot4562-glitch/HUFS-One-AI/pull/16) 학기범위/미검증 필수공지/overdue **변경요청 먼저 해결**.
- **박준영 [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11):** OCR 표·각주/예외/졸업예정학기·Requirement ID/룰팩 검증, 학사·공지 독립 교차리뷰.
- **이서연 NCP [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12):** API 수집 연계 심민성 [#19](https://github.com/ot4562-glitch/HUFS-One-AI/issues/19), NCP OCR·HCX-005 이서연 [#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20), 웹 API Temporal RAG 심민성 [#21](https://github.com/ot4562-glitch/HUFS-One-AI/issues/21), Laya CPU·High Memory-g3·비용 하드 게이트 [#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22). 실제 GitHub ID 매핑 확인 전 자동 assign/mention 금지.
- **모든 에이전트:** 다음 세션 시작 즉시 원격 최신 main/이슈/PR과 이전 이슈 댓글을 확인하고 담당 이슈만 분기·PR·테스트로 진행한다. 이슈와 문서 작성은 자동 실행 아님. NCP/이미지/개인원본 전송·실배포는 별도 명시 승인 전 금지.

## REVIEWER 보안 접근 추가: 심사자를 팀원 5명에 추가하지 않음 (#25)

- **심민성 / 인증·웹 API:** 심사자 이메일 사전 수집 없는 **공용 초대 코드**·등록 최대 계정 수·검증된 Google sub/email binding·PostgreSQL grant·role vNext·자동 만료/철회 및 합성 전체 기능 API/테스트, 권한 감사와 최종 병합.
- **이의상 `uisang2004-maker` / UI:** `/reviewer/invite` Google 로그인→**공용 초대장** 최초 등록→S01~S05 **전체 학생 기능 합성 시연**, 만료 안내/캐시 정리·시각적 SYNTHETIC·REPLAY/NO_REAL_DATA 표시, 접근성·모바일 검증.
- **이서연 NCP 전담:** VM/운영·DB 호스팅 환경과 CLOVA OCR/HCX/Laya 실제 provider 구현·성능·과금·키 보호를 준비. **Google OIDC/일반 DB·Fastify/REVIEWER API 코드는 심민성 소유.** 실제 인프라·DB 연결은 본선 진출·별도 승인 이후.
- **김채윤/박준영:** 심사 시연 데이터는 각 트랙의 **별도 합성 fixture**, 실학생 권한 공유나 공인 학칙·공고 live 상태로 보이게 하지 않는다.
- 담당 이슈 [#25](https://github.com/ot4562-glitch/HUFS-One-AI/issues/25), 정본 [REVIEWER_ACCESS.md](REVIEWER_ACCESS.md). 이 새 역할은 학교 공식 교직원 인증·개인정보 공유 동의를 대신하지 않는다.

## Laya CPU 스파이크 보호 후속 소유 (#22)

이서연 NCP/모델 실행 전담 (심민성 API와 분리)**: 승인된 VM에서 systemd cgroup `CPUQuota=100%`가 정확히 **1vCPU**로 적용되는지 확인, ORT single-thread/spin OFF, 별도 ingest queue·cache/중복 방지·과부하 PAUSE/OFF, Laya 기본 비활성/백업 코드 폴백을 구현한다. **심민성**은 NCP 요금/모델 license·RSS/latency 실측 및 계정·개통·한도 변경을 별도로 승인. **이의상 UI**는 심사자 재접속이 워커 호출을 일으키지 않고 SYNTHETIC REPLAY 표시가 명확하도록 검수. Laya ON/OFF 비교와 실측 없이 완성 체크 금지. 정본 [LAYA_CPU_SPIKE_PROTECTION.md](LAYA_CPU_SPIKE_PROTECTION.md).
