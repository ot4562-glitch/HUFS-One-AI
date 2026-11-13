import {it,expect,vi,afterEach} from 'vitest';
import {createHash,randomBytes} from 'node:crypto';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import {createMaskedRecognitionPng} from '../../apps/api/src/modules/recognition-private-preview.js';
const origin='https://synthetic.invalid',activityId='SYN-ACTIVITY',assetId='asset-'+'a'.repeat(64),scope='b'.repeat(64);
const now='2026-11-13T01:00:00Z',expiresAt='2026-11-13T01:02:00Z';
const actor={role:'BETA' as const,actorId:'SYN-OWNER',sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2026-12-01T00:00:00Z',schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const apps:ReturnType<typeof createIntegratedApi>[]=[];afterEach(async()=>{await Promise.all(apps.splice(0).map(a=>a.close()));});
function setup(connected=true){
  let actorId=actor.actorId,time=now,quota=true;
  const bytes=createMaskedRecognitionPng({width:256,height:256,rgba:randomBytes(256*256*4)},[]).png;
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const item={assetId,assetVersion:'original-v1' as const,proofId:'proof-'+'d'.repeat(64),activityId,mimeType:'image/png' as const,
    size:bytes.length,sha256,recordedAt:now,provenance:'OWNER_UPLOADED_UNVERIFIED' as const,officiallyRecognized:false as const,modelInputAllowed:false as const};
  const receipt={actorId:actor.actorId,activityId,storageConsentVersion:1,rightsVersion:'SYN-R',consentVersion:'SYN-C',expiresAt};
  const assets={contextVersion:()=>scope,policy:vi.fn(async()=>({receipt,contextVersion:scope,maxFileBytes:2*1024*1024,maxFilesPerActivity:10,allowedMimeTypes:['image/png' as const,'image/jpeg' as const,'application/pdf' as const]})),
    list:vi.fn(async()=>({receipt,items:[item]})),intake:vi.fn(async()=>item),
    erase:vi.fn(async()=>({state:'ERASURE_PENDING' as const,assetId,assetVersion:'original-v1',originalErased:true as const}))};
  const app=createIntegratedApi({allowedOrigin:origin,repository:closedRepository,now:()=>time,
    auth:{verifySession:async()=>({...actor,actorId}),revokeSession:async()=>{}},
    ownerInsights:{source:{read:async()=>null,revalidate:async()=>false},quota:{consume:async()=>quota},...(connected?{assets}:{})}});apps.push(app);
  const base='/api/owner/features/v2/recognition/'+activityId+'/assets';
  const get=(path='')=>app.inject({url:base+path});
  const post=(path:string,payload:Record<string,unknown>,headers={origin,'x-csrf-token':actor.csrfToken})=>app.inject({method:'POST',url:base+path,headers,payload});
  const command={requestId:'00000000-0000-4000-8000-000000000001',contextVersion:scope,mimeType:'image/png',size:bytes.length,sha256,fileBase64:bytes.toString('base64')};
  return {app,get,post,base,assets,command,bytes,item,changeActor:()=>{actorId='SYN-OTHER';},expire:()=>{time=expiresAt;},denyQuota:()=>{quota=false;}};
}
it('issues current owner policies and metadata with no original payload, actor or storage URL',async()=>{
  const h=setup(),policy=await h.get('/policy'),list=await h.get();
  expect(policy.statusCode,policy.body).toBe(200);expect(policy.json()).toMatchObject({state:'READY',activityId,contextVersion:scope,maxFileBytes:2*1024*1024});
  expect(list.json().items).toEqual([h.item]);expect(list.headers['cache-control']).toBe('no-store');
  for(const body of [policy.body,list.body])for(const value of ['fileBase64','raw_bytes','SYN-OWNER','storageUrl'])expect(body).not.toContain(value);
});
it('accepts a bounded real PNG larger than the ordinary 64KiB body limit and binds the upload receipt',async()=>{
  const h=setup();expect(h.bytes.length).toBeGreaterThan(65536);
  const reply=await h.post('',h.command);expect(reply.statusCode,reply.body).toBe(200);
  expect(reply.json()).toMatchObject({state:'READY',requestId:h.command.requestId,contextVersion:scope,item:h.item});
  expect(h.assets.intake.mock.calls).toHaveLength(1);
});
it('requires CSRF and exact byte hash/length, rejects extra owner/filename fields and noncanonical base64',async()=>{
  const h=setup();expect((await h.post('',h.command,{origin,'x-csrf-token':'bad'})).statusCode).toBe(403);
  for(const change of [{sha256:'0'.repeat(64)},{size:h.command.size+1},{actorId:'SYN-OTHER'},{filename:'student.png'},
    {size:1,fileBase64:'Zh=='}])expect((await h.post('',{...h.command,...change})).statusCode).toBe(422);
  expect(h.assets.intake).not.toHaveBeenCalled();
});
it('returns pending cleanup without private source lookup and allows only exact asset deletion acknowledgments',async()=>{
  const h=setup(),reply=await h.post('/'+assetId+'/erase',{assetVersion:'original-v1'});
  expect(reply.statusCode,reply.body).toBe(200);expect(reply.json()).toMatchObject({state:'READY',assetId,cleanupState:'PENDING',originalErased:true,allComponentsErased:false});
  expect(h.assets.list).not.toHaveBeenCalled();expect(h.assets.policy).not.toHaveBeenCalled();
});
it('fails closed for missing providers, quota, wrong returned actor/item and late actor/lease changes',async()=>{
  const missing=setup(false);expect((await missing.get()).json()).toEqual({state:'NOT_CONNECTED'});expect((await missing.post('',missing.command)).json()).toEqual({state:'NOT_CONNECTED'});
  const limited=setup();limited.denyQuota();expect((await limited.post('',limited.command)).statusCode).toBe(429);expect(limited.assets.intake).not.toHaveBeenCalled();
  const wrong=setup(),list=wrong.assets.list.getMockImplementation()!;wrong.assets.list.mockImplementationOnce(async()=>({...await list(),receipt:{...((await list()).receipt),actorId:'SYN-OTHER'}}));
  expect((await wrong.get()).statusCode).toBe(503);
  const changed=setup(),intake=changed.assets.intake.getMockImplementation()!;changed.assets.intake.mockImplementationOnce(async()=>{changed.changeActor();return intake();});
  expect((await changed.post('',changed.command)).statusCode).toBe(403);
  const expired=setup(),policy=expired.assets.policy.getMockImplementation()!;expired.assets.policy.mockImplementationOnce(async()=>{expired.expire();return policy();});
  expect((await expired.get('/policy')).statusCode).toBe(409);
});
