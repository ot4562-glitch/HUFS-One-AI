# HUFS One AI — 현재 구현·검증·후속 인수

기준일 **2026-11-07** (CI 증거는 각 정확한 SHA 기준). 프로젝트 승인은 `OWNER_CONFIRMED_APPROVED`다. 코드와 합성 자동검증, 실제 학교/학생·계정·서버·사람 인수를 구별한다. **실서비스는 `RELEASE_BLOCKED`**이며 실제 구성·운영 증거는 [#316](https://github.com/ot4562-glitch/HUFS-One-AI/issues/316)에 기록한다.

## 2026-11-07 현재 열린 이슈 3개 · 모든 담당 미배정

| 단일 OPEN 이슈 | 통합 범위 | 담당 |
| --- | --- | --- |
| **[#318 [UI/UX]](https://github.com/ot4562-glitch/HUFS-One-AI/issues/318)** | 화면/반응형·협업자별 #310–#314 및 기존 UI 결함, 실 UI 접근성 검수 | 미배정 |
| **[#316 [본선 진출 이후]](https://github.com/ot4562-glitch/HUFS-One-AI/issues/316)** | NCP·Google/학교메일·실학생 4인·PG/학칙·추천·AI/비용·실운영 인수 | 미배정 |
| **[#317 [추가 기능 제안]](https://github.com/ot4562-glitch/HUFS-One-AI/issues/317)** | 신규 포트폴리오·커리어·AI 실행이력·동아리/기관 링크 제안 | 미배정 |

2026-11-07 열린 이슈를 정리한 뒤, **과거 이슈를 재사용하지 않고 댓글 없는 신규 #316/#317/#318을 발행**했습니다. 이전 #276/#255/#298은 기록 보관용 CLOSED이며 새 이슈 3건만 OPEN입니다. #280–#283, #297/#299–#303, #310–#314의 상세 요구/고유 반례는 원본 댓글/본문을 보존해 closed/duplicate로 정리했으며, **기능 구현·인적 인수가 완료된 것이 아닙니다**. 본선 이후 역할은 재편할 예정이므로 **과거 업무 소유자 표는 신규 이슈의 배정 근거가 아닙니다**. 합성 CI 성공과 실제 서비스 RELEASE_BLOCKED/실 NCP·학교/학생 자료 CONFIGURATION_REQUIRED/NOT_RUN을 구별합니다.

## 본선 진출 전 이슈 종결 범위

사용자의 “본선 진출 이전 이슈 모두 종결” 요청은 실제 제목의 `[본선진출 전]` 11개에 적용한다. 구현·회귀·문서를 아래 범위로 통합하고, 수행할 수 없는 지정 팀원의 사람 검토와 실제 인수는 명시된 후속 이슈에 보존한다. 이전 이슈의 체크박스를 근거 없이 전부 PASS로 바꾸지 않는다. 최신 종결 상태와 정확한 통합 SHA·CI는 각 이슈의 종결 기록을 따른다.

| 이슈 | 이번 정리 범위 | 별도 후속 |
| --- | --- | --- |
| [#9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), [#119](https://github.com/ot4562-glitch/HUFS-One-AI/issues/119) | 메뉴·권한·상태·학업/지원 UI, 합성 전환·오류/늦은 응답·두 탭·반응형/접근성 자동 회귀 | 실제 BETA·기기·NVDA 및 사람 시각 검수 #280; 추가 제품 디자인 #298/#303 |
| [#258](https://github.com/ot4562-glitch/HUFS-One-AI/issues/258), [#284](https://github.com/ot4562-glitch/HUFS-One-AI/issues/284) | `/experience`와 owner API/합성 어댑터 연결, 경험·후보·승인/철회, PAGE coverage, 현재 job receipt·세션 격리 | 실제 OIDC/4인·공급자 종단 #276/#280/#299/#302; 포트폴리오 재설계 #300 |
| [#10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) | r1 기준선 유지, opt-in revisionScenario·CLI, 정확한 원문 판본에만 평가 라벨 결속, 승인·철회·재승인 시점 회귀 | 실출처/실추천 품질 #281; 독립 사람 Gold NOT_RUN |
| [#11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11) | 기존 RulePack·원장·What-if·8학기/rolling-origin·교과 미확인 합성 코어 및 소비자 회귀 재검증 | 실제 교과 identity API·공식 학칙/132개 코드·4인 원장 #276/#282/#301 |
| [#260](https://github.com/ot4562-glitch/HUFS-One-AI/issues/260) | 기존 학업 경험 근거 정책/테스트·소비자 경계 AI 코드 검토; 남은 사람 리뷰를 명시 이관한 정리 종결 | 김채윤·이의상의 실제 교차 리뷰 NOT_RUN, 교과 연결 NOT_CONNECTED → #280/#281/#282 |
| [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [#261](https://github.com/ot4562-glitch/HUFS-One-AI/issues/261) | [사전 운영 계획](docs/PREFINAL_OPERATIONS_PLAN.md): 요구사항·목적별 자료 확인표·공식 가격 출처·부분 견적/예산·설정/복구/반납·피드백 양식 | 실제 계정/현재 권리·청구·사람 피드백 #283, 기술 운영 #276 |
| [#294](https://github.com/ot4562-glitch/HUFS-One-AI/issues/294) | WinSCP/plink 지문 형식·PS5.1 인용·절대 경로, root 공개키 경계·IP/rollback 인자 회귀 | 실제 SSH/SFTP 호스트 교환·원격 설치/운영 #276/#283 |
| [#296](https://github.com/ot4562-glitch/HUFS-One-AI/issues/296) | 창작 그림 8종(신규 7·기존 1), 480/960 WebP·ID 매핑/fallback, 추가 합성 예시 12개·자산 해시/화면 회귀 | 독립 사람 포스터·실기기 인수 #280 |

[PR #305](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305)에서 제안된 정정 보고서·재생 테스트 기능은 [통합 PR #306](https://github.com/ot4562-glitch/HUFS-One-AI/pull/306)에 반영하고 r1 평가 라벨을 r2에 재사용하던 결함을 수정했다. #305 **PR 자체는 main 대비 변경 파일 0개로 중복 종료했으며 병합하지 않았다**. 기존 `splits`는 그대로이며 `--revision-scenario true`에서만 추가 분석이 나온다. 현재 r2 두 판본은 미검토로 제외하고, owner 초안의 별도 분석 라벨은 175/185, r1은 200/200이다. 이는 독립 Gold가 아니다.

## 2026-11-06 최신 PR·이슈 점검 (정확한 근거)

- **[PR #306](https://github.com/ot4562-glitch/HUFS-One-AI/pull/306)** 통합 커밋 [`462f6d3`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/462f6d39641d4129addda0f5ad6ab700eebdf5cb)에서 본선 이전 11개 이슈 모두 종료(10 `completed`, #260 `not_planned`/미완 사람 리뷰 후속 이관). 그 커밋의 Actions 4종 성공은 이슈 종결 댓글에 연결.
- **[PR #305](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305)** HEAD `f7fa7f3` → `main` 비교 시 변경 파일 0개, 기존 #306에 통합된 내용의 중복. [코드 리뷰](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305#pullrequestreview-5797569357) 등록 후 **미병합 CLOSED**(빈 merge 만들지 않음).
- **[PR #307](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307)** HEAD `ba7bf2a` 8개 파일 홈/공고 인터랙션 및 Chrome 360px·reduced-motion/필터 회귀. [리뷰](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307#pullrequestreview-5797568875) 후 `main`에 [`d8e2144`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/d8e2144184d06577ff76d8e5e1ed3a13be09af4c)로 **MERGED**. 정확한 PR HEAD의 [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685945)·[Chrome](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685929)·[NCP](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182686098)·[Pages](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685963) **4/4 SUCCESS**. 병합 후 정확한 **`main d8e2144`**의 [TASK-00](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42187797571)·[Chrome](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42187797686)·[NCP](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42187797648)·[Pages](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42187797515)도 **4/4 SUCCESS**를 재확인했다. 이후 문서 PR의 HEAD는 다시 별도로 확인한다.
- **2026-11-06 당시** 후속 #280–#283/#297–#303 및 이후 협업자 피드백 #310–#314는 **2026-11-07 통합으로 closed/duplicate**. 현재 #318(UI/UX)·#316(본선 이후)·#317(기능 제안) **3개만 OPEN·모두 미배정**. 과거 자동 CI/합성 완료를 사람 검수나 실로그인·운영 배포 성공으로 바꾸지 않는다. 실제 팀원의 GitHub `APPROVED`나 운영 배포를 에이전트의 `COMMENT` 리뷰로 대체하지 않는다.
- **7일 내 마감/정렬**은 이미 허용된 현재 화면의 snapshot `asOf` 및 D-day에 대한 클라이언트 탐색이다. 실제 오늘의 실시간 원본 전체 검색이 아니고, `hasMore`이면 화면 밖 공고는 제외된다. D-day 기준 날짜를 학생에게 설명하는 UX는 #318에서 계속 개선한다.

## 현재 제품 경계

| 영역 | 코드에 있는 것 | 실제 구성/인수 |
| --- | --- | --- |
| 웹·인증 | React/Vite의 데스크톱 참고 11영역 GNB/LNB·모바일 5탭, 합성 Pages, 홈 액션 패널·현재 공고만 검색/필터/정렬, owner OIDC/메일/CSRF 경로와 경험 UI 연결 | 학교 로그인·4명 개인별 데이터 #297/#299, 실제 접근성 #280 |
| DB·권한 | SQL role/RLS·CAS·동의/철회·운영 factory | 관리형 PG/CA TLS·migration/백업·복구 #316 |
| 원본 CSV | Forms 1개 + 수강 4개 = 5개 불변 보존, private intake/BETA UI 코드 | Forms↔파일↔actor/현재 권리/DB readback #316/#299; Git 보관과 실제 연결은 별개 |
| 학업 | RulePack/What-if·독립 참조모형·미확인 과목 보수 처리, `forecast-offering-v3` | `COURSE_IDENTITY_API_CONNECTION=NOT_CONNECTED`; 공식 학칙/4인 #282/#301 |
| 추천·경험 | 40공고/10공지 r1·정정 overlay·현재 승인 신호·판본 결속 평가 | 공식 출처·사람 Gold #281, 실제 모델·캐시 증거 #302 |
| 운영 | Terraform mock·SSH preview/rollback·Windows/Linux offline 검증 | 실 NCP·도메인/TLS·공급자·요금/반납 #316/#283 |

## 검증 근거 사용법

로컬 작업트리 결과와 커밋별 CI를 구별한다. 통합 변경의 `npm run check`, 평가 CLI, 자산 무결성·공개 경계, GitHub Chrome 및 일회용 PostgreSQL, Windows PS5.1/실제 WinSCP 파서·Ubuntu 22.04/24.04 offline 결과는 **각 이슈 종결 댓글의 정확한 SHA와 Actions URL**로 확인한다. 이전 PR의 성공을 새 HEAD 결과로 전용하지 않는다.

로컬 Chromium은 OS의 `socket() Operation not permitted`로 테스트 시작 전에 막혔다. 해당 로컬 실행을 PASS로 표시하지 않고 GitHub Chrome 실행 결과를 별도로 사용한다. 실제 WinSCP 파서 검증은 SessionOptions 형식 검사이며 실제 서버 핸드셰이크/업로드 성공이 아니다. 자동 접근성/AI 코드·시각 검토 역시 지정 팀원이나 독립 사람 수락을 대신하지 않는다.

## 남은 이슈와 문서

현재 OPEN은 **#318 [UI/UX]**, **#316 [본선 진출 이후]**, **#317 [추가 기능 제안]** 세 개뿐이며 모두 미배정입니다. #280–#283/#297–#303/#310–#314의 실제 미완 요구는 해당 통합 이슈의 체크리스트/역사적 원본 링크로 추적합니다.

- [사전 운영 계획](docs/PREFINAL_OPERATIONS_PLAN.md) · [팀 수락 상태](docs/TEAM_PROGRESS.md) · [검증 보고](REPORT.md)
- [NCP 서버 개설](docs/BEGINNER_NCP_SERVER_SETUP.md) · [제품·개발 CLI 설치](docs/BEGINNER_NCP_PRODUCT_AND_AGENTS.md) · [제품 원리](docs/BEGINNER_PRODUCT_ARCHITECTURE.md)
- [운영 런타임](docs/PRODUCTION_RUNTIME.md) · [평가 방법](docs/INDEPENDENT_EVALUATION.md) · [합성 그림 계약](apps/web/src/features/illustrations/README.md)

`csv/` 기존 5개는 내용·이름·경로·인코딩·추적 상태를 임의 변경/삭제/이동하지 않는다. CI의 고정 Git blob SHA와 공개 웹/이미지/배포 제외 정책을 유지한다. 현재 삭제·철회 권리는 운영 검사에서 별도로 처리한다.
