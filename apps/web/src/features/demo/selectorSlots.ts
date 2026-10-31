import {DemoProfilesResponseSchema, type DemoProfileOption, type SubjectAlias} from '@hufs-one/contracts';

type SharedSection = DemoProfileOption['allowedSections'][number];

export interface SelectorSlot {
  readonly demoSubjectId: SubjectAlias;
  readonly label: string;
  /** PENDING/REVOKED or no shared section: shown as a row but never requested. */
  readonly selectable: boolean;
  readonly dataBadge: string;
  readonly statusText: string;
  readonly ariaLabel: string;
  readonly allowedSections: readonly SharedSection[];
}

export type SelectorSlotsResult =
  | {readonly ok: true; readonly slots: readonly SelectorSlot[]}
  | {readonly ok: false};

const DATA_BADGE: Record<DemoProfileOption['dataMode'], string> = {
  SYNTHETIC: '합성 자료',
  REAL_CONSENTED: '동의된 실제 자료',
  MIXED: '실제+합성 혼합',
};

const STATUS_TEXT: Record<DemoProfileOption['readiness'], string> = {
  READY: '준비됨',
  PARTIAL: '일부만 공유됨',
  PENDING: '자료 준비 중',
  REVOKED: '공유 철회됨',
};

/** Builds exactly five selector rows from the API payload; an invalid payload renders no rows rather than guessed ones. */
export function buildSelectorSlots(payload: unknown): SelectorSlotsResult {
  const parsed = DemoProfilesResponseSchema.safeParse(payload);
  if (!parsed.success) return {ok: false};
  const slots = parsed.data.profiles.map((p): SelectorSlot => {
    const selectable = (p.readiness === 'READY' || p.readiness === 'PARTIAL') && p.allowedSections.length > 0;
    const dataBadge = DATA_BADGE[p.dataMode];
    const statusText = STATUS_TEXT[p.readiness];
    return {
      demoSubjectId: p.demoSubjectId,
      label: p.displayLabel,
      selectable,
      dataBadge,
      statusText,
      ariaLabel: `${p.displayLabel}, ${dataBadge}, ${statusText}${selectable ? '' : ', 선택할 수 없음'}`,
      allowedSections: p.allowedSections,
    };
  });
  return {ok: true, slots};
}
