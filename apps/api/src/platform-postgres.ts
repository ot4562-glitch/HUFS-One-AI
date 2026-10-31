import type {ReviewerSqlPool} from './modules/auth/reviewer-postgres.js';
import {PostgresApiProjectionRepository} from './repository-postgres.js';
import type {PurposeConsentVerifier} from './repository-postgres.js';
import {ScopedApiRepository} from './scoped-repository.js';
import {PostgresCalendarInputSource} from './modules/calendar-postgres.js';
import type {CalendarInputSource} from './modules/calendar.js';
import {PostgresPersonalStateStore} from './db/personal-state-postgres.js';
import type {PersonalDataConsentVerifier,SyntheticPersonalFixtureAuthority} from './db/personal-state-postgres.js';
import {PostgresTemporalEvidenceReader} from './modules/opportunities/temporal-postgres.js';
import {createPostgresTemporalGateway} from './modules/opportunities/temporal-gateway.js';
import type {EvidenceRightsResolver} from './modules/opportunities/temporal-gateway.js';

/** Supply independently restricted, verified pools after applying reviewed migrations.
 * This creates adapters only: no credentials, pool creation, migrations or live calls. */
export interface PostgresPlatformConfig {
  pools:{projections:ReviewerSqlPool;calendar:ReviewerSqlPool;personal:ReviewerSqlPool;evidence:ReviewerSqlPool};
  evidenceRights:EvidenceRightsResolver;
  displayConsent?:PurposeConsentVerifier;
  personalConsent?:PersonalDataConsentVerifier;
  syntheticAuthority?:SyntheticPersonalFixtureAuthority;
  /** Separate approved synthetic source. No fallback to team/student projections. */
  reviewerCalendar?:CalendarInputSource;
  now?:()=>string;
}

/** Spread these services into createIntegratedApi alongside the trusted auth/reviewer ports. */
export function createPostgresPlatformServices(config:PostgresPlatformConfig){
  const now=config.now??(()=>new Date().toISOString());
  const teamCalendar=new PostgresCalendarInputSource(config.pools.calendar);
  const calendarSource:CalendarInputSource={
    readAuthorizedInputs:input=>input.reviewerInviteId===undefined
      ?teamCalendar.readAuthorizedInputs(input)
      :config.reviewerCalendar?.readAuthorizedInputs(input)??Promise.resolve(null),
    revalidateAuthorization:(input,receipt,at)=>input.reviewerInviteId===undefined
      ?teamCalendar.revalidateAuthorization(input,receipt,at)
      :config.reviewerCalendar?.revalidateAuthorization(input,receipt,at)??Promise.resolve(false),
  };
  return {
    repository:new ScopedApiRepository(new PostgresApiProjectionRepository(
      config.pools.projections,now,config.displayConsent),teamCalendar,now),
    calendarSource,
    personalState:new PostgresPersonalStateStore(config.pools.personal,
      config.personalConsent,config.syntheticAuthority),
    temporalEvidence:createPostgresTemporalGateway(
      new PostgresTemporalEvidenceReader(config.pools.evidence),config.evidenceRights),
  };
}
