/**
 * Standalone, side-effect-free feature engines for #343, #346 and #349.
 * The UI, server, provider transport, rights and real datasets are intentionally
 * NOT wired here; their respective workstreams own integration.
 */
export type TriState = 'MET' | 'NOT_MET' | 'UNKNOWN';
export type SourceState = 'VERIFIED' | 'NEEDS_REVIEW' | 'REVOKED';
export type Fact = {
  value: string | number | boolean;
  provenance: 'VERIFIED' | 'SELF_REPORTED';
};
export type ScholarshipCondition = {
  id: string;
  factKey: string;
  operation: 'NUMBER_GTE' | 'STRING_EQ' | 'ONE_OF' | 'BOOLEAN_EQ';
  expected: number | string | boolean | readonly string[];
  sourceState: SourceState;
};
export type ScholarshipEvaluation = {
  overall: TriState;
  checks: readonly {id: string; status: TriState; reason: string}[];
};

function joinStates(states: readonly TriState[]): TriState {
  if (states.includes('NOT_MET')) return 'NOT_MET';
  if (states.length === 0 || states.includes('UNKNOWN')) return 'UNKNOWN';
  return 'MET';
}

/** Self-reporting can help a student prepare, but cannot certify eligibility. */
export function evaluateScholarship(
  conditions: readonly ScholarshipCondition[],
  facts: Readonly<Record<string, Fact | undefined>>,
): ScholarshipEvaluation {
  const checks = conditions.map(condition => {
    const fact = facts[condition.factKey];
    if (condition.sourceState !== 'VERIFIED') {
      return {id: condition.id, status: 'UNKNOWN' as const, reason: 'UNVERIFIED_RULE'};
    }
    if (!fact) return {id: condition.id, status: 'UNKNOWN' as const, reason: 'MISSING_FACT'};
    if (fact.provenance !== 'VERIFIED') {
      return {id: condition.id, status: 'UNKNOWN' as const, reason: 'SELF_REPORTED_ONLY'};
    }
    let matches: boolean | undefined;
    switch (condition.operation) {
      case 'NUMBER_GTE':
        if (typeof fact.value === 'number' && Number.isFinite(fact.value)
          && typeof condition.expected === 'number' && Number.isFinite(condition.expected)) {
          matches = fact.value >= condition.expected;
        }
        break;
      case 'STRING_EQ':
        if (typeof fact.value === 'string' && typeof condition.expected === 'string') {
          matches = fact.value === condition.expected;
        }
        break;
      case 'BOOLEAN_EQ':
        if (typeof fact.value === 'boolean' && typeof condition.expected === 'boolean') {
          matches = fact.value === condition.expected;
        }
        break;
      case 'ONE_OF':
        if (typeof fact.value === 'string' && Array.isArray(condition.expected)
          && condition.expected.every(value => typeof value === 'string')) {
          matches = (condition.expected as readonly string[]).includes(fact.value);
        }
        break;
    }
    if (matches === undefined) return {id: condition.id, status: 'UNKNOWN' as const, reason: 'INVALID_FACT_OR_RULE'};
    return {id: condition.id, status: (matches ? 'MET' : 'NOT_MET') as TriState, reason: matches ? 'VERIFIED_MATCH' : 'VERIFIED_MISMATCH'};
  });
  return {overall: joinStates(checks.map(c => c.status)), checks};
}

export type RecognitionRule = {
  id: string;
  sourceState: SourceState;
  requiredProofKinds: readonly string[];
};
export type OwnerProof = {
  id: string;
  kind: string;
  activityId: string;
  ownerReviewed: boolean;
};
export type RecognitionChecklist = {
  status: 'READY_FOR_OFFICIAL_REVIEW' | 'DOCUMENTS_PENDING' | 'UNKNOWN_RULE';
  items: readonly {kind: string; state: 'PRESENT_SELF_REPORTED' | 'MISSING' | 'UNKNOWN'}[];
  officialRecognition: false;
};

/** Never implies that the school accepted, verified or awarded the activity. */
export function prepareActivityRecognition(
  activityId: string,
  rule: RecognitionRule,
  proofs: readonly OwnerProof[],
): RecognitionChecklist {
  const items = [...new Set(rule.requiredProofKinds)].map(kind => {
    const state = rule.sourceState !== 'VERIFIED' ? 'UNKNOWN' as const :
      proofs.some(p => p.activityId === activityId && p.kind === kind && p.ownerReviewed)
        ? 'PRESENT_SELF_REPORTED' as const : 'MISSING' as const;
    return {kind, state};
  });
  const status = rule.sourceState !== 'VERIFIED' || items.length === 0
    ? 'UNKNOWN_RULE' as const
    : items.some(i => i.state === 'MISSING') ? 'DOCUMENTS_PENDING' as const
      : 'READY_FOR_OFFICIAL_REVIEW' as const;
  return {status, items, officialRecognition: false};
}

export type BadgeRule = {
  id: string;
  sourceState: SourceState;
  required: readonly {id: string; topicCode: string; minDistinctActivities: number}[];
};
export type BadgeEvidence = {
  activityId: string;
  topicCode: string;
  ownerApproved: boolean;
  sourceState: SourceState;
};
export type BadgePreparation = {
  status: 'READY_TO_CHECK' | 'IN_PROGRESS' | 'UNKNOWN';
  checks: readonly {id: string; confirmedEvidenceCount: number; needed: number; state: 'EVIDENCE_PRESENT' | 'MISSING' | 'UNKNOWN'}[];
  officialIssued: false;
};

/** Distinct, owner-approved evidence is only a preparation signal. */
export function evaluateBadgePreparation(
  rule: BadgeRule,
  evidence: readonly BadgeEvidence[],
): BadgePreparation {
  const checks = rule.required.map(requirement => {
    const ids = new Set(evidence.filter(e => e.topicCode === requirement.topicCode
      && e.ownerApproved && e.sourceState === 'VERIFIED').map(e => e.activityId));
    const needed = Number.isSafeInteger(requirement.minDistinctActivities) && requirement.minDistinctActivities > 0
      ? requirement.minDistinctActivities : 0;
    const state = rule.sourceState !== 'VERIFIED' || !needed
      ? 'UNKNOWN' as const : ids.size >= needed ? 'EVIDENCE_PRESENT' as const : 'MISSING' as const;
    return {id: requirement.id, confirmedEvidenceCount: ids.size, needed, state};
  });
  const status = checks.length === 0 || checks.some(c => c.state === 'UNKNOWN')
    ? 'UNKNOWN' as const : checks.some(c => c.state === 'MISSING')
      ? 'IN_PROGRESS' as const : 'READY_TO_CHECK' as const;
  return {status, checks, officialIssued: false};
}
