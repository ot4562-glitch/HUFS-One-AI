import {afterEach,describe,expect,it,vi} from 'vitest';
import {productionConfigPath,productionPort,runProductionMain} from '../../apps/api/src/production-main.js';

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
