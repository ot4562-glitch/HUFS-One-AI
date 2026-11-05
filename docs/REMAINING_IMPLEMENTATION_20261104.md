# HUFS One AI | 남은 개발·실환경·인적 인수

> **2026-11-05 갱신.** 파일명은 기존 링크 호환을 위해 유지한다. 최신 main/PR·CI/리뷰·이슈 상태는 [STATUS](../STATUS.md)가 정본이다. 과거 f23b86bb·OPEN PR 0·#216 당시 CI를 현재 HEAD 검증으로 재사용하지 않는다. **RELEASE_BLOCKED**.

**2026-11-05 최종 재통합:** 이전 #61/#123/#132/#133은 구현 납품 분만 종료됐고 #221/#222로 실인수를 처음 승계했으나, 이후 심민성 담당 원 #8/#19/#20/#27/#46/#89/#221/#222/#234~#238 **13건이 전부 CLOSED/DUPLICATE** 됐다. **최신 두 정본은 [**#252 실환경·인적·권리 인수**](https://github.com/minseong-hufs/HUFS-One-AI/issues/252)와 [**#253 잔여 코드·계약·CI 구현**](https://github.com/minseong-hufs/HUFS-One-AI/issues/253)** 이다. 아래 표의 원 이슈 번호는 2026-11-05 이전 구현/책임 이력으로만 읽는다. 인적 gold 0/200·0/32, 실제 4인 원본 미반입, NCP/운영 미검증 및 **RELEASE_BLOCKED**는 불변이다.

## 1. 코드 반영과 인수의 구분

#216은 기존 UI·API·Provider·학업·NCP 자동화와 스택 PR 조상을 통합했고, #217은 What-if 합성 계산/보수적 검토, #218은 동일교과 속성 회귀를 추가했다. #219/#220의 후속 인증·SQL·Source/AI·private intake·빈 시연 연결은 각각의 최신 HEAD 검증과 병합 기록을 STATUS에서 확인한다.

GitHub의 CLOSED/NOT MERGED 스택 PR은 main 조상에 포함될 수 있지만 개별 PR 자체를 MERGED로 표기하지 않는다. 자동 리뷰 COMMENT와 비작성자 사람 APPROVED, 일회용 PG/Chrome 시험과 실제 서비스 인수를 각각 분리한다.

## 2. 기능별 남은 작업

| 우선 | 정본/책임 | 구현·자동검증으로 인정할 부분 | 남은 코드·연결·인수 |
| --- | --- | --- | --- |
| P0 | #27/#89 · 심민성 | OIDC PKCE/OTP·SMTP 포트, 7개 기본 SQL 역할·확장 pool lifecycle, loopback API, owner CAS/세션·일회용 PG | 운영용 composition root·검증된 proxy client-IP/한도, 실 Google/메일·운영 CA/TLS·최소권한·다중 인스턴스·영속 철회/복원. production guard 무단 제거 금지 |
| P0 | #19 · 심민성 | source 권리/불변 revision·approved egress·image/PDF 근거·temporal reader/reviewer·취소/late 응답 회귀 | 승인된 실제 출처별 필드/목적·보관/외부 전송, 원본 SHA→PG/RLS→검색·인용→React 종단, 독립 OCR/정정/시간 근거 검수 |
| P0 | #20 · 심민성 | 네 AI task 결과·인용 검증, 비용 예약/정산·미발송 취소 정리, Laya 기본 OFF·격리 코드 | 실제 provider token/finishReason·quota/과금·429/503·불명확 청구, 검토된 worker/rootfs 전체 실행, CPU/RSS/OOM/p95 및 허가된 입력 품질 |
| P0 | #46 · 심민성 | #212 현재 보호 경로 제거, 현재/과거 Git 메타데이터·public artifact 차단 | 승인된 full private checkout 재검증, 과거 원본 6경로의 접근/clone/backup·최초 게시·원본별 권리. 현재 경로 0만으로 과거 배포 수락 불가 |
| P0 | #221(구 #61)/#10 · 심민성·이의상 / 김채윤 | 40공고×5슬롯 초안·metric, 고정 tune/report split·서명 검증/원장/오프라인 검토 도구, PNG/HTML20쌍·temporal12 패키지 | 독립 사람 gold **0/200**·미디어/시간 **0/32**, 실제 검토 권한/서명·공정한 정책 비교·실출처/외부 provider 품질·실환경 성능 |
| P0 | #12/#89/#222 · 이서연 운영 / 심민성 코드 | NCP IaC·plan-only/SSH preview·설치/rollback 합성 검증 | 실계정/SKU/크레딧·지출 승인, ACG/NACL·TLS/직접 IP/IPv6·호스트·백업복구·청구/반납. 오프라인 CI는 실 NCP 실행 영수증이 아님 |
| P1 | #11/#221(구 #133) · 박준영·심민성 | WIS hash/현재 권한·원본 receipt/preview 결속, degreePath/track·문서별 SHA·AREA_SPREAD/GROUP_CHOICE·보수적 What-if와 4-owner atomic CAS | 실제 owner/cohort/입학유형 binding·원본별 권리, 공식 RulePack·언어 속성 근거·손계산과 실제 API/UI |
| P1 | #9/#119/#221(구 #132) · 이의상·심민성 | 메뉴/정정·학업/계획 UI·빈 시연 설정/저장/RESET·360px/키보드 합성 브라우저·runbook | 전체 메뉴/역할별 오류·철회·다중탭, 실제 스크린리더·발표 리허설/독립 인수. memory browser 결과와 PG 재시작/RLS 로그를 구분 |
| P1 | #221(구 #123) · 이의상·심민성·김채윤 | 영속 PG CAS/FORCE RLS·ADMIN 게시/수정/승인/철회·BETA 읽기/추천·인증 자산, AI 생성 PNG/출처/hash | 가상 ADMIN 게시/철회·영속 PG 연결과 독립 모바일/키보드/보조기기·전체 여정 인수. 실학교 모집/게시로 확장할 경우 별도 권리 승인 |
| P1 | #8/#89 · 심민성 | API/TASK·entrypoint inventory, 공개 산출물·npm license evidence/CycloneDX | UNKNOWN route/consumer 대응, native/Python/font/model/asset 전체 라이선스·NOTICE·배포 산출물 수락 |

