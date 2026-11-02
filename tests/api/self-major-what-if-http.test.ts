import {afterEach,describe,expect,it} from 'vitest';
import {isDeepStrictEqual} from 'node:util';
import {createApi} from '../../apps/api/src/server.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import type {VerifiedActor} from '../../apps/api/src/types.js';
import {
  registerOwnerMajorWhatIfRoutes,
} from '../../apps/api/src/modules/profiles/owner-major-what-if-http.js';
import type {
  TrustedOwnerMajorWhatIfSource,TrustedOwnerMajorWhatIfRights,ApprovedMajorWhatIfGate,
} from '../../apps/api/src/modules/profiles/owner-major-what-if-http.js';

const NOW='2026-11-01T00:00:00.000Z',ORIGIN='https://synthetic.invalid';
const URL='/api/academics/major-what-if';
const actor={role:'BETA' as const,actorId:'SYN-OWNER-A',
  sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2026-11-20T00:00:00Z',
  schoolMailProofExpiresAt:'2026-11-20T00:00:00Z'};
const HEADERS={origin:ORIGIN,'x-csrf-token':actor.csrfToken};
const scenario={action:'ADD_MINOR' as const,targetMajorId:'SYN-MAJOR-A'};
const blocked={state:'BLOCKED_DEPENDENCY',asOf:NOW,scenario,
  blockers:['CALCULATION_CORE_UNAVAILABLE'],caveat:'HYPOTHETICAL_NOT_OFFICIAL'};
const ready={state:'READY',asOf:NOW,scenario,
  current:{asOf:NOW,role:'CURRENT',rulePackVersion:'SYN-RULE-C',
    earnedCreditUnits:20,remainingCreditUnits:100,requirements:[]},
  hypothetical:{asOf:NOW,role:'HYPOTHETICAL',rulePackVersion:'SYN-RULE-H',
    earnedCreditUnits:20,remainingCreditUnits:110,requirements:[{
      requirementId:'SYN-REQ-A',state:'MISSING',missingCreditUnits:10}]},
  delta:[{requirementId:'SYN-REQ-A',change:'NEW_REQUIREMENT',evidenceRefs:['SYN-EV-A']}],
  versions:{currentRulePack:'SYN-RULE-C',hypotheticalRulePack:'SYN-RULE-H',
    cohort:'SYN-COHORT-1',overlapPolicy:'SYN-OVERLAP-1',
    transcriptProjection:'SYN-TRANSCRIPT-1',core:'SYN-CORE-1'},
  evidenceLinks:[{evidenceRef:'SYN-EV-A',href:ORIGIN+'/clause',verifiedAt:NOW}],
  approval:{verifiedAt:NOW,coreVersion:'SYN-CORE-1',
    cohortApplicabilityVersion:'SYN-COHORT-1',currentRulePackVersion:'SYN-RULE-C',
    hypotheticalRulePackVersion:'SYN-RULE-H',overlapPolicyVersion:'SYN-OVERLAP-1',
    transcriptProjectionVersion:'SYN-TRANSCRIPT-1',sourceRightsVersion:'SYN-RIGHTS-1',
    ownerConsentVersion:'SYN-CONSENT-1',officialEvidenceRefs:['SYN-EV-A']},
  caveat:'HYPOTHETICAL_NOT_OFFICIAL'};
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(app=>app.close()));apps.length=0;});

