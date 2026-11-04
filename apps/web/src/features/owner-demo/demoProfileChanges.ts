/** Cross-tab invalidation only: no identity, version, settings or private payloads. */
export interface DemoProfileChanges {
  subscribe(listener:()=>void):()=>void;
  notify():void;
  close?():void;
}
export function openDemoProfileChanges():DemoProfileChanges{
  const listeners=new Set<()=>void>();
  let channel:BroadcastChannel|null=null;
  try{if(typeof BroadcastChannel!=='undefined')channel=new BroadcastChannel('hufs-empty-demo-v1');}catch{/* resume revalidation remains available */}
  if(channel)channel.onmessage=event=>{
    const v=event.data;
    if(!v||typeof v!=='object'||Object.keys(v).length!==2||v.kind!=='EMPTY_DEMO_INVALIDATED'||v.version!==1)return;
    for(const listener of listeners)listener();
  };
  return {
    subscribe(listener){listeners.add(listener);return ()=>{listeners.delete(listener);};},
    notify(){try{channel?.postMessage({kind:'EMPTY_DEMO_INVALIDATED',version:1});}catch{/* fail closed on resume */}},
    close(){listeners.clear();channel?.close();channel=null;},
  };
}
