# Dependency / source security controls (#378)

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
