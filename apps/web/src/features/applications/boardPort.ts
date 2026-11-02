import type {BookmarkOutcome, BookmarkStage, OpportunityCatalogDetail, OwnerWorkspaceRecord} from '@hufs-one/contracts';
import {OwnerSessionController} from '../../app/index.js';
import type {HufsApiClient} from '../../integrations/index.js';

/** What the #80 board needs; all calls run inside one OwnerSessionController (actor + epoch guarded). */
export interface BoardPort {
  /** A fresh owner session scope; the board makes a new one after a conflict or on 다시 불러오기. */
  createSession(): OwnerSessionController;
  listBookmarks(signal: AbortSignal): Promise<OwnerWorkspaceRecord[]>;
  listTasks(signal: AbortSignal): Promise<OwnerWorkspaceRecord[]>;
  getOpportunity(opportunityId: string, signal: AbortSignal): Promise<OpportunityCatalogDetail>;
  /** The server's reference time for D-day (catalog page asOf); never the browser clock. */
  serverAsOf(signal: AbortSignal): Promise<string>;
  advance(record: OwnerWorkspaceRecord, change: {stage: BookmarkStage; outcome?: BookmarkOutcome}, signal: AbortSignal): Promise<OwnerWorkspaceRecord>;
  addTask(bookmark: OwnerWorkspaceRecord, task: string, signal: AbortSignal): Promise<OwnerWorkspaceRecord>;
  setTaskDone(task: OwnerWorkspaceRecord, done: boolean, signal: AbortSignal): Promise<OwnerWorkspaceRecord>;
}

const MAX_PAGES = 4; // 200 records; the board is a personal list, not a search

function newTaskId(): string {
  const raw = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `act-${raw.replace(/[^A-Za-z0-9]/g, '').slice(0, 32)}`;
}

/** Real owner API. The server still checks the owner, consent and version on every call. */
export function boardPort(api: HufsApiClient): BoardPort {
  const all = async (kind: 'BOOKMARK' | 'ACTION_PLAN', signal: AbortSignal) => {
    const out: OwnerWorkspaceRecord[] = [];
    let afterId: string | undefined;
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await api.owner.listWorkspace(kind, afterId ? {afterId} : {}, signal);
      out.push(...page.items);
      if (!page.nextCursor) break;
      afterId = page.nextCursor;
    }
    return out;
  };
  return {
    createSession: () => new OwnerSessionController(api),
    listBookmarks: signal => all('BOOKMARK', signal),
    listTasks: signal => all('ACTION_PLAN', signal),
    getOpportunity: (id, signal) => api.owner.getOpportunity(id, signal),
    serverAsOf: async signal => (await api.owner.listOpportunities({limit: 1}, signal)).asOf,
    advance: async (record, change, signal) => (await api.owner.advanceBookmarkStage(record, change, signal)).item,
    addTask: async (bookmark, task, signal) => {
      if (bookmark.value.kind !== 'BOOKMARK') throw new TypeError('not a bookmark');
      const value = {kind: 'ACTION_PLAN' as const, dataMode: bookmark.value.dataMode, state: 'DRAFT' as const,
        opportunityId: bookmark.value.opportunityId, task, done: false};
      return (await api.owner.createWorkspace({itemId: newTaskId(), value}, signal)).item;
    },
    setTaskDone: async (task, done, signal) => {
      if (task.value.kind !== 'ACTION_PLAN') throw new TypeError('not a task');
      return (await api.owner.updateWorkspace(task.itemId, {expectedVersion: task.version, value: {...task.value, done}}, signal)).item;
    },
  };
}