function fixture(options:{source?:boolean;rights?:boolean;approval?:boolean}={}){
  let identity:VerifiedActor|null=actor;
  let check:unknown=blocked,currentVersion='SYN-CURRENT-1';
  let mayRead=true,mayDisclose=true,sourceCurrent=true,rightsCurrent=true;
  let approved=true,approvalCurrent=true;
  const seen:string[]=[];
  const hooks:Partial<Record<'pre'|'source'|'authorize'|'approval'|'sourceRecheck'
    |'rightsRecheck'|'approvalRecheck',()=>void>>={};
  const source:TrustedOwnerMajorWhatIfSource={
    inspect:async input=>{
      seen.push('source:'+input.actorId);hooks.source?.();
      return {check,receipt:'SYN-SOURCE-RECEIPT',currentVersion};
    },
    revalidate:async()=>{
      seen.push('sourceRecheck');hooks.sourceRecheck?.();return sourceCurrent;
    },
  };
  const rights:TrustedOwnerMajorWhatIfRights={
    mayInspect:async input=>{
      seen.push('pre:'+input.actorId);hooks.pre?.();return mayRead;
    },
    authorize:async input=>{
      seen.push('authorize');hooks.authorize?.();
      return {allowed:mayDisclose&&input.evidenceLinks.every(link=>
        link.evidenceRef==='SYN-EV-A'&&link.href===ORIGIN+'/clause'),
      rightsReceipt:'SYN-RIGHTS-RECEIPT'};
    },
    revalidate:async()=>{
      seen.push('rightsRecheck');hooks.rightsRecheck?.();return rightsCurrent;
    },
  };
  const approvalGate:ApprovedMajorWhatIfGate={
    authorize:async input=>{
      seen.push('approval');hooks.approval?.();
      return {allowed:approved&&isDeepStrictEqual(input.approval,ready.approval)
        &&isDeepStrictEqual(input.versions,ready.versions)
        &&isDeepStrictEqual(input.evidenceLinks,ready.evidenceLinks)
        &&input.currentVersion==='SYN-CURRENT-1'
        &&input.sourceReceipt==='SYN-SOURCE-RECEIPT'
        &&isDeepStrictEqual(input.scenario,scenario),
      approvalReceipt:'SYN-APPROVAL-RECEIPT'};
    },
    revalidate:async()=>{
      seen.push('approvalRecheck');hooks.approvalRecheck?.();return approvalCurrent;
    },
  };
  const verify=async()=>identity;
  const app=createApi({allowedOrigin:ORIGIN,
    repository:new MemoryApiRepository({profiles:[]}),verifySession:verify,now:()=>NOW});
  registerOwnerMajorWhatIfRoutes({app,session:{verify,now:()=>NOW},
    ...(options.source?{source}:{}),...(options.rights===false?{}:{rights}),
    ...(options.approval?{approvalGate}:{})});
  apps.push(app);
  const post=(payload:unknown={scenario})=>app.inject({
    method:'POST',url:URL,headers:HEADERS,payload:payload as Record<string,unknown>});
  return {app,post,seen,hooks,setCheck:(v:unknown)=>{check=v;},
    setIdentity:(v:VerifiedActor|null)=>{identity=v;},
    setVersion:(v:string)=>{currentVersion=v;},denyRead:()=>{mayRead=false;},
    denyDisclosure:()=>{mayDisclose=false;},revokeSource:()=>{sourceCurrent=false;},
    revokeRights:()=>{rightsCurrent=false;},denyApproval:()=>{approved=false;},
    revokeApproval:()=>{approvalCurrent=false;}};
}

