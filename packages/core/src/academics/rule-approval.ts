import type {z} from 'zod';
import {
  AcademicRulePackVNextSchema,
  MajorRoleVNextSchema,
  stableAcademicRequirementIdsVNext,
  type AcademicClauseVNext,
  type AcademicRulePackVNext,
} from '@hufs-one/contracts';
import {AS_OF, ID, assertId, byCodeUnit} from './ledger.js';

/**
 * RulePack activation gate (A08.6, RULE-EXC-01..RULE-EXC-04).
 * A candidate replaces the active pack only when it is a valid APPROVED pack, is in effect
 * at asOf (effectiveFrom <= asOf < effectiveUntil), carries no blocking warning, and matches an independent inventory of the original document:
 * every clause, every exception attached to the requirement it governs, and every
 * per-role applicability. Otherwise the active pack stays exactly as it was.
 * Numeric exact matches never stand in for clause coverage.
 * This decides activation only. It does not prove the independent inventory is correct.
 * Pure: the caller supplies asOf. No clock, network, storage, or model call.
 */

export type MajorRole = z.infer<typeof MajorRoleVNextSchema>;
type ContractBlockingCode = NonNullable<AcademicRulePackVNext['validationReport']>['blockingIssues'][number]['code'];

export type RulePackGateCode =
  | ContractBlockingCode
  | 'INVALID_PACK'
  | 'NOT_APPROVED'
  | 'NOT_APPROVED_BY_AS_OF'
  | 'NOT_YET_EFFECTIVE'
  | 'EXPIRED'
  | 'VERSION_ALREADY_ACTIVE'
  | 'SUPERSEDE_CHAIN_BROKEN';

export interface RulePackGateIssue {
  code:RulePackGateCode;
  sourceClauseId?:string;
}

/** One clause as an independent reviewer read it from the original document. */
export interface TrustedSourceClause {
  clauseId:string;
  kind:AcademicClauseVNext['kind'];
  sourceSpanRef:string;
  /**
   * Requirements (by stable semanticKey) this clause governs. An EXCEPTION listed here
   * must appear in each such requirement's exceptionClauseIds.
   */
  appliesToSemanticKeys?:readonly string[];
  /**
   * Who the clause covers, as written. A pack for an included role must apply it; a pack
   * for an excluded role must not. A role in neither list is unknown applicability.
   */
  includedMajorRoles?:readonly MajorRole[];
  excludedMajorRoles?:readonly MajorRole[];
}

export interface TrustedSourceInventory {
  sourceDocumentSha256:string;
  clauses:readonly TrustedSourceClause[];
}

export interface RulePackActivationRequest {
  asOf:string;
  /** Pack in force now, or null. It is returned unchanged unless the candidate passes. */
  active:AcademicRulePackVNext|null;
  /** Untrusted until parsed. */
  candidate:unknown;
  trustedOriginal:TrustedSourceInventory;
  /** Optional numeric exact-match result. A full match never overrides another issue. */
  numericCheck?:{matched:number; total:number};
}

export interface RulePackActivationResult {
  decision:'ACTIVATED'|'HELD';
  /** The pack in force after this decision. */
  active:AcademicRulePackVNext|null;
  candidateVersion?:string;
  issues:RulePackGateIssue[];
}

const MAX_CLAUSES = 500;
const SHA256 = /^[a-f0-9]{64}$/;

const BLOCKING_CODES:ReadonlySet<string> = new Set<ContractBlockingCode>([
  'NUMERIC_SOURCE_MISMATCH', 'CLAUSE_MISSING', 'EXCEPTION_SCOPE_CONFLICT',
  'SOURCE_CONTRADICTION', 'PROMPT_INJECTION', 'UNVERIFIED_ORIGINAL',
  'UNKNOWN_APPLICABILITY', 'OTHER',
]);

function record(value:unknown):Record<string, unknown>|undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/**
 * Warnings the candidate itself reports, read before schema parsing so that an invalid
 * candidate still shows why it was held. An unreadable warning is kept as OTHER.
 */
function reportedIssues(candidate:unknown):{version?:string; issues:RulePackGateIssue[]} {
  const body = record(candidate);
  const version = typeof body?.version === 'string' && ID.test(body.version) ? body.version : undefined;
  const list = record(body?.validationReport)?.blockingIssues;
  const issues:RulePackGateIssue[] = [];
  if (Array.isArray(list)) {
    for (const item of list.slice(0, 200)) {
      const row = record(item);
      const code = typeof row?.code === 'string' && BLOCKING_CODES.has(row.code) ? row.code as ContractBlockingCode : 'OTHER';
      const clauseId = row?.sourceClauseId;
      issues.push(typeof clauseId === 'string' && ID.test(clauseId) ? {code, sourceClauseId:clauseId} : {code});
    }
  }
  return version === undefined ? {issues} : {version, issues};
}

