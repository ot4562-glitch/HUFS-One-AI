# HUFS One AI — 빈 합성 계정과 가상 동아리 실행

> **2026-11-12 현행 문서 동기화:** [PR 36개·Issue 31개 감사 및 33/30 OPEN 스냅샷](REVIEW_AND_ISSUE_AUDIT_20261112.md). 이전 완료/PR 수치·운영 상태는 과거 시점 기록입니다. NCP 실운영·기관 권리/실원문·독립 Gold는 별도 인수이며 `NOT_CONNECTED / NOT_RUN / RELEASE_BLOCKED`를 유지합니다.

**기본:** 실제 학생 이력 4명과 완전히 분리된 합성 `EMPTY_DEMO`·가상 관리자. 기능 코드/Chrome/일회용 PG 자동검증은 존재하지만 운영 계정·실원본/실기관·스크린리더 수락은 전이다.

## 시작 명령 (서로 다른 터미널)

```sh
npm run start:api:synthetic-empty-demo
```

```sh
npm run dev:web -- --mode empty-demo
```

서버 시작은 **로컬 127.0.0.1 전용**이며 실학교 계정·외부 모델/유료 NCP를 호출하지 않는다. 학생 계정은 `/api/dev/empty-demo/bootstrap`로 발급되어 `/demo-profile`에서 설정하고, 합성 ADMIN은 **다른 브라우저 프로필**로 `/api/dev/synthetic-clubs/bootstrap`→`/clubs/admin`에 진입한다. 운영용 관리 권한/프로덕션 부트스트랩이 아니다.

## 빈 계정에서 보이는 4개 기본 입력

1. 주전공(본인 선택)
2. 취득 학점: `null`(미입력)과 `0`(명시적 0)을 다른 상태로 보존
3. 관심 분야(1–5개)
4. 이중전공·복수전공 상태

저장하면 현재 설정/권한·fixture 버전의 추천/공지·일정, 학업 `UNKNOWN/NOT_SHARED`와 북마크·경험 DRAFT·행동/계획·알림 선호가 갱신된다. A→B 전환 때 이전 응답/캐시/오버레이가 남지 않아야 하고 RESET은 자료 버전 CAS로 원래 빈 계정 상태를 복원한다. 실제 지원·졸업 확정은 하지 않는다.

## 가상 동아리 종단

ADMIN가 **합성 모집글만** 만들고 보류→승인→정정(재승인 보류)→재승인→철회한다. BETA는 현재 승인된 글·관련성 추천/보호된 창작 PNG만 보며, 철회·권한 축소 후 기존 이미지 직접 URL/React 캐시가 열리면 FAIL이다. 포스터는 합성 창작물이며 실학교/실동아리 공식 게시 권한이 아니다.

## 60초 시연(목표, 사람 인수 아님)

| 구간 | 시나리오 |
| --- | --- |
| 0–15초 | EMPTY·합성 배지, 기본 4개 설정(학점 0/미입력 구분) |
| 15–35초 | 추천/공지·마감·출처·상태 차이, 결정론 자격 |
| 35–45초 | 관심/전공 변경→재계산, 북마크·경험 초안 |
| 45–55초 | 학업/개설 전망·달력, 확인 불가 항목 `UNKNOWN` |
| 55–60초 | RESET/원본 불변·미지원 경계 |

10분 발표/5분 질의응답에서는 코드→API/SQL·SourceRevision/AI 검증·개인정보/실운영 차단과 실패 시 복구를 설명한다. **실제 담당자 리허설·스크린리더 독립 서명은 #252 D02 필요**.

## 자동 검증

```sh
npm run test:e2e:empty-demo
npm run test:web
npm run assets:check
node tools/evaluation/run.mjs fixtures --action check
```

CI/로컬 로그는 실행한 SHA·브라우저/OS·PASS/FAIL/SKIP만 기록한다. 외부 과금·실자료·개별 동의/기관/사람 검수는 이 시험에 포함되지 않는다. 상태 [STATUS](../STATUS.md), 실제 수락 [#252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252).
