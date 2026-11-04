# 2026-11-01 심민성 플랫폼 구현·후속 연결

> **현재 상태 안내:** 2026-11-04 이후 **과거 플랫폼 PR 분리·완료 이력** 자료로 유지한다. owner/Provider/source jobs/PG 7역할 루프백 조립 및 테스트 코드는 [#216](https://github.com/minseong-hufs/HUFS-One-AI/pull/216) main f23b86bb 통합, OPEN PR 0 / 본선 CI 3/3 SUCCESS. 실 운영 인증/PG/RLS/출처 권리/NCP/TLS는 별도. [STATUS](../STATUS.md)

> **최신 병합 결과:** #83 플랫폼 후속은 2026-11-01 `main` merge `3c6378c` 완료(HEAD `88d781b`, Actions #41295926141 synthetic·disposable PostgreSQL 두 job 성공). 이후 #99/#102/#105/#112/#113 출처/동의/인증/PG, #97/#103/#106/#107/#115 본인·학업 DTO/API 소비, #95/#100/#110 지연 응답/REVIEWER 브라우저 합성 검증, #92~#111 보안 릴리스 gate가 순차 병합됐다. **#107은 What-if DTO만, #103은 독립 academic provider 없는 경우 503 fail-closed, #80~#82 실제 UI/학업 계산·공식 승인 아님.** 이번 사용자 요청으로 본인 PR을 직접 정밀 검토/COMMENT 후 병합했으며 타인 APPROVED를 받은 것으로 기록하지 않는다. [최신 상태](../STATUS.md). 아래 '병합 미완료' 문구는 PR 제출 당시 이력이다.


**최신 지시/검증 (2026-11-01):** 사용자의 후속 “담당한 부분을 모두 구현” 지시에 따라 과거의 PR 제출·대기 지시는 종료됐다. 아래 첫 번째 구현 목록은 원래 [#83](https://github.com/ot4562-glitch/HUFS-One-AI/pull/83)의 범위이며, 그 뒤 별도로 브라우저 클라이언트와 상태 보호를 추가했다. 병합·실서비스 출시가 완료됐다는 뜻은 아니다.

## 브라우저 소비자·세션 경계 후속 구현

- `HufsApiClient.getDemoOverlay/setDemoOverlay/resetDemoOverlay`: 기존 인증된 BETA 경로, CSRF, CAS, 스냅샷·달력 `asOf`와 선택한 subject/grant/version 검증. 다른 학생이나 잘못된 계산 영수증은 화면에 올리지 않는다.
- `HufsApiClient.getExperienceTagApproval/approveExperienceTags/revokeExperienceTags`: 당사자가 선택한 로컬 태그만, 승인/본문/동의 버전 결속, idempotent 미승인 철회. AI 추천 후보·기록 수정은 승인으로 가장하지 않는다.
- `HufsApiClient.owner`: 본인 프로필·목적별 동의·경험/학기계획/보관함/행동계획 CRUD·공고/강의/개설/이수내역 조회의 strict schema/요청 ID 검증/한정된 paging/CSRF와 다음 버전 응답 확인. UI 화면 자체는 이의상 협업 소유로 남긴다.
- `DemoController.runOverlayOperation`: 탭/선택 epoch, abort, 응답 binding, 단일 진행중 CAS, 이전 버전 회귀 방지, 인증 철회 시 스냅샷 즉시 비우기. `OwnerSessionController`: 실제 same-origin BETA 세션을 호출 전·후 대조, 계정/탭 전환·logout·revalidate 시 모든 개인 요청 취소, 동시 개인 수정 직렬화.
- 중단된 body stream을 실제 취소하며 abort를 provider outage/성공으로 오인하지 않도록 클라이언트 전송 계층을 수정. 응답 수치/민감 payload 로그는 추가하지 않았다.
- 새 합성 브라우저/서버 회귀 테스트 **75건**(25 owner-browser, 5 cancellation, 20 owner/account/catalog, 10 overlay epoch, 12 owner session, 3 real Fastify+browser)에서 모두 통과했다.
- **최종 로컬 검사**: Node 24.15.0, `npm run check` **1,265 PASS / 30 opt-in PostgreSQL SKIP**, `build:api`/`build:web`/`fixtures:check` 성공, `check:privacy` **151/151 PASS**. **코드 변경 HEAD `8a06f85`의 [GitHub Actions #41284948605](https://github.com/ot4562-glitch/HUFS-One-AI/actions/runs/41284948605)에서 synthetic/일회용 PostgreSQL 두 작업 모두 SUCCESS**; 이전 HEAD의 결과를 재사용하지 않았다. 비작성자 현재 HEAD APPROVED/병합은 여전히 대기.
- 후속 승인 조건: 현재 HEAD 비작성자 APPROVED, UI 직접 연결/360px·실브라우저 확인, 공식 자료권한/실학생 목적동의, 실제 운영 PostgreSQL 정책 검증 및 OAuth/메일/TLS/NCP 별도 운영 승인. 어느 것도 합성 자동시험만으로 충족 처리하지 않는다.

## 과거 #83 최초 제출 기록 (당시 검증 스냅샷)

## 구현 범위

- 기존 #77의 캘린더 클라이언트 두 커밋을 작성자를 유지해 가져왔다. `HufsApiClient.getCalendar` 및 합성 전송/오류 검증이 포함된다.
- 브라우저 `searchEvidence`의 오래된 무조건 503 stub을 현재 `RetrievalEnvelopeVNextSchema`로 교체했다. 같은 출처/no-store/응답 크기/오류/취소/요청 asOf를 검사한다. 서버는 비동기 검색 후 현재 세션을 다시 검증한다.
- 학교 메일 OTP의 계정 제한에 전체 발송 100회/시간, IP 발송 10회/시간, IP 확인 30회/10분을 더했다. HTTP는 프록시 헤더 대신 실제 `req.ip`를 전달한다. 실제 운영 조립은 `requireClientIp:true`와 영속 limiter를 사용해야 한다. 승인·challenge 원장에 raw OTP/IP를 복사하지 않는다.
- 원본 바이트·문단 순서를 출처 판본과 원자 저장한다. 별도 독립 권한으로만 실행하는 `PostgresSourceReviewService`가 현재 head·원본/문단 SHA·검수자·현재 권리를 재검사하고 불변 승인/거절 및 무효화 outbox를 남긴다. effective view로 ACTIVE/검수시각을 읽어 과거 asOf에 나중 승인이 누출되지 않게 했다. 정상 HTML5 doctype과 NFKC 검색도 검증했다. 공개/자동 승인 HTTP나 크롤링을 추가하지 않았다.
- 경험 태그의 GET/PUT/DELETE `/api/experience/cards/:id/tag-approval`와 PG 저장소를 추가했다. 본문·동의·승인 버전 CAS, owner 권한, 로컬 선택 TopicCode만 허용한다. 기록 수정/삭제·동의 변경이 같은 거래에서 승인을 무효화한다. `readApprovedTopics`는 공급자 비종속 포트이며, 실제 학생→시연 대상 연결이나 추천 입력에 자동 주입하지 않는다.
- BETA의 GET/PATCH `/api/demo/contexts/:id/overlay`, POST `.../reset`과 PG 저장소를 추가했다. actor/session/run/subject/dataset/projection/grant별 분리, 버전 CAS, 원본 불변, 관심/직무/숨김 변경 후 기존 코어로 추천·공지·달력을 재계산한다. 이후 snapshot/calendar 조회도 같은 overlay를 사용한다. REVIEWER는 이 경로를 사용하지 않는다.
- 별도 독립 운영자 정책이 승인한 ADMIN만 POST `/api/admin/demo/preflight`로 읽기 전용 점검 manifest를 받는다. 정책 미주입이면 기존 ADMIN 차단을 유지한다. `PASS/FAIL/NOT_RUN`과 다섯 슬롯을 엄격 검증하고 미완료를 READY로 올리지 않는다. 실제 점검 포트는 명시적 주입이 필요하다.
- 기존 40공고/10공지/5합성 프로필 생성기에서 `demo-corpus-snapshots.json`을 파생한다. `GeneratedSyntheticReviewerRepository`가 서로 다른 학생의 snapshot을 제공하며 기본 학생 원장 4명과 구별한다. 독립 gold 검수는 `PENDING`이다. 기존 작은 계약 fixture JSON은 기존 회귀시험을 위해 보존한다.

## 조립과 마이그레이션

`createIntegratedApi`에 `demoOverlay`, `experienceApproval`, `demoPreflight`, `adminAuthority`를 선택적으로 주입한다. `createPostgresPlatformServices`에는 별도 최소권한 pool/authority와 함께 `demoOverlay`, `experienceApproval`, private `sourceReview`를 조립할 수 있다. 미주입 경로는 거부/503이며 기본 local harness와 production 차단은 유지된다.

새 migration은 **운영 DB에 적용하지 않았다**. 검토 후 기존 의존 순서에 다음을 추가해야 한다.

1. `20261031_auth_attempt_windows.sql` 뒤 `20261101_school_mail_network_limits.sql`.
2. `20261031_temporal_evidence.sql` 뒤 `20261101_source_review.sql`. reader는 effective view의 SELECT, private ingest/review 역할만 원본/attestation 관련 권한이 필요하다. 과거에 원본·문단순서를 보존하지 않은 판본은 추정 복원하지 않고 별도 승인 재수집이 필요하다.
3. `20261101_self_workspace.sql` 뒤 `20261101_experience_tag_approval.sql`. 기존 owner 변경 경로의 원자 무효화도 이 migration에 의존한다.
4. `20261101_demo_overlays.sql` 및 별도 overlay role의 SELECT/INSERT/UPDATE. RLS namespace는 `hufs.demo_actor`이다.

## 확인한 검사

Node 24.15.0을 npm의 격리된 런타임으로 사용했다. 프로젝트 의존성/lockfile은 추가하지 않았다.

- `npm run check`: **110 파일, 1,148 PASS / 30 SKIP**, TypeScript 검사 성공. SKIP은 실제 localhost disposable PostgreSQL opt-in 세 suite이며 로컬 PG가 없어 실행하지 않았다.
- `npm run build:web`: 성공.
- `npm run fixtures:check`: API build 성공 및 생성된 다섯 snapshot 파일 일치.
- `python tools/verify_release_boundary.py`: **146/146 PASS** (문서·추적 후보 최종 반영 후).
- 새 증상별 red→green 검증과 별도 읽기 전용 에이전트 코드 검토를 수행했다. 해당 검토는 **GitHub의 독립 사람 APPROVED가 아니다**.
- 전체 검사 첫 실행에서 effective view 전환 전 SQL 이름을 기대하던 기존 시험 1건이 실패했다. 실제 사용 view를 기대하도록 고친 뒤 위 전체 검사 결과를 얻었다. 실패를 제품 성공으로 숨기지 않는다.

## 남겨 둔 항목

실제 Google/SMTP·TLS·운영 PG·출처 권리·실학생 목적별 동의·NCP/유료 provider·독립 사람의 라벨 검수·협업 UI 연결·현재 HEAD 사람 승인과 main 병합은 미완료다. 실제 PG의 신규 migration/RLS/CAS/검수시각 시험은 CI opt-in suite에 추가했지만 이 로컬 결과로 통과를 주장하지 않는다.

중지 직전 작성한 추가 브라우저 overlay/경험 승인 편의 메서드의 미구현 테스트 초안은 `local_only/pending/`에 보존하고 PR에서 제외했다. 해당 편의 메서드나 협업 UI 화면 연결을 이번 PR 완료로 표시하지 않는다. 추가 구현·자동 병합·배포 없이 사용자 지시를 기다린다.

문서는 README/Architecture/STATUS, 프로젝트 운영 문서, reference/sandbox 및 하위 소유권 문서를 담당을 나눠 전수 읽었다. 실제 CSV/Forms 내용·키·원본 학생자료는 이번 작업의 입력으로 읽거나 전송하지 않았다.