function roles(list:readonly MajorRole[]|undefined, label:string):Set<MajorRole> {
  const set = new Set<MajorRole>();
  for (const role of list ?? []) {
    if (!MajorRoleVNextSchema.safeParse(role).success) throw new TypeError(`${label} has no major role`);
    if (set.has(role)) throw new TypeError(`${label} repeats ${role}`);
    set.add(role);
  }
  return set;
}

interface Trusted {
  clause:TrustedSourceClause;
  included:Set<MajorRole>;
  excluded:Set<MajorRole>;
  keys:string[];
}

function readTrusted(original:TrustedSourceInventory):Map<string, Trusted> {
  if (!SHA256.test(original.sourceDocumentSha256)) throw new TypeError('trusted sourceDocumentSha256 must be sha-256 hex');
  if (!Array.isArray(original.clauses) || original.clauses.length === 0 || original.clauses.length > MAX_CLAUSES) {
    throw new RangeError(`trusted inventory needs 1 to ${MAX_CLAUSES} clauses`);
  }
  const byId = new Map<string, Trusted>();
  for (const clause of original.clauses) {
    assertId(clause.clauseId, 'trusted clauseId');
    assertId(clause.sourceSpanRef, `${clause.clauseId} sourceSpanRef`);
    if (byId.has(clause.clauseId)) throw new TypeError(`trusted inventory repeats ${clause.clauseId}`);
    const included = roles(clause.includedMajorRoles, `${clause.clauseId} includedMajorRoles`);
    const excluded = roles(clause.excludedMajorRoles, `${clause.clauseId} excludedMajorRoles`);
    for (const role of included) {
      if (excluded.has(role)) throw new TypeError(`${clause.clauseId} both includes and excludes ${role}`);
    }
    const keys = [...new Set<string>(clause.appliesToSemanticKeys ?? [])];
    if (keys.length !== (clause.appliesToSemanticKeys ?? []).length) {
      throw new TypeError(`${clause.clauseId} repeats a semantic key`);
    }
    for (const key of keys) assertId(key, `${clause.clauseId} semantic key`);
    byId.set(clause.clauseId, {clause, included, excluded, keys});
  }
  return byId;
}

/** RULE-EXC-01: every original clause is inventoried with the same kind and span; nothing is invented. */
function checkInventory(pack:AcademicRulePackVNext, trusted:ReadonlyMap<string, Trusted>, issues:RulePackGateIssue[]):void {
  const supplied = new Map(pack.clauseInventory.map(clause => [clause.clauseId, clause]));
  for (const [clauseId, {clause}] of trusted) {
    const found = supplied.get(clauseId);
    if (!found || found.kind !== clause.kind || found.sourceSpanRef !== clause.sourceSpanRef) {
      issues.push({code:'CLAUSE_MISSING', sourceClauseId:clauseId});
    }
  }
  for (const clauseId of supplied.keys()) {
    if (!trusted.has(clauseId)) issues.push({code:'UNVERIFIED_ORIGINAL', sourceClauseId:clauseId});
  }
}

function suppliedClause(pack:AcademicRulePackVNext, clauseId:string):AcademicClauseVNext|undefined {
  return pack.clauseInventory.find(clause => clause.clauseId === clauseId);
}

/**
 * RULE-EXC-02: a clause for an included role must be applied; one for an excluded role
 * must not be. RULE-EXC-03: an applied exception must sit on every requirement it governs.
 */
function checkApplicability(pack:AcademicRulePackVNext, trusted:ReadonlyMap<string, Trusted>, issues:RulePackGateIssue[]):void {
  const role = pack.scope.majorRole;
  const bySemanticKey = new Map(pack.requirements.map(requirement => [requirement.semanticKey, requirement]));
  for (const [clauseId, {clause, included, excluded, keys}] of trusted) {
    const supplied = suppliedClause(pack, clauseId);
    // A clause the candidate omitted is already CLAUSE_MISSING.
    if (!supplied) continue;
    const roleScoped = included.size > 0 || excluded.size > 0;
    const linked = supplied.coverage.state === 'LINKED';
    if (roleScoped && excluded.has(role)) {
      if (linked) issues.push({code:'EXCEPTION_SCOPE_CONFLICT', sourceClauseId:clauseId});
      continue;
    }
    if (roleScoped && !included.has(role)) {
      issues.push({code:'UNKNOWN_APPLICABILITY', sourceClauseId:clauseId});
      continue;
    }
    if (roleScoped && !linked) {
      issues.push({code:'EXCEPTION_SCOPE_CONFLICT', sourceClauseId:clauseId});
      continue;
    }
    if (clause.kind !== 'EXCEPTION') continue;
    for (const key of keys) {
      const requirement = bySemanticKey.get(key);
      if (!requirement || !requirement.exceptionClauseIds.includes(clauseId)) {
        issues.push({code:'CLAUSE_MISSING', sourceClauseId:clauseId});
        break;
      }
    }
  }
}

