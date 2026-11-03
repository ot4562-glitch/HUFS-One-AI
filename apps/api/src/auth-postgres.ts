import {createGoogleAuthFlow} from './modules/auth/google-auth-flow.js';
import type {GoogleAuthConfig} from './modules/auth/google-auth-flow.js';
import {PostgresGoogleAuthStore} from './modules/auth/google-auth-postgres.js';
import {PostgresAuthAttemptLimiter} from './modules/auth/auth-attempt-limiter-postgres.js';
import {PostgresBetaAdmissionStore} from './modules/auth/beta-admission-postgres.js';
import {createBetaAdmissionPolicy,createBetaSessionRechecker} from './modules/auth/beta-admission.js';
import type {ReviewerSqlPool} from './modules/auth/reviewer-postgres.js';

export interface PostgresGoogleAuthConfig {
  /** Operator-provisioned pools/roles: session writes, admission SELECT only,
   * and shared attempt-limit writes. No browser or projection pool fallback. */
  pools:{sessions:ReviewerSqlPool;admission:ReviewerSqlPool;attempts:ReviewerSqlPool};
  /** Protected, common across replicas; never generated implicitly here. */
  attemptDigestKey:Buffer;
  /** Existing trusted code exchange and optional offline JWT verifier.
   * Admission policies and persistence cannot be replaced through this port. */
  google:Omit<GoogleAuthConfig,'store'|'attemptLimiter'|'authorizeBeta'|'recheckBeta'>;
}

/** Server-only composition prerequisite for createIntegratedApi({googleAuth,...}).
 * Creates adapters only: no pool/credentials/migration, network, listener or
 * environment-based activation. main.ts and integration.ts retain release gates.
 * This reads existing independently approved Workspace/OTP proofs; it does not
 * issue a proof, grant admission, install OTP routes or authorize deployment. */
export function createPostgresGoogleAuth(config:PostgresGoogleAuthConfig){
  if(!config?.pools||!['sessions','admission','attempts'].every(
    key=>typeof config.pools[key as keyof typeof config.pools]?.connect==='function'))
    throw new Error('Explicit auth PostgreSQL pools required');
  const admission=new PostgresBetaAdmissionStore(config.pools.admission);
  const clock={...(config.google.now?{now:config.google.now}:{})};
  return createGoogleAuthFlow({
    ...config.google,
    store:new PostgresGoogleAuthStore(config.pools.sessions),
    attemptLimiter:new PostgresAuthAttemptLimiter(config.pools.attempts,config.attemptDigestKey),
    authorizeBeta:createBetaAdmissionPolicy(admission,clock),
    recheckBeta:createBetaSessionRechecker(admission,clock),
  });
}
