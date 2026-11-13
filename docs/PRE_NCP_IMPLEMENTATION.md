# NCP 연결 전 구현 기록 — 2026-11-12

목표: 전체 이슈를 대조하고 기존 구현을 보존하면서 NCP 없이 검증 가능한 누락을 구현한다. 사용자 요청에 따라 기존 담당자와 관계없이 진행한다. 실자료·기관 판정·독립 사람 Gold·실 NCP/HCX 실행은 합성 검증으로 대체하지 않는다.

## 구현 순서

- [x] #508 코드: 판본별 검수된 부서 대표 연락처를 FAQ 문단 메타데이터로 전달한다. 학교 도메인이나 '문의' 문구만으로 개인 연락처를 허용하지 않는다. HTTP 필터와 HCX 요청 생성기에 같은 검사를 적용하고, 질문 개인정보 마스킹은 유지한다.
- [ ] #445/#449: 기존 수집기·사전검사·검수/승격 코드를 확인하고 연결 전 실행 가능한 누락을 보완한다. 배포와 데이터 갱신은 별도 실행이며 실자료는 NCP에만 둔다.
- [ ] #506–#518 및 #373/#418: 기존 테스트와 API/UI 소비 경로를 대조하고 재현되는 결함을 수정한다. 이미 구현된 기능은 중복 작성하지 않는다.
- [ ] #360/#446/#450–#454/#519: 코드로 준비 가능한 계약/도구와 실제 외부 환경·사람이 필요한 조건을 이슈별로 기록한다.
- [ ] 현재 변경의 focused tests, 타입 검사, 계약 소비자 검사와 필요한 빌드를 실행한 후 PR을 제출한다.

## 검토할 입력

검수되지 않은 이메일/번호, 승인된 연락처와 학생 식별자의 혼합 문단, 잘못된 연락처 메타데이터, 판본 충돌/철회, 예산 admission 이후 세션/권리 변경을 확인한다. 연락처 검수 메타데이터는 신뢰된 서버 source port만 제공하며 요청 body로 받지 않는다.

## 작업 기준

시작 기준은 origin/main. 압축본에 이미 있던 infra/ncp/Deploy-NcpPreview.ps1 및 Operator-NcpPreview.ps1 변경은 사용자 변경으로 보존하고 커밋하지 않는다. 원본 csv 파일은 열거나 변경하지 않는다. 고정 역할 이슈와 병합된 PR은 변경하지 않는다. 실제 운영 상태는 NOT_CONNECTED/NOT_RUN/RELEASE_BLOCKED를 유지한다.

## 현재 구현·검토 기록

