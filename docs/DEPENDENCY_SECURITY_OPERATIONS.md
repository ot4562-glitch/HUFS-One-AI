# Dependency / source security controls (#378)

> **2026-11-12 현행 문서 동기화:** [PR 36개·Issue 31개 감사 및 33/30 OPEN 스냅샷](REVIEW_AND_ISSUE_AUDIT_20261112.md). 이전 완료/PR 수치·운영 상태는 과거 시점 기록입니다. NCP 실운영·기관 권리/실원문·독립 Gold는 별도 인수이며 `NOT_CONNECTED / NOT_RUN / RELEASE_BLOCKED`를 유지합니다.

**Code presence is not proof of activation:** The read-only npm advisory job, Dependabot configuration and CodeQL workflow are committed, but repository security settings, alert ingestion, branch protection, private findings, actual operating images and response times need a repository administrator's separate verification. Do not claim alerts or CodeQL were enabled solely because these files exist.

## Independent checks

1. **Lockfile SCA:** [npm-dependency-audit.yml](../.github/workflows/npm-dependency-audit.yml) uses sparse checkout; PR, main and Monday schedule; High/Critical from the checked package-lock and unavailable registry both fail. Other severities remain visible in the job report; no `npm audit fix` or lockfile mutation occurs.
2. **Dependabot suggestions:** [dependabot.yml](../.github/dependabot.yml) monitors npm and GitHub Actions. It opens proposals, never merges or deploys them automatically. Repo owner must separately check **Settings → Security & analysis → Dependabot alerts / security updates** availability, enablement and notification permissions.
3. **CodeQL:** [codeql-source-analysis.yml](../.github/workflows/codeql-source-analysis.yml) checks out *only* code and configuration (never `csv/`, `reference/`, `assets/`), runs JS/TS CodeQL, and uploads to the repository's Code scanning interface. Repo owner must verify Actions permissions/security-events write, successful run and alerts visibility; `NOT_RUN` or an upload failure is **not success**.

## Finding triage / ownership

- Record the **package and installed lockfile version, direct/transitive scope, runtime/dev-only use, CVE or GHSA, affected execution path, fixed version, proof/reference and date** privately for sensitive findings. Avoid disclosing student data, secrets, exploit steps or private alert JSON in public issues.
- **Critical / exploitable High:** do not override failing CI just to merge. Evaluate whether the affected production path is reachable, freeze release if necessary, and prioritize a smallest compatible fix with a review PR and failing-then-passing test. Security findings require human triage; do not auto-assign by code-owner heuristics.
- **False positive, unreachable or no upstream fix:** record reviewer, time-limited exception with expiry, compensating mitigation, affected versions, responsible owner and date of review. No indefinite broad ignore, no editing `audit_dependency_vulnerabilities.mjs` to hide a finding. Escalate by private security advisory if sensitive.
- After a patch: re-run audit and impacted tests on the **exact HEAD**, review lockfile diff/license compatibility, check CodeQL; only then merge. Verify production base image, runtime policy and actual deployment separately. An npm pass is not a host/container security attestation.

## Data boundary

The existing five tracked `csv/` originals are not scanned, copied or transmitted by these CI jobs; their **historical public exposure remains independently unresolved** ([#362](https://github.com/ot4562-glitch/HUFS-One-AI/issues/362)). Do not alter, re-encode, remove or rewrite them without an approved privacy/legal process. A sparse-checkout does not revoke any earlier public fork or download.

[Security reporting](../SECURITY.md) · [Production runtime](PRODUCTION_RUNTIME.md) · [Current status](../STATUS.md).


## 2026-11-09 추가 의존성 갱신·검증 스냅샷

- [#406 TypeScript 7.0.2](https://github.com/ot4562-glitch/HUFS-One-AI/pull/406) → [main `4bc5968`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/4bc5968af4ef765a161ce500a796e64b9ba44d6d): 타입 검사·빌드는 TypeScript 7 CLI, 기존 JS AST 정적 감사 두 도구만 별도 `typescript-legacy`(TypeScript 5.9.3) 호환 alias로 고립했습니다. 합성 TASK-00/Chrome/PG/CodeQL/lockfile 감사 통과는 해당 버전의 테스트 사실이며 **모든 TS7 런타임/타사 프로그램 호환성 보장이나 운영 인수는 아닙니다.**
- [#405 github-script v9](https://github.com/ot4562-glitch/HUFS-One-AI/pull/405) → [main `c4628ab`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/c4628abe485b9e19dcbf4c9de01e6411cd43ad1c): 이슈 라우팅 합성 Node24 이벤트 회귀를 추가했습니다. GitHub 실제 웹훅 운영 증거는 별도 확인해야 합니다.
- [#421 CSV 기록 메타데이터 도구](https://github.com/ot4562-glitch/HUFS-One-AI/pull/421) → [main `ff0d317`](https://github.com/ot4562-glitch/HUFS-One-AI/commit/ff0d31714fc5ebce32a7bece2a0d3369579410bb): `csv/` 디렉터리 안의 **로컬 Git 기록 메타데이터만** 세며, 다른 경로의 과거 CSV·외부 포크/클론·권리·동의는 UNKNOWN/NOT_VERIFIED입니다. 코드가 병합됐다고 실제 조사를 완료한 것은 아닙니다.

승인 강제 검사 제거 [PR #425](https://github.com/ot4562-glitch/HUFS-One-AI/pull/425)는 **필수 lockfile audit·CodeQL·보안/CSV 경계 검사를 제거하지 않습니다.** 보안 이슈 #378/#362는 실제 관리자·권리 담당 인수 전 OPEN입니다.
