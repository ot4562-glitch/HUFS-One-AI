import {TOPIC_ALIASES_V1, TOPIC_CODES, TOPIC_DICTIONARY_VERSION, TopicCodeSchema, type TopicCode} from '@hufs-one/contracts';

// A04.1: broad Forms choices become CANDIDATES that the student must confirm; they never
// count as a confirmed interest on their own. Shared explicit aliases stay in contracts.
export const BROAD_CHOICE_CANDIDATES_V1 = {
  '경제/금융': ['ECONOMIC_RESEARCH', 'FINANCE_INVESTMENT'],
} as const satisfies Record<string, readonly TopicCode[]>;
export const TOPIC_NORMALIZER_VERSION = `${TOPIC_DICTIONARY_VERSION}+broad-v1`;

export type TopicTermResult =
  | {status:'MATCHED'; raw:string; code:TopicCode; via:'CODE'|'ALIAS'}
  | {status:'CANDIDATES'; raw:string; codes:TopicCode[]; needsConfirmation:true}
  | {status:'UNKNOWN'; raw:string};

/** NFC + trim + whitespace removal. Keeps the text otherwise unchanged (no fuzzy guessing). */
export function canonicalTerm(raw:string):string {
  return raw.normalize('NFC').replace(/\s+/gu, '');
}

const aliasByKey = new Map<string, TopicCode>(
  Object.entries(TOPIC_ALIASES_V1).map(([k, v]) => [canonicalTerm(k), v]));
const broadByKey = new Map<string, readonly TopicCode[]>(
  Object.entries(BROAD_CHOICE_CANDIDATES_V1).map(([k, v]) => [canonicalTerm(k), v]));

/** Exact code or explicit alias only. '기타'/free text/unlisted wording stays UNKNOWN. */
export function normalizeTopicTerm(raw:string):TopicTermResult {
  const key = canonicalTerm(raw);
  if (key === '') return {status:'UNKNOWN', raw};
  const code = TopicCodeSchema.safeParse(key.toUpperCase());
  if (code.success) return {status:'MATCHED', raw, code:code.data, via:'CODE'};
  const alias = aliasByKey.get(key);
  if (alias) return {status:'MATCHED', raw, code:alias, via:'ALIAS'};
  const broad = broadByKey.get(key);
  if (broad) return {status:'CANDIDATES', raw, codes:[...broad], needsConfirmation:true};
  return {status:'UNKNOWN', raw};
}

export interface TopicListResult {
  /** Confirmed codes in first-seen order, deduplicated, at most `max`. */
  topics:TopicCode[];
  /** Codes that need student confirmation before use (never used for ranking). */
  candidates:TopicCode[];
  unknown:string[];
  /** Confirmed codes beyond `max`; reported, never silently dropped. */
  overflow:TopicCode[];
}

/** A04.1 limits: interests 5, desired jobs 3, opportunity topics 5. */
export function normalizeTopicTerms(terms:readonly string[], max:number):TopicListResult {
  const confirmed:TopicCode[] = [];
  const candidates:TopicCode[] = [];
  const unknown:string[] = [];
  for (const term of terms) {
    const r = normalizeTopicTerm(term);
    if (r.status === 'MATCHED') { if (!confirmed.includes(r.code)) confirmed.push(r.code); }
    else if (r.status === 'CANDIDATES') { for (const c of r.codes) if (!candidates.includes(c)) candidates.push(c); }
    else unknown.push(r.raw);
  }
  return {
    topics:confirmed.slice(0, max),
    candidates:candidates.filter(c => !confirmed.includes(c)),
    unknown,
    overflow:confirmed.slice(max),
  };
}

/** Drops anything outside the closed 24-code enum (defensive for untyped API/AI input). */
export function onlyKnownTopics(values:readonly unknown[]):TopicCode[] {
  const out:TopicCode[] = [];
  for (const v of values) if ((TOPIC_CODES as readonly unknown[]).includes(v) && !out.includes(v as TopicCode)) out.push(v as TopicCode);
  return out;
}