describe('#82 owner major What-if read-only HTTP boundary',()=>{
  it('fails closed without source or independent rights and does not inspect a transcript',async()=>{
    for(const options of [{},{source:true,rights:false}]){
      const h=fixture(options);
      expect((await h.post()).statusCode).toBe(503);
      expect(h.seen).toEqual([]);
    }
  },60_000);
  it('returns an honest blocked dependency after preauthorization and final rechecks',async()=>{
    const h=fixture({source:true});
    const r=await h.post();
    expect(r.statusCode).toBe(200);expect(r.json()).toEqual(blocked);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(h.seen).toEqual(['pre:'+actor.actorId,'source:'+actor.actorId,
      'authorize','sourceRecheck','rightsRecheck']);
  });
  it('requires owner BETA session and Origin/CSRF before private reads',async()=>{
    const h=fixture({source:true});
    for(const headers of [{origin:ORIGIN},{...HEADERS,origin:'https://other.invalid'}]){
      expect((await h.app.inject({method:'POST',url:URL,headers,payload:{scenario}}))
        .statusCode).toBe(403);
    }
    h.setIdentity({...actor,role:'ADMIN'});
    expect((await h.post()).statusCode).toBe(403);
    const {betaAllowed,schoolMailProofExpiresAt,...base}=actor;
    h.setIdentity({...base,role:'REVIEWER',verifiedEmail:'reviewer@synthetic.invalid',
      identityProofExpiresAt:actor.sessionExpiresAt});
    expect((await h.post()).statusCode).toBe(403);
    h.setIdentity(null);expect((await h.post()).statusCode).toBe(401);
    expect(h.seen).toEqual([]);
  });
  it('rejects actor/transcript/approval injection and malformed scenarios',async()=>{
    const h=fixture({source:true});
    for(const payload of [{scenario,actorId:'SYN-OTHER'},{scenario,transcript:[]},
      {scenario,approval:ready.approval},{scenario:{action:'REMOVE_MINOR',targetMajorId:'X'}},
      {scenario:{...scenario,targetMajorId:'<script>'}},{scenario,expectedCurrentVersion:3}]){
      expect((await h.post(payload)).statusCode).toBe(422);
    }
    expect(h.seen).toEqual([]);
  });
  it('denies absent consent before the source read, including logout during preauthorization',async()=>{
    const h=fixture({source:true});h.denyRead();
    expect((await h.post()).statusCode).toBe(403);
    expect(h.seen).toEqual(['pre:'+actor.actorId]);
    const h2=fixture({source:true});h2.hooks.pre=()=>h2.setIdentity(null);
    expect((await h2.post()).statusCode).toBe(401);
    expect(h2.seen).toEqual(['pre:'+actor.actorId]);
  });
  it('compares expected current version with the source receipt for blocked and ready results',async()=>{
    const h=fixture({source:true,approval:true});
    for(const check of [blocked,ready]){
      h.setCheck(check);
      expect((await h.post({scenario,expectedCurrentVersion:'SYN-OLD'})).statusCode).toBe(409);
    }
    h.setCheck(blocked);
    expect((await h.post({scenario,expectedCurrentVersion:'SYN-CURRENT-1'})).statusCode).toBe(200);
    h.setVersion('');expect((await h.post()).statusCode).toBe(503);
  });
  it('rejects mismatched scenarios, future snapshots, and extra private response fields',async()=>{
    const h=fixture({source:true});
    for(const check of [{...blocked,scenario:{...scenario,targetMajorId:'SYN-OTHER'}},
      {...blocked,scenario:{action:'REMOVE_MINOR'}},
      {...blocked,asOf:'2026-12-01T00:00:00Z'},
      {...blocked,transcript:[{grade:'SECRET'}]},
      {...blocked,blockers:['FAKE_READY']}]){
      h.setCheck(check);const r=await h.post();
      expect(r.statusCode).toBe(503);expect(r.body).not.toContain('SECRET');
    }
  });
  it('requires independent approval for READY and authorizes exact evidence link targets',async()=>{
    const missing=fixture({source:true});missing.setCheck(ready);
    expect((await missing.post()).statusCode).toBe(503);
    const h=fixture({source:true,approval:true});h.setCheck(ready);
    expect((await h.post()).statusCode).toBe(200);
    h.denyApproval();expect((await h.post()).statusCode).toBe(503);
    const forged=fixture({source:true,approval:true});
    forged.setCheck({...ready,approval:{...ready.approval,sourceRightsVersion:'SYN-FORGED'}});
    expect((await forged.post()).statusCode).toBe(503);
    forged.setCheck({...ready,evidenceLinks:[{...ready.evidenceLinks[0],
      href:'https://unapproved.invalid/private'}]});
    const r=await forged.post();expect(r.statusCode).toBe(403);
    expect(r.body).not.toContain('unapproved.invalid');
  });
  it('rejects forged cohort and delta proof and non-hypothetical earned credits',async()=>{
    const h=fixture({source:true,approval:true});
    for(const check of [
      {...ready,versions:{...ready.versions,cohort:'SYN-FORGED'},
        approval:{...ready.approval,cohortApplicabilityVersion:'SYN-FORGED'}},
      {...ready,delta:[]},
      {...ready,hypothetical:{...ready.hypothetical,earnedCreditUnits:99}},
    ]){h.setCheck(check);expect((await h.post()).statusCode).toBe(503);}
  });
  it('checks independent approval of every RulePack, core, cohort, overlap, consent and transcript head',async()=>{
    const h=fixture({source:true,approval:true});
    for(const [version,proof] of [
      ['currentRulePack','currentRulePackVersion'],
      ['hypotheticalRulePack','hypotheticalRulePackVersion'],
      ['core','coreVersion'],['cohort','cohortApplicabilityVersion'],
      ['overlapPolicy','overlapPolicyVersion'],
      ['transcriptProjection','transcriptProjectionVersion'],
    ] as const){
      h.setCheck({...ready,versions:{...ready.versions,[version]:'SYN-UNAPPROVED'},
        approval:{...ready.approval,[proof]:'SYN-UNAPPROVED'},
        current:{...ready.current,...(version==='currentRulePack'
          ?{rulePackVersion:'SYN-UNAPPROVED'}:{})},
        hypothetical:{...ready.hypothetical,...(version==='hypotheticalRulePack'
          ?{rulePackVersion:'SYN-UNAPPROVED'}:{})}});
      expect((await h.post()).statusCode).toBe(503);
      expect(h.seen).toContain('approval');
    }
    for(const proof of ['sourceRightsVersion','ownerConsentVersion'] as const){
      h.setCheck({...ready,approval:{...ready.approval,[proof]:'SYN-UNAPPROVED'}});
      expect((await h.post()).statusCode).toBe(503);
    }
  });
  it('denies source, rights, approval and session revocation during awaited operations',async()=>{
    const cases:[keyof ReturnType<typeof fixture>['hooks'],
      (h:ReturnType<typeof fixture>)=>void,number][]=[
      ['authorize',h=>h.revokeSource(),403],['sourceRecheck',h=>h.revokeRights(),403],
      ['rightsRecheck',h=>h.revokeApproval(),403],
      ['approvalRecheck',h=>h.setIdentity(null),401],
      ['approvalRecheck',h=>h.setIdentity({...actor,sessionIdHash:'X'.repeat(32)}),403],
    ];
    for(const [step,revoke,status] of cases){
      const h=fixture({source:true,approval:true});h.setCheck(ready);
      h.hooks[step]=()=>revoke(h);
      const r=await h.post();expect(r.statusCode).toBe(status);
      expect(r.body).not.toContain('SYN-REQ-A');
    }
  });
  it('maps provider and independent authority failures to sanitized 503 responses',async()=>{
    for(const step of ['pre','source','authorize','approval'] as const){
      const h=fixture({source:true,approval:true});h.setCheck(ready);
      h.hooks[step]=()=>{throw new Error('SYN-PRIVATE-INTERNAL');};
      const r=await h.post();expect(r.statusCode).toBe(503);
      expect(r.body).not.toContain('SYN-PRIVATE-INTERNAL');
    }
  });
});
