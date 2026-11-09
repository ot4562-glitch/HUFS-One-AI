import {afterEach,describe,expect,it,vi} from 'vitest';
import {FeatureAdditions as V} from '@hufs-one/contracts';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import type {OwnerInsightsServices,TrustedOwnerInsightsSource} from
  '../../apps/api/src/modules/owner-v2-insights-http.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import {
  FIXED_NOW,mentor,mentorPreference,recognitionRule,proof,requirement,
  experience,crosswalk,learning,learningPreference,stat,guide,
} from '../../packages/core/src/feature-additions/v2.fixtures.js';

const ORIGIN='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'SYN-INSIGHTS-OWNER',
  sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2026-12-01T00:00:00Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(x=>x.close()));});
function setup(enabled=true){
  let rights=true,actorId=actor.actorId,consent='SYN-CONSENT',head='SYN-REV';
  let admitted=true,quotaFails=false;
  const receipt={actorId,sourceVersion:'SYN-REV',consentVersion:consent,
    rightsVersion:head,expiresAt:'2026-11-30T00:00:00Z'};
  const cases={
    MENTORS:{kind:'MENTORS' as const,preference:mentorPreference(),
      mentors:[mentor('mentor-1')]},
    RECOGNITION:{kind:'RECOGNITION' as const,
      cases:[{rule:recognitionRule(),activity:{
        id:'A1',kind:'VOLUNTEER',endedAt:'2026-10-30T00:00:00Z'},
        proofs:[proof('CERTIFICATE')]}]},
    SKILLS:{kind:'SKILLS' as const,requirements:[requirement('REQ-1')],
      experiences:[experience('E1')],crosswalk:[crosswalk()]},
    LEARNING:{kind:'LEARNING' as const,preference:learningPreference(),
      programs:[learning('program-1')],verifiedCompletedCourses:['ECO201']},
    EMPLOYMENT:{kind:'EMPLOYMENT' as const,aggregates:[stat('stat-1')]},
    INTERNATIONAL:{kind:'INTERNATIONAL' as const,guides:[{guide:guide(),
      selection:{locale:'en' as const,topicCode:'ENROLLMENT',campus:'SEOUL',
        term:'2026-2',audienceCodes:['INTERNATIONAL_STUDENT']}}]},
  };
  const source:TrustedOwnerInsightsSource={
    read:vi.fn(async ({kind})=>({...cases[kind],receipt})),
    revalidate:vi.fn(async ({actorId:who,receipt:stamp})=>
      rights&&who===actorId&&stamp.consentVersion===consent
      &&stamp.rightsVersion===head),
  };
  const quota:OwnerInsightsServices['quota']={
    consume:vi.fn(async ({actorId:who,kind})=>{
      if(quotaFails)throw Error('offline quota');
      return admitted&&who===actorId&&V.OwnerInsightsKindSchema.safeParse(kind).success;
    }),
  };
  const app=createIntegratedApi({
    allowedOrigin:ORIGIN,repository:closedRepository,now:()=>FIXED_NOW,
    auth:{verifySession:async()=>({...actor,actorId}),revokeSession:async()=>{}},
    ...(enabled?{ownerInsights:{source,quota}}:{}),
  });
  apps.push(app);
  const get=(kind:string='MENTORS',query='')=>
    app.inject({url:'/api/owner/features/v2/insights/'+kind+query});
  return {app,source,quota,cases,receipt,get,
    revoke:()=>{rights=false;},changeActor:()=>{actorId='SYN-OTHER';},
    changeConsent:()=>{consent='SYN-NEW-CONSENT';},
    changeHead:()=>{head='SYN-NEW-HEAD';},
    exhaust:()=>{admitted=false;},failQuota:()=>{quotaFails=true;}};
}
describe('#366 six owner insights consume current approved sources separately',()=>{
  it.each([
    ['MENTORS','ranking'],['RECOGNITION','reports'],['SKILLS','rows'],
    ['LEARNING','ranking'],['EMPLOYMENT','rows'],['INTERNATIONAL','guides'],
  ] as const)('%s returns the strict %s result from current BETA source',async(kind,key)=>{
    const h=setup(),r=await h.get(kind);
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.json()).toMatchObject({state:'READY',asOf:FIXED_NOW,
      sourceVersion:'SYN-REV',result:{kind}});
    expect(r.json().result[key]).toBeDefined();
    expect(h.source.read).toHaveBeenCalledOnce();
    expect(h.source.revalidate).toHaveBeenCalledOnce();
    expect(h.quota.consume).toHaveBeenCalledOnce();
    expect(r.body).not.toContain('SYN-INSIGHTS-OWNER');
    expect(r.body).not.toContain('SYN-CONSENT');
  });
  it('returns NOT_CONNECTED for every kind without the operator source',async()=>{
    const h=setup(false);
    for(const kind of V.OwnerInsightsKindSchema.options){
      const r=await h.get(kind);
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({state:'NOT_CONNECTED',kind,asOf:FIXED_NOW});
    }
    expect(h.source.read).not.toHaveBeenCalled();
  });
  it('denies invalid kind, query-side facts, and any non-BETA actor',async()=>{
    const h=setup();
    expect((await h.get('UNKNOWN')).statusCode).toBe(422);
    expect((await h.get('SKILLS','?actorId=SYN-OTHER')).statusCode).toBe(422);
    expect((await h.get('LEARNING','?sourceUrl=https%3A%2F%2Fevil.invalid')).statusCode).toBe(422);
    expect(h.source.read).not.toHaveBeenCalled();
    for(const verifySession of [
      async()=>null,
      async()=>({...actor,role:'ADMIN' as const}),
    ]){
      const app=createIntegratedApi({allowedOrigin:ORIGIN,repository:closedRepository,
        now:()=>FIXED_NOW,auth:{verifySession,revokeSession:async()=>{}}});
      apps.push(app);
      const response=await app.inject({url:'/api/owner/features/v2/insights/MENTORS'});
      expect([401,403]).toContain(response.statusCode);
    }
  });
  it('quota exhaustion and backend failure never access private source',async()=>{
    const limited=setup();limited.exhaust();
    const r=await limited.get('RECOGNITION');
    expect(r.statusCode).toBe(429);
    expect(limited.source.read).not.toHaveBeenCalled();
    const missing=setup();missing.failQuota();
    const unavailable=await missing.get('SKILLS');
    expect(unavailable.statusCode).toBe(503);
    expect(missing.source.read).not.toHaveBeenCalled();
  });
  it('revocation/consent revision changes fail closed after the core has computed',async()=>{
    for(const revoke of [
      (h:ReturnType<typeof setup>)=>h.revoke(),
      (h:ReturnType<typeof setup>)=>h.changeConsent(),
      (h:ReturnType<typeof setup>)=>h.changeHead(),
    ]){
      const h=setup();
      h.source.revalidate=vi.fn(async()=>{revoke(h);return false;});
      const r=await h.get('MENTORS');
      expect(r.statusCode).toBe(403);
      expect(r.body).not.toContain('mentor-1');
    }
  });
  it('rejects mismatched kind/actor/expired receipt and stale preference',async()=>{
    for(const mutate of [
      (h:ReturnType<typeof setup>)=>{h.receipt.actorId='SYN-OTHER';},
      (h:ReturnType<typeof setup>)=>{h.receipt.expiresAt='2026-11-01T00:00:00Z';},
      (h:ReturnType<typeof setup>)=>{h.cases.MENTORS.kind='SKILLS' as never;},
      (h:ReturnType<typeof setup>)=>{h.cases.MENTORS.preference.asOf='2026-11-02T00:00:00Z';},
    ]){
      const h=setup();mutate(h);
      expect((await h.get('MENTORS')).statusCode).toBe(503);
    }
  });
  it('retains uncertainty and privacy suppression, not fabricated institutional claims',async()=>{
    const h=setup();
    h.cases.INTERNATIONAL.guides[0]!.guide.translations.en!.review='MACHINE_DRAFT';
    const guideResult=(await h.get('INTERNATIONAL')).json();
    expect(guideResult.result.guides[0]).toMatchObject({
      status:'KOREAN_FALLBACK',locale:'ko',officialAdministrationComplete:false});
    h.cases.EMPLOYMENT.aggregates[0]!.numerator=1;
    const statResult=(await h.get('EMPLOYMENT')).json();
    expect(statResult.result.rows[0]).toMatchObject({status:'SUPPRESSED'});
    expect(statResult.result.rows[0].numerator).toBeUndefined();
    expect(statResult.result.rows[0].percent).toBeUndefined();
    h.cases.RECOGNITION.cases[0]!.proofs.splice(0);
    const recognition=(await h.get('RECOGNITION')).json();
    expect(recognition.result.reports[0]).toMatchObject({
      status:'DOCUMENTS_PENDING',officiallyRecognized:false});
  });
  it('quarantines duplicate mentor identities and rejects ambiguous skill requirements',async()=>{
    const h=setup();
    h.cases.MENTORS.mentors.push(mentor('mentor-1',{active:false}));
    const mentors=(await h.get('MENTORS')).json();
    expect(mentors.result.ranking.items).toEqual([]);
    h.cases.SKILLS.requirements.push(requirement('REQ-1'));
    const skills=await h.get('SKILLS');
    expect(skills.statusCode).toBe(503);
  });
  it('rejects incomplete operator source+quota config at startup',()=>{
    const h=setup();
    expect(()=>createIntegratedApi({allowedOrigin:ORIGIN,repository:closedRepository,
      now:()=>FIXED_NOW,auth:{verifySession:async()=>actor,revokeSession:async()=>{}},
      ownerInsights:{source:h.source,quota:undefined as never}})).toThrow(/quota/);
  });
});
