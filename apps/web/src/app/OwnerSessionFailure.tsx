import type {ReactNode} from 'react';
import type {OwnerSessionController} from './owner-session-controller.js';

/** Private screens show no previous content while re-authorizing after a 503. */
export function OwnerSessionFailure({controller,children}:{
  controller:OwnerSessionController;children:ReactNode;
}){
  const state=controller.getState();
  const canRetry=state.status==='UNAVAILABLE'||state.status==='CONFLICT';
  return <section role="alert">
    <p>{children}</p>
    {canRetry&&<button type="button" onClick={()=>{void controller.retry();}}>
      현재 계정·권한 다시 확인
    </button>}
  </section>;
}
