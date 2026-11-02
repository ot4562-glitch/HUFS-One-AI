import {API_ERROR_HTTP_STATUS, isNextBookmarkStage, makeApiError, type ApiErrorCode, type BookmarkOutcome, type BookmarkStage, type OwnerWorkspaceRecord} from '@hufs-one/contracts';
import {DEMO_AS_OF, DEMO_OPPORTUNITIES} from '../../../../packages/core/src/opportunities/index.js';
import type {ApiFetch} from '../integrations/index.js';

/**
 * Dev/test-only stand-in for the owner REST routes the #80 board uses, plugged into the REAL
 * HufsApiClient as its fetch transport (so client validation runs unchanged). One fictitious BETA owner,
 * SYNTHETIC postings from the demo corpus, in-memory only. Never reached from a production build.
 */
export const SYNTHETIC_OWNER_ID = 'SYN-OWNER-1';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {status, headers: {'content-type': 'application/json'}});
const fail = (code: ApiErrorCode) => json(makeApiError(code, 'SYN-REQ-OWNER'), API_ERROR_HTTP_STATUS[code]);

const bookmark = (itemId: string, opportunityId: string, stage?: BookmarkStage, outcome?: BookmarkOutcome): OwnerWorkspaceRecord => ({
  itemId, version: 1, updatedAt: DEMO_AS_OF,
  value: {kind: 'BOOKMARK', dataMode: 'SYNTHETIC', opportunityId, state: 'SAVED', ...(stage ? {stage} : {}), ...(outcome ? {outcome} : {})},
});
const task = (itemId: string, opportunityId: string, text: string, done: boolean): OwnerWorkspaceRecord => ({
  itemId, version: 1, updatedAt: DEMO_AS_OF,
  value: {kind: 'ACTION_PLAN', dataMode: 'SYNTHETIC', state: 'DRAFT', opportunityId, task: text, done},
});

/** Seed: one card per stage, a legacy un-staged row and a row whose posting is gone. */
export function seedOwnerRecords(): {bookmarks: OwnerWorkspaceRecord[]; tasks: OwnerWorkspaceRecord[]} {
  return {
    bookmarks: [
      bookmark('bm-01', 'SYN-OPP-002', 'INTERESTED'),
      bookmark('bm-02', 'SYN-OPP-004', 'PREPARING'),
      bookmark('bm-03', 'SYN-OPP-006', 'SUBMITTED_SELF_REPORTED'),
      bookmark('bm-04', 'SYN-OPP-010', 'AWAITING_RESULT'),
      bookmark('bm-05', 'SYN-OPP-013', 'RESULT_RECORDED', {provenance: 'USER_ENTERED_UNVERIFIED', result: 'WAITLISTED', note: '가상 메모'}),
      bookmark('bm-06', 'SYN-OPP-015'), // legacy SAVED without stage → 관심
      bookmark('bm-07', 'SYN-OPP-999', 'PREPARING'), // posting no longer readable
    ],
    tasks: [
      task('act-01', 'SYN-OPP-004', '가상 자기소개서 초안 쓰기', true),
      task('act-02', 'SYN-OPP-004', '가상 포트폴리오 링크 정리', false),
    ],
  };
}

export interface SyntheticOwnerOptions {
  /** Every /api/auth/session answers with this error (e.g. 401 signed out, 403 REVIEWER-like). */
  readonly sessionError?: ApiErrorCode;
  /** The session answers as a REVIEWER (not a BETA owner). */
  readonly reviewerSession?: boolean;
}

export class SyntheticOwnerServer {
  readonly bookmarks: OwnerWorkspaceRecord[];
  readonly tasks: OwnerWorkspaceRecord[];
  /** Next write to these paths fails once with the given code (test hook). */
  readonly failNext = new Map<string, ApiErrorCode>();
  sessionError: ApiErrorCode | undefined;
  actorId = SYNTHETIC_OWNER_ID;

  constructor(private readonly options: SyntheticOwnerOptions = {}) {
    const seed = seedOwnerRecords();
    this.bookmarks = seed.bookmarks;
    this.tasks = seed.tasks;
    this.sessionError = options.sessionError;
  }

  /** Simulate an edit from another tab/device: bumps the stored version. */
  touch(itemId: string): void {
    const list = this.bookmarks.some(b => b.itemId === itemId) ? this.bookmarks : this.tasks;
    const i = list.findIndex(r => r.itemId === itemId);
    if (i >= 0) list[i] = {...list[i]!, version: list[i]!.version + 1};
  }

