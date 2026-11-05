import {afterEach,describe,expect,it} from 'vitest';
import {createApi} from '../../apps/api/src/server.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import {registerOwnerStudyPlanCheckRoutes} from '../../apps/api/src/modules/profiles/owner-study-plan-check-http.js';
import type {TrustedOwnerStudyPlanSource,TrustedOwnerStudyPlanRights} from '../../apps/api/src/modules/profiles/owner-study-plan-check-http.js';
import {receiptFailure,receiptFailureCases} from './receipt-admission-fixture.js';

const now='2026-11-01T00:00:00.000Z',origin='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'SYN-RECEIPT-ACTOR',betaAllowed:true,
  sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),
  sessionExpiresAt:'2026-12-01T00:00:00.000Z',schoolMailProofExpiresAt:'2026-12-01T00:00:00.000Z'};
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});

describe('study-plan receipt admission through the production HTTP boundary',()=>{
  for(const boundary of ['source','rights'] as const){
    it.each(receiptFailureCases)(`preserves $failure at the ${boundary} boundary`,async({failure,status,code})=>{
      const source:TrustedOwnerStudyPlanSource={
        inspect:async()=>({receipt:'SYN-PLAN-RECEIPT',check:{
          state:'NEEDS_REVIEW',asOf:now,term:'2026-2',versions:{plan:'SYN-PLAN-1'},
          termLoadCreditUnits:0,planIssues:[],unchecked:[],evidenceLinks:[],
          caveats:['NOT_OFFICIAL_REGISTRATION','NOT_GRADUATION_DECISION','RULEPACK_UNVERIFIED'],
          disclosure:{mode:'REDACTED',visibleCourseRefs:[]},
        }}),
        revalidate:async()=>true,
      };
      const rights:TrustedOwnerStudyPlanRights={
        mayInspect:async()=>true,
        authorize:async()=>({allowed:true,rightsReceipt:'SYN-PLAN-RIGHTS'}),
        revalidate:async()=>true,
      };
      const fail=receiptFailure(failure,actor.actorId);
      if(boundary==='source')source.inspect=fail;else rights.authorize=fail;
      const verify=async()=>actor;
      const app=createApi({allowedOrigin:origin,repository:closedRepository,verifySession:verify,now:()=>now});
      apps.push(app);
      registerOwnerStudyPlanCheckRoutes({app,source,rights,session:{verify,now:()=>now}});
      const response=await app.inject({method:'POST',url:'/api/study-plans/check',
        headers:{origin,'x-csrf-token':actor.csrfToken},payload:{term:'2026-2'}});
      expect(response.statusCode).toBe(status);expect(response.json().code).toBe(code);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).not.toContain('SYNTHETIC-PRIVATE-PROVIDER-DETAIL');
    });
  }
});
