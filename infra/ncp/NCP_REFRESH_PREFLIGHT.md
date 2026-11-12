# #445 NCP refresh 사전 구현 — 서버 설치 전 계약

현재 `tools/ingestion/refresh-cli.mjs`와 두 개의 systemd unit은 **NCP 없는 오프라인 검증 가능한 운영 진입점**입니다. 실제 Crawlee 수집과 DB/원문 저장을 완료하지 않았으며, 명시적 승인 없이 크롤링을 시작하지 않습니다.

- `node tools/ingestion/refresh-cli.mjs --plan`: 원본·운영 registry·키를 읽지 않는 plan-only 상태. 요청 0건.
- 서버 운영자가 `sudo systemctl start hufs-one-ai-data-refresh.service`로 1회 갱신을 **트리거**하고, `sudo systemctl enable --now hufs-one-ai-data-refresh.timer`로 예약합니다. `root`가 수집 작업을 실행하는 것이 아니라 systemd의 `User=hufs-crawler`가 실행합니다.
- service는 `flock`으로 겹치는 스케줄 호출을 거부하고, 비특권 worker/최소 파일 쓰기·resource 제한을 적용합니다. timer는 시간마다 **트리거할 뿐**, 사이트별 증분 주기/요청 제한/권리 결정은 미구현된 운영 소스 정책이 제어해야 합니다.
- private factory가 없으면 systemd가 성공한 척 `skipped`로 끝내지 않고 `--apply`가 비영(실패) 종료합니다. 운영 알림·복구는 NCP 인수 시 별도 구성/검증해야 합니다.
- `--apply`는 root-owned, symlink 없는 `/etc/hufs-one/private/refresh-factory.mjs`가 있을 때만 시도합니다. 비공개 factory는 기존 승인 SourceRevision/rights/기존 PostgreSQL queue에 연결하는 얇은 운영 조립부여야 하며, Crawlee의 `CheerioCrawler`(필요한 사이트에만 `PlaywrightCrawler`)를 사용해야 합니다. 팩토리/권리·egress가 없으면 **수집하지 않고 BLOCKED**입니다.
- 실제 factory/원본/운영 source registry/DB/secret은 NCP 비공개 영역에 두며 Git/CI에 만들지 않습니다. NCP 배포 전 소유권·그룹 readable 여부, 실 호스트 `flock`/Node 경로, `hufs-crawler` 계정 설치, 영속 저장 및 restore를 검증합니다.
- **남은 구현:** 크롤러 패키지의 재현 가능한 의존성 lockfile, site adapter·첨부/PDF/HWPX 파서, DNS/IP pinned egress/robots·권리, NCP operator factory, DB 승인/승격, 장애 resume/알림·소스별 TTL, 실제 백업·권리·비용/키·SSH 인수. 본 PR은 크롤러가 정상 동작하는 서버가 준비됐다는 의미가 아닙니다.

오프라인 회귀: `node --test tools/ingestion/refresh-cli.node.test.mjs`. 기존 NCP IaC CI Ubuntu 설치 단계에도 추가했습니다. `RELEASE_BLOCKED` 유지.
