import {useCallback, useEffect, useState} from 'react';
import type {DemoContext} from '@hufs-one/contracts';
import type {DemoController, DemoViewState} from '../../app/index.js';
import type {ReviewerSandboxClientAction, ReviewerSandboxClientResult} from '../../integrations/reviewer-sandbox-contract.js';
import {EMPTY_SANDBOX, deriveSandbox, type SandboxState} from './sandboxState.js';

export type SandboxAction = ReviewerSandboxClientAction;
export type SandboxActionKind = SandboxAction['kind'];

/** Port to the REVIEWER sandbox API; present only for a verified REVIEWER session. */
export interface SandboxPort {
  readonly allowedActions: ReadonlySet<SandboxActionKind>;
  read(context: DemoContext, signal: AbortSignal): Promise<ReviewerSandboxClientResult>;
  save(context: DemoContext, action: SandboxAction, signal: AbortSignal): Promise<ReviewerSandboxClientResult>;
}

export interface SandboxApi {
  readonly ready: boolean;
  readonly busy: boolean;
  readonly state: SandboxState;
  can(kind: SandboxActionKind): boolean;
  /** Resolves true when the server accepted it; false if denied, stale or failed. */
  save(action: SandboxAction): Promise<boolean>;
}

/**
 * Loads and updates the sandbox log for the current context only, via
 * DemoController.runContextOperation, so a previous subject's/epoch's log is never shown and a
 * 401/403 on these calls clears the screen like any other context error.
 */
export function useSandbox(controller: DemoController, view: DemoViewState, port: SandboxPort | undefined): SandboxApi | null {
  const contextId = view.status === 'READY' ? view.context?.contextId ?? null : null;
  const key = `${view.epoch}:${contextId ?? ''}`;
  const [loaded, setLoaded] = useState<{key: string; state: SandboxState} | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!port || !contextId) { setLoaded(null); return; }
    let live = true;
    void controller.runContextOperation((ctx, signal) => port.read(ctx, signal)).then(r => {
      if (live && r) setLoaded({key, state: deriveSandbox(r.actions)});
    });
    return () => { live = false; };
  }, [port, controller, contextId, key, view.snapshot]);

  const save = useCallback(async (action: SandboxAction) => {
    if (!port || !port.allowedActions.has(action.kind)) return false;
    setBusy(true);
    try {
      const r = await controller.runContextOperation((ctx, signal) => port.save(ctx, action, signal));
      if (!r) return false;
      setLoaded({key, state: deriveSandbox(r.actions)});
      return true;
    } finally {
      setBusy(false);
    }
  }, [port, controller, key]);

  if (!port) return null;
  const ready = loaded !== null && loaded.key === key;
  return {
    ready,
    busy,
    state: ready ? loaded.state : EMPTY_SANDBOX,
    can: kind => ready && port.allowedActions.has(kind),
    save,
  };
}
