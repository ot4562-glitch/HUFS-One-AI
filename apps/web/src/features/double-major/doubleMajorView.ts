import {AcademicAuditVNextSchema, type AcademicAuditVNext} from '@hufs-one/contracts';
import {NOT_OFFICIAL_GRADUATION_TEXT, creditsText} from '../graduation/graduationView.js';

/**
 * #144 졸업 화면의 "주전공 + 지금 선택한 이중전공" 모델. Not the #82 what-if: it shows only the major the
 * student actually chose. Figures come from the academics core (buildDoubleMajorAudit, #147) as-is; the UI
 * never adds credits, decides a row or settles whether a shared course may count twice.
 *
 * Wire: the merged core DoubleMajorAudit shape. The owner HTTP projection (#150, draft) will replace the
 * light structural check below with its own schema.
 */
type RowState = AcademicAuditVNext['requirements'][number]['state'];
type OverlapStatus = 'NONE' | 'NO_APPROVED_RULE' | 'COVERED_BY_APPROVED_RULE' | 'OVER_APPROVED_LIMIT';

export interface MajorRowView {
  readonly id: string;
  /** Text + icon; never colour alone. */
  readonly badge: {readonly text: string; readonly icon: string};
  readonly creditsText: string | null;
  /** Set when the row depends on a shared course the rules do not settle. */
  readonly heldText: string | null;
  readonly ariaLabel: string;
}

export interface MajorColumnView {
  readonly role: '주전공' | '이중전공';
  readonly stateText: string;
  readonly rulePackText: string;
  readonly rows: readonly MajorRowView[];
}

export interface DoubleMajorView {
  readonly selectionText: string;
  readonly notOfficialText: string;
  /** One transcript: each course counted once, whichever majors use it. */
  readonly uniqueCredits: readonly {readonly label: string; readonly credits: string}[];
  readonly primary: MajorColumnView;
  /** Null when there is no double-major column to show; doubleMajorNote says why. */
  readonly doubleMajor: MajorColumnView | null;
  readonly doubleMajorNote: string | null;
  readonly overlapText: string | null;
}

export type DoubleMajorViewResult = {readonly ok: true; readonly view: DoubleMajorView} | {readonly ok: false};

const AUDIT_STATE = {READY: '규칙 적용 결과', NEEDS_REVIEW: '검토가 필요한 결과', INSUFFICIENT_DATA: '자료가 부족해 판단할 수 없음'} as const;
const ROW_BADGE: Record<RowState, MajorRowView['badge']> = {
  SATISFIED: {text: '충족', icon: '✓'},
  UNSATISFIED: {text: '미충족', icon: '○'},
  NEEDS_REVIEW: {text: '확인 필요', icon: '?'},
  NOT_APPLICABLE: {text: '해당 없음', icon: '–'},
  NOT_CHECKED: {text: '확인 안 함', icon: '…'},
};
// What the student must act on first, then what is still open, then what is done.
const ROW_RANK: Record<RowState, number> = {UNSATISFIED: 0, NEEDS_REVIEW: 1, NOT_CHECKED: 2, SATISFIED: 3, NOT_APPLICABLE: 4};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isUnits = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');

interface Impact { requirementId: string; decided: boolean; remainingCreditUnitsWithoutShared?: number }

function column(role: MajorColumnView['role'], audit: AcademicAuditVNext, held: ReadonlySet<string>, impacts: readonly Impact[]): MajorColumnView {
  const rows = [...audit.requirements].sort((a, b) => ROW_RANK[a.state] - ROW_RANK[b.state]).map(r => {
    const badge = ROW_BADGE[r.state];
    const credits = r.requiredCreditUnits !== undefined
      ? `취득 ${creditsText(r.earnedCreditUnits ?? 0)} / 필요 ${creditsText(r.requiredCreditUnits)}${r.remainingCreditUnits ? ` · ${creditsText(r.remainingCreditUnits)} 남음` : ''}`
      : r.requiredCoursesCount !== undefined ? `${r.matchedCoursesCount ?? 0} / ${r.requiredCoursesCount}과목` : null;
    const impact = impacts.find(i => i.requirementId === r.requirementId);
    const heldText = held.has(r.requirementId)
      ? `두 전공에 함께 쓰인 과목의 중복 인정 기준이 확인되지 않아 보류했습니다.${impact?.remainingCreditUnitsWithoutShared ? ` 중복이 인정되지 않으면 ${creditsText(impact.remainingCreditUnitsWithoutShared)}이 더 필요합니다.` : ''}`
      : null;
    return {
      id: r.requirementId, badge, creditsText: credits, heldText,
      ariaLabel: `${role} ${r.requirementId}: ${badge.text}${credits ? `, ${credits}` : ''}${heldText ? `. ${heldText}` : ''}`,
    };
  });
  return {role, stateText: AUDIT_STATE[audit.state], rulePackText: `적용 규칙 ${audit.rulePackVersion}`, rows};
}

