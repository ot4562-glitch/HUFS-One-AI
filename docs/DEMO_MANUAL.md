# HUFS One AI — 현재 합성 시연 매뉴얼

이 문서는 **실제 학생·학교 운영 데이터와 분리된 로컬 시연**을 실행하기 위한 안내다. 최신 UI는 데스크톱 11개 참고 대분류 GNB/실제 화면 LNB·모바일 하단 5탭, 공통 상단 합성 계정 영역, HUFSAbility 원래 메뉴는 미지원 상태 안내, 홈 배너/요약 카드다. 운영 로그인·NCP·외부 유료 AI·실학생 원본/학교 자료의 허가는 포함하지 않는다.

## 실행 준비

Node.js `^22.22.2` 또는 `^24.15.0` 및 npm을 사용한다. 개인 CSV/Forms·학번·비밀번호/키를 합성 실행 환경이나 CI에 넣지 않는다.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run check:privacy
```

## 선택 A — 5개 가상 학생 슬롯

API와 웹을 **별도 터미널**에서 실행한다.

```sh
npm run start:api:synthetic-accounts
```

```sh
npm run dev:web -- --mode synthetic
```

로컬 브라우저 `http://127.0.0.1:5173/local-demo`에서 S01–S05 중 2개 이상을 선택한다. 동일 공고 40·공지 10을 비교하면서 개인화 목록·추천 이유·확정 마감/D-day·정정 시점/출처·중요 일정·학사 정보의 `UNKNOWN/NOT_SHARED` 상태를 확인한다. 설정·북마크·경험 DRAFT·계획/What-if는 **가상 저장·보수적 계산**이며 실제 지원 완료나 공식 졸업 판정이 아니다.

## 최신 합성 홈·기회 인터랙션 (병합 PR #307)

1. 가상 S01을 선택하고 홈 `/`의 **오늘의 액션 가이드**에서 맞춤 기회/확정 7일 내 일정/취득 학점을 버튼으로 바꿉니다. 값이 공유되지 않았다면 숫자 0이 아닌 `—`를 확인합니다.
2. `/opportunities`에서 `공고 검색`으로 현재 표시된 제목·분야·추천 이유를 필터하고, `자격 확인 필요` 및 `7일 내 마감` 버튼/확정 마감 정렬을 사용합니다. 빈 목록에서는 `검색 조건 초기화`가 동작합니다.
3. 합성 대상 S02로 전환하면 이전 선택자의 검색어와 필터가 초기화됩니다. 브라우저 360px에서 키보드·reduced-motion 확인은 [PR HEAD Chrome CI](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/42182685929) 근거가 있으며, **실기기/스크린리더 사람이 직접 확인한 결과는 아닙니다**.
4. 7일 기준은 현재 날짜 조회가 아니라 합성 **snapshot `asOf`**에 상대적입니다. `hasMore`로 생략된 공고를 검색하는 기능이 아니며, 실제 지원 자격·졸업/학점 공식 판정이나 실시간 전체 모집 공고가 아닙니다.

## 선택 B — 독립 EMPTY_DEMO·가상 동아리

**선택 A 서버 두 개를 종료한 후** 다음 API/웹을 별도 터미널에서 실행한다.

```sh
npm run start:api:synthetic-empty-demo
```

```sh
npm run dev:web -- --mode empty-demo
```

- 학생 BETA: `http://127.0.0.1:5173/api/dev/empty-demo/bootstrap` → `/demo-profile`
- 합성 ADMIN: **별도 브라우저 프로필**에서 `http://127.0.0.1:5173/api/dev/synthetic-clubs/bootstrap` → `/clubs/admin`
- BETA: 주전공·취득학점(0과 미입력 구분)·관심·이중전공 선택 → 저장 → 공고/공지/달력·계획/경험/북마크 → 다른 설정 B → RESET/새 세션/다중탭.
- ADMIN: 가상 모집글 초안 → 승인 → BETA 목록·상세/보호 PNG에서 확인 → 수정(재승인 필요) → 철회 → 직접 원문 이미지 URL의 권한/상태 차단 확인.
- 모바일 360px·키보드/포커스/미지원 상태·기기 네트워크 끊김 시 안전한 빈 값 처리 확인.

```sh
npm run test:e2e:empty-demo
npm run assets:check
```

실제 Chrome E2E는 자동화 시험이지 **별도 실제 스크린리더/기기에서 사람이 확인한 수락**이 아니다. 로컬 합성 메모리 저장소를 재기동해 정보가 초기화되는 것도 운영 PostgreSQL 영속성 실패라고 단정하지 않는다.

## 공개 GitHub Pages 합성 미리보기 (#304)

- **`main`에 병합하면 GitHub Pages 자동 공개 재배포는 그대로 실행**됩니다. 공개 페이지는 정적 합성 UI이며 실제 학교 계정 로그인·권한 보호·NCP/유료 AI/개인 CSV 호출을 하지 않습니다. 이 사이트가 열린다고 실학생 정보가 공개 API를 통해 접근 가능한 것은 아닙니다.
- 공개 Pages에서는 가상 학생 4(S04)에 기본으로 주입되던 `SHARING_REVOKED` 부정시험을 제거했습니다. **로컬 synthetic 개발 모드에서는 그 실패 주입이 유지**됩니다. 실제 학생 4인의 본인 로그인·원본 권리/동의 연결과 권한철회 후 캐시 소거는 #297/#299/#303에서 아직 검증되지 않았습니다.
- 앞으로 실제 학교 로그인으로 본인 정보 4명을 시연하려면 **각자 확인된 실제 BETA actor**와 운영 서버 권한/현재 동의로만 로그인해야 합니다. 임의 가상 시연 계정을 실서비스용으로 추가할 계획이 아닙니다. 자료 수집/학업 화면 연결은 #301, 실제 CLOVA/Laya 호출과 캐시 재생 증거는 #302.
- 설명은 `LIVE_PROVIDER_RUN`(실제 영수증 있을 때), `CACHED_PREVIOUS_RUN`(원래 실행/시각·근거 제시), `SYNTHETIC`(비과금 합성 예시)로 분리하며 실제 저장/작동까지 구현했다고 주장하지 않습니다.

## 시연 시 정직한 설명

- 이 화면은 **독립 학생 프로젝트**, 학교 공식 서비스가 아님.
- 합성 5슬롯과 실원본 제공자 4명, REVIEWER를 혼동하지 않음.
- AI 예시/보류/미지원, 공식 RulePack 미검증·실지원 기능 부재, 운영 미가동을 명확히 밝힘.
- 발표 목표는 **60초 핵심 시연, 10분 설명·5분 질의응답**이며 실제 팀원/비작성자 리허설은 [#252 D02](https://github.com/ot4562-glitch/HUFS-One-AI/issues/252)에서 검수.

실행·승인 경계: [EMPTY_DEMO](EMPTY_DEMO_RUNBOOK.md) · [STATUS](../STATUS.md) · [인수서](HUMAN_ACCEPTANCE_GATE_20261104.md).
