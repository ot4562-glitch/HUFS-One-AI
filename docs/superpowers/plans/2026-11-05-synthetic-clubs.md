# Synthetic Clubs Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** Complete #123's synthetic owner UI → authorized API → persistent publication → generated poster → deterministic recommendations path.

**Architecture:** Reuse the existing strict club DTOs, Fastify registration and pure recommendation core. Add a CAS publication service and PostgreSQL adapter with separate BETA/ADMIN access grants and immutable metadata events. The owner UI uses OwnerSessionController and server responses; generated PNG bytes are available only through authenticated, currently approved club routes.

**Tech Stack:** Existing Node 22.22.2, TypeScript, Zod, Fastify, PostgreSQL, React, Vitest and pngjs; no new dependencies.

**Spec:** GitHub minseong-hufs/HUFS-One-AI #123 body and all three comments, read 2026-11-05; Architecture.md A00–A03 and current synthetic-clubs contracts.

## Global Constraints

- Base 8f79b84df1ea761f65da56d06dfe62f7c40cc193 in the dedicated issue-123-clubs-20261105 worktree.
- Synthetic clubs and synthetic operator grants only; no real student input, school permission, live provider, deployment or remote issue writes.
- Only server-authenticated actors/roles, server-selected source and asOf. Editing invalidates approval; CAS conflicts return 409.
- New PNG: packages/fixtures/synthetic/clubs/generated/ai-club-poster-v1.png. Actual imagegen provenance is supplied by root; existing SVG remains explicitly an illustration.
- PNG limit 2 MiB, each dimension <=2048 and <=4 million pixels; exact SHA/length/full decode; reject path traversal and symlinks.
- Node 22.22.2, focused Vitest maxWorkers=1. Root owns full suite, web/API builds, shared App.tsx wiring, push/PR and issue changes.
- Runtime PostgreSQL/RLS and independent human acceptance are separate evidence; protocol tests never claim a real database run.

## Approaches and chosen boundary

Reuse and extend the existing owner API/core. A separate mock server would duplicate contracts and leave the product path unconnected. Putting generated PNGs in public assets would bypass club approval/revocation, so serve them through the same current authorization checks as club details. Root approved club-specific contract/client ownership and will wire the shared AppServices type.

## Review Focus

- Grant or session revoked while a write/asset read waits: rollback or withhold response.
- Stale, duplicate and concurrent expectedVersion: one commit and explicit 409; no old approval resurrection.
- Approved content edited at the same timestamp: state becomes REVIEW_PENDING and approval disappears regardless of clock resolution.
- Unknown/tampered/oversized PNG or forged asset URL: no bytes returned or rendered.
- Account changes, late replies and unauthorized direct paths: clear prior data and never restore the old actor's view.

## Task 1: Publication contract, API and persistent adapter

Files: packages/contracts/src/self/synthetic-clubs.ts; apps/api/src/modules/opportunities/synthetic-clubs-http.ts;
new synthetic-club-publication.ts and synthetic-club-postgres.ts beside it;
apps/api/src/dev/synthetic-club-store.ts; infra/sql/20261105_synthetic_club_publication.sql;
tests/api/synthetic-club-publication.test.ts, synthetic-club-postgres.test.ts and a guarded live PG test.

Interfaces: POST /api/admin/synthetic/clubs creates REVIEW_PENDING; PATCH /:id edits with expectedVersion;
GET admin collection discovers versioned records; existing /:id/decision approves/rejects/revokes.
Store returns strict records with sourceRef and simulated ADMIN metadata; UI cannot supply role, approval or asOf.

- [x] Write and observe API tests fail for missing create/edit and stale CAS behavior.
- [x] Add bounded schemas and shared transition helpers, explicit memory preview behavior, and actual PostgreSQL transaction adapter.
- [x] Add RLS/mutation/audit SQL and protocol plus opt-in real PG acceptance coverage.
- [x] Run focused API/contract tests and record PASS/FAIL/SKIP without claiming operational acceptance.

## Task 2: Generated poster boundary

Files: new apps/api/src/modules/opportunities/synthetic-club-posters.ts;
packages/fixtures/synthetic/clubs/generated/manifest.json and actual PNG;
tests/api/synthetic-club-posters.test.ts and publication asset-route cases.

Interfaces: a server-chosen manifest describes exact PNG bytes; list/detail may include safe metadata bound to club id.
GET /api/synthetic/clubs/:id/poster repeats current visibility/session checks after loading verified bytes.

- [x] Observe missing/tampered/unauthorized asset cases fail before implementation.
- [x] Implement metadata/hash/dimensions/path checks and authenticated byte response.
- [x] Keep the poster unavailable until its new synthetic club is approved; edit/revoke hides it.
- [x] Run focused asset and publication tests.

## Task 3: Owner consumer and synthetic integration

