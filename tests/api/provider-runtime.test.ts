import {createHash} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {createProviderExecutor} from '../../apps/api/src/modules/ai/provider-runtime.js';
import type {ProviderSnapshot,ProviderRuntimeOptions} from '../../apps/api/src/modules/ai/provider-runtime.js';
import type {AiBudgetEntry} from '../../apps/api/src/modules/ai/budget-postgres.js';
import {PNG} from 'pngjs';
import {decodeApprovedRaster} from '../../packages/ai/src/raster.js';
const NOW='2026-11-03T00:00:00Z';
const actor={role:'BETA' as const,actorId:'SYN-A',sessionIdHash:'synthetic-session',csrfToken:'x'.repeat(16),
  sessionExpiresAt:'2026-11-04T00:00:00Z',schoolMailProofExpiresAt:'2026-11-04T00:00:00Z',betaAllowed:true};
const packet={packetId:'PKT1',task:'opportunity_terms' as const,providerInputClass:'SYNTHETIC_CLEARED' as const,
  sourceTokens:[{token:'DOC1',paragraphs:[{id:'p1',text:'가상 데이터 분석 프로그램'}]}],allowedTopicCodes:['DATA_ANALYTICS' as const],
  allowedObjectTokens:[],approvedFacts:[],schemaVersion:'S1',promptVersion:'P1'};
const snapshot:ProviderSnapshot={actorId:actor.actorId,sessionIdHash:actor.sessionIdHash,inputRef:'INPUT1',operation:'HCX_007',
  asOf:NOW,epoch:'E1',grantVersion:'G1',consentVersion:'C1',policyVersion:'P1',approvedBy:'SYN-REVIEWER',
  approvedAt:'2026-11-02T00:00:00Z',expiresAt:'2026-11-04T00:00:00Z',packet,
  sources:[{sourceId:'SOURCE1',revisionId:'REV1',permissionRef:'RIGHT1',originalSha256:'a'.repeat(64)}]};
const request={actor,inputRef:'INPUT1',operation:'HCX_007' as const,asOf:NOW,phaseId:'SYN-PHASE',idempotencyKey:'KEY1'};
const success=()=>({status:{code:'20000'},result:{message:{role:'assistant',content:JSON.stringify({task:'opportunity_terms',
  reviewRequired:true,citations:[{sourceToken:'DOC1',paragraphId:'p1',quote:'데이터 분석',topicCode:'DATA_ANALYTICS'}],objectTokens:[]})},
  finishReason:'stop',usage:{promptTokens:41,completionTokens:20,totalTokens:61}}});
function count(body:Record<string,any>){return {status:{code:'20000'},result:{messages:body.messages.map((m:any)=>({role:m.role,
  content:typeof m.content==='string'?{type:'text',text:m.content,count:20}:m.content.map((c:any)=>({...c,count:20}))})),
  ...(body.responseFormat?{responseFormat:{count:1}}:{})}};}
