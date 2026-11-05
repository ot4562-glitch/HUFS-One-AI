import {describe,expect,it} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {OwnerSessionController} from '../../apps/web/src/app/owner-session-controller.js';
import {resolveSessionRole} from '../../apps/web/src/roleServices.js';
import snapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';

const origin='https://synthetic.invalid';
const respond=(payload:unknown)=>new Response(JSON.stringify(payload),{
  status:200,headers:{'content-type':'application/json'},
});
const api=()=>createIntegratedApi({
  allowedOrigin:origin,
  repository:new MemoryApiRepository({profiles:[]}),
  auth:{verifySession:async()=>null,revokeSession:async()=>{}},
});
const academic={
  state:'READY',rulePackVersion:'SYN-RULE-1',asOf:snapshot.asOf,
  earnedCreditUnits:4,inProgressCreditUnits:2,plannedCreditUnits:0,
  deficits:[{requirementId:'SYN-REQ-1',missingCreditUnits:2,
    state:'MISSING',evidenceRefs:['EV-SYN-RULE-1']}],
  caveats:['Synthetic rulebook, not an official academic decision'],
};
const forecast={
  status:'PARTIAL',asOf:snapshot.asOf,
  items:[{courseId:'SYN-COURSE-1',targetTerm:'2027-1',
    signal:'UNKNOWN',asOf:snapshot.asOf,coverage:'UNKNOWN',
    sameSeasonObservedTerms:0,sameSeasonOfferedTerms:0,
    evidenceRefs:[],caveat:'Synthetic course, no official forecast'}],
};

describe('integration security review: deny unsupported production startups',()=>{
  it('refuses a production NODE_ENV even when APP_ENV is not set',async()=>{
    const originalNode=process.env.NODE_ENV;
    const originalApp=process.env.APP_ENV;
    try{
      process.env.NODE_ENV='production';
      delete process.env.APP_ENV;
      expect(api).toThrow('Production integration disabled');
    }finally{
      if(originalNode===undefined)delete process.env.NODE_ENV;
      else process.env.NODE_ENV=originalNode;
      if(originalApp===undefined)delete process.env.APP_ENV;
      else process.env.APP_ENV=originalApp;
    }
  });
  it('refuses unknown external APP_ENV modes until reviewed',async()=>{
    const original=process.env.APP_ENV;
    try{
      process.env.APP_ENV='preview-public';
      expect(api).toThrow('Production integration disabled');
    }finally{
      if(original===undefined)delete process.env.APP_ENV;
      else process.env.APP_ENV=original;
    }
  });
});

describe('reviewer browser: prove all nested academic/AI evidence is synthetic',()=>{
  it('keeps ADMIN outside all BETA/REVIEWER paths even with beta-shaped flags',async()=>{
    const client=new HufsApiClient(async()=>respond({
      actorId:'SYN-ADMIN',role:'ADMIN',schoolMailProofValid:true,betaAllowed:true,
    }));
    // Identity resolution is shared with the ADMIN portal, but must never grant
    // owner or REVIEWER capabilities. A generic 200 response is not BETA consent.
    expect((await client.getSession()).role).toBe('ADMIN');
    const owner=new OwnerSessionController(client);
    await owner.initialize();
    expect(owner.getState().status).toBe('FORBIDDEN');
    expect(await resolveSessionRole(client)).toEqual({role:'UNKNOWN'});
  });

  it('blocks a supposedly synthetic snapshot with potentially live cached model provenance',async()=>{
    const client=new HufsApiClient(async()=>respond({
      ...snapshot,aiProvenance:'VALIDATED_CACHE',
    }));
    await expect(client.getReviewerSnapshot('S01')).rejects.toMatchObject({
      code:'FORBIDDEN',status:403,
    });
  });

  it('blocks non-synthetic academic rules even under a SYNTHETIC root envelope',async()=>{
    const client=new HufsApiClient(async()=>respond({
      ...snapshot,academics:{...academic,rulePackVersion:'REAL-RULE-2026'},
    }));
    await expect(client.getReviewerSnapshot('S01')).rejects.toMatchObject({
      code:'FORBIDDEN',status:403,
    });
  });

  it('blocks academic paragraphs sourced from real notices even when rule ID is synthetic',async()=>{
    const client=new HufsApiClient(async()=>respond({
      ...snapshot,academics:{...academic,deficits:[{
        ...academic.deficits[0],evidenceRefs:['EV-REAL-PRIVATE'],
      }]},
    }));
    await expect(client.getReviewerSnapshot('S01')).rejects.toMatchObject({
      code:'FORBIDDEN',status:403,
    });
  });

  it('blocks a future academic summary inside an older synthetic snapshot',async()=>{
    const client=new HufsApiClient(async()=>respond({
      ...snapshot,academics:{...academic,asOf:'2027-01-01T00:00:00.000Z'},
    }));
    await expect(client.getReviewerSnapshot('S01')).rejects.toMatchObject({
      code:'FORBIDDEN',status:403,
    });
  });

  it('rejects real course IDs and future forecasts in a synthetic REVIEWER snapshot',async()=>{
    for(const item of [
      {...forecast.items[0],courseId:'REAL-COURSE'},
      {...forecast.items[0],asOf:'2027-01-01T00:00:00.000Z'},
      {...forecast.items[0],evidenceRefs:['EV-REAL-SOURCE']},
    ]){
      const client=new HufsApiClient(async()=>respond({
        ...snapshot,forecast:{...forecast,items:[item]},
      }));
      await expect(client.getReviewerSnapshot('S01')).rejects.toMatchObject({
        code:'FORBIDDEN',status:403,
      });
    }
  });

  it('still allows reviewed synthetic academic and forecast demos',async()=>{
    const client=new HufsApiClient(async()=>respond({
      ...snapshot,academics:academic,forecast,
    }));
    const data=await client.getReviewerSnapshot('S01');
    expect(data.academics.state).toBe('READY');
    expect('state' in data.forecast).toBe(false);
    expect('status' in data.forecast && data.forecast.status).toBe('PARTIAL');
    expect(data.aiProvenance).toBe('MOCK');
  });
});