Files: apps/web/src/features/clubs/{ownerClubPort.ts,OwnerClubBoard.tsx,ClubModerationPanel.tsx,owner-clubs.test.tsx,clubView.ts};
apps/web/src/pages/clubPages.tsx; club-only changes in integrations/owner-api-client.ts;
The owner-clubs browser test exercises the real integrated Fastify routes and the pinned PNG.

Interfaces: createOwnerClubPort(api.owner, ownerSession) returns OwnerClubPort;
root adds AppServices.ownerClubs and owner-route shell suppression. Existing development demo stays compatible.
No automatic ADMIN admission or generated-image approval is added to the browser.

- [x] Observe owner API/asset/late-account cases fail.
- [x] Render strict owner DTOs, direct detail requests and accessible responsive poster metadata.
- [x] Exercise create → approval → visible recommendation/detail/poster → edit hidden → reapproval → revoke hidden through real API/client components.
- [x] Run focused maxWorkers=1 tests; obtain peer review, prepare the exact owned-file commit and report remaining live/human evidence.

## Composition and evidence handoff

- API: instantiate `PostgresSyntheticClubStore(pool,{sourceRef})` using the reviewed restricted pool. Inject its `source`, `publication`, `moderation` plus `FileSyntheticClubPosterStore(absoluteAssetRoot,trustedManifest)` as `createIntegratedApi({syntheticClubs:...})`. No production launcher, grant issuer, migration runner, or public asset directory is enabled.
- Provision `synthetic_club_catalog` and `synthetic_club_grants` outside the runtime role with an explicit synthetic source, per-actor BETA profile or ADMIN grant, and actual validity period. Catalog `as_of` drives recommendations; authentication and durable grant expiry use current time. Runtime column/table grants are listed in the migration.
- Reads use single-use SQL receipts bound to actor/source/catalog revision/asOf, normalized profile digest and grant version. A changed grant/profile, changed catalog, expiry or replay invalidates the result.
- Root owns AppServices.ownerClubs/clubModeration and roleServices wiring: BETA gets `createOwnerClubPort(api.owner,ownerSession)`; ADMIN gets `createClubModerationPort(api)`; REVIEWER gets neither. /clubs/admin is independent of demo-subject selection.
- Admin operations revalidate the current ADMIN actor before/after requests; failures clear loaded records and all edit/create drafts. Hiding the tab aborts and discards pending results; returning requests a fresh list.
- Generated PNG asset SYN-POSTER-CLUB-090: SHA-256 `93446df5cc9a2859585e4801df7a74b7f602d71ae8084a4a51f5b563855af842`, 1,528,702 bytes, 1672×941. `generatedAt:null`, `recordedAt:2026-11-04T23:10:31Z`. Source: actual OpenAI imagegen output supplied by root, provenance ref `GENERATED-CLUB-POSTER-20261105-V1`. The >1 MiB image is detail-only/lazy; existing SVGs remain illustrations. Independent human/official approval is not asserted.
- Independent code review found and resolved a read-receipt profile/grant omission, plus admin draft/tab invalidation. API peer reviewed publication/SQL/asset boundaries; root reviewed UI integration. These automated reviews are not human acceptance.
- Real PG acceptance: `HUFS_PG_SYNTHETIC_CLUB_LIVE=1` and an explicit `HUFS_PG_SYNTHETIC_CLUB_URL` to `hufs_local_admin@127.0.0.1:15439/hufs_one_synthetic_club_test`; run `npx vitest run tests/api/synthetic-club-live-opt-in.test.ts --maxWorkers=1`. It refuses existing test roles or a nonempty DB and never drops/resets resources. Root wires the existing PostgreSQL 18 CI job. Local live DB execution remains NOT_RUN.

## Verification recorded 2026-11-05

- TypeScript: `npm exec --yes --package=node@22.22.2 -- npx tsc --noEmit -p tsconfig.json` exited 0 after the final UI changes.
- Final focused UI run: 4 PASS, including real API/client publication-to-recommendation/PNG flow, actor changes, permission-loss draft clearing and hidden-tab cancellation. The same invocation collected the real PostgreSQL opt-in file with 5 SKIP because this local environment has no test database; it exited 0. Evidence: ignored `local_only/verification/club-final-ui.json` and `.log`.
- Earlier focused checks passed publication (5), PostgreSQL protocol (5), poster files (4), poster HTTP (3), and existing memory-store behavior (9). The profile/grant receipt and UI invalidation regressions each failed before their fixes and passed afterward.
- A combined compatibility run exceeded the local MCP transport deadline without a recorded test result; its own remaining worker was stopped. It is not counted as a pass or an assertion failure. Root owns the integrated full suite and actual PostgreSQL CI acceptance.
- Root is integrating shared role/AppServices wiring; the source agent is adding the explicit loopback-only synthetic ADMIN/BETA harness in `apps/api/src/dev/empty-demo-fixture.ts` and `empty-demo-main.ts`. This scoped commit provides the actual ports and E2E assembly but does not claim that separate launcher work is already complete. The memory harness is ephemeral; persistence belongs to the PostgreSQL adapter.
