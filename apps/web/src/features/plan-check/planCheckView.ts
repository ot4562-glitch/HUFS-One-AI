import {OwnerStudyPlanCheckResponseSchema, type OwnerStudyPlanCheckResponse} from '@hufs-one/contracts';
import {creditsText} from '../graduation/graduationView.js';

/**
 * #81 수강계획 검사 모델, shown next to the #74 졸업 요건 현황. Values come from the owner plan check
 * (contracts self/study-plan-check) as-is; the UI never adds credits, invents a cap or turns a
 * needs-review finding into a confirmed warning. Not course registration, not a graduation decision.
 */
type Issue = OwnerStudyPlanCheckResponse['planIssues'][number];
type Caveat = OwnerStudyPlanCheckResponse['caveats'][number];

export interface PlanIssueView {
  readonly key: string;
  /** Text + icon; never colour alone. */
  readonly badge: {readonly text: string; readonly icon: string};
  readonly text: string;
  readonly courses: string;
}

export interface PlanCheckView {
  readonly term: string;
  readonly stateText: string;
  readonly loadText: string;
  /** Null unless the server sent an approved cap (the contract forbids an unverified one). */
  readonly capText: string | null;
  readonly issues: readonly PlanIssueView[];
  readonly unchecked: readonly string[];
  readonly caveats: readonly string[];
  readonly versionText: string;
  readonly redactedText: string | null;
}

export type PlanCheckViewResult = {readonly ok: true; readonly view: PlanCheckView} | {readonly ok: false};

const STATE = {READY: '승인된 규칙으로 검사함', NEEDS_REVIEW: '검토가 필요한 결과', INSUFFICIENT_DATA: '자료가 부족해 판단할 수 없음'} as const;
const ISSUE: Record<Issue['code'], {text: string; confirmed: boolean}> = {
  CREDIT_CAP_EXCEEDED: {text: '학기 최대 학점을 넘습니다', confirmed: true},
  PREREQUISITE_MISSING: {text: '선수과목을 아직 이수하지 않았습니다', confirmed: true},
  TIMETABLE_CONFLICT: {text: '확인된 분반이 모두 시간이 겹칩니다', confirmed: true},
  REQUIRED_COURSE_UNOFFERED: {text: '필수 과목이 이 학기에 개설되지 않습니다', confirmed: true},
  SEARCH_LIMIT_REVIEW: {text: '배정 계산 한도에 걸려 검토가 필요합니다', confirmed: false},
  NEEDS_REVIEW: {text: '확정할 수 없어 검토가 필요합니다', confirmed: false},
};
const REASON: Record<NonNullable<Issue['reasonCode']>, string> = {
  EXCEEDS_APPROVED_LIMIT: '승인된 한도 초과', UNMET_OFFICIAL_PREREQUISITE: '공식 선수 요건 미충족',
  ALL_VERIFIED_SECTIONS_OVERLAP: '확인된 분반 전부 겹침', COURSE_NOT_CONFIRMED: '개설 미확인',
  ALLOCATION_SEARCH_LIMIT: '배정 계산 한도', UNKNOWN: '사유 확인 불가',
};
const UNCHECKED = {TERM_UNDECIDED: '학기 미정', TERM_ENDED: '이미 끝난 학기', CREDITS_UNKNOWN: '학점 확인 불가'} as const;
const CAVEAT: Record<Caveat, string> = {
  NOT_OFFICIAL_REGISTRATION: '실제 수강신청이 아닙니다.',
  NOT_GRADUATION_DECISION: '공식 졸업 판정이 아닙니다.',
  RULEPACK_UNVERIFIED: '졸업 규칙이 아직 검수되지 않았습니다.',
  TERM_RULES_UNVERIFIED: '학기 학점 규칙이 검수되지 않아 최대 학점을 보여 주지 않습니다.',
  COHORT_UNKNOWN: '적용 학번을 확인하지 못했습니다.',
  SOURCE_RIGHTS_MISSING: '자료 이용 권한이 확인되지 않았습니다.',
  TRANSCRIPT_NOT_APPROVED: '이수 기록이 승인되지 않았습니다.',
  SECTIONS_UNCONFIRMED: '개설 분반이 확정되지 않았습니다.',
  PLAN_PARTIALLY_CHECKED: '계획의 일부만 검사했습니다.',
  COURSE_REFS_REDACTED: '공유 범위 밖 과목명은 가렸습니다.',
};

export function termText(term: string): string {
  const [y, s] = term.split('-');
  return `${y}년 ${s === '1' ? '1학기' : s === '2' ? '2학기' : s === 'S' ? '여름 계절학기' : '겨울 계절학기'}`;
}

/** Anything malformed or bound to another term/asOf is {ok:false}: render an error, never guessed values. */
export function buildPlanCheckView(raw: unknown, expected: {term: string; asOf: string}): PlanCheckViewResult {
  const parsed = OwnerStudyPlanCheckResponseSchema.safeParse(raw);
  if (!parsed.success) return {ok: false};
  const r = parsed.data;
  if (r.term !== expected.term || Date.parse(r.asOf) !== Date.parse(expected.asOf)) return {ok: false};
  // Confirmed findings first; within each group, server order.
  const issues = [...r.planIssues].sort((a, b) => Number(ISSUE[b.code].confirmed) - Number(ISSUE[a.code].confirmed)).map((i, n) => {
    const def = ISSUE[i.code];
    return {
      key: `${i.code}-${n}`,
      badge: def.confirmed ? {text: '확인됨', icon: '!'} : {text: '검토 필요', icon: '?'},
      text: `${def.text}${i.reasonCode ? ` (${REASON[i.reasonCode]})` : ''}`,
      courses: i.courseRefs.length ? i.courseRefs.join(', ') : '과목 정보 없음',
    };
  });
  const v = r.versions;
  return {ok: true, view: {
    term: termText(r.term),
    stateText: STATE[r.state],
    loadText: `이 학기 계획 ${creditsText(r.termLoadCreditUnits)}`,
    capText: r.creditCapUnits !== undefined && r.approval ? `승인된 최대 ${creditsText(r.creditCapUnits)}` : null,
    issues,
    unchecked: r.unchecked.map(u => `${u.courseId ?? '과목 정보 없음'} · ${UNCHECKED[u.reason]}`),
    caveats: r.caveats.map(c => CAVEAT[c]),
    versionText: [v.plan && `계획 ${v.plan}`, v.rulePack && `규칙 ${v.rulePack}`].filter(Boolean).join(' · ') || '버전 정보 없음',
    redactedText: r.disclosure.mode === 'REDACTED' ? '공유 범위 밖이라 과목명을 표시하지 않습니다.' : null,
  }};
}

