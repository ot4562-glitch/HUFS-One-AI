import type {FastifyRequest} from 'fastify';
import type {
  DemoProfileOption, DemoSnapshot, SafeLlmPacket, SharingGrant, SubjectAlias, AiTask,
} from '@hufs-one/contracts';

/**
 * Issued ONLY by a trusted OIDC + school-mail + beta-allowlist session adapter.
 * Never reconstruct from request headers, email suffixes, or user-controlled JSON.
 */
export interface VerifiedActor {
  actorId: string;
  sessionIdHash: string;
  sessionExpiresAt: string;
  schoolMailProofExpiresAt: string;
  betaAllowed: boolean;
  role: 'BETA'|'ADMIN';
  csrfToken: string;
}
export type VerifySession = (request: FastifyRequest) => Promise<VerifiedActor|null>;

export interface ApiRepository {
  listProfiles(): Promise<DemoProfileOption[]>;
  readGrant(actorId: string, subject: SubjectAlias): Promise<SharingGrant|null>;
  readSnapshot(subject: SubjectAlias): Promise<DemoSnapshot|null>;
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
  verifySession?: VerifySession;
  /** Actual session invalidator must revoke server-side session, not just clear a cookie. */
  revokeSession?: (actor: VerifiedActor) => Promise<void>;
  allowedOrigin: string;
  now?: () => string;
  newId?: () => string;
  /** This must be explicitly supplied by a private local test harness. */
  syntheticAiProvider?: AiCandidateProvider;
  maxSyntheticAiCallsPerActor?: number;
}
