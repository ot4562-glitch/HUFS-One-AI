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
import {createRestrictedOwnerDirectory} from './modules/private-intake/owner-registry.js';
import type {CampusAssistServices} from './modules/campus-assist-http.js';
import type {TrustedExperienceCourseSource} from './modules/owner-experience-course-http.js';

export type ApprovedCampusSources=Pick<CampusAssistServices,'activities'|'exchange'|'faq'>;
export function validateCampusSources(sources:ApprovedCampusSources):void{
  const active=['activities','exchange','faq'] as const;
  if(!sources||active.every(name=>!sources[name])||
    active.some(name=>sources[name] && (typeof sources[name].read!=='function'
      ||typeof sources[name].revalidate!=='function'))
    ||'hcx007' in sources)
    throw new Error('Campus assistance requires explicit approved source and rights ports; paid AI cannot be injected here');
}


export interface PostgresApplicationConfig {
  runtime?:RuntimeMode;
  /** Exact ingress addresses, never a caller-controlled blanket proxy flag. */
  trustedProxyAddresses?:readonly string[];
  auth:PostgresGoogleAuthConfig;
  schoolMailProof?:TrustedSchoolMailPort;
  /** Optional operator-owned, current rights/revision guarded source ports.
   * No synthetic fallback and no direct billable provider adapter. */
  campusAssist?:ApprovedCampusSources;
  /** Purpose-specific, independently approved canonical course and owner-link source. */
  ownerExperienceCourse?:TrustedExperienceCourseSource;
  platform:Omit<PostgresPlatformConfig,'now'>;
  /** Explicit operator-supplied restricted 4-owner CSV/registry loaders; no auto import or demo fallback. */
  ownerIntake?:Omit<Parameters<typeof createRestrictedOwnerDirectory>[0],'now'>;
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
  if(config.ownerIntake&&['loadRegistry','verifyStorage','loadSources'].some(
    name=>typeof config.ownerIntake?.[name as keyof typeof config.ownerIntake]!=='function'))
    throw new Error('Restricted owner intake requires all three verified operator loaders');
  if(config.campusAssist)validateCampusSources(config.campusAssist);
  if(config.ownerExperienceCourse&&(typeof config.ownerExperienceCourse.read!=='function'
    ||typeof config.ownerExperienceCourse.revalidate!=='function'))
    throw new Error('Experience-course source needs current owner grant and revalidation');
  const googleAuth=createPostgresGoogleAuth(config.auth);
  const clock=config.auth.google.now??(()=>new Date());
  const now=()=>clock().toISOString();
  const platform=createPostgresPlatformServices({...config.platform,now});
  return createIntegratedApi({
    googleAuth,...platform,allowedOrigin:config.auth.google.allowedOrigin,now,
    ...(config.campusAssist?{campusAssist:config.campusAssist}:{}),
    ...(config.ownerExperienceCourse?{ownerExperienceCourse:config.ownerExperienceCourse}:{}),
    ...(config.ownerIntake?{restrictedOwnerDirectory:createRestrictedOwnerDirectory({...config.ownerIntake,now})}:{}),
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
