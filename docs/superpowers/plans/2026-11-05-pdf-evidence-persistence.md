# PDF Evidence Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Persist bounded PDF page evidence and independently review it before temporal retrieval.

**Architecture:** Keep source-image-v1 unchanged. Reuse the private image_evidence/hash columns for the version-discriminated source-pdf-v1 bundle and store each exact PNG in an append-only private table. The existing effective view derives usable PDF status only from matching original, pages and independent review; source rights and asOf checks remain current.

**Tech Stack:** TypeScript, Zod, PostgreSQL 17, Vitest, existing bounded PNG decoder.

**Spec:** Architecture.md A04/A10 and docs/TRUSTED_RAG_MEDIA_VERSIONING.md; root/source/API coordination on 2026-11-05. Implementation base cd5ac1bd6eb893c95f1a15d693488884bc587cf6 plus renderer contract a793df1.

## Global Constraints

- Default OFF; no provider calls, operating credentials, real private input, automatic approval or production enablement.
- At most 4 pages; original PDF and each PNG at most 256 KiB; combined original plus PNG bytes at most 1 MiB.
- Full-page MediaBox == CropBox, rotation 0, UserUnit 1 only. PDF and raster hashes are distinct.
- Source parser owns canonical geometry/OCR normalization. Final IMAGE spans refer to original PDF SHA, actual pageIndex and pdf-full-page-v1.
- Existing IMAGE/TEXT behavior, immutable history and common source-head locking protocol remain.
- Tests use synthetic bytes and protocol doubles. Actual PostgreSQL execution remains NOT_RUN until an authorized disposable cluster is available.
- Node 22.22.2; targeted Vitest uses maxWorkers=2.

## Ownership and Interfaces

- Root: packages/ai/src/pdf-renderer.ts, real bounded renderer adapter/types; final migration-list/full-suite wiring.
- Source agent: source-pdf-evidence.ts, approved-pdf-extractor.ts, durable ingestion.
- API agent: temporal-writer-postgres.ts, source-review-postgres.ts, temporal-postgres.ts, additive SQL and persistence/PG-slice tests.
- Canonical parser: parseSourcePdfEvidence(raw,binding) -> {evidence,paragraphs,spans,sha256}.
- SourcePdfRaster: {pageIndex,assetId,rasterSha256,bytes:Uint8Array,width,height}.
- Writer: existing append input adds pdfEvidence and pdfRasters; IMAGE keeps imageEvidence.
- Review: existing imageEvidenceSha256 parameter also binds the complete versioned PDF bundle. Independent authority must attest the original/page/visual relation.
- Reader: no raw-byte privileges; the effective view exposes only ordered PDF page asset IDs needed to validate page-bound spans.

## Approaches

Separate PDF metadata columns would duplicate review/hash plumbing and require a parallel approval path. Reusing versioned evidence plus a new private page-byte table preserves the established immutable review path while keeping PDF-specific validation explicit. A metadata-only PDF bundle was rejected because it cannot guarantee the reviewer sees the exact rendered pixels used for OCR.

## Review Focus

- Missing, duplicated, reordered or mismatched pages must never produce a partial approved document.
- Raster bytes, PNG dimensions and claimed hashes must agree even if a caller mutates its buffers during an await.
- Missing or changed human bundle authority must roll back approval.
- Original and page INSERTs after sealing must be refused; concurrent supported writers use the source-head lock.
- New unreviewed revisions, future review time and current rights withdrawal must suppress old evidence.

## Task 1: Bounded PDF writer and private page storage

- [x] Add synthetic two-page PDF/PNG fixtures and positive writer regression; run it against the current explicit PDF refusal and observe RED.
- [x] Add missing/duplicate/out-of-order/hash/dimension/size/ACTIVE/foreign-image negative cases.
- [x] Copy and validate all PDF/PNG bytes before pool awaits; write revision, paragraphs, page rows and original bundle in the same transaction.
- [x] Add 20261105_source_pdf_evidence.sql after source_image_evidence: private append-only page table, byte/hash checks, PDF guards and sealed-history checks; preserve all IMAGE branches.
- [x] Run focused writer/IMAGE/TEXT tests and typecheck.

## Task 2: Independent PDF review and temporal reader

- [x] Add review regressions for exact retained PDF/pages/bundle, corrupted raster/hash/geometry/page set, authority loss and draft refusal.
- [x] Recompute original SHA and canonical bundle; validate every retained PNG again; require exact independently reviewed bundle hash before COMMIT.
- [x] Extend effective view with PDF proof gating and safe ordered page asset metadata; keep existing column order and append the metadata column.
- [x] Add reader tests for valid PDF IMAGE spans, wrong original/page/asset/transform and unreviewed successors. Preserve gateway exact-span comparison.
- [x] Run focused persistence/review/reader and existing IMAGE gateway tests and typecheck; hand the complete PDF gateway integration case to the source agent.

## Task 3: Disposable PostgreSQL proof and handoff

- [x] Add tests/api/source-pdf-live-slice.ts for draft -> review -> PDF citations, wrong-page/hash/raw access/auto-ACTIVE/late INSERT refusal, and TEXT/IMAGE compatibility.
- [x] Give root the exact migration order and slice signature without editing shared fixture lists.
- [x] Obtain independent source/release review; resolve concrete findings.
- [x] Prepare only the nine owned files for a local commit, no push. Report protocol tests separately from actual PG execution and external human/rights acceptance.

## Verification and Handoff Evidence

- Genuine consumer RED: 4 FAIL / 24 PASS against the prior explicit PDF refusal.
- Consumer GREEN: 31 tests, including matching claimed hashes with broken PNG CRC,
  trailing PNG bytes or false decoded dimensions; all refused before pool access.
- Compatibility run: 177 PASS across PDF persistence/parser, IMAGE ingestion,
  original snapshots, review, writer and temporal retrieval/state/conflict/snapshot.
- After source commit 018582c (including stricter geometry), 110 focused PDF
  persistence/parser/ingestion tests PASS. The source/API exactOptional type
  mismatch was reproduced as TS2379 and fixed by source follow-up a793145;
  final integrated npm run typecheck PASS after applying that follow-up.
- Independent automated review read the four consumer TypeScript files, helper,
  parser and SQL. It found and resolved SQL replacement-text corruption, a
  PL/pgSQL variable/alias collision and NULL-sensitive aggregate handling.
  Final reviewed SQL SHA256:
  2cc80ba55bc1b831bb8881199eb0aa71cc15d5cc79ba8b5acb745bee7775f2d9.
- Source agent owns the new complete extractor -> durable writer -> independent
  review -> reader -> gateway protocol regression. It was RED against the old
  writer and is to be run GREEN after consuming this commit; that integration
  result is reported separately rather than inferred from append-spy tests.
- Root owns all shared migration lists and full-PG hook wiring. Apply
  20261105_source_pdf_evidence.sql after 20261105_source_image_evidence.sql.
  The disposable slice exports proveSourcePdfPg(admin:Pool,reader:Pool).
- Actual PostgreSQL parser/trigger/role/concurrency execution: NOT_RUN here
  (no Docker/authorized disposable PostgreSQL server). The typed opt-in slice
  contains the real SQL assertions; protocol mocks do not establish those facts.
- Actual local renderer isolation, operating rights, provider billing/egress,
  independent human PDF/page/bbox review and production activation are separate
  acceptance gates. No real PDF, student data, live OCR or production role was
  used. Each PDF page must contain supported OCR evidence in this bounded v1.
