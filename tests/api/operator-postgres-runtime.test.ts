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
    await expect(startOperatorPostgres({prepared:f.prepared,host:'127.0.0.1',port:0}))
      .rejects.toThrow(/loopback/);
    vi.stubEnv('NODE_ENV','test');vi.stubEnv('APP_ENV','production');
    await expect(startOperatorPostgres({prepared:f.prepared,host:'127.0.0.1',port:0}))
      .rejects.toThrow(/startup refused/);
    expect(f.closed).toHaveLength(7);
  });
});
