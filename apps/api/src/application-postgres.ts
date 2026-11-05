import {createPostgresGoogleAuth} from './auth-postgres.js';
import type {PostgresGoogleAuthConfig} from './auth-postgres.js';
import {createPostgresPlatformServices} from './platform-postgres.js';
import type {PostgresPlatformConfig} from './platform-postgres.js';
import {createIntegratedApi} from './integration.js';
import type {TrustedSchoolMailPort} from './integration.js';
import type {RuntimeMode} from './runtime-policy.js';
import type {ApiOptions} from './types.js';
import {PostgresAuthAttemptLimiter} from './modules/auth/auth-attempt-limiter-postgres.js';
import {PostgresReviewerAccessStore} from './modules/auth/reviewer-postgres.js';
import type {ReviewerSqlPool} from './modules/auth/reviewer-postgres.js';
import type {ReviewerDemoRepository} from './modules/auth/reviewer.js';
import type {ExperienceSkillCandidatePort} from './modules/ai/experience-skill-candidates-postgres.js';

export interface PostgresApplicationConfig {
  runtime?:RuntimeMode;
  /** Exact ingress addresses, never a caller-controlled blanket proxy flag. */
  trustedProxyAddresses?:readonly string[];
  auth:PostgresGoogleAuthConfig;
  schoolMailProof?:TrustedSchoolMailPort;
  platform:Omit<PostgresPlatformConfig,'now'>;
  reviewer?:{invitations:ReviewerSqlPool;demo:ReviewerDemoRepository};
  /** The configured provider executor keeps token, billing and current-actor
   * checks. No synthetic adapter is accepted by this production composition. */
  ai?:{runtime:NonNullable<ApiOptions['realAi']>;
    inputs:NonNullable<ApiOptions['approvedAiInputs']>;
    experienceCandidates?:ExperienceSkillCandidatePort};
}

/** Builds an unbound application without opening pools or invoking a provider.
 * The operator owns resource lifetimes. Production is supported when explicitly
 * selected and configured; missing configuration is not a missing approval. */
export function createPostgresApplication(config:PostgresApplicationConfig){
  if(!config?.platform?.pools||!['projections','calendar','personal','evidence'].every(
    key=>typeof config.platform.pools[key as keyof typeof config.platform.pools]?.connect==='function'))
    throw new Error('Explicit platform PostgreSQL pools required');
  if(typeof config.platform.evidenceRights?.resolveFor!=='function')
    throw new Error('Explicit current evidence rights required');
  if(!!config.reviewer!==!!config.platform.reviewerSandbox)
    throw new Error('Explicit reviewer invitations, synthetic repository and sandbox must be supplied together');
  if(config.reviewer&&(typeof config.reviewer.invitations?.connect!=='function'
    ||typeof config.reviewer.demo?.listProfiles!=='function'||typeof config.reviewer.demo.readSnapshot!=='function'))
    throw new Error('Explicit reviewer invitations and synthetic repository required');
  if(config.schoolMailProof&&!config.reviewer)
    throw new Error('School mail login stage requires explicit reviewer services');
  if(config.ai&&(typeof config.ai.runtime?.executor?.execute!=='function'
    ||typeof config.ai.runtime.executor.readJob!=='function'||typeof config.ai.inputs?.list!=='function'
    ||config.ai.experienceCandidates&&typeof config.ai.experienceCandidates.read!=='function'))
    throw new Error('Configured AI executor and actor-bound input directory required');
  const googleAuth=createPostgresGoogleAuth(config.auth);
  const clock=config.auth.google.now??(()=>new Date());
  const now=()=>clock().toISOString();
  const platform=createPostgresPlatformServices({...config.platform,now});
  return createIntegratedApi({
    googleAuth,...platform,allowedOrigin:config.auth.google.allowedOrigin,now,
    ...(config.runtime!==undefined?{runtime:config.runtime}:{}),
    ...(config.ai?{realAi:config.ai.runtime,approvedAiInputs:config.ai.inputs,
      ...(config.ai.experienceCandidates?{experienceCandidates:config.ai.experienceCandidates}:{})}:{}),
    ...(config.trustedProxyAddresses!==undefined?{trustedProxyAddresses:config.trustedProxyAddresses}:{}),
    ...(config.schoolMailProof?{schoolMailProof:config.schoolMailProof}:{}),
    ...(config.reviewer&&platform.reviewerSandbox?{reviewer:{
      access:new PostgresReviewerAccessStore(config.reviewer.invitations,
        new PostgresAuthAttemptLimiter(config.auth.pools.attempts,config.auth.attemptDigestKey)),
      demo:config.reviewer.demo,sandbox:platform.reviewerSandbox,
    }}:{}),
  });
}
