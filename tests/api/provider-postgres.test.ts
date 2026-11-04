import {describe,it,expect,vi} from 'vitest';
import {createPostgresProviderRuntime} from '../../apps/api/src/modules/ai/provider-postgres.js';
describe('explicit PostgreSQL provider composition',()=>{
  it('constructs default-OFF adapters without DB, DNS, key or model activity',async()=>{
    const connect=vi.fn(async()=>{throw Error('No IO allowed');}),secret=vi.fn(async()=>{throw Error('No key read allowed');});
    const service=createPostgresProviderRuntime({pools:{authority:{connect},budget:{connect},results:{connect}},
      phaseId:'SYN-PHASE',inputPolicyVersion:'INPUT1',operation:'HCX_007',sessionIsCurrent:async()=>true,secret,
      policy:{version:'P1',approvedBy:'SYN-OPERATOR',approvedAt:'2026-11-02T00:00:00Z',expiresAt:'2026-11-04T00:00:00Z',
        inputUnitsPerToken:2,outputUnitsPerToken:3,tokenizerUnits:1,ocrImageUnits:10,maxInputTokens:3500,maxOutputTokens:800,framingTokens:0}});
    const result=await service.executor.execute({actor:{actorId:'SYN-A',role:'BETA',sessionIdHash:'sessionhash',csrfToken:'c'.repeat(16),
      sessionExpiresAt:'2026-11-04T00:00:00Z',schoolMailProofExpiresAt:'2026-11-04T00:00:00Z',betaAllowed:true},
      phaseId:'SYN-PHASE',inputRef:'INPUT1',idempotencyKey:'KEY1',operation:'HCX_007',asOf:'2026-11-03T00:00:00Z'});
    expect(result.state).toBe('UNAVAILABLE');expect(connect).not.toHaveBeenCalled();expect(secret).not.toHaveBeenCalled();
  });
});
