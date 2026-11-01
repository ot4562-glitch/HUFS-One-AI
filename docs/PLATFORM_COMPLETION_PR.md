# 2026-11-01 플랫폼 후속 구현 — PR 제출·대기

사용자의 “지금까지 한거 깃허브에 PR로 올리고 대기” 지시로 현재 구현을 제출하고 추가 개발을 중지한다. 이 기록은 `51c3c11` 기반 후속 브랜치에 대한 것으로, main 병합·출시·실서비스 검증을 뜻하지 않는다.

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
