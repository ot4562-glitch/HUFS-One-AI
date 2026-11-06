# HUFS One AI — 검증 결과와 해석

기준일 **2026-11-06**. 단위·통합 코드, 합성 브라우저, 일회용 PostgreSQL, 플랫폼 도구/모의 네트워크, 실제 사람/운영 결과를 따로 기록한다. 대상 11개 본선 전 이슈와 변경 범위는 [STATUS](STATUS.md)를 따른다.

## 추가 PR 코드 리뷰/CI 증거 (2026-11-06)

- [#305](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305): `main` 대비 변경 파일 0개로 검증, [COMMENT 리뷰](https://github.com/ot4562-glitch/HUFS-One-AI/pull/305#pullrequestreview-5797569357) 후 **중복 종료**. 별도 신규 기능/테스트 PASS로 계산하지 않음.
- [#307](https://github.com/ot4562-glitch/HUFS-One-AI/pull/307): 최신 PR HEAD `ba7bf2a77da97629f5efc993a1526bdafc1980bd`에서 **4종 Actions SUCCESS**: [TASK-00·PG](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685945), [Chrome E2E](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685929), [NCP IaC offline](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182686098), [Pages synthetic build/smoke](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685963). 8개 파일·검색/필터·시연 사용자 변경시 입력 초기화·모션 축소를 코드 리뷰 후 병합([main commit `d8e2144`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/d8e2144184d06577ff76d8e5e1ed3a13be09af4c)). **PR HEAD PASS를 main merge commit PASS로 전용하지 않음.** 각 main 실행은 [GitHub Actions](https://github.com/ot4562-glitch/HUFS-One-AI/actions)에서 확인.
- 이번의 GitHub COMMENT는 사람 독립 승인/실기기·스크린리더 사람이 수락한 증거가 아니다. 합성 7일 마감은 해당 snapshot의 날짜에 의존한다. 실제 학업/학생 4명·유료 AI·NCP 서버는 `NOT_RUN / CONFIGURATION_REQUIRED`이고 `RELEASE_BLOCKED`.

## 이번 검증에서 확인할 항목

| 범위 | 실행/근거 | 해석 |
| --- | --- | --- |
| 타입·전체 단위/합성 통합 | `npm run check` | 정확한 최종 HEAD의 결과를 종결 기록에 연결; DB가 없는 로컬의 PG SKIP과 CI 실행을 구별 |
| 추천 평가 | `npm run build:evaluation`, `npm run test:evaluation:cli` | 정정 시나리오 opt-in·r1 출력 불변·r2에 이전 라벨 재사용 차단; 사람 Gold는 NOT_RUN |
| UI/경험 | owner client/role·경험 등록·후보/승인/철회·세션/늦은 응답 회귀 | BETA 권한 어댑터·합성 fixture 검증이며 실제 학교 로그인/학생 인수 아님 |
| 자산 | `npm run assets:check` | 기존 SVG 10개 및 그림 8종/16 WebP의 ID·형식·해시·용량 검증, 12개 별도 예시 |
| 화면 | `npm run test:e2e:web`, accounts/empty-demo·Pages smoke | GitHub Chrome에서 전환/오류/두 탭·320–1440px 및 이미지 로드/fallback 확인; 실제 기기/NVDA 사람 인수 아님 |
| NCP Windows | 실제 WinSCP 6.7.0 SessionOptions 파서, PS5.1 native argv stub | 같은 digest 변환과 인용·경로·실패 후 중단 검증; 실제 서버 SSH/SFTP 교환 아님 |
| NCP Linux | `test_ncp_*.py`, Ubuntu 22.04/24.04 임시 키·bundle 회귀 | 경로·소유자·0600/0644 및 무단 인자 거부; 실제 host 설치 없음 |
| 공개 경계 | `npm run check:privacy`, committed-tree 메타데이터, publication gate | CSV 5개 불변·실자료/비밀의 CI·웹 번들 제외 |

정확한 명령 결과·커밋 SHA·GitHub Actions 링크는 **통합 PR과 각 이슈 종결 댓글**에 남긴다. 문서의 이전 숫자나 다른 SHA의 PASS를 최신 결과로 사용하지 않는다.

## 발견·수정한 회귀와 실패 기록

- PR #305 원본의 정정 보고서는 r1 검토 라벨을 r2에 사용했다. 새 회귀가 원본에서 실패하는 것을 확인하고 exact source revision 결속으로 수정했다. r1 초안 200/200은 그대로, 정정 시나리오에서는 미검토 r2 두 판본을 제외한 175/185다.
- WinSCP 실제 파서에서 PuTTY 형식 4개가 거부되고 변환 형식 4개가 수락됨을 확인했다. 도구별 표현은 달라도 32바이트 digest와 `Check` 정책은 보존한다.
- 로컬 Chromium E2E 7건은 브라우저 시작 단계의 `socket() Operation not permitted`로 실행되지 못했다. 이를 제품 assertion 통과나 시각 검증 완료로 기록하지 않고, GitHub Chrome 실행으로 별도 확인한다.
- 같은 owner의 focus/resume·경로 재진입에서 PENDING 요청의 idempotency key가 지워지는 문제를 재현·수정했다. 현재 actor의 세션 재확인에서는 요청 receipt만 유지하고 종료 시 삭제한다. raw 401/403의 HTML·잘못된 JSON도 terminal 인증/권한 오류로 전달한다.
- 전체 로컬 테스트 최초 실행은 3,714 PASS / 91 SKIP / 8 FAIL이었다. 2건은 변경한 403·WebP 동작에 대한 이전 assertion으로 확인하여 수정 후 해당 13개 테스트가 통과했다. 나머지 6건은 `networkInterfaces`와 UNIX socket의 환경 `EPERM`이며 검사를 제거하거나 성공으로 바꾸지 않았다. 동일 코드의 GitHub Linux 실행 결과를 별도 연결한다.
- 로컬 PDF 검사는 설치된 pypdf 6.10.0과 저장소의 6.21.4 버전 차이로 처음 실패했다. 해시가 고정된 6.21.4를 임시 경로에 설치한 뒤 실제 PDF 11개 검사가 통과했다. 전체 Python 출시 회귀는 158개 중 149 PASS / 9 SKIP(Windows·로컬 도구 부재)이다.
- 새 API 클라이언트의 잘못된 ID 처리와 새 이미지의 기존 SVG 전용 테스트 등 발견한 회귀를 수정하고 관련 검사를 다시 실행했다. 실패/수정 이력은 PR에 보존한다.

## 미완료인 실제 인수

- 지정 팀원들의 사람 교차 리뷰·모바일/스크린리더·포스터 수락: #280–#283, `NOT_RUN`.
- 추천 독립 Gold 0/200, 포스터 0/20, 시점 0/12. 자동 결과·작성자 초안으로 대체하지 않는다.
- 실제 Google/외대 메일·4인 Forms↔CSV↔actor·공식 학칙/학수번호·운영 PG/NCP/TLS·유료 모델·호스트 업로드/복구·비용: `CONFIGURATION_REQUIRED/NOT_RUN`, #276/#280–#283/#297/#299/#301/#302.
- 실서비스 정확도·시간 절감·사용성·p95/CPU/RSS/청구는 해당 실측 전 `NOT_MEASURED`다. 실서비스는 `RELEASE_BLOCKED`다.

[평가 방법](docs/INDEPENDENT_EVALUATION.md) · [사전 운영 계획](docs/PREFINAL_OPERATIONS_PLAN.md) · [사람 인수 기준](docs/HUMAN_ACCEPTANCE_GATE_20261104.md)
