# Public tracked CSV exposure review — #362

**Status: OPEN / HUMAN RIGHTS REVIEW REQUIRED (2026-11-09).**

Five previously committed original CSV files under `csv/` are already tracked in the **public** repository. A `.gitignore` entry does **not** hide existing tracked objects or remove historical downloads or forks. This status is **not** a finding that anyone violated a law and not proof of a privacy breach; publication rights and reidentification risks remain unverified. Existing original names, data and history are not copied into this file.

## Executable containment

The metadata-only [protected CSV PR gate](../.github/workflows/tracked-csv-change-guard.yml) rejects *new PR changes* to either the previous or current `csv/` path (including renames/removals), case-variant aliases, and **byte-identical copies of the already tracked original blobs under any other path** by comparing Git tree and PR file SHA metadata. It **does not checkout, print, transform or read** those original files. GitHub workflow permissions are read-only. Existing [release boundary verification](../tools/verify_release_boundary.py) continues to protect distribution bundles. CI cannot identify edited, reformatted or partially copied versions solely from blob hashes, nor revoke already public Git objects, forks or local downloads. PR file lists over 3,000 or truncated base trees are denied pending private review. Do not interpret a successful gate as consent or remediated historical exposure.

## Restricted human review (record outside public GitHub/CI)

For each of the five tracked originals, privately capture:
- Data owner and publication decision maker, original collection scope and intended student/competition/public uses
- Explicit permissions for **public raw CSV distribution**, search indexing, derived summaries, screenshot/demo, OCR/AI transmission, retention and withdrawal; record separately, never infer one permission from another
- Indirect identifiers (course combinations, response details and file basenames), linkage/reidentification risk, and whether every affected participant approved the *actual public scope*
- Date/time and reviewer, evidence location outside the repo, proposed mitigation and consent withdrawal/contact process
- Public Git history, PR attachments, GitHub Pages output, caches, tags, forks and existing links assessment by maintainers

A private worksheet may mark each original **APPROVED_FOR_RAW_PUBLICATION**, **NOT_APPROVED** or **UNKNOWN**. `UNKNOWN` is **not** public reuse permission. Never place identities, raw rows, file basenames, consent proofs or contact details in public issues or Actions logs.

## Decision and response

1. Project owner + data/rights reviewer reconcile source-by-source public scope and document a written decision in a restricted channel. Public repository source code must not infer this from regex scanning alone.
2. **Until confirmed:** no new use of these originals in CI, demos, hosted assets, AI inputs, derived indexes or new PRs. Continue preserving files unchanged under current instructions; do not force-push, untrack, delete, overwrite or rewrite Git history.
3. If rights are denied or exposure is actionable, involve the data owner and project administrator to agree on safe publication/visibility actions, historical object/fork notifications and notices. Any deletion/rewrite/visibility change requires explicit informed approval and a rollback plan; this PR takes none of those actions.
4. Verify concrete public URLs/build artifacts and any retained copies after the human decision. Record closure evidence privately and publish only a nonsensitive decision summary. A PR guard passing is not an issue closure criterion.

**Unresolved:** participant-specific permission and lawful use review, historical exposure/remediation scope, actual forks/caches and human sign-off. Issue #362 must remain open. This file does not authorize anyone to modify or remove original data.

[Issue #362](https://github.com/ot4562-glitch/HUFS-One-AI/issues/362) · [AGENTS policy](../AGENTS.md) · [Data governance](DATA_GOVERNANCE.md) · [Release status](../STATUS.md).
