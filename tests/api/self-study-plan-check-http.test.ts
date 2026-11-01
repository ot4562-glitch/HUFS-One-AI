import {afterEach,describe,expect,it} from 'vitest';
import {createApi} from '../../apps/api/src/server.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {
  registerOwnerStudyPlanCheckRoutes,
} from '../../apps/api/src/modules/profiles/owner-study-plan-check-http.js';
import type {TrustedOwnerStudyPlanSource,TrustedOwnerStudyPlanRights} from
  '../../apps/api/src/modules/profiles/owner-study-plan-check-http.js';

const NOW='2026-11-01T00:00:00.000Z',ORIGIN='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'SYN-OWNER-A',
  sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2026-11-20T00:00:00Z',
  schoolMailProofExpiresAt:'2026-11-20T00:00:00Z'};
const HEADERS={origin:ORIGIN,'x-csrf-token':actor.csrfToken};
const review={
  state:'NEEDS_REVIEW',asOf:NOW,term:'2026-2',
  versions:{plan:'SYN-PLAN-1'},termLoadCreditUnits:0,
  planIssues:[],unchecked:[],evidenceLinks:[],
  caveats:['NOT_OFFICIAL_REGISTRATION','NOT_GRADUATION_DECISION','RULEPACK_UNVERIFIED'],
  disclosure:{mode:'REDACTED',visibleCourseRefs:[]},
};
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(app=>app.close()));apps.length=0;});
function fixture(options?:{source?:boolean;rights?:boolean}){
  let enabled=true,canRead=true,mayInspect=true,mayDisclose=true,mayRevalidate=true;
  let check:unknown=review;
  const seen:string[]=[];
  const source:TrustedOwnerStudyPlanSource={
    inspect:async input=>{
      seen.push('source:'+input.actorId);
      return {check,receipt:'SYN-RECEIPT-CURRENT'};
    },
    revalidate:async input=>{
      seen.push('source-recheck:'+input.actorId);
      return canRead;
    },
  };
  const rights:TrustedOwnerStudyPlanRights={
    mayInspect:async input=>{
      seen.push('pre:'+input.actorId);
      return mayInspect&&input.actorId===actor.actorId;
    },
    authorize:async input=>{
      seen.push('disclose:'+input.actorId);
      const permittedCourses=new Set(['SYN-COURSE-A']);
      const permittedEvidence=new Set(['SYN-EV-A']);
      return {
        allowed:mayDisclose
          &&input.courseRefs.every(x=>permittedCourses.has(x))
          &&input.evidenceRefs.every(x=>permittedEvidence.has(x))
          &&(input.disclosureMode!=='GRANT_SCOPED'
            ||input.sharingGrantVersion==='SYN-GRANT-1'),
        rightsReceipt:'SYN-RIGHTS-CURRENT',
      };
    },
    revalidate:async input=>{
      seen.push('rights-recheck:'+input.actorId);
      return mayRevalidate;
    },
  };
  const verify=async()=>enabled?actor:null;
  const app=createApi({
    allowedOrigin:ORIGIN,repository:new MemoryApiRepository({profiles:[]}),
    verifySession:verify,now:()=>NOW,
  });
  registerOwnerStudyPlanCheckRoutes({
    app,session:{verify,now:()=>NOW},
    ...(options?.source?{source}:{}),
    ...(options?.rights===false?{}:{rights}),
  });
  apps.push(app);
  const post=(body:Record<string,unknown>={term:'2026-2'})=>app.inject({
    method:'POST',url:'/api/study-plans/check',headers:HEADERS,payload:body,
  });
  return {app,post,seen,setCheck:(v:unknown)=>{check=v;},
    revokeRights:()=>{canRead=false;},logout:()=>{enabled=false;},
    denyBeforeRead:()=>{mayInspect=false;},
    denyDisclosure:()=>{mayDisclose=false;},
    revokeGrantAfterRead:()=>{mayRevalidate=false;},
  };
}

