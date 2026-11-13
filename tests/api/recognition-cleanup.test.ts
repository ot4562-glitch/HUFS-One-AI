import {it,expect,vi,afterEach} from 'vitest';
import {PostgresRecognitionCleanupOutbox,drainProofCleanup,type ProofCleanupJob,type ProofCleanupOutbox} from '../../apps/api/src/modules/profiles/recognition-cleanup-postgres.js';
const now='2026-11-13T00:00:00Z';
const job:ProofCleanupJob={actorId:'SYN-OWNER',itemId:'SYN-PROOF',assetId:'SYN-ASSET',assetVersion:'SYN-V1',recordVersion:2,operation:'PURGE_DOCUMENT'};
const receipt={actorId:job.actorId,assetId:job.assetId,assetVersion:job.assetVersion,operation:job.operation,
  receiptId:'SYN-RECEIPT',erasedAt:now,erasedComponents:['ORIGINAL_ASSET','OCR_CACHE','DERIVED_FIELDS','MODEL_INPUTS']};
function fixture(){
  const outbox:ProofCleanupOutbox={list:vi.fn(async()=>[job]),find:vi.fn(async()=>null),blockedProofIds:vi.fn(async()=>[]),
    acknowledge:vi.fn(async()=>true),isAssetBlocked:vi.fn(async()=>true)};
  const eraser={erase:vi.fn(async(_input:unknown):Promise<unknown>=>receipt),verifyErasure:vi.fn(async()=>true)};
  return {outbox,eraser,input:{actorId:job.actorId,outbox,eraser,now:()=>now}};
}
afterEach(()=>vi.useRealTimers());
it('has no synthetic erase fallback and does not read jobs without an eraser',async()=>{
  const f=fixture();expect(await drainProofCleanup({actorId:job.actorId,outbox:f.outbox,now:()=>now})).toMatchObject({state:'NOT_CONNECTED',acknowledged:0});
  expect(f.outbox.list).not.toHaveBeenCalled();
});
it('requires exact identity, every original/derived purge component, nonfuture time and independent verification',async()=>{
  for(const patch of [{actorId:'SYN-OTHER'},{assetId:'SYN-OTHER'},{assetVersion:'SYN-V2'},{operation:'PURGE_EXTRACTION'},
    {erasedAt:'2027-01-01T00:00:00Z'},{erasedComponents:['OCR_CACHE','DERIVED_FIELDS','MODEL_INPUTS']}]){
    const f=fixture();f.eraser.erase.mockResolvedValue({...receipt,...patch});
    expect(await drainProofCleanup(f.input)).toMatchObject({failed:1,acknowledged:0});expect(f.outbox.acknowledge).not.toHaveBeenCalled();
  }
  const f=fixture();f.eraser.verifyErasure.mockResolvedValue(false);
  expect(await drainProofCleanup(f.input)).toMatchObject({failed:1,acknowledged:0});expect(f.outbox.acknowledge).not.toHaveBeenCalled();
});
it('keeps retry keys stable across failed attempts and emits no raw external error details',async()=>{
  const f=fixture();f.eraser.erase.mockRejectedValueOnce(Error('SYN-PRIVATE-DETAIL'));
  const first=await drainProofCleanup(f.input);expect(JSON.stringify(first)).not.toContain('SYN-PRIVATE-DETAIL');
  expect(await drainProofCleanup(f.input)).toMatchObject({acknowledged:1,failed:0});
  const calls=f.eraser.erase.mock.calls;expect(calls[0]![0]).toMatchObject({idempotencyKey:expect.stringMatching(/^[a-f0-9]{64}$/)});
  expect((calls[0]![0] as {idempotencyKey:string}).idempotencyKey).toBe((calls[1]![0] as {idempotencyKey:string}).idempotencyKey);
});
it('times out an uncooperative eraser and never starts verification or acknowledges a late erase response',async()=>{
  vi.useFakeTimers();const f=fixture();let resolve!:(v:unknown)=>void;
  f.eraser.erase.mockImplementation(()=>new Promise(r=>{resolve=r;}));
  const run=drainProofCleanup({...f.input,timeoutMs:10});await vi.advanceTimersByTimeAsync(11);
  expect(await run).toMatchObject({acknowledged:0,failed:1});
  resolve(receipt);await Promise.resolve();await Promise.resolve();
  expect(f.eraser.verifyErasure).not.toHaveBeenCalled();expect(f.outbox.acknowledge).not.toHaveBeenCalled();
});
it('refuses another owner and oversized batches before calling an eraser',async()=>{
  const f=fixture();vi.mocked(f.outbox.list).mockResolvedValue([{...job,actorId:'SYN-OTHER'}]);
  await expect(drainProofCleanup(f.input)).rejects.toThrow();expect(f.eraser.erase).not.toHaveBeenCalled();
  vi.mocked(f.outbox.list).mockResolvedValue([job,job]);
  await expect(drainProofCleanup({...f.input,limit:1})).rejects.toThrow();expect(f.eraser.erase).not.toHaveBeenCalled();
});
it('bounds hung outbox discovery and acknowledgment and aborts their signals',async()=>{
  vi.useFakeTimers();const f=fixture();vi.mocked(f.outbox.list).mockImplementation(()=>new Promise(()=>{}));
  const reading=expect(drainProofCleanup({...f.input,timeoutMs:10})).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(11);await reading;
  vi.mocked(f.outbox.list).mockResolvedValue([job]);let resolve!:(v:boolean)=>void;
  vi.mocked(f.outbox.acknowledge).mockImplementation(()=>new Promise(r=>{resolve=r;}));
  const saving=drainProofCleanup({...f.input,timeoutMs:10});await vi.advanceTimersByTimeAsync(11);
  expect(await saving).toMatchObject({acknowledged:0,failed:1});
  expect(vi.mocked(f.outbox.acknowledge).mock.calls[0]![0].signal!.aborted).toBe(true);
  resolve(true);await Promise.resolve();expect(await saving).toMatchObject({acknowledged:0,failed:1});
});
it('bounds uncooperative cleanup authority and releases connections acquired after the deadline',async()=>{
  vi.useFakeTimers();const query=vi.fn(async()=>({rows:[]})),release=vi.fn();
  const connect=vi.fn(async()=>({query,release}));
  const denied=new PostgresRecognitionCleanupOutbox({connect},{mayCleanup:async()=>new Promise(()=>{})},()=>now,10);
  const blocked=expect(denied.list({actorId:job.actorId,limit:1})).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(11);await blocked;expect(connect).not.toHaveBeenCalled();
  let resolve!:(v:{query:typeof query;release:typeof release})=>void;
  connect.mockImplementation(()=>new Promise(r=>{resolve=r;}));
  const outbox=new PostgresRecognitionCleanupOutbox({connect},{mayCleanup:async()=>true},()=>now,10);
  const acquiring=expect(outbox.list({actorId:job.actorId,limit:1})).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(11);await acquiring;
  resolve({query,release});await Promise.resolve();await Promise.resolve();
  expect(release).toHaveBeenCalledOnce();expect(query).not.toHaveBeenCalled();
});
it('rolls back a late ACK query without starting a later COMMIT',async()=>{
  vi.useFakeTimers();let resolve!:(v:{rows:Record<string,unknown>[]})=>void;
  const queries:string[]=[],release=vi.fn();
  const query=vi.fn(async(sql:string)=>{queries.push(sql);
    if(sql.startsWith('UPDATE api_self_proof_cleanup'))return new Promise<{rows:Record<string,unknown>[]}> (r=>{resolve=r;});
    return {rows:[]};});
  const outbox=new PostgresRecognitionCleanupOutbox({connect:async()=>({query,release})},{mayCleanup:async()=>true},()=>now,10);
  const saving=expect(outbox.acknowledge({job,receiptId:receipt.receiptId})).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(11);await saving;
  resolve({rows:[{receipt_id:receipt.receiptId}]});await vi.advanceTimersByTimeAsync(1);
  expect(queries).not.toContain('COMMIT');expect(queries).toContain('ROLLBACK');expect(release).toHaveBeenCalledOnce();
});
