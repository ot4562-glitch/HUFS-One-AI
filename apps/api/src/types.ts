import type {FastifyRequest} from 'fastify';
import type {ReviewerAccessStore,ReviewerDemoRepository} from './modules/auth/reviewer.js';
import type {ReviewerSandboxStore} from './modules/auth/reviewer-sandbox.js';
import type {GoogleAuthFlow} from './modules/auth/google-auth-flow.js';
import type {createSchoolMailProofService} from './modules/auth/school-mail-proof.js';
import type {
  DemoProfileOption, DemoSnapshot, SafeLlmPacket, SharingGrant, SubjectAlias, AiTask,
} from '@hufs-one/contracts';

/**
 * Returned ONLY by a trusted Google OIDC/verified-mail session adapter.
 * The client must never control the role, actorId, email or session proof.
 * Reviewer sessions are not given BETA/ADMIN privileges; the server checks
 * an active invite grant in an independent store on EVERY review request.
 */
interface ActorSessionBase {
  actorId:string;
  sessionIdHash:string;
  sessionExpiresAt:string;
  csrfToken:string;
}
export interface VerifiedTeamActor extends ActorSessionBase {
  schoolMailProofExpiresAt:string;
  betaAllowed:boolean;
  /** Populated by real Google auth flow; required for per-request beta recheck. */
  verifiedSchoolEmail?:string|undefined;
  schoolProofMethod?:'SIGNED_WORKSPACE'|'MAILBOX_OTP'|undefined;
  role:'BETA'|'ADMIN';
}
export interface VerifiedReviewerActor extends ActorSessionBase {
  role:'REVIEWER';
  verifiedEmail:string;
  identityProofExpiresAt:string; // OIDC verified email + fresh OTP when necessary
}
export type VerifiedActor=VerifiedTeamActor|VerifiedReviewerActor;
export type VerifySession = (request: FastifyRequest) => Promise<VerifiedActor|null>;

export interface ApiRepository {
  listProfiles(): Promise<DemoProfileOption[]>;
  readGrant(actorId: string, subject: SubjectAlias): Promise<SharingGrant|null>;
  /** Unsafe subject-only read: internal REVIEWER/synthetic legacy use only.
   * BETA HTTP routes must call readAuthorizedSnapshot instead. */
  readSnapshot(subject: SubjectAlias): Promise<DemoSnapshot|null>;
  /**
   * One repository operation must validate current actor+subject+grant version,
   * requested sections, revoke/expiry and return only a scope-safe projection.
   * Optional while DB adapters migrate; absence MUST deny BETA reads.
   * Never accept actorId or grantVersion from a browser payload.
   */
  readAuthorizedSnapshot?(input:{
    actorId:string;subjectId:SubjectAlias;grantVersion:string;
    requiredSections?:Array<'FEED'|'NOTICES'|'ACADEMICS'|'FORECAST'|'EXPERIENCE'>;
    now?:string;
  }):Promise<DemoSnapshot|null>;
  /** Server-approved packet reference. A browser must NEVER send raw model text. */
  readSafePacket(actorId: string, task: AiTask, ref: string): Promise<SafeLlmPacket|null>;
}

export interface RawAiCandidate {
  task: AiTask;
  citations: Array<{sourceToken: string; paragraphId: string; quote: string; topicCode?: string}>;
  reviewRequired: boolean;
}

/** External providers are intentionally not implemented or connected in this PR. */
export interface AiCandidateProvider {
  analyze(packet: SafeLlmPacket): Promise<unknown>;
}

export interface ApiOptions {
  repository: ApiRepository;
  /** A separate grant store and synthetic-only projection repository for REVIEWER. */
  reviewerAccess?: ReviewerAccessStore;
  reviewerDemo?: ReviewerDemoRepository;
  /** Only an isolated synthetic/replay workspace; never production actions. */
  reviewerSandbox?: ReviewerSandboxStore;
  verifySession?: VerifySession;
  /** Optional browser OAuth flow; local main intentionally does not configure it. */
  googleAuth?: GoogleAuthFlow;
  /** Explicitly injected verified-school-mail flow. Disabled by default. */
  schoolMailProof?: ReturnType<typeof createSchoolMailProofService>;
  /** Actual session invalidator must revoke server-side session, not just clear a cookie. */
  revokeSession?: (actor: VerifiedActor) => Promise<void>;
  allowedOrigin: string;
  now?: () => string;
  newId?: () => string;
  /** This must be explicitly supplied by a private local test harness. */
  syntheticAiProvider?: AiCandidateProvider;
  maxSyntheticAiCallsPerActor?: number;
}
