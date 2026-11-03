# HUFS One AI | 에이전트 작업 기준

이 문서는 **지속되는 작업·보안 규칙**만 정의합니다. 현재 PR/이슈/테스트의 수치는 [STATUS.md](STATUS.md)와 GitHub 최신 HEAD를 확인하고, 과거 회차의 커밋/리뷰는 Git 이력에서 참조합니다. 상위 `C:\AIProjects\AGENTS.md`의 보호 경계, 사용자의 최신 지시, 현재 프로젝트의 이 규칙을 함께 적용합니다.

## 작업 전에 읽기

1. 상위 `AGENTS.md` → 이 파일 → [README](README.md) → [Architecture.md](Architecture.md) A0~A3(제품/API/시각·인가 계약) → 담당 이슈·관련 코드/테스트·[STATUS](STATUS.md).
2. [WORKSTREAMS](docs/WORKSTREAMS.md)에서 소유자를 확인하고, 공용 스키마·UI·학업·추천·NCP를 다른 담당자 코드로 임의 대체하지 않습니다.
3. **현재 코드와 재현된 검증**을 사실로 사용합니다. 과거 `OPEN`/`APPROVED`/문서의 "최신"이라는 표현은 현재 GitHub HEAD의 대체 증거가 아닙니다.

## 제품·디자인

