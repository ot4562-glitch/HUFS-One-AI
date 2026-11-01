import {useEffect, useSyncExternalStore} from 'react';
import {
  SESSION_CLOSE_CHANNEL, attachCrossTabSessionClosure, attachDemoResumeRevalidation, useDemoControllerState,
  type DemoController, type DemoViewState,
} from '../app/index.js';

/**
 * Binds a tab-owned DemoController to React. The controller is created once per tab
 * (main.tsx) and never disposed here, so StrictMode's double effects cannot kill it.
 */
export function useDemo(controller: DemoController): DemoViewState {
  const state = useDemoControllerState(controller, useSyncExternalStore);

  useEffect(() => { void controller.loadProfiles(); }, [controller]);

  // Hide data on focus/visibility return, then re-check the live server grant.
  useEffect(() => attachDemoResumeRevalidation(controller, {page: document, view: window}), [controller]);

  // Clear this tab when another tab of the same origin signs out (no identity in the message).
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(SESSION_CLOSE_CHANNEL);
    const detach = attachCrossTabSessionClosure(controller, channel);
    return () => { detach(); channel.close(); };
  }, [controller]);

  return state;
}
