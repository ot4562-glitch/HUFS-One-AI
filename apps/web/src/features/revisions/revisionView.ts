import {
  OpportunityRevisionComparisonResponseSchema,
  type OpportunityComparisonRevision,
  type OpportunityRevisionComparisonClaim,
  type OpportunityRevisionComparisonResponse,
} from '@hufs-one/contracts';

/**
 * #119 "정정 전 / 정정 후" view model over the merged #137 comparison wire. Values and field states come
 * from the server's reviewed claims as-is; the UI only orders them (changed first) and labels them.
 * Capture, last check and fact verification are three different times and are never merged.
 */
type Field = 'DEADLINE' | 'STATUS' | 'ELIGIBILITY';
type ChangeKind = 'EXTENDED' | 'SHORTENED' | 'CANCELLED' | 'CHANGED';

export interface RevisionRowView {
  readonly field: Field;
  readonly label: string;
  readonly before: string;
  readonly after: string;
  readonly state: 'CHANGED' | 'UNCHANGED' | 'UNKNOWN';
  /** Text + icon name; never colour alone. */
  readonly badge: {readonly text: string; readonly icon: 'arrow-right' | 'arrow-left' | 'ban' | 'pencil' | 'equal' | 'help'};
  readonly ariaLabel: string;
}

export interface RevisionSideView {
  readonly revisionId: string;
  readonly captured: string;
  readonly checked: string;
  readonly verified: string;
  readonly delivery: string;
  readonly evidenceCount: number;
}

export type RevisionScreenView =
  | {readonly kind: 'READY'; readonly summary: string; readonly rows: readonly RevisionRowView[];
      readonly before: RevisionSideView; readonly after: RevisionSideView; readonly synthetic: boolean}
  | {readonly kind: 'NEEDS_REVIEW'; readonly text: string};

export type RevisionViewResult = {readonly ok: true; readonly view: RevisionScreenView} | {readonly ok: false};

const LABEL: Record<Field, string> = {DEADLINE: '모집 마감', STATUS: '모집 상태', ELIGIBILITY: '지원 조건'};
const STATUS_TEXT = {OPEN: '모집 중', CLOSED: '마감', CANCELLED: '모집 취소', UNKNOWN: '확인 필요'} as const;
const FIELD_TEXT = {enrollment: '학적', campus: '캠퍼스', major: '전공', cohort: '학번', degree: '학위', time: '시간', teamRole: '팀 역할', certification: '자격·증빙'} as const;
const OP_TEXT = {EQ: '=', IN: '중 하나:', NOT_IN: '제외:', GTE: '이상', LTE: '이하', EXISTS: '필요'} as const;
const VALUE_TEXT: Record<string, string> = {ENROLLED: '재학', GRADUATED: '졸업', LEAVE: '휴학', SEOUL: '서울', GLOBAL: '글로벌', LEADER: '팀장', MEMBER: '팀원', true: '있음', false: '없음'};
const DELIVERY = {LIVE: '실시간 확인', VERIFIED_CACHE: '검증된 캐시', REPLAY: '재생(과거 기록)'} as const;
const REVIEW_REASON = {
  REVISION_NOT_REVIEWED: '새 판본이 아직 검수되지 않았습니다.',
  REVISION_CONFLICT: '판본 내용이 서로 맞지 않아 검수 중입니다.',
  REVISION_UNKNOWN: '판본 정보를 확인할 수 없습니다.',
} as const;
const KIND_BADGE: Record<ChangeKind, RevisionRowView['badge']> = {
  EXTENDED: {text: '연장', icon: 'arrow-right'},
  SHORTENED: {text: '단축', icon: 'arrow-left'},
  CANCELLED: {text: '취소', icon: 'ban'},
  CHANGED: {text: '변경', icon: 'pencil'},
};

const dateTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const t = (iso: string) => dateTime.format(Date.parse(iso));

