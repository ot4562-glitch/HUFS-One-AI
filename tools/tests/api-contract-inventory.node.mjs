import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const CLI = fileURLToPath(new URL('../audit_api_contracts.mjs', import.meta.url));
const ISSUES = [8, 9, 10, 11, 12, 19, 20, 27, 46, 61, 89, 119, 123, 132, 133];
const TASKS = ['TASK-00', 'TASK-01', 'TASK-02', 'TASK-03', 'TASK-04', 'TASK-05',
  'TASK-06', 'TASK-07', 'TASK-08', 'TASK-09', 'TASK-10', 'TASK-11', 'TASK-12',
  'TASK-13', 'TASK-14', 'TASK-14C', 'TASK-15', 'TASK-16', 'TASK-17'];
const SOURCE = 'apps/api/src/routes.ts';
const DTO = 'packages/contracts/src/example.ts';
const TEST = 'tests/api/example.test.ts';

function write(root, path, content) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function fixture(t, registration = "app.get('/api/example', async () => ({}));") {
  const root = mkdtempSync(join(tmpdir(), 'synthetic-api-inventory-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = "import type {FastifyInstance} from 'fastify';\n"
    + 'export function registerRoutes(app:FastifyInstance) {\n' + registration + '\n}\n';
  write(root, SOURCE, source);
  write(root, 'apps/api/src/integration.ts',
    "import type {FastifyInstance} from 'fastify';\n"
    + "import {registerRoutes} from './routes.js';\n"
    + 'export function createIntegratedApi(app:FastifyInstance) { registerRoutes(app); }\n');
  write(root, DTO, 'export const RequestSchema = {};\n');
  write(root, TEST, "export const syntheticTestReference = 'reference only, not executed';\n");
  write(root, 'STATUS.md', '## 5. Canonical issues\n'
    + ISSUES.map((number) => '| [#' + number + ' synthetic](https://github.com/minseong-hufs/HUFS-One-AI/issues/'
      + number + ') | owner | |\n').join(''));
  write(root, 'Architecture.md', '### A13.2 API v1\n| API | handling | checks |\n|---|---|---|\n'
    + '| GET /api/example | synthetic | source only |\n### A13.3 Version contracts\n'
    + '## A17. TASK execution\n| Task | owner | evidence |\n|---|---|---|\n'
    + TASKS.map((id) => '| ' + id + ' synthetic | owner | evidence |\n').join('')
    + '## A18. Acceptance\n');
  const manifest = {
    schemaVersion: 1,
    basis: { repository: 'minseong-hufs/HUFS-One-AI', baseCommit: 'a'.repeat(40) },
    canonicalIssues: ISSUES,
    surfaces: [{
      id: 'synthetic', source: SOURCE, registrar: 'registerRoutes',
      composition: [{ path: 'apps/api/src/integration.ts', caller: 'createIntegratedApi' }],
      exposure: { mode: 'INTERNAL_COMPOSITION_ONLY', conditions: ['Synthetic fixture only'],
        refusalRefs: [{ path: 'apps/api/src/integration.ts', symbol: 'createIntegratedApi' }] },
    }],
    routes: [{
      id: 'example', surface: 'synthetic', method: 'GET', path: '/api/example', primaryIssue: 27,
      dto: { state: 'REFERENCES_ONLY', refs: [{ path: DTO, symbol: 'RequestSchema' }] },
      testRefs: [TEST], consumerRefs: [],
    }],
    designContracts: [{ design: 'GET /api/example', primaryIssue: 27,
      actualRouteIds: ['example'], notes: 'Fixture mapping; no runtime claim.' }],
    tasks: TASKS.map((id) => ({
      id, primaryIssue: 8, relatedIssues: [], priority: 'P0', scope: 'Synthetic inventory fixture',
      sourceRefs: [{ path: SOURCE, symbol: 'registerRoutes' }], testRefs: [TEST], deferred: [],
    })),
  };
  function save() {
    write(root, 'tools/api_contract_inventory.json', JSON.stringify(manifest, null, 2) + '\n');
  }
  save();
  function git(...args) {
    const result = spawnSync('git', ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid',
      '-c', 'commit.gpgsign=false', '-C', root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  git('init', '-b', 'main', '--template=');
  git('add', '.');
  git('commit', '-m', 'synthetic API audit fixture');
  manifest.basis.baseCommit = git('rev-parse', 'HEAD');
  save();
  return { root, manifest, save, source };
}

function audit(root, expectedExit = 0, extra = []) {
  const result = spawnSync(process.execPath, [CLI, '--root', root, ...extra],
    { encoding: 'utf8', timeout: 15_000 });
  assert.equal(result.status, expectedExit, result.stderr || result.stdout);
  assert.equal(result.stderr, '', 'Diagnostics must not expose raw input or protected paths');
  return extra.includes('--markdown') ? result.stdout : JSON.parse(result.stdout);
}

function codes(report) {
  return report.findings.map((item) => item.code);
}

test('a referenced test never promotes a statically integrated route to TESTED', (t) => {
  const { root, manifest } = fixture(t);
  const report = audit(root);
  assert.equal(report.validationStatus, 'PASS');
  assert.equal(report.coverage, 'COMPLETE_STATIC_SCOPE');
  assert.equal(report.basis.baseCommit, manifest.basis.baseCommit);
  assert.equal(report.routes[0].status, 'INTEGRATED');
  assert.equal(report.routes[0].runtimeEvidence, 'NOT_RUN');
  assert.equal(report.routes[0].dto.shapeEvidence, 'UNKNOWN');
  assert.deepEqual(report.routes[0].testRefs, [TEST]);
  assert.equal(report.releaseDecision, 'RELEASE_BLOCKED');
  assert.equal(report.tasks.length, 19);
});

test('literal arrays, receiver aliases and helper arguments resolve to individual route registrations', (t) => {
  const { root, manifest, save } = fixture(t, [
    'const api = app;',
    "for (const path of ['/api/example', '/api/alias']) api.get(path, async () => ({}));",
    "const add = (path:string, method:'POST'|'PUT') => api.route({ method, url:path, handler:async () => ({}) });",
    "add('/api/write', 'POST');",
    "add('/api/replace', 'PUT');",
  ].join('\n'));
  for (const [id, method, path] of [
    ['alias', 'GET', '/api/alias'], ['write', 'POST', '/api/write'], ['replace', 'PUT', '/api/replace'],
  ]) manifest.routes.push({ ...manifest.routes[0], id, method, path });
  save();
  const report = audit(root);
  assert.equal(report.registrationCount, 4);
  assert.equal(report.unknown.length, 0);
  assert.deepEqual(report.routes.map((item) => item.method + ' ' + item.path).sort(), [
    'GET /api/alias', 'GET /api/example', 'POST /api/write', 'PUT /api/replace',
  ]);
});

test('object methods, constant prefixes and type-alias app parameters are resolved without executing code', (t) => {
  const { root } = fixture(t);
  const marker = join(root, 'SHOULD_NOT_EXIST');
  write(root, SOURCE, [
    "import type {FastifyInstance as Api} from 'fastify';",
    'type Options = { app:Api };',
    "const PREFIX = '/api';",
    'export function registerRoutes(options:Options) {',
    '  const {app} = options;',
    "  app.route({method:['GET'], url:PREFIX+'/example', handler:async () => ({})});",
    '}',
    "throw new Error('MODULE_MUST_NOT_EXECUTE');",
    'import {writeFileSync} from "node:fs";',
    'writeFileSync(' + JSON.stringify(marker) + ', "unexpected");',
  ].join('\n'));
  const report = audit(root);
  assert.equal(report.registrationCount, 1);
  assert.equal(existsSync(marker), false);
});

test('ordinary Map lookups are not Fastify registrations', (t) => {
  const { root } = fixture(t, [
    "const values = new Map(); values.get('/api/not-a-route');",
    "app.get('/api/example', async () => ({}));",
  ].join('\n'));
  const report = audit(root);
  assert.equal(report.registrationCount, 1);
  assert.equal(report.unknown.length, 0);
});

test('new unmapped registrations are validation failures, including a new untracked API source', (t) => {
  const { root } = fixture(t);
  write(root, 'apps/api/src/new-route.ts',
    "import type {FastifyInstance} from 'fastify';\n"
    + "export function registerNew(app:FastifyInstance) { app.post('/api/unmapped', async()=>({})); }\n");
  const report = audit(root, 1);
  assert.ok(codes(report).includes('UNMAPPED_REGISTRATION'));
  assert.equal(report.findings.find((item) => item.code === 'UNMAPPED_REGISTRATION').path, '/api/unmapped');
  assert.equal(report.validationStatus, 'FAIL');
});

test('a deleted registration cannot remain INTEGRATED in the inventory', (t) => {
  const { root } = fixture(t, '');
  const report = audit(root, 1);
  assert.ok(codes(report).includes('REGISTRATION_MISSING'));
  assert.equal(report.routes[0].status, 'NOT_IMPLEMENTED');
});

test('duplicate route identities and duplicate TASK mappings fail validation', (t) => {
  const { root, manifest, save } = fixture(t);
  manifest.routes.push({ ...manifest.routes[0], id: 'duplicate' });
  manifest.tasks.push({ ...manifest.tasks[0] });
  save();
  const report = audit(root, 1);
  assert.ok(codes(report).includes('DUPLICATE_ROUTE_MAPPING'));
  assert.ok(codes(report).includes('DUPLICATE_TASK_MAPPING'));
});

test('missing TASK-14C and unknown canonical issues are rejected', (t) => {
  const { root, manifest, save } = fixture(t);
  manifest.tasks = manifest.tasks.filter((item) => item.id !== 'TASK-14C');
  manifest.routes[0].primaryIssue = 999;
  save();
  const report = audit(root, 1);
  assert.ok(codes(report).includes('TASK_MAPPING_MISSING'));
  assert.ok(codes(report).includes('NONCANONICAL_ISSUE'));
});

test('canonical issue and design coverage are checked against current documents', (t) => {
  const { root, manifest, save } = fixture(t);
  manifest.canonicalIssues = manifest.canonicalIssues.filter((number) => number !== 133);
  manifest.designContracts = [];
  save();
  const report = audit(root, 1);
  assert.ok(codes(report).includes('CANONICAL_ISSUES_MISMATCH'));
  assert.ok(codes(report).includes('DESIGN_MAPPING_MISSING'));
});

test('invalid priorities and fabricated TESTED claims cannot enter the inventory', (t) => {
  const { root, manifest, save } = fixture(t);
  manifest.tasks[0].priority = 'DONE';
  manifest.routes[0].status = 'TESTED';
  save();
  const report = audit(root, 1);
  assert.ok(codes(report).includes('INVALID_PRIORITY'));
  assert.ok(codes(report).includes('UNSUPPORTED_RUNTIME_CLAIM'));
  assert.equal(report.routes[0].runtimeEvidence, 'NOT_RUN');
});

test('DTO symbols and referenced test files must actually exist', (t) => {
  const { root, manifest, save } = fixture(t);
  manifest.routes[0].dto.refs[0].symbol = 'AbsentSchema';
  manifest.routes[0].testRefs = ['tests/api/missing.test.ts'];
  save();
  const report = audit(root, 1);
  assert.ok(codes(report).includes('REFERENCE_SYMBOL_MISSING'));
  assert.ok(codes(report).includes('REFERENCE_FILE_MISSING'));
});

test('an uninvoked registrar callback is not evidence of integration', (t) => {
  const { root } = fixture(t);
  write(root, 'apps/api/src/integration.ts',
    "import {registerRoutes} from './routes.js';\n"
    + 'export function createIntegratedApi(app:unknown) { const never = () => registerRoutes(app); }\n');
  const report = audit(root, 1);
  assert.ok(codes(report).includes('COMPOSITION_CALL_MISSING'));
  assert.equal(report.routes[0].status, 'UNKNOWN');
});

test('dynamic paths keep unknown coverage distinct from a confirmed validation failure', (t) => {
  const { root, manifest, save } = fixture(t,
    "const path = process.env.UNREVIEWED_PATH; app.get(path, async()=>({}));");
  manifest.routes = [];
  manifest.designContracts[0].actualRouteIds = [];
  save();
  const report = audit(root, 3);
  assert.equal(report.validationStatus, 'PASS');
  assert.equal(report.coverage, 'UNKNOWN');
  assert.ok(report.unknown.some((item) => item.code === 'DYNAMIC_ROUTE'));
  assert.equal(report.designContracts[0].status, 'UNKNOWN');
});

test('mutable path variables and plugin registrations remain visible as UNKNOWN', (t) => {
  const { root, manifest, save } = fixture(t,
    "let path = '/api/mutable'; app.get(path, async()=>({})); app.register(unknownPlugin);");
  manifest.routes = [];
  manifest.designContracts[0].actualRouteIds = [];
  save();
  const report = audit(root, 3);
  assert.ok(report.unknown.some((item) => item.code === 'DYNAMIC_ROUTE'));
  assert.ok(report.unknown.some((item) => item.code === 'DYNAMIC_PLUGIN'));
});

test('a design-only route is NOT_IMPLEMENTED when the scanned static scope is complete', (t) => {
  const { root, manifest, save } = fixture(t);
  manifest.designContracts[0].actualRouteIds = [];
  save();
  const report = audit(root);
  assert.equal(report.designContracts[0].status, 'NOT_IMPLEMENTED');
  assert.equal(report.designContracts[0].runtimeEvidence, 'NOT_RUN');
});

test('protected references are rejected before reading content and are hash-only in diagnostics', (t) => {
  const { root, manifest, save } = fixture(t);
  write(root, 'private/NEVER_PUBLISH.ts', 'NEVER_PUBLISH_CONTENT');
  manifest.routes[0].dto.refs = [{ path: 'private/NEVER_PUBLISH.ts', symbol: 'Secret' }];
  save();
  const report = audit(root, 1);
  assert.ok(codes(report).includes('UNSAFE_REFERENCE'));
  assert.ok(!JSON.stringify(report).includes('NEVER_PUBLISH'));
});

test('Markdown keeps runtime uncertainty and task ownership visible', (t) => {
  const { root } = fixture(t);
  const report = audit(root, 0, ['--markdown']);
  assert.match(report, /GET.*\/api\/example/);
  assert.match(report, /TASK-14C/);
  assert.match(report, /NOT_RUN/);
  assert.match(report, /RELEASE_BLOCKED/);
  assert.doesNotMatch(report, /\| TESTED \|/);
});

test('mutation of constant route arrays, aliases and object fields cannot retain complete coverage', (t) => {
  for (const declaration of [
    "const paths = ['/api/example']; paths.push(process.env.EXTRA_PATH); for(const path of paths) app.get(path, async()=>({}));",
    "const paths = ['/api/example']; const alias=paths; alias[0]=process.env.ROUTE; for(const path of paths) app.get(path, async()=>({}));",
    "const options={url:'/api/example'}; options.url=process.env.ROUTE; app.get(options.url,async()=>({}));",
    "const paths = ['/api/example']; unknownMutator(paths); for(const path of paths) app.get(path,async()=>({}));",
  ]) {
    const {root,manifest,save}=fixture(t,declaration);
    manifest.routes=[]; manifest.designContracts[0].actualRouteIds=[]; save();
    const report=audit(root,3);
    assert.equal(report.registrationCount,0);
    assert.equal(report.coverage,'UNKNOWN');
    assert.ok(report.unknown.some(item=>item.code==='DYNAMIC_ROUTE'));
  }
});

test('an unresolved composed API receiver is reported instead of silently omitted', (t) => {
  const {root}=fixture(t);
  write(root,'apps/api/src/composed.ts',[
    "import {createApi} from './factory.js';",
    "const app=createApi();",
    "app.get('/api/new-composed',async()=>({}));",
  ].join('\n'));
  const report=audit(root,3);
  assert.ok(report.unknown.some(item=>item.code==='UNRESOLVED_REGISTRATION'));
});

test('forged task runtime claims and protected exposure references are rejected and sanitized', (t) => {
  const {root,manifest,save}=fixture(t);
  manifest.tasks[0].status='TESTED';
  manifest.tasks[0].runtimeEvidence='PASSED';
  manifest.surfaces[0].exposure.refusalRefs=[{path:'private/NEVER_PUBLISH.ts'}];
  save();
  const report=audit(root,1);
  assert.ok(codes(report).includes('UNSUPPORTED_RUNTIME_CLAIM'));
  assert.ok(codes(report).includes('UNSAFE_REFERENCE'));
  assert.equal(report.tasks[0].status,undefined);
  assert.equal(report.tasks[0].runtimeEvidence,'NOT_RUN');
  assert.ok(!JSON.stringify(report).includes('NEVER_PUBLISH'));
});

test('dynamic imports remain UNKNOWN in uninvoked local functions and arrow callbacks', (t) => {
  for (const hidden of [
    "function privateFactory(){ return import(process.env.PRIVATE_CONFIG); }",
    "const privateFactory=()=>import(process.env.PRIVATE_CONFIG);",
    "Promise.resolve().then(()=>import(process.env.PRIVATE_CONFIG));",
  ]) {
    const {root,source}=fixture(t);
    write(root,SOURCE,source+'\n'+hidden+'\n');
    const report=audit(root,3);
    const observations=report.unknown.filter(item=>item.code==='DYNAMIC_IMPORT');
    assert.equal(observations.length,1);
    assert.equal(report.validationStatus,'PASS');
    assert.equal(report.coverage,'UNKNOWN');
    assert.equal(report.registrationCount,1);
  }
});

test('local, parameter and temporal-dead-zone shadowing do not prove an imported composition call', (t) => {
  for(const body of [
    "const registerRoutes=()=>{}; registerRoutes(app);",
    "registerRoutes(app); const registerRoutes=()=>{};",
  ]) {
    const {root}=fixture(t);
    write(root,'apps/api/src/integration.ts',
      "import type {FastifyInstance} from 'fastify';\n"+
      "import {registerRoutes} from './routes.js';\n"+
      "export function createIntegratedApi(app:FastifyInstance){"+body+"}\n");
    const report=audit(root,1);
    assert.ok(codes(report).includes('COMPOSITION_CALL_MISSING'));
    assert.equal(report.routes[0].status,'UNKNOWN');
  }
  const {root}=fixture(t);
  write(root,'apps/api/src/integration.ts',
    "import type {FastifyInstance} from 'fastify';\n"+
    "import {registerRoutes} from './routes.js';\n"+
    "export function createIntegratedApi(app:FastifyInstance,registerRoutes:unknown){ registerRoutes(app); }\n");
  const report=audit(root,1);
  assert.ok(codes(report).includes('COMPOSITION_CALL_MISSING'));
  assert.equal(report.routes[0].status,'UNKNOWN');
});

test('tracked but absent test and consumer references cannot count as present evidence', (t) => {
  const {root}=fixture(t);
  rmSync(join(root,TEST));
  const report=audit(root,1);
  assert.ok(codes(report).includes('REFERENCE_FILE_UNAVAILABLE'));
});

test('current-state-only documentation can omit historical issue and A13.2 tables without weakening contract mappings',t=>{
  const {root}=fixture(t);
  write(root,'STATUS.md','# Current implementation\n\nActive owners: #253 and #257.\n');
  write(root,'Architecture.md','## A13. Current runtime contracts\n\n## A17. Current task provenance\n');
  const report=audit(root);
  assert.equal(report.validationStatus,'PASS');
  assert.equal(report.routes[0].status,'INTEGRATED');
  assert.equal(report.tasks.length,19);
  assert.equal(report.runtimeEvidence,'NOT_RUN');
});
