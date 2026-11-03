import {
  OwnerMajorWhatIfResponseSchema,
  type OwnerMajorWhatIfResponse,
  type MajorWhatIfRequirementProgress,
  type OwnerMajorWhatIfRequest,
} from '@hufs-one/contracts';
import {creditsText} from '../graduation/graduationView.js';

/**
 * #82 "전공을 바꾸면?" 가정 분석 모델. A hypothetical change, not the #144 view of the double major the
 * student actually chose. Values come from the owner What-if response (contracts self/major-what-if)
 * as-is: the UI never recomputes requirements, recognises a course for a new major or turns a blocked
 * dependency into a result. Always a hypothesis, never an official decision.
 */
export type Scenario = OwnerMajorWhatIfRequest['scenario'];
export type ScenarioAction = Scenario['action'];
type Ready = Extract<OwnerMajorWhatIfResponse, {state: 'READY'}>;
type Change = Ready['delta'][number]['change'];
type Blocker = Extract<OwnerMajorWhatIfResponse, {state: 'BLOCKED_DEPENDENCY'}>['blockers'][number];

export const ACTION_TEXT: Record<ScenarioAction, string> = {
  CHANGE_PRIMARY_MAJOR: '주전공을 바꾸면',
  ADD_DOUBLE_MAJOR: '이중전공을 추가하면',
  CHANGE_DOUBLE_MAJOR: '이중전공을 바꾸면',
  REMOVE_DOUBLE_MAJOR: '이중전공을 그만두면',
  ADD_MINOR: '부전공을 추가하면',
  CHANGE_MINOR: '부전공을 바꾸면',
  REMOVE_MINOR: '부전공을 그만두면',
};
export const needsTarget = (a: ScenarioAction) => a !== 'REMOVE_DOUBLE_MAJOR' && a !== 'REMOVE_MINOR';

export const HYPOTHETICAL_TEXT = '가정 분석입니다. 실제 전공 변경·이중전공 신청이 아니며 공식 졸업 판정도 아닙니다.';

const CHANGE: Record<Change, {text: string; icon: string}> = {
  NEW_REQUIREMENT: {text: '새로 생기는 요건', icon: '+'},
  ALREADY_SATISFIED: {text: '새 요건 · 이미 충족', icon: '✓'},
  REMOVED_REQUIREMENT: {text: '없어지는 요건', icon: '−'},
  UNCHANGED: {text: '그대로', icon: '='},
  PROGRESS_CHANGED: {text: '진행 상황 바뀜', icon: '↔'},
};
// What changes for the student first; unchanged rows last.
const RANK: Record<Change, number> = {NEW_REQUIREMENT: 0, PROGRESS_CHANGED: 1, REMOVED_REQUIREMENT: 2, ALREADY_SATISFIED: 3, UNCHANGED: 4};
const BLOCKER: Record<Blocker, string> = {
  CALCULATION_CORE_UNAVAILABLE: '가정 분석 계산 기능이 아직 준비되지 않았습니다.',
  RULEPACK_NOT_APPROVED: '가정한 전공의 졸업 규칙이 검수되지 않았습니다.',
  CURRENT_RULEPACK_NOT_APPROVED: '지금 전공의 졸업 규칙이 검수되지 않았습니다.',
  COHORT_NOT_VERIFIED: '적용 학번을 확인하지 못했습니다.',
  DUPLICATE_RECOGNITION_UNVERIFIED: '과목 중복 인정 기준이 확인되지 않았습니다.',
  SOURCE_RIGHTS_MISSING: '자료 이용 권한이 확인되지 않았습니다.',
  OWNER_CONSENT_REQUIRED: '본인 동의가 필요합니다.',
  TRANSCRIPT_NOT_APPROVED: '이수 기록이 승인되지 않았습니다.',
  CURRENT_VERSION_CHANGED: '그 사이 현재 학업 정보가 바뀌었습니다.',
  TARGET_PROGRAM_UNAVAILABLE: '가정한 전공을 이 학번에서 선택할 수 없거나 확인할 수 없습니다.',
};

export interface WhatIfRowView {
  readonly id: string;
  readonly badge: {readonly text: string; readonly icon: string};
  readonly before: string;
  readonly after: string;
  readonly ariaLabel: string;
}

export type WhatIfView =
  | {readonly kind: 'BLOCKED'; readonly title: string; readonly blockers: readonly string[]; readonly caveat: string}
  | {readonly kind: 'READY'; readonly title: string; readonly earned: string; readonly remainingBefore: string; readonly remainingAfter: string;
      readonly rows: readonly WhatIfRowView[]; readonly rulePackText: string; readonly caveat: string};

export type WhatIfViewResult = {readonly ok: true; readonly view: WhatIfView} | {readonly ok: false};

const sameScenario = (a: Scenario, b: Scenario) =>
  a.action === b.action && ('targetMajorId' in a ? a.targetMajorId : null) === ('targetMajorId' in b ? b.targetMajorId : null);

function progressText(r: MajorWhatIfRequirementProgress | undefined): string {
  if (!r) return '해당 없음';
  if (r.state === 'SATISFIED') return '충족';
  return r.missingCreditUnits ? `${creditsText(r.missingCreditUnits)} 부족` : '미충족';
}

/** Anything malformed or bound to another scenario/asOf is {ok:false}: render an error, never guessed values. */
export function buildWhatIfView(raw: unknown, expected: {scenario: Scenario; asOf: string; targetLabel: string | null}): WhatIfViewResult {
  const parsed = OwnerMajorWhatIfResponseSchema.safeParse(raw);
  if (!parsed.success) return {ok: false};
  const r = parsed.data;
  if (!sameScenario(r.scenario, expected.scenario) || Date.parse(r.asOf) !== Date.parse(expected.asOf)) return {ok: false};
  const title = `${expected.targetLabel ? `${expected.targetLabel}(으)로 ` : ''}${ACTION_TEXT[r.scenario.action]}`;
  if (r.state === 'BLOCKED_DEPENDENCY') {
    return {ok: true, view: {kind: 'BLOCKED', title, blockers: r.blockers.map(b => BLOCKER[b]), caveat: HYPOTHETICAL_TEXT}};
  }
  const before = new Map(r.current.requirements.map(x => [x.requirementId, x]));
  const after = new Map(r.hypothetical.requirements.map(x => [x.requirementId, x]));
  const rows = [...r.delta].sort((a, b) => RANK[a.change] - RANK[b.change]).map(d => {
    const badge = CHANGE[d.change];
    const b = progressText(before.get(d.requirementId)), a = progressText(after.get(d.requirementId));
    return {id: d.requirementId, badge, before: b, after: a, ariaLabel: `${d.requirementId}: ${badge.text}. 지금 ${b}, 가정 ${a}`};
  });
  return {ok: true, view: {
    kind: 'READY', title,
    earned: creditsText(r.current.earnedCreditUnits),
    remainingBefore: creditsText(r.current.remainingCreditUnits),
    remainingAfter: creditsText(r.hypothetical.remainingCreditUnits),
    rows,
    rulePackText: `지금 규칙 ${r.versions.currentRulePack} · 가정 규칙 ${r.versions.hypotheticalRulePack}`,
    caveat: HYPOTHETICAL_TEXT,
  }};
}
