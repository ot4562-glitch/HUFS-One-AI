import {
  DemoContextSchema, DemoProfilesResponseSchema, DemoSnapshotSchema,
  type ApiErrorCode, type DemoContext, type DemoProfileOption, type DemoSnapshot, type SubjectAlias,
} from '@hufs-one/contracts';
import {HufsApiError} from '../integrations/api-client.js';
import type {DemoClientPort} from '../app/demo-controller.js';
import profilesJson from '../../../../packages/fixtures/synthetic/demo-profiles.json';
import contextJson from '../../../../packages/fixtures/synthetic/demo-context.json';
import snapshotJson from '../../../../packages/fixtures/synthetic/demo-snapshot.json';

/**
 * In-browser SYNTHETIC demo transport for local UI development and component tests.
 * Not a real API: no network, no student data. The shell shows a permanent
 * "합성 모의 연결" banner whenever this client is in use.
 */
export const SYNTHETIC_TRANSPORT_LABEL = '합성 모의 연결 · 실제 서버·학생 자료 아님';

const ERROR_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401, FORBIDDEN: 403, SHARING_REVOKED: 403, VERSION_CONFLICT: 409,
  INVALID_INPUT: 422, UNVERIFIED_EVIDENCE: 422, RATE_LIMITED: 429, PROVIDER_UNAVAILABLE: 503,
};

export interface SyntheticClientOptions {
  /** Simulated latency so loading states are visible. */
  readonly delayMs?: number;
  /** Force an error for a subject's snapshot (e.g. S03 → SHARING_REVOKED) to demo failure states. */
  readonly snapshotErrors?: Partial<Record<SubjectAlias, ApiErrorCode>>;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, {once: true});
  });
}

export class SyntheticDemoClient implements DemoClientPort {
  private readonly contexts = new Map<string, SubjectAlias>();
  private counter = 0;
  private readonly delayMs: number;
  private readonly snapshotErrors: Partial<Record<SubjectAlias, ApiErrorCode>>;

  constructor(options: SyntheticClientOptions = {}) {
    this.delayMs = options.delayMs ?? 250;
    this.snapshotErrors = options.snapshotErrors ?? {};
  }

  async listProfiles(signal?: AbortSignal): Promise<DemoProfileOption[]> {
    await wait(this.delayMs, signal);
    return DemoProfilesResponseSchema.parse(profilesJson).profiles;
  }

  async createContext(subject: SubjectAlias, runId: string, signal?: AbortSignal): Promise<DemoContext> {
    await wait(this.delayMs, signal);
    const contextId = `SYN-CTX-${subject}-${++this.counter}`;
    this.contexts.set(contextId, subject);
    return DemoContextSchema.parse({...contextJson, contextId, demoSubjectId: subject, demoRunId: runId});
  }

  async getSnapshot(contextId: string, signal?: AbortSignal): Promise<DemoSnapshot> {
    await wait(this.delayMs, signal);
    const subject = this.contexts.get(contextId);
    if (!subject) throw new HufsApiError('FORBIDDEN', 403);
    const forced = this.snapshotErrors[subject];
    if (forced) throw new HufsApiError(forced, ERROR_STATUS[forced]);
    return DemoSnapshotSchema.parse({...snapshotJson, contextId, demoSubjectId: subject});
  }

  async logout(): Promise<void> {
    this.contexts.clear();
  }
}
