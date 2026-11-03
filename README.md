# HUFS One AI

**한국외대 학생의 정보 탐색·개인화를 돕는 독립 팀 프로젝트**입니다. 기존 HUFSAbility의 익숙한 기능과 메뉴를 보존하는 사용자 경험을 목표로 하지만, **학교 공식 HUFSAbility 개편·운영 서비스가 아닙니다**. 원본 UI/학교 저작물·학생 데이터·공식 로그인·자료 이용권을 허가 없이 복제·연동하지 않습니다.

## 완료 목표와 배포·유지보수 단계 (지속 지침)

**GitHub 개발의 최종 목표는 사용 가능한 HUFS One AI 서비스의 완성**이다. 단순 PR 개수·기능 코드 추가·합성 데모가 출시를 뜻하지 않는다. **서비스 완성 및 검증 → 사용자 승인에 따른 NCP 배포 → NCP 배포 후 지속적인 유지보수·품질 개선**으로 단계가 바뀐다.

1. **서비스 완성:** 허용·동의된 사용자와 자료만으로 학생 주요 여정(맞춤 기회/공지/학업/일정/시연)을 실제 UI↔API↔영속 DB까지 연결하고, 인가·로그인(실 Google OIDC/외대 메일 확인)·접근성·원본 권리·독립 품질 평가를 수락 기준대로 통과한다. 안 된 항목을 합성 테스트 통과로 완료 처리하지 않는다.
2. **NCP 배포 준비와 운영 전환:** 실제 서버는 사용자 **별도 과금/배포 승인**, [#46 개인정보 감사](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46)와 [#89 릴리스 보안](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) 해제, 실 Google/TLS/PG·영속 철회/직접 IP/GeoIP 경계 등 독립 검증이 선행되어야 한다. 서버 생성·공인/사설 IP·VPC/ACG/NACL·포트·NCP 인증키/초기 암호·PuTTY/WinSCP·한국 IP Wall·시스템 설치는 [NCP 운영 정본](docs/NCP_OPERATIONS_2026.md)과 [Draft PR #156의 단계별 서버 실행서](https://github.com/ot4562-glitch/HUFS-One-AI/blob/feat/ncp-safe-bootstrap-preview-20261103/infra/ncp/README.md)에 기록했다. **PR #156은 아직 미병합이며 자동화는 SSH 전용 합성 미리보기까지만**이다. 실제 production 자동 배포가 이미 가능하다고 주장하지 않는다.
3. **배포 후 유지보수:** 출시 뒤 GitHub의 일차 목표를 안정 운영으로 전환한다. OS/Node/의존성 보안 패치, 신뢰·접근성/오류 회귀, 로그인/권한 철회, API p95/CPU·메모리·디스크, NCP 크레딧·청구·비밀키 회전, 데이터 백업·복원·롤백/장애 대응, 출처·개인정보 권리/삭제 요청과 운영 종료·반납을 실제 영수증으로 관리한다. 변경은 이슈→PR→독립 리뷰/CI→배포/롤백 증거 순으로 기록한다.

현재 승인·진행 상태와 출시 차단은 [STATUS](STATUS.md) 및 [서비스 완성/유지보수 계획(PR #156)](https://github.com/ot4562-glitch/HUFS-One-AI/blob/feat/ncp-safe-bootstrap-preview-20261103/docs/SERVICE_DELIVERY_PLAN.md)을 참조한다. 서버/비밀키/실학생 자료/유료 API를 PR, CI, 에이전트 메시지에 넣지 않는다.

## 제품 방향

- 기존 **비교과·장학·공지·채용·역량·상담·진로·학업** 메뉴와 학생 여정을 쉽게 찾도록 구성합니다. [공식 공개 기능 5분류/24기능·비로그인 4영역](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124)과 [학생 계정 관찰 UI 11개 대분류/76화면](docs/HUFSABILITY_UI_COMPONENT_ATLAS.md)은 관찰 범위가 다르며 명칭·계층을 별도로 대응합니다.
- 실제 구현·인가된 **합성 데모**에 한해 기능을 켭니다. 미연동 기존 메뉴도 사라지지 않고 **🚫 이번 시연 미지원 / 검증 전**을 명시합니다.
- 같은 허용 공고를 관심사·선택한 경험·진로에 따라 다르게 정렬해 큰 추천 카드/작은 일반 목록, 추천 이유·마감/정정 근거, 일정·자기기록·별도 학업 계획을 안내합니다. AI의 분류 후보는 확정 결과가 아니고 자격·마감·학점은 코드 및 검수 근거로 판정합니다.
- [#141 UI/UX 고도화](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141): 기존 HUFSAbility와 동일한 픽셀·컴포넌트를 복제하는 대신 **탐색·정보 위계·모바일·접근성이 더 좋은 독립적인 디자인**을 개발합니다.

## 현재 구현/출시 상태 — 2026-11-03

| 구분 | 상태 |
| --- | --- |
| 공개 원격 저장소 | **Private** |
| 실제 코드 | TypeScript/Zod 계약, 추천·공지/학업 코어, Fastify API, React/Vite UI, 합성 테스트 |
| 검증된 최근 병합 | [#145 오프라인 OCR·HCX wire](https://github.com/ot4562-glitch/HUFS-One-AI/pull/145) `cade7c9b`, [#148 비용 원장](https://github.com/ot4562-glitch/HUFS-One-AI/pull/148) `e102516`, [#131 BETA 설정 UI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/131) `6efc532`, **[#149 시간표 CSV/handoff](https://github.com/ot4562-glitch/HUFS-One-AI/pull/149) `efa13368`**. 모두 최신 HEAD 비작성자 승인·CI 3/3 후 main; 실 출처/데이터/API/배포 수락은 별도 |
| 진행 중 PR | **2건 OPEN:** [#134 합성 시연 프로필 UI](https://github.com/ot4562-glitch/HUFS-One-AI/pull/134) main 재기반/중복 충돌, [#150 provider/Laya/API 통합](https://github.com/ot4562-glitch/HUFS-One-AI/pull/150) **Draft·충돌·비작성자 승인 대기**. [#149](https://github.com/ot4562-glitch/HUFS-One-AI/pull/149)는 P2 수정/재승인 뒤 **main 병합 완료** |
| 운영/실자료 | **RELEASE_BLOCKED** — [#46 개인정보/자료 이력](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46), [#89 공개 노출·인증·인프라](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) |

**2026-11-03 최신 검토:** #145·#148·#131에 이어 [#149](https://github.com/ot4562-glitch/HUFS-One-AI/pull/149) WIS 시간표 8열 CSV/handoff가 이전 UNKNOWN 캠퍼스 근거 오류 수정·음성 회귀·비작성자 APPROVED·필수 CI 3/3 뒤 **main `efa13368`** 병합됐습니다. 현재 열린 일반 이슈 34개는 [담당자별 전수 원장](docs/WORKSTREAMS.md)에 **심민성 17·이의상 11·김채윤 2·박준영 2·이서연 2(미배정/중복 0)**로 주관 1명씩 분류, 닫힌 7건 별도 기재. 같은 WIS URL에서 다른 파일의 **저장본별 권리 receipt** 문제는 #27/#133 OPEN. **#46 개인정보·#89 출시 `RELEASE_BLOCKED`**와 무승인 유료 NCP/학교·학생 원본 전송 금지는 불변.

최근 #139/#140의 GitHub Actions 합성/일회용 PostgreSQL/Chrome **각 3/3 성공**은 해당 PR HEAD의 **합성 회귀**에 대한 증거입니다. 실제 HUFSAbility 데이터·공식 학칙·학생 4인 로그인, 운영 NCP/CLOVA·실제 기관/자료 권리, 배포/보안을 검증 완료했다는 의미가 아닙니다. 상세 증거 및 차단 사항은 [STATUS.md](STATUS.md)를 봅니다.

## 로컬 합성 개발

**Node.js 22.12+**, npm 기반 프로젝트이며 아래 명령은 **개발용**입니다(새로 실행했다는 뜻 아님).

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run check:privacy
```

로컬 합성 계정 실험실은 **터미널 두 개**에서 각각 다음 명령을 실행합니다(실제 개인정보 입력 금지).

```sh
npm run start:api:synthetic-accounts
```

```sh
npm run dev:web -- --mode synthetic
```

그 뒤 `http://127.0.0.1:5173/local-demo`를 사용합니다. 합성 데이터는 실제 제출 대상 4명, 기존 S01~S05 시연 슬롯, REVIEWER와 구분합니다. 종료/초기화·개별 시나리오는 [로컬 시연 매뉴얼](docs/DEMO_MANUAL.md)을 따릅니다. 실제 웹 접속 주소로 안내하지 않습니다.

## 중요한 권한/자료 경계

- GitHub Private에 과거 추적된 보호 학생 수강/Forms 원본은 **접근·게시 이력/목적별 공유 권한 감사 미완료**입니다. 기존 기록의 개인정보 경계 2 FAIL을 통과한 것으로 표시하지 않습니다. 원본·개인별 응답을 CI, 공개 웹, 외부 모델/클라우드, PR/이슈에 반입하지 않습니다.
- 실제 공고·학칙·교과/상담 자료는 승인된 출처와 시점, 개별 이용권·권한이 필요한 경우에만 처리합니다. 가상 입력과 `UNKNOWN/NEEDS_REVIEW`는 공식 확정 판정과 구분합니다.
- 예정 도메인 `외대.온라인.한국` 및 Google OAuth+외대 이메일 확인은 **설계**이며 실 DNS/TLS·OIDC/메일·PostgreSQL·NCP·익명 접근 차단 배포는 현재 승인/검증 전입니다.
- 오프라인 CI 합격·PR 병합·이슈 체크는 출시/학교 운영 승인이나 유료 서비스 개통의 증명이 아닙니다.

## 문서와 협업

| 목적 | 문서 |
| --- | --- |
| 팀/심사 기획 | [Proposal](Proposal.md), [APPLICATION](APPLICATION.md) |
| 제품 계약·권한·API·학업·시연 설계 | [Architecture](Architecture.md), [데이터 거버넌스](docs/DATA_GOVERNANCE.md) |
| 현재 구현/검증·차단 | [STATUS](STATUS.md), [GitHub Issues](https://github.com/ot4562-glitch/HUFS-One-AI/issues) |
| 개발 규칙·승인 | [AGENTS](AGENTS.md), [PR_WORKFLOW](docs/PR_WORKFLOW.md) |
| 팀 소유·진행 | [WORKSTREAMS](docs/WORKSTREAMS.md), [TEAM_PROGRESS](docs/TEAM_PROGRESS.md) |
| 사용성 참고/시연 | [UI 아틀라스](docs/HUFSABILITY_UI_COMPONENT_ATLAS.md), [DEMO_MANUAL](docs/DEMO_MANUAL.md) |

세부 역사적 실험 결과는 GitHub PR/커밋에 보존합니다. 오래된 문서 헤더의 "현재" 표시보다 해당 이슈 최신 판정·현재 `main`을 우선합니다.
