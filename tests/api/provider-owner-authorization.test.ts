import {describe,expect,it,vi} from 'vitest';
import {createPostgresProviderRuntime} from '../../apps/api/src/modules/ai/provider-postgres.js';
const now='2026-11-05T00:00:00.000Z';
const actor={actorId:'SYN-A',role:'BETA' as const,sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),
  sessionExpiresAt:'2026-11-06T00:00:00.000Z',schoolMailProofExpiresAt:'2026-11-06T00:00:00.000Z',betaAllowed:true};
function fixture(liveApproved?:()=>boolean){
  const connect=vi.fn(async()=>{throw new Error('No real SQL in policy test');});
  const secret=vi.fn(async()=>{throw new Error('No provider credential in policy test');});
  const service=createPostgresProviderRuntime({pools:{authority:{connect},budget:{connect},results:{connect}},
    phaseId:'SYN-PHASE',inputPolicyVersion:'INPUT1',operation:'HCX_007',sessionIsCurrent:async()=>true,secret,
    now:()=>now,enabled:()=>true,...(liveApproved?{liveApproved}:{}),
    policy:{version:'P1',approvedBy:'SYN-OPERATOR',approvedAt:'2026-11-04T00:00:00.000Z',expiresAt:'2026-11-06T00:00:00.000Z',
      inputUnitsPerToken:2,outputUnitsPerToken:3,tokenizerUnits:1,ocrImageUnits:10,
      maxInputTokens:3500,maxOutputTokens:800,framingTokens:0}});
  return {connect,secret,service};
}
describe('project authorization is acknowledged without disabling per-input/session/budget checks',()=>{
  it('enabled configured provider reaches its owner-scoped input directory without a second approval flag',async()=>{
    const h=fixture();
    await h.service.approvedInputs.list(actor).catch(()=>undefined);
    expect(h.connect).toHaveBeenCalled();
    expect(h.secret).not.toHaveBeenCalled();
  });
  it('honors an explicit emergency pause without SQL or provider activity',async()=>{
    const h=fixture(()=>false);
    expect(await h.service.approvedInputs.list(actor)).toEqual({items:[]});
    expect(h.connect).not.toHaveBeenCalled();expect(h.secret).not.toHaveBeenCalled();
  });
});
