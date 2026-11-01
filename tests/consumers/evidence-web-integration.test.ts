import {afterEach,describe,expect,it} from 'vitest';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {createApi} from '../../apps/api/src/server.js';
import {closedRepository} from '../../apps/api/src/repository.js';

const NOW='2026-11-01T00:00:00.000Z';
const HISTORY='2026-10-20T00:00:00+09:00';
const actor={actorId:'SYN-EVIDENCE-USER',role:'BETA' as const,
  sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2026-11-03T00:00:00.000Z',schoolMailProofExpiresAt:'2026-11-03T00:00:00.000Z'};
const envelope=(asOf=HISTORY)=>({queryVersion:'SYN-Q1',asOf,
  sourceRevisionIds:['SYN-R1'],permissionPolicyVersion:'SYN-P1',
  retrievalConfigVersion:'SYN-LEXICAL-1',retrievalState:'READY',
  evidence:[{kind:'TEXT',sourceRevisionId:'SYN-R1',paragraphId:'SYN-PARAGRAPH',
    startCodePoint:0,endCodePoint:5,quote:'합성 근거'}]});
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{'content-type':'application/json'},
});
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});

describe('browser temporal evidence consumer',()=>{
  it('encodes query data without adding permission or identity fields and validates the envelope',async()=>{
    const signal=new AbortController().signal;
    const client=new HufsApiClient(async(path,init)=>{
      const url=new URL(path,'https://example.test');
      expect(url.pathname).toBe('/api/evidence/search');
      expect([...url.searchParams.keys()]).toEqual(['q','asOf']);
      expect(url.searchParams.get('q')).toBe('합성 &actorId=other');
      expect(url.searchParams.get('asOf')).toBe(HISTORY);
      expect(init).toMatchObject({method:'GET',cache:'no-store',mode:'same-origin',
        credentials:'same-origin',redirect:'error',signal});
      return response(envelope());
    });
    const found=await client.searchEvidence('  합성 &actorId=other  ',HISTORY,signal);
    expect(found.evidence[0]?.quote).toBe('합성 근거');
  });

  it('rejects invalid inputs before transport',async()=>{
    let calls=0;
    const client=new HufsApiClient(async()=>{calls++;return response(envelope());});
    for(const [q,asOf] of [[' ',HISTORY],['a',HISTORY],['x'.repeat(201),HISTORY],
      ['합성','yesterday'],['합성','2026-11-01']]){
      await expect(client.searchEvidence(q!,asOf)).rejects.toMatchObject({code:'INVALID_INPUT',status:422});
    }
    expect(calls).toBe(0);
  });

  it('rejects private fields, invalid evidence and wrong requested asOf',async()=>{
    for(const body of [{...envelope(),originalBytes:'private'},
      {...envelope(),sourceRevisionIds:[]},{...envelope(),retrievalState:'NO_EVIDENCE'},
      envelope(NOW)]){
      await expect(new HufsApiClient(async()=>response(body)).searchEvidence('합성',HISTORY))
        .rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE',status:503});
    }
  });

  it('returns honest no-evidence states instead of using a prior successful response',async()=>{
    let count=0;
    const client=new HufsApiClient(async()=>response(++count===1?envelope():{
      ...envelope(),sourceRevisionIds:[],evidence:[],retrievalState:'NO_EVIDENCE',
    }));
    expect((await client.searchEvidence('합성',HISTORY)).evidence).toHaveLength(1);
    expect((await client.searchEvidence('합성',HISTORY)).evidence).toEqual([]);
  });

  it.each([[401,'UNAUTHENTICATED'],[403,'FORBIDDEN'],[409,'VERSION_CONFLICT'],
    [422,'INVALID_INPUT'],[429,'RATE_LIMITED'],[503,'PROVIDER_UNAVAILABLE']] as const)
    ('preserves %i without returning error text or retrying',async(status,code)=>{
      let count=0;
      const client=new HufsApiClient(async()=>{count++;return response({code,
        message:'Do not render raw failures',requestId:'SYN-REQUEST',retryable:status===503},status);});
      await expect(client.searchEvidence('합성',HISTORY)).rejects.toMatchObject({code,status});
      expect(count).toBe(1);
    });

  it('preserves cancellation',async()=>{
    const client=new HufsApiClient(async()=>{throw new DOMException('Aborted','AbortError');});
    await expect(client.searchEvidence('합성',HISTORY)).rejects.toMatchObject({name:'AbortError'});
  });

  it('crosses the actual Fastify boundary with only its current session authority',async()=>{
    let valid=true;
    const app=createApi({repository:closedRepository,allowedOrigin:'https://example.test',
      now:()=>NOW,verifySession:async()=>valid?actor:null,
      temporalEvidence:{query:async({query,asOf,actor:verified})=>{
        expect(query).toBe('합성 &actorId=other');expect(verified.actorId).toBe(actor.actorId);
        return {envelope:envelope(asOf) as never,hits:[]};
      }}});
    apps.push(app);
    const client=new HufsApiClient(async(url,init)=>{
      const r=await app.inject({url,method:'GET'});
      expect(r.headers['cache-control']).toBe('no-store');
      return new Response(r.body,{status:r.statusCode,headers:{'content-type':'application/json'}});
    });
    expect((await client.searchEvidence('합성 &actorId=other',HISTORY)).evidence).toHaveLength(1);
    valid=false;
    await expect(client.searchEvidence('합성 &actorId=other',HISTORY))
      .rejects.toMatchObject({code:'UNAUTHENTICATED',status:401});
  });

  it('discards evidence when session is revoked during retrieval',async()=>{
    let valid=true;
    const app=createApi({repository:closedRepository,allowedOrigin:'https://example.test',
      now:()=>NOW,verifySession:async()=>valid?actor:null,
      temporalEvidence:{query:async({asOf})=>{
        valid=false;return {envelope:envelope(asOf) as never,hits:[]};
      }}});
    apps.push(app);
    const r=await app.inject({url:'/api/evidence/search?q=synthetic&asOf='+encodeURIComponent(HISTORY)});
    expect(r.statusCode).toBe(401);
    expect(r.json()).not.toHaveProperty('evidence');
  });
});
