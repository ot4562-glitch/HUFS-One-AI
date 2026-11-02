import {useEffect, useState} from 'react';
import type {DemoContext, DemoSnapshot} from '@hufs-one/contracts';
import type {ClubBoard} from '../../../../../packages/core/src/opportunities/clubs.js';
import type {DemoController, DemoViewState} from '../../app/index.js';
import {buildClubBoard, type ClubBoardView} from './clubView.js';

/** Club board for the current demo context (synthetic only until a club API exists, #123). */
export interface ClubPort {
  loadBoard(context: DemoContext, signal: AbortSignal): Promise<ClubBoard>;
}

export type ClubBoardState =
  | {readonly status: 'NONE'}
  | {readonly status: 'LOADING'}
  | {readonly status: 'ERROR'}
  | {readonly status: 'READY'; readonly view: ClubBoardView};

type Loaded = {readonly key: string; readonly snapshot: DemoSnapshot; readonly result: ClubBoardState};

/**
 * Loads through DemoController.runContextOperation and binds the result to the exact snapshot it was
 * requested for, so another subject's board, an older snapshot or a late response is never rendered.
 */
export function useClubBoard(controller: DemoController, state: DemoViewState, port: ClubPort | undefined): ClubBoardState {
  const contextId = state.status === 'READY' ? state.context?.contextId ?? null : null;
  const snapshot = state.status === 'READY' ? state.snapshot : null;
  const key = `${state.epoch}:${contextId ?? ''}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!port || !contextId || !snapshot) { setLoaded(null); return; }
    setLoaded({key, snapshot, result: {status: 'LOADING'}});
    let live = true;
    void controller.runContextOperation((ctx, signal) => port.loadBoard(ctx, signal)).then(board => {
      if (!live) return;
      if (board === null) { setLoaded(null); return; } // stale, denied or cancelled: controller state explains
      const built = buildClubBoard(board, snapshot.asOf);
      setLoaded({key, snapshot, result: built.ok ? {status: 'READY', view: built.view} : {status: 'ERROR'}});
    });
    return () => { live = false; };
  }, [port, controller, contextId, key, snapshot]);

  if (!port || !snapshot) return {status: 'NONE'};
  if (!loaded || loaded.key !== key || loaded.snapshot !== snapshot) return {status: 'LOADING'};
  return loaded.result;
}
