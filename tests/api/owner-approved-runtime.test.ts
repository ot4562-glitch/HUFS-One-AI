import {afterEach,describe,expect,it,vi} from 'vitest';
import {createPostgresApplication} from '../../apps/api/src/application-postgres.js';
import {prepareOperatorPostgres,REQUIRED_SQL_ROLES} from '../../apps/api/src/operator-postgres-runtime.js';

const apps:Array<ReturnType<typeof createPostgresApplication>>=[];
const closers:Array<()=>Promise<void>>=[];
afterEach(async()=>{
  await Promise.allSettled(apps.splice(0).map(app=>app.close()));
  await Promise.allSettled(closers.splice(0).map(close=>close()));
  vi.unstubAllEnvs();
});
const pool=()=>({connect:vi.fn(async()=>{throw new Error('No network permitted in synthetic composition tests');})});
function application(){
  const c={
    auth:{pools:{sessions:pool(),admission:pool(),attempts:pool()},attemptDigestKey:Buffer.alloc(32,7),
      google:{clientId:'synthetic.apps.googleusercontent.com',allowedOrigin:'https://example.test',
        redirectUri:'https://example.test/api/auth/google/callback',
        exchangeCode:vi.fn(async()=>{throw new Error('No Google request permitted');})}},
    platform:{pools:{projections:pool(),calendar:pool(),personal:pool(),evidence:pool()},
      evidenceRights:{resolveFor:vi.fn(async()=>null)},reviewerSandbox:pool()},
    reviewer:{invitations:pool(),demo:{listProfiles:async()=>[],readSnapshot:async()=>null}},
    schoolMailProof:{issue:async()=>({challengeId:'A'.repeat(22),expiresAt:'2026-11-06T00:00:00.000Z'}),
      verify:async()=>false},
    runtime:'production' as const,
  };
  return c;
}
const settings=(name:string)=>({
  connectionString:`postgresql://hufs_${name}:synthetic@private-db.example.test/hufs_${name}`,
  environment:'production' as const,expectedRole:`hufs_${name}`,
  trustedCaPem:'-----BEGIN CERTIFICATE-----\nSYNTHETIC-CA\n-----END CERTIFICATE-----',
});
function operator(){return {
  roles:Object.fromEntries(REQUIRED_SQL_ROLES.map(role=>[role,settings(role)])),
  google:application().auth.google,attemptDigestKey:Buffer.alloc(32,7),
  evidenceRights:{resolveFor:async()=>null},
};}
function retain(prepared:ReturnType<typeof prepareOperatorPostgres>){
  for(const p of [...Object.values(prepared.pools),...Object.values(prepared.extraPools??{})])
    closers.push(()=>p.close());
}

describe('owner-authorized production configuration, not a blanket authorization bypass',()=>{
  it.each(['APP_ENV','NODE_ENV'])('builds the explicitly configured production application under %s',async name=>{
    vi.stubEnv(name,'production');
    const c=application();
    const app=createPostgresApplication(c);apps.push(app);
    expect(app.server.listening).toBe(false);
    for(const url of ['/api/auth/session','/api/profile','/api/admin/usage'])
      expect((await app.inject({url})).statusCode).toBe(401);
    expect(c.auth.google.exchangeCode).not.toHaveBeenCalled();
    for(const p of Object.values(c.platform.pools))expect(p.connect).not.toHaveBeenCalled();
  });
  it('does not turn owner approval into a fake authenticated identity',async()=>{
    vi.stubEnv('APP_ENV','production');
    const c=application(),app=createPostgresApplication(c);apps.push(app);
    const response=await app.inject({url:'/api/profile',headers:{'x-user-id':'SYN-OTHER','x-role':'ADMIN'}});
    expect(response.statusCode).toBe(401);
    expect(c.platform.pools.projections.connect).not.toHaveBeenCalled();
  });
  it('rejects absent runtime selection, mail verifier and HTTPS origin without an external call',()=>{
    vi.stubEnv('APP_ENV','production');
    const c=application();
    const {runtime:_runtime,...missingRuntime}=c;
    expect(()=>createPostgresApplication(missingRuntime)).toThrow(/Production integration disabled/);
    const {schoolMailProof:_mail,...missingMail}=c;
    expect(()=>createPostgresApplication(missingMail)).toThrow(/production.*school.mail|school.mail.*production/i);
    expect(()=>createPostgresApplication({...c,auth:{...c.auth,google:{...c.auth.google,
      allowedOrigin:'http://example.test',redirectUri:'http://example.test/api/auth/google/callback'}}})).toThrow();
    expect(c.auth.google.exchangeCode).not.toHaveBeenCalled();
  });
});

describe('managed owner SQL extensions',()=>{
  it('wires an explicitly isolated experience-approval pool without opening a socket',()=>{
    const authority={mayUse:async()=>true};
    const prepared=prepareOperatorPostgres({...operator(),extensions:{
      experienceApproval:{settings:settings('experience_approval'),authority},
    }} as any);
    retain(prepared);
    const all=prepared.extraPools as Record<string,unknown>|undefined;
    expect(all?.experienceApproval).toBeDefined();
    expect(prepared.application.platform.experienceApproval?.pool).toBe(all?.experienceApproval);
    expect(prepared.application.platform.experienceApproval?.authority).toBe(authority);
  });
  it('rejects owner extension roles aliased to the base session role',()=>{
    expect(()=>prepareOperatorPostgres({...operator(),extensions:{
      experienceApproval:{settings:settings('sessions'),authority:{mayUse:async()=>true}},
    }} as any)).toThrow(/independently restricted|isolated extensions/);
  });
  it('refuses unknown extension names and a supplied raw pool',()=>{
    expect(()=>prepareOperatorPostgres({...operator(),extensions:{unknown:{settings:settings('unknown')}}} as any)).toThrow(/extension/i);
    expect(()=>prepareOperatorPostgres({...operator(),extensions:{
      experienceApproval:{settings:settings('experience_approval'),pool:pool(),authority:{mayUse:async()=>true}},
    }} as any)).toThrow(/extension|pool/i);
  });
});
