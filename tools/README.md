# Read-only developer tools

`npm run audit:entrypoints` prints the #199 execution/reference inventory as JSON;
`npm run audit:entrypoints -- --markdown` prints a short report. The tool records
HEAD SHA and whether tracked working-tree files differ from it. It never runs
package scripts, imports application modules, contacts GitHub, modifies files,
or deletes apparently unreferenced code.

Package scripts, Vitest includes, Playwright test directories, literal imports,
module URLs and workflow command paths supply evidence automatically. The small
`entrypoints.json` records special runtime/worker approval conditions and focused
verification commands; those commands are descriptions, never executed. Canonical
document links to source files are checked. Relative `.js` imports and generated
`dist/` paths resolve back to tracked TypeScript source. A missing literal target
is a missing tracked reference for review, not proof of an exploitable or reachable
bug. Unresolved dynamic imports, directory loaders and files without known
incoming references remain `UNKNOWN` and are preserved.
Worker constructors (including Node named/namespace aliases) are recognized.
An inline module URL supplies a static worker target; string filenames keep an
unknown base because Node uses the runtime cwd and browsers use the document
URL. `fork` cwd/arguments also stay unknown instead of guessing an importer base.

Scope is maintained code roots and named canonical documents, not the whole drive
or repository. Protected student roots, `private/`, credentials, raw references,
`local_only/`, real fixtures and symlinks are excluded before content reads. A
sparse checkout, size/count limit, unavailable manifest or parser error prevents
complete static coverage. Defaults bound files to 2,000, each to 1 MiB and total
content to 32 MiB. `npm run test:entrypoints` uses disposable synthetic Git repos.

For optional PR dependency/file-overlap evidence, pipe a sanitized JSON snapshot
to `npm run audit:entrypoints -- --prs-stdin` (stdin maximum 2 MiB):

```json
{"complete":true,"pagesRead":1,"pagesExpected":1,"items":[{"number":1,"head":"feature-a","base":"main","files":["apps/api/src/main.ts"]}]}
```

Populate it from all current open-PR pages plus all changed-file pages; set
`complete:false` if any page is missing or unknown. The tool verifies structure,
matching page counts and unique PR numbers, but cannot independently prove the
producer fetched every page. Missing/partial PR input keeps overall status
`PARTIAL`. Exit codes: 0 = no confirmed missing tracked reference within scope
(may still be PARTIAL), 1 = missing tracked references, 2 = audit input/runtime
failure. No result constitutes safe-deletion, independent human approval,
security, data-rights or release authorization.

## Protected Git history metadata (#46)

Run `python3 tools/audit_private_git_metadata.py` in the selected checkout.
The audit inventories protected path names in the index and in changes reachable
from all available local refs, including paths already removed from the index and
paths found only on another local branch or remote-tracking ref. It uses Git tree
and commit metadata, disables rename/content conversion and external diff helpers,
and disables lazy fetching and all transport protocols. It never opens working
originals or requests blob contents. Pathspecs are literal and Git path records
are NUL-delimited.

Output contains hashed path references and observed addition commit IDs, never
raw filenames, commit messages, authors or file contents. `protectedTrackedCount`
and `protectedHistoricalCount` describe different scopes; neither implies the
repository or its history is cleared for publication. An addition is an observed
tree change, not proof of the original external publication or a consent receipt.
Shallow history stays `SHALLOW_UNRESOLVED`; full available history is still only
`AVAILABLE_LOCAL_REFS_ONLY`. Unreachable/reflog-only history, other collaborators'
clones, remote refs not present locally, forks, archives and consent remain
`NOT_VERIFIED`. No history is rewritten.

The audit rejects more than 100 protected paths or 100 observed additions per
path and Git responses over 32 MiB; each metadata query has a 30-second timeout.
Unavailable/over-limit evidence returns a generic blocked error, not a partial
success. Exit 0 means the local metadata audit completed, not that release is
approved. Exit 1 means evidence is unavailable. `RELEASE_BLOCKED` is unconditional.

## Offline dependency and license evidence (#89)

Run `node tools/audit_dependency_licenses.mjs` using the repository's supported
Node version. `--root <checkout>` explicitly selects another local checkout.
No installation is performed; without matching installed packages, evidence
remains partial.

The deterministic JSON report records the exact `package-lock.json` SHA-256,
lockfile v2/v3 package versions, direct/transitive and development/runtime scope,
declared registry integrity, sanitized registry origins, matched installed
manifest hashes, license declarations and hashes of package-root LICENSE,
LICENCE, COPYING and NOTICE files. Missing lockfile declarations can be
supplemented by a matching installed manifest. Conflicting declarations,
mismatched identities, missing or malformed integrity, missing files and
`UNLICENSED` remain unresolved. Raw license/notice text, locator credentials,
query strings, fragments and file paths are not printed.

