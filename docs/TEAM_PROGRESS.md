# HUFS One AI — 5인 담당 범위 진척·증거 원장

> **기준:** 2026-11-01 KST · 문서 업데이트 직전 `main` `8070e3d` · [해당 HEAD Actions #41306183268](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41306183268) `synthetic-contracts`/`postgres-integration` **2/2 SUCCESS**. 이 문서 자체의 변경 커밋 CI 성공은 별도로 확인해야 한다.

## 진척 산정 규칙

- **‘증거 기반 담당 범위 진척’은 이 문서에 고정한 담당별 수락 게이트 중 `[x]` 개수 ÷ 전체 게이트 × 100**이며, 무가중·소수 첫째 자리 반올림이다. 이는 특정 스코프 체크리스트의 **증거 충족률**이지 실제 제품 완성도, 작업량/근무 성과, 일정 진척, 개인 능력 평가가 아니다. 담당별 분모와 의존성이 달라 개인 간 점수 순위로 비교할 수 없다.
- `[x]`는 **해당 게이트의 좁은 범위**에 대해 `main` 병합된 코드+테스트/검증 근거(또는 NCP 문서화 게이트)가 확인됨을 뜻한다. 미병합 PR·작성자 로컬 통과 주장·계약만 존재하는 기능의 실서비스 완료·기관/학생 동의 추정은 인정하지 않는다. 실제 원본/운영/인적 검수 게이트는 해당 증거가 없으면 `[ ]`로 둔다.
- **개별 gate는 부분 점수 0**이다. 다른 트랙이 공급하는 선행 코드나 미승인 외부 자원이 필요한 항목도 아직 수락되지 않으면 `[ ]`이며 담당자의 태만을 뜻하지 않는다. 코드 공급자가 다른 PR은 공동 의존임을 명시하고 작성자 개인의 기여로 단독 귀속하지 않는다.
- 지난 문서의 **75/30/80/35/10%**는 이 산식이 없는 과거 추정치이므로 현재 진척으로 사용하지 않는다(원본은 Git 이력에서 보존). 새 수치 산정에 별도 테스트를 실행하거나 유료 NCP·실학생 자료에 접근하지 않았다.

## 증거 기반 담당 범위 진척 — 2026-11-01

| 담당(스코프) | 증거 기반 담당 범위 진척 | `main`에서 확인한 대표 산출물 | 남은 핵심 수락 조건 |
| --- | ---: | --- | --- |
| **심민성** `ot4562-glitch` | **7/12 (58.3%)** | [PR #83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83) API/PG/RAG·auth; [PR #97](https://github.com/ot4562-glitch/HUFS-One-AI/pull/97)/[PR #103](https://github.com/ot4562-glitch/HUFS-One-AI/pull/103)/[PR #107](https://github.com/ot4562-glitch/HUFS-One-AI/pull/107) 단계별 계약 | [Issue #46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46) 자료 승인·이력; [Issue #89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) 운영 검증; [PR #72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72)~[PR #76](https://github.com/ot4562-glitch/HUFS-One-AI/pull/76) UI 연동 |
| **이의상** `uisang2004-maker` | **5/12 (41.7%)** | [PR #28](https://github.com/ot4562-glitch/HUFS-One-AI/pull/28)/[PR #64](https://github.com/ot4562-glitch/HUFS-One-AI/pull/64)/[PR #66](https://github.com/ot4562-glitch/HUFS-One-AI/pull/66)/[PR #68](https://github.com/ot4562-glitch/HUFS-One-AI/pull/68)/[PR #69](https://github.com/ot4562-glitch/HUFS-One-AI/pull/69) 시연·기본 UI; [PR #72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72)/[PR #75](https://github.com/ot4562-glitch/HUFS-One-AI/pull/75) 차단 해소 | [PR #73](https://github.com/ot4562-glitch/HUFS-One-AI/pull/73)/[PR #74](https://github.com/ot4562-glitch/HUFS-One-AI/pull/74)/[PR #76](https://github.com/ot4562-glitch/HUFS-One-AI/pull/76) CI·E2E; [Issue #79](https://github.com/ot4562-glitch/HUFS-One-AI/issues/79)~[Issue #82](https://github.com/ot4562-glitch/HUFS-One-AI/issues/82) 추가 화면 |
| **김채윤** `qamarrchae` | **7/12 (58.3%)** | [PR #15](https://github.com/ot4562-glitch/HUFS-One-AI/pull/15)/[PR #16](https://github.com/ot4562-glitch/HUFS-One-AI/pull/16)/[PR #40](https://github.com/ot4562-glitch/HUFS-One-AI/pull/40)/[PR #41](https://github.com/ot4562-glitch/HUFS-One-AI/pull/41)/[PR #49](https://github.com/ot4562-glitch/HUFS-One-AI/pull/49)/[PR #50](https://github.com/ot4562-glitch/HUFS-One-AI/pull/50); [PR #48](https://github.com/ot4562-glitch/HUFS-One-AI/pull/48)/[PR #60](https://github.com/ot4562-glitch/HUFS-One-AI/pull/60)/[PR #67](https://github.com/ot4562-glitch/HUFS-One-AI/pull/67) 합성 평가 | [Issue #61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61) 인적 골드 0/200; [Issue #10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10) 실자료/효과검증 |
| **박준영** `taewangim-alt` | **8/12 (66.7%)** | [PR #56](https://github.com/ot4562-glitch/HUFS-One-AI/pull/56)/[PR #57](https://github.com/ot4562-glitch/HUFS-One-AI/pull/57)/[PR #62](https://github.com/ot4562-glitch/HUFS-One-AI/pull/62)/[PR #70](https://github.com/ot4562-glitch/HUFS-One-AI/pull/70); [PR #84](https://github.com/ot4562-glitch/HUFS-One-AI/pull/84)/[PR #90](https://github.com/ot4562-glitch/HUFS-One-AI/pull/90)/[PR #91](https://github.com/ot4562-glitch/HUFS-One-AI/pull/91)/[PR #116](https://github.com/ot4562-glitch/HUFS-One-AI/pull/116) | [Issue #11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11) 실제 학칙/원장; [Issue #81](https://github.com/ot4562-glitch/HUFS-One-AI/issues/81)/[Issue #82](https://github.com/ot4562-glitch/HUFS-One-AI/issues/82) provider/What-if/UI |
| **이서연** `lhh42001` | **1/8 (12.5%)** | NCP 설계·OFF/예산 정책 [Issue #12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12)/[Issue #22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22); [Issue #20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20) OCR/HCX 공급자 실검증 | [Issue #88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88) 장애/비용/CPU; [Issue #89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) 실운영 게이트 |

**코드와 운영을 분리한 확인 사실:** [PR #83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83)은 이미 `main` 병합([Actions #41295926141](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41295926141) 두 job SUCCESS)되었고, [PR #116](https://github.com/ot4562-glitch/HUFS-One-AI/pull/116)은 비작성자 현재 HEAD 승인·[Actions #41301183012](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41301183012) 두 job SUCCESS 후 병합됐다. 과거 특정 회차의 본인 작성 PR 직접 병합은 [PR 워크플로](PR_WORKFLOW.md)의 **제한된 예외**이며 독립 APPROVED를 뜻하지 않는다.


## 담당별 고정 수락 게이트 (재계산 원장)

### 심민성 `ot4562-glitch` — 공통 계약 · 인증/인가 · 일반 PostgreSQL · API/RAG · 통합 보안

- [x] 공통 TypeScript/Zod 계약과 합성 fixture·소비자 테스트를 `main`에 통합 ([Issue #8](https://github.com/ot4562-glitch/HUFS-One-AI/issues/8), [PR #36](https://github.com/ot4562-glitch/HUFS-One-AI/pull/36), [PR #83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83)).
- [x] BETA/REVIEWER 분리, 세션·CSRF·초대 재검증/철회 **코드·합성/일회용 PG 경로** 통합 ([PR #83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83), [PR #105](https://github.com/ot4562-glitch/HUFS-One-AI/pull/105), [PR #110](https://github.com/ot4562-glitch/HUFS-One-AI/pull/110)). 실 Google 로그인 검증과 별개.
- [x] SharingGrant/owner overlay, CAS 및 개인 기록 철회·삭제의 서버·DB 경계 구현 ([PR #83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83), [PR #102](https://github.com/ot4562-glitch/HUFS-One-AI/pull/102), [PR #112](https://github.com/ot4562-glitch/HUFS-One-AI/pull/112)).
- [x] SourceRevision·Temporal RAG, 승인 인용 원본 무결성·수집 동시성 방어 코드 구현 ([PR #83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83), [PR #99](https://github.com/ot4562-glitch/HUFS-One-AI/pull/99), [PR #113](https://github.com/ot4562-glitch/HUFS-One-AI/pull/113)).
- [x] 캘린더 서버 GET·브라우저 API·overlay 뒤 늦은 응답 폐기 **API 하위 범위** 통합 ([PR #58](https://github.com/ot4562-glitch/HUFS-One-AI/pull/58), [PR #77](https://github.com/ot4562-glitch/HUFS-One-AI/pull/77), [PR #95](https://github.com/ot4562-glitch/HUFS-One-AI/pull/95)). 실제 UI 연결과 별개.
- [x] BOOKMARK stage의 owner HTTP/웹 경계, 수강계획 read-only 인가 게이트, What-if **DTO 계약** 구현 ([PR #97](https://github.com/ot4562-glitch/HUFS-One-AI/pull/97), [PR #103](https://github.com/ot4562-glitch/HUFS-One-AI/pull/103), [PR #106](https://github.com/ot4562-glitch/HUFS-One-AI/pull/106), [PR #107](https://github.com/ot4562-glitch/HUFS-One-AI/pull/107), [PR #115](https://github.com/ot4562-glitch/HUFS-One-AI/pull/115)). What-if 엔진 구현으로 오인 금지.
- [x] 합성·일회용 PostgreSQL CI와 오프라인 릴리스 차단/비밀 산출물 검사를 `main`에 통합 ([Issue #89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89), [PR #92](https://github.com/ot4562-glitch/HUFS-One-AI/pull/92), [PR #104](https://github.com/ot4562-glitch/HUFS-One-AI/pull/104), [PR #108](https://github.com/ot4562-glitch/HUFS-One-AI/pull/108), [PR #109](https://github.com/ot4562-glitch/HUFS-One-AI/pull/109), [PR #111](https://github.com/ot4562-glitch/HUFS-One-AI/pull/111)).
- [ ] 실 Google OIDC/JWKS·학교 메일 소유확인(메일 전송)·로그인/초대 종단 브라우저 검증 ([Issue #27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27), [Issue #25](https://github.com/ot4562-glitch/HUFS-One-AI/issues/25)).
- [ ] 운영 PostgreSQL·HTTPS/TLS·직접 IP/CDN/preview 차단·NCP 환경의 독립 보안 검증 ([Issue #27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27), [Issue #89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89)).
- [ ] 추적된 Private 학생 원본의 권리·개별 동의·협업 접근/이력 정리 및 전체 개인정보 검사 통과 ([Issue #46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46)).
- [ ] UI #72~#76 실 소비와 #80~#82 서비스/학업 provider 종단 통합 검증 ([Issue #9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), [Issue #80](https://github.com/ot4562-glitch/HUFS-One-AI/issues/80), [Issue #81](https://github.com/ot4562-glitch/HUFS-One-AI/issues/81), [Issue #82](https://github.com/ot4562-glitch/HUFS-One-AI/issues/82)).
- [ ] 인적 독립 골드라벨 200개 승인·실출처 검색/추천 정확도·운영 성능 검수 ([Issue #61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61), [Issue #21](https://github.com/ot4562-glitch/HUFS-One-AI/issues/21)).

**검증된 충족 7/12 = 58.3%.** 다른 담당자의 완료 PR이 이 트랙의 실서비스 수락이나 인적/운영 검증을 자동 통과시키지는 않는다.

### 이의상 `uisang2004-maker` — React UI · 모바일/접근성 · 시연 대상별 화면

- [x] 다섯 시연 슬롯·요청 epoch/대상 전환 상태 및 기본 공유 섹션 가드 구현 ([PR #28](https://github.com/ot4562-glitch/HUFS-One-AI/pull/28)).
- [x] HUFS 화면 토큰·대비·캘린더 2주 순수 화면 모델 구현 ([PR #64](https://github.com/ot4562-glitch/HUFS-One-AI/pull/64)). DOM 위젯 완료와 구분.
- [x] React/Vite·TSX·jsdom 기본 도구체계 및 설정 통합 ([PR #66](https://github.com/ot4562-glitch/HUFS-One-AI/pull/66)).
- [x] React 셸·하단 탭·대상 선택기·기본 상태 안내 통합 ([PR #68](https://github.com/ot4562-glitch/HUFS-One-AI/pull/68)).
- [x] 오늘/기회/공지 개인화 큰 카드·목록·상세 화면 합성 소비 통합 ([PR #69](https://github.com/ot4562-glitch/HUFS-One-AI/pull/69)).
- [ ] 달력 DOM 위젯 + 비합성 `loadCalendar` 실제 연결/버전 교체 즉시 소거 ([PR #72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72), [Issue #51](https://github.com/ot4562-glitch/HUFS-One-AI/issues/51)): CHANGES_REQUESTED.
- [ ] /reviewer/invite 실제 초대 흐름 UI 및 취소된 getSession 응답 방어 ([PR #73](https://github.com/ot4562-glitch/HUFS-One-AI/pull/73)): OPEN/COMMENT.
- [ ] 졸업 요건/전망 화면 및 공유 불가/준비 중에도 비공식 판정 안내 일관성 ([PR #74](https://github.com/ot4562-glitch/HUFS-One-AI/pull/74)): OPEN/COMMENT.
- [ ] REVIEWER 합성 보관함·경험·설정/모의지원 화면, snapshot·**미저장 초안/메모/관심 선택**의 대상 격리 ([PR #75](https://github.com/ot4562-glitch/HUFS-One-AI/pull/75)): CHANGES_REQUESTED.
- [ ] Playwright 브라우저 E2E와 360px·키보드/스크린리더 수락 증거를 현재 HEAD CI/독립 재실행으로 확보 ([PR #76](https://github.com/ot4562-glitch/HUFS-One-AI/pull/76)): OPEN/COMMENT.
- [ ] D-day·지원 보드·계획 나란히/What-if의 UI 수락 ([Issue #79](https://github.com/ot4562-glitch/HUFS-One-AI/issues/79), [Issue #80](https://github.com/ot4562-glitch/HUFS-One-AI/issues/80), [Issue #81](https://github.com/ot4562-glitch/HUFS-One-AI/issues/81), [Issue #82](https://github.com/ot4562-glitch/HUFS-One-AI/issues/82)).
- [ ] 실 Google/HTTPS·운영 권한 철회·다중 탭·접근성/실기기 종단 연결 ([Issue #9](https://github.com/ot4562-glitch/HUFS-One-AI/issues/9), [Issue #25](https://github.com/ot4562-glitch/HUFS-One-AI/issues/25), [Issue #89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89)).

**검증된 충족 5/12 = 41.7%.** 다른 담당자의 완료 PR이 이 트랙의 실서비스 수락이나 인적/운영 검증을 자동 통과시키지는 않는다.

### 김채윤 `qamarrchae` — 추천/중요공지 순수 코어 · 일정 계산 · 평가자료

- [x] 개인 관심·공고 주제/자격에 따른 결정론 추천·대형/소형 피드 구성 ([PR #15](https://github.com/ot4562-glitch/HUFS-One-AI/pull/15)).
- [x] 학생 대상 중요공지·마감/기한 경과 및 고정 알림 코어 ([PR #16](https://github.com/ot4562-glitch/HUFS-One-AI/pull/16)).
- [x] 출처 버전·시점 및 날짜 claim 재검증·캐시 키 분리 코어 ([PR #40](https://github.com/ot4562-glitch/HUFS-One-AI/pull/40)).
- [x] 추천 이유·관련도/토픽 다양성(비기본 opt-in) 코어 ([PR #41](https://github.com/ot4562-glitch/HUFS-One-AI/pull/41)).
- [x] 학업·경험 미공유 입력이 추천/공지 근거로 노출되지 않게 scope 필터 ([PR #49](https://github.com/ot4562-glitch/HUFS-One-AI/pull/49)).
- [x] 확정 마감·행사/시험·일정 미정/확인 필요를 분리하는 달력 **계산 코어** ([PR #50](https://github.com/ot4562-glitch/HUFS-One-AI/pull/50)).
- [x] A15 P@k·nDCG 측정 도구와 40개 합성 공고×5개 합성 슬롯/200개 **초안 라벨** 재현 자료 ([PR #48](https://github.com/ot4562-glitch/HUFS-One-AI/pull/48), [PR #60](https://github.com/ot4562-glitch/HUFS-One-AI/pull/60), [PR #65](https://github.com/ot4562-glitch/HUFS-One-AI/pull/65), [PR #67](https://github.com/ot4562-glitch/HUFS-One-AI/pull/67)).
- [ ] 200/200 라벨을 독립 사람이 직접 검토한 골드와 개인화/조건 일치 검증 ([Issue #61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61)): 확인된 인적 검증 0/200.
- [ ] 실 HUFSAbility/기관 공고 자료 이용권·출처/정정/지원 자격/마감 원문 검수 ([Issue #10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10), [Issue #19](https://github.com/ot4562-glitch/HUFS-One-AI/issues/19)).
- [ ] 실자료에 대한 추천 품질·편향·누락/근거 신뢰도·latency/Recall 비교를 독립 재현 ([Issue #10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10), [Issue #21](https://github.com/ot4562-glitch/HUFS-One-AI/issues/21)).
- [ ] 최종 권한 UI 피드·캘린더 소비 및 회귀/실사용자 검증: UI #72는 미병합 ([Issue #51](https://github.com/ot4562-glitch/HUFS-One-AI/issues/51), [PR #72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72)).
- [ ] rank-v1.1의 실서비스 기본 노출/가중치 채택에 필요한 A15·사용자 검증 및 정책 결정 ([Issue #10](https://github.com/ot4562-glitch/HUFS-One-AI/issues/10), [Issue #61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61)).

**검증된 충족 7/12 = 58.3%.** 다른 담당자의 완료 PR이 이 트랙의 실서비스 수락이나 인적/운영 검증을 자동 통과시키지는 않는다.

### 박준영 `taewangim-alt` — 학점/졸업 순수 계산 · 규칙팩 · 수강계획/개설 전망

- [x] 취득·수강 중·계획 3원장 분리와 재수강/학점 코어 ([PR #56](https://github.com/ot4562-glitch/HUFS-One-AI/pull/56)).
- [x] 개설 전망의 시점별 과거 개설 패턴/불확실성 계산 ([PR #57](https://github.com/ot4562-glitch/HUFS-One-AI/pull/57)).
- [x] 한 학기 수강계획 상한·선수·시간표 중복 검사 코어 ([PR #62](https://github.com/ot4562-glitch/HUFS-One-AI/pull/62)).
- [x] RulePack 효력기간/asOf·불일치 거부/안전한 활성화 경계 ([PR #70](https://github.com/ot4562-glitch/HUFS-One-AI/pull/70)).
- [x] 학업 미충족 요건을 중요공지 계산에 넘기는 순수 계약 소비자 ([PR #84](https://github.com/ot4562-glitch/HUFS-One-AI/pull/84)).
- [x] 공식 RulePack 개정 후보 간 변화·근거 diff **합성 코어** ([PR #90](https://github.com/ot4562-glitch/HUFS-One-AI/pull/90)).
- [x] 수강계획 검증/승인 전 충돌 보류 및 안전한 계산 코어 ([PR #91](https://github.com/ot4562-glitch/HUFS-One-AI/pull/91)).
- [x] owner 수강계획 strict 응답의 caveat/버전/충돌 상태 정합성 수정, 비작성자 HEAD APPROVED+Actions 두 작업 성공 ([PR #116](https://github.com/ot4562-glitch/HUFS-One-AI/pull/116)).
- [ ] 학번·전공·중복 인정·학칙 원문이 포함된 실제 공식 RulePack의 독립 승인 ([Issue #11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11), [Issue #87](https://github.com/ot4562-glitch/HUFS-One-AI/issues/87)).
- [ ] 학생 본인의 적법한 수강원장·입학연도 등 개인별 결과/손계산 검수 및 사용동의 ([Issue #11](https://github.com/ot4562-glitch/HUFS-One-AI/issues/11), [Issue #46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46)).
- [ ] 승인된 학업 provider를 실제 owner `/api/study-plans/check`에 공급하고 UI #81에서 검증: 미구성 시 503 유지 ([Issue #27](https://github.com/ot4562-glitch/HUFS-One-AI/issues/27), [Issue #81](https://github.com/ot4562-glitch/HUFS-One-AI/issues/81)).
- [ ] 다른 전공 가정의 실제 What-if 계산 엔진·규칙 출처·UI 소비 ([Issue #82](https://github.com/ot4562-glitch/HUFS-One-AI/issues/82)); [PR #107](https://github.com/ot4562-glitch/HUFS-One-AI/pull/107)은 DTO만 완료.

**검증된 충족 8/12 = 66.7%.** 다른 담당자의 완료 PR이 이 트랙의 실서비스 수락이나 인적/운영 검증을 자동 통과시키지는 않는다.

### 이서연 `lhh42001` — NCP 배포/운영 · CLOVA OCR/HCX · Laya CPU/비용

- [x] NCP 조건부 운영 아키텍처·비용 상한·Laya worker 기본 OFF/CPU 메모리 안전 정책 문서화 ([Issue #12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [Issue #22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22), [NCP 운영 문서](NCP_OPERATIONS_2026.md)). 문서/계획 단계만 인정.
- [ ] General OCR 실제 또는 독립 재현 가능한 provider adapter/가짜 공급자 계약 테스트 ([Issue #20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20)).
- [ ] HCX-005 Vision/이미지 근거 bbox·각주 대응 및 20포스터 독립 수락검증 ([Issue #20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20), [Issue #23](https://github.com/ot4562-glitch/HUFS-One-AI/issues/23)).
- [ ] HCX-007 호출/출처·사전 비용/한도 확인과 safe fallback의 provider 경계 시험 ([Issue #12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [Issue #88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88)).
- [ ] Laya CPU/ONNX 격리 worker·OOM/CPU spike·기본 OFF/cgroup 부하/복구 실험 ([Issue #22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22), [Issue #88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88)).
- [ ] 공급자 429/503/slow·예산 중복청구·권한 철회/시점 변경을 넣은 offline chaos 검증 ([Issue #88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88)).
- [ ] 권한·크레딧·유효한 라이선스/키·NCP 운영 네트워크/HTTPS/TLS/IAM·배포/롤백 승인 및 재현 가능 환경 ([Issue #12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12), [Issue #22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22), [Issue #89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89)).
- [ ] 실클라우드 p95/RSS/CPU·사용 요금/중단 기록·기관·학생 자료 처리 승인/모델 외부 전송의 실측 증거 ([Issue #20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20), [Issue #22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22), [Issue #46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46)).

**검증된 충족 1/8 = 12.5%.** 다른 담당자의 완료 PR이 이 트랙의 실서비스 수락이나 인적/운영 검증을 자동 통과시키지는 않는다.

## 공통 차단·이력 주의

- **UI 병합:** [PR #72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72)→[PR #73](https://github.com/ot4562-glitch/HUFS-One-AI/pull/73)→[PR #74](https://github.com/ot4562-glitch/HUFS-One-AI/pull/74)→[PR #75](https://github.com/ot4562-glitch/HUFS-One-AI/pull/75)→[PR #76](https://github.com/ot4562-glitch/HUFS-One-AI/pull/76) 모두 OPEN(기준 HEAD). [PR #72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72) `8aa1371`·[PR #75](https://github.com/ot4562-glitch/HUFS-One-AI/pull/75) `0a19d1e` **CHANGES_REQUESTED**, #73/#74/#76 COMMENTED이며 최신 각 HEAD의 GitHub Actions run/check-run 성공 증거가 확인되지 않았다. 로컬 Edge 10/10 주장과 독립 원격 E2E를 동일시하지 않는다. **이번 회차 신규 UI 병합 0건.**
- **개인정보:** [Issue #46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46)의 마지막 기록된 **전체 Private checkout** `npm run check:privacy`는 **153/155 PASS, 2 FAIL**(보호된 Git 추적 경로 6건, 원본 미열람). 희소 체크아웃 Actions 성공으로 해소됐다고 처리하지 않는다.
- **추천 품질:** [Issue #61](https://github.com/ot4562-glitch/HUFS-One-AI/issues/61)의 40개 합성 공고×5개 합성 프로필 **200개 초안 라벨**은 존재하지만 **독립 인적 정답 확인 0/200**이며 실공고 이용권/추천 precision·Recall의 증거가 아니다.
- **출시:** [Issue #89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89)는 실제 Google/메일·TLS/CDN/직접 IP·운영 PG/NCP·기관 자료권리/학생 동의·실브라우저 검수 전 **`RELEASE_BLOCKED`**. 본 표의 코어 수락률을 팀 전체 출시 준비율로 평균 내지 않는다.
- **확인 기준:** [STATUS](../STATUS.md), [WORKSTREAMS](WORKSTREAMS.md), [PR_WORKFLOW](PR_WORKFLOW.md), 각 링크의 GitHub PR HEAD·CI·Issue 본문을 교차 확인. 새 증거가 생기면 해당 수락 게이트의 테스트·병합/검증 링크를 붙인 뒤 수치를 다시 계산한다.