function sameScope(a:AcademicRulePackVNext['scope'], b:AcademicRulePackVNext['scope']):boolean {
  return a.campus === b.campus && a.primaryMajor === b.primaryMajor
    && a.secondaryMajor === b.secondaryMajor && a.majorRole === b.majorRole
    && a.admissionType === b.admissionType && a.curriculumVersion === b.curriculumVersion
    && a.cohortFrom === b.cohortFrom && a.cohortTo === b.cohortTo;
}

function finish(
  active:AcademicRulePackVNext|null,
  issues:RulePackGateIssue[],
  candidate?:AcademicRulePackVNext,
  candidateVersion?:string,
):RulePackActivationResult {
  const seen = new Set<string>();
  const unique = issues.filter(issue => {
    const key = `${issue.code}\u0000${issue.sourceClauseId ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => byCodeUnit(a.code, b.code) || byCodeUnit(a.sourceClauseId ?? '', b.sourceClauseId ?? ''));
  const result:RulePackActivationResult = unique.length === 0 && candidate
    ? {decision:'ACTIVATED', active:candidate, issues:[]}
    : {decision:'HELD', active, issues:unique};
  if (candidateVersion !== undefined) result.candidateVersion = candidateVersion;
  return result;
}

/**
 * Decide whether `candidate` may replace `active`. A HELD result returns the same
 * `active` object it was given; nothing is overwritten.
 */
export function decideRulePackActivation(input:RulePackActivationRequest):RulePackActivationResult {
  if (!AS_OF.test(input.asOf) || !Number.isFinite(Date.parse(input.asOf))) {
    throw new TypeError('asOf must be an ISO-8601 datetime with a timezone offset');
  }
  const asOfMs = Date.parse(input.asOf);
  const trusted = readTrusted(input.trustedOriginal);
  const active = input.active;
  if (active !== null && !AcademicRulePackVNextSchema.safeParse(active).success) {
    throw new TypeError('active pack is not a valid rule pack');
  }
  if (active !== null && active.state !== 'APPROVED') throw new TypeError('active pack must be APPROVED');

  const issues:RulePackGateIssue[] = [];
  if (input.numericCheck !== undefined) {
    const {matched, total} = input.numericCheck;
    if (!Number.isSafeInteger(matched) || !Number.isSafeInteger(total) || matched < 0 || total < 0 || matched > total) {
      throw new TypeError('numericCheck must be whole counts with matched <= total');
    }
    if (matched < total) issues.push({code:'NUMERIC_SOURCE_MISMATCH'});
  }

  const reported = reportedIssues(input.candidate);
  const candidateVersion = reported.version;
  issues.push(...reported.issues);

  const parsed = AcademicRulePackVNextSchema.safeParse(input.candidate);
  if (!parsed.success) {
    issues.push({code:'INVALID_PACK'});
    return finish(active, issues, undefined, candidateVersion);
  }
  const pack = parsed.data;
  if (pack.state !== 'APPROVED' || !pack.approvedAt) issues.push({code:'NOT_APPROVED'});
  else if (Date.parse(pack.approvedAt) > asOfMs || Date.parse(pack.sourcePublishedAt) > asOfMs
    || (pack.validationReport && Date.parse(pack.validationReport.checkedAt) > asOfMs)) {
    issues.push({code:'NOT_APPROVED_BY_AS_OF'});
  }
  // Same interval as selectAcademicRulePackAsOfVNext: effectiveFrom <= asOf < effectiveUntil.
  if (Date.parse(pack.effectiveFrom) > asOfMs) issues.push({code:'NOT_YET_EFFECTIVE'});
  if (pack.effectiveUntil !== undefined && Date.parse(pack.effectiveUntil) <= asOfMs) issues.push({code:'EXPIRED'});

  if (pack.sourceDocumentSha256 !== input.trustedOriginal.sourceDocumentSha256) {
    issues.push({code:'UNVERIFIED_ORIGINAL'});
  } else {
    checkInventory(pack, trusted, issues);
    checkApplicability(pack, trusted, issues);
  }

  if (active !== null) {
    if (!sameScope(active.scope, pack.scope)) throw new TypeError('candidate and active packs cover different scopes');
    if (pack.version === active.version) issues.push({code:'VERSION_ALREADY_ACTIVE'});
    else if (!stableAcademicRequirementIdsVNext(active, pack)) issues.push({code:'SUPERSEDE_CHAIN_BROKEN'});
  } else if (pack.supersedesVersion !== undefined) {
    issues.push({code:'SUPERSEDE_CHAIN_BROKEN'});
  }

  return finish(active, issues, pack, pack.version);
}
