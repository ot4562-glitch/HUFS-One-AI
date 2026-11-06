import {ExperienceTagApprovalSchema, type ExperienceTagApproval, type TopicCode, type SubjectAlias} from '@hufs-one/contracts';
import {HufsApiError} from '../integrations/api-error.js';
import type {ExperienceSkillPort} from '../features/experience/ExperienceSkillReview.js';
import {ExperienceReviewPageSchema, type ExperienceReviewPage} from '../features/experience/skillReviewView.js';

/**
 * Dev-only #258 stand-in: three SYNTHETIC experience cards (one with an AI candidate, one already
 * approved, one with a candidate for an older wording) and an in-memory approval store that applies
 * the same expected-version CAS as PUT/DELETE …/tag-approval. Every page is schema-checked. Never in a
 * production build.
 */
const CONSENT = 3;
const usage = {promptTokens: 120, completionTokens: 40, totalTokens: 160};
const candidate = (experienceId: string, jobId: string, contentVersion: number, skills: {code: TopicCode; skill: string; role: string; quote: string}[]) => ({
  experienceId, jobId, contentVersion, consentVersion: CONSENT, state: 'NEEDS_REVIEW' as const,
  candidate: {
    task: 'experience_skills' as const, reviewRequired: true as const, reviewState: 'NEEDS_REVIEW' as const,
    citations: skills.map((s, i) => ({sourceToken: `SYN-EXP-${experienceId}`, paragraphId: `p${i + 1}`, quote: s.quote, topicCode: s.code})),
    objectTokens: [],
    result: {kind: 'experience_skills' as const, skills: skills.map((s, i) => ({
      topicCode: s.code, skill: {text: s.skill, citationIndexes: [i]}, role: {text: s.role, citationIndexes: [i]},
    }))},
    usage,
  },
});

interface Card { title: string; summary?: string; contentVersion: number; candidate: ExperienceReviewPage['items'][number]['candidate'] }
const CARDS: Record<string, Card> = {
  'SYN-EXP-01': {title: '교내 데이터 분석 동아리 발표 (합성)', contentVersion: 2, candidate: candidate('SYN-EXP-01', '6b0c3f1e-2d4a-4c1b-9e7f-0a1b2c3d4e01', 2, [
    {code: 'DATA_ANALYTICS', skill: '설문 결과를 표로 정리', role: '분석 담당', quote: '설문 120건을 정리해 학과별 응답을 표로 비교했다'},
    {code: 'MEDIA_CONTENT', skill: '발표 자료 제작', role: '발표자', quote: '결과를 슬라이드 10장으로 만들어 발표했다'},
  ])},
  'SYN-EXP-02': {title: '통번역 봉사 활동 (합성)', contentVersion: 1, candidate: null},
  'SYN-EXP-03': {title: '스타트업 아이디어 경진대회 참가 (합성)', contentVersion: 4, candidate: candidate('SYN-EXP-03', '6b0c3f1e-2d4a-4c1b-9e7f-0a1b2c3d4e03', 3, [
    {code: 'STARTUP_ENTREPRENEUR', skill: '사업 아이디어 정리', role: '팀원', quote: '팀원 네 명과 사업 계획서 초안을 썼다'},
  ])},
};

