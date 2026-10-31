import type {DemoController,DemoViewState} from './demo-controller.js';

/**
 * React 18+ integration without claiming ownership of the UI track's components.
 * UI owner usage:
 *   const view = useDemoControllerState(controller, useSyncExternalStore);
 * Subscribe to a tab-owned controller once; immutable snapshots prevent tearing.
 */
export type UseSyncExternalStore = (
  subscribe:(callback:()=>void)=>()=>void,
  getSnapshot:()=>DemoViewState,
  getServerSnapshot:()=>DemoViewState,
)=>DemoViewState;

export function useDemoControllerState(
  controller:DemoController, useSyncExternalStore:UseSyncExternalStore,
):DemoViewState {
  return useSyncExternalStore(controller.subscribe,controller.getState,controller.getState);
}
