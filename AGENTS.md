# HUFS One AI — 현재 개발 규칙

## 승인과 사실

프로젝트 소유자는 문서에 기재된 개인정보·자료/기관·공유/게시·외부 전송·운영/출시 승인을 모두 완료했다고 확인했습니다. **`OWNER_CONFIRMED_APPROVED`**를 기준으로 개발하며 과거의 승인 대기 문구를 이유로 같은 승인을 다시 요구하지 않습니다. 정본은 [AUTHORIZATION](docs/AUTHORIZATION.md)입니다.

승인 완료는 실제 코드/설정/시험·학업 사실·독립 Gold·배포 성공을 대신하지 않습니다. 테스트하지 않은 결과는 `NOT_RUN`, 측정하지 않은 값은 `NOT_MEASURED`, 실제 주소/자격증명 미설정은 `CONFIGURATION_REQUIRED`입니다. 인증·소유권·RLS/CSRF·현재 철회·비밀 보호는 유지합니다.

## 현재 OPEN 7개 — 담당자 지정 (2026-11-07)

| 현재 이슈 | GitHub 담당자 | 업무 |
| --- | --- | --- |
| [#321 이의상 AI·NLP](https://github.com/ot4562-glitch/HUFS-One-AI/issues/321) | `uisang2004-maker` | Laya/CLOVA·자연어 처리·정확도 공동 |
| [#322 박준영 AI·학업](https://github.com/ot4562-glitch/HUFS-One-AI/issues/322) | `taewangim-alt` | AI/NLP 공동 개선·학업 RulePack·개설 |
| [#323 이서연 NCP·서버](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323) | `lhh42001` | 서버 운영·NCP·비용·복구 |
| [#324 김채윤 시연·평가](https://github.com/ot4562-glitch/HUFS-One-AI/issues/324) | `qamarrchae` | 전체 웹 시연·경험 AI 결과 평가 |
| [#325 심민성 통합·릴리스](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325) | `ot4562-glitch` | API/DB·보안·품질·통합 |
| [#317 추가 기능](https://github.com/ot4562-glitch/HUFS-One-AI/issues/317) | `ot4562-glitch` | 심민성 직접 개발 |
| [#318 UI/UX](https://github.com/ot4562-glitch/HUFS-One-AI/issues/318) | `lhh42001` | 이서연 전체 디자인·React UI |

이전 통합 [#316](https://github.com/ot4562-glitch/HUFS-One-AI/issues/316)은 **원본 POST-01~20 전부를 누락 없이 개인별 #321~#325로 분리하고 보관 CLOSED**했습니다. 현재는 담당자가 지정된 개인별 5개와 #317(심민성 추가 기능)·#318(이서연 UI/UX) **7개만 OPEN**입니다. 과거 이슈와 댓글은 보존하며, 배정은 실제 NCP·모델·학생 자료·사람 인수 완료가 아닙니다. 미실행/미구성은 `NOT_RUN / CONFIGURATION_REQUIRED`, 실서비스는 `RELEASE_BLOCKED`입니다.
## 본선 진출 이후 확정 역할 (2026-11-07 사용자 지정)

| 사람별 업무 | 담당 및 인수 경계 |
| --- | --- |
| AI 정확도·Laya·CLOVA/HCX·NLP | **이의상 + 박준영 공동**. Laya·네이버 AI API의 지원 범위 내 모델 조정/파인튜닝 검토·전처리/자연어 해석·정확도 평가. 박준영은 학업 RulePack·What-if/전망 유지도 수행 |
| 웹 디자인·React UI·서버 운영 | **이서연**. 기존 이의상의 UI 책임 인수, 전체 웹 디자인/반응형/접근성 및 API 서버/NCP 계정·비용·배포/운영 |
| 전체 시연·경험 기반 AI 평가·발표 | **김채윤**. 학생 경험 입력→AI 후보/근거·승인→추천 검증, 60초/10분 전체 웹 시연 루트·실패/오류 재현 및 발표 준비 |
| 코드 통합·품질·추가기능 | **심민성**. 공통 API/DB/보안/CI·품질 검수·기능 개발 및 각 담당 결과 통합 |

**현행 GitHub 담당은 개인별 #321~#325에 실제 배정**됐으며, 추가 기능 #317은 심민성·UI/UX #318은 이서연입니다. [업무 분장 정본](docs/WORKSTREAMS.md)을 따르고 과거 역할/이슈의 담당은 재활용하지 않습니다.

## 과거 본선 전 역할 기록 (현재 역할 아님)

| 종전 담당 | 기존 구현/업무 이력 |
| --- | --- |
| 심민성 `ot4562-glitch` | 공통 Zod/API·OIDC/학교메일·PG/RLS·Source/RAG·AI/비용·NCP SDK/worker/IaC/systemd/배포/CI 모든 코드·통합; #267~#275 중 병합 8건·#277 완료, 현장 #276 |
| 이의상 `uisang2004-maker` | React UI·모바일/접근성·시연·UI E2E; #9/#119/#258 |
| 김채윤 `qamarrchae` | 추천·공지·경험 역량 매핑 순수 코어; #10/#259 |
| 박준영 `taewangim-alt` | 학업/RulePack·What-if·개설 전망·교과 근거; #11/#260 |
| 이서연 `lhh42001` | NCP 계정/요금/호스트·기관 자료 증거·제품 요구사항 등 비코드 운영; #12/#261 |

다른 사람의 dirty worktree·브랜치·핵심 코드는 초기화·강제 갱신하지 않습니다. **OPEN 7개 이슈는 모두 지정 담당자 1명씩 배정**했습니다. 공통 계약·DB·lockfile은 관련 소비자와 교차 검토합니다.

## 구현·검증

현재 코드·관련 이슈·README/STATUS·Architecture·폴더별 규칙을 먼저 읽습니다. 승인된 운영 구성은 실제 OIDC/메일·별도 SQL role/CA TLS·공급자를 주입하며, 로컬 합성 계정 서버는 운영 인증의 대체가 아닙니다. AI 후보와 사용자 승인, 실제 입증된 학사/활동 사실을 구별합니다. 불명확한 근거는 UNKNOWN/NEEDS_REVIEW이며 잘못된 데이터를 성공으로 바꾸지 않습니다.

정확한 HEAD의 타입·합성/부정·일회용 PG·Chrome·CI 결과와 실패/미실행을 기록합니다. AI 코드 리뷰는 실제 비작성자의 사람 인수와 구별하고, 명시적인 개별 PR 병합 지시는 해당 PR에만 적용합니다. 현재 문서는 현재 상태만 설명하며 지난 진행 일지를 누적하지 않습니다.

[현재 구현](STATUS.md) · [NCP 서버 #323](https://github.com/ot4562-glitch/HUFS-One-AI/issues/323) · [통합·릴리스 #325](https://github.com/ot4562-glitch/HUFS-One-AI/issues/325) · [학업 코어 #278](https://github.com/ot4562-glitch/HUFS-One-AI/pull/278) · [추천 코어 #279](https://github.com/ot4562-glitch/HUFS-One-AI/pull/279).
## 원본 CSV 5개 — 사용자 보존 지시 (2026-11-06)

- 저장소에 현재 복구된 `csv/`의 **Google Forms 1개 + 학생별 수강 CSV 4개**는 **읽기 전용 원본**이다. 담당 에이전트·자동화·PR 정리 작업이 **임의로 삭제·변경·이동·파일명 변경·재인코딩·Git 추적 해제·원본 덮어쓰기·자동 정리해서는 안 된다**. 기존 원본 5개를 있는 그대로 유지한다.
- 정확한 파일 경로·Git blob SHA 메타데이터를 `tools/verify_release_boundary.py`에 고정한다. 다른 CSV 추가, 원본 수정·제거는 기본 FAIL이다. 해당 원본을 변경해야 할 경우 **사용자의 구체적인 지시와 영향 검토**를 먼저 받고, 다른 당사자의 철회·삭제 요구도 우선 처리한다. 보존 지시는 법적 삭제 의무를 무효화하지 않는다.
- CSV가 GitHub에 있다고 해서 합성 S01–S05나 REVIEWER에게 실제 학업 정보가 공개되는 것은 아니다. **BETA 본인 인증·검증된 Forms↔파일↔actor 연결·동의와 출처 확인** 후 전용 API로만 읽는다. 공개 웹 번들·CI·이미지·추론 서비스에 원본을 넣지 않는다.
- 실서비스 전환 경로와 배포 조건은 [데이터 관리](docs/DATA_GOVERNANCE.md)를 따른다. **CSV 보관과 DB 인입·인증·화면 실제 사용 성공은 별개**다.
