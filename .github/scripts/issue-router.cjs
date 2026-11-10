'use strict';

const settings = require('../issue-routing.json');
const AREA_KEYS = Object.keys(settings.areas);
const AREA_LABELS = AREA_KEYS.map(area => 'area:' + area);
const LABELS = {
  'area:integration': ['1f6feb', 'Core, API, security, CI and integration'],
  'area:ai': ['8250df', 'AI, OCR, RAG, ranking and AI QA'],
  'area:web': ['0e8a16', 'React, UI, UX and web integration'],
  'area:data': ['fbca04', 'Official sources, rights, posters and human Gold'],
  'priority:P0': ['8b0000', 'Emergency priority: human triage required'],
  'priority:P1': ['b60205', 'High priority'],
  'priority:P2': ['d93f0b', 'Medium priority'],
  'priority:P3': ['c2e0c6', 'Low priority'],
  'triage:needs-review': ['f9d0c4', 'Routing unclear or cannot assign; human review needed'],
  'routing:hold': ['ffffff', 'Human override: do not auto-assign this issue'],
  'type:bug': ['d73a4a', 'Reproducible defect requiring investigation'],
  'type:acceptance': ['0e8a16', 'Human and real-environment acceptance gate'],
  'type:data-correction': ['fbca04', 'Correction of an already-collected official data record'],
  'type:security': ['b60205', 'Security or privacy report: manual triage'],
  'source:code-audit': ['bfd4f2', 'Discovered during code audit']
};

const hasPrefix = (title, values) => values.some(value => title.startsWith(value));
const matchingPrefix = title => settings.prefixes.find(entry =>
  [entry.title, ...(entry.aliases || [])].some(prefix => title.startsWith(prefix)));
const frozenTitle = title => /^\[(?:\ubcf8\uc120\s*\uc9c4\ucd9c\s*\uc774\ud6c4|\ubcf8\uc120\uc9c4\ucd9c\uc774\ud6c4)\]/.test(title);
const getNames = item => (item.labels || []).map(label => typeof label === 'string' ? label : label.name);
const isProtected = issue => settings.protectedIssueNumbers.includes(issue.number) || frozenTitle(issue.title || '');

// P0 and potentially sensitive reports must not be silently assigned.
// This is a routing gate, not an automated vulnerability severity assessment.
function isSensitiveIssue(issue) {
  const title = String(issue.title || '').trim();
  const labels = new Set(getNames(issue));
  return labels.has('type:security') ||
    /\b(?:security|privacy|cve|credential|secret|vulnerability|pii|data\s+leak)\b|\ubcf4\uc548|\uac1c\uc778\uc815\ubcf4|\ucde8\uc57d\uc810|\uc778\uc99d\s*\uc6b0\ud68c|\ube44\ubc00\ud0a4|\uc790\ub8cc\s*\uc720\ucd9c|\uad8c\ud55c\s*(?:\ub204\ucd9c|\ub178\ucd9c)/i.test(title);
}
function humanGateReason(issue) {
  const title = String(issue.title || '').trim();
  const labels = new Set(getNames(issue));
  if (/\bP0\b/i.test(title) || labels.has('priority:P0')) return 'P0 needs a human incident owner';
  if (isSensitiveIssue(issue)) return 'Possible security or privacy issue: human/private review required';
  return null;
}

