# HUFS One AI — 현재 개발 규칙

## 승인과 사실

프로젝트 소유자는 문서에 기재된 개인정보·자료/기관·공유/게시·외부 전송·운영/출시 승인을 모두 완료했다고 확인했습니다. **`OWNER_CONFIRMED_APPROVED`**를 기준으로 개발하며 과거의 승인 대기 문구를 이유로 같은 승인을 다시 요구하지 않습니다. 정본은 [AUTHORIZATION](docs/AUTHORIZATION.md)입니다.

승인 완료는 실제 코드/설정/시험·학업 사실·독립 Gold·배포 성공을 대신하지 않습니다. 테스트하지 않은 결과는 `NOT_RUN`, 측정하지 않은 값은 `NOT_MEASURED`, 실제 주소/자격증명 미설정은 `CONFIGURATION_REQUIRED`입니다. 인증·소유권·RLS/CSRF·현재 철회·비밀 보호는 유지합니다.

## #317 인수 분리: 최종 작업 소유권 (2026-11-07 사용자 후속 지시)

- **이서연 #323 = 실운영:** NCP 실배포·접속·비용·복구 및 승인된 유료 모델 실호출/실과금 영수증·LIVE/CACHED/SYNTHETIC 실증. 라이브 실행 전에 #324의 입력별 자료 권리와 #325의 보안 계약을 확인한다.
- **김채윤 #324 = 실자료·인적 인수:** 기관/개인별 수집·저장·전송·게시·보존·철회 이용권 확인, 실제 학생 BETA 2명 이상 독립 계정 A/B·모바일/스크린리더/실기기 검증. 비공개 근거만 공유한다.
- **이의상 #321 + 박준영 #322 = 모델 코드/품질:** AI/NLP/OCR·인용·독립 평가/학업 정확도; 운영 실결제/영수증은 #323의 책임을 중복하지 않는다.
- **심민성 #317/#325 = 신규 기능 코드 및 공통 백엔드:** #317 기능 UI·전용 회귀, #325 API/DB/RLS·보안 영수증 저장/조회·PR/릴리스 의사결정. 직접 NCP 실배포·권리서류 수집·실사용자 테스트를 담당 이슈에 중복 체크하지 않는다.
- 작업/권한 이관은 완료 판정이 아니다. `OWNER_CONFIRMED_APPROVED`와 개별 자료/소유자별 실제 이용 가능 범위, 자동 CI와 사람/실환경 검증을 구분한다. `NOT_RUN / CONFIGURATION_REQUIRED / RELEASE_BLOCKED` 유지.

## 현재 OPEN 6개 — 담당자 지정 (2026-11-07)

