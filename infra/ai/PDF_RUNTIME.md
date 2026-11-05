# Private PDF runtime and evidence contract

## Scope and default

This is the local code path for #19/#20, also consumed by #8/#27. It is OFF unless
private composition explicitly supplies the renderer, current rights authority and
budget/cancellation-controlled OCR port. No HTTP upload route, provider account,
source permission, production migration or release approval is created here.
`AI_ENABLED=false` and `RELEASE_BLOCKED` remain the defaults.

The implemented path is original PDF -> bounded full-page PNGs -> trusted raster
decode -> per-page OCR -> immutable draft -> independent review -> temporal IMAGE
evidence. An accepted citation identifies the original PDF SHA and original page,
not just a detached PNG. Empty or partly processed documents are never accepted.

## Composition

`createApprovedPdfExtractor` in
`apps/api/src/modules/opportunities/approved-pdf-extractor.ts` accepts an explicit
`renderer`, `rendererIdentity`, `authority`, `ocr` and `enabled` switch. The private
factory supplies `createPopplerPdfRenderer({enabled, runtime})` from
`packages/ai/src/pdf-renderer.ts` and `pdfRuntimeIdentity(runtime)` from the same
configuration. Pass that extractor as `pdfExtractor` to
`createApprovedDurableSourceExecutor`. The existing IMAGE extractor remains a
separate optional dependency. There is no fallback renderer or auto activation.

The source/purpose registry must independently permit COLLECT, STORE and
EXTERNAL_TRANSFER. A current TRANSFORM receipt binds the original hash, renderer
identity and limits; a separate EXTERNAL_AI receipt also binds the exact page
manifest. Both are checked before and after asynchronous work. A caller-supplied
hash, local file access or successful rendering does not confer those rights.

## Supported v1 and limits

| Boundary | Enforced value |
| --- | --- |
| Original PDF | Nonempty, at most 256 KiB; exact SHA-256 and PDF header |
| Pages | 1 to 4, consecutive zero-based page indexes |
| Geometry | MediaBox equals CropBox, rotation 0, UserUnit 1 |
| PDF coordinates | Absolute coordinate and page extent at most 14,400 points |
| Output | One PNG per full page, at most 256 KiB each |
| Pixel dimensions | Each axis at most 2,240; at most 4,000,000 pixels |
| Combined original and PNG bytes | At most 1 MiB |
| Rendering | 10-second outer deadline, cancellation kills the process group |
| Worker | CPU 8 seconds, address space 768 MiB, output file 256 KiB, 32 descriptors |
| PDF object inspection | 4,096 references, 20,000 visits, depth 64; 8 MiB zlib output |
| Evidence | At most 200 paragraphs; 500,000-byte canonical evidence JSON |

The strict parser rejects encryption, actions/scripts, attachments, external file
references, forms, annotations, alternate content, rotation and cropping. It
inspects parsed names and unused referenced objects as well as the page tree.
This deliberately limited format does not claim arbitrary PDF compatibility or
certify the absence of every native-parser vulnerability. Unsupported input is
rejected before OCR. Every rendered PNG is fully decoded by the trusted raster
boundary before it is sent to the OCR port.

Raster-to-page normalized coordinates are `[1/width, 0, 0, 1/height, 0, 0]` with a
top-left origin. Raster-to-PDF points are
`[pageWidth/width, 0, 0, -pageHeight/height, x0, y1]`; nonzero MediaBox origins are
preserved. The canonical evidence builder recomputes these transforms and binds
all OCR vertices, boxes, text and spans. It does not trust a caller's transform.

## Pinned, isolated runtime

`PdfRuntimeConfig` requires the following independently reviewed artifacts:

| Field | Required meaning |
| --- | --- |
| `runtimeRoot` | Root-owned self-contained Linux rootfs that is not group/other writable under `/opt/` or `/app/runtime/` |
| `bwrap` | Root-owned native ELF executable path and SHA-256 on the host |
| `python`, `pdftoppm` | Native ELF executable paths within the rootfs and exact SHA-256 values |
| `worker` | Root-owned path and SHA-256 of this repository's `pdf-render-worker.py` |
| `pypdfDirectory`, `pypdfTreeSha256` | Exact pypdf package directory within the rootfs and package-tree digest |
| `runtimeTreeSha256` | Digest of the complete rootfs including libraries, stdlib, fonts and configuration |
| `pythonVersion`, `popplerVersion` | Exact reviewed `major.minor.patch` identities; checked by the worker |
| `pypdfVersion` | Exactly `6.21.4`, enforced in both TypeScript and Python |
| `policyVersion` | Reviewed policy identifier bound into every renderer identity |

