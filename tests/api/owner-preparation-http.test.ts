import {afterEach,describe,expect,it,vi} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import type {OwnerPreparationServices,TrustedOwnerPreparationSource} from
  '../../apps/api/src/modules/owner-preparation-http.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import {scholarship,fact,badge,badgeEvidence,FIXED_NOW} from
  '../../packages/core/src/feature-additions/v2.fixtures.js';

const ORIGIN='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'SYN-PREP-OWNER',sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
function fixture(enabled=true){
  let identity=actor.actorId,rights=true,quotaAllowed=true,quotaUnavailable=false;
  let consent='SYN-CONSENT-v1',rev='SYN-RIGHTS-v1';
  const snapshot={
    receipt:{actorId:actor.actorId,sourceVersion:'SYN-REV-v1',consentVersion:consent,
      rightsVersion:rev,expiresAt:'2026-11-30T00:00:00Z'},
    scholarships:[scholarship()],
    facts:[fact()],
    authorizedFactRevisions:['transcript-r1'],
    badges:[badge()],
    badgeEvidence:[badgeEvidence('activity-1'),badgeEvidence('activity-2')],
  };
  const source:TrustedOwnerPreparationSource={
    read:vi.fn(async()=>snapshot),
    revalidate:vi.fn(async(input)=>rights && input.actorId===identity
      &&input.receipt.consentVersion===consent
      &&input.receipt.rightsVersion===rev),
  };
  const quota:OwnerPreparationServices['quota']={
    consume:vi.fn(async(input)=>{
      if(quotaUnavailable)throw new Error('synthetic quota offline');
      return quotaAllowed && input.actorId===identity
        &&input.operation==='V2_OWNER_PREPARATION';
    }),
  };
  const app=createIntegratedApi({allowedOrigin:ORIGIN,repository:closedRepository,
    now:()=>FIXED_NOW,auth:{
      verifySession:async()=>({...actor,actorId:identity}),
      revokeSession:async()=>{},
    },...(enabled?{ownerPreparation:{source,quota}}:{})});
  apps.push(app);
  return {app,source,quota,snapshot,
    get:(q='')=>app.inject({url:'/api/owner/features/v2/preparation'+q}),
    revoke:()=>{rights=false;},exhaust:()=>{quotaAllowed=false;},
    failQuota:()=>{quotaUnavailable=true;},
    changeActor:()=>{identity='SYN-OTHER';},
    changeConsent:()=>{consent='SYN-CONSENT-v2';},
    changeRights:()=>{rev='SYN-RIGHTS-v2';},
  };
}
describe('#366/#343/#349 BETA scholarship and badge preparation source-to-API',()=>{
  it('only produces bounded non-award reports from current allowed owner evidence',async()=>{
    const h=fixture(),response=await h.get();
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      state:'READY',sourceVersion:'SYN-REV-v1',
      scholarships:[{scholarshipId:'fictional-scholarship',overall:'MET',
        officialDecision:null,mode:'VERIFIED_FACT_CHECK'}],
      badges:[{badgeId:'badge-1',issuedCredential:null}],
    });
    expect(h.source.read).toHaveBeenCalledOnce();
    expect(h.source.revalidate).toHaveBeenCalledOnce();
    expect(h.quota.consume).toHaveBeenCalledOnce();
    expect(response.body).not.toContain('SYN-PREP-OWNER');
    expect(response.body).not.toContain('SYN-CONSENT-v1');
    expect(response.body).not.toContain('transcript-r1');
  });
  it('returns honest NOT_CONNECTED with no operator source, never fixture data',async()=>{
    const h=fixture(false),response=await h.get();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({state:'NOT_CONNECTED',asOf:FIXED_NOW});
    expect(h.source.read).not.toHaveBeenCalled();
  });
  it('only authentic BETA may request the current preparation, never ADMIN or guest',async()=>{
    for(const verifySession of [async()=>null,async()=>({...actor,role:'ADMIN' as const})]){
      const app=createIntegratedApi({allowedOrigin:ORIGIN,repository:closedRepository,
        now:()=>FIXED_NOW,auth:{verifySession,revokeSession:async()=>{}}});
      apps.push(app);
      const response=await app.inject({url:'/api/owner/features/v2/preparation'});
      expect([401,403]).toContain(response.statusCode);
    }
  });
  it('rejects client-supplied policies, facts, asOf and identity',async()=>{
    const h=fixture();
    expect((await h.get('?actorId=SYN-OTHER')).statusCode).toBe(422);
    expect((await h.get('?asOf=2026-11-01T00:00:00Z')).statusCode).toBe(422);
    expect(h.source.read).not.toHaveBeenCalled();
  });
  it('denies a quota-exhausted request before reading any owner source or facts',async()=>{
    const h=fixture();h.exhaust();const r=await h.get();
    expect(r.statusCode).toBe(429);
    expect(r.json().code).toBe('RATE_LIMITED');
    expect(h.source.read).not.toHaveBeenCalled();
    expect(h.source.revalidate).not.toHaveBeenCalled();
  });
  it('fails closed on quota backend failure with no source read',async()=>{
    const h=fixture();h.failQuota();const r=await h.get();
    expect(r.statusCode).toBe(503);
    expect(h.source.read).not.toHaveBeenCalled();
  });
  it('revalidates current rights and consent after computation, including revocations',async()=>{
    for(const revoke of [
      (h:ReturnType<typeof fixture>)=>h.revoke(),
      (h:ReturnType<typeof fixture>)=>h.changeConsent(),
      (h:ReturnType<typeof fixture>)=>h.changeRights(),
    ]){
      const h=fixture();
      h.source.revalidate=vi.fn(async()=>{revoke(h);return false;});
      const r=await h.get();
      expect(r.statusCode).toBe(403);
      expect(r.body).not.toContain('fictional-scholarship');
    }
  });
  it('rejects cross-actor source snapshots, duplicate policies and invalid evidence',async()=>{
    for(const mutate of [
      (h:ReturnType<typeof fixture>)=>{h.snapshot.receipt.actorId='SYN-OTHER';},
      (h:ReturnType<typeof fixture>)=>{h.snapshot.scholarships.push(scholarship());},
      (h:ReturnType<typeof fixture>)=>{h.snapshot.badges.push(badge());},
      (h:ReturnType<typeof fixture>)=>{h.snapshot.badgeEvidence.push(badgeEvidence('activity-1'));},
      (h:ReturnType<typeof fixture>)=>{h.snapshot.receipt.expiresAt='2026-11-01T00:00:00Z';},
    ]){
      const h=fixture();mutate(h);const r=await h.get();
      expect(r.statusCode).toBe(503);
      expect(r.body).not.toContain('fictional-scholarship');
    }
  });
  it('accepts historical observations for the same academic term and uses the latest authorized fact',async()=>{
    const h=fixture();
    h.snapshot.facts.unshift(fact(1.8,{observedAt:'2026-10-10T00:00:00+09:00'}));
    const r=await h.get();
    expect(r.statusCode).toBe(200);
    expect(r.json().scholarships[0]).toMatchObject({overall:'MET',groups:[{
      state:'MET',conditions:[{factKey:'gpa',state:'MET',reason:'VERIFIED_MATCH'}],
    }]});
    expect(h.source.revalidate).toHaveBeenCalledOnce();
  });
  it('quarantines conflicting newest facts instead of arbitrarily choosing one or returning 503',async()=>{
    const h=fixture();
    h.snapshot.facts.push(fact(1.8)); // same term and observedAt, contradictory verified GPA
    const r=await h.get();
    expect(r.statusCode).toBe(200);
    expect(r.json().scholarships[0]).toMatchObject({overall:'UNKNOWN',groups:[{
      conditions:[{factKey:'gpa',state:'UNKNOWN',reason:'CONFLICTING_FACTS'}],
    }]});
    expect(h.source.revalidate).toHaveBeenCalledOnce();
  });
  it('keeps term and revision boundaries when other-term or unapproved observations are newer',async()=>{
    const h=fixture();
    h.snapshot.facts.push(
      fact(1.0,{academicTerm:'2025-2',observedAt:'2026-11-07T00:00:00+09:00'}),
      fact(1.0,{sourceRevisionId:'SYN-UNAUTHORIZED',observedAt:'2026-11-06T00:00:00+09:00'}),
    );
    const r=await h.get();
    expect(r.statusCode).toBe(200);
    expect(r.json().scholarships[0]).toMatchObject({overall:'MET',groups:[{
      conditions:[{state:'MET',reason:'VERIFIED_MATCH'}],
    }]});
    expect(h.source.revalidate).toHaveBeenCalledOnce();
  });
  it('does not treat revoked current owner rights as valid even when fact history is well-formed',async()=>{
    const h=fixture();
    h.snapshot.facts.push(fact(1.0,{observedAt:'2026-10-01T00:00:00+09:00'}));
    h.revoke();
    const r=await h.get();
    expect(r.statusCode).toBe(403);
    expect(h.source.read).toHaveBeenCalledOnce();
    expect(h.source.revalidate).toHaveBeenCalledOnce();
  });
  it('does not treat synthetic source rules as official verified live source',async()=>{
    const h=fixture();
    h.snapshot.scholarships[0]!.source.status='SYNTHETIC';
    h.snapshot.badges[0]!.source.status='SYNTHETIC';
    const r=await h.get();
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({scholarships:[{overall:'UNKNOWN',mode:'NOT_AVAILABLE'}],
      badges:[{status:'UNKNOWN'}]});
  });
  it('rejects partial production setup without a durable quota or rights reader',()=>{
    const h=fixture();
    expect(()=>createIntegratedApi({allowedOrigin:ORIGIN,repository:closedRepository,
      now:()=>FIXED_NOW,auth:{verifySession:async()=>actor,revokeSession:async()=>{}},
      ownerPreparation:{source:h.source,quota:undefined as never}})).toThrow(/quota/);
  });
});
