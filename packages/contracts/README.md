# @hufs-one/contracts — TASK-00 v0.1 + evidence vNext v0.2.0

**Purpose:** shared source of truth for **all four independent development tracks**. The package is implemented as TypeScript + Zod strict runtime schemas. It **does not** implement real authentication, academic rulings, database migrations, NCP networking, CLOVA live calls, actual UI, or final student consent. Use it to agree on the wire shape **before** editing other teams' files.

## Quick start (Node >=22.12)

From the repository root:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run test:consumer:ui
npm run test:consumer:recommendations
npm run test:consumer:academics
npm run test:consumer:api
```

Do not copy `csv/`, `local_only/`, actual Google Forms records or real names into the synthetic test suite. The GitHub Action uses **sparse checkout**, intentionally omitting those directories.

## Use in each track

```ts
import {
  DemoSnapshotSchema, isSnapshotCurrent, FeedResultSchema,
  SafeLlmPacketSchema, ApiErrorSchema,
} from '@hufs-one/contracts';

// UI: typed/validated data from the API, not a locally invented payload.
const snapshot = DemoSnapshotSchema.parse(jsonResponse);
// isSnapshotCurrent(snapshot, {context, selectionEpoch, currentSelectionEpoch})

// Recommendation/notice: return FeedResultSchema.parse(candidate) to the API.
// API: treat ApiErrorSchema and SafeLlmPacketSchema as strict boundaries.
```

- **UI (이의상):** `identity`, `corpus`, `errors`; mock snapshot in `packages/fixtures/synthetic/demo-snapshot.json`. Server still must enforce grants. Unit reviewer: `tests/consumers/ui-contract.test.ts`.
- **추천·공지 (김채윤):** `topics`, `corpus`, `ai`; return evidence-linked eligibility separately from relevance. Unit reviewer: `tests/consumers/recommendation-contract.test.ts`.
- **학업·전망 (박준영):** `academics`, `intake`, `identity`; keep EARNED/IN_PROGRESS/PLANNED, manual RulePack approvals and asOf. Unit reviewer: `tests/consumers/academics-contract.test.ts`. He **does not submit a student CSV**.
- **API·CLOVA·NCP (이서연):** `identity`, `errors`, `ai`, `intake`; implement real authentication, grant enforcement, safe provider policy and version conflicts (not part of this schema-only package). Unit reviewer: `tests/consumers/api-contract.test.ts`.
- **통합 (심민성):** only owner of `packages/contracts` and root package/lockfile. Breaking changes require a new TASK-00 issue/contract PR and all four consumers' re-runs.

## Evidence vNext (TASK-18, package v0.2.0) — additive and offline-only

`@hufs-one/contracts/evidence` and root exports add the following **strict Zod**
contracts without changing v0.1.0 `SourceSnapshot`, `EvidenceSpan`, `NoticeResult`,
`FeedResult` or `SafeLlmPacket` input/output shapes:

| Contract | Important safety rules |
| --- | --- |
| `SourceRevisionVNextSchema` | Immutable source/content SHA-256, explicit permission and provenance, independent published/fetched/checked/verified timestamps, correction chain, scope, active-review prohibition |
| `SourceSpanVNextSchema` | Exact Unicode codepoint offsets for text; IMAGE original hash, page, normalized bbox, OCR line IDs and coordinate transform version required |
| `matchesTextSpan` / `matchesImageSpan` | Checks a supplied span against trusted original text or image/OCR metadata; cannot establish legal permission or real-world truth by itself |
| `VerifiedClaimVNextSchema` | Evidence and reviewer/check timestamp mandatory for VERIFIED, no cross-revision citations, student/admin/event date kinds separate |
| `RetrievalEnvelopeVNextSchema` | Explicit READY/NO_EVIDENCE/STALE/CONFLICT/BLOCKED_RIGHTS/UNKNOWN, revision refs and policy/retrieval versions; failure envelopes never leak evidence |
| `RevisionInvalidationVNextSchema` | Correction/extension/cancellation/revocation event invalidates retrieval and claims; cancellation also invalidates feed |
| `EvidenceBoundPacketVNextSchema` | Dedicated AI input adapter requires READY evidence, ALLOWED provider transfer, current permission/source version; image proof needs extractor version |
| `DecisionAdviceVNextSchema` | Laya model output is a routing **candidate only**, not the verification authority |

`SourceRevisionVNextSchema` is **not** an HTTP crawler, permission grant,
actual historical ledger, database schema, human reviewer, provider call or
source-of-truth. The server must independently verify actual content hashes,
revision supersession, access/rights and target scope, current provider
approval, past/asOf chronology, source page availability, and all claimed
dates/eligibility. `matchesImageSpan` verifies OCR text/coordinate **references**
only; it does not prove OCR content or quote semantics are accurate.

The contract test commands are:

```bash
npm run build:contracts
npx vitest run tests/contracts/evidence-vnext.test.ts tests/consumers/evidence-consumers.test.ts
npm run check
npm run check:privacy
```

Implementation and review boundary: #18 contract vNext is a separate PR from
#19 ingestion, #21 permission-first Temporal RAG and pending recommendation
PR #15 / notices PR #16. Four consumer tests use synthetic data; **automated
contract compatibility is not independent human review or UI/DB/Google E2E**.
Check the actual main and open PRs before merging/rebasing.
No student/Forms originals, images, tokens, real Google identity, paid NCP or
cloud connection are included.

## The four-file intake contract

The student input target is **four people**, not all five development team members. The code has no real-name/alias mapping. A private runtime caller must explicitly supply a **reviewed filename → opaque subject key mapping** to `validateApprovedIntakeBundle`; `validateFormsCsv` accepts an independent approved Forms display-name mapping. Neither mapping is a grant to use raw data for presentation/NCP/AI.

```ts
import {validateApprovedIntakeBundle} from '@hufs-one/contracts';
// Validation only — do not log raw inputs, names, or returned course records.
const report = validateApprovedIntakeBundle({
  formsCsv: privateFormsText,
  courseFiles: privateCourseFiles, // [{filename,content}], restricted memory only
  approvedFileBindings: privateApprovedBindings, // explicit owner/subject evidence
  formsOptions: {expectedSubjectKeys: opaqueFourKeys, subjectByDisplayName: privateAliases},
});
if (!report.ready) {
  // Report only issue codes/counts; don't dump source rows or identity bindings.
}
// report.ready = structurally complete only. It NEVER means team sharing is approved.
```

The documented owner-confirmed alias for one existing uploaded CSV is recorded only in the restricted data governance documentation; **do not hard-code real-name mappings** in TypeScript, mocks or CI. Missing Forms response, duplicate/unknown alias, bad header, extra GPA column, unapproved filename, ambiguous consent or malformed CSV blocks structural readiness. A valid refusal is preserved as DENIED, not overridden. Independent official-rule validation and section-specific SharingGrant remain separate.

## Contract status and failures

- Schemas are **strict**: fields not in the contract fail parsing. A well-formed model JSON is not proof that its source was lawful, de-identified, complete or approved.
- `DemoSnapshot` supports only granted projection and explicit PENDING/NOT_SHARED, not raw transcripts. `isSnapshotCurrent` is the UI's stale-response helper; `canReadSharedSection` is a *pure* reference guard, **not the full login, scope, DB/RLS, revocation-cache, or session policy**.
- Error envelope `{code,message,requestId,retryable,contextId?}` covers 401/403/409/422/429/503. An exception is not copied into public error text.
- The AI task route uses hyphenated URLs and snake_case internal codes; `AI_TASK_PATHS` is authoritative. **RulePack drafting is not a fifth public AI task**.
- Synthetic fixtures demonstrate shape and negative gates; they do not prove actual graduation, recommendation ranking, real-student authorization, or live CLOVA/NCP. Contract consumer tests are **automated cross-track compatibility checks, not named human reviewers' approval**.

See [Architecture.md A02–A13](../../Architecture.md), [team workstreams](../../docs/WORKSTREAMS.md), [data governance](../../docs/DATA_GOVERNANCE.md) and [TASK-00 issue #8](https://github.com/ot4562-glitch/HUFS-One-AI/issues/8).
