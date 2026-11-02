import {useCallback, useEffect, useState, useSyncExternalStore} from 'react';
import type {BookmarkOutcome, BookmarkStage, OpportunityCatalogDetail, OwnerWorkspaceRecord} from '@hufs-one/contracts';
import type {OwnerSessionController, OwnerSessionState} from '../../app/index.js';
import {buildBoard, type BoardColumn} from './boardView.js';
import type {BoardPort} from './boardPort.js';

interface Loaded {
  /** Session scope the data was read in; anything else is never rendered. */
  readonly session: OwnerSessionController;
  readonly epoch: number;
  readonly bookmarks: readonly OwnerWorkspaceRecord[];
  readonly tasks: readonly OwnerWorkspaceRecord[];
  readonly details: ReadonlyMap<string, OpportunityCatalogDetail | null>;
  readonly asOf: string | null;
}

export type BoardStatus = 'LOADING' | 'READY' | 'SIGNED_OUT' | 'FORBIDDEN' | 'CONFLICT' | 'UNAVAILABLE';

export interface BoardApi {
  readonly status: BoardStatus;
  readonly columns: readonly BoardColumn[];
  readonly busy: boolean;
  /** Changes whenever the session scope or its epoch changes: key local inputs with it. */
  readonly scope: string;
  readonly synthetic: boolean;
  advance(itemId: string, stage: BookmarkStage, outcome?: BookmarkOutcome): Promise<boolean>;
  addTask(bookmarkItemId: string, task: string): Promise<boolean>;
  setTaskDone(taskItemId: string, done: boolean): Promise<boolean>;
  reload(): void;
}

const EMPTY: readonly BoardColumn[] = buildBoard([], [], new Map(), null);
const IDLE: OwnerSessionState = {epoch: 0, status: 'IDLE', error: null};
const NO_SESSION = {subscribe: () => () => {}, getState: () => IDLE};

function statusOf(s: OwnerSessionState): BoardStatus {
  if (s.status === 'READY') return 'READY';
  if (s.status === 'IDLE' || s.status === 'CHECKING') return 'LOADING';
  return s.status;
}

/**
 * Owner-private #80 data. Reads go through runLatest and writes through runMutation, so a logout,
 * account change, 401/403 or a response that arrives after the scope changed is dropped. A 409 puts the
 * session in CONFLICT; 다시 불러오기 starts a new session scope and reads everything again.
 */
export function useApplicationBoard(port: BoardPort): BoardApi {
  const [generation, setGeneration] = useState(0);
  // Created in the effect (not in render) so StrictMode's cleanup cannot leave a disposed session in use.
  const [session, setSession] = useState<OwnerSessionController | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const store = session ?? NO_SESSION;
  const state = useSyncExternalStore(store.subscribe, store.getState);

  useEffect(() => {
    const s = port.createSession();
    setSession(s);
    void s.initialize();
    return () => { s.dispose(); setSession(prev => prev === s ? null : prev); };
  }, [port, generation]);

  useEffect(() => {
    if (!session || state.status !== 'READY') { setLoaded(null); return; }
    let live = true;
    const epoch = state.epoch;
    void (async () => {
      const [bookmarks, tasks, asOf] = await Promise.all([
        session.runLatest('board:bookmarks', s => port.listBookmarks(s)),
        session.runLatest('board:tasks', s => port.listTasks(s)),
        session.runLatest('board:asof', s => port.serverAsOf(s)),
      ]);
      if (!live || bookmarks === null || tasks === null) return;
      const ids = [...new Set(bookmarks.flatMap(b => b.value.kind === 'BOOKMARK' ? [b.value.opportunityId] : []))];
      // A posting that cannot be read (removed, rights withdrawn) keeps its card with "공고 정보 없음".
      const found = await Promise.all(ids.map(id => session.runLatest(`board:opp:${id}`, s => port.getOpportunity(id, s).catch(() => null))));
      if (!live) return;
      setLoaded({session, epoch, bookmarks, tasks, details: new Map(ids.map((id, i) => [id, found[i] ?? null])), asOf});
    })();
    return () => { live = false; };
  }, [session, state.status, state.epoch, port]);

  const current = session !== null && loaded !== null && loaded.session === session && loaded.epoch === state.epoch && state.status === 'READY';

  const write = useCallback(async (perform: (s: AbortSignal) => Promise<OwnerWorkspaceRecord>, kind: 'bookmarks' | 'tasks') => {
    if (!session) return false;
    setBusy(true);
    try {
      const item = await session.runMutation(perform);
      if (!item) return false; // stale, denied, conflicted or cancelled: session state explains
      setLoaded(prev => {
        if (!prev || prev.session !== session) return prev;
        const list = prev[kind];
        const next = list.some(r => r.itemId === item.itemId) ? list.map(r => r.itemId === item.itemId ? item : r) : [...list, item];
        return {...prev, [kind]: next};
      });
      return true;
    } finally {
      setBusy(false);
    }
  }, [session]);

  const find = (list: readonly OwnerWorkspaceRecord[] | undefined, id: string) => list?.find(r => r.itemId === id);

  return {
    status: current ? 'READY' : state.status === 'READY' ? 'LOADING' : statusOf(state),
    columns: current ? buildBoard(loaded.bookmarks, loaded.tasks, loaded.details, loaded.asOf) : EMPTY,
    busy,
    scope: `${session ? idOf(session) : 0}:${state.epoch}:${current ? 'ready' : 'none'}`,
    synthetic: current && loaded.bookmarks.some(b => b.value.kind === 'BOOKMARK' && b.value.dataMode === 'SYNTHETIC'),
    advance: async (itemId, stage, outcome) => {
      const r = current ? find(loaded.bookmarks, itemId) : undefined;
      return r ? write(s => port.advance(r, outcome ? {stage, outcome} : {stage}, s), 'bookmarks') : false;
    },
    addTask: async (bookmarkItemId, task) => {
      const b = current ? find(loaded.bookmarks, bookmarkItemId) : undefined;
      return b ? write(s => port.addTask(b, task, s), 'tasks') : false;
    },
    setTaskDone: async (taskItemId, done) => {
      const t = current ? find(loaded.tasks, taskItemId) : undefined;
      return t ? write(s => port.setTaskDone(t, done, s), 'tasks') : false;
    },
    reload: () => { setLoaded(null); setGeneration(g => g + 1); },
  };
}

const ids = new WeakMap<object, number>();
let nextId = 1;
/** Stable small number per session object, for the input scope key. */
function idOf(o: object): number {
  let id = ids.get(o);
  if (id === undefined) { id = nextId++; ids.set(o, id); }
  return id;
}
