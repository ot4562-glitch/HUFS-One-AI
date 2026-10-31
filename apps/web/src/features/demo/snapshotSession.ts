import {
  ApiErrorSchema,
  DemoContextSchema,
  DemoSnapshotSchema,
  isSnapshotCurrent,
  makeApiError,
  type ApiError,
  type DemoContext,
  type DemoSnapshot,
} from '@hufs-one/contracts';

/**
 * Tab-local demo subject session. Pure reducer: no fetch, timers or storage.
 * The server re-checks the sharing grant on every request; this only guarantees
 * that the screen never shows another subject's, epoch's or version's data.
 */
export type DemoSessionStatus =
  | 'IDLE'
  | 'LOADING'
  | 'READY'
  | 'REVOKED'      // 403 SHARING_REVOKED / FORBIDDEN: reselect required, no retry
  | 'CONFLICT'     // 409 VERSION_CONFLICT: refetch with a new epoch
  | 'UNAVAILABLE'  // 429/503 or unparseable error: retryable
  | 'SIGNED_OUT'   // 401
  | 'INVALID';     // malformed context or snapshot: never rendered

export interface DemoSessionState {
  readonly epoch: number;
  readonly context: DemoContext | null;
  readonly status: DemoSessionStatus;
  readonly snapshot: DemoSnapshot | null;
  readonly error: ApiError | null;
  /** Late, duplicate or cross-subject responses discarded so far (for tests/telemetry, no payload kept). */
  readonly droppedResponses: number;
}

export type DemoSessionEvent =
  | {readonly type: 'SELECT'; readonly context: unknown}
  | {readonly type: 'RETRY'}
  | {readonly type: 'CLEAR'}
  | {readonly type: 'SNAPSHOT_RECEIVED'; readonly requestEpoch: number; readonly payload: unknown}
  | {readonly type: 'ERROR_RECEIVED'; readonly requestEpoch: number; readonly payload: unknown};

export const initialDemoSession: DemoSessionState = {
  epoch: 0, context: null, status: 'IDLE', snapshot: null, error: null, droppedResponses: 0,
};

const RETRYABLE: ReadonlySet<DemoSessionStatus> = new Set(['CONFLICT', 'UNAVAILABLE', 'INVALID']);

export function canRetry(state: DemoSessionState): boolean {
  return state.context !== null && RETRYABLE.has(state.status);
}

function drop(state: DemoSessionState): DemoSessionState {
  return {...state, droppedResponses: state.droppedResponses + 1};
}

function isForPendingRequest(state: DemoSessionState, requestEpoch: number): state is DemoSessionState & {context: DemoContext} {
  return state.status === 'LOADING' && state.context !== null && requestEpoch === state.epoch;
}

function statusForError(err: ApiError): DemoSessionStatus {
  switch (err.code) {
    case 'SHARING_REVOKED':
    case 'FORBIDDEN':
      return 'REVOKED';
    case 'VERSION_CONFLICT':
      return 'CONFLICT';
    case 'UNAUTHENTICATED':
      return 'SIGNED_OUT';
    case 'INVALID_INPUT':
    case 'UNVERIFIED_EVIDENCE':
      return 'INVALID';
    case 'RATE_LIMITED':
    case 'PROVIDER_UNAVAILABLE':
      return 'UNAVAILABLE';
  }
}

export function reduceDemoSession(state: DemoSessionState, event: DemoSessionEvent): DemoSessionState {
  switch (event.type) {
    case 'SELECT': {
      const parsed = DemoContextSchema.safeParse(event.context);
      // Previous subject's snapshot is cleared before the new request starts.
      if (!parsed.success) return {...state, epoch: state.epoch + 1, context: null, status: 'INVALID', snapshot: null, error: null};
      return {...state, epoch: state.epoch + 1, context: parsed.data, status: 'LOADING', snapshot: null, error: null};
    }
    case 'RETRY':
      if (!canRetry(state)) return state;
      return {...state, epoch: state.epoch + 1, status: 'LOADING', snapshot: null, error: null};
    case 'CLEAR':
      return {...initialDemoSession, epoch: state.epoch + 1, droppedResponses: state.droppedResponses};
    case 'SNAPSHOT_RECEIVED': {
      if (!isForPendingRequest(state, event.requestEpoch)) return drop(state);
      const parsed = DemoSnapshotSchema.safeParse(event.payload);
      if (!parsed.success) return {...state, status: 'INVALID', snapshot: null, error: null};
      const current = isSnapshotCurrent(parsed.data, {
        context: state.context, selectionEpoch: event.requestEpoch, currentSelectionEpoch: state.epoch,
      });
      if (!current) return drop(state);
      return {...state, status: 'READY', snapshot: parsed.data, error: null};
    }
    case 'ERROR_RECEIVED': {
      if (!isForPendingRequest(state, event.requestEpoch)) return drop(state);
      const parsed = ApiErrorSchema.safeParse(event.payload);
      // Never echo an unvalidated provider body to the screen.
      const err = parsed.success ? parsed.data : makeApiError('PROVIDER_UNAVAILABLE', 'CLIENT-UNPARSEABLE', state.context.contextId);
      if (err.contextId !== undefined && err.contextId !== state.context.contextId) return drop(state);
      return {...state, status: statusForError(err), snapshot: null, error: err};
    }
  }
}