  readonly fetch: ApiFetch = async (url, init) => {
    const method = init?.method ?? 'GET';
    const [path, search = ''] = url.split('?');
    const query = new URLSearchParams(search);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {};
    if (path === '/api/auth/session') {
      if (this.sessionError) return fail(this.sessionError);
      return this.options.reviewerSession
        ? json({role: 'REVIEWER', accessEndsAt: '2026-12-09T15:00:00.000Z', dataMode: 'SYNTHETIC', readOnly: false, sandboxOnly: true})
        : json({actorId: this.actorId, role: 'BETA', schoolMailProofValid: true, betaAllowed: true});
    }
    if (path === '/api/auth/csrf') return json({csrfToken: 'SYN-CSRF-TOKEN-000000'});
    const planned = this.failNext.get(path ?? '');
    if (planned && method !== 'GET') { this.failNext.delete(path ?? ''); return fail(planned); }

    const page = (list: OwnerWorkspaceRecord[]) => {
      const after = query.get('afterId') ?? '';
      return json({items: [...list].sort((a, b) => a.itemId < b.itemId ? -1 : 1).filter(r => r.itemId > after), nextCursor: null});
    };
    if (path === '/api/saved-items' && method === 'GET') return page(this.bookmarks);
    if (path === '/api/action-plans' && method === 'GET') return page(this.tasks);
    if (path === '/api/opportunities' && method === 'GET') {
      const first = DEMO_OPPORTUNITIES.slice().sort((a, b) => a.id < b.id ? -1 : 1)[0]!;
      return json({asOf: DEMO_AS_OF, nextCursor: null, items: [catalogItem(first)]});
    }
    const opp = /^\/api\/opportunities\/([^/]+)$/.exec(path ?? '');
    if (opp && method === 'GET') {
      const o = DEMO_OPPORTUNITIES.find(x => x.id === decodeURIComponent(opp[1]!));
      return o ? json(catalogItem(o)) : fail('FORBIDDEN');
    }
    const saved = /^\/api\/saved-items\/([A-Za-z0-9_-]+)$/.exec(path ?? '');
    if (saved && method === 'PATCH') {
      const i = this.bookmarks.findIndex(b => b.itemId === saved[1]);
      const cur = this.bookmarks[i];
      if (!cur || cur.value.kind !== 'BOOKMARK') return fail('FORBIDDEN');
      const stage = body.stage as BookmarkStage;
      if (body.expectedVersion !== cur.version || !isNextBookmarkStage(cur.value.stage, stage)) return fail('VERSION_CONFLICT');
      const {outcome: _o, ...rest} = cur.value;
      const next: OwnerWorkspaceRecord = {itemId: cur.itemId, version: cur.version + 1, updatedAt: DEMO_AS_OF,
        value: {...rest, stage, ...(body.outcome ? {outcome: body.outcome as never} : {})}};
      this.bookmarks[i] = next;
      return json({item: next});
    }
    if (path === '/api/action-plans' && method === 'POST') {
      const item: OwnerWorkspaceRecord = {itemId: String(body.itemId), version: 1, updatedAt: DEMO_AS_OF, value: body.value as never};
      this.tasks.push(item);
      return json({item});
    }
    const plan = /^\/api\/action-plans\/([A-Za-z0-9_-]+)$/.exec(path ?? '');
    if (plan && method === 'PATCH') {
      const i = this.tasks.findIndex(t => t.itemId === plan[1]);
      const cur = this.tasks[i];
      if (!cur) return fail('FORBIDDEN');
      if (body.expectedVersion !== cur.version) return fail('VERSION_CONFLICT');
      const next: OwnerWorkspaceRecord = {itemId: cur.itemId, version: cur.version + 1, updatedAt: DEMO_AS_OF, value: body.value as never};
      this.tasks[i] = next;
      return json({item: next});
    }
    return fail('FORBIDDEN');
  };
}

function catalogItem(o: (typeof DEMO_OPPORTUNITIES)[number]) {
  return {opportunity: o, source: {sourceId: 'SYN-SRC-OWNER', revisionId: o.sourceSnapshotId, permissionRef: 'synthetic-demo', status: 'SYNTHETIC'}};
}
