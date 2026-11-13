import {it,expect,vi,afterEach} from 'vitest';
import {createHash} from 'node:crypto';
import {PostgresRecognitionPrivateAssets} from '../../apps/api/src/modules/profiles/recognition-private-assets-postgres.js';
import {createMaskedRecognitionPng} from '../../apps/api/src/modules/recognition-private-preview.js';
const actorId='SYN-ASSET-OWNER',activityId='SYN-ACTIVITY',now='2026-11-13T01:00:00Z',expiresAt='2026-11-13T01:02:00Z';
const grant={actorId,activityId,storageConsentVersion:1,consentVersion:'SYN-CONSENT',rightsVersion:'SYN-RIGHTS',expiresAt};
afterEach(()=>vi.useRealTimers());
function setup(){
  let current=true;
  const pool={connect:vi.fn(async()=>{throw Error('Must not reach SQL');})};
  const authority={grant:vi.fn(async()=>grant),revalidate:vi.fn(async()=>current),mayErase:vi.fn(async()=>current)};
  const scanner={inspect:vi.fn(async(i:{sha256:string;mimeType:string})=>({state:'CLEAN',sha256:i.sha256,mimeType:i.mimeType,
    receiptId:'SYN-SCAN',inspectorVersion:'SYN-INSPECTOR',inspectedAt:now,expiresAt}))};
  const store=new PostgresRecognitionPrivateAssets(pool,authority,scanner,()=>now);
  const bytes=createMaskedRecognitionPng({width:2,height:2,rgba:new Uint8Array(16)},[]).png;
  const input={actorId,activityId,requestId:'00000000-0000-4000-8000-000000000001',contextVersion:store.contextVersion(grant),mimeType:'image/png' as const,bytes};
  return {store,pool,authority,scanner,input,revoke:()=>{current=false;}};
}
it('rejects stale upload scope and oversized/mismatched file declarations before scanning or SQL',async()=>{
  const h=setup();
  await expect(h.store.intake({...h.input,contextVersion:'f'.repeat(64)})).rejects.toThrow();
  await expect(h.store.intake({...h.input,bytes:Buffer.alloc(2*1024*1024+1)})).rejects.toThrow();
  await expect(h.store.intake({...h.input,mimeType:'application/pdf'})).rejects.toThrow();
  expect(h.scanner.inspect).not.toHaveBeenCalled();expect(h.pool.connect).not.toHaveBeenCalled();
});
it('denies infected, mismatched, expired or mutated inspection receipts before storage',async()=>{
  const h=setup(),original=h.scanner.inspect;
  for(const override of [{state:'INFECTED'},{sha256:'f'.repeat(64)},{expiresAt:now},{mimeType:'application/pdf'}]){
    h.scanner.inspect.mockImplementationOnce(async i=>({...await original.getMockImplementation()!(i),...override}) as never);
    await expect(h.store.intake(h.input)).rejects.toThrow();
  }
  expect(h.pool.connect).not.toHaveBeenCalled();
});
it('revalidates current rights after asynchronous inspection and before database connection',async()=>{
  const h=setup();h.scanner.inspect.mockImplementationOnce(async i=>{
    h.revoke();return {state:'CLEAN',sha256:i.sha256,mimeType:i.mimeType,receiptId:'SYN-SCAN',inspectorVersion:'SYN-INSPECTOR',inspectedAt:now,expiresAt};
  });
  await expect(h.store.intake(h.input)).rejects.toThrow();expect(h.pool.connect).not.toHaveBeenCalled();
});
it('copies caller bytes before awaiting inspection and checks inspector byte mutations',async()=>{
  const h=setup(),hash=createHash('sha256').update(h.input.bytes).digest('hex');
  h.scanner.inspect.mockImplementationOnce(async i=>{
    const inspected=i as typeof i&{bytes:Buffer};inspected.bytes[0]=0;
    return {state:'CLEAN',sha256:hash,mimeType:i.mimeType,receiptId:'SYN-SCAN',inspectorVersion:'SYN-INSPECTOR',inspectedAt:now,expiresAt};
  });
  await expect(h.store.intake(h.input)).rejects.toThrow();expect(h.input.bytes[0]).toBe(137);expect(h.pool.connect).not.toHaveBeenCalled();
});
it('bounds inspection and discards late clean receipts without creating any SQL work',async()=>{
  vi.useFakeTimers();const h=setup();let finish!:(value:unknown)=>void;
  h.scanner.inspect.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}) as never);
  const rejected=expect(h.store.intake(h.input)).rejects.toThrow();await vi.advanceTimersByTimeAsync(5001);await rejected;
  finish({state:'CLEAN',sha256:createHash('sha256').update(h.input.bytes).digest('hex'),mimeType:'image/png',
    receiptId:'SYN-LATE',inspectorVersion:'SYN-INSPECTOR',inspectedAt:now,expiresAt});
  await vi.advanceTimersByTimeAsync(0);expect(h.pool.connect).not.toHaveBeenCalled();
});
it('releases a late SQL connection after timeout without starting its transaction',async()=>{
  vi.useFakeTimers();const h=setup();let finish!:(value:unknown)=>void;
  const connection={query:vi.fn(),release:vi.fn()};
  h.pool.connect.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}) as never);
  const rejected=expect(h.store.policy({actorId,activityId})).rejects.toThrow();await vi.advanceTimersByTimeAsync(5001);await rejected;
  finish(connection);await vi.advanceTimersByTimeAsync(0);expect(connection.query).not.toHaveBeenCalled();expect(connection.release).toHaveBeenCalledOnce();
});
it('does not inspect or connect when the parent request was already aborted',async()=>{
  const h=setup(),controller=new AbortController();controller.abort();
  await expect(h.store.intake({...h.input,signal:controller.signal})).rejects.toThrow();
  expect(h.authority.grant).not.toHaveBeenCalled();expect(h.scanner.inspect).not.toHaveBeenCalled();expect(h.pool.connect).not.toHaveBeenCalled();
});
