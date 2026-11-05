import {afterEach,describe,expect,it,vi} from 'vitest';
import {prepareOperatorPostgres,REQUIRED_SQL_ROLES,startOperatorPostgres} from '../../apps/api/src/operator-postgres-runtime.js';
import type {OperatorSqlPools,PreparedOperatorPostgres} from '../../apps/api/src/operator-postgres-runtime.js';

const opened:Array<{close():Promise<void>}>=[];
afterEach(async()=>{
  await Promise.allSettled(opened.splice(0).map(x=>x.close()));
  vi.unstubAllEnvs();
});
const makeConfig=()=>({
  roles:Object.fromEntries(REQUIRED_SQL_ROLES.map((role,i)=>[
    role,{connectionString:`postgresql://hufs_${role}:synthetic@private-db.example.test/hufs_live_${i}`,
      environment:'production' as const,expectedRole:`hufs_${role}`,
      trustedCaPem:'-----BEGIN CERTIFICATE-----\nSYNTHETIC-NOT-A-REAL-CA\n-----END CERTIFICATE-----'},
  ])),
  google:{clientId:'synthetic.apps.googleusercontent.com',
    allowedOrigin:'https://example.test',
    redirectUri:'https://example.test/api/auth/google/callback',
    exchangeCode:vi.fn(async()=>{throw Error('No Google requests in tests');})},
  attemptDigestKey:Buffer.alloc(32,7),
  evidenceRights:{resolveFor:vi.fn(async()=>null)},
});
function fakePrepared(options:{fail?:string;badReady?:string}={}):{prepared:PreparedOperatorPostgres;connected:string[];closed:string[];released:string[]}{
  const connected:string[]=[],closed:string[]=[],released:string[]=[];
  const pools=Object.fromEntries(REQUIRED_SQL_ROLES.map(role=>[role,{
    connect:vi.fn(async()=>{
      connected.push(role);
      if(options.fail===role)throw Error('Synthetic SQL unavailable');
      return {query:vi.fn(async()=>({rows:[{ready:options.badReady===role?0:1}]})),
        release:()=>{released.push(role);}};
    }),close:vi.fn(async()=>{closed.push(role);}),
  }])) as unknown as OperatorSqlPools;
  const config=makeConfig();
  const prepared={pools,application:{
    auth:{pools:{sessions:pools.sessions,admission:pools.admission,attempts:pools.attempts},
      attemptDigestKey:config.attemptDigestKey,google:config.google},
    platform:{pools:{projections:pools.projections,calendar:pools.calendar,
      personal:pools.personal,evidence:pools.evidence},
      evidenceRights:config.evidenceRights},
  }};
  return {prepared,connected,closed,released};
}
describe('real-role PostgreSQL API operator composition',()=>{
  it('rejects alias roles and same credentials before constructing any pools',()=>{
    const input=makeConfig() as any;
    input.roles.evidence.expectedRole=input.roles.calendar.expectedRole;
    expect(()=>prepareOperatorPostgres(input)).toThrow(/Seven independently restricted/);
    input.roles.evidence.expectedRole='hufs_evidence';
    input.roles.evidence.connectionString=input.roles.calendar.connectionString;
    expect(()=>prepareOperatorPostgres(input)).toThrow(/Seven independently restricted/);
  });
  it('refuses local/test pools for the real operator assembly',()=>{
    const input=makeConfig() as any;input.roles.sessions.environment='local-test';
    expect(()=>prepareOperatorPostgres(input)).toThrow(/Seven independently restricted/);
  });
  it('requires trusted Google exchanger, current evidence rights and strong digest',()=>{
    const input=makeConfig() as any;input.google.exchangeCode=undefined;
    expect(()=>prepareOperatorPostgres(input)).toThrow(/Explicit Google/);
    input.google.exchangeCode=async()=>'';input.attemptDigestKey=Buffer.alloc(16);
    expect(()=>prepareOperatorPostgres(input)).toThrow(/digest key/);
  });
  it('assembles seven role-verified TLS pools but never connects or listens during prepare',async()=>{
    const result=prepareOperatorPostgres(makeConfig() as any);
    expect(Object.keys(result.pools)).toEqual([...REQUIRED_SQL_ROLES]);
    expect(result.application.auth.pools.sessions).toBe(result.pools.sessions);
    expect(result.application.platform.pools.evidence).toBe(result.pools.evidence);
    await Promise.all(REQUIRED_SQL_ROLES.map(role=>result.pools[role].close()));
  });
  it('wires only explicitly reviewed immediate proxy IPs into the real operator application',async()=>{
    const input={...makeConfig(),trustedProxyAddresses:['127.0.0.1']};
    const prepared=prepareOperatorPostgres(input as any);
    expect(prepared.application.trustedProxyAddresses).toEqual(['127.0.0.1']);
    // Mutating a caller-owned setting after prepare cannot silently change trust.
    input.trustedProxyAddresses[0]='10.20.0.99';
    expect(prepared.application.trustedProxyAddresses).toEqual(['127.0.0.1']);
    await Promise.all(Object.values(prepared.pools).map(pool=>pool.close()));
    const safeDefault=prepareOperatorPostgres(makeConfig() as any);
    expect(safeDefault.application.trustedProxyAddresses).toBeUndefined();
    await Promise.all(Object.values(safeDefault.pools).map(pool=>pool.close()));
    for(const invalid of [[],['0.0.0.0'],['::'],['10.20.0.0/24'],['localhost'],
      ['10.20.0.2','10.20.0.2/32']]){
      expect(()=>prepareOperatorPostgres({...makeConfig(),
        trustedProxyAddresses:invalid} as any)).toThrow();
    }
  });
  it('accepts isolated reviewer/mail roles but rejects role aliases and missing reviewer',async()=>{
    const config=makeConfig() as any;
    const extra=(name:string)=>({
      connectionString:'postgresql://hufs_'+name+':synthetic@private-db.example.test/hufs_'+name,
      environment:'production',expectedRole:'hufs_'+name,
      trustedCaPem:'-----BEGIN CERTIFICATE-----\\nSYNTHETIC-CA\\n-----END CERTIFICATE-----',
    });
    config.reviewer={
      invitations:extra('reviewer'),sandbox:extra('sandbox'),
      demo:{listProfiles:async()=>[],readSnapshot:async()=>null},
    };
    config.schoolMail={
      challenges:extra('mail_challenge'),proofUpdates:extra('mail_update'),
      digestKey:Buffer.alloc(32,8),sender:{send:async()=>{}},
    };
    const prepared=prepareOperatorPostgres(config);
    expect(Object.keys(prepared.extraPools??{})).toHaveLength(4);
    expect(prepared.application.schoolMailProof).toBeDefined();
    expect(prepared.application.reviewer).toBeDefined();
    await Promise.all([
      ...Object.values(prepared.pools),...Object.values(prepared.extraPools??{}),
    ].map(pool=>pool.close()));
    config.schoolMail.proofUpdates=config.reviewer.sandbox;
    expect(()=>prepareOperatorPostgres(config)).toThrow(/independently restricted|isolated extensions/);
    config.reviewer=undefined;
    expect(()=>prepareOperatorPostgres(config)).toThrow(/REVIEWER sandbox/);
  });

  it('rejects all prebuilt platform SQL pools before startup and refuses a forged prepared port',async()=>{
    const ports=['sourceIngestion','restrictedIntake','selfAccount','ownerWorkspace',
      'experienceApproval','demoOverlay','sourceReview','ownerCatalog','ownerRecommendations',
      'studyPlanCheck','ownerStudyPlan','doubleMajor','majorWhatIf','majorWhatIfPostgres','revisionComparison','demoProfile',
      'demoProfileQuota','adminUsage','reviewerSandbox','pools'];
    for(const field of ports){
      const config=makeConfig() as any;
      config.platform={[field]:{pool:{connect:vi.fn(),close:vi.fn()}}};
      expect(()=>prepareOperatorPostgres(config),field).toThrow(/verified role settings/);
    }
    const f=fakePrepared();
    (f.prepared.application.platform as any).sourceIngestion={pool:{connect:vi.fn()},authority:{},executor:{}};
    vi.stubEnv('NODE_ENV','test');
    await expect(startOperatorPostgres({prepared:f.prepared,host:'127.0.0.1',port:0}))
      .rejects.toThrow(/verified role settings/);
    expect(f.connected).toEqual([]);
    const major=fakePrepared();
    (major.prepared.application.platform as any).majorWhatIf={loader:{load:vi.fn()},rights:{},approvalGate:{}};
    await expect(startOperatorPostgres({prepared:major.prepared,host:'127.0.0.1',port:0}))
      .rejects.toThrow(/verified role settings/);
    expect(major.connected).toEqual([]);
    const usage=fakePrepared();
    (usage.prepared.application.platform as any).adminUsage={pool:{connect:vi.fn()},
      authority:{isApproved:async()=>true}};
    await expect(startOperatorPostgres({prepared:usage.prepared,host:'127.0.0.1',port:0}))
      .rejects.toThrow(/verified role settings/);
    expect(usage.connected).toEqual([]);
  });
  it('wires demo quota only through distinct verified SQL roles',async()=>{
    const config=makeConfig() as any;
    const role=(name:string)=>({connectionString:`postgresql://hufs_${name}:synthetic@private-db.example.test/hufs_${name}`,
      expectedRole:`hufs_${name}`,environment:'production',
      trustedCaPem:'-----BEGIN CERTIFICATE-----\\nSYNTHETIC-CA\\n-----END CERTIFICATE-----'});
    config.demo={profile:role('demo_profile'),quota:role('demo_quota'),digestKey:Buffer.alloc(32,11)};
    const prepared=prepareOperatorPostgres(config);
    expect(Object.keys(prepared.extraPools??{})).toEqual(['demoProfile','demoProfileQuota']);
    expect(prepared.application.platform.demoProfile?.pool).toBe(prepared.extraPools?.demoProfile);
    expect(prepared.application.platform.demoProfileQuota?.pool).toBe(prepared.extraPools?.demoProfileQuota);
    await Promise.all([...Object.values(prepared.pools),...Object.values(prepared.extraPools??{})].map(p=>p.close()));
    config.demo.quota=config.demo.profile;
    expect(()=>prepareOperatorPostgres(config)).toThrow(/independently restricted/);
    config.demo.quota=role('demo_quota');
    config.demo.digestKey=config.attemptDigestKey;
    expect(()=>prepareOperatorPostgres(config)).toThrow(/independent digest key/);
  });

  it('wires an opt-in ADMIN usage reader only with a dedicated role and independent policy',async()=>{
    const config=makeConfig() as any;
    const settings={connectionString:'postgresql://hufs_usage:synthetic@private-db.example.test/hufs_usage',
      expectedRole:'hufs_usage',environment:'production' as const,
      trustedCaPem:'-----BEGIN CERTIFICATE-----\nSYNTHETIC-CA\n-----END CERTIFICATE-----'};
    const authority={isApproved:vi.fn(async()=>true)};
    config.adminUsage={settings,authority};
    const prepared=prepareOperatorPostgres(config);
    expect(Object.keys(prepared.extraPools??{})).toEqual(['adminUsage']);
    expect(prepared.application.platform.adminUsage?.pool).toBe(prepared.extraPools?.adminUsage);
    expect(prepared.application.platform.adminUsage?.authority).toBe(authority);
    await Promise.all([...Object.values(prepared.pools),...Object.values(prepared.extraPools??{} )].map(p=>p.close()));
    config.adminUsage.settings=config.roles.calendar;
    expect(()=>prepareOperatorPostgres(config)).toThrow(/Seven independently restricted/);
    config.adminUsage.settings=settings;
    config.adminUsage.authority={};
    expect(()=>prepareOperatorPostgres(config)).toThrow(/independent operator policy/);
  });

  it('routes current What-if through a distinct managed SQL role and independent authorities',async()=>{
    const input=makeConfig() as any;
    const settings={connectionString:'postgresql://hufs_whatif:synthetic@private-db.example.test/hufs_whatif',
      environment:'production',expectedRole:'hufs_whatif',
      trustedCaPem:'-----BEGIN CERTIFICATE-----\\nSYNTHETIC-CA\\n-----END CERTIFICATE-----'};
    const authority={resolve:vi.fn(async()=>null)};
    const rights={mayInspect:vi.fn(async()=>false),
      authorize:vi.fn(async()=>({allowed:false,rightsReceipt:''})),
      revalidate:vi.fn(async()=>false)};
    const approvalGate={authorize:vi.fn(async()=>({allowed:false,approvalReceipt:''})),
      revalidate:vi.fn(async()=>false)};
    input.extensions={majorWhatIfPostgres:{settings,authority,rights,approvalGate}};
    const prepared=prepareOperatorPostgres(input);
    expect(prepared.application.platform.majorWhatIfPostgres?.pool).toBe(prepared.extraPools?.majorWhatIfPostgres);
    expect(prepared.application.platform.majorWhatIfPostgres?.rights).toBe(rights);
    await Promise.all([...Object.values(prepared.pools),...Object.values(prepared.extraPools??{})].map(pool=>pool.close()));
    input.extensions.majorWhatIfPostgres.authority={};
    expect(()=>prepareOperatorPostgres(input)).toThrow(/Managed What-if/);
    input.extensions.majorWhatIfPostgres.authority=authority;
    input.extensions.majorWhatIfPostgres.rights={...rights,revalidate:undefined};
    expect(()=>prepareOperatorPostgres(input)).toThrow(/Managed What-if/);
    input.extensions.majorWhatIfPostgres.rights=rights;
    input.extensions.majorWhatIfPostgres.settings=input.roles.calendar;
    expect(()=>prepareOperatorPostgres(input)).toThrow(/independently restricted/);
  });

  it('wires configured inference into exact three independent managed SQL roles without a provider call',async()=>{
    const input=makeConfig() as any;
    const settings=(role:string)=>({connectionString:'postgresql://hufs_'+role+':synthetic@private-db.example.test/hufs_'+role,
      environment:'production',expectedRole:'hufs_'+role,
      trustedCaPem:'-----BEGIN CERTIFICATE-----\\nSYNTHETIC-CA\\n-----END CERTIFICATE-----'});
    const secret=vi.fn(async()=>{throw Error('No credentials in offline suite');});
    const transport={post:vi.fn(async()=>{throw Error('No paid provider in offline suite');})};
    const enabled=vi.fn(()=>false);
    input.managedAi={operation:'HCX_007',
      roles:{authority:settings('ai_authority'),budget:settings('ai_budget'),results:settings('ai_results')},
      phaseId:'SYN-PHASE',inputPolicyVersion:'P1',
      sessionIsCurrent:vi.fn(async()=>false),enabled,secret,transport,
      policy:{version:'SYN-P1',approvedBy:'SYN-OPERATOR',approvedAt:'2026-11-01T00:00:00Z',
        expiresAt:'2026-11-30T00:00:00Z',inputUnitsPerToken:1,outputUnitsPerToken:1,
        tokenizerUnits:1,ocrImageUnits:10,maxInputTokens:1000,maxOutputTokens:600,framingTokens:0}};
    const prepared=prepareOperatorPostgres(input);
    expect(Object.keys(prepared.extraPools??{}).sort()).toEqual(['aiAuthority','aiBudget','aiResults']);
    expect(prepared.application.ai?.runtime.operation).toBe('HCX_007');
    expect(prepared.managedAiBinding?.ai).toBe(prepared.application.ai);
    expect(prepared.managedAiBinding?.pools.authority).toBe(prepared.extraPools?.aiAuthority);
    expect(await prepared.application.ai?.inputs.list({role:'BETA',actorId:'SYN-A',sessionIdHash:'H'.repeat(32),
      sessionExpiresAt:'2026-12-01T00:00:00Z',schoolMailProofExpiresAt:'2026-12-01T00:00:00Z',
      betaAllowed:true,csrfToken:'C'.repeat(32)})).toEqual({items:[]});
    expect(secret).not.toHaveBeenCalled();expect(transport.post).not.toHaveBeenCalled();
    await Promise.all([...Object.values(prepared.pools),...Object.values(prepared.extraPools??{})].map(p=>p.close()));
    input.managedAi.roles.results=input.managedAi.roles.budget;
    expect(()=>prepareOperatorPostgres(input)).toThrow(/independently restricted/);
    input.managedAi.roles.results=settings('ai_results');
    input.ai=prepared.application.ai;
    expect(()=>prepareOperatorPostgres(input)).toThrow(/AI provider must use managed SQL/);
    input.ai=undefined;
    input.managedAi.sessionIsCurrent=undefined;
    expect(()=>prepareOperatorPostgres(input)).toThrow(/Managed AI requires/);
  });
  it('refuses forged raw AI at startup before opening a SQL connection',async()=>{
    const h=fakePrepared();vi.stubEnv('NODE_ENV','test');
    (h.prepared.application as any).ai={
      runtime:{phaseId:'FAKE',operation:'HCX_007',executor:{execute:vi.fn(),readJob:vi.fn()}},
      inputs:{list:vi.fn()}};
    await expect(startOperatorPostgres({prepared:h.prepared,host:'127.0.0.1',port:0}))
      .rejects.toThrow(/managed SQL authority/);
    expect(h.connected).toEqual([]);
  });

  it('starts only loopback AFTER all seven checks and closes app/pools',async()=>{
    const fixture=fakePrepared();
    vi.stubEnv('NODE_ENV','test');
    const server=await startOperatorPostgres({prepared:fixture.prepared,host:'127.0.0.1',port:0});
    opened.push(server);
    expect(server.address).toMatch(/^http:\/\/127\.0\.0\.1:/);
    expect(fixture.connected).toEqual([...REQUIRED_SQL_ROLES]);
    expect(fixture.released).toEqual([...REQUIRED_SQL_ROLES]);
    await server.close();
    expect(fixture.closed).toEqual([...REQUIRED_SQL_ROLES].reverse());
    await server.close();
    expect(fixture.closed).toHaveLength(7);
  });
  it('fails closed with no partial listener on a missing role or failed check',async()=>{
    vi.stubEnv('NODE_ENV','test');
    for(const options of [{fail:'calendar'},{badReady:'evidence'}]){
      const f=fakePrepared(options);
      await expect(startOperatorPostgres({prepared:f.prepared,host:'127.0.0.1',port:0}))
        .rejects.toThrow(/startup refused/);
      expect(f.closed).toEqual([...REQUIRED_SQL_ROLES].reverse());
      expect(f.connected).not.toHaveLength(8);
    }
  });
  it('refuses public binds, unsafe ports and unreviewed production flag',async()=>{
    const f=fakePrepared();
    await expect(startOperatorPostgres({prepared:f.prepared,host:'0.0.0.0' as any,port:3000}))
      .rejects.toThrow(/loopback/);
    vi.stubEnv('NODE_ENV','development');
    await expect(startOperatorPostgres({prepared:f.prepared,host:'127.0.0.1',port:0}))
      .rejects.toThrow(/loopback/);
    vi.stubEnv('NODE_ENV','test');vi.stubEnv('APP_ENV','production');
    await expect(startOperatorPostgres({prepared:f.prepared,host:'127.0.0.1',port:0}))
      .rejects.toThrow(/startup refused/);
    expect(f.closed).toHaveLength(7);
  });
});
