import {createApi} from './server.js';
import type {
  AiCandidateProvider, ApiRepository, ApiOptions, VerifySession, VerifiedActor,
} from './types.js';
import type {ReviewerAccessStore, ReviewerDemoRepository} from './modules/auth/reviewer.js';
import type {ReviewerSandboxStore} from './modules/auth/reviewer-sandbox.js';

/**
 * Central provider-neutral dependency boundary; no Google/PG/NCP credentials, networking
 * or mock identity defaults. Production main.ts deliberately remains fail-closed.
 */
export interface IntegrationDependencies {
  allowedOrigin:string;
  repository:ApiRepository;
  auth:{
    verifySession:VerifySession;
    revokeSession:(actor:VerifiedActor)=>Promise<void>;
  };
  reviewer?:{
    access:ReviewerAccessStore;
    demo:ReviewerDemoRepository;
    sandbox:ReviewerSandboxStore;
  };
  /** Synthetic only; never pass a live paid provider through this port. */
  syntheticAiProvider?:AiCandidateProvider;
  now?:()=>string;
  maxSyntheticAiCallsPerActor?:number;
}

export function createIntegratedApi(deps:IntegrationDependencies) {
  if(!deps || !deps.repository || typeof deps.repository.readGrant!=='function'
    || typeof deps.repository.readSnapshot!=='function'
    || typeof deps.repository.listProfiles!=='function'
    || typeof deps.repository.readSafePacket!=='function'
    || typeof deps.auth?.verifySession!=='function'
    || typeof deps.auth?.revokeSession!=='function')
    throw new Error('Missing verified auth, revocation or repository: fail closed');
  if(deps.reviewer && (typeof deps.reviewer.access?.readActive!=='function'
    || typeof deps.reviewer.access?.redeem!=='function'
    || typeof deps.reviewer.demo?.listProfiles!=='function'
    || typeof deps.reviewer.demo?.readSnapshot!=='function'
    || typeof deps.reviewer.sandbox?.read!=='function'
    || typeof deps.reviewer.sandbox?.save!=='function'))
    throw new Error('Incomplete REVIEWER sandbox: fail closed');
  if(process.env.APP_ENV==='production' && deps.syntheticAiProvider)
    throw new Error('Synthetic AI provider must not be wired as a production model');
  if(!deps.allowedOrigin || new URL(deps.allowedOrigin).origin!==deps.allowedOrigin
    || !deps.allowedOrigin.startsWith('https://'))
    throw new Error('Exactly one HTTPS origin is required');
  if(deps.maxSyntheticAiCallsPerActor!==undefined
    && (!Number.isSafeInteger(deps.maxSyntheticAiCallsPerActor)
      || deps.maxSyntheticAiCallsPerActor<1 || deps.maxSyntheticAiCallsPerActor>10))
    throw new Error('Synthetic AI quota outside safe bounds');

  const options:ApiOptions={
    allowedOrigin:deps.allowedOrigin,repository:deps.repository,
    verifySession:deps.auth.verifySession,revokeSession:deps.auth.revokeSession,
    ...(deps.reviewer?{
      reviewerAccess:deps.reviewer.access,
      reviewerDemo:deps.reviewer.demo,
      reviewerSandbox:deps.reviewer.sandbox,
    }:{}),
    ...(deps.syntheticAiProvider?{syntheticAiProvider:deps.syntheticAiProvider}:{}),
    ...(deps.maxSyntheticAiCallsPerActor!==undefined
      ?{maxSyntheticAiCallsPerActor:deps.maxSyntheticAiCallsPerActor}:{}),
    ...(deps.now?{now:deps.now}:{}),
  };
  // No implicit "production ready" path: deployment still requires independently
  // reviewed OAuth/OTP/PG wiring, ingress security and real browser E2E.
  return createApi(options);
}
