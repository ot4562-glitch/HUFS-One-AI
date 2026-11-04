import {OwnerMajorWhatIfResponseSchema} from '@hufs-one/contracts';
import {DEMO_AS_OF} from '../../../../packages/core/src/opportunities/index.js';
import type {WhatIfPort} from '../features/what-if/WhatIfPanel.js';

/**
 * Dev/test-only #82 stand-in for POST /api/academics/major-what-if. There is no real What-if engine yet, so
 * every scenario is BLOCKED_DEPENDENCY, except one hand-shaped SYNTHETIC example for S01 (double major →
 * 가상 통계학) that shows what a READY answer looks like. Its approval receipt is fictitious too. All
 * responses are schema-checked against the owner contract. Never in a production build.
 */
const PROGRAMS = [
  {id: 'SYN-MAJ-STAT', label: '가상 통계학'},
  {id: 'SYN-MAJ-BIZ', label: '가상 경영학'},
] as const;
const ev = (n: string) => `EV-SYN-WI-${n}`;
const VERSIONS = {currentRulePack: 'SYN-RULE-DEMO-1', hypotheticalRulePack: 'SYN-RULE-STAT-1', cohort: 'SYN-COHORT-1',
  overlapPolicy: 'SYN-OVERLAP-1', transcriptProjection: 'SYN-TR-S01-1', core: 'SYN-CORE-1'};

function readyExample(asOf: string) {
  return {
    state: 'READY', asOf, scenario: {action: 'CHANGE_DOUBLE_MAJOR', targetMajorId: 'SYN-MAJ-STAT'},
    current: {asOf, role: 'CURRENT', rulePackVersion: VERSIONS.currentRulePack, earnedCreditUnits: 190, remainingCreditUnits: 70,
      requirements: [
        {requirementId: 'SYN-REQ-TOTAL', state: 'MISSING', missingCreditUnits: 70},
        {requirementId: 'SYN-REQ-MAJOR-CORE', state: 'MISSING', missingCreditUnits: 6},
        {requirementId: 'SYN-DM-MAJOR-MIN', state: 'SATISFIED'},
      ]},
    hypothetical: {asOf, role: 'HYPOTHETICAL', rulePackVersion: VERSIONS.hypotheticalRulePack, earnedCreditUnits: 190, remainingCreditUnits: 94,
      requirements: [
        {requirementId: 'SYN-REQ-TOTAL', state: 'MISSING', missingCreditUnits: 70},
        {requirementId: 'SYN-REQ-MAJOR-CORE', state: 'MISSING', missingCreditUnits: 6},
        {requirementId: 'SYN-STAT-CORE', state: 'MISSING', missingCreditUnits: 24},
        {requirementId: 'SYN-STAT-METHODS', state: 'SATISFIED'},
      ]},
    delta: [
      {requirementId: 'SYN-REQ-TOTAL', change: 'UNCHANGED', evidenceRefs: [ev('1')]},
      {requirementId: 'SYN-REQ-MAJOR-CORE', change: 'UNCHANGED', evidenceRefs: [ev('1')]},
      {requirementId: 'SYN-DM-MAJOR-MIN', change: 'REMOVED_REQUIREMENT', evidenceRefs: [ev('2')]},
      {requirementId: 'SYN-STAT-CORE', change: 'NEW_REQUIREMENT', evidenceRefs: [ev('3')]},
      {requirementId: 'SYN-STAT-METHODS', change: 'ALREADY_SATISFIED', evidenceRefs: [ev('3')]},
    ],
    versions: VERSIONS,
    evidenceLinks: ['1', '2', '3'].map(n => ({evidenceRef: ev(n), href: `https://example.org/synthetic-rule/${n}`, verifiedAt: asOf})),
    approval: {verifiedAt: asOf, coreVersion: VERSIONS.core, cohortApplicabilityVersion: VERSIONS.cohort,
      currentRulePackVersion: VERSIONS.currentRulePack, hypotheticalRulePackVersion: VERSIONS.hypotheticalRulePack,
      overlapPolicyVersion: VERSIONS.overlapPolicy, transcriptProjectionVersion: VERSIONS.transcriptProjection,
      sourceRightsVersion: 'SYN-RIGHTS-1', ownerConsentVersion: 'SYN-CONSENT-1', officialEvidenceRefs: [ev('1'), ev('2'), ev('3')]},
    caveat: 'HYPOTHETICAL_NOT_OFFICIAL',
  };
}

export function syntheticWhatIfPort(options: {delayMs?: number} = {}): WhatIfPort {
  const delay = options.delayMs ?? 150;
  return {
    programs: PROGRAMS,
    synthetic: true,
    async check(ctx, scenario, signal) {
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        const t = setTimeout(resolve, delay);
        signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, {once: true});
      });
      const asOf = DEMO_AS_OF; // the synthetic corpus pins every snapshot here
      const example = ctx.demoSubjectId === 'S01' && scenario.action === 'CHANGE_DOUBLE_MAJOR' && scenario.targetMajorId === 'SYN-MAJ-STAT';
      return OwnerMajorWhatIfResponseSchema.parse(example ? readyExample(asOf) : {
        state: 'BLOCKED_DEPENDENCY', asOf, scenario,
        blockers: 'targetMajorId' in scenario && scenario.targetMajorId === 'SYN-MAJ-BIZ'
          ? ['RULEPACK_NOT_APPROVED', 'DUPLICATE_RECOGNITION_UNVERIFIED'] : ['CALCULATION_CORE_UNAVAILABLE'],
        caveat: 'HYPOTHETICAL_NOT_OFFICIAL',
      });
    },
  };
}
