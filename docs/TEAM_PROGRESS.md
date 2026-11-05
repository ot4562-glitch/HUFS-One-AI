# HUFS One AI — 5인 담당 범위 진척·증거 원장

> **2026-11-05 이슈 통합 안내:** 심민성 잔여 수락 게이트는 [**#252 실환경·인적·권리 인수**](https://github.com/minseong-hufs/HUFS-One-AI/issues/252), 구현/CI 추적은 [**#253 잔여 코드·계약·CI 구현**](https://github.com/minseong-hufs/HUFS-One-AI/issues/253)로 승계했다. 이전 이슈 13건은 CLOSED/DUPLICATE(미수락 조건 PASS 아님). 각 팀원의 기존 **고정 인수 분모/분자·사람 검수 여부는 이슈 수 감소로 바꾸지 않는다**.
>
> **2026-11-05 정리.** 최신 병합·CI·이슈는 [STATUS](../STATUS.md), 역할은 [WORKSTREAMS](WORKSTREAMS.md), 실환경·사람 검증은 [인수서](HUMAN_ACCEPTANCE_GATE_20261104.md)를 따른다. 이 문서는 고정 복합 게이트의 분모와 수락 증거를 보존한다.

## 산정 기준과 현재 결과

| 담당 | 수락/고정 분모 | 증거율 | 미수락의 핵심 |
| --- | ---: | ---: | --- |
| 심민성 | 7/12 | 58.3% | 실제 인증·운영 DB/TLS·원본 이력/권리·실사용 종단·독립 품질 |
| 이의상 | 9/12 | 75.0% | 실제 보조기기·학업/지원 전체 흐름·운영 세션/실기기 |
| 김채윤 | 7/12 | 58.3% | 독립 gold·공식 공고·실출처 품질/정책·권한 있는 운영 UI |
| 박준영 | 8/12 | 66.7% | 공식 RulePack·실 4인 학업 결과·권한/API/UI 종단 |
| 이서연 | 1/5 | 20.0% | 실제 NCP 계정/요금·보안·서비스 권한·호스트 측정/반납 |

하나의 게이트는 그 안의 필수 조건이 모두 충족되어야 수락한다. 코드·테스트·PR 수 증가를 사람 승인으로 바꾸거나 분모를 변경하지 않는다. 이 비율의 평균은 제품 완성률이 아니다. 참여 5명 전원 동의/HUFSAbility 수집 허가는 확보된 사용자 확인 사실이며, 실제 개인 원본 제공자 4명과 파일별 사용·전송·철회/과거 Git 검수는 별도다.

## 최신 코드의 인정 범위

| 코드 증거 | 인정 범위 | 그대로 남는 인수 |
| --- | --- | --- |
| #216 통합 | UI·API·Provider·학업·NCP 자동화와 기존 스택 조상 보존 | 실제 서비스·독립 사람 수락 |
| #217/#218 | What-if 합성 계산/보수적 검토와 동일교과 속성 회귀 | 공식 학칙·개별 원장·실제 화면 결과 |
| #219 검토 범위 | OIDC/SMTP·SQL role lifecycle·분산 demo quota·Source/OCR 연결 | 실제 인증·운영 PG·proxy client-IP·서비스 권한 |
| #220 검토 범위 | 네 AI 결과·이미지/PDF 근거·private intake·빈 시연/품질·산출물 검증 | 실제 원본/worker host·사람 gold·공개 서비스 |

#219/#220의 최종 병합 여부와 검증 HEAD는 [STATUS](../STATUS.md)에 기록한다. 일회용 실제 PostgreSQL CI 성공을 운영 DB/TLS 수락으로 쓰지 않는다. 자동 검토 COMMENT는 비작성자 사람 APPROVED가 아니다.

## 수락 게이트 원장 — 4인 개발 고정 범위 + 이서연 NCP 운영 신기준

### 심민성 `ot4562-glitch` — 7/12 (58.3%)

- [x] 공통 TypeScript/Zod 계약·합성 fixture·소비자 검사 main 통합 ([#8](https://github.com/minseong-hufs/HUFS-One-AI/issues/8), [PR #36](https://github.com/minseong-hufs/HUFS-One-AI/pull/36), [#83](https://github.com/minseong-hufs/HUFS-One-AI/pull/83)).
- [x] BETA/REVIEWER·invite/세션/CSRF/철회 **코드·합성/일회용 PG** ([#83](https://github.com/minseong-hufs/HUFS-One-AI/pull/83), [#105](https://github.com/minseong-hufs/HUFS-One-AI/pull/105), [#110](https://github.com/minseong-hufs/HUFS-One-AI/pull/110)).
- [x] SharingGrant/owner overlay·CAS·저장 권한 철회/삭제 서버·DB 경계 ([#83](https://github.com/minseong-hufs/HUFS-One-AI/pull/83), [#102](https://github.com/minseong-hufs/HUFS-One-AI/pull/102), [#112](https://github.com/minseong-hufs/HUFS-One-AI/pull/112)).
- [x] SourceRevision·Temporal RAG·승인 인용·원본 무결성·수집 동시성 보호 코드 ([#83](https://github.com/minseong-hufs/HUFS-One-AI/pull/83), [#99](https://github.com/minseong-hufs/HUFS-One-AI/pull/99), [#113](https://github.com/minseong-hufs/HUFS-One-AI/pull/113)).
- [x] 캘린더 GET/브라우저 클라이언트/지연 응답 격리 **API 부분** ([#58](https://github.com/minseong-hufs/HUFS-One-AI/pull/58), [#77](https://github.com/minseong-hufs/HUFS-One-AI/pull/77), [#95](https://github.com/minseong-hufs/HUFS-One-AI/pull/95)).
- [x] BOOKMARK stage·인가된 owner API, read-only 학업/What-if **DTO 안전 게이트** ([#97](https://github.com/minseong-hufs/HUFS-One-AI/pull/97), [#103](https://github.com/minseong-hufs/HUFS-One-AI/pull/103), [#107](https://github.com/minseong-hufs/HUFS-One-AI/pull/107), [#137](https://github.com/minseong-hufs/HUFS-One-AI/pull/137)). #217이 합성 What-if 계산 코어를 추가했으며 실제 학교 RulePack·운영 인수는 별도다.
- [x] 합성·일회용 PostgreSQL CI/오프라인 릴리스·개인정보 산출물 차단 코드 ([#89](https://github.com/minseong-hufs/HUFS-One-AI/issues/89), [#92](https://github.com/minseong-hufs/HUFS-One-AI/pull/92), [#104](https://github.com/minseong-hufs/HUFS-One-AI/pull/104), [#108](https://github.com/minseong-hufs/HUFS-One-AI/pull/108)).
- [ ] 실 Google OIDC/JWKS·학교 이메일 소유확인/OTP 발송·실 초대/로그인 종단 브라우저 ([#27](https://github.com/minseong-hufs/HUFS-One-AI/issues/27), [#25](https://github.com/minseong-hufs/HUFS-One-AI/issues/25)).
- [ ] 운영 PG·HTTPS/TLS/직접 IP·CDN·preview 차단·NCP 별도 보안 실증 ([#27](https://github.com/minseong-hufs/HUFS-One-AI/issues/27), [#89](https://github.com/minseong-hufs/HUFS-One-AI/issues/89)).
- [ ] Private Git 원본의 최초 게시·접근 범위/이력·개별 권리 검토 및 전체 개인정보 검사 통과 ([#46](https://github.com/minseong-hufs/HUFS-One-AI/issues/46)).
- [ ] 실제 UI·학업 provider·지원 흐름의 **운영/실자료 종단** ([#9](https://github.com/minseong-hufs/HUFS-One-AI/issues/9), [#80](https://github.com/minseong-hufs/HUFS-One-AI/issues/80), [#81](https://github.com/minseong-hufs/HUFS-One-AI/issues/81), [#82](https://github.com/minseong-hufs/HUFS-One-AI/issues/82)). #72~#76 **합성 UI 병합은 완료**, 실 provider는 아님.
- [ ] 사람 독립 gold 200건·실출처 추천 정확도/운영 성능 검수 ([#61](https://github.com/minseong-hufs/HUFS-One-AI/issues/61), [#21](https://github.com/minseong-hufs/HUFS-One-AI/issues/21)).

### 이의상 `uisang2004-maker` — 9/12 (75.0%)

- [x] 5개 시연 슬롯·요청 epoch·대상별 가드 ([#28](https://github.com/minseong-hufs/HUFS-One-AI/pull/28)).
- [x] HUFS 디자인 토큰/대비·달력 2주 순수 화면 모델 ([#64](https://github.com/minseong-hufs/HUFS-One-AI/pull/64)).
- [x] React/Vite·TSX·jsdom 기본 도구/설정 ([#66](https://github.com/minseong-hufs/HUFS-One-AI/pull/66)).
- [x] React 셸/탭/대상 선택기·상태 안내 ([#68](https://github.com/minseong-hufs/HUFS-One-AI/pull/68)).
- [x] 오늘/기회/공지 카드·목록·상세 합성 화면 ([#69](https://github.com/minseong-hufs/HUFS-One-AI/pull/69)).
- [x] 달력 DOM·비합성 `loadCalendar` 포트·동일-context snapshot 즉시 소거 ([#72](https://github.com/minseong-hufs/HUFS-One-AI/pull/72), [#51](https://github.com/minseong-hufs/HUFS-One-AI/issues/51)). 실 Google 운영과 별개.
- [x] REVIEWER 초대 등록 **UI**, 늦은 getSession/redeem·unmount/StrictMode cleanup 합성 회귀 ([#73](https://github.com/minseong-hufs/HUFS-One-AI/pull/73), 해당 PR의 UI 회귀 근거).
- [x] 학점/확인 필요·과거 개설 전망의 졸업 안내 UI, 비공식 판정/비공유 구별 ([#74](https://github.com/minseong-hufs/HUFS-One-AI/pull/74), 해당 PR의 UI 회귀 근거).
- [x] REVIEWER 합성 보관함·경험·설정/모의지원 UI, 대상 변경/스냅샷·미저장 초안 격리 ([#75](https://github.com/minseong-hufs/HUFS-One-AI/pull/75), 해당 PR의 UI 회귀 근거).
- [ ] **Playwright 브라우저 E2E + 360px + 키보드/실제 스크린리더**를 모두 독립 수락: [#76](https://github.com/minseong-hufs/HUFS-One-AI/pull/76)·[#126](https://github.com/minseong-hufs/HUFS-One-AI/issues/126)의 합성 Chrome/viewport/키보드/접근성 이름 테스트는 완료, **실 AT 수락 증거 미확인**.
- [ ] D-day·지원 보드·계획 나란히/What-if **UI 전체 묶음의 실제 수락** (#119). #216에 기존 화면 코드가 통합되었고 #217에 합성 계산 코어가 추가됐다. 공식 RulePack/실자료를 소비하는 전체 흐름 인수는 미완료이므로 고정 복합 게이트를 부분 점수로 바꾸지 않는다.
- [ ] 실 Google/HTTPS·권한 철회·다중 탭·스크린리더/실기기·운영 종단 검수 ([#9](https://github.com/minseong-hufs/HUFS-One-AI/issues/9), [#25](https://github.com/minseong-hufs/HUFS-One-AI/issues/25), [#89](https://github.com/minseong-hufs/HUFS-One-AI/issues/89)).

### 김채윤 `qamarrchae` — 7/12 (58.3%)

- [x] 결정론 개인별 추천·큰 카드/일반 피드 구성 ([#15](https://github.com/minseong-hufs/HUFS-One-AI/pull/15)).
- [x] 학생 중요공지·기한/마감·고정 알림 순수 코어 ([#16](https://github.com/minseong-hufs/HUFS-One-AI/pull/16)).
- [x] 시점·출처 revision/claim·캐시 분리와 권한 정책 버전 ([#40](https://github.com/minseong-hufs/HUFS-One-AI/pull/40), [#118](https://github.com/minseong-hufs/HUFS-One-AI/pull/118), [#140](https://github.com/minseong-hufs/HUFS-One-AI/pull/140) 합성 판본 회귀).
- [x] 추천 이유/관련도·토픽 다양성 코어 ([#41](https://github.com/minseong-hufs/HUFS-One-AI/pull/41), [#117](https://github.com/minseong-hufs/HUFS-One-AI/pull/117) 제외 이유 후속).
- [x] 미공유 학업·경험 정보 scope 격리 ([#49](https://github.com/minseong-hufs/HUFS-One-AI/pull/49)).
- [x] 확인된 마감·시험/행사·미정 일정의 캘린더 계산 ([#50](https://github.com/minseong-hufs/HUFS-One-AI/pull/50)).
- [x] 합성 코퍼스 40 공고×5 프로필/200개 **초안** 및 P@k·nDCG 재현 평가 도구 ([#48](https://github.com/minseong-hufs/HUFS-One-AI/pull/48), [#60](https://github.com/minseong-hufs/HUFS-One-AI/pull/60), [#67](https://github.com/minseong-hufs/HUFS-One-AI/pull/67)).
- [ ] 독립 사람이 검수한 정답 gold 200/200와 조건 일치 검증 ([#61](https://github.com/minseong-hufs/HUFS-One-AI/issues/61)): **확인된 0/200**.
- [ ] 실 HUFSAbility/기관 공고의 이용권·원문/정정·마감/지원 자격 검수 ([#10](https://github.com/minseong-hufs/HUFS-One-AI/issues/10), [#19](https://github.com/minseong-hufs/HUFS-One-AI/issues/19)).
- [ ] 실출처 개인화 품질/편향·Recall/latency의 독립 재현 ([#10](https://github.com/minseong-hufs/HUFS-One-AI/issues/10), [#21](https://github.com/minseong-hufs/HUFS-One-AI/issues/21)).
- [ ] 실권한 피드/캘린더 UI와 운영 권한·브라우저 종단 검수; 합성 UI/테스트 병합은 별개 ([#51](https://github.com/minseong-hufs/HUFS-One-AI/issues/51), [#89](https://github.com/minseong-hufs/HUFS-One-AI/issues/89)).
- [ ] rank-v1.1 기본 채택을 위한 독립 A15/사용자 검증·정책 승인 ([#10](https://github.com/minseong-hufs/HUFS-One-AI/issues/10), [#61](https://github.com/minseong-hufs/HUFS-One-AI/issues/61)).

### 박준영 `taewangim-alt` — 8/12 (66.7%)

- [x] 취득·수강 중·계획 세 원장/재수강·학점 순수 코어 ([#56](https://github.com/minseong-hufs/HUFS-One-AI/pull/56)).
- [x] 과거 개설 패턴/불확실성·시점 전망 코어 ([#57](https://github.com/minseong-hufs/HUFS-One-AI/pull/57)).
- [x] 한 학기 계획의 상한·선수·분반 시간 중복 검사 코어 ([#62](https://github.com/minseong-hufs/HUFS-One-AI/pull/62), [#135](https://github.com/minseong-hufs/HUFS-One-AI/pull/135) 60과목 제한 수정).
- [x] RulePack 효력·asOf/후보 거부·활성화 보호 ([#70](https://github.com/minseong-hufs/HUFS-One-AI/pull/70)).
- [x] 학업 미충족 요건→중요공지 입력 계약 ([#84](https://github.com/minseong-hufs/HUFS-One-AI/pull/84)).
- [x] old/new RulePack 개정 diff **합성 코어** ([#90](https://github.com/minseong-hufs/HUFS-One-AI/pull/90)).
- [x] 수강계획 충돌·검토 보류/안전 계산 ([#91](https://github.com/minseong-hufs/HUFS-One-AI/pull/91)).
- [x] owner 계획 응답 strict 버전/caveat 정합·독립 리뷰/CI ([#116](https://github.com/minseong-hufs/HUFS-One-AI/pull/116)).
- [ ] 실제 학번·전공·이중전공·중복인정 학칙 원문을 독립 승인한 공식 RulePack ([#11](https://github.com/minseong-hufs/HUFS-One-AI/issues/11), [#87](https://github.com/minseong-hufs/HUFS-One-AI/issues/87)).
- [ ] 권리 있는 학생 수강원장/입학년도·개인별 결과의 독립 손계산·동의 ([#11](https://github.com/minseong-hufs/HUFS-One-AI/issues/11), [#46](https://github.com/minseong-hufs/HUFS-One-AI/issues/46)).
- [ ] 승인된 학업 provider→owner `/api/study-plans/check` 실제 연결·UI #81 종단 검증 ([#27](https://github.com/minseong-hufs/HUFS-One-AI/issues/27), [#81](https://github.com/minseong-hufs/HUFS-One-AI/issues/81)). 승인 provider/owner 어댑터와 합성 UI는 구현되어 있으나 실제 공식 자료·운영 종단 인수는 미완료다.
- [ ] 타 전공을 가정한 What-if **공식 학칙 근거·실자료 결과·UI 종단 인수** (#11/#119/#133). #217의 계산 코어와 보수적 검토 표시, #218의 동일교과 속성 회귀는 main 반영. #107 DTO-only라는 과거 판단은 더 이상 현행이 아니다. WIS HTML/CSV 로컬 변환 및 합성 화면·현재 이중전공 코드는 존재하지만 실제 4인 결과를 공식 졸업 판정으로 승인하지 않는다.

### 이서연 `lhh42001` — **NCP 운영 전용 1/5 (20.0%)**, 2026-11-03 새 기준선

> **역할 기준 변경:** 이전 8개 항목에는 General OCR/HCX SDK, bbox, Laya ONNX worker, offline chaos 등 **개발 코드 업무**가 혼합되어 있었다. 모두 **심민성** [#20](https://github.com/minseong-hufs/HUFS-One-AI/issues/20)·[#88](https://github.com/minseong-hufs/HUFS-One-AI/issues/88)·[#143](https://github.com/minseong-hufs/HUFS-One-AI/issues/143)로 이전. 이서연에게 코드/스크립트/CI/IaC 개발 **0건** 배정. 옛 1/8(12.5%)은 역사적 수치일 뿐 지금의 1/5와 직접 비교 금지.

- [x] 조건부 High Memory-g3·NCP 크레딧/시간요금·서버/서비스 비용 상한, Laya 기본 OFF·CPU 보호의 **운영 계획 문서화** ([#12](https://github.com/minseong-hufs/HUFS-One-AI/issues/12), [#22](https://github.com/minseong-hufs/HUFS-One-AI/issues/22), [NCP 운영](NCP_OPERATIONS_2026.md)). 실 콘솔/과금 승인 아님.
- [ ] **NCP 계정/리전/SKU/크레딧·요금/과금 기간·서비스 구독 승인**의 실제 콘솔/계약 영수증 확인 ([#12](https://github.com/minseong-hufs/HUFS-One-AI/issues/12)).
- [ ] 사용자 승인 후 NCP **VPC/스토리지/ACL/TLS/DNS/비밀키/IAM·백업/복원·직접 IP/preview** 운영환경 보안 확인. 설정 스크립트/자동화·코드 작성은 심민성 ([#12](https://github.com/minseong-hufs/HUFS-One-AI/issues/12), [#89](https://github.com/minseong-hufs/HUFS-One-AI/issues/89)).
- [ ] **General OCR·HCX-005/007 서비스 이용권·endpoint·quota·실 과금·키 권한/운영 하드 한도** 확인/비코드 영수증. SDK/retry/비용 차단 구현은 심민성 ([#12](https://github.com/minseong-hufs/HUFS-One-AI/issues/12), [#20](https://github.com/minseong-hufs/HUFS-One-AI/issues/20)).
- [ ] 승인된 **NCP 실제 호스트**의 CPU/RSS/p95/비용·중단/복원/반납/청구 종료 영수증 확보. Laya worker·systemd·측정 스크립트 개발은 심민성 ([#22](https://github.com/minseong-hufs/HUFS-One-AI/issues/22), [#143](https://github.com/minseong-hufs/HUFS-One-AI/issues/143)). 실제 NCP 미개통 상태를 PASS로 보지 않음.

**NCP 운영 증거 수락 1/5 = 20.0%.** 개인 기여·능력·개발 완성률의 점수가 아니다.


## 공통 차단 및 기록 주의

- **#46:** 현재 Git 보호 경로 0과 과거 원본 6경로의 메타데이터 검사는 확인 범위가 다르다. 과거 178/180·2 FAIL은 당시 private checkout 보고이며 현재 코드 CI 실패를 뜻하지 않는다. 전체 private checkout·과거 접근/clone·파일별 권리 검수는 미수락이다.
- **#61:** 합성 40공고×5슬롯 초안 200개와 PNG/HTML20쌍·시간12건, 오프라인 검토/서명 검증·원장 도구는 구현 증거다. 확인된 독립 사람 gold는 **0/200**, 미디어·시간 판정은 **0/32**이며 자동/테스트 서명으로 올리지 않는다. [실행 패키지](INDEPENDENT_EVALUATION.md).
- **#89:** 실제 Google/학교메일·운영 PostgreSQL/TLS·NCP/직접 IP·복원·실기기·자료 권리 수락이 남아 **RELEASE_BLOCKED**다. AI 유료 실행과 Laya는 기본 OFF다.
- 역사적인 PR별 대기·충돌·점수 기록은 Git 이력에서 조회한다. CLOSED/미병합 스택 PR은 main 조상 포함 여부를 별도로 확인하며 모두 MERGED로 바꾸지 않는다.