describe('A05 #81 owner study-plan read-only HTTP gate (no unmerged core)',()=>{
  it('returns 503 when no independently approved academic core provider is wired',async()=>{
    const h=fixture();
    const r=await h.post();
    expect(r.statusCode).toBe(503);
    expect(h.seen).toEqual([]);
  },60_000);
  it('returns only a conservative review state from a trusted synthetic port',async()=>{
    const h=fixture({source:true});
    const r=await h.post();
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual(review);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(h.seen).toEqual([
      'pre:'+actor.actorId,'source:'+actor.actorId,'disclose:'+actor.actorId,
      'source-recheck:'+actor.actorId,'rights-recheck:'+actor.actorId,
    ]);
  });
  it('requires authenticated owner, Origin/CSRF, and rejects private client inputs',async()=>{
    const h=fixture({source:true});
    for(const payload of [
      {term:'2026-2',actorId:'SYN-OTHER'},
      {term:'2026-2',attempts:[{grade:'A'}]},
      {term:'2026-2',rulePack:{state:'APPROVED'}},
      {term:'2026-W'},
    ])expect((await h.post(payload)).statusCode).toBe(422);
    const noCsrf=await h.app.inject({method:'POST',url:'/api/study-plans/check',
      headers:{origin:ORIGIN},payload:{term:'2026-2'}});
    expect(noCsrf.statusCode).toBe(403);
    h.logout();
    expect((await h.post()).statusCode).toBe(401);
    expect(h.seen).toEqual([]);
  });
  it('blocks missing rights, stale plan versions and time travel',async()=>{
    const h=fixture({source:true});
    h.revokeRights();
    expect((await h.post()).statusCode).toBe(403);
    h.setCheck({...review,asOf:'2026-12-01T00:00:00.000Z'});
    expect((await h.post()).statusCode).toBe(503);
    h.setCheck(review);
    expect((await h.post({term:'2026-2',expectedPlanVersion:'SYN-OLD'}))
      .statusCode).toBe(409);
  });
  it('requires independently injected rights even for a redacted review result',async()=>{
    const h=fixture({source:true,rights:false});
    const r=await h.post();
    expect(r.statusCode).toBe(503);
    expect(h.seen).toEqual([]); // Source must NOT read the transcript.
  });
  it('denies withdrawn consent before any academic source inspection',async()=>{
    const h=fixture({source:true});
    h.denyBeforeRead();
    const r=await h.post();
    expect(r.statusCode).toBe(403);
    expect(h.seen).toEqual(['pre:'+actor.actorId]);
  });
  it('denies unshared course IDs and source refs independent of provider claims',async()=>{
    const h=fixture({source:true});
    const issue={code:'NEEDS_REVIEW',reasonCode:'UNKNOWN',
      courseRefs:['SYN-PRIVATE-COURSE'],evidenceRefs:[]};
    h.setCheck({...review,
      planIssues:[issue],
      disclosure:{mode:'OWNER_VERIFIED',visibleCourseRefs:['SYN-PRIVATE-COURSE']},
    });
    const r=await h.post();
    expect(r.statusCode).toBe(403);
    expect(r.body).not.toContain('SYN-PRIVATE-COURSE');
    h.setCheck({...review,
      planIssues:[{...issue,courseRefs:[],evidenceRefs:['SYN-PRIVATE-EV']}],
      evidenceLinks:[{evidenceRef:'SYN-PRIVATE-EV',href:'https://synthetic.invalid/source',
        verifiedAt:NOW}],
    });
    const denied=await h.post();
    expect(denied.statusCode).toBe(403);
    expect(denied.body).not.toContain('SYN-PRIVATE-EV');
  });
  it('redacts a revoked owner/SharingGrant before the final HTTP response',async()=>{
    const h=fixture({source:true});
    h.revokeGrantAfterRead();
    const r=await h.post();
    expect(r.statusCode).toBe(403);
    expect(h.seen).toContain('rights-recheck:'+actor.actorId);
    const h2=fixture({source:true});
    h2.denyDisclosure();
    expect((await h2.post()).statusCode).toBe(403);
  });
  it('permits only independently verified course and evidence refs for this plan',async()=>{
    const h=fixture({source:true});
    const check={
      ...review,planIssues:[{code:'NEEDS_REVIEW',reasonCode:'UNKNOWN',
        courseRefs:['SYN-COURSE-A'],evidenceRefs:['SYN-EV-A']}],
      evidenceLinks:[{evidenceRef:'SYN-EV-A',
        href:'https://synthetic.invalid/source',verifiedAt:NOW}],
      disclosure:{mode:'OWNER_VERIFIED',visibleCourseRefs:['SYN-COURSE-A']},
    };
    h.setCheck(check);
    const r=await h.post();
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual(check);
  });
  it('never serializes unreviewed READY, raw ledger, grades or courseRef leakage',async()=>{
    const h=fixture({source:true});
    for(const invalid of [
      {...review,state:'READY'},
      {...review,termLoadCreditUnits:10,creditCapUnits:36},
      {...review,grade:'A',attemptToken:'SYN-ATTEMPT-1'},
      {...review,planIssues:[{code:'NEEDS_REVIEW',reasonCode:'UNKNOWN',
        courseRefs:['SYN-PRIVATE-COURSE'],evidenceRefs:[]}]},
    ]){
      h.setCheck(invalid);
      const r=await h.post();
      expect(r.statusCode).toBe(503);
      expect(r.body).not.toContain('SYN-PRIVATE-COURSE');
      expect(r.body).not.toContain('SYN-ATTEMPT-1');
    }
  });
});