function classify(issue) {
  const title = String(issue.title || '').trim();
  const present = new Set(getNames(issue));
  const explicit = AREA_LABELS.filter(label => present.has(label)).map(label => label.slice(5));
  const prefix = matchingPrefix(title);
  if (prefix?.policy === 'review') {
    return {area: null, reason: 'Human review requested by ' + prefix.title};
  }
  if (explicit.length > 1) return {area: null, reason: 'Conflicting area labels'};
  // Canonical prefix wins over text/path heuristics, but not conflicting
  // explicit area labels. A conflict must be resolved by a human.
  if (prefix?.area) {
    if (explicit.length === 1 && explicit[0] !== prefix.area) {
      return {area: null, reason: 'Prefix conflicts with explicit area label'};
    }
    return {area: prefix.area, reason: 'Canonical issue title prefix'};
  }
  // [버그] is intentionally not tied to a role. A single explicit label,
  // strong title signal, or a single code path must be present.
  if (explicit.length === 1) return {area: explicit[0], reason: 'Explicit area label'};

  const signals = [];
  if (/\b(ai|ocr|rag|llm|hcx|nlp|bm25|tf-idf|embedding|recommendation)\b|\ucd94\ucc9c|\ub7ad\ud0b9|\uc608\uce21/i.test(title)) signals.push('ai');
  if (/\b(ui|ux|react|frontend|css|vite)\b|\ud504\ub860\ud2b8|\ub514\uc790\uc778|\uc6f9\s*\ud654\uba74/i.test(title)) signals.push('web');
  if (/\b(api|backend|postgres|infra|ncp|csrf|oauth|security|ci\/cd)\b|\ubcf4\uc548|\ubc31\uc5d4\ub4dc|\uc11c\ubc84|\ubc30\ud3ec/i.test(title)) signals.push('integration');
  if (signals.length === 1) return {area: signals[0], reason: 'Single strong title signal'};
  if (signals.length > 1) return {area: null, reason: 'Multiple disciplines in title'};

  const body = String(issue.body || '').slice(0, 40000);
  const paths = [];
  if (/\bpackages\/ai\//i.test(body)) paths.push('ai');
  if (/\bapps\/web\//i.test(body)) paths.push('web');
  if (/\b(?:apps\/api\/|infra\/|packages\/contracts\/)/i.test(body)) paths.push('integration');
  if (paths.length === 1) return {area: paths[0], reason: 'Single implementation path'};
  return {area: null, reason: 'Unclear or cross-functional; manual triage required'};
}

function chooseAssignee(area, openIssues, ownNumber) {
  const candidates = settings.areas[area].members;
  const loads = new Map(candidates.map(member => [member.login, {count: 0, capacity: member.capacity}]));
  for (const issue of openIssues) {
    if (issue.number === ownNumber || issue.pull_request || isProtected(issue)) continue;
    for (const user of issue.assignees || []) {
      const entry = loads.get(user.login);
      if (entry) entry.count += 1;
    }
  }
  return [...candidates].sort((a, b) => {
    const x = loads.get(a.login), y = loads.get(b.login);
    return x.count / x.capacity - y.count / y.capacity || a.login.localeCompare(b.login);
  })[0]?.login || null;
}

async function applyLabels({github, core, owner, repo, number, current, add, remove, dryRun}) {
  const missing = [...new Set(add)].filter(label => !current.has(label));
  const obsolete = [...new Set(remove)].filter(label => current.has(label));
  core.info('Labels +' + JSON.stringify(missing) + ' -' + JSON.stringify(obsolete) + ' (dryRun=' + dryRun + ')');
  if (dryRun) return;
  for (const label of missing) {
    const [color, description] = LABELS[label] || ['ededed', 'HUFS One AI issue routing'];
    try {
      await github.rest.issues.getLabel({owner, repo, name: label});
    } catch (error) {
      if (error.status !== 404) throw error;
      try {
        await github.rest.issues.createLabel({owner, repo, name: label, color, description});
      } catch (createdError) {
        if (createdError.status !== 422) throw createdError; // Concurrent creation
      }
    }
  }
  if (missing.length) {
    await github.rest.issues.addLabels({owner, repo, issue_number: number, labels: missing});
    for (const label of missing) current.add(label);
  }
  for (const label of obsolete) {
    try {
      await github.rest.issues.removeLabel({owner, repo, issue_number: number, name: label});
      current.delete(label);
    } catch (error) {
      if (error.status !== 404) throw error;
      current.delete(label);
    }
  }
}

async function routeIssue({github, context, core, issue, dryRun = false}) {
  const eventIssue = issue || context.payload.issue;
  if (!eventIssue || !eventIssue.number || eventIssue.pull_request) return {status: 'skipped'};

  const {owner, repo} = context.repo;
  // Webhook events can wait in the Actions queue while a human edits this issue.
  // Always use the current GitHub issue, not an opened/edited/labeled payload.
  const ticket = (await github.rest.issues.get({
    owner, repo, issue_number: eventIssue.number
  })).data;
  if (!ticket || ticket.number !== eventIssue.number || ticket.pull_request)
    return {status: 'skipped'};
  if (ticket.state && ticket.state !== 'open') return {status: 'closed'};
  if (isProtected(ticket)) {
    core.info('Immutable role issue #' + ticket.number + ': no writes.');
    return {status: 'protected'};
  }

  const current = new Set(getNames(ticket));
  const title = String(ticket.title || '').trim();
  const prefix = matchingPrefix(title);
  const decision = classify(ticket);
  const gate = humanGateReason(ticket);
  const add = [], remove = [];
  const priority = title.match(/\bP([0123])\b/i)?.[1];
  if (priority !== undefined && ![...current].some(label => /^priority:P[0123]$/.test(label))) {
    add.push('priority:P' + priority);
  }
  // Remove obsolete effort labels on normal routing events; never create new ones.
  remove.push(...[...current].filter(label => label.startsWith('effort:')));
  if (prefix?.typeLabel) add.push(prefix.typeLabel);
  if (title.includes('[\ucf54\ub4dc \uc804\uc218\uc870\uc0ac]')) add.push('source:code-audit');
  if (title.startsWith('[\ub370\uc774\ud130 \uc694\uccad][\uc815\uc815]')) add.push('type:data-correction');
  if (isSensitiveIssue(ticket)) add.push('type:security');

  if (decision.area) add.push('area:' + decision.area);
  if (!decision.area || gate) add.push('triage:needs-review');
  else remove.push('triage:needs-review');

  await applyLabels({github, core, owner, repo, number: ticket.number, current, add, remove, dryRun});
  if (gate) return {status: 'needs-review', reason: gate};
  if (!decision.area) return {status: 'needs-review', reason: decision.reason};
  if (current.has('routing:hold')) return {status: 'held', area: decision.area};
  if ((ticket.assignees || []).length) return {status: 'preserved', area: decision.area};

  const pool = settings.areas[decision.area]?.members || [];
  if (!pool.length) return {status: 'needs-review', reason: 'No eligible users for this area'};
  const openIssues = pool.length > 1
    ? await github.paginate(github.rest.issues.listForRepo, {owner, repo, state: 'open', per_page: 100})
    : [];
  // Dedicated owner (AI QA) comes from the same prefix configuration as
  // the documentation contract; other AI implementation is load-balanced.
  const assignee = prefix?.policy === 'dedicated'
    ? prefix.assignee
    : chooseAssignee(decision.area, openIssues, ticket.number);
  if (!assignee) return {status: 'needs-review', reason: 'No candidate'};
  core.info('Issue #' + ticket.number + ': ' + decision.area + ', chosen ' + assignee + ' (' + decision.reason + '), dryRun=' + dryRun);
  if (dryRun) return {status: 'dry-run', area: decision.area, assignee};

  // A human may have assigned, held, closed or reprioritized the issue while
  // this run was creating labels or calculating the weighted backlog. Refresh
  // immediately before the non-atomic GitHub addAssignees API write.
  const latest = (await github.rest.issues.get({
    owner, repo, issue_number: ticket.number
  })).data;
  if (!latest || latest.number !== ticket.number || latest.pull_request)
    return {status: 'skipped'};
  if (latest.state && latest.state !== 'open') return {status: 'closed'};
  if (isProtected(latest)) return {status: 'protected'};
  const latestLabels = new Set(getNames(latest));
  if (latestLabels.has('routing:hold')) return {status: 'held', area: decision.area};
  if ((latest.assignees || []).length) return {status: 'preserved', area: decision.area};
  const latestGate = humanGateReason(latest);
  const latestDecision = classify(latest);
  if (latestGate || latestDecision.area !== decision.area || latest.title !== ticket.title) {
    await applyLabels({github, core, owner, repo, number: ticket.number,
      current: latestLabels, add: ['triage:needs-review'], remove: [], dryRun: false});
    return {status: 'needs-review',
      reason: latestGate || 'Issue changed during routing; retry after human review'};
  }

  try {
    await github.rest.issues.addAssignees({owner, repo, issue_number: ticket.number, assignees: [assignee]});
    return {status: 'assigned', area: decision.area, assignee};
  } catch (error) {
    if (![403, 404, 422].includes(error.status)) throw error;
    core.warning('Cannot assign ' + assignee + ' to issue #' + ticket.number + ': HTTP ' + error.status);
    await applyLabels({github, core, owner, repo, number: ticket.number, current,
      add: ['triage:needs-review'], remove: [], dryRun: false});
    return {status: 'needs-review', reason: 'Cannot assign ' + assignee};
  }
}

module.exports = {classify, chooseAssignee, isProtected, humanGateReason, isSensitiveIssue, routeIssue};