function valueText(claim: OpportunityRevisionComparisonClaim | undefined): string {
  if (!claim) return '확인 필요';
  switch (claim.field) {
    case 'DEADLINE':
      return claim.value.kind === 'FIXED' ? t(claim.value.at) : claim.value.kind === 'ROLLING' ? '상시 모집' : '확인 필요';
    case 'STATUS':
      return STATUS_TEXT[claim.value];
    case 'ELIGIBILITY':
      if (!claim.value.length) return '조건 없음';
      return claim.value.map(c => {
        const v = Array.isArray(c.value) ? c.value.map(x => VALUE_TEXT[String(x)] ?? String(x)).join(', ') : VALUE_TEXT[String(c.value)] ?? String(c.value);
        return c.operator === 'EXISTS' ? `${FIELD_TEXT[c.field]} ${OP_TEXT.EXISTS}` : `${FIELD_TEXT[c.field]} ${OP_TEXT[c.operator]} ${v}`;
      }).join('; ');
  }
}

function side(r: OpportunityComparisonRevision): RevisionSideView {
  return {
    revisionId: r.revisionId, captured: t(r.capturedAt), checked: t(r.checkedAt), verified: t(r.verifiedAt),
    delivery: DELIVERY[r.deliveryMode], evidenceCount: r.claims.reduce((n, c) => n + c.evidenceRefs.length, 0),
  };
}

/**
 * Validates the wire and its binding to the opportunity and asOf the screen asked about. Anything else
 * (another opportunity, another asOf, malformed) is {ok:false}: render an error, never guessed values.
 */
export function buildRevisionView(raw: unknown, expected: {opportunityId: string; asOf: string}): RevisionViewResult {
  const parsed = OpportunityRevisionComparisonResponseSchema.safeParse(raw);
  if (!parsed.success) return {ok: false};
  const r: OpportunityRevisionComparisonResponse = parsed.data;
  if (r.opportunityId !== expected.opportunityId || Date.parse(r.asOf) !== Date.parse(expected.asOf)) return {ok: false};
  if (r.state === 'NEEDS_REVIEW') {
    return {ok: true, view: {kind: 'NEEDS_REVIEW', text: `변경 감지 · 검토 중 — ${REVIEW_REASON[r.reason]} 바뀐 내용을 확정하지 않았고, 이전 판본을 현재 공고로 되돌리지도 않았습니다.`}};
  }
  const rows: RevisionRowView[] = r.comparisons.map(c => {
    const before = valueText(r.before.claims.find(x => x.field === c.field));
    const after = valueText(r.after.claims.find(x => x.field === c.field));
    const change = r.changes.find(x => x.field === c.field);
    const badge: RevisionRowView['badge'] = c.state === 'CHANGED' ? KIND_BADGE[change?.kind ?? 'CHANGED']
      : c.state === 'UNCHANGED' ? {text: '그대로', icon: 'equal'} : {text: '확인 필요', icon: 'help'};
    return {
      field: c.field, label: LABEL[c.field], before, after, state: c.state, badge,
      ariaLabel: `${LABEL[c.field]}: ${badge.text}. 정정 전 ${before}, 정정 후 ${after}`,
    };
  });
  // Changed first, then unknown, then unchanged; server order within each group.
  const rank = {CHANGED: 0, UNKNOWN: 1, UNCHANGED: 2} as const;
  rows.sort((a, b) => rank[a.state] - rank[b.state]);
  const changed = rows.filter(x => x.state === 'CHANGED');
  return {ok: true, view: {
    kind: 'READY',
    summary: changed.length ? `정정된 항목 ${changed.length}개: ${changed.map(x => `${x.label} ${x.badge.text}`).join(', ')}` : '검수된 항목 중 바뀐 내용이 없습니다.',
    rows, before: side(r.before), after: side(r.after), synthetic: r.after.dataMode === 'SYNTHETIC',
  }};
}
