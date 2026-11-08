'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {classify, effortPoints, chooseAssignee, isProtected, routeIssue} = require('../../.github/scripts/issue-router.cjs');

function ticket(number, title, extra = {}) {
  return {number, title, labels: [], assignees: [], body: '', ...extra};
}
function mock(issue, openIssues = []) {
  const calls = {added: [], removed: [], assigned: [], created: []};
  const existingLabels = new Set();
  const rest = {issues: {
    getLabel: async ({name}) => {
      if (!existingLabels.has(name)) throw {status: 404};
      return {data: {name}};
    },
    createLabel: async ({name}) => {existingLabels.add(name); calls.created.push(name);},
    addLabels: async ({labels}) => calls.added.push(...labels),
    removeLabel: async ({name}) => calls.removed.push(name),
    addAssignees: async ({assignees}) => calls.assigned.push(...assignees),
    listForRepo: async () => ({data: openIssues})
  }};
  const github = {rest, paginate: async () => openIssues};
  const context = {repo: {owner: 'ot4562-glitch', repo: 'HUFS-One-AI'}, payload: {issue}};
  const core = {info() {}, warning() {}};
  return {calls, github, context, core};
}

test('immutable #355-359 never receive any writes, regardless of title', async () => {
  for (let number = 355; number <= 359; number++) {
    const issue = ticket(number, '[AI \uad6c\ud604] example');
    assert.equal(isProtected(issue), true);
    const env = mock(issue);
    assert.equal((await routeIssue({...env})).status, 'protected');
    assert.deepEqual(env.calls, {added: [], removed: [], assigned: [], created: []});
  }
  assert.equal(isProtected(ticket(900, '[\ubcf8\uc120 \uc9c4\ucd9c \uc774\ud6c4] someone')), true);
});

test('new feature starts with owner and never guesses AI handoff from prose', async () => {
  const issue = ticket(400, '[\ucd94\uac00 \uae30\ub2a5] AI RAG UI');
  const env = mock(issue);
  const result = await routeIssue({...env});
  assert.equal(result.assignee, 'ot4562-glitch');
  assert.ok(env.calls.added.includes('area:integration'));
  assert.ok(env.calls.added.includes('effort:unestimated'));
});

test('data request goes to data owner, web task to UI owner', async () => {
  for (const [title, expected] of [
    ['[\ub370\uc774\ud130 \uc694\uccad] dataset', 'qamarrchae'],
    ['[\uc6f9 \uad6c\ud604] new screen', 'lhh42001']
  ]) {
    const issue = ticket(420, title);
    const env = mock(issue);
    assert.equal((await routeIssue({...env})).assignee, expected);
  }
});

test('AI candidate with lower weighted backlog is assigned, excluding frozen roles', async () => {
  const issue = ticket(430, '[AI \uad6c\ud604] OCR');
  const env = mock(issue, [
    ticket(355, 'frozen', {assignees: [{login: 'uisang2004-maker'}], labels: ['effort:L']}),
    ticket(401, 'active', {assignees: [{login: 'taewangim-alt'}], labels: ['effort:L']}),
    ticket(402, 'active', {assignees: [{login: 'uisang2004-maker'}], labels: ['effort:S']}),
    {...ticket(499, 'PR', {assignees: [{login: 'uisang2004-maker'}], labels: ['effort:L']}), pull_request: {url: 'pr'}}
  ]);
  assert.equal((await routeIssue({...env})).assignee, 'uisang2004-maker');
  assert.deepEqual(env.calls.assigned, ['uisang2004-maker']);
});

test('AI load is weighted not issue-count and does not count own ticket', () => {
  const issues = [
    ticket(510, 'first', {assignees: [{login: 'taewangim-alt'}], labels: ['effort:L']}),
    ticket(511, 'small', {assignees: [{login: 'uisang2004-maker'}], labels: ['effort:S']}),
    ticket(512, 'small', {assignees: [{login: 'uisang2004-maker'}], labels: ['effort:S']}),
    ticket(513, 'small', {assignees: [{login: 'uisang2004-maker'}], labels: ['effort:S']}),
    ticket(500, 'current', {assignees: [{login: 'uisang2004-maker'}], labels: ['effort:L']})
  ];
  assert.equal(chooseAssignee('ai', issues, 500), 'uisang2004-maker');
  assert.equal(effortPoints(ticket(500, 'x')), 3);
});

