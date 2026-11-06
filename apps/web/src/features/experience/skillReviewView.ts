import {z} from 'zod';
import {
  ExperienceSkillCandidateResponseSchema, ExperienceTagApprovalSchema, TOPIC_CODES,
  type ExperienceTagApproval, type ExperienceTagApprovalDelete, type ExperienceTagApprovalPut, type TopicCode,
} from '@hufs-one/contracts';
import {TOPIC_TEXT} from '../demo/topicText.js';

const Id = z.string().regex(/^[A-Za-z0-9_-]{1,90}$/);
const Version = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1);

/**
 * #258 screen input: the owner's experience cards with their current approval and, when one was
 * requested, the AI candidate. The real path composes GET /api/experience/cards?view=portfolio,
 * …/tag-approval and …/ai-skills/:jobId through HufsOwnerApiClient; the
 * whole page is checked so one malformed card hides the screen rather than mixing stages.
 */
export const ExperienceReviewPageSchema = z.strictObject({
  asOf: z.iso.datetime({offset: true}),
  consentVersion: Version,
  /** false when more cards exist than this page: approvals still apply per card, but nothing here may claim a full inventory. */
  complete: z.boolean(),
  items: z.array(z.strictObject({
    experienceId: Id,
    title: z.string().min(1).max(120),
    summary: z.string().max(500).optional(),
    dataMode: z.enum(['SYNTHETIC', 'OWNER_CONSENTED']),
    contentVersion: Version,
    approval: ExperienceTagApprovalSchema,
    candidate: ExperienceSkillCandidateResponseSchema.nullable(),
    candidateState: z.enum(['NOT_REQUESTED', 'PENDING']).optional(),
  })).max(20),
}).refine(page => new Set(page.items.map(i => i.experienceId)).size === page.items.length);
export type ExperienceReviewPage = z.infer<typeof ExperienceReviewPageSchema>;

export interface CandidateTopicView {
  readonly code: TopicCode; readonly label: string;
  readonly skill: string | null; readonly role: string | null;
  readonly quotes: readonly string[];
}
export type CandidateView =
  | {readonly kind: 'NONE'; readonly text: string}
  | {readonly kind: 'STALE'; readonly text: string}
  | {readonly kind: 'READY'; readonly topics: readonly CandidateTopicView[]};
export type ApprovalView =
  | {readonly kind: 'ACTIVE'; readonly topics: readonly {code: TopicCode; label: string}[]; readonly approvedAt: string}
  | {readonly kind: 'INACTIVE'; readonly text: string; readonly canApprove: boolean};

export interface ExperienceCardView {
  readonly experienceId: string;
  readonly title: string;
  readonly summary: string;
  readonly synthetic: boolean;
  readonly versionText: string;
  readonly candidate: CandidateView;
  readonly approval: ApprovalView;
  /** Topics the owner may tick: current candidate topics plus already approved ones, in A04.1 order. */
  readonly options: readonly {code: TopicCode; label: string; approved: boolean}[];
  readonly manualOptions: readonly {code: TopicCode; label: string; approved: boolean}[];
  readonly canRequest: boolean;
  readonly expected: ExperienceTagApprovalDelete;
}
export interface ExperienceReviewView {
  readonly asOf: string;
  readonly partial: boolean;
  readonly cards: readonly ExperienceCardView[];
}

const INACTIVE_TEXT: Record<Extract<ExperienceTagApproval, {state: 'INACTIVE'}>['reason'], string> = {
  NOT_APPROVED: '아직 승인한 주제가 없습니다.',
  STALE: '경험 내용이나 동의가 바뀌어 이전 승인은 더 이상 쓰이지 않습니다. 다시 확인해 주세요.',
  REVOKED: '승인을 취소했습니다.',
  CONSENT_REQUIRED: '분석 목적 동의가 없어 승인할 수 없습니다.',
  NOT_FOUND: '이 경험을 찾을 수 없습니다.',
};

const dateText = (iso: string) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(iso));
const order = (codes: Iterable<TopicCode>) => { const set = new Set(codes); return TOPIC_CODES.filter(c => set.has(c)); };