export function syntheticExperienceSkillPort({delayMs = 0, subject}: {delayMs?: number; subject?: SubjectAlias} = {}): ExperienceSkillPort & {calls: string[]} {
  const cards: Record<string, Card> = structuredClone(CARDS);
  if (subject) for (const card of Object.values(cards)) card.title = `가상 학생 ${Number(subject.slice(1))} · ${card.title}`;
  const approvals = new Map<string, ExperienceTagApproval>([
    ['SYN-EXP-01', {state: 'INACTIVE', version: 0, reason: 'NOT_APPROVED'}],
    ['SYN-EXP-02', {state: 'ACTIVE', version: 1, contentVersion: 1, consentVersion: CONSENT, topics: ['LANGUAGE_TRANSLATION'],
      approvedAt: '2026-11-02T03:00:00.000Z', provenance: 'LOCAL_USER_SELECTION'}],
    ['SYN-EXP-03', {state: 'INACTIVE', version: 2, reason: 'STALE'}],
  ]);
  const calls: string[] = [];
  const wait = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const t = setTimeout(resolve, delayMs);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, {once: true});
  });
  const check = (id: string, e: {expectedApprovalVersion: number; expectedContentVersion: number; expectedConsentVersion: number}) => {
    const card = cards[id]; const a = approvals.get(id);
    if (!card || !a) throw new HufsApiError('FORBIDDEN', 403);
    if (a.version !== e.expectedApprovalVersion || card.contentVersion !== e.expectedContentVersion || e.expectedConsentVersion !== CONSENT)
      throw new HufsApiError('VERSION_CONFLICT', 409);
    return a;
  };
  return {
    calls,
    async load(signal) {
      calls.push('load'); await wait(signal);
      return ExperienceReviewPageSchema.parse({
        asOf: '2026-11-06T00:00:00.000Z', consentVersion: CONSENT, complete: true,
        items: Object.entries(cards).map(([experienceId, c]) => ({experienceId, title: c.title, dataMode: 'SYNTHETIC',
          summary: c.summary ?? '', contentVersion: c.contentVersion, approval: approvals.get(experienceId), candidate: c.candidate})),
      });
    },
    async create(input, signal) {
      await wait(signal);
      if (!input.title.trim() || input.title.length > 120 || input.summary.length > 500 || Object.keys(cards).length >= 20)
        throw new HufsApiError('INVALID_INPUT', 422);
      const id = 'SYN-USER-' + crypto.randomUUID().replaceAll('-', '');
      cards[id] = {title: input.title.trim(), summary: input.summary.trim(), contentVersion: 1, candidate: null};
      approvals.set(id, {state: 'INACTIVE', version: 0, reason: 'NOT_APPROVED'});
      return {created: true};
    },
    async remove(id, contentVersion, signal) {
      await wait(signal);
      if (!cards[id]) throw new HufsApiError('FORBIDDEN', 403);
      if (cards[id].contentVersion !== contentVersion) throw new HufsApiError('VERSION_CONFLICT', 409);
      delete cards[id]; approvals.delete(id);
      return {removed: true};
    },
    async requestCandidates(selection, signal) {
      await wait(signal);
      if (selection.length < 1 || selection.length > 16 || new Set(selection.map(i => i.experienceId)).size !== selection.length)
        throw new HufsApiError('INVALID_INPUT', 422);
      let ready = 0;
      for (const selected of selection) {
        const c = cards[selected.experienceId];
        if (!c) throw new HufsApiError('FORBIDDEN', 403);
        if (c.contentVersion !== selected.contentVersion || selected.consentVersion !== CONSENT)
          throw new HufsApiError('VERSION_CONFLICT', 409);
        if (c.candidate?.contentVersion === c.contentVersion) ready++;
      }
      // No arbitrary user text is converted into a pretend model output. Only fixed synthetic candidates exist.
      return {ready, pending: 0, unavailable: selection.length - ready};
    },
    async approve(id, input, signal) {
      calls.push(`approve:${id}`); await wait(signal);
      const a = check(id, input);
      const next = ExperienceTagApprovalSchema.parse({state: 'ACTIVE', version: a.version + 1, contentVersion: input.expectedContentVersion,
        consentVersion: CONSENT, topics: input.topics, approvedAt: '2026-11-06T00:00:00.000Z', provenance: 'LOCAL_USER_SELECTION'});
      approvals.set(id, next); return {approval: next};
    },
    async revoke(id, input, signal) {
      calls.push(`revoke:${id}`); await wait(signal);
      const a = check(id, input);
      const next: ExperienceTagApproval = {state: 'INACTIVE', version: a.version + 1, reason: 'REVOKED'};
      approvals.set(id, next); return {approval: next};
    },
  };
}
