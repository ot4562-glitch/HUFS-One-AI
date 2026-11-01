import {describe,expect,it} from 'vitest';
import {MemoryAuthAttemptLimiter} from '../../apps/api/src/modules/auth/auth-attempt-limiter.js';
import type {AuthAttemptLimiter} from '../../apps/api/src/modules/auth/auth-attempt-limiter.js';
import {createSchoolMailProofService,MemorySchoolMailChallengeStore} from
  '../../apps/api/src/modules/auth/school-mail-proof.js';

const START=new Date('2026-11-01T00:00:00.000Z');
const address=(n:number)=>({googleSubject:'synthetic-google-'+n,
  schoolEmail:'synthetic-'+n+'@hufs.ac.kr'});
function replicas(limiter:AuthAttemptLimiter=new MemoryAuthAttemptLimiter()){
  let sends=0,clock=new Date(START);
  const make=()=>createSchoolMailProofService({
    store:new MemorySchoolMailChallengeStore(),
    sender:{send:async()=>{sends++;}},
    approver:{mayIssue:async()=>true,confirm:async()=>true},
    digestKey:Buffer.alloc(32,19),attemptLimiter:limiter,
    requireClientIp:true,now:()=>clock,
  });
  return {services:[make(),make()],sends:()=>sends,
    advance:()=>{clock=new Date(clock.getTime()+60*60_000);}};
}

describe('school OTP network admission before any outbound delivery',()=>{
  it('keeps raw socket IP out of approval and challenge ledger payloads',async()=>{
    const ledgerPayloads:unknown[]=[];
    const service=createSchoolMailProofService({
      store:{issue:async input=>{ledgerPayloads.push(input);return true;},
        check:async input=>{ledgerPayloads.push(input);return false;},cancel:async()=>{}},
      approver:{mayIssue:async input=>{ledgerPayloads.push(input);return true;},
        confirm:async()=>true},
      sender:{send:async()=>{}},digestKey:Buffer.alloc(32,19),
      attemptLimiter:new MemoryAuthAttemptLimiter(),requireClientIp:true,now:()=>START,
    });
    const meta=await service.issue({...address(0),clientIp:'192.0.2.1'});
    await service.verify({...address(0),clientIp:'192.0.2.1',
      challengeId:meta.challengeId,code:'12345678'});
    expect(JSON.stringify(ledgerPayloads)).not.toContain('192.0.2.1');
    expect(ledgerPayloads.every(input=>!Object.hasOwn(input as object,'code'))).toBe(true);
  });

  it('caps different approved Google accounts sharing one source IP across replicas',async()=>{
    const h=replicas();
    for(let n=0;n<10;n++)await h.services[n%2]!.issue({...address(n),clientIp:'192.0.2.1'});
    await expect(h.services[0]!.issue({...address(11),clientIp:'192.0.2.1'}))
      .rejects.toMatchObject({code:'RATE_LIMITED'});
    expect(h.sends()).toBe(10);
    await h.services[1]!.issue({...address(12),clientIp:'192.0.2.2'});
    h.advance();
    await h.services[0]!.issue({...address(13),clientIp:'192.0.2.1'});
    expect(h.sends()).toBe(12);
  });

  it('caps all outbound OTPs even when both accounts and IPs rotate',async()=>{
    const h=replicas();
    for(let n=0;n<100;n++)await h.services[n%2]!.issue({
      ...address(n),clientIp:'192.0.2.'+(n+1),
    });
    await expect(h.services[0]!.issue({...address(101),clientIp:'198.51.100.1'}))
      .rejects.toMatchObject({code:'RATE_LIMITED'});
    expect(h.sends()).toBe(100);
    h.advance();
    await h.services[1]!.issue({...address(102),clientIp:'198.51.100.2'});
    expect(h.sends()).toBe(101);
  });

  it('requires a trusted single IP in strict mode before issuing a challenge',async()=>{
    const h=replicas();
    for(const clientIp of [undefined,'','attacker.test','192.0.2.1, 192.0.2.2','fe80::1%eth0']){
      await expect(h.services[0]!.issue({...address(0),
        ...(clientIp===undefined?{}:{clientIp}),
      })).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
    }
    expect(h.sends()).toBe(0);
  });

  it('normalizes IPv4-mapped IPv6 so changing address spelling does not reset quota',async()=>{
    const h=replicas();
    for(let n=0;n<10;n++)await h.services[n%2]!.issue({
      ...address(n),clientIp:n%2?'::ffff:c000:201':'192.0.2.1',
    });
    await expect(h.services[0]!.issue({...address(11),clientIp:'::ffff:192.0.2.1'}))
      .rejects.toMatchObject({code:'RATE_LIMITED'});
    expect(h.sends()).toBe(10);
  });

  it('does not send if the global/IP admission store is unavailable',async()=>{
    for(const failingKind of ['SCHOOL_OTP_ISSUE_GLOBAL','SCHOOL_OTP_ISSUE_IP']){
      const actual=new MemoryAuthAttemptLimiter();
      const h=replicas({consume:async input=>{
        if(input.kind===failingKind)throw Error('synthetic distributed outage');
        return actual.consume(input);
      }});
      await expect(h.services[0]!.issue({...address(0),clientIp:'192.0.2.1'}))
        .rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
      expect(h.sends()).toBe(0);
    }
  });

  it('caps code checks from rotating accounts at one IP before checking the challenge store',async()=>{
    const limiter=new MemoryAuthAttemptLimiter();
    let checked=0;
    const make=()=>createSchoolMailProofService({
      store:{issue:async()=>true,cancel:async()=>{},check:async()=>{checked++;return false;}},
      sender:{send:async()=>{}},approver:{mayIssue:async()=>true,confirm:async()=>true},
      digestKey:Buffer.alloc(32,19),attemptLimiter:limiter,requireClientIp:true,now:()=>START,
    });
    const services=[make(),make()];
    for(let n=0;n<30;n++)expect(await services[n%2]!.verify({
      ...address(n),clientIp:'192.0.2.1',challengeId:'A'.repeat(22),code:'12345678',
    })).toBe(false);
    await expect(services[0]!.verify({...address(31),clientIp:'192.0.2.1',
      challengeId:'A'.repeat(22),code:'12345678',
    })).rejects.toMatchObject({code:'RATE_LIMITED'});
    expect(checked).toBe(30);
    await expect(services[0]!.verify({...address(32),
      challengeId:'A'.repeat(22),code:'12345678',
    })).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
    expect(checked).toBe(30);
  });
});