function overlapText(status: OverlapStatus, count: number, units: number): string | null {
  switch (status) {
    case 'NONE': return '두 전공에 함께 쓰인 과목이 없습니다.';
    case 'NO_APPROVED_RULE': return `두 전공에 함께 쓰인 과목 ${count}개(${creditsText(units)})가 있습니다. 공식 중복 인정 기준이 확인되지 않아, 결과가 달라지는 요건은 "확인 필요"로 보류했습니다.`;
    case 'COVERED_BY_APPROVED_RULE': return `두 전공에 함께 쓰인 과목 ${count}개(${creditsText(units)})는 승인된 중복 인정 기준 안에 있습니다.`;
    case 'OVER_APPROVED_LIMIT': return `두 전공에 함께 쓰인 과목 ${count}개(${creditsText(units)})가 승인된 중복 인정 한도를 넘어, 결과가 달라지는 요건은 "확인 필요"로 보류했습니다.`;
  }
}

/** Anything malformed or bound to another asOf is {ok:false}: render an error, never guessed values. */
export function buildDoubleMajorView(raw: unknown, expected: {asOf: string}): DoubleMajorViewResult {
  if (!isObj(raw) || typeof raw.asOf !== 'string' || Date.parse(raw.asOf) !== Date.parse(expected.asOf)) return {ok: false};
  const primary = AcademicAuditVNextSchema.safeParse(raw.primary);
  if (!primary.success || Date.parse(primary.data.asOf) !== Date.parse(expected.asOf)) return {ok: false};
  const u = raw.uniqueCredits, dm = raw.doubleMajor, ov = raw.overlap;
  if (!isObj(u) || !isUnits(u.earnedCreditUnits) || !isUnits(u.inProgressCreditUnits) || !isUnits(u.plannedCreditUnits)) return {ok: false};
  if (!isObj(dm) || !isObj(ov) || !isUnits(ov.sharedCreditUnits) || !Array.isArray(ov.sharedCourses)) return {ok: false};
  const status = ov.status as OverlapStatus;
  if (!['NONE', 'NO_APPROVED_RULE', 'COVERED_BY_APPROVED_RULE', 'OVER_APPROVED_LIMIT'].includes(status)) return {ok: false};
  const heldIds = isObj(ov.heldRequirementIds) ? ov.heldRequirementIds : null;
  const impacts = isObj(ov.rowImpacts) ? ov.rowImpacts : null;
  if (!heldIds || !impacts || !isIds(heldIds.primary) || !isIds(heldIds.doubleMajor)
    || !Array.isArray(impacts.primary) || !Array.isArray(impacts.doubleMajor)) return {ok: false};
  // The same transcript feeds both majors: the totals must agree, or the two columns describe different students.
  if (u.earnedCreditUnits !== primary.data.earnedCreditUnits) return {ok: false};

  let second: MajorColumnView | null = null;
  let note: string | null = null;
  switch (dm.status) {
    case 'NOT_APPLICABLE': note = '이중전공을 하지 않는 것으로 입력되어 주전공만 보여 줍니다.'; break;
    case 'INPUT_REQUIRED': note = '이중전공 여부가 입력되지 않았습니다. 계정 설정에서 입력하면 이중전공 요건도 함께 보여 줍니다.'; break;
    case 'RULES_MISSING': note = '선택한 이중전공의 요건 규칙이 아직 준비되지 않아 표시하지 않았습니다. 학과에서 직접 확인해 주세요.'; break;
    case 'CHECKED': {
      const audit = AcademicAuditVNextSchema.safeParse(dm.audit);
      if (!audit.success || Date.parse(audit.data.asOf) !== Date.parse(expected.asOf)
        || audit.data.earnedCreditUnits !== primary.data.earnedCreditUnits) return {ok: false};
      second = column('이중전공', audit.data, new Set(heldIds.doubleMajor), impacts.doubleMajor as Impact[]);
      break;
    }
    default: return {ok: false};
  }
  const selectionText = dm.status === 'CHECKED' || dm.status === 'RULES_MISSING' ? '이중전공: 선택함'
    : dm.status === 'NOT_APPLICABLE' ? '이중전공: 해당 없음' : '이중전공: 입력 필요';
  return {ok: true, view: {
    selectionText, notOfficialText: NOT_OFFICIAL_GRADUATION_TEXT,
    uniqueCredits: [
      {label: '취득', credits: creditsText(u.earnedCreditUnits)},
      {label: '수강 중', credits: creditsText(u.inProgressCreditUnits)},
      {label: '계획', credits: creditsText(u.plannedCreditUnits)},
    ],
    primary: column('주전공', primary.data, new Set(heldIds.primary), impacts.primary as Impact[]),
    doubleMajor: second, doubleMajorNote: note,
    overlapText: dm.status === 'CHECKED' ? overlapText(status, ov.sharedCourses.length, ov.sharedCreditUnits) : null,
  }};
}
