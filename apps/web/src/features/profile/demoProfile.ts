import {z} from 'zod';
import {InterestTopicsSchema, type TopicCode} from '@hufs-one/contracts';

/**
 * #132 blank demo account profile — UI-side PROPOSAL until the integration owner adds the shared
 * contract (the merged SelfProfileValueSchema has no major / credits / double-major fields).
 * Every field starts unset (null / empty); "not entered" is never the same as 0 or "없음".
 * Credits are earned credits only (not GPA, not a transcript), stored as units: 1 unit = 0.5 credit,
 * like contracts CreditUnitsSchema.
 */
const MAX_CREDIT_UNITS = 500; // 250 credits
const Major = z.string().trim().min(1).max(40);
export const DoubleMajorSchema = z.discriminatedUnion('kind', [
  z.strictObject({kind: z.literal('NONE')}),
  z.strictObject({kind: z.literal('DOUBLE'), major: Major}),
]);
export const DemoProfileValueSchema = z.strictObject({
  primaryMajor: Major.nullable(),
  earnedCreditUnits: z.number().int().min(0).max(MAX_CREDIT_UNITS).nullable(),
  interestTopics: InterestTopicsSchema,
  doubleMajor: DoubleMajorSchema.nullable(),
});
export type DemoProfileValue = z.infer<typeof DemoProfileValueSchema>;
export const DemoProfileRecordSchema = z.strictObject({
  version: z.number().int().min(1),
  value: DemoProfileValueSchema,
  updatedAt: z.iso.datetime({offset: true}),
});
export type DemoProfileRecord = z.infer<typeof DemoProfileRecordSchema>;


export const BLANK_PROFILE: DemoProfileValue = {primaryMajor: null, earnedCreditUnits: null, interestTopics: [], doubleMajor: null};

/** Server port for the separate blank demo account (never S01–S05, a REVIEWER context or a team member). */
export interface DemoProfilePort {
  get(signal: AbortSignal): Promise<unknown>;
  /** Compare-and-set: rejects with VERSION_CONFLICT (409) if another tab saved first. */
  save(expectedVersion: number, value: DemoProfileValue, signal: AbortSignal): Promise<unknown>;
  /** Clears this demo account only (profile and its derived demo state), back to BLANK_PROFILE. */
  reset(expectedVersion: number, signal: AbortSignal): Promise<unknown>;
}

export function isBlank(v: DemoProfileValue): boolean {
  return v.primaryMajor === null && v.earnedCreditUnits === null && v.interestTopics.length === 0 && v.doubleMajor === null;
}

/** Fields the personalisation still lacks; shown as "설정 필요" instead of guessing. */
export function missingFields(v: DemoProfileValue): string[] {
  return [
    v.primaryMajor === null ? '주전공' : null,
    v.earnedCreditUnits === null ? '취득 학점' : null,
    v.interestTopics.length === 0 ? '관심 분야' : null,
    v.doubleMajor === null ? '이중전공 여부' : null,
  ].filter((x): x is string => x !== null);
}

/** Raw form input (strings as typed). */
export interface ProfileDraft {
  readonly primaryMajor: string;
  readonly credits: string;
  readonly interestTopics: readonly TopicCode[];
  readonly doubleMajorKind: '' | 'NONE' | 'DOUBLE';
  readonly doubleMajor: string;
}

export function draftOf(v: DemoProfileValue): ProfileDraft {
  return {
    primaryMajor: v.primaryMajor ?? '',
    credits: v.earnedCreditUnits === null ? '' : String(v.earnedCreditUnits / 2),
    interestTopics: v.interestTopics,
    doubleMajorKind: v.doubleMajor === null ? '' : v.doubleMajor.kind,
    doubleMajor: v.doubleMajor?.kind === 'DOUBLE' ? v.doubleMajor.major : '',
  };
}

export type FieldErrors = Partial<Record<'primaryMajor' | 'credits' | 'interestTopics' | 'doubleMajorKind' | 'doubleMajor', string>>;

/** All four inputs are required to save (#132 §2); empty credits ≠ 0. */
export function validateDraft(d: ProfileDraft): {ok: true; value: DemoProfileValue} | {ok: false; errors: FieldErrors} {
  const errors: FieldErrors = {};
  const major = d.primaryMajor.trim();
  if (!major) errors.primaryMajor = '주전공을 입력해 주세요.';
  else if (major.length > 40) errors.primaryMajor = '40자 이내로 입력해 주세요.';
  const raw = d.credits.trim();
  let units: number | null = null;
  if (raw === '') errors.credits = '취득 학점을 입력해 주세요. 없으면 0을 입력합니다.';
  else if (!/^\d{1,3}(\.\d+)?$/.test(raw)) errors.credits = '0 이상의 숫자로 입력해 주세요.';
  else {
    const n = Number(raw);
    if (n * 2 !== Math.round(n * 2)) errors.credits = '0.5학점 단위로 입력해 주세요.';
    else if (n > 250) errors.credits = '250학점 이하로 입력해 주세요.';
    else units = n * 2;
  }
  if (d.interestTopics.length === 0) errors.interestTopics = '관심 분야를 1개 이상 골라 주세요.';
  else if (d.interestTopics.length > 5) errors.interestTopics = '관심 분야는 최대 5개입니다.';
  if (d.doubleMajorKind === '') errors.doubleMajorKind = '이중전공 여부를 골라 주세요.';
  const dm = d.doubleMajor.trim();
  if (d.doubleMajorKind === 'DOUBLE' && !dm) errors.doubleMajor = '이중전공 학과를 입력해 주세요.';
  else if (d.doubleMajorKind === 'DOUBLE' && dm.length > 40) errors.doubleMajor = '40자 이내로 입력해 주세요.';
  if (Object.keys(errors).length) return {ok: false, errors};
  return {ok: true, value: {
    primaryMajor: major,
    earnedCreditUnits: units,
    interestTopics: [...d.interestTopics],
    doubleMajor: d.doubleMajorKind === 'DOUBLE' ? {kind: 'DOUBLE', major: dm} : {kind: 'NONE'},
  }};
}
