'use strict';

const settings = require('../issue-routing.json');
const AREA_KEYS = Object.keys(settings.areas);
const AREA_LABELS = AREA_KEYS.map(area => 'area:' + area);
const EFFORT_LABELS = Object.keys(settings.effortPoints).map(size => 'effort:' + size);
const LABELS = {
  'area:integration': ['1f6feb', 'Core, API, security, CI and integration'],
  'area:ai': ['8250df', 'AI, OCR, RAG, ranking and AI QA'],
  'area:web': ['0e8a16', 'React, UI, UX and web integration'],
  'area:data': ['fbca04', 'Official sources, rights, posters and human Gold'],
  'priority:P1': ['b60205', 'High priority'],
  'priority:P2': ['d93f0b', 'Medium priority'],
  'priority:P3': ['c2e0c6', 'Low priority'],
  'effort:S': ['d4c5f9', 'Estimated workload: 1 point'],
  'effort:M': ['d4c5f9', 'Estimated workload: 3 points'],
  'effort:L': ['d4c5f9', 'Estimated workload: 8 points'],
  'effort:unestimated': ['ededed', 'Needs a human workload estimate; counts as M until estimated'],
  'triage:needs-review': ['f9d0c4', 'Routing unclear or cannot assign; human review needed'],
  'routing:hold': ['ffffff', 'Human override: do not auto-assign this issue']
};

const hasPrefix = (title, values) => values.some(value => title.startsWith(value));
const frozenTitle = title => /^\[(?:\ubcf8\uc120\s*\uc9c4\ucd9c\s*\uc774\ud6c4|\ubcf8\uc120\uc9c4\ucd9c\uc774\ud6c4)\]/.test(title);
const featureTitle = title => /^\[(?:\ucd94\uac00\s*\uae30\ub2a5)\]/.test(title);
const getNames = item => (item.labels || []).map(label => typeof label === 'string' ? label : label.name);
const isProtected = issue => settings.protectedIssueNumbers.includes(issue.number) || frozenTitle(issue.title || '');

