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