test('human assignee is preserved even when editing title', async () => {
  const issue = ticket(450, '[AI \uad6c\ud604] RAG', {assignees: [{login: 'ot4562-glitch'}]});
  const env = mock(issue);
  assert.equal((await routeIssue({...env})).status, 'preserved');
  assert.deepEqual(env.calls.assigned, []);
});

test('multiple areas require review, but explicit single area label wins', async () => {
  const mixed = ticket(460, 'React API integration');
  const env = mock(mixed);
  assert.equal((await routeIssue({...env})).status, 'needs-review');
  assert.ok(env.calls.added.includes('triage:needs-review'));
  assert.equal(env.calls.assigned.length, 0);
  const labeled = ticket(461, 'React API integration', {labels: ['area:web']});
  const labeledEnv = mock(labeled);
  assert.equal((await routeIssue({...labeledEnv})).assignee, 'lhh42001');
  const conflicting = ticket(462, 'anything', {labels: ['area:web', 'area:ai']});
  assert.equal(classify(conflicting).area, null);
});

test('human routing:hold prevents assignment, but can add category labels', async () => {
  const issue = ticket(470, '[AI \uad6c\ud604] OCR', {labels: ['routing:hold']});
  const env = mock(issue);
  assert.equal((await routeIssue({...env})).status, 'held');
  assert.deepEqual(env.calls.assigned, []);
});

test('dry run never changes labels or assignees', async () => {
  const issue = ticket(480, '[AI \uad6c\ud604] OCR');
  const env = mock(issue);
  assert.equal((await routeIssue({...env, dryRun: true})).status, 'dry-run');
  assert.deepEqual(env.calls, {added: [], removed: [], assigned: [], created: []});
});

test('priority and effort are marked, removing temporary unestimated label', async () => {
  const issue = ticket(490, '[UI \ubc84\uadf8 P1] React screen', {labels: ['effort:L', 'effort:unestimated']});
  const env = mock(issue);
  await routeIssue({...env});
  assert.ok(env.calls.added.includes('priority:P1'));
  assert.ok(env.calls.removed.includes('effort:unestimated'));
  assert.equal(effortPoints(issue), 8);
});


test('failed assignment preserves a needs-review flag', async () => {
  const issue = ticket(493, '[AI \uad6c\ud604] OCR', {labels: ['triage:needs-review']});
  const env = mock(issue);
  env.github.rest.issues.addAssignees = async () => {throw {status: 422};};
  assert.equal((await routeIssue({...env})).status, 'needs-review');
  assert.ok(env.calls.removed.includes('triage:needs-review'));
  assert.ok(env.calls.added.includes('triage:needs-review'));
});


test('canonical issue prefixes route correctly and resist misleading prose', async () => {
  for (const [prefix, expected] of [
    ['[\uae30\uc220 \ud1b5\ud569]', 'ot4562-glitch'],
    ['[AI \uad6c\ud604]', null],
    ['[\uc6f9 \uad6c\ud604]', 'lhh42001'],
    ['[\ub370\uc774\ud130 \uc694\uccad]', 'qamarrchae'],
    ['[\ucd94\uac00 \uae30\ub2a5]', 'ot4562-glitch']
  ]) {
    const issue = ticket(540, prefix + ' React AI API project');
    const env = mock(issue);
    const result = await routeIssue({...env});
    assert.equal(result.area, prefix === '[AI \uad6c\ud604]' ? 'ai' :
      prefix === '[\uc6f9 \uad6c\ud604]' ? 'web' :
      prefix === '[\ub370\uc774\ud130 \uc694\uccad]' ? 'data' : 'integration');
    if (expected) assert.equal(result.assignee, expected);
    else assert.ok(['taewangim-alt', 'uisang2004-maker'].includes(result.assignee));
  }
});

test('explicit area label conflicting with a canonical prefix requires human review', async () => {
  const issue = ticket(541, '[\ucd94\uac00 \uae30\ub2a5] LLM prototype',
    {labels: ['area:ai']});
  const env = mock(issue);
  assert.equal((await routeIssue({...env})).status, 'needs-review');
  assert.equal(env.calls.assigned.length, 0);
});

test('AI QA prefix assigns dedicated technical QA owner irrespective of AI development load', async () => {
  const issue = ticket(542, '[AI QA] recommendation regression');
  const env = mock(issue, [
    ticket(543, 'active', {assignees: [{login: 'taewangim-alt'}], labels: ['effort:L']})
  ]);
  assert.equal((await routeIssue({...env})).assignee, 'taewangim-alt');
});