function classify(issue) {
  const title = String(issue.title || '').trim();
  if (hasPrefix(title, ['[\ubd84\ub958 \uac80\ud1a0]'])) {
    return {area: null, reason: 'Manual triage explicitly requested'};
  }
  const present = new Set(getNames(issue));
  const explicit = AREA_LABELS.filter(label => present.has(label)).map(label => label.slice(5));
  if (explicit.length > 1) return {area: null, reason: 'Conflicting area labels'};
  // Explicit issue prefixes are stronger than prose/paths. If a human area
  // label conflicts with the prefix, request review instead of misrouting.
  const prefixed = featureTitle(title) ? 'integration'
    : hasPrefix(title, ['[\ub370\uc774\ud130 \uc694\uccad]']) ? 'data'
    : hasPrefix(title, ['[\uc6f9 \uad6c\ud604]']) ? 'web'
    : hasPrefix(title, ['[AI \uad6c\ud604]', '[AI QA]']) ? 'ai'
    : hasPrefix(title, ['[\uae30\uc220 \ud1b5\ud569]']) ? 'integration'
    : null;
  if (prefixed && explicit.length === 1 && explicit[0] !== prefixed) {
    return {area: null, reason: 'Prefix conflicts with explicit area label'};
  }
  if (prefixed) return {area: prefixed, reason: 'Canonical issue title prefix'};
  if (explicit.length === 1) return {area: explicit[0], reason: 'Explicit area label'};

  // Use strong *title* signals before reading paths. Broad prose is often
  // cross-functional, so its keywords must not silently decide the owner.
  const signals = [];
  if (/\b(ai|ocr|rag|llm|hcx|nlp|bm25|tf-idf|embedding|recommendation)\b|\ucd94\ucc9c|\ub7ad\ud0b9|\uc608\uce21/i.test(title)) signals.push('ai');
  if (/\b(ui|ux|react|frontend|css|vite)\b|\ud504\ub860\ud2b8|\ub514\uc790\uc778|\uc6f9\s*\ud654\uba74/i.test(title)) signals.push('web');
  if (/\b(api|backend|postgres|infra|ncp|csrf|oauth|security|ci\/cd)\b|\ubcf4\uc548|\ubc31\uc5d4\ub4dc|\uc11c\ubc84|\ubc30\ud3ec/i.test(title)) signals.push('integration');
  if (signals.length === 1) return {area: signals[0], reason: 'Single strong title signal'};
  if (signals.length > 1) return {area: null, reason: 'Multiple disciplines in title'};

  // Source code paths can be used only when they identify exactly one area.
  const body = String(issue.body || '').slice(0, 40000);
  const paths = [];
  if (/\bpackages\/ai\//i.test(body)) paths.push('ai');
  if (/\bapps\/web\//i.test(body)) paths.push('web');
  if (/\b(?:apps\/api\/|infra\/|packages\/contracts\/)/i.test(body)) paths.push('integration');
  if (paths.length === 1) return {area: paths[0], reason: 'Single implementation path'};
  return {area: null, reason: 'Unclear or cross-functional; manual triage required'};
}

function effortPoints(issue) {
  const labels = new Set(getNames(issue));
  for (const [size, points] of Object.entries(settings.effortPoints)) {
    if (labels.has('effort:' + size)) return points;
  }
  return settings.defaultEffortPoints;
}

function chooseAssignee(area, openIssues, ownNumber) {
  const candidates = settings.areas[area].members;
  const loads = new Map(candidates.map(member => [member.login, {points: 0, count: 0, capacity: member.capacity}]));
  for (const issue of openIssues) {
    if (issue.number === ownNumber || issue.pull_request || isProtected(issue)) continue;
    const points = effortPoints(issue);
    for (const user of issue.assignees || []) {
      const entry = loads.get(user.login);
      if (entry) { entry.points += points; entry.count += 1; }
    }
  }
  return [...candidates].sort((a, b) => {
    const x = loads.get(a.login), y = loads.get(b.login);
    return x.points / x.capacity - y.points / y.capacity || x.count - y.count || a.login.localeCompare(b.login);
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
  const ticket = issue || context.payload.issue;
  if (!ticket || !ticket.number || ticket.pull_request) return {status: 'skipped'};
  if (isProtected(ticket)) {
    core.info('Immutable role issue #' + ticket.number + ': no writes.');
    return {status: 'protected'};
  }

  const {owner, repo} = context.repo;
  const current = new Set(getNames(ticket));
  const decision = classify(ticket);
  const add = [], remove = [];
  const priority = String(ticket.title || '').match(/\bP([123])\b/i)?.[1];
  if (priority && ![...current].some(label => /^priority:P[123]$/.test(label))) add.push('priority:P' + priority);
  if (![...current].some(label => EFFORT_LABELS.includes(label))) add.push('effort:unestimated');
  else remove.push('effort:unestimated');
  if (decision.area) {
    add.push('area:' + decision.area);
    remove.push('triage:needs-review');
  } else add.push('triage:needs-review');

  await applyLabels({github, core, owner, repo, number: ticket.number, current, add, remove, dryRun});
  if (!decision.area) return {status: 'needs-review', reason: decision.reason};
  if (current.has('routing:hold')) return {status: 'held', area: decision.area};
  if ((ticket.assignees || []).length) return {status: 'preserved', area: decision.area};

  const pool = settings.areas[decision.area]?.members || [];
  if (!pool.length) return {status: 'needs-review', reason: 'No eligible users for this area'};
  const openIssues = pool.length > 1
    ? await github.paginate(github.rest.issues.listForRepo, {owner, repo, state: 'open', per_page: 100})
    : [];
  // AI technical QA is the dedicated responsibility of taewangim-alt.
  // General AI implementation is load-balanced between both AI developers.
  const assignee = hasPrefix(String(ticket.title || '').trim(), ['[AI QA]'])
    ? 'taewangim-alt'
    : chooseAssignee(decision.area, openIssues, ticket.number);
  if (!assignee) return {status: 'needs-review', reason: 'No candidate'};
  core.info('Issue #' + ticket.number + ': ' + decision.area + ', chosen ' + assignee + ' (' + decision.reason + '), dryRun=' + dryRun);
  if (dryRun) return {status: 'dry-run', area: decision.area, assignee};
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

module.exports = {classify, effortPoints, chooseAssignee, isProtected, routeIssue};