### #133의 공식 학업 계약 검토

#220은 #133 반례 중 degreePath/track별 pack 선택, 문서별 근거 SHA, AREA_SPREAD/GROUP_CHOICE의 계약·원장·개정 비교와 What-if 검토 보류를 확장했다. 이를 공식 학칙 승인으로 계산하지 않는다. 실제 학교 문서·언어 속성·예외/중복인정과 4인 손계산 대조를 독립 검수하며, 근거 없는 팩은 DRAFT/UNKNOWN_APPLICABILITY를 유지한다.

## 3. 실제 완료로 바꾸지 않는 조건

- 사용자 확인으로 **공모전 참여 5명 전원 동의 및 HUFSAbility 자료 수집 허가 확보**. 실제 개인 수강/Forms 제공자 **4명**과 구분한다. 파일별 사용·외부 전송/게시·보관/철회 및 과거 Git 검수는 별도다.
- 독립 사람 gold는 확인된 **0/200**이다. 작성자/AI 초안·검사 스크립트를 사람 서명으로 처리하지 않는다.
- ASSET01–10 original SVG fallback, #61의 코드 생성 PNG/HTML20쌍, #123의 AI 생성 PNG 1개를 각각 구분한다. 자산 생성과 hash 확인은 독립 사람 검수가 아니다.
- 실제 Google/학교메일·운영 PostgreSQL/TLS·NCP·유료 OCR/HCX/Laya host·실학생 반입은 해당 실행/수락 증거가 있어야 완료다.
- 열린 정본 이슈는 완료한 코드 하위항목을 표시하되 미수락 복합 조건이 남으면 OPEN을 유지한다. 중복 이관 CLOSED를 기능 완료로 합산하지 않는다.

## 4. 진행률과 다음 판단

고정 수락률은 심민성 **7/12**, 이의상 **9/12**, 김채윤 **7/12**, 박준영 **8/12**, 이서연 **1/5**를 유지한다. 분모·미수락 조건은 [TEAM_PROGRESS](TEAM_PROGRESS.md), 작업 책임은 [WORKSTREAMS](WORKSTREAMS.md)에 있다. 코드·통합·품질/권리·NCP 운영의 네 축은 [서비스 계획](SERVICE_DELIVERY_PLAN.md)으로 관리하며 임의의 전체 완성률·출시일은 만들지 않는다.
