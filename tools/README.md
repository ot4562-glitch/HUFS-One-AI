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