Only the lockfile and bounded package metadata under `node_modules` are read.
Symlinks, traversal, protected path segments and non-registry sources are
refused; workspace packages are listed from lock metadata without opening their
source or following links. Package entrypoints and lifecycle scripts are never
executed. No network calls, vulnerability queries or package downloads occur.
Limits are 2 MiB for the lockfile, 2,000 lock entries, 256 KiB per manifest, 1 MiB
per license/notice file, 32 such files and 5,000 directory entries per package,
and 32 MiB total content.

`COMPLETE_WITHIN_SCOPE` means the selected metadata evidence is present. A
declaration is not validated against the full SPDX license registry; `PRESENT`
is not a legal approval. The report is an input to SBOM/license review, not a
complete release-image/runtime SBOM. Matching installed bytes to registry
integrity, transitive license obligations, assets/fonts/models, vulnerability
and provenance review, and current-head independent release approval remain
explicitly unverified. Every result preserves `RELEASE_BLOCKED`.

Exit codes: 0 = metadata evidence complete within scope; 1 = partial evidence;
2 = unavailable/unsupported audit input. Both CLI and importable API suppress
input content and paths in error diagnostics.

Focused synthetic regression commands:

- `python3 -m unittest tests.release.test_private_git_metadata tests.release.test_publication_artifacts -v`
- `node --test tests/release/dependency_licenses.test.mjs`

The publication regression includes `infra/deploy/Dockerfile.dockerignore`, which
can override the root Docker exclusions. The gate inspects its presence without
reading the override's contents.

## API, DTO and TASK mapping (#8)

`node tools/audit_api_contracts.mjs` prints the current static inventory as JSON.
Add `--markdown` for the route/DTO/consumer/design/TASK tables, or
`--root <checkout>` to select another local checkout. Run it after installing
the repository's pinned development dependencies; the TypeScript parser is
used without importing or executing application modules or tests.

`tools/api_contract_inventory.json` records an immutable review base, the
current 15 canonical issues, named composition boundaries, actual route aliases,
DTO declaration references, existing test/consumer paths, all 39 A13.2 design
rows and TASK-00 through TASK-17 plus TASK-14C exactly once. Runtime results
cannot be supplied by this manifest. `baseCommit` is the reviewed worktree
baseline; `currentHead` and `sourceDigest` identify the checkout and content
observed by each new audit. A matching hash is not an execution receipt.

The bounded AST pass recognizes Fastify instances, literal paths, constant
prefixes, method arrays, receiver aliases, local registration helpers and
literal-array loops. It verifies named composition calls, DTO declarations,
reference files and current Architecture/STATUS coverage. Added or removed
registrations, duplicate mappings, missing references, fabricated runtime
claims and noncanonical issue ownership are validation failures. Mutable
values, unresolved composed receivers, dynamic plugins/imports, unsupported
analysis or unavailable API files remain `UNKNOWN`.

`INTEGRATED` means a maintained registration and its named internal composition
call were found. The report includes mounting/refusal conditions and preserves
production blocks and local synthetic-only launchers. It does not prove that
the route is enabled, called by the browser, accepted in a live environment,
or safe for publication. DTO references have `shapeEvidence: UNKNOWN`; a
schema name alone does not prove the response wrapper, payload or consumer
compatibility. Test references always retain `runtimeEvidence: NOT_RUN`.
No row becomes `TESTED` from static source text.

`NOT_IMPLEMENTED` is used only when the searched static scope is complete and
the registration is absent. Otherwise absence stays `UNKNOWN`, with notes
distinguishing retired design paths, aliases and separate owner/operator
contracts. In the reviewed baseline, the external private operator adapter
import in `apps/api/src/operator-main.ts` keeps overall coverage `UNKNOWN`.
The audit reports that observation and never opens the private module.

Only maintained API TypeScript and explicit allowed code/document references
are read. Protected raw student areas, private configuration, generated output,
node_modules and symlinks are excluded from content reads. Limits are 500 API
files, 1 MiB per file, 32 MiB total content, 1,000 route mappings, 100 surfaces,
128 design rows, 100 task records and 100 references per record. A sparse
checkout with absent required sources cannot establish complete coverage.
Unsupported JavaScript/metaprogramming is outside this bounded static proof;
independent runtime/consumer acceptance is still required.

Exit codes: 0 = validation passes with complete supported static scope;
1 = confirmed validation findings; 2 = audit unavailable; 3 = validation
passes but coverage remains `UNKNOWN`. Preserve these outcomes separately in
CI. All outcomes retain `RELEASE_BLOCKED`. The executable fixture suite is
`node --test tools/tests/api-contract-inventory.node.mjs`.

## Pre-build dependency BOM (#89)

`node tools/dependency_bom.mjs [--root <path>]` emits a deterministic
CycloneDX 1.6 report derived from the offline dependency/license audit above.
It preserves incomplete evidence and `RELEASE_BLOCKED`. Manifest and
license-file hashes are evidence properties, not verification of installed
component bytes; the report does not invent component hashes or a dependency
graph. Missing/conflicting license declarations remain unresolved. Final
release-image/runtime contents, assets/models and independent license review
remain separate gates. Exit 0 means complete within the selected metadata
scope, 1 means partial evidence, and 2 means unavailable evidence.