test('explicit triage prefix overrides even clear code paths and retains unassigned status', async () => {
  const issue = ticket(550, '[\ubd84\ub958 \uac80\ud1a0] React AI API', {body: 'apps/web/src/page.tsx'});
  const env = mock(issue);
  assert.equal((await routeIssue({...env})).status, 'needs-review');
  assert.ok(env.calls.added.includes('triage:needs-review'));
  assert.deepEqual(env.calls.assigned, []);
});


test('[버그] with one clear UI role is assigned and carries type:bug', async () => {
  const issue = ticket(560, '[\ubc84\uadf8][\ucf54\ub4dc \uc804\uc218\uc870\uc0ac] P2 React URL route fails');
  const env = mock(issue);
  const result = await routeIssue({...env});
  assert.equal(result.area, 'web');
  assert.equal(result.assignee, 'lhh42001');
  assert.ok(env.calls.added.includes('type:bug'));
  assert.ok(env.calls.added.includes('source:code-audit'));
  assert.ok(env.calls.added.includes('priority:P2'));
});

test('ambiguous [버그] does not assign a person', async () => {
  const issue = ticket(561, '[\ubc84\uadf8] shared client and server error');
  const env = mock(issue);
  assert.equal((await routeIssue({...env})).status, 'needs-review');
  assert.ok(env.calls.added.includes('triage:needs-review'));
  assert.deepEqual(env.calls.assigned, []);
});

test('[실증 인수] never auto-assigns even with explicit area', async () => {
  const issue = ticket(562, '[\uc2e4\uc99d \uc778\uc218] production NCP approval',
    {labels: ['area:integration']});
  const env = mock(issue);
  assert.equal((await routeIssue({...env})).status, 'needs-review');
  assert.ok(env.calls.added.includes('type:acceptance'));
  assert.ok(env.calls.added.includes('triage:needs-review'));
  assert.deepEqual(env.calls.assigned, []);
});

test('P0 is labeled and always requires a human before assigning', async () => {
  const issue = ticket(563, '[\ubc84\uadf8] P0 React issue');
  const env = mock(issue);
  assert.equal((await routeIssue({...env})).status, 'needs-review');
  assert.ok(env.calls.added.includes('priority:P0'));
  assert.ok(env.calls.added.includes('triage:needs-review'));
  assert.deepEqual(env.calls.assigned, []);
});

test('existing priority:P0 label also blocks assignment, preserving human owner', async () => {
  const issue = ticket(564, '[AI \uad6c\ud604] model bug', {labels: ['priority:P0']});
  const env = mock(issue);
  assert.equal((await routeIssue({...env})).status, 'needs-review');
  assert.deepEqual(env.calls.assigned, []);
});

test('security/P0 combination retains security label while blocking assignment', async () => {
  const issue = ticket(565, '[\ubc84\uadf8] P0 \uac1c\uc778\uc815\ubcf4 \ub178\ucd9c');
  const env = mock(issue);
  assert.equal((await routeIssue({...env})).status, 'needs-review');
  assert.ok(env.calls.added.includes('type:security'));
  assert.ok(env.calls.added.includes('priority:P0'));
  assert.ok(env.calls.added.includes('triage:needs-review'));
  assert.deepEqual(env.calls.assigned, []);
});

test('security keyword with otherwise obvious owner remains unassigned', async () => {
  const issue = ticket(566, '[\uae30\uc220 \ud1b5\ud569] P1 \ubcf4\uc548 \ucde8\uc57d\uc810');
  const env = mock(issue);
  assert.equal((await routeIssue({...env})).status, 'needs-review');
  assert.ok(env.calls.added.includes('type:security'));
  assert.deepEqual(env.calls.assigned, []);
});

test('data correction is a data-request subtype, not a tenth prefix', async () => {
  const issue = ticket(567, '[\ub370\uc774\ud130 \uc694\uccad][\uc815\uc815] \uacf5\uc2dd \uc790\ub8cc \uc624\ub958');
  const env = mock(issue);
  assert.equal((await routeIssue({...env})).assignee, 'qamarrchae');
  assert.ok(env.calls.added.includes('type:data-correction'));
});

test('new canonical prefix configuration defines nine entries', () => {
  const cfg = require('../../.github/issue-routing.json');
  assert.equal(cfg.prefixes.length, 9);
  assert.equal(classify(ticket(568, '[\uc2e4\uc99d \uc778\uc218] NCP')).area, null);
  assert.equal(classify(ticket(569, '[\ubc84\uadf8] React')).area, 'web');
});
