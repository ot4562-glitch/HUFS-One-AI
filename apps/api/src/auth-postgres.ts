import {createGoogleAuthFlow} from './modules/auth/google-auth-flow.js';
import type {GoogleAuthConfig} from './modules/auth/google-auth-flow.js';
import {PostgresGoogleAuthStore} from './modules/auth/google-auth-postgres.js';
import {PostgresAuthAttemptLimiter} from './modules/auth/auth-attempt-limiter-postgres.js';
import {PostgresBetaAdmissionStore} from './modules/auth/beta-admission-postgres.js';
import {createBetaAdmissionPolicy,createBetaSessionRechecker} from './modules/auth/beta-admission.js';
import type {ReviewerSqlPool} from './modules/auth/reviewer-postgres.js';
import {createSchoolMailProofService} from './modules/auth/school-mail-proof.js';
import type {SchoolMailSender} from './modules/auth/school-mail-proof.js';
import {PostgresSchoolMailChallengeStore,PostgresSchoolProofApprover} from './modules/auth/school-mail-postgres.js';

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

export interface PostgresSchoolMailAuthConfig extends PostgresGoogleAuthConfig {
  schoolMail:{
    /** Challenge writes and narrow proof UPDATE permissions are separate from
     * the SELECT-only admission pool used by every authenticated request. */
    pools:{challenges:ReviewerSqlPool;proofUpdates:ReviewerSqlPool};
    digestKey:Buffer;
    sender:SchoolMailSender;
  };
}

/** Explicit server-only ports for createIntegratedApi. No SMTP/Google call,
 * connection, timer, migration or production activation during construction.
 * Uses existing administrator approvals; OTP cannot create beta admission. */
export function createPostgresSchoolMailAuth(config:PostgresSchoolMailAuthConfig){
  const mail=config?.schoolMail;
  if(!mail?.pools||!['challenges','proofUpdates'].every(
    key=>typeof mail.pools[key as keyof typeof mail.pools]?.connect==='function'))
    throw new Error('Explicit school mail PostgreSQL pools required');
  if(typeof mail.sender?.send!=='function')throw new Error('Explicit approved school mail sender required');
  const googleAuth=createPostgresGoogleAuth(config);
  const schoolMailProof=createSchoolMailProofService({
    store:new PostgresSchoolMailChallengeStore(mail.pools.challenges),
    approver:new PostgresSchoolProofApprover(mail.pools.proofUpdates),
    sender:mail.sender,digestKey:mail.digestKey,
    attemptLimiter:new PostgresAuthAttemptLimiter(config.pools.attempts,config.attemptDigestKey),
    requireClientIp:true,
    ...(config.google.now?{now:config.google.now}:{}),
  });
  return {googleAuth,schoolMailProof};
}