The parser build input is [pdf-runtime.requirements.txt](pdf-runtime.requirements.txt).
It pins the official pypdf 6.21.4 wheel hash. A build process can install it into
its isolated staging tree with pip's `--require-hashes --only-binary=:all:
--no-deps` options. Do not install it into an arbitrary running application
process or treat this file as an approved rootfs. pypdf 6.21.4 includes upstream
security fixes; the previous 6.10.0 identity is explicitly refused.

All artifact ancestors must be root-owned and not group/other writable. Native
shell wrappers, setuid/setgid binaries, hardlinked regular files, unbounded trees
and links escaping the rootfs are refused. The worker itself is copied as root
by `infra/deploy/Dockerfile`. That Dockerfile does not install or approve the
native PDF runtime: an independently built and reviewed rootfs remains required.

The rootfs must contain directory placeholders `/proc`, `/dev`, `/tmp`, `/work`
and a regular `/worker.py` placeholder. For the full tree hash, walk entries in
lexicographic depth-first order, excluding the root directory itself, and hash
UTF-8 `JSON.stringify(records)` without a trailing newline. Records are:

- Directory: `["D", relativePath, mode & 0777]`.
- Regular file: `["F", relativePath, mode & 0777, byteLength, sha256]`.
- Symbolic link: `["L", relativePath, rawLinkTarget]`.

The verifier permits at most 20,000 entries, depth 32, 512 MiB of file content and
128 MiB per file. Every link must resolve within that tree to an existing target,
without a cycle or more than 32 resolution steps. The separate pypdf tree digest
uses sorted depth-first `[relativePath, sha256]` file records, a maximum of 512
files/16 MiB, and permits no links. Compute pins from the exact final root-owned
artifacts; ownership/mode or byte changes require fresh review and new hashes.

The native host readonly-mounts this verified rootfs and the verified worker into
bubblewrap, then binds only its private temporary work directory. It does not
mount host `/usr`, `/lib` or fonts. It unshares namespaces, clears environment and
capabilities, and invokes Python with `-I -S -B`. The rootfs therefore must include
the reviewed dynamic loader, native libraries, stdlib and any required font/CMap
configuration. If namespace isolation is unavailable, execution fails closed.

Input and outputs use private temporary files. Original bytes, output names,
hashes and bounds are checked again after rendering. Cancellation, timeout,
rights withdrawal and late success discard the entire result. Diagnostic errors
are generic; raw PDF/OCR content and private filesystem paths are not exposed.

## Persistence, review and retrieval

Apply reviewed migrations in dependency order: `20261101_source_review.sql`,
`20261105_source_image_evidence.sql`, then
`20261105_source_pdf_evidence.sql`. These files are review artifacts; this change
does not run them or grant production access.

The writer stores the original PDF, canonical `source-pdf-v1` evidence, paragraphs
and exact PNG page bytes in one transaction. `source_pdf_rasters_vnext` is private
and append-only. The final original bundle seals the revision; subsequent
paragraph/page inserts are refused. Writers must still obey the existing
source-head lock protocol. These guards do not claim safety against arbitrary
hostile concurrent SQL writers with excessive privileges.

New or corrected bytes remain `NEEDS_REVIEW`. Independent review checks the
original hash, every stored PNG's hash and actual decoded geometry, canonical
bundle, paragraph spans and exact review hash. Only then can the effective view
and temporal reader use the revision. The reader receives a page metadata
projection, not original PDF/PNG bytes. An unreviewed correction blocks use of a
stale current head; historic `asOf` reads retain the original reviewed evidence.
Unchanged bytes update observation time without fabricating a new verification.

Private ingest/review role grants for the raster table must be reviewed separately.
The live fixture uses admin writer/reviewer and a restricted reader; it does not
prove the production ingest/review role design or actual consent.

## Verification and remaining operating evidence

TypeScript tests cover byte/page/order/transform binding, unsupported structures,
timeouts, withdrawal and late response rejection, persisted review/read behavior,
and IMAGE/TEXT compatibility. The PostgreSQL live slice is wired into all five
fixture migration lists and the full opt-in suite. Actual PostgreSQL migrations,
triggers, privileges and concurrent transactions remain **NOT_RUN** locally.

`tests/release/test_pdf_render_worker.py` uses synthetic PDFs only. The isolated
verification environment ran all 11 tests against Python 3.12.14, pypdf 6.21.4
and the native Poppler 26.05.0 ELF binary. This included the packaged worker CLI
with resource limits, a two-page render and independent colored-anchor pixel
checks for page order and original-page coordinates, including nonzero origins.
That Poppler version is a test fixture identity, not a recommendation or operating
approval. Tests skip with explicit reasons when their native dependencies are
absent; a skipped command must not be reported as native execution evidence.

The full bubblewrap host path could not run in the available environment because
namespace/network setup was denied. No production rootfs or real PDF/OCR provider
was exercised. Full sandbox/host acceptance, current native dependency security
and licenses, approved source rights, the independent 20-poster/PDF accuracy
review, real-provider billing and resource acceptance remain required. The npm
CycloneDX report covers npm components only; it does not inventory this native
runtime, Python package, fonts or container layers.

Primary dependency references, checked 2026-11-05:

- [pypdf 6.21.4 release and wheel hashes](https://pypi.org/project/pypdf/6.21.4/)
- [pypdf 6.21.4 changelog](https://pypdf.readthedocs.io/en/6.21.4/meta/CHANGELOG.html)
- [pypdf security policy and advisories](https://github.com/py-pdf/pypdf/security)
- [Poppler upstream and license information](https://poppler.freedesktop.org/)

pypdf uses BSD-3-Clause. Poppler and each linked dependency/font must be reviewed
for the actual distribution; package hashes alone do not establish license
compliance or redistribution rights.
