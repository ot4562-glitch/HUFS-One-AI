# HUFS One AI | 2026-11-04 PR 통합 후 남은 개발·인수 보고

**작성 기준:** GitHub main 코드 HEAD [f23b86bb](https://github.com/minseong-hufs/HUFS-One-AI/commit/f23b86bb693a163c7f6a0330d1b9657c684724ff). PR [#216](https://github.com/minseong-hufs/HUFS-One-AI/pull/216) merge 완료. **열린 PR 0건 / 일반 이슈 40건**. 최신 main 코드 HEAD의 [TASK-00](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41815023022)·[NCP Terraform mock](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41815022904)·[Chrome](https://github.com/minseong-hufs/HUFS-One-AI/actions/runs/41815022895) **3/3 SUCCESS**. 실제 운영 공개는 **RELEASE_BLOCKED**.

## 1. 병합 내용의 증거 수준

- 기존 열린 PR들을 #216 통합 merge commit으로 반영. 10개의 개별 CLOSED/NOT MERGED 스택 PR도 **각각의 최신 HEAD가 main Git 조상(10/10)**. 협업자 커밋·브랜치 보존, 일괄 squash/force push로 덮어쓴 것이 아니다.
- UI #151/#154/#155, Provider 브라우저/PG, Source jobs, NCP host·rollback, academic property tests 등 이번 스윕 코드가 main에 존재. 통합 CI 성공은 **합성/일회용 PG/오프라인 mock** 중심이다.
- 사용자 지시 1회 예외로 #216의 비작성자 사람 APPROVED 없이 병합했다. 이를 타인의 GitHub 승인으로 가장하지 않음. **향후 변경·릴리스 사람 인수는 별도**.

## 2. 심민성 담당 — 남은 구현(코드 vs 운영/인적 인수)

| 순위 | 작업 묶음 | main에 존재하는 코드 | 앞으로 직접 구현·검증할 것 | 구분 / 이슈 |
| --- | --- | --- | --- | --- |
| P0-1 | **운영 API 기동·세션** | Google OIDC·학교메일·PG store, 7개 TLS/ROLE pool, 루프백 내부 operator entrypoint #183/#213 | 실환경 신뢰 Google code exchange·학교메일 송신·config/secret 공급 및 운영용 전용 composition root, 세션/CSRF/철회·실세션 오류/다중 replica/브라우저 부정시험. production guard 무단 제거 금지 | **코드+실환경** #27 #25 #89 |
| P0-2 | **운영 SQL/권한·복구** | PG adapter·RLS/권한 부정시험·export/restore drill #190 등 | 최소권한 역할 7개와 TLS CA·실 migration 재현, 백업/복원/재시작 시 actor/rights·로그/캐시·삭제 불변식, 다중 서버 조건·실 Postgres 격리 증명 | **코드 통합+실환경** #27 #39 #89 |
| P0-3 | **SourceRevision·실자료 안전 연결** | Source permission, revision, approved fetch/extract, job queue/API #187, temporal RAG·권리 소멸/캐시 무효화 코드 | HUFSAbility 허가 범위의 실제 문서별 source/revision/저장본 SHA·영수증·철회 정책을 승인된 비공개 저장소로 연결, 출처 손실·중복/취소·수정/마감 조회·본인 권한 E2E | **코드 연결+기관 증빙** #19 #21 #39 #133 |
| P0-4 | **실 OCR/HCX Provider 종단** | offline CLOVA/HCX transport·budget/UNKNOWN_BILLING·Provider PG/HTTP, 승인 입력·timeout/cancel, Laya OFF | 실제 서비스 이용권·제공자 token/과금 한도·승인된 입력 경계를 private secret manager에 연결해 권한/late response/중복/429·503 시험. 허가 없는 원본 전송 금지. OCR 20건 bbox 품질 독립 판정 | **코드/인적+NCP 외부** #20 #88 #18 |
| P0-5 | **공개 서비스 보안·배포 전환** | Nginx/Docker private template, 검증용 내부 루프백 API, #214 server/network Terraform, #215 install/deploy/rollback | 출시 허가 후 production용 proxy/TLS/hosted DNS·CDN/WAF/Geo/직접 IP·사전 로그인 asset 차단, startup/shutdown/backup/rollback·포트/키 격리·실서비스 smoke. **현재 public ingress 출시 코드 승인·실수행 없음** | **별도 코드/운영** #89 #192 |
| P0-6 | **학생/학교 자료 영수증·Git 개인정보** | #212 current Git tree 810 path 중 보호 0; Forms 응답자 4/4 목적별 기록 | 실제 출처별 필드·용도/보관/전송/철회/자료별 권리, 4인 원본–세션 안전 매칭, 승인된 **full private checkout privacy 검사와 과거 Git history/clone** 증거 검토 | **실자료/인적 인수, 필요 시 코드 수정** #46 #133 |
| P1-1 | **공식 학업 종단/RulePack** | 동등/재수강·전공/학점·plan/What-if DTO, WIS 로컬 parser, #191/#205, #154/#155 화면 | 학번·학과·입학유형별 승인 RulePack, K-of-N·중복인정·전공 변경의 실제 계산 엔진/SourceArtifact SHA·독립 정답 및 실본인 owner API 권한 연결 | **코드+학칙 인수(박준영 범위 연계)** #11 #81 #82 #87 #133 |
| P1-2 | **독립 빈 시연/관리자·게시·UI 전체 흐름** | 합성 5슬롯/기본 empty owner reset·합성 club core/owner UI·menu manifest | 빈 시연 전 기능/RESET·권한 제한/만료, 가상 관리자 승인·철회/이미지 자산, 안전한 HUFSAbility 11영역 76화면 메뉴 맵/미지원 표시 및 접근성/브라우저 종단 | **코드+UI 인수(이의상 범위 연계)** #9 #123 #124 #132 #141 |
| P2-1 | **실환경 품질** | #161 Laya 격리 supervisor, #195/#204 컨텍스트 분리, #206 엔트리포인트, #210 benchmark, #205 academic property tests | 배포형 multi-replica quota/actor fair-use와 회복성, Laya CPU/RSS/OOM/p95 실측, automated axe/forced-colors/스크린리더, bench 환경/독립 기대값·실데이터 없는 재현 보고 | **후속 코드/현장 평가** #88 #143 #199 #200 #201 #202 #203 |

## 3. 개발 코드로 대체 불가능한 별도 검증

- **독립 추천 gold:** 합성 40공고×5프로필 = 200개 작성자·합성 초안이 있어도 **독립 사람 최종 확인 0/200**. #61. 사용자가 직접 수행할 수는 있으나 작성자가 자신의 답을 독립 평가한 것으로 기록하면 안 됨.
- **공모전 참여·학교 수집 허가:** 사용자 확인으로 참여 5명 전원 동의 및 **HUFSAbility 자료 수집 허가 확보**. 개인 수강/Forms 원본 실제 대상은 **4명**. 공식 강의시간표의 공개 교수명·강의명은 필요한 용도 한정; 무조건 이름 마스킹을 출시 차단이라고 하지 않음. 세부 허가 필드/학교 운영·SSO·외부 AI/재배포는 별도 확인.
- **NCP 실운영:** 이서연에게만 비코드 실계정/크레딧/SKU/요금/VPC/호스트 CPU/지출/반납 근거를 배정한 기존 범위를 유지. 개발·IaC·SDK·OS·배포 자동화 **모두 심민성 코드 책임**. 현재 실제 NCP provision/SSH/OCR/HCX/VM 실측 **NOT_RUN**이고 사용자 명시 지출 승인 필요.
- **출시 보안:** #89의 실 Google 메일/OIDC, 운영 PostgreSQL/RLS, TLS/직접 IP/익명 유출, 영속 권한 철회·복구, 실제 모바일/스크린리더 테스트 **아직 수락 없음**. **RELEASE_BLOCKED**.

## 4. “얼마나 남았나” — 수치와 한계

| 구분 | 현재 | 정확한 해석 |
| --- | ---: | --- |
| PR 소진 | **0 OPEN / 정리 종료** | PR 대기 업무가 0이라는 뜻. 기능 개발 완료 100%가 아님 |
| 일반 이슈 | **40 OPEN**, 전부 2026-11-04 코드·미수락 항목을 최신화 | 큰 상위 이슈가 실자료/기관/실서비스 인수까지 포함. 숫자 40이 곧 40개의 미구현 함수는 아님 |
| **심민성** 고정 수락 | **7/12 = 58.3%**, 나머지 **5개 복합 게이트 미수락** | 코드량과 독립 운영·인적 증거가 섞인 수락률. “41.7% 코드 미구현”이라 계산 불가 |
| 이의상 UI | 9/12 = 75.0% | 실제 전체 UI/접근성 미수락 |
| 김채윤 추천 | 7/12 = 58.3% | 독립 추천 gold 0/200 |
| 박준영 학업 | 8/12 = 66.7% | 공식 학칙/RulePack·실학사 자료 미수락 |
| 이서연 NCP 비코드 운영 | 1/5 = 20.0% | 범위 재정의된 운영 증거율. API/SDK 코딩 평가 아님 |

**권고 순서:** (1) P0-1~P0-3 운영 API/rights/DB 통합 테스트 → (2) P0-4 OCR/HCX와 데이터 전송 권한, P0-5 릴리스 보안 코드 → (3) P1-1 학업 RulePack·P1-2 demo/UI 전 기능 → (4) P2 자동 접근성/분산 quota 및 독립 평가 → (5) 사전 승인 후 유료 NCP 현장·실 Google/PG/OCR/복구/출시 검증. 각각 합성 코드/실사용/인적 승인 결과를 따로 기록한다.

이 보고서는 제품 완성도를 임의로 단일 퍼센트로 환산하지 않는다. [현재 상태](../STATUS.md), [인적 검증](HUMAN_ACCEPTANCE_GATE_20261104.md), [담당별 고정 게이트](TEAM_PROGRESS.md), [원본 개인정보](DATA_GOVERNANCE.md) 참조.
