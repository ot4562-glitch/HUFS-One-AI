# #339 활동 아카이브 — NCP 연결 전 구현·검증 경계

> 2026-11-12 KST. 이 문서는 코드에 실제로 연결된 **합성/오프라인** 경계를 설명합니다.
> 검증된 학교 공식 행사 데이터, 실 학생 정보, NCP·SNS 크롤링이 구현/승인됐다는 뜻이 아닙니다.

## 현재 기능과 계약

- `packages/contracts/src/campus-assist/index.ts`: 기존 `ActivityRecord`/예측/조회 DTO, 선택적 `channelId`와 오프라인 `ActivityOrganization`·`ActivityChannel` registry 계약. 조직은 안정적인 `organizationId`로 관리하고 이름 변경은 `aliases`로 **표시만** 하며, 명의가 비슷하다고 다른 ID에 자동 병합하지 않습니다.
- `packages/core/src/campus-assist/activity-intake.ts`: 별도로 준비한 합성 배열을 수동으로 검사하는 순수 함수 `reviewSyntheticActivityIntake`. URL의 **HTTPS origin + 경로 구간 경계**, 등록된 채널·조직·캠퍼스, 판본/검수일·게시 시점·권리를 검증합니다. 등록 누락·중복·권리 차단·미래 자료·실출처는 격리하며 거부된 원문을 결과/로그에 출력하지 않습니다. **실제 학교 자료는 여기서 항상 거부**됩니다. 이 함수는 HTTP/스크래핑·RLS·권리 승인 생성 기능이 아닙니다.
- `packages/core/src/campus-assist/activities.ts`: 최종 승인 출처 목록에서 현재 head·검증 시점·철회·충돌을 결정적으로 처리합니다. `archiveDay`는 **행사일이 확인된 경우 행사일을, 모르면 한국시간 공지일을 검색 분류에만** 사용합니다. 공지일을 개최일로 표기하지 않습니다. 종류/조직/연도/캠퍼스/검색어 필터, 연도별 중복 묶기 및 약 ±1주·산포 기반 전망이 있습니다. 미확인·취소는 `UNKNOWN/CANCELLED` 또는 보류합니다.
- `apps/api/src/modules/campus-assist-http.ts`: **서버가 독립 권리 검증한 자료 port를 명시적으로 주입받을 때만** BETA 세션으로 조회합니다. 검색 조건을 승인 데이터에 적용한 뒤 **최대 200건**으로 제한하고 `hasMore`를 표시합니다. 현재 **페이지네이션/증분 수집은 없습니다**. 포트 권리 영수증·actor를 요청 후 재검증하고 캐시 없이 전달합니다.
- `apps/web/src/features/campus-assist/OwnerPanels.tsx`: 권리 연결 시 서버 필터로 활동 목록을 재요청하고, 다른 필터·소유자 포트의 오래된 응답은 abort합니다. 이벤트일·게시일(KST)·마감일을 분리, 출처 링크와 revision 노출, 200건 상한/미수집 경고, 확정과 예상을 명시적으로 구별합니다. Pages/demo의 별도 가상 자료는 실제 학교 자료가 아닙니다.
- 오프라인 합성 회귀: `activity-intake.test.ts`, `activities.kst-boundary.test.ts`, `campus-activity-archive-offline.test.ts`, `OwnerActivityPanel.test.tsx`. 실제 출처 금지, URL 사칭, 정정·철회, KST 연말, 200건 제한과 오래된 요청 차단을 다룹니다. 테스트 실행 결과는 GitHub Actions의 **최신 HEAD**를 재확인해야 합니다.

## 실제 NCP 연결·권리 검수 전 반드시 남길 일

1. 독립 담당자 검토로 확인된 **실제 공식 조직/공식 채널 레지스트리**와 허가된 API/RSS/사이트만 등록. 학교 명칭·학생회 계정/조직 개편·채널 이관 이력 검증; 가짜 fixture와 실 인덱스 분리.
2. 채널별 robots·약관·API 제공/재게시·보존·외부 AI 사용 권한과 비공개/개인정보 범위 기록. 권리/기관 승인 없는 로그인 우회·SNS 웹 크롤링 금지. 허가된 수동 등록·원문 링크 메타데이터를 우선.
3. Crawlee/NCP 인프라를 연결할 때 서버 단독 네트워크·호스트/리다이렉트 확인·요청량 제한, 재시도·백오프, 원문 해시·SourceRevision/rights·권리 철회 삭제, 동시 작업 잠금, 실패/미수집 상태, 보존 정책을 독립 검증. 합성 `APPROVED`는 실운영 권리 증명이 아닙니다.
4. 현재 조회는 200건 단일 페이지/최대 12개 series 전망입니다. 전체 공식 아카이브를 위한 안정적인 source epoch 기반 커서·서버 검색/연도·학기 인덱스, 실제 행사 vs 모집·캘린더 연결, 수정/연기·동일 행사 교차채널 매핑을 별도로 구현·시험.
5. 과거 연도 0~1건, 동일 행사 vs 이름만 같은 행사, 학교/조직 개편, 정정·취소·연기, 학기 경계/윤년, 개인 정보 비수집에 대해 사람이 정한 독립 Gold와 운영 허가를 확인. 실학생·실브라우저 사용성/접근성 320~1440px 별도 평가.

**상태:** 합성 단위/통합 기능만 개발 가능, 실제 NCP `NOT_CONNECTED`, 공식 자료/재게시 권리·독립 Gold `NOT_RUN`, 실서비스 `RELEASE_BLOCKED`. 이슈 #339는 **OPEN**입니다.
