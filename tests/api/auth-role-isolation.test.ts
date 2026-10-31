import {afterEach,describe,expect,it} from 'vitest';
import {authorizeSession,ApiFailure} from
  '../../apps/api/src/modules/auth/gates.js';
import {createApi} from '../../apps/api/src/server.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import type {VerifiedActor} from '../../apps/api/src/types.js';

const AT='2026-10-31T12:00:00.000Z';
const EXPIRY='2026-10-31T13:00:00.000Z';
const common={
  actorId:'google:synthetic-sub',
  sessionIdHash:'a'.repeat(64),
  sessionExpiresAt:EXPIRY,
  csrfToken:'b'.repeat(43),
};
const beta={
  ...common,
  role:'BETA' as const,
  betaAllowed:true,
  verifiedSchoolEmail:'test@hufs.ac.kr',
  schoolProofMethod:'MAILBOX_OTP' as const,
  schoolMailProofExpiresAt:EXPIRY,
};
const admin={
  ...beta,
  role:'ADMIN' as const,
};
const reviewer={
  ...common,
  role:'REVIEWER' as const,
  verifiedEmail:'judge@example.org',
  identityProofExpiresAt:EXPIRY,
};
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(app=>app.close()));apps.length=0;});

describe('strict role separation: administrative access must use its own independent policy',()=>{
  it('rejects an otherwise valid ADMIN actor without independent admin admission',()=>{
    expect(()=>authorizeSession(admin,AT))
      .toThrowError(new ApiFailure('FORBIDDEN'));
    expect(authorizeSession(beta,AT)).toMatchObject({role:'BETA'});
    expect(authorizeSession(reviewer,AT)).toMatchObject({role:'REVIEWER'});
  });

  it('does not expose even a CSRF token to a synthetic ADMIN under the public API',async()=>{
    const app=createApi({
      repository:closedRepository,
      allowedOrigin:'https://example.test',
      now:()=>AT,
      verifySession:async():Promise<VerifiedActor|null>=>admin,
    });
    apps.push(app);
    const response=await app.inject({
      method:'GET',url:'/api/auth/csrf',headers:{cookie:'synthetic'},
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({code:'FORBIDDEN'});
  });

  it('rejects cross-role mixing even when a valid session digest and CSRF exist',()=>{
    for(const wrong of [
      {...beta,role:'REVIEWER'},
      {...reviewer,role:'BETA'},
      {...beta,role:'ADMIN',identityProofExpiresAt:EXPIRY},
      {...reviewer,role:'REVIEWER',betaAllowed:true},
    ]){
      expect(()=>authorizeSession(wrong,AT)).toThrow();
    }
  });
});
