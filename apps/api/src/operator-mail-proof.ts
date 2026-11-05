/** Private operator school-mail OTP composition; no delivery at construction. */
import type {ReviewerSqlPool} from './modules/auth/reviewer-postgres.js';
import {createSchoolMailProofService} from './modules/auth/school-mail-proof.js';
import type {SchoolMailSender} from './modules/auth/school-mail-proof.js';
import {PostgresSchoolMailChallengeStore,PostgresSchoolProofApprover} from './modules/auth/school-mail-postgres.js';
import {PostgresAuthAttemptLimiter} from './modules/auth/auth-attempt-limiter-postgres.js';
import type {TrustedSchoolMailPort} from './integration.js';

export interface OperatorMailProofInput {
  pools:{challenges:ReviewerSqlPool;proofUpdates:ReviewerSqlPool;attempts:ReviewerSqlPool};
  challengeDigestKey:Buffer;
  attemptDigestKey:Buffer;
  sender:SchoolMailSender;
  now?:()=>Date;
}

export function createOperatorSchoolMailProof(input:OperatorMailProofInput):TrustedSchoolMailPort{
  if(!input||!['challenges','proofUpdates','attempts'].every(
    role=>typeof input.pools?.[role as keyof OperatorMailProofInput['pools']]?.connect==='function')
    ||typeof input.sender?.send!=='function')
    throw new Error('Restricted database pools and reviewed delivery are required');
  if(!Buffer.isBuffer(input.challengeDigestKey)||input.challengeDigestKey.length<32
    ||!Buffer.isBuffer(input.attemptDigestKey)||input.attemptDigestKey.length<32
    ||input.challengeDigestKey.equals(input.attemptDigestKey))
    throw new Error('Independent nonempty digest keys are required');
  return createSchoolMailProofService({
    store:new PostgresSchoolMailChallengeStore(input.pools.challenges),
    approver:new PostgresSchoolProofApprover(input.pools.proofUpdates),
    attemptLimiter:new PostgresAuthAttemptLimiter(input.pools.attempts,input.attemptDigestKey),
    digestKey:Buffer.from(input.challengeDigestKey),sender:input.sender,
    requireClientIp:true,
    ...(input.now?{now:input.now}:{})
  });
}