- 기준 원격 main: `bae0884a5bb3cec29b91d9ac415151ed81356096`. 전체 이슈 170개(열림 31개)의 본문·댓글을 로컬 목록으로 조회했다. 해당 임시 목록은 PR에 게시하지 않는다.
- #508: `paragraphs[].publicContacts`는 신뢰된 source port의 해당 판본·문단에만 적용한다. 휴대전화/학번/주민번호/이름·나머지 이메일 차단과 질문 마스킹은 유지한다. 문단·판본 간 허용 승계 금지 회귀 및 admission 이전 차단 HTTP 시험을 추가했다. 실 HCX/Gold는 미실행이다.
- #445/#449: 네이티브 취득의 버전 핸드셰이크를 HTTP 직전 및 각 저장 직전에 강제한다. 일회성 작업에 주기 갱신을 연결하는 기존 SQL 큐 스케줄러를 추가했다. UTC 창별 멱등 키·최근 완료 TTL·미확정 작업 자동 재시도 차단·현재 권한/용량·소스별 트랜잭션 잠금을 적용한다. 외부 리뷰가 발견한 단일 연결 풀 교착을 실제 큐+단일 슬롯 모의 풀의 실패→수정→통과로 검증했다.
- #445 예산: SQL 함수가 소스·도메인 일일 요청/바이트를 함께 예약한다. 전송 전 256 KiB를 보수적으로 선예약하고 304/실패/불명확 완료도 환급하지 않는다. 큐와 예산 풀 공유를 구성 단계에서 거부하며 비동기 예약 후 권리/버전을 다시 확인한다. `20261112_source_refresh_budget.sql`은 별도 운영 적용 전 검토가 필요하다.
- SQL 검증: 로컬 개발 전용 PGlite 0.5.16([PostgreSQL WASM 구현](https://github.com/neondatabase/electric-pglite))으로 migration 실행·정확한 요청/바이트 한도·공유 도메인 합산·EXECUTE 전용 역할/직접 테이블 접근 거부를 확인했다. 프로젝트 의존성에는 추가하지 않았다. 단일 연결 엔진이므로 다중 연결 동시성의 증거는 아니며, 해당 시험은 기존 disposable PostgreSQL suite의 `source-refresh-budget-live-slice.ts`에 추가했다. 네이티브 PG/NCP 적용은 NOT_RUN이다.
- 로컬 검증 수정: Linux 운영 경로의 POSIX 해석 및 Linux 전용 PDF 파일시스템 모의 시험을 Windows에서도 동일하게 수행한다. 실제 Linux 실행 제한은 유지한다.
- 공개 경계 검사: Architecture A05–A19의 중복 블록 때문에 18개 TASK가 36개로 집계됐다. 2026-11-12 역할 설명과 고유 내용·링크를 보존하며 중복을 제거했다. 개인정보 경계 검사 172/172 PASS.
- 독립 에이전트 코드 리뷰는 코드 검토이며 팀 협업자의 GitHub APPROVED/독립 사람 Gold를 대신하지 않는다.

## 열린 이슈의 후속 범위

- #506/#507/#509/#510/#511/#512/#513/#514/#515/#516/#517/#518: 기존 코어·API·웹과 회귀가 존재한다. 최신 공식 자료·현재 권리/독립 Gold·실사용자/기관 인수는 계속 남아 있다. 합성 검증만으로 이슈를 닫지 않는다.
- #373/#418: 선행 판본 충돌 격리와 검색 회복 코드가 존재한다. 이번 전체 합성 회귀와 실원장/실세션 인수는 구별한다.
- #360/#446: 실제 원문/게시·전송권·독립 Gold의 NCP 내부 인수가 필요하다. 기존 검수/서명 도구로 준비하고, 임의의 실제 자료·사람 서명을 만들지 않는다.
- #445/#449/#519: 브라우저 취득 등 구현을 더 진행해야 한다. 현재 스케줄러/버전·예산·실패 알림 코드 구현을 전 파이프라인 완료로 표기하지 않는다.
- #450/#451/#452/#453/#454: 기존 도구 대비 OSS/에이전트의 실제 비교·도입 판단이 남아 있다. 새 프레임워크 설치·팀원 계정 연결·실원본 외부전송을 완료했다고 주장하지 않는다.
- #355–#359: 고정 역할 보존. #500: 기존의 명시적 이미지 제작 보류 유지.

전체 목표는 진행 중이며, 잔여 구현을 마친 뒤 최종 검증 및 PR을 제출한다.

## 검증 체크포인트

- Node 24.15.0, `vitest run --maxWorkers=4`: 427개 파일/5,035개 테스트 PASS, 외부 환경 opt-in 12개 파일/104개 테스트 SKIP. SKIP을 실 PG·NCP 인수로 집계하지 않는다.
- 타입 검사 PASS. 계약 339개, 소비자 205개, 진입점 검사 11개, API inventory 검사 30개 PASS.
- 실제 고정 Crawlee SDK + 컴파일된 API의 합성 통합 3개 PASS. refresh CLI/dispatch/native acquisition Node 시험 19개 PASS. 외부 소스 요청 0.
- API 및 웹 빌드 PASS. 웹 번들 크기 경고는 기존 청크 구조의 한계이며 미해결이다.
- `verify_release_boundary.py`: 172/172 PASS. CSV 원본은 읽거나 변경하지 않았다.
- 브라우저 취득 및 OSS 비교의 후속 구현·검토가 남아 있으므로 전체 목표 완료·PR 제출 상태가 아니다.

### 실패 알림 후속 구현

`OnFailure` 전용 비특권 service와 `refresh-alert-cli.mjs`를 추가했다. 전달 포트는 원문/URL/개인정보/비밀 대신 고정 오류 코드, 발생 시각, systemd invocation 기반 멱등 키만 받는다. 5초 시간 제한·중단 신호·명시적 DELIVERED 응답을 요구하며 실패/불명확 응답을 성공으로 승격하거나 재시도하지 않는다. `--plan`은 factory·네트워크를 사용하지 않는다. root 소유 factory 신뢰 검사와 비root Linux 제한을 재사용했다. CI에 합성 알림 시험을 포함했다. 실제 NCP unit 설치·전달 대상·systemd 251+ 확인 및 실제 알림 도착은 NOT_RUN이다.

알림/refresh/dispatch Node 시험 25개, 진입점 검사 11개, 공개 경계 검사 172개 PASS. 별도 코드 검토에서 차단 결함은 없었으며, 제안된 systemd unit/invocation 바인딩 및 지연 ACK 반례를 추가해 통과했다. 실제 systemd 활성화·외부 통지는 이 시험에 포함하지 않는다.

### 브라우저 런타임 경계 후속 구현

고정 Chromium 래퍼·bubblewrap·독립 rootfs의 전체 해시/소유권/권한 검증을 추가했다. rootfs 링크는 커널 순서대로 해석하고, 외부/없는 대상·순환·비실행 ELF·쓰기 가능한 파일/잘못된 소유권을 거부한다. 래퍼는 네트워크 namespace·읽기 전용 rootfs·별도 proc/dev/tmp·환경 초기화·capability 제거를 적용하고 Chromium 자체 sandbox를 유지한다. sandbox 무효화 옵션의 단일/이중 하이픈 및 `=값` 우회도 거부한다.

독립 코드 검토에서 발견한 링크/`..` 순서·디렉터리 오인·옵션 표기 우회 3건을 각각 실패로 재현한 뒤 수정했다. 브라우저 경계+기존 PDF 회귀 23개, 타입 검사, API 빌드 및 Bash 문법 검사를 수행했다. 파일 메타데이터/바이트는 합성 모의이며, 실제 Chromium/rootfs/커널 namespace 실행은 NOT_RUN이다. 이 단계 당시의 DOM 저장·검수 잔여 범위는 아래 후속 구현 기록을 우선한다.

### 브라우저 DOM 근거 저장·검수 후속 구현

`source-browser-evidence.ts`가 원본/DOM/문단·렌더러·자원 판본을 별도로 결속한다. DOM과 원본을 같은 SQL 트랜잭션에 보존하며 브라우저 결과의 자기 승격을 거부한다. 검수 포트는 보존된 정확한 `browserEvidenceSha256`를 독립적으로 확인해야 한다. 새 migration은 기존 이미지/PDF view의 열·검수 규칙을 유지하고 자원 최신 head·정확한 최신 권리 receipt·만료/철회를 계속 검사한다. 자원 정정/권리 철회 시 부모 DOM 근거가 즉시 NEEDS_REVIEW로 돌아간다.

합성 PGlite에서 실제 9개 migration과 writer→검수→제한된 reader view, 원본/DOM 별도 보존, 자원 변경/철회 및 불변 원본 UPDATE 거부를 실행해 통과했다. 같은 시험을 기존 네이티브 disposable PostgreSQL suite에도 추가했다. 네이티브 다중 연결·NCP는 NOT_RUN이다. 별도 코드 검토에서 차단 결함은 발견되지 않았다. **Crawlee/Playwright 렌더링, 현재 자원 바이트 로딩, 취득 executor 연결과 304/동일판 처리의 연결은 다음 구현 대상이다.**

이 단계의 최종 전체 회귀: Node 24.15.0에서 430개 파일/5,060개 테스트 PASS, 13개 파일/105개 테스트 명시적 SKIP. 해당 SKIP 중 로컬 PGlite 1개는 별도로 켜서 PASS했으며 네이티브 PG/동시성 증거는 아니다. 타입 검사·API 빌드·공개 경계 172개 PASS. 기존 일반 원본 저장 시험은 새 DOM 열 3개가 모두 NULL임을 확인하도록 계약을 갱신했고, 관련 집중 회귀 56개도 PASS했다.

### 브라우저 실행기 연결 후속 구현

명시적 `SourceBrowserExtractor` 포트를 운영 구성과 durable executor에 연결했다. 기존 정적 extractor의 비실행 계약은 유지한다. 브라우저 포트는 고정 렌더러 신원·정확한 원문 해시/길이·URL·새 판본 ID·DOM/문단을 재검증하고 원본과 DOM을 별도 저장한다. 원래 Content-Type의 charset도 포트에 전달한다. crawler acquisition 없이 브라우저만 구성해도 현재 preflight·버전·일일 예산을 요구한다.

브라우저를 구성했거나 이전 head에 브라우저 근거가 있으면 HTTP 조건부 헤더와 304 재사용을 거부한다. 같은 원문/문단이라도 렌더링 해시가 다르면 검수할 새 판본을 만들며, 브라우저 모드 해제도 기존 승인을 재사용하지 않는다. 자원 권리 재검증은 변경 없음 기록 직전에도 실행한다. head reader는 원본 저장소 대신 `source_browser_revision_metadata_vnext`의 판본 ID/렌더링 해시만 읽는다. 운영 migration 적용 및 해당 private head-reader 역할의 명시적 SELECT grant가 필요하며 PUBLIC 권한은 없다.

연결·기존 수집·운영 구성 집중 회귀 57개, 타입 검사 및 API 빌드 PASS. 추가 모드 전환 반례를 포함한 브라우저 연결 9개와 합성 PGlite 실제 SQL 1개도 PASS했다. 제한된 역할에서 메타데이터 조회는 성공하고 원본/DOM 직접 조회는 실패한다. 별도 코드 검토의 권한 범위 의견을 위 전용 view로 반영했다. 실제 Crawlee/Playwright 렌더링 및 승인된 자원 바이트 loader는 계속 다음 구현 대상이며, NCP/실제 Linux 런타임은 NOT_RUN이다.

### 승인된 보존 자원 바이트 loader

`createPostgresSourceBrowserResources`는 private 운영자가 등록한 정확한 URL·source·permission·종류별 MIME만 읽는다. 현재 source head의 불변 원본, 해당 운영자의 최신 독립 권리 receipt 및 COLLECT/STORE/SEARCH를 확인하고 DB/호출 시각 중 먼저 도래한 만료도 거부한다. 자원당 256 KiB·전체 16개/1 MiB 한도를 적용하며 SQL 전송 자체도 원본 크기를 제한한다. 반환 바이트를 복사하고 렌더링 이후 revalidate에서 판본과 receipt의 불변 사실을 재조회한다. URL 발견/네트워크/권리 승인/원본 생성 기능은 없다. 원본을 읽을 private resource-reader 역할은 일반 head/retrieval 역할과 분리해야 한다.

18개 합성 단위 시험과 실제 SQL을 실행하는 PGlite 통합 1개 PASS. 통합에서 정확한 바이트/receipt 결속, head 정정 및 권리 철회 이후 revalidate 실패를 확인했다. 타입 검사 PASS. 별도 코드 검토에서 차단 결함은 없었다. 실제 브라우저 렌더러와 이 loader를 연결하는 단계는 계속 진행한다.

### Crawlee/Playwright 렌더러 연결

고정 `playwright-core` 1.64.1과 실제 `PlaywrightCrawler` 어댑터를 추가했다. 검증된 런타임 옵션만 실제 Chromium에 전달하고 Crawlee가 추가한 proxy/옵션은 넘기지 않는다. fresh incognito context에서 권리 검증된 보존 바이트만 재생하며 미등록 URL·다른 프레임·재탐색·인증·WebSocket·다운로드·script 오류를 전체 실패로 처리한다. 원문/DOM을 구별하고 최대 64 요청/2 MiB 및 20초 실행·1초 종료 제한을 둔다. 성공한 DOM도 NEEDS_REVIEW이며 임의 사이트의 지연 로딩 완료를 보장하지 않는다.

별도 검토에서 종료 호출 무한 대기와 늦은 launch의 소유권 누락을 찾았다. 종료 무한 대기를 실패하는 시험으로 재현한 뒤 각 종료 경로에 독립 제한을 적용하고, 타임아웃 이후 생성되는 브라우저도 정리하도록 수정했다. SDK 모의 9개 시험은 Node 22.22.2/24.15.0 모두 PASS. 바이트 재생 13개와 기존 실제 Cheerio/컴파일된 executor 7개 PASS. 실제 Linux Chromium/namespace 합성 시험은 추가했지만 런타임이 없는 현재 Windows에서 1개 명시적 SKIP이며 NOT_RUN이다. CI에 재생/SDK 모의 시험을 연결했다. 실제 사이트·NCP 연결·사람 검수는 수행하지 않았다. OSS 비교 및 전체 이슈의 남은 pre-NCP 구현 감사·최종 PR은 계속 남아 있다.

이 연결 단계의 전체 회귀는 Node 24.15.0에서 432개 파일/5,087개 시험 PASS, 13개 파일/105개 시험 명시적 SKIP이다. 타입 검사·API 빌드·공개 경계 172개 PASS. 실제 Crawlee 3.18.2 생성자에서 새 custom launcher/incognito 옵션을 구성·종료하는 검증도 PASS했으며 브라우저는 실행하지 않았다. 실행기/저장소/렌더러 코드 검토에서 발견한 사항을 반영했고, 후속 검토에 남은 차단 결함은 없었다. 모의·단일 연결 SQL·SDK 구성·실제 Linux 실행의 증거 수준을 구별한다.

### OSS 비교의 첫 실측 — #452/#453/#454

최신 열린 이슈 31개의 상태를 재조회했다. #450–#454의 본문/댓글을 확인하고 기존 metrics/FAQ 합성 지표를 재사용하도록 유지했다. 선택적 개발 가상환경에서 실제 MarkItDown 0.1.9와 기존 Cheerio를 한국어 HTML 8개로 비교했다. 기대 문구 보존은 양쪽 16/16, 제외 문구 잔존은 기존 0/5·기본 후보 2/5, 빈 문서 처리는 양쪽 2/2였다. 결과·정의·한계·재현 명령·공식 LICENSE/버전 근거는 [OSS 기록](oss/README.md)에 있다. 현재 HTML은 기존 경로를 유지하고 후보 운영 도입은 보류한다. PDF/Office·LangExtract·FAISS/GraphRAG·다른 도구/계정의 실제 A/B와 전체 이슈 감사·최종 PR은 계속 남아 있다.

Windows Python stdout 기본 코드페이지로 문자가 손실되는 실험 harness 문제를 ASCII JSON으로 수정하고 실제 후보의 한국어 전달 시험으로 검증했다. Node 24.15.0에서 기본/지표/실제 후보 3개 시험 PASS. 별도 코드 검토에서 나온 provenance 보완 의견을 반영해 실제 baseline 소스/worker lock 해시·Cheerio 버전도 저장했다. 실자료·NCP·유료 AI 호출은 없다. 이 문자열 실측을 독립 사람 Gold나 전체 RAG 정확도로 집계하지 않는다.

### 버전 계약의 mutable target 수정 — #445/#449

현재 #445/#449/#519 본문을 재대조하면서 버전 검사 기준이 호출자 객체를 계속 참조하는 결함을 확인했다. 실제 수집 callback이 HTTP 이후 expected datasetRevision과 live manifest를 함께 바꾸면 기존 실행기가 NEW_DRAFT를 저장했고, loader 대기 중 reader 범위 확대도 허용했다. 두 반례를 실패로 재현한 뒤 executor 생성 시 expected/reader를 검증·복사·동결하도록 수정했다. live loader의 조회와 메서드 this 바인딩은 유지하며, 새 배포는 새 executor를 구성해야 한다. 단독 handshake도 await 전에 reader 범위를 복사·검증한다.

버전/취득/브라우저/운영 구성 집중 회귀 42개와 타입 검사·API 빌드 PASS. 실제 고정 CheerioCrawler와 컴파일된 executor 통합 3개도 PASS했다. 별도 코드 검토에서 남은 차단 결함은 없었다. 이 수정은 런타임 버전의 일관성 검사이며, **수집·변경 없음 관측 원장에 실제 실행 버전 전체를 영속 기록하는 요구는 아직 남아 있다**. 현재 writer의 새 원본과 source_check_observations INSERT에는 git/build/migration/adapter/dataset/schema manifest를 기록하지 않는다. 다음 구현은 이 private 이력 결속이며, 이를 기존 handshake 통과만으로 완료 처리하지 않는다.

### 수집·관측의 실행 버전 영속 기록 — #445/#449

위 단계의 미연결 항목을 `source_ingest_runtime_receipts`로 구현했다. 새 원본과 모든 동일 내용 200/304 확인 경로는 고정 git/build/migration/adapter/dataset/schema manifest를 private writer에 전달한다. writer는 비동기 SQL 전에 검증·직렬화하고 원본 또는 관측과 같은 트랜잭션에 기록한다. SQL은 해당 source/판본·원본·이벤트 시각/응답 상태를 결속하고 누락/추가 JSON 필드·잘못된 버전을 거부한다. UPDATE/DELETE/TRUNCATE와 PUBLIC 접근도 거부한다. 원본/관측 저장 실패를 포함해 receipt 실패 시 전체 트랜잭션을 롤백한다. legacy에 버전을 추정해 채우거나 검수일/ACTIVE를 승격하지 않는다.

새 migration은 temporal source/관측 테이블 뒤에 적용하며 private writer의 명시적 INSERT grant가 필요하다. 실행기 runtime이 구성된 경우에만 새 테이블을 쓰므로 기존 수동/legacy 저장을 임의 manifest로 표시하지 않는다. 실제 아티팩트 승인·NCP 설치 증거를 receipt로 대체하지 않는다.

수집·시간 판본·브라우저·운영 구성 집중 회귀 35개 파일/483개 시험 PASS, 로컬 SQL opt-in 1개는 기본 SKIP이다. 이를 별도로 켜 실제 10개 migration·writer를 실행한 PGlite/취득/receipt 시험 24개 PASS를 확인했다. 실제 SQL로 정확한 3종 receipt, 공개 조회 차단·수정/삭제/절단 거부, 잘못된 manifest/관측 binding과 원본·head·관측 롤백을 확인했다. 동일 proof를 네이티브 disposable PostgreSQL suite에도 추가했으나 다중 연결/NCP는 NOT_RUN이다. 타입 검사·API 빌드와 실제 CheerioCrawler/컴파일된 executor 통합 3개 PASS. 별도 코드 검토에서 남은 차단 결함은 없었다.

### 기능 요구사항 재감사와 증빙 충돌 수정 — #506/#512/#518

독립 코드 검토로 #506–#518의 실제 Core/API/웹 소비 경로를 다시 대조했다. 기존 구현과 테스트의 존재를 전 기능 완료 증거로 간주하지 않았다. #512에서 동일 증빙 ID가 CERTIFICATE/REPORT 두 종류로 입력되면 한 파일로 모든 서류 요건을 충족했고, PRESENT/REMOVED 사본이 함께 있어도 PRESENT를 사용했다. 인증된 insights snapshot도 중복 proof ID를 허용하므로 실제 HTTP 경로에서 재현된다. core/HTTP 실패 7개를 확인한 뒤 기존 `conflictingIds` 정책으로 모든 중복 사본을 종류/활동/검토/유효기간 필터보다 먼저 격리했다. 입력 순서·제거/기각·미검토·다른 활동·동일 중복을 검증하고 별도 ID의 유효한 대체 증빙은 보존했다. 공식 인정 상태는 계속 false다.

최종 core/HTTP 집중 시험 84개, 전체 feature-additions/insights 화면 소비 회귀 24개 파일/590개 시험, 타입 검사·API 빌드 PASS. 독립 코드 검토에서 해당 수정에 남은 결함은 없었다.

이번 감사에서 확인한 **NCP 전 구현 대상**은 다음과 같으며 아직 완료하지 않았다.

- #518: `international-v2.ts`의 `reconcileGuideChecklist`는 core/tests까지만 연결되어 있다. `owner-v2-insights-http.ts`의 국제학생 GET은 신뢰된 snapshot의 언어/topic을 사용하고, `owner-api-client.ts`/`OwnerInsightsPanel.tsx`에는 KO/EN/ZH 선택 및 본인 체크리스트 read/write CAS 연결이 없다. 언어·원문/번역 판본 변경 시 체크 재검수, actor/동의/권리 전환, 늦은 응답·다중탭 충돌을 API/UI까지 구현·시험해야 한다.
- #512: `classifyProofCandidate`가 core/tests까지만 있으며 인정 준비 화면은 보고서 조회만 한다. 일반 `CareerEvidenceAttachments` 포트만으로 OCR 후보의 마스킹 검토/수락·거부/철회·삭제 및 이후 저장·표시·모델 입력 제외를 완료했다고 할 수 없다. 인증된 후보 lifecycle과 UI 연결이 필요하다. 실제 OCR/파일 저장·학생 원본 인수는 별도 게이트다.
- #506: `forecastActivity`의 보류·정정·권리 단위 회귀는 있으나 기존 `forecast/rolling-origin.ts`는 수강 개설 예측용이다. 연례 행사의 origin별 과거 관측/held-out outcome과 전년도 기준선 평가를 별도로 연결해야 한다. 합성 시험을 실제 독립 행사 Gold로 표시하지 않는다.

이외 #507–#511/#513–#517에서 이번 표적 검토가 재현한 추가 결함은 없었지만, 실자료/Gold·운영 인수나 모든 E2E 요구가 완료됐다는 결론은 아니다. OSS PDF/Office 후보의 선택 개발 의존성은 기존 무시되는 가상환경에만 추가했고 아직 변환 비교를 실행하지 않았다. 다음 작업은 위 기능 누락 구현이며 OSS 조사와 PR은 계속 진행 중이다.

### 국제학생 체크리스트의 API·저장 연결 — #518 (화면 연결 미완료)

`/api/owner/features/v2/international/:id/checklist`의 GET/PUT과 전용 client 메서드를 구현했다. GET의 ko/en/zh는 표시 언어만 선택하며 topic·캠퍼스·학기·대상·출처·권리·동의는 기존 신뢰된 source가 정한다. PUT은 표시했던 원문 판본·실제 언어·번역 버전·현재 scope context와 CAS version을 함께 확인한다. 한국어 fallback은 ko로 저장한다. source/번역 변경 또는 다른 언어의 기존 체크는 재검수 상태로 비워 표시한다. 원문/번역이 조회와 저장 사이에 바뀌면 현재 CAS가 맞아도 409로 거부한다.

새 `GUIDE_CHECKLIST`는 기존 본인용 workspace의 OWNER_CONSENTED/SELF_REPORTED 기록이다. 원문 텍스트·여권·체류정보를 저장하지 않으며 guide/판본/번역과 체크한 step ID만 보존한다. item ID는 guide/동의 epoch에 결속하고 별도 context는 actor/source/consent/rights에 결속해, 동의 철회·재동의 이후 옛 요청을 새 기록으로 재생하지 못하게 한다. generic CRUD client는 이 kind를 거부하고 기존 generic HTTP 경로도 고정 kind를 검사하므로 출처 검증을 건너뛸 수 없다. 준비 체크는 학교 학사 처리 완료가 아니다.

운영자는 `20261113_international_checklists.sql`을 기존 self workspace/tombstone migration 뒤에 적용하고, 기존 private `PostgresOwnerWorkspaceStore`(또는 동일 계약의 승인된 store)를 `ownerInsights.checklists`에 명시적으로 제공해야 한다. 해당 authority는 GUIDE_CHECKLIST의 본인 읽기/쓰기를 독립적으로 허용해야 한다. 기존 RLS·개인 저장 동의 row lock·CAS·수량 제한·메타데이터 audit·철회 시 전체 workspace 삭제를 재사용한다. 저장 port가 없으면 NOT_CONNECTED이며, 공용/미검수 source나 가상 체크로 대체하지 않는다.

독립 코드 검토에서 await source.revalidate 중 receipt가 만료되는 경합을 발견했고, 실패 시험으로 재현한 뒤 마지막 actor 재검증 뒤에도 만료를 확인하도록 수정했다. HTTP 7개와 client 2개 시험 PASS. 별도로 켠 PGlite 실제 5개 migration/제한된 역할에서 GUIDE 저장·CAS·다른 actor RLS 격리·실제 `PostgresSelfAccountStore.putConsents`에 의한 개인 저장 철회/삭제 시험 1개 PASS. 같은 proof를 native PG suite에도 넣었지만 다중 연결/NCP는 NOT_RUN이다.

이 단계의 전체 회귀는 Node 24.15.0에서 435개 파일/5,114개 시험 PASS, 14개 파일/107개 시험 명시적 SKIP이다. 위 PGlite 1개는 별도 실행했다. 타입 검사·API 빌드·공개 경계 172개 PASS. 기존 bookmark/action/experience fixture는 실제 kind로 타입을 좁혀 새 union을 잘못된 synthetic 값으로 변형하지 않도록 유지했다. source-authority/TTL와 client binding 후속 검토에서 남은 차단 결함은 없었다.

위 API 단계 당시 화면 연결은 미완료였다. 후속 구현 상태는 아래 기록을 따른다.

### 국제학생 안내의 언어 선택·준비 체크 화면 — #518

`OwnerInternationalGuides`와 실제 owner API client/공유 session을 연결했다. KO/EN/ZH 선택, 검수된 한국어 fallback, 본인 체크 저장·해제·재조회, 판본 변경 후 재검수 및 409 후 명시적 재인증/재조회가 동작한다. 저장 중에는 언어/안내 전환을 막고, actor·session·읽기/쓰기 공급자·언어가 바뀌면 이전 본문과 체크를 비운다. 로컬 abort와 요청 순번으로 늦은 읽기/저장 응답을 버린다. 실패한 mutation을 자동 재생하지 않는다. 저장소 미연결은 NOT_CONNECTED로 표시하며 상담은 기존 상담 기관 탐색 화면으로 연결한다.

선택한 안내 응답에 자체 `asOf`·`sourceVersion`·`expiresAt`을 추가해 상위 안내 목록의 조회 시점과 구별했다. 유효기한은 신뢰된 receipt 만료와 안내 적용 종료 중 이른 시점이며, 서버는 비동기 권한 재검증 뒤에도 확인한다. 화면은 알려진 기한이 지나면 본문·체크·저장 메시지를 비우고 대기 요청을 취소하며 명시적 재조회를 요구한다. 저장 응답이 늦게 와도 성공으로 복원하지 않는다. 이 경계는 알려진 lease 만료를 제한하며, push/poll 없이 그보다 이른 외부 권리 철회를 화면에서 즉시 감지한다는 보장은 아니다. 모든 저장 요청은 서버에서 다시 검증한다. 계약 확장에 맞춰 API와 웹을 함께 배포해야 한다.

체크 항목 문구는 해당 원문 판본과 연결된 HUMAN_VERIFIED 번역의 선택적 `stepLabels`만 사용한다. 알 수 없는 step ID·빈 문구·다른 원문 판본의 번역은 사용하지 않는다. 검수된 항목명이 없으면 중립적인 준비 항목 문구를 쓰며, 내부 document code를 임의의 공식 서류명으로 해석하지 않는다. 번역/본문은 실제 표시 언어를 `lang`에 지정했다. AS-094→AL-094(동작하는 컨트롤), AS-093→AL-093(미연결·충돌·만료 회복), AS-100→AL-100(준비 작업 경로)을 적용했고 새 이미지/생성 자산은 추가하지 않았다(#500 보류 유지).

Node 24.15.0의 집중 회귀 5개 파일/59개 시험과 전체 회귀 436개 파일/5,132개 시험 PASS, 14개 파일/107개 시험 명시적 SKIP이다. 타입 검사, API·웹 빌드 및 공개 경계 172개 PASS. 독립 코드 검토에서 발견한 쓰기 공급자만 바뀌는 경우의 이전 체크 재사용을 실패 시험으로 재현한 뒤 수정했다. 후속 번역 항목명/lease 검토에서 남은 차단 결함은 없었다. 웹 빌드의 기존 500 kB 초과 chunk 경고는 남아 있다.

실제 App/스타일을 사용하는 개발 전용 합성 harness에서 설치된 Edge로 5개 브라우저 시험 PASS: 320/360/390/768/1440px 가로 넘침, 키보드 체크/저장, 세 언어, 재검수, 모의 409 복구, 저장소 미연결·계정 변경, 320px 긴 판본 문자열을 확인했다. 전후 스크린샷은 무시되는 `local_only/ui/guide-checklists/{before,after}/{width}.png`에 보존했고 320/1440px을 시각 확인했다. 재현은 `npm run test:e2e:web -- international-checklist.spec.ts`이다. 이 브라우저 증거는 합성 포트이며 실제 HTTP+DB 동시 탭 통합이나 NCP 증거가 아니다. API CAS와 SQL/RLS 증거는 앞 단계 시험으로 구별한다. 실제 NCP·독립 실자료/Gold·실기기·사람 검수는 NOT_RUN이다. #512 OCR 후보 lifecycle, #506 행사 rolling-origin 평가, OSS 비교 및 전체 이슈 감사·최종 PR은 계속 남아 있다.

### 행사 rolling-origin 평가 — #506 설계·구현 결과

기존 `forecastActivity`와 source-head/중복/권리 정책을 재사용하는 순수 평가기를 `packages/core/src/evaluation/activity-rolling-origin.ts`에 둔다. 수강 개설 평가를 행사 지표로 오인하지 않는다. 입력은 과거 판본을 포함한 행사 기록, 명시적 조직/행사군 목록, 정렬된 origin/targetYear, 별도의 검수 outcome 원장과 `truthAsOf`이다. 실제 outcome은 HELD/CANCELLED/UNKNOWN이며 누락·미검수·권리 철회를 미개최 정답으로 바꾸지 않는다. HELD에는 행사일이 필요하다. outcome의 현재 판본/충돌/철회는 정답 시점에서 먼저 처리한다. 독립 Gold의 진위는 입력 주장만으로 증명하지 않으며 보고서에 `DECLARED_REVIEW_ONLY` 및 실제 독립 인수 NOT_RUN을 유지한다.

전년도 기준선은 같은 origin에 보이는 **정확히 전년도**의 확정 개최일을 대상 연도로 옮긴 단일 날짜이며 2/29는 비윤년 2/28로 접는다. 두 방법은 같은 held-out outcome만 평가한다. 이미 확정/취소됐거나 이미 발생/정답이 알려진 대상은 전망 평가에서 제외한다. 예상 기간·점 기준선의 답변/보류 수, 실제 개최일 포함·기간까지 거리·중점 절대오차·기간 폭, 취소 행사에 표시한 예상 기간 수를 보존한다. 공동 답변 비교와 전체 보류 수를 함께 내어 선택적 답변을 정확도로 오인하지 않는다. 적어도 두 origin에서 점수가 있어야 rolling 평가 READY다. READY는 성능/릴리스 승인이 아니다.

구현 순서: (1) 실패하는 시점 누출·0/1/2/3년·전년도/윤년·outcome 철회/충돌·취소·동일 분모 시험, (2) 순수 평가기와 제한/결정성 검사, (3) 기존 평가 CLI의 bounded JSON/새 파일 쓰기 경계에 연결하고 CLI 실패 시험, (4) 합성 실행 및 집중 회귀·타입/평가 빌드·공개 경계 검사·독립 코드 검토, (5) 증거 수준과 실제 Gold/NCP 미실행을 기록하고 커밋. 새 모델·유료 API·실자료 수집·UI 변경은 이 평가 구현에 필요하지 않다.

위 순서로 순수 평가기·실행 모델 버전·`activity-evaluate` CLI·합성 fixture를 구현했다. CLI는 기존 10 MiB 입력·링크 거부·권한 제한 새 파일 쓰기 경계를 재사용한다. 결과 경로가 필수이며 표준 출력은 REPORT_WRITTEN만 표시한다. 입력 바이트와 실제 실행 evaluator/model/contracts JS의 해시를 기록한다. 기존 CI의 평가 빌드/CLI 시험에 새 시험을 연결했다. 입력·지표·분모·제외 조건과 재현 명령은 [독립 평가 가이드](INDEPENDENT_EVALUATION.md#연례-행사-전망의-과거-시점-평가-506)에 있다.

독립 코드 검토에서 나중 Gold 수정이 이전에 알려진 취소를 평가 대상으로 다시 넣는 결함을 찾았다. 취소 검수 2025-12-01 → origin 2026-01-01 → 수정 2026-04-01 반례를 실패로 재현한 뒤, 정답 시점 head와 별개로 origin 당시 Gold head/충돌을 검사해 제외하도록 수정했다. 해당 10개 평가 시험 및 기존 행사/KST 회귀를 합한 51개 시험 PASS. 평가 CLI/기존 추천·서명·HTML 회귀 8개, 타입 검사·평가 빌드·공개 경계 172개 PASS. 좁힌 후속 코드 검토에서 남은 결함은 없었다. 이 단계는 집중 회귀이며 전체 5,132개 PASS는 앞 #518 단계의 결과다.

최종 합성 CLI 결과는 `local_only/activity-origins-20261113-verified.json`에 새 파일로 보존했다. 두 origin·네 행사군의 8개 대상에서 전망 답변 4/보류 4, 전년도 답변 6/보류 2, 공동 답변 3개다. 취소 행사에 표시한 예상 기간은 전망 2개·전년도 1개이며 이를 성공으로 숨기지 않는다. 전망 기간과 기준선 한 날짜의 포함률만으로 우열을 주장하지 않는다. 이 결과는 합성 경로 검증이며 실제 공식 채널·독립 Gold·사람 시연·NCP 인수는 NOT_RUN이다. #512 OCR 후보 lifecycle, 남은 OSS 비교, 전체 이슈별 현재 구현 대조·최종 PR은 계속 남아 있다.

### 교외활동 OCR 후보 lifecycle — #512 구현 설계

기존 추출/분류 함수에 연결할 strict 후보 계약과 상태 전이를 먼저 만든다. 후보는 proof/activity/asset ID·파일 판본/해시·규정 판본·actor/동의/권리 scope·조회 시점/만료에 결속한다. 유효한 현행 규정에서만 생성/수락하며 원시 OCR 줄/파일 bytes는 후보에 저장·반환하지 않는다. 검토 전에는 NEEDS_REVIEW이고 본인이 마스킹을 확인하고 선택한 필드만 수락 결과에 남긴다. 기관·기간 불일치/불명확·낮은 OCR 신뢰·문서 종류 불명확 등은 본인 확인 뒤에도 검토 보류를 유지한다. 공식 인정/접수나 모델 입력 허가는 만들지 않는다.

거부/철회/삭제 요청은 후보·문구·좌표·마스킹 자료를 즉시 제거한 최소 상태 기록으로 바꾼다. 삭제 요청과 외부 원본/파생물 삭제 확인을 구별하고, 확인 receipt 전에는 DELETION_PENDING을 유지한다. terminal 상태의 수락/자동 복원은 거부한다. 삭제·철회는 규정 만료 때문에 막지 않는다. 다음 서버 단계에서 본인 인증·CSRF·CAS·할당량·신뢰된 파일/OCR 권한·원본 및 파생물 삭제 확인 포트를 적용하고 기존 owner workspace의 RLS/동의 row lock/철회 purge에 연결한다. generic CRUD로 검토를 우회하지 못하게 한다. 이후 실제 owner API client/화면의 검토·마스킹·거부·철회·삭제·충돌/계정 전환·늦은 응답 처리를 연결한다.

순서: (1) 현행 규정·마스킹 선택·충돌 보류·만료/정정·terminal 정화·삭제 확인의 실패 시험과 core/contract, (2) 전용 API/저장 및 실제 제한 역할 SQL, (3) client/UI와 합성 브라우저 흐름, (4) 독립 코드 검토·집중 회귀와 증거 기록. 신뢰된 OCR/파일 공급자가 없으면 NOT_CONNECTED이고 로컬/미검증 업로드로 대체하지 않는다. 실제 CLOVA OCR·NCP 원본 저장/삭제·독립 Gold·실학생 E2E는 별도 NOT_RUN이며 core만 구현한 단계를 전체 #512 완료로 표시하지 않는다.

**첫 단계 구현:** `RecognitionProofReviewSchema`와 `proof-review.ts`의 생성/명시적 수락/정화/준비 증빙 변환을 구현했다. 후보에는 추출된 허용 필드의 짧은 값·인용·줄 ID·정규화 좌표와 검토 사유/가림 수만 보존하고 원시 OCR 줄·파일·스토리지 URL은 포함하지 않는다. 수락은 NEEDS_REVIEW에서만 가능하며 명시적 마스킹 확인과 존재하는 필드명 allowlist를 요구한다. 선택하지 않은 값/인용/좌표를 수락 결과에서 제거한다. 보류 사유는 가린 필드와 별개로 남으며 미래 발급일도 보류한다. 현재 scope/규정/lease와 보류를 통과한 본인 확인 후보만 SELF_REPORTED 준비 증빙으로 변환한다. 모든 상태의 모델 입력 허가·공식 인정은 false다.

거부/철회/삭제 요청은 후보 전체와 파일 해시를 제거한 최소 상태로 바뀐다. 삭제 확인 ID 없는 DELETED는 계약에서 거부하고, DELETION_PENDING에서만 ACK_DELETE가 가능하다. 이는 외부 삭제를 수행/인증하는 기능이 아니다. 다음 API 단계에서 현재 actor/파일 소유권·원본/파생물 삭제 receipt를 독립 확인하고 CAS로 저장해야 한다. core/contract 최종 8개 시험 PASS(미래 발급일 필드를 가려도 보류 유지 포함). 그 전 계약/소비자/기존 기능 회귀 82개 파일/1,126개 시험, 타입 검사·공개 경계 172개 PASS. 별도 읽기 전용 코드 검토에서 이 단계의 차단 결함은 없었으며 인증/CAS/receipt 검증은 호출자 경계라는 한계를 확인했다. **후보 API·durable 저장·동의 철회 purge 연결·client/UI·실제 파일 삭제는 아직 구현 완료하지 않았다.**

계약 변경의 필수 API 감사에서 앞 #518 체크리스트 GET/PUT의 목록 등록 누락 2개를 발견해 `tools/api_contract_inventory.json`에 실제 registrar/상위 호출·DTO·시험·소비자 참조를 추가했다. API 목록 회귀 30개 PASS. 재감사 finding 0개/validationStatus PASS이며 기존 동적 import/호출 깊이 등 정적 미판정 때문에 coverage UNKNOWN·exit 3·runtime NOT_RUN·RELEASE_BLOCKED는 유지한다. 이 기록을 운영 인수 통과로 해석하지 않는다.


### OCR 후보의 영구 저장·철회 정리 기반 — #512 (API/화면 연결 대기)

`RECOGNITION_PROOF`를 기존 owner workspace의 strict union에 추가했다. 기존 RLS·본인 저장 동의 row lock·CAS·메타데이터 audit·동의 철회 payload purge를 재사용한다. generic HTTP 경로는 여전히 네 고정 kind만 등록하며 generic client도 proof kind를 거부한다. 실제 후보 생성/검토는 다음 전용 API 경로에서만 연결해야 한다. 거부/철회에도 cleanupState PENDING/ACKNOWLEDGED를 구별하고 이미 확인된 receipt의 덮어쓰기를 거부한다. 로컬 문구 제거만으로 외부 파생물 정리 완료를 표시하지 않는다.

새 `20261113_recognition_proof_cleanup.sql`은 workspace/국제학생 체크리스트 migration 뒤에 적용한다. private `api_self_proof_cleanup`에는 actor/item/asset 판본·작업 종류·상태·receipt ID만 있으며 문구/좌표/파일 해시는 없다. workspace의 terminal 정화, generic tombstone 및 동의 철회 DELETE가 같은 트랜잭션에서 정리 작업을 예약한다. 따라서 후보 삭제만 커밋하고 작업 예약이 유실되는 간극을 만들지 않는다. 거부는 OCR cache/파생 필드/모델 입력 제거, 철회/삭제/동의 철회는 원본까지 제거하는 작업이다. 고정 search_path의 비공개 trigger 함수만 예약하며 runtime에는 INSERT/DELETE 권한을 주지 않는다. cleanup 역할에는 SELECT와 UPDATE(status,receipt_id,acknowledged_at)만 별도로 부여한다. FORCE RLS와 hufs.self_actor는 동의 철회 중에도 적용되므로 운영 SQL도 정확한 본인 context를 설정해야 한다.

`PostgresRecognitionCleanupOutbox`는 별도의 현재 본인/운영자 정리 권한만 사용하며 저장 동의 철회 후에도 정리 상태를 읽고 확인할 수 있다. 후보 payload 접근을 허가하지 않는다. 정리 완료 후에도 최소 차단 원장을 보존해 재동의가 옛 asset ID를 자동 복원하지 않도록 한다. 다음 후보/OCR source adapter는 isAssetBlocked를 원본 조회·추출·모델 입력 전에 적용해야 하며, 현재 이 consumer 연결은 미완료다.

`drainProofCleanup`는 명시적 삭제 포트가 없으면 NOT_CONNECTED이고 작업을 실행하지 않는다. 최대 20개 batch, 각 I/O 최대 5초이며 새 스케줄러/서비스/유료 호출을 만들거나 실행하지 않는다. 정확한 actor/asset/판본/작업과 필요한 원본·OCR cache·파생 필드·모델 입력 제거를 모두 확인하고, 별도의 현재 삭제 증거 검증이 true인 receipt만 저장한다. 재시도/replica 간 같은 작업의 멱등 키는 고정이다. 권한 조회·pool 획득·목록·삭제·독립 확인·ACK 대기 모두 시간 제한을 둔다. 제한 이후 도착한 연결은 반환하고, 삭제 응답은 후속 확인/ACK를 시작하지 않는다. 늦은 SQL 결과는 다음 단계/COMMIT 전에 취소를 검사하고 rollback한다. 단, 이미 보낸 COMMIT의 응답이 늦으면 결과가 불명확하므로 timeout만으로 rollback/계속 PENDING을 단정하지 않고 멱등 원장을 다시 조회해야 한다. 이 ACK는 독립적으로 확인한 삭제의 불변 메타데이터이며 후보나 원본을 복원하지 않는다.

합성 PGlite의 실제 6개 migration/제한 역할에서 후보 저장·정화, 원장 문구 비잔존, 실패 후 대기, 확인 후 ACK, 다른 actor RLS, 동의 철회 후 작업 보존/정리, 재동의 후 옛 asset 차단, active 후보 hard purge, generic CAS tombstone 및 receipt 변경 거부를 통과했다. 같은 proof를 native disposable PG suite에도 추가했으나 다중 연결/NCP는 NOT_RUN이다. 단위/실제 SQL 최종 3개 파일/18개 시험 PASS, 그 전 계약/소비자/기존 기능 회귀 84개 파일/1,154개 시험 PASS. 타입 검사·API 빌드·공개 경계 172개 PASS. API 목록 감사는 finding 0/validation PASS, 기존 미판정에 따른 coverage UNKNOWN·exit 3·RELEASE_BLOCKED 유지다.

독립 코드 검토에서 목록/ACK·권한/pool 획득에 시간 제한이 빠진 결함을 재현하고 위 제한·AbortSignal/SQL 단계 검사를 추가했다. 종료 뒤의 원격 follow-up/ACK 및 이미 확인한 receipt 덮어쓰기 반례도 보완했다. 좁힌 후속 검토에서 남은 차단 결함은 없었다. 현재는 저장·정리 기반이며 **전용 후보 API·receipt 공급자 구성·실제 owner client/UI·실제 파일/OCR/모델 입력 정리·NCP/실학생 인수는 아직 완료하지 않았다.** 다음은 현재 규정/파일/OCR 권한을 신뢰된 source로 확인하는 API와 CAS·차단 원장 소비를 연결한다.


### OCR 후보의 전용 API·웹 client 연결 — #512 (화면 연결 대기)

후보 목록 GET `/api/owner/features/v2/recognition/:activityId/proofs`와 extract/confirm/redact/cleanup POST, 동의 철회 후의 본인 cleanup batch POST를 연결했다. 신뢰된 파일 공급자의 메타데이터 조회는 OCR을 실행하지 않으며, 명시적 extract만 현재 권한·예산을 확인한 공급자를 호출한다. 브라우저가 원시 파일·OCR 줄·후보 값·삭제 receipt를 제출하는 API는 없다. 본인/세션·Origin/CSRF·현재 규정/활동·파일 판본/해시·동의/권리·유효기한·할당량을 검사한다. 원시 OCR은 core의 제한된 정규화 입력에서만 처리하며 후보/HTTP 응답에는 허용 필드만 남긴다. 미연결은 NOT_CONNECTED다.

`ownerInsights.proofReviews`는 private workspace store, trusted documents(list/extract/revalidate), cleanup outbox 및 선택적 eraser/독립 verifyErasure를 명시적으로 요구한다. `RecognitionDocumentCatalogueSchema`가 파일/actor/활동과 metadata/OCR 목적을 결속한다. 실제 factory는 현재 소유권·각 목적의 동의/권리·불변 파일 판본·CLOVA 호출의 durable 예산을 검증해야 하며, 이 코드가 NCP 연결이나 실제 OCR/파일 저장을 만들어 주지는 않는다. 출처/규정이 바뀐 후보, 만료된 후보와 이용권 없는 후보는 본문 없이 STALE로 표시한다. 다른 탭의 변경은 409로 보류한다. 규정/권한 판본이 달라졌거나 후보가 만료되면 현재 권한을 확인한 뒤 명시적으로 재추출해야 하며 terminal 문서는 자동 복원하지 않는다.

trusted catalogue/후보에 실제 `api_self_consents.version`에 대응하는 `storageConsentVersion`을 추가했다. workspace는 기존 동의 행의 FOR SHARE 잠금을 유지한 채 현재 SQL version을 확인하고, 후보 본문 쓰기의 version이 다르면 거부한다. 철회 전 작업이 재동의 뒤 늦게 저장되는 실제 SQL 반례를 실패로 재현해 수정했다. 개인 본문을 새로 쓰지 않는 정화·삭제 확인은 규정/옛 동의 epoch 때문에 막지 않는다. API와 contracts/client를 함께 갱신하고, factory가 실제 version을 제공해야 한다.

현재 준비 보고서와 기존 insights 소비자는 현재·본인 검토·보류 없는 후보만 SELF_REPORTED 서류로 합친다. 자체 후보 ID와 차단 원장의 ID는 source가 반환한 사본보다 lifecycle 상태를 우선한다. OCR 권한이 없는 경우에도 별도로 허가된 기존 수동 증빙의 준비 결과는 유지한다. 공식 인정은 언제나 false이며 모델 입력 등록 경로를 추가하지 않았다. 기존 경험 AI 등록 SQL은 EXPERIENCE kind만 읽는다. 모델/원본 파생물 정리 확인은 eraser의 독립 증거가 별도로 필요하다.

거부/철회/삭제는 후보를 먼저 정화하고 정확한 판본의 outbox 예약을 확인한 뒤 응답한다. 예약이 없으면 성공으로 반환하지 않는다. OCR 실행 전에도 본인 파일 메타데이터 권한으로 철회/삭제 요청을 만들 수 있다. cleanup은 정확한 대상 작업만 처리하고, 이미 독립적으로 확인된 outbox receipt를 workspace 상태에 CAS로 반영한다. 외부 삭제 확인이 없으면 PENDING이며, 실제 NCP 삭제로 표시하지 않는다. 저장 동의 철회로 workspace 자체가 삭제된 뒤에도 본인 batch는 별도의 정리 권한으로 한 건씩 진행할 수 있다. 요청 단계와 batch는 10초/각 정리 I/O 5초로 제한하며, 완료되지 않은 저장/COMMIT 결과는 재조회해야 한다.

응답 직전에는 source/파일/actor, 차단 원장, context lease와 후보 자체 lease를 재검사한다. mutation은 최종 저장 버전/본문을 다시 읽고, GET도 마지막 provider/outbox await 뒤 현재 활동의 bounded 저장 목록을 다시 읽어 버전/내용·새 후보 생성 여부가 달라졌으면 409로 거부한다. 따라서 다른 탭이 일부 필드만 수락한 동안 예전 GET이 제외된 필드를 다시 표시하지 않는다. 이후 일어나는 외부 변경을 push 없이 즉시 감지한다는 보장은 아니다.

웹 owner client에 목록·명시적 추출·수락·정화·삭제 확인·동의 철회 후 batch 메서드를 추가했다. fresh CSRF와 AbortSignal을 재사용하고 활동/파일/후보·scope·CAS·선택 필드·정화/삭제 상태의 정확한 응답 일치를 검사한다. generic workspace CRUD는 계속 proof kind를 거부한다. 아직 `OwnerInsightsPanel`의 실제 검토/마스킹 UI와 roleServices 연결은 추가하지 않았다.

모의 권한·OCR/삭제 공급자와 실제 제한 역할 PGlite SQL을 연결한 HTTP→저장→수락→기존 insights→삭제 예약→독립 확인→ACK→동의 철회/batch 흐름 PASS. PostgreSQL JSONB 순서와 무관하게 본문을 검증한다. 같은 proof를 native PG suite에도 연결했지만 다중 연결/NCP는 NOT_RUN이다. 집중 38개 시험 PASS 당시 이후 추가한 GET 경합 2개도 실패→409로 재현·수정했고 최종 HTTP 15개·client 5개 PASS. 최종 전체 회귀는 Node 24.15.0에서 441개 파일/5,179개 시험 PASS, 15개 파일/110개 시험 명시적 SKIP이다. 타입 검사·API 빌드/맵 제거·공개 경계 172개·API 목록 회귀 30개 PASS. 새 6개 경로의 실제 registrar/DTO/시험/client를 API 목록에 등록했다. 감사 validation PASS/finding 0, 기존 정적 미판정으로 coverage UNKNOWN·exit 3·RELEASE_BLOCKED는 유지한다.

독립 코드 검토에서 수동 증빙/OCR 권한 결합, 마지막 await 중 lease 만료, GET의 동시 수락/마스킹 뒤 낡은 필드 반환을 재현해 수정했다. 동의 epoch, 이미 지난 후보 lease의 연장, 반환 직전 철회, 예약 없는 정리, 새 후보 생성 경합도 보완했고 마지막 좁힌 검토에 남은 알려진 결함은 없었다. **남은 #512:** 실제 사용자 검토·마스킹·수락/거부·철회/삭제 UI, roleServices 및 합성 브라우저 검증. 실제 업로드/파일·CLOVA·NCP provider factory, 독립 Gold·실학생 E2E는 NOT_CONNECTED/NOT_RUN이다. OSS 잔여 비교, 전체 이슈별 완료 감사와 최종 PR은 계속 남아 있다.


### OCR 후보 화면 — #512 구현 계획

RECOGNITION 화면에 현재 허가된 활동/문서 선택, 명시적 추출, 기본 가린 후보 필드의 확인/선택 보관, 별도 가림 검토 확인, 수락/거부/철회/삭제 요청 및 외부 정리 확인을 연결한다. Page의 preparation만 현재 결과로 표시해 mutation 뒤 상위의 옛 준비 상태가 남지 않게 한다. 원본 미리보기/익명화/진위 확인과 필드 선택을 구별하며 모델 입력/공식 인정 허가를 만들지 않는다. 개인 저장 철회 뒤의 정리 batch는 후보 조회 없이 현재 본인 인증으로 요청할 수 있게 분리한다. 미연결/빈 문서/규정·OCR 보류/409/429/503/만료와 명시적 재조회가 필요하다.

읽기·쓰기 모두 공유 owner session을 사용하고 actor/session/epoch/공급자/활동/문서 변경과 늦은 응답을 결속한다. mutation 시작 즉시 기존 후보/선택을 비우고 자동 mutation 재생을 하지 않는다. 표시 lease가 지나면 본문과 선택을 비우며 재조회로 저장 결과를 확인한다. localStorage/가짜 업로드/생성 이미지 없이 기존 컴포넌트·색·간격을 재사용한다. AS-090→AL-090, AS-093→AL-093, AS-094→AL-094, AS-100→AL-100을 적용한다. 동일 합성 App/계정/초기 데이터로 320/360/390/768/1440px 전후 캡처, 키보드/오류/소유자 변경을 검증한다. 실제 파일/CLOVA/NCP/실기기·사람 검수는 이 합성 화면 시험의 증거 범위에 포함하지 않는다.


### OCR 후보의 검토·가림·철회 화면 — #512 필드 검토 연결

`OwnerRecognitionProofs`와 실제 owner client/roleServices를 연결했다. 현재 활동/문서 선택, 명시적 추출, 기본 가린 필드의 선택 확인/보관, 별도 가림 검토 확인, 수락/거부/철회/삭제 요청, 외부 정리 대기/확인을 제공한다. 준비 결과는 현재 proof page에서 읽어 상위의 옛 준비 결과를 mutation 뒤 재사용하지 않는다. 제안 문서 종류가 현재 규정의 서류 분류에 없으면 수락을 보류한다. 본인 확인 후보/검토 보류/학교 공식 인정과 모델 입력 허가를 구별한다.

선택하지 않은 필드는 화면에서도 기본 가림이며 확인한 값/짧은 인용·문서 쪽만 표시한다. 원본 미리보기는 없고, 이 검토가 원본 익명화/진위를 증명하지 않는다고 명시했다. 파일 해시·원문 OCR 줄·스토리지 URL을 화면에 표시하지 않는다. 문서/판본 변경은 선택을 초기화하고 mutation 시작 즉시 후보 본문을 비운다. 응답의 정확한 수락 후 상태를 받은 뒤 현재 page를 다시 읽는다. 늦은 응답·계정/session/공급자 전환·known lease 만료는 예전 필드를 복원하지 않는다. 화면 기한은 조회와 모든 CURRENT 후보의 기한 중 이른 시점이며 저장 대기 중에도 적용한다. 대기 중단은 응답 기다림을 중단하는 것이며 서버 저장/삭제 rollback으로 주장하지 않는다. 취소 후 늦은 오류도 현재 session을 실패시키지 않는다. 409/429/503은 명시적 복구이며 mutation 자동 재생은 없다.

OCR/문서 공급자가 NOT_CONNECTED여도 허가된 상위 준비 결과는 '초기 활동 조회 시점'으로 구별해 보존한다. 본인 mutation을 시작한 뒤에는 이 fallback을 숨겨 예전 READY가 다시 나타나지 않게 한다. 외부 삭제 receipt 전에는 정리 대기이며, 확인 뒤에만 외부 삭제/정리 확인 상태를 표시한다. OCR 전의 삭제도 요청할 수 있고, 문서가 없거나 현재 규정/OCR 권한이 없으면 해당 이유와 정리 가능 범위를 표시한다.

정리 batch는 같은 현재 계정을 확인하는 **별도의 erasure 전용 OwnerSessionController**를 사용한다. 개인 자료 조회가 403으로 terminal FORBIDDEN이 되어도 이 독립 인증으로 한 건 정리를 요청할 수 있다. 개인 조회 권한을 복구하지 않으며 매 요청 전후 BETA/actor를 재확인한다. 다른 계정으로 바뀌면 이전 owner로 정리 API를 호출하지 않는다. batch 결과는 이번 확인 건수만 표시하고 모든 파일 삭제 완료를 주장하지 않는다. 상위 private-read result를 비운 뒤 수행하므로 정리 중 옛 후보를 표시하지 않는다.

AS-090→AL-090(철회/계정별 비우기), AS-093→AL-093(미연결·충돌·429/503·취소·만료 회복), AS-094→AL-094(실제 활동/문서 선택), AS-100→AL-100(작업 경로)을 적용했다. 기존 색·간격·focus/reduced-motion·native form을 사용하고 새 이미지/생성 자산은 추가하지 않았다(#500 보류 유지). 새 버튼/체크박스는 기존 touch target을 사용한다. 원본 업로드나 가림된 원본 이미지 검토를 구현했다고 표시하지 않는다.

Node 24.15.0에서 최종 웹 전체 72개 파일/494개 시험 PASS, 타입 검사·웹 빌드·공개 경계 172개 PASS. 마지막 UI 단위 시험은 16개이며 기본 가림/선택 수락, 즉시 거부 정화, 409 무재생, actor/공급자 전환, 대기 중단/late error, 대기 중 만료, 문서 선택 초기화, 403/429/503, 초기 manual snapshot, private403 뒤 정리·다른 actor 차단·옛 확인 건수 비노출을 포함한다. 기존 500 kB 초과 chunk 경고는 남아 있다. 이 단계에서 전체 5,179개 회귀를 반복 실행하지 않았고 그 수치는 앞 API 단계의 결과다.

실제 App/스타일과 개발 전용 합성 port를 설치된 Edge로 실행한 9개 시험 PASS: 다섯 폭(320/360/390/768/1440)의 가로 넘침/캡처, 키보드 추출·필드 선택/수락, OCR 전 삭제와 receipt 대기/확인, 409 복구 무재생, 공급자/actor 전환, private 조회 없는 batch, 긴 유효 판본, 미연결 시 manual snapshot, private403 뒤 cleanup 도달. 마지막 간격 수정 후 다섯 폭 캡처 시험 1개, Tab/Escape를 보강한 키보드 시험 1개도 따로 PASS했다. 같은 합성 계정/초기 자료의 전후 PNG는 무시되는 `local_only/ui/recognition-proofs/{before,after}/{width}.png`에 있고 320px 전후 및 1440px 이후를 시각 확인했다. 재현은 `npm run test:e2e:web -- recognition-proof.spec.ts`다. 이 브라우저 proof는 합성 port이며 앞 실제 SQL/HTTP proof와 구별한다. 원본 파일·OCR 공급자·독립 erasure provider·NCP/실학생/실기기·사람 검수는 NOT_CONNECTED/NOT_RUN이다.

독립 코드 검토에서 미연결 시 기존 준비 결과 소실과 private403 뒤 erasure 경로 차단을 발견해 각각 실패 시험으로 재현하고 수정했다. 좁힌 후속 검토에 남은 알려진 결함은 없었다. **다음 전체 이슈 감사에서 유지할 항목:** 원본/가림 원본 미리보기와 개인 파일 유입 경로의 NCP 전 구현 가능 범위, 실제 source/provider factory·권리/Gold 인수와 현재 필드-only 검토의 차이. 이 상태를 #512의 모든 실증 인수 완료로 간주하지 않는다. OSS 잔여 비교, 전체 이슈별 현재 구현 감사와 최종 PR은 계속 남아 있다.


### PDF/DOCX 실제 합성 변환 비교 — #453

HTML 외 비교 공백에 대해 개발 전용 MarkItDown 0.1.9의 PdfConverter/DocxConverter를 실제 실행했다. 고정 메모리 합성 fixture 6개는 한국어 본문·학년도·캠퍼스·표·마감 정정·이미지 전용 음성을 포함한다. 기대 문구 19/19개, 두 표의 같은 줄 내 셀 문자열 동시 존재 6/6행, 이미지 전용 빈 출력 1/1개였다. 이것은 표 구조·span·정정 해석·OCR·실문서 품질 평가가 아니다. PDF 글꼴/시각 검수 없는 parser fixture 및 2×2 raster의 한계를 명시했다. 기존 HTML 파서의 바이너리 형식 미지원은 수치 기준선으로 꾸미지 않았다.

입력/출력/실행 코드 해시와 의존성·측정은 docs/oss/markitdown-documents-synthetic-20261113.json, 재현·공식 구현 근거·채택 결정은 docs/oss/README.md에 있다. network/subprocess 관찰 0건, 외부 모델 0회이며 Python audit를 sandbox로 주장하지 않는다. 임의 파일/URL 인수는 거부한다. production dependency/worker는 변경하지 않고 오프라인 후보 보류를 유지했다. 승인된 실자료/Gold·HWP/HWPX·의존성 배포 LICENSE/NOTICE·운영 sandbox·사람 인수는 남아 있다.

실제 선택 가상환경 포함 Python 시험 3개 PASS, 공개 경계 172개 PASS. 읽기 전용 별도 검토는 probe/fixture 해시 및 수치의 제한된 의미를 재확인했고 중대한 결함을 찾지 못했다(변환 재실행 검토는 아님). 전체 서비스 회귀는 이 개발 전용 실험 단계에서 재실행하지 않았다. #450–454의 나머지 비교 및 #512 원본/가림 미리보기·파일 유입 가능 범위 감사와 전체 요구사항 대조는 계속 남아 있다. PR 목표는 진행 중이다.
