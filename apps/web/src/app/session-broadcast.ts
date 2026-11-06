export interface SessionClosureController {
  subscribe(listener: () => void): () => void;
  getState(): {readonly status: string};
  invalidateLocalSession(): void;
}

/**
 * React UI owner may create BroadcastChannel(SESSION_CLOSE_CHANNEL) in a
 * browser-only effect and pass it here. Do not create it during SSR.
 *
 * Messages contain neither identity nor consent data. Receiving a signal
 * can only CLEAR locally displayed data; it cannot grant new access.
 * This complements (never replaces) server revocation and visible-tab
 * resume revalidation when BroadcastChannel is unavailable.
 */
export const SESSION_CLOSE_CHANNEL='hufs-one-session-close-v1';
const KIND='HUFS_SESSION_CLOSED';
const VERSION=1;

export interface SessionCloseChannel {
  postMessage(value:unknown):void;
  addEventListener(type:'message',listener:(event:MessageEvent)=>void):void;
  removeEventListener(type:'message',listener:(event:MessageEvent)=>void):void;
}

function validCloseEvent(raw:unknown):boolean {
  return raw!==null && typeof raw==='object'
    &&!Array.isArray(raw)
    &&Object.keys(raw).length===2
    &&'kind' in raw&&raw.kind===KIND
    &&'version' in raw&&raw.version===VERSION;
}

export function attachCrossTabSessionClosure(
  controller:SessionClosureController,
  channel:SessionCloseChannel,
):()=>void {
  if(!controller||typeof controller.subscribe!=='function'
    ||typeof controller.getState!=='function'
    ||typeof controller.invalidateLocalSession!=='function'
    ||!channel||typeof channel.postMessage!=='function'
    ||typeof channel.addEventListener!=='function'
    ||typeof channel.removeEventListener!=='function')
    throw new Error('Cross-tab session close requires a browser-only channel');

  let sent=false;
  const onState=()=>{
    if(!sent&&controller.getState().status==='SIGNED_OUT'){
      sent=true;
      try{
        channel.postMessage({kind:KIND,version:VERSION});
      }catch {
        // A closed/unavailable channel must not keep a locally revoked session.
      }
    }
  };
  const onMessage=(event:MessageEvent)=>{
    if(!validCloseEvent(event.data))return;
    sent=true; // Prevent a cascade of close signals bouncing between tabs.
    controller.invalidateLocalSession();
  };
  channel.addEventListener('message',onMessage);
  const unsubscribe=controller.subscribe(onState);
  onState(); // A controller that already closed must not appear active here.
  let detached=false;
  return ()=>{
    if(detached)return;
    detached=true;
    unsubscribe();
    channel.removeEventListener('message',onMessage);
  };
}