- 서비스는 **독립 HUFS One AI 팀 프로젝트**로서 기존 HUFSAbility의 학생 메뉴와 개인화 가치를 연결합니다. 학교 운영·공식 HUFSAbility 업데이트로 소개하지 않습니다.
- 학생 계정 관찰 [UI 아틀라스](docs/HUFSABILITY_UI_COMPONENT_ATLAS.md)의 11개 영역/76화면과 [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124)의 공개 5분류·24기능/비로그인 4영역을 **출처와 관찰 범위별로** 대응합니다. 원래 기능은 미구현이어도 정보구조에 보존하지만 `🚫 미지원/검증 전`을 명시하고 허용된 데모만 동작시킵니다.
- [#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141)은 **동일 디자인 복제**가 아닌 더 나은 독립 UI/UX·모바일·접근성 구현 과제입니다. 학교 저작물·원본 HTML/CSS/JS/캡처·세션을 사용하지 않습니다.
- 합성 데모(다섯 시연 슬롯/별도 빈 계정)는 **실제 자료 제공 대상 4명과 REVIEWER로 가장하지 않습니다**. 학생별 데이터 섞임·지연 응답·빈 값/UNKNOWN 위조 금지.

## NCP 역할 경계 — 2026-11-03 사용자 최신 지시

- **심민성 `ot4562-glitch` = NCP와 관계된 모든 소프트웨어 코드의 단독 소유자.** General OCR/HCX provider SDK·HTTP, bbox/원본 검증, 429/503/budget/권한 gate, Laya ONNX runtime·worker/queue·cgroup/systemd/Docker/IaC/CI·자동화·계측 코드는 [#20](https://github.com/ot4562-glitch/HUFS-One-AI/issues/20)·[#88](https://github.com/ot4562-glitch/HUFS-One-AI/issues/88)·[#143](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143)으로 구현한다. 사용자 허락 없는 클라우드 적용 금지.
- **이서연 `lhh42001` = NCP 비코드 운영 전담.** 계정·요금·SKU/크레딧·VPC/서버/스토리지·TLS/네트워크/보안 권한·CLOVA 사용권/quota·실호스트 자원/요금·종료·반납 영수증만 [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12)·[#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22)에서 담당한다. **코드·스크립트·YAML·IaC·CI·SDK/worker 구현은 0건 배정.** 코딩이 필요한 환경 준비는 심민성이 코드를 제공하고, 실제 적용은 사용자 사전 승인/이서연 운영 검증 뒤.
- 이서연은 UI·학업·추천·시연 관련 코드 이슈의 assignee가 아니다. 팀원 4인의 실제 자료 제공 대상이라는 사실과 **개발 담당 배정**은 별개. 과거 이슈/문서가 이서연에게 provider SDK/worker를 배정했어도 **본 문서와 2026-11-03 최신 이슈/WORKSTREAMS가 우선**한다.
- **개발 진척과 출시/외부 인적 검증은 별도로 기록**한다. PR 건수/커밋량은 규모 자료이며, 고정된 수락 조건을 충족했다는 증거로 자동 승격하지 않는다. 증거 원장은 [TEAM_PROGRESS](docs/TEAM_PROGRESS.md).

## 개발·리뷰·병합

- 한 작업 = 가급적 한 브랜치·소유자·PR. 공용 계약/lockfile/migration/인증 경계는 기술 총괄이 조정하고 관련 소비자 팀원에게 변경 사실을 알립니다. 타인의 dirty worktree/브랜치에는 reset·clean·force push를 하지 않습니다.
- **코드/계약/CI/보안 설정 PR**은 최신 HEAD를 실제 리뷰한 **비작성자 1명 이상 APPROVED**, 해당 HEAD 필수 CI 성공, 유효한 `CHANGES_REQUESTED` 해소, 선행 스택/base·보안·자료경계 검사 후에만 병합합니다. 작성자 리뷰 COMMENT나 별도 에이전트 평가는 이 승인을 대신하지 않습니다.
- **문서 전용** `README`, `STATUS`, `Architecture`, `Proposal`, `docs/*.md` 정정은 최신 blob SHA 확인 후 직접 `main`에 커밋 가능한 기존 사용자 예외입니다. 코어/CI/data/secret/유료 실행에는 적용되지 않습니다.
- 모든 PR에 변경 파일/계약, 테스트 명령·환경·PASS/FAIL/SKIP/NOT_RUN, 리뷰 증거와 미해결 제한을 적습니다. 실패를 재실행으로 숨기지 않습니다. 상세: [PR_WORKFLOW](docs/PR_WORKFLOW.md).
- 브랜치 삭제는 **관련 PR 최종 상태·현재 head SHA·다른 열린 PR 참조·보호 여부·고유 커밋·worktree·복구 경로** 확인 후에만 합니다. 운영·백업·미병합 종료 헤드를 무조건 삭제하지 않습니다.

## 자료·보안·출시

- 기존 Private Git에 추적된 수강 CSV/Forms 등 개인 원본은 [#46](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46) 감사/목적별 권한 증명 전 원문을 열람·복사·재게시·외부 AI/NCP/CI·로그·PR에 반입하지 않습니다. 기존 사용자가 확인한 목적별 동의 범위와 **Git 최초 게시·팀 공유 승인/현재 철회 상태**를 구별합니다.
- `local_only/`, 실제 개인 파일, 보호 원문/스크린샷, 토큰·키·비밀번호는 원격 코드/번들/테스트 fixture에 포함하지 않습니다. `npm run check:privacy` 통과도 법적/기관 이용허가를 대신하지 않습니다.
- SourceRevision·공고/학칙/상담 자료는 허용 출처·버전·수집·검수 시각·근거·권한을 분리합니다. AI/화면이 확정 자격·졸업·마감·지원 결과를 임의 생성하거나 `UNKNOWN/NEEDS_REVIEW`를 성공으로 변경하지 못합니다.
- [#89](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89) 운영 검증 전 **RELEASE_BLOCKED**. 실제 Google OIDC/외대 이메일 증명/HTTPS·직접IP·preview/CDN/스토리지, 영속 DB, 실심사자, 유료 NCP/CLOVA/HCX/Laya·DNS/TLS·학교 자료권리/기관 협의는 **각각 별도 승인·실증**이 필요합니다. 현재의 합성 API/오프라인 CI가 이를 자동 충족하지 않습니다.
- NCP/Laya 비용·CPU·worker/실측의 설계는 [CLOUD](CLOUD.md), [NCP 운영](docs/NCP_OPERATIONS_2026.md), [CPU 보호](docs/LAYA_CPU_SPIKE_PROTECTION.md)를 따릅니다. **실제 서버 생성·포트/ACG/ACL·Windows PuTTY/WinSCP·Ubuntu 설치/안전한 합성 SSH 미리보기 절차는 [NCP 실행서](infra/ncp/README.md)를 우선 읽습니다. 실제 prod 진입점은 미구현이며 외부 80/443·유료 자원은 이 스크립트로 열지 않습니다.** 사전 승인 없이 모델 다운로드·과금·서버 생성/배포·자동 백그라운드 실행 금지.

## 문서 책임

[Proposal](Proposal.md)은 팀·심사 설득, [Architecture](Architecture.md)는 기술 계약, [STATUS](STATUS.md)는 현재 검증/차단, [WORKSTREAMS](docs/WORKSTREAMS.md)는 책임, [DATA_GOVERNANCE](docs/DATA_GOVERNANCE.md)는 실제 자료 권한 기준입니다. **당시 상태 영수증을 README/AGENTS/STATUS에 중복 누적하지 않습니다.** 새로운 증거는 관련 PR/이슈에 링크하고 정본의 현재 결론만 교체합니다. 오래된 정보는 Git 이력에 남깁니다.
