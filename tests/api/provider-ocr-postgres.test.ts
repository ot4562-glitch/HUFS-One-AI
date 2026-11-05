import {describe,it,expect,vi} from 'vitest';
import {createPostgresProviderRuntime} from '../../apps/api/src/modules/ai/provider-postgres.js';

const NOW='2026-11-04T00:00:00Z';
const actor={actorId:'SYN-OWNER',role:'BETA' as const,sessionIdHash:'S'.repeat(32),
  csrfToken:'C'.repeat(32),sessionExpiresAt:'2026-11-05T00:00:00Z',
  schoolMailProofExpiresAt:'2026-11-05T00:00:00Z',betaAllowed:true};
function config(){
  const connect=vi.fn(async()=>{throw new Error('unexpected database access');});
  const secret=vi.fn(async()=>{throw new Error('unexpected credential read');});
  const transport={post:vi.fn(async()=>{throw new Error('unexpected model request');})};
  return {connect,secret,transport,options:{
    pools:{authority:{connect},budget:{connect},results:{connect}},
    phaseId:'SYN-OCR-PHASE',operation:'OCR_GENERAL' as const,
    inputPolicyVersion:'approved-v1',sessionIsCurrent:async()=>true,secret,transport,
    now:()=>NOW,
    policy:{version:'v1',approvedBy:'independent-reviewer',
      approvedAt:'2026-11-03T00:00:00Z',expiresAt:'2026-11-05T00:00:00Z',
      inputUnitsPerToken:2,outputUnitsPerToken:2,tokenizerUnits:1,
      ocrImageUnits:10,maxInputTokens:500,maxOutputTokens:300,framingTokens:1},
  }};
}

describe('PostgreSQL General OCR provider composition',()=>{
  it('does not expose image inputs through the HCX student discovery endpoint',async()=>{
    const f=config();
    const runtime=createPostgresProviderRuntime(f.options);
    expect(runtime.operation).toBe('OCR_GENERAL');
    expect(await runtime.approvedInputs.list(actor)).toEqual({items:[]});
    const result=await runtime.executor.execute({
      actor,phaseId:'SYN-OCR-PHASE',operation:'OCR_GENERAL',
      inputRef:'SYN-IMAGE',idempotencyKey:'SYN-REQUEST',asOf:NOW,
    });
    expect(result.state).toBe('UNAVAILABLE');
    expect(f.connect).not.toHaveBeenCalled();
    expect(f.secret).not.toHaveBeenCalled();
    expect(f.transport.post).not.toHaveBeenCalled();
  });

  it('requires an exact reviewed endpoint or an explicitly injected offline transport',()=>{
    const f=config();
    const {transport,...withoutTransport}=f.options;
    expect(()=>createPostgresProviderRuntime(withoutTransport)).toThrow(/OCR endpoint/);
    expect(()=>createPostgresProviderRuntime({
      ...withoutTransport,ocrEndpoint:'https://unapproved.example.org/ocr',
    })).toThrow();
  });
});
