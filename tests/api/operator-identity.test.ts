import {describe,it,expect,vi} from 'vitest';
import {createOperatorGoogleIdentity} from '../../apps/api/src/operator-google-identity.js';
import {createOperatorSchoolMailProof} from '../../apps/api/src/operator-mail-proof.js';

describe('private operator identity wiring',()=>{
  it('rejects a mismatched callback origin',()=>{
    expect(()=>createOperatorGoogleIdentity({
      clientId:'synthetic.apps.googleusercontent.com',
      redirectUri:'https://example.test/api/auth/google/callback',
      allowedOrigin:'https://other.test',
      exchange:{clientSecret:'[REDACTED_SECRET]'},
    })).toThrow();
  });

  it('is inert until a mail challenge is requested',()=>{
    const connect=vi.fn(async()=>{throw new Error('no database');});
    const send=vi.fn(async()=>{});
    createOperatorSchoolMailProof({
      pools:{challenges:{connect},proofUpdates:{connect},attempts:{connect}},
      challengeDigestKey:Buffer.alloc(32,8),attemptDigestKey:Buffer.alloc(32,7),
      sender:{send},
    });
    expect(connect).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
