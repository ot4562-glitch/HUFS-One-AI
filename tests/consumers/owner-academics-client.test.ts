import {afterEach,describe,expect,it} from 'vitest';
import {createTrustedOwnerDoubleMajorSource} from '../../apps/api/src/modules/academics/owner-double-major-source.js';
import {doubleMajorInput} from '../api/owner-double-major-fixture.js';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';

const at='2026-11-03T00:00:00.000Z';
async function approved(){
  const source=createTrustedOwnerDoubleMajorSource({snapshots:{
    load:async()=>({actorId:'SYN-OWNER',asOf:at,receipt:'SYN-SOURCE-RECEIPT',
      projectionVersion:'SYN-PROJ-V1',input:doubleMajorInput()}),
    revalidate:async()=>true,
  }});
  return (await source.inspect({actorId:'SYN-OWNER',now:at})).check;
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{'content-type':'application/json'},
});
afterEach(()=>{});
describe('#144 BETA owner academic strict browser client',()=>{
  it('reads only current BETA double-major through same-origin, no-store GET with abort, no actor query',async()=>{
    const actual=await approved(),calls:Array<{url:string,init:RequestInit}>=[];
    const client=new HufsApiClient(async(url,init)=>{calls.push({url,init});return json(actual);});
    const signal=new AbortController().signal;
    expect(await client.owner.getDoubleMajor(signal)).toEqual(actual);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/academics/double-major');
    expect(calls[0]?.init).toMatchObject({method:'GET',signal,cache:'no-store',
      credentials:'same-origin',redirect:'error',mode:'same-origin'});
    expect(JSON.stringify(calls[0])).not.toMatch(/SYN-OWNER|actorId|sourceReceipt/);
  });
  it('rejects malformed rowImpacts and forged READY when there is no independent approved pack',async()=>{
    const actual=await approved();
    for(const bad of [
      {...actual,overlap:{...actual.overlap!,rowImpacts:{...actual.overlap!.rowImpacts,primary:[null]}}},
      {...actual,state:'READY',primary:{...actual.primary,rulePack:{version:'SYN-P',state:'DRAFT'}}},
      {...actual,secretTranscript:'DO-NOT-EXPOSE'},
    ]){
      const browser=new HufsApiClient(async()=>json(bad));
      await expect(browser.owner.getDoubleMajor()).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
    }
  });
  it('preserves 401/403/503 and never substitutes public demo data after a server error',async()=>{
    for(const [status,code] of [[401,'UNAUTHENTICATED'],[403,'FORBIDDEN'],[503,'PROVIDER_UNAVAILABLE']] as const){
      const browser=new HufsApiClient(async()=>json({code},status));
      await expect(browser.owner.getDoubleMajor()).rejects.toMatchObject({code,status});
    }
  });
});