function candidateView(item: ExperienceReviewPage['items'][number], consentVersion: number): CandidateView {
  const c = item.candidate;
  if (!c) return {kind: 'NONE', text: item.candidateState === 'PENDING'
    ? 'AI 후보를 준비 중입니다. 같은 요청으로 수동 재확인할 수 있습니다.' : '이 화면에서 확인된 AI 후보가 없습니다. 필요하면 경험을 선택해 요청하세요.'};
  // A candidate read for an older wording or consent never shows as a suggestion for the current one.
  if (c.experienceId !== item.experienceId || c.contentVersion !== item.contentVersion || c.consentVersion !== consentVersion)
    return {kind: 'STALE', text: '경험 내용이나 동의가 바뀌기 전의 AI 후보라 표시하지 않았습니다.'};
  const quotes = (code: TopicCode) => c.candidate.citations.filter(x => x.topicCode === code).map(x => x.quote);
  const r = c.candidate.result;
  if (r?.kind === 'experience_skills') {
    const quoteAt = (i: number) => c.candidate.citations[i]?.quote;
    const byCode = new Map<TopicCode, CandidateTopicView>();
    for (const s of r.skills) if (!byCode.has(s.topicCode)) byCode.set(s.topicCode, {
      code: s.topicCode, label: TOPIC_TEXT[s.topicCode], skill: s.skill.text, role: s.role.text,
      quotes: [...new Set([...s.skill.citationIndexes, ...s.role.citationIndexes].map(quoteAt).filter((q): q is string => !!q))],
    });
    return {kind: 'READY', topics: order(byCode.keys()).map(code => byCode.get(code)!)};
  }
  const codes = order(c.candidate.citations.flatMap(x => x.topicCode ? [x.topicCode] : []));
  if (codes.length === 0) return {kind: 'NONE', text: 'AI 후보에 주제 근거가 없어 고를 수 있는 주제가 없습니다.'};
  return {kind: 'READY', topics: codes.map(code => ({code, label: TOPIC_TEXT[code], skill: null, role: null, quotes: quotes(code)}))};
}

function approvalView(item: ExperienceReviewPage['items'][number], consentVersion: number): ApprovalView {
  const a = item.approval;
  if (a.state === 'INACTIVE') return {kind: 'INACTIVE', text: INACTIVE_TEXT[a.reason], canApprove: a.reason !== 'CONSENT_REQUIRED' && a.reason !== 'NOT_FOUND'};
  // ACTIVE for another content/consent version is not current approval, whatever the server label says.
  if (a.contentVersion !== item.contentVersion || a.consentVersion !== consentVersion)
    return {kind: 'INACTIVE', text: INACTIVE_TEXT.STALE, canApprove: true};
  return {kind: 'ACTIVE', topics: order(a.topics).map(code => ({code, label: TOPIC_TEXT[code]})), approvedAt: dateText(a.approvedAt)};
}

export function buildExperienceReviewView(raw: unknown): {ok: true; view: ExperienceReviewView} | {ok: false} {
  const parsed = ExperienceReviewPageSchema.safeParse(raw);
  if (!parsed.success) return {ok: false};
  const page = parsed.data;
  return {ok: true, view: {
    asOf: dateText(page.asOf),
    partial: !page.complete,
    cards: page.items.map(item => {
      const candidate = candidateView(item, page.consentVersion);
      const approval = approvalView(item, page.consentVersion);
      const approved = new Set(approval.kind === 'ACTIVE' ? approval.topics.map(t => t.code) : []);
      const offered = new Set<TopicCode>([...approved, ...(candidate.kind === 'READY' ? candidate.topics.map(t => t.code) : [])]);
      const canEdit = approval.kind === 'ACTIVE' || approval.canApprove;
      return {
        experienceId: item.experienceId,
        title: item.title,
        summary: item.summary ?? '',
        synthetic: item.dataMode === 'SYNTHETIC',
        versionText: `내용 ${item.contentVersion}판 · 동의 ${page.consentVersion}판`,
        candidate, approval,
        options: canEdit ? order(offered).map(code => ({code, label: TOPIC_TEXT[code], approved: approved.has(code)})) : [],
        manualOptions: canEdit ? TOPIC_CODES.filter(code => !offered.has(code)).map(code => ({code, label: TOPIC_TEXT[code], approved: false})) : [],
        canRequest: canEdit,
        expected: {expectedApprovalVersion: item.approval.version, expectedContentVersion: item.contentVersion, expectedConsentVersion: page.consentVersion},
      };
    }),
  }};
}

/** PUT body for the owner's ticked topics, or null when the selection cannot be sent (0 or more than 5). */
export function approvalInput(card: ExperienceCardView, picked: readonly TopicCode[], includeManual = false): ExperienceTagApprovalPut | null {
  const allowed = new Set([...card.options, ...(includeManual ? card.manualOptions : [])].map(o => o.code));
  const topics = order(picked.filter(c => allowed.has(c)));
  if (topics.length < 1 || topics.length > 5) return null;
  return {...card.expected, topics};
}
