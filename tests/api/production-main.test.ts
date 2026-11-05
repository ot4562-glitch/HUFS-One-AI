import {afterEach,describe,expect,it,vi} from 'vitest';
import {productionConfigPath,productionPort,runProductionMain} from '../../apps/api/src/production-main.js';
import {allowedPrivateBridgeHost} from '../../apps/api/src/operator-postgres-runtime.js';

afterEach(()=>vi.restoreAllMocks());
describe('configured production launcher',()=>{
  it('plans without a private factory, database, credentials, network or environment mutation',async()=>{
    const log=vi.spyOn(console,'log').mockImplementation(()=>{});
    const env={HUFS_PRODUCTION_CONFIG:'/does/not/exist.mjs',HUFS_API_INTERNAL_PORT:'not-a-port'};
    expect(await runProductionMain(['--plan'],env)).toBeNull();
    expect(await runProductionMain([],env)).toBeNull();
    const plan=JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(plan).toMatchObject({authorization:'OWNER_CONFIRMED_APPROVED',mode:'PLAN_ONLY',
      externalCalls:0,databaseMigrations:0,binding:'127.0.0.1'});
    expect(env.HUFS_API_INTERNAL_PORT).toBe('not-a-port');
  });
  it('requires explicit apply and never treats unknown arguments as activation',async()=>{
    await expect(runProductionMain(['--apply','--force'],{})).rejects.toThrow('Use --plan or --apply');
    await expect(runProductionMain(['--deploy'],{})).rejects.toThrow('Use --plan or --apply');
    await expect(runProductionMain(['--apply'],{})).rejects.toThrow(/CONFIGURATION_REQUIRED/);
  });
  it.each([undefined,'./factory.mjs','/tmp/factory.mjs','/etc/hufs-one/private/../factory.mjs',
    '/etc/hufs-one/private/factory.js','https://example.test/factory.mjs'])('rejects untrusted factory location %s',path=>{
    expect(()=>productionConfigPath(path)).toThrow(/CONFIGURATION_REQUIRED/);
  });
  it('accepts canonical private path but does not claim its bytes or ownership were checked',()=>{
    expect(productionConfigPath('/etc/hufs-one/private/factory.mjs')).toBe('/etc/hufs-one/private/factory.mjs');
  });
  it.each(['0','80','65536','-1','3000.0','3e3',' 3000'])('rejects invalid listener port %s',port=>{
    expect(()=>productionPort(port)).toThrow(/CONFIGURATION_REQUIRED/);
  });
  it('uses only explicit valid loopback port settings',()=>{
    expect(productionPort(undefined)).toBe(3000);
    expect(productionPort('8443')).toBe(8443);
  });
});

describe('private container listener authorization (offline; no network binding)',()=>{
  const approved={mode:'CONTAINER_PRIVATE_IPV4' as const,approvedHost:'172.22.4.9'};
  it('requires the exact approved RFC1918 address assigned in the network namespace',()=>{
    expect(allowedPrivateBridgeHost('172.22.4.9',approved,['172.22.4.9'])).toBe(true);
    expect(allowedPrivateBridgeHost('172.22.4.9',approved,['172.22.4.8'])).toBe(false);
    expect(allowedPrivateBridgeHost('172.22.4.8',approved,['172.22.4.8'])).toBe(false);
    expect(allowedPrivateBridgeHost('172.22.4.9',undefined,['172.22.4.9'])).toBe(false);
  });
  it.each(['0.0.0.0','127.0.0.1','::','1.1.1.1','169.254.10.11','172.32.0.12',
    '192.0.2.2','10.10.0.0','10.10.0.255','not-an-address'])(
    'refuses public, wildcard, invalid or network/broadcast address %s',host=>{
      expect(allowedPrivateBridgeHost(host,{mode:'CONTAINER_PRIVATE_IPV4',approvedHost:host},[host])).toBe(false);
    });
  it('accepts RFC1918 ranges only with the matching factory approval and interface address',()=>{
    for(const host of ['10.22.33.44','172.16.3.4','172.31.2.3','192.168.1.2'])
      expect(allowedPrivateBridgeHost(host,{mode:'CONTAINER_PRIVATE_IPV4',approvedHost:host},[host])).toBe(true);
  });
});
