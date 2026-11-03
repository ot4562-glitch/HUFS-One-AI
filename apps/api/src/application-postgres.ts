import {createPostgresGoogleAuth} from './auth-postgres.js';
import type {PostgresGoogleAuthConfig} from './auth-postgres.js';
import {createPostgresPlatformServices} from './platform-postgres.js';
import type {PostgresPlatformConfig} from './platform-postgres.js';
import {createIntegratedApi} from './integration.js';
import type {TrustedSchoolMailPort} from './integration.js';
import {PostgresAuthAttemptLimiter} from './modules/auth/auth-attempt-limiter-postgres.js';
import {PostgresReviewerAccessStore} from './modules/auth/reviewer-postgres.js';
import type {ReviewerSqlPool} from './modules/auth/reviewer-postgres.js';
import type {ReviewerDemoRepository} from './modules/auth/reviewer.js';

export interface PostgresApplicationConfig {
  auth:PostgresGoogleAuthConfig;
  /** Optional separately assembled approved sender/challenge service. The
   * REVIEWER enrollment stores must also be configured for this login stage. */
  schoolMailProof?:TrustedSchoolMailPort;
  /** Authentication supplies the one application clock. Each role/pool is
   * explicitly provisioned by the caller; no environment/default pool. */
  platform:Omit<PostgresPlatformConfig,'now'>;
  /** Optional synthetic-only REVIEWER access, paired with the platform's
   * separately restricted reviewerSandbox pool. No real profile fallback. */
  reviewer?:{invitations:ReviewerSqlPool;demo:ReviewerDemoRepository};
}

/** Server-side composition only. Returns an unbound Fastify application;
 * never creates pools, migrates data, listens, starts workers or calls Google,
 * SMTP/paid providers. The caller owns pool lifetimes. main.ts retains its
 * production refusal and all real operations still need separate acceptance. */
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
  const googleAuth=createPostgresGoogleAuth(config.auth);
  const clock=config.auth.google.now??(()=>new Date());
  const now=()=>clock().toISOString();
  const platform=createPostgresPlatformServices({...config.platform,now});
  return createIntegratedApi({
    googleAuth,...platform,allowedOrigin:config.auth.google.allowedOrigin,now,
    ...(config.schoolMailProof?{schoolMailProof:config.schoolMailProof}:{}),
    ...(config.reviewer&&platform.reviewerSandbox?{reviewer:{
      access:new PostgresReviewerAccessStore(config.reviewer.invitations,
        new PostgresAuthAttemptLimiter(config.auth.pools.attempts,config.auth.attemptDigestKey)),
      demo:config.reviewer.demo,sandbox:platform.reviewerSandbox,
    }}:{}),
  });
}