function fixture(){
  let current:ProviderSnapshot|null=structuredClone(snapshot),enabled=true,live=true;
  const records=new Map<string,AiBudgetEntry&{hash:string}>();
  const reserve=vi.fn(async(_actor:string,v:any)=>{
    const old=records.get(v.idempotencyKey);
    if(old){if(old.hash!==v.requestSha256)throw Error('conflict');return {...old,changed:false};}
    const row={jobId:'00000000-0000-4000-8000-000000000001',state:'RESERVED' as const,
      worstCaseUnits:v.worstCaseUnits,chargedUnits:null,changed:true,hash:v.requestSha256};records.set(v.idempotencyKey,row);return {...row};
  });
  const transition=vi.fn(async(_actor:string,v:any)=>{
    const old=[...records.values()].find(r=>r.jobId===v.jobId)!;
    if(!old)throw Error('missing');
    const changed=old.state!==v.action;
    if(v.action==='RELEASED'&&old.state!=='RESERVED'&&old.state!=='RELEASED')throw Error('cannot release');
    old.state=v.action;old.chargedUnits=v.actualUnits??null;return {...old,changed};
  });
  const read=vi.fn(async()=>current?structuredClone(current):null);
  const post=vi.fn(async(input:any)=>new Response(JSON.stringify(input.stage==='TOKENIZE'?count(JSON.parse(input.body)):success()),
    {status:200,headers:{'content-type':'application/json'}}));
  const options:ProviderRuntimeOptions={enabled:()=>enabled,liveApproved:()=>live,now:()=>NOW,authority:{read},ledger:{reserve,transition},transport:{post},
    decodeRaster:async(bytes,identity)=>decodeApprovedRaster(bytes,identity),
    policy:{version:'PRICE1',approvedBy:'SYN-OPERATOR',approvedAt:'2026-11-02T00:00:00Z',expiresAt:'2026-11-04T00:00:00Z',
      inputUnitsPerToken:2,outputUnitsPerToken:3,tokenizerUnits:1,ocrImageUnits:10,maxInputTokens:3500,maxOutputTokens:800,framingTokens:0},timeoutMs:1000};
  return {options,read,post,reserve,transition,records,setCurrent:(s:ProviderSnapshot|null)=>current=s,
    setEnabled:(v:boolean)=>enabled=v,setLive:(v:boolean)=>live=v};
}
describe('provider execution gates and billing lifecycle',()=>{
  it('rejects the retired model before authority lookup, tokenization, billing or network',async()=>{
    const f=fixture(),executor=createProviderExecutor(f.options);
    const legacy={...request,operation:'HCX_005' as const};
    const result=await executor.execute(legacy);
    expect(result.state).toBe('UNAVAILABLE');
    expect(f.read).not.toHaveBeenCalled();
    expect(f.reserve).not.toHaveBeenCalled();
    expect(f.post).not.toHaveBeenCalled();
  });
  it.each(['OFF','noApproval','reviewer','expiredSession','noAuthority'] as const)('makes zero paid/tokenizer requests for %s',async kind=>{
    const f=fixture();if(kind==='OFF')f.setEnabled(false);if(kind==='noApproval')f.setLive(false);if(kind==='noAuthority')f.setCurrent(null);
    const req=kind==='reviewer'?{...request,actor:{...actor,role:'REVIEWER' as const}}:kind==='expiredSession'?{...request,actor:{...actor,sessionExpiresAt:NOW}}:request;
    const result=await createProviderExecutor(f.options).execute(req as typeof request);
    expect(result.state).toBe('UNAVAILABLE');expect(f.post).not.toHaveBeenCalled();expect(f.reserve).not.toHaveBeenCalled();
  });
  it('reserves worst case before tokenization and returns only a grounded review candidate after actual cost settlement',async()=>{
    const f=fixture(),r=await createProviderExecutor(f.options).execute(request);
    expect(r.state).toBe('NEEDS_REVIEW');expect(r.billing).toBe('SETTLED');
    expect(f.reserve.mock.calls[0]?.[1].worstCaseUnits).toBe(9401);
    expect(f.post.mock.calls.map(c=>c[0].stage)).toEqual(['TOKENIZE','INFER']);
    expect(f.transition.mock.calls.map(c=>c[1].action)).toEqual(['DISPATCHED','SETTLED']);
    expect(f.transition.mock.calls.at(-1)?.[1].actualUnits).toBe(143);
    expect(f.transition.mock.calls.at(-1)?.[1].receiptSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('makes zero provider calls on budget denial',async()=>{
    const f=fixture();f.reserve.mockRejectedValueOnce(Error('budget0'));
    expect((await createProviderExecutor(f.options).execute(request)).state).toBe('UNAVAILABLE');expect(f.post).not.toHaveBeenCalled();
  });
  it.each(['timeout','cancel'] as const)('releases a newly committed reservation after %s without dispatching',async reason=>{
    vi.useFakeTimers();
    try{
      const f=fixture(),reserve=f.reserve.getMockImplementation()!,cancel=new AbortController();
      let entered!:()=>void,commit!:()=>Promise<void>;
      const started=new Promise<void>(resolve=>{entered=resolve;});
      f.reserve.mockImplementationOnce((a,v)=>new Promise<AiBudgetEntry&{hash:string}>(resolve=>{
        commit=async()=>{resolve(await reserve(a,v));};entered();
      }));
      const req={...structuredClone(request),signal:cancel.signal};
      const execution=createProviderExecutor(f.options).execute(req);
      await started;
      // Mutating the caller after admission must not change the cleanup identity.
      req.actor.actorId='SYN-B';req.phaseId='OTHER-PHASE';req.idempotencyKey='OTHER-KEY';
      if(reason==='timeout')await vi.advanceTimersByTimeAsync(1000);else cancel.abort();
      const result=await execution;
      expect(result.state).toBe('UNAVAILABLE');expect(f.records.size).toBe(0);
      await commit();await vi.advanceTimersByTimeAsync(0);
      expect(f.records.get('KEY1')?.state).toBe('RELEASED');
      expect(result.billing).toBe('UNCONFIRMED');
      expect(f.transition.mock.calls).toEqual([['SYN-A',{
        phaseId:'SYN-PHASE',jobId:'00000000-0000-4000-8000-000000000001',
        requestSha256:f.reserve.mock.calls[0]![1].requestSha256,action:'RELEASED',
      }]]);
      expect(f.post).not.toHaveBeenCalled();
    }finally{vi.useRealTimers();}
  });
  it.each(['RESERVED','DISPATCHED'] as const)('does not release another executor\'s %s reservation returned after cancellation',async state=>{
    vi.useFakeTimers();
    try{
      const f=fixture(),reserve=f.reserve.getMockImplementation()!,cancel=new AbortController();
      let entered!:()=>void,finish!:()=>Promise<void>;
      const started=new Promise<void>(resolve=>{entered=resolve;});
      f.reserve.mockImplementationOnce((a,v)=>new Promise<AiBudgetEntry&{hash:string}>(resolve=>{
        finish=async()=>{
          const row=await reserve(a,v);f.records.get(v.idempotencyKey)!.state=state;
          resolve({...row,state,changed:false});
        };entered();
      }));
      const execution=createProviderExecutor(f.options).execute({...request,signal:cancel.signal});
      await started;cancel.abort();const result=await execution;
      await finish();await vi.advanceTimersByTimeAsync(0);
      expect(result.billing).toBe('UNCONFIRMED');expect(f.records.get('KEY1')?.state).toBe(state);
      expect(f.transition).not.toHaveBeenCalled();expect(f.post).not.toHaveBeenCalled();
    }finally{vi.useRealTimers();}
  });
  it('keeps accounting unconfirmed when releasing a late reservation fails',async()=>{
    vi.useFakeTimers();
    try{
      const f=fixture(),reserve=f.reserve.getMockImplementation()!,cancel=new AbortController();
      let entered!:()=>void,commit!:()=>Promise<void>;
      const started=new Promise<void>(resolve=>{entered=resolve;});
      f.reserve.mockImplementationOnce((a,v)=>new Promise<AiBudgetEntry&{hash:string}>(resolve=>{
        commit=async()=>{resolve(await reserve(a,v));};entered();
      }));
      f.transition.mockRejectedValueOnce(Error('private-accounting-failure'));
      const execution=createProviderExecutor(f.options).execute({...request,signal:cancel.signal});
      await started;cancel.abort();const result=await execution;
      await commit();await vi.advanceTimersByTimeAsync(0);
      expect(result).toEqual({state:'UNAVAILABLE',billing:'UNCONFIRMED'});
      expect(f.records.get('KEY1')?.state).toBe('RESERVED');
      expect(f.transition).toHaveBeenCalledOnce();expect(f.post).not.toHaveBeenCalled();
    }finally{vi.useRealTimers();}
  });
  it('observes a late reservation rejection without claiming a successful release',async()=>{
    vi.useFakeTimers();
    try{
      const f=fixture(),cancel=new AbortController();let entered!:()=>void,reject!:(error:Error)=>void;
      const started=new Promise<void>(resolve=>{entered=resolve;});
      f.reserve.mockImplementationOnce(()=>new Promise<AiBudgetEntry&{hash:string}>((_resolve,fail)=>{
        reject=fail;entered();
      }));
      const execution=createProviderExecutor(f.options).execute({...request,signal:cancel.signal});
      await started;cancel.abort();const result=await execution;
      reject(Error('private-reservation-failure'));await vi.advanceTimersByTimeAsync(0);
      expect(result).toEqual({state:'UNAVAILABLE',billing:'UNCONFIRMED'});
      expect(f.records.size).toBe(0);expect(f.transition).not.toHaveBeenCalled();expect(f.post).not.toHaveBeenCalled();
    }finally{vi.useRealTimers();}
  });
  it('releases an unsent reservation when authority changes before dispatch',async()=>{
    const f=fixture();f.reserve.mockImplementationOnce(async(_a,v)=>{
      const row={jobId:'00000000-0000-4000-8000-000000000001',state:'RESERVED' as const,worstCaseUnits:v.worstCaseUnits,chargedUnits:null,changed:true,hash:v.requestSha256};
      f.records.set(v.idempotencyKey,row);f.setCurrent({...snapshot,epoch:'E2'});return row;
    });
    const r=await createProviderExecutor(f.options).execute(request);
    expect(r.state).toBe('UNAVAILABLE');expect(r.billing).toBe('RELEASED');expect(f.post).not.toHaveBeenCalled();
  });
  it('does not infer after successful tokenizer when permission was revoked; settles only the completed helper cost',async()=>{
    const f=fixture();f.post.mockImplementationOnce(async input=>{
      f.setCurrent(null);return new Response(JSON.stringify(count(JSON.parse(input.body))),{headers:{'content-type':'application/json'}});
    });
    const r=await createProviderExecutor(f.options).execute(request);
    expect(r.state).toBe('UNAVAILABLE');expect(r.billing).toBe('SETTLED');expect(f.post).toHaveBeenCalledTimes(1);
    expect(f.transition.mock.calls.at(-1)?.[1].actualUnits).toBe(1);
  });
  it.each([429,503])('holds unknown billing on HTTP %s without automatic retry',async status=>{
    const f=fixture();f.post.mockResolvedValueOnce(new Response('{}',{status}));
    const r=await createProviderExecutor(f.options).execute(request);
    expect(r.billing).toBe('UNKNOWN_BILLING');expect(f.post).toHaveBeenCalledTimes(1);
    expect(f.transition.mock.calls.at(-1)?.[1].action).toBe('UNKNOWN_BILLING');
  });
  it('times out a provider ignoring abort and discards its late response',async()=>{
    const f=fixture();let late!:(r:Response)=>void;f.post.mockImplementationOnce(()=>new Promise(resolve=>late=resolve));
    f.options.timeoutMs=10;
    const r=await createProviderExecutor(f.options).execute(request);expect(r.billing).toBe('UNKNOWN_BILLING');
    late(new Response(JSON.stringify(count({messages:[]}))));await Promise.resolve();
    expect(f.transition.mock.calls.at(-1)?.[1].action).toBe('UNKNOWN_BILLING');
  });
  it('settles real usage but discards a revoked actor result or invalid evidence',async()=>{
    for(const revoke of [true,false]){
      const f=fixture();f.post.mockImplementation(async input=>{
        if(input.stage==='TOKENIZE')return new Response(JSON.stringify(count(JSON.parse(input.body))));
        const raw=success();if(revoke)f.setCurrent(null);else raw.result.message.content='{"invented":true}';
        return new Response(JSON.stringify(raw));
      });
      const r=await createProviderExecutor(f.options).execute(request);
      expect(r.state).toBe('UNAVAILABLE');expect(r.billing).toBe('SETTLED');expect(r).not.toHaveProperty('candidate');
    }
  });
  it('rejects tokenizer responses for different body text and holds the ambiguous bill',async()=>{
    const f=fixture();f.post.mockImplementationOnce(async input=>{
      const raw=count(JSON.parse(input.body));raw.result.messages[0].content.text='other';return new Response(JSON.stringify(raw));
    });
    expect((await createProviderExecutor(f.options).execute(request)).billing).toBe('UNKNOWN_BILLING');expect(f.post).toHaveBeenCalledTimes(1);
  });
  it('bounds response bytes, never reflects raw errors, and treats invalid JSON as unknown billing',async()=>{
    const f=fixture();f.post.mockResolvedValueOnce(new Response('secret-marker'.repeat(200000)));
    const r=await createProviderExecutor(f.options).execute(request);expect(r.billing).toBe('UNKNOWN_BILLING');
    expect(JSON.stringify(r)).not.toContain('secret-marker');
  });
  it('joins twenty same-process duplicate requests without duplicate provider send',async()=>{
    const f=fixture(),executor=createProviderExecutor(f.options);
    const results=await Promise.all(Array.from({length:20},()=>executor.execute(request)));
    expect(results.every(r=>r.state==='NEEDS_REVIEW')).toBe(true);expect(f.post).toHaveBeenCalledTimes(2);expect(f.reserve).toHaveBeenCalledTimes(1);
  });
  it('bounds initial authority reads as well as provider I/O',async()=>{
    const f=fixture();f.read.mockImplementation(()=>new Promise(()=>{}));f.options.timeoutMs=10;
    const result=await Promise.race([createProviderExecutor(f.options).execute(request),new Promise(resolve=>setTimeout(()=>resolve('HUNG'),100))]);
    expect(result).toMatchObject({state:'UNAVAILABLE'});expect(f.post).not.toHaveBeenCalled();
  });
  it('snapshots server request identity across asynchronous ledger operations',async()=>{
    const f=fixture(),req=structuredClone(request),original=f.reserve.getMockImplementation()!;
    f.reserve.mockImplementationOnce(async(a,v)=>{const r=await original(a,v);req.actor.actorId='SYN-B';return r;});
    const result=await createProviderExecutor(f.options).execute(req);
    expect(f.transition.mock.calls.every(c=>c[0]==='SYN-A')).toBe(true);expect(result.state).toBe('NEEDS_REVIEW');
  });
  it('settles a bound successful OCR response even when its evidence geometry is invalid',async()=>{
    const f=fixture(),bytes=Uint8Array.from(PNG.sync.write(new PNG({width:8,height:8}))),originalSha256=createHash('sha256').update(bytes).digest('hex');
    const {packet:_packet,...base}=snapshot;
    f.setCurrent({...base,operation:'OCR_GENERAL',sources:[{...base.sources[0]!,originalSha256}],
      media:{bytes,originalSha256,sourceRevisionId:'REV1',assetId:'ASSET1'}});
    f.post.mockImplementation(async input=>new Response(JSON.stringify({version:'V2',requestId:JSON.parse(input.body).requestId,
      images:[{name:'image',inferResult:'SUCCESS',fields:[{inferText:'가상',inferConfidence:1,type:'NORMAL',lineBreak:true,
        boundingPoly:{vertices:[{x:1,y:1},{x:20,y:1},{x:20,y:2},{x:1,y:2}]}}]}]})));
    const r=await createProviderExecutor(f.options).execute({...request,operation:'OCR_GENERAL'});
    expect(r.state).toBe('UNAVAILABLE');expect(r.billing).toBe('SETTLED');expect(f.transition.mock.calls.at(-1)?.[1].actualUnits).toBe(10);
  });
  it('keeps one active provider job and bounds waiting requests to sixteen',async()=>{
    const f=fixture(),original=f.reserve.getMockImplementation()!;let next=0,active=0,peak=0;
    f.reserve.mockImplementation(async(a,v)=>{
      const result=await original(a,v);result.jobId='00000000-0000-4000-8000-'+String(++next).padStart(12,'0');
      f.records.get(v.idempotencyKey)!.jobId=result.jobId;return result;
    });
    f.post.mockImplementation(async input=>{active++;peak=Math.max(active,peak);await new Promise(resolve=>setImmediate(resolve));active--;
      return new Response(JSON.stringify(input.stage==='TOKENIZE'?count(JSON.parse(input.body)):success()));});
    const executor=createProviderExecutor(f.options),results=await Promise.all(Array.from({length:20},(_,i)=>executor.execute({...request,idempotencyKey:'PARALLEL-'+i})));
    expect(peak).toBe(1);expect(results.filter(r=>r.state==='NEEDS_REVIEW')).toHaveLength(17);expect(f.reserve).toHaveBeenCalledTimes(17);
  });
  it('retrieves a persisted settled result after executor restart without another paid call',async()=>{
    const f=fixture();let stored:any;
    const put=vi.fn(async value=>{stored=structuredClone(value);});
    const get=vi.fn(async(a,s,id)=>stored&&a===stored.actorId&&s===stored.sessionIdHash&&id===stored.jobId?structuredClone(stored):null);
    f.options.results={put,get};
    const first=await createProviderExecutor(f.options).execute(request);expect(first.provenance).toBe('LIVE');expect(put).toHaveBeenCalledOnce();
    const restarted=createProviderExecutor(f.options),replay=await restarted.execute(request);
    expect(replay.state).toBe('NEEDS_REVIEW');expect(replay.provenance).toBe('CANDIDATE_CACHE');expect(f.post).toHaveBeenCalledTimes(2);
    expect((await restarted.readJob(actor,first.jobId!))?.provenance).toBe('CANDIDATE_CACHE');
    expect(await restarted.readJob({...actor,sessionIdHash:'another-session'},first.jobId!)).toBeNull();
    stored.candidate.citations[0].quote='fabricated';expect(await restarted.readJob(actor,first.jobId!)).toBeNull();
    f.setCurrent(null);expect(await restarted.readJob(actor,first.jobId!)).toBeNull();
  });
  it('rejects a product task inconsistent with the approved packet before billing',async()=>{
    const f=fixture();expect((await createProviderExecutor(f.options).execute({...request,task:'graduation_explanation'})).state).toBe('UNAVAILABLE');
    expect(f.reserve).not.toHaveBeenCalled();expect(f.post).not.toHaveBeenCalled();
  });
});
