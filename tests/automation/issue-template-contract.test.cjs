'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const canonical = [
  '[\ucd94\uac00 \uae30\ub2a5]',
  '[\ub370\uc774\ud130 \uc694\uccad]',
  '[\uc6f9 \uad6c\ud604]',
  '[AI \uad6c\ud604]',
  '[AI QA]',
  '[\uae30\uc220 \ud1b5\ud569]',
  '[\ubd84\ub958 \uac80\ud1a0]'
];
const templates = [
  ['additional-feature.yml', canonical[0]],
  ['data-request.yml', canonical[1]],
  ['web-implementation.yml', canonical[2]],
  ['ai-implementation.yml', canonical[3]],
  ['ai-qa.yml', canonical[4]],
  ['integration-task.yml', canonical[5]],
  ['needs-triage.yml', canonical[6]],
  ['agent-task.md', canonical[6]]
];

test('all GitHub issue templates prefill a canonical routing prefix', () => {
  const folder = '.github/ISSUE_TEMPLATE';
  const existing = fs.readdirSync(path.join(ROOT, folder))
    .filter(name => /\.(?:yml|yaml|md)$/.test(name)).sort();
  assert.deepEqual(existing, templates.map(([name]) => name).sort(),
    'A new template needs a canonical title prefix and a coverage entry');
  for (const [name, prefix] of templates) {
    const content = read(folder + '/' + name);
    const title = content.match(/^title:\s*["']?([^\r\n"']+)/m)?.[1];
    assert.ok(title?.startsWith(prefix), name + ' must begin title with ' + prefix);
  }
});

test('every scoped AGENTS.md points newcomers to the canonical playbook', () => {
  const paths = [
    'AGENTS.md', 'apps/api/AGENTS.md', 'apps/web/AGENTS.md',
    'assets/AGENTS.md', 'infra/AGENTS.md', 'packages/ai/AGENTS.md',
    'packages/contracts/AGENTS.md', 'packages/core/src/academics/AGENTS.md',
    'packages/core/src/forecast/AGENTS.md', 'packages/core/src/normalization/AGENTS.md',
    'packages/core/src/notices/AGENTS.md', 'packages/core/src/opportunities/AGENTS.md',
    'packages/core/src/privacy/AGENTS.md', 'packages/fixtures/AGENTS.md',
    'packages/ui/AGENTS.md', 'tests/AGENTS.md'
  ];
  for (const file of paths) {
    const content = read(file);
    assert.match(content, /ISSUE_ASSIGNMENT_PLAYBOOK\.md/, file + ' missing playbook link');
    for (const prefix of canonical) {
      assert.ok(content.includes(prefix), file + ' missing prefix ' + prefix);
    }
  }
});

test('starter docs describe the seven canonical prefixes and protected issues', () => {
  for (const file of ['AGENTS.md', 'README.md', 'docs/ISSUE_ASSIGNMENT_PLAYBOOK.md',
                       'docs/ISSUE_ROUTING_BOT.md']) {
    const content = read(file);
    for (const prefix of canonical) assert.ok(content.includes(prefix), file + ' missing ' + prefix);
    assert.match(content, /355.{0,2}359/, file + ' must mention immutable role tickets');
  }
});

test('all template prefixes map to an issue routing area or manual review', () => {
  const {classify} = require('../../.github/scripts/issue-router.cjs');
  const expected = ['integration', 'data', 'web', 'ai', 'ai', 'integration', null];
  canonical.forEach((prefix, index) => {
    const result = classify({number: 888, title: prefix + ' smoke test', body: '', labels: [], assignees: []});
    assert.equal(result.area, expected[index], prefix);
  });
});