| 현재 이슈 | GitHub 담당자 | 업무 |
| --- | --- | --- |
| [#321 이의상 AI·NLP](https://github.com/ot4562-glitch/HUFS-One-AI/issues/321) | `uisang2004-maker` | Laya/CLOVA·자연어 처리·정확도 공동 |
| [#322 박준영 AI·학업](https://github.com/ot4562-glitch/HUFS-One-AI/issues/322) | `taewangim-alt` | AI/NLP 공동 개선·학업 RulePack·개설 |
| [#323 이서연 통합 웹·UI/UX·NCP](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323) | `lhh42001` | 웹·React/UX·NCP 실배포/복구, **유료 AI 실호출·실과금 영수증 발급/검증** (구 #318 통합) |
| [#324 김채윤 시연·평가](https://github.com/ot4562-glitch/HUFS-One-AI/issues/324) | `qamarrchae` | **출처·기관·개인별 자료 이용권 증빙, 실학생 A/B·실기기/NVDA 인수**, 전체 웹 시연·경험 AI 결과 평가 |
| [#325 심민성 통합·릴리스](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325) | `ot4562-glitch` | **공통 API/DB·RLS·보안·비공개 영수증 저장/조회 코드**·품질/릴리스 판단 (실발급 #323, 실사용자 #324) |
| [#317 추가 기능](https://github.com/ot4562-glitch/HUFS-One-AI/issues/317) | `ot4562-glitch` | **신규 기능 코드 개발·자동 회귀 전용** (외부 운영/사람 인수는 #321–#325) |

이전 통합 [#316](https://github.com/ot4562-glitch/HUFS-One-AI/issues/316)의 POST-01~20은 개인별 #321~#325에 보존하고 #316은 CLOSED 처리했습니다. **기존 UI/UX [#318](https://github.com/ot4562-glitch/HUFS-One-AI/issues/318)의 UX-01~25와 미완 인수 항목은 전부 [#323](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323)으로 이전**하여 #318을 중복으로 종결했습니다. **현재 OPEN은 6개**이며 각각 지정 담당자 1명입니다. #317은 신규 코드만, #323은 실 NCP/유료 호출, #324는 자료별 권리/실학생·실기기, #325는 공통 서버/보안 코드를 소유합니다. 이관은 실운영·사람 인수 완료가 아닙니다. 실운영 상태는 `NOT_RUN / CONFIGURATION_REQUIRED / RELEASE_BLOCKED`를 유지합니다.

## 본선 진출 이후 확정 역할 (2026-11-07 사용자 지정)

| 사람별 업무 | 담당 및 인수 경계 |
| --- | --- |
| AI 정확도·Laya·CLOVA/HCX·NLP | **이의상 + 박준영 공동**. Laya·네이버 AI API의 지원 범위 내 모델 조정/파인튜닝 검토·전처리/자연어 해석·정확도 평가. 박준영은 학업 RulePack·What-if/전망 유지도 수행 |
| 웹 디자인·React UI·NCP/실 AI 운영 | **이서연**. 전체 웹 디자인/반응형/접근성 코드 및 API 서버/NCP 계정·비용·배포/운영·복구, **승인된 실제 유료 HCX/CLOVA 호출 1–2건과 영수증·캐시/신규 과금 구별 실측**을 주도 |
| 자료 이용권·실학생/실기기 검증·시연 | **김채윤**. 기관/개인·공고/포스터·동아리 출처별 허가 범위/철회 검토, **서로 다른 실제 학생 2명 이상 A/B·모바일/NVDA 실기기 인수**. 경험→AI 후보/근거·승인→추천 평가 및 60초/10분 발표 |
| 코드 통합·품질·추가기능 | **심민성**. 공통 API/DB/RLS·비공개 영수증 저장/조회·보안/CI·품질/통합 및 #317 신규 기능 개발. 실유료 실행·NCP 운영/권리증빙/실학생 인수 주책임을 갖지 않음 |

**현행 GitHub 담당은 개인별 #321~#325에 실제 배정**됐으며, 추가 기능 #317은 심민성, 구 UI/UX #318의 전 작업은 이서연의 통합 #323에서 관리합니다. [업무 분장 정본](docs/WORKSTREAMS.md)을 따르고 과거 역할/이슈의 담당은 재활용하지 않습니다.

## 과거 본선 전 역할 기록 (현재 역할 아님)

| 종전 담당 | 기존 구현/업무 이력 |
| --- | --- |
| 심민성 `ot4562-glitch` | 공통 Zod/API·OIDC/학교메일·PG/RLS·Source/RAG·AI/비용·NCP SDK/worker/IaC/systemd/배포/CI 모든 코드·통합; #267~#275 중 병합 8건·#277 완료, 현장 #276 |
| 이의상 `uisang2004-maker` | React UI·모바일/접근성·시연·UI E2E; #9/#119/#258 |
| 김채윤 `qamarrchae` | 추천·공지·경험 역량 매핑 순수 코어; #10/#259 |
| 박준영 `taewangim-alt` | 학업/RulePack·What-if·개설 전망·교과 근거; #11/#260 |
| 이서연 `lhh42001` | NCP 계정/요금/호스트·기관 자료 증거·제품 요구사항 등 비코드 운영; #12/#261 |

다른 사람의 dirty worktree·브랜치·핵심 코드는 초기화·강제 갱신하지 않습니다. **OPEN 6개 이슈는 모두 지정 담당자 1명씩 배정**했습니다. 공통 계약·DB·lockfile은 관련 소비자와 교차 검토합니다.

## 구현·검증

현재 코드·관련 이슈·README/STATUS·Architecture·폴더별 규칙을 먼저 읽습니다. 승인된 운영 구성은 실제 OIDC/메일·별도 SQL role/CA TLS·공급자를 주입하며, 로컬 합성 계정 서버는 운영 인증의 대체가 아닙니다. AI 후보와 사용자 승인, 실제 입증된 학사/활동 사실을 구별합니다. 불명확한 근거는 UNKNOWN/NEEDS_REVIEW이며 잘못된 데이터를 성공으로 바꾸지 않습니다.

정확한 HEAD의 타입·합성/부정·일회용 PG·Chrome·CI 결과와 실패/미실행을 기록합니다. AI 코드 리뷰는 실제 비작성자의 사람 인수와 구별하고, 명시적인 개별 PR 병합 지시는 해당 PR에만 적용합니다. 현재 문서는 현재 상태만 설명하며 지난 진행 일지를 누적하지 않습니다.

[현재 구현](STATUS.md) · [NCP 서버 #323](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323) · [통합·릴리스 #325](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325) · [학업 코어 #278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278) · [추천 코어 #279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279).
## 원본 CSV 5개 — 사용자 보존 지시 (2026-11-06)

- 저장소에 현재 복구된 `csv/`의 **Google Forms 1개 + 학생별 수강 CSV 4개**는 **읽기 전용 원본**이다. 담당 에이전트·자동화·PR 정리 작업이 **임의로 삭제·변경·이동·파일명 변경·재인코딩·Git 추적 해제·원본 덮어쓰기·자동 정리해서는 안 된다**. 기존 원본 5개를 있는 그대로 유지한다.
- 정확한 파일 경로·Git blob SHA 메타데이터를 `tools/verify_release_boundary.py`에 고정한다. 다른 CSV 추가, 원본 수정·제거는 기본 FAIL이다. 해당 원본을 변경해야 할 경우 **사용자의 구체적인 지시와 영향 검토**를 먼저 받고, 다른 당사자의 철회·삭제 요구도 우선 처리한다. 보존 지시는 법적 삭제 의무를 무효화하지 않는다.
- CSV가 GitHub에 있다고 해서 합성 S01–S05나 REVIEWER에게 실제 학업 정보가 공개되는 것은 아니다. **BETA 본인 인증·검증된 Forms↔파일↔actor 연결·동의와 출처 확인** 후 전용 API로만 읽는다. 공개 웹 번들·CI·이미지·추론 서비스에 원본을 넣지 않는다.
- 실서비스 전환 경로와 배포 조건은 [데이터 관리](docs/DATA_GOVERNANCE.md)를 따른다. **CSV 보관과 DB 인입·인증·화면 실제 사용 성공은 별개**다.
