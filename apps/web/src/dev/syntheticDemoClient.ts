import {
  DemoContextSchema, DemoProfilesResponseSchema, DemoSnapshotSchema,
  DemoOverlayPutSchema, DemoOverlayResultSchema,
  type ApiErrorCode, type CalendarResult, type DemoContext, type DemoOverlayPut, type DemoOverlayResult, type DemoOverlayValue,
  type DemoProfileOption, type DemoSnapshot, type SubjectAlias,
} from '@hufs-one/contracts';
import {HufsApiError} from '../integrations/api-client.js';
import {
  ReviewerSandboxClientActionSchema, type ReviewerSandboxClientAction, type ReviewerSandboxClientResult,
} from '../integrations/reviewer-sandbox-contract.js';
import type {DemoClientPort} from '../app/demo-controller.js';
import profilesJson from '../../../../packages/fixtures/synthetic/demo-profiles.json';
import {applySyntheticOverlay, buildSyntheticSubjects, type SyntheticSubject} from './syntheticCorpus.js';

/**
 * In-browser SYNTHETIC demo transport for local UI development and component tests.
 * Not a real API: no network, no student data. The shell shows a permanent
 * "합성 모의 연결" banner whenever this client is in use.
 *
 * Every subject's context and snapshot come from that subject's own generated synthetic data
 * (syntheticCorpus); a context is bound to one subject and its snapshot's versions.
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

const ACADEMIC_SHARERS: ReadonlySet<SubjectAlias> = new Set(['S01', 'S02']);

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, {once: true});
  });
}

export class SyntheticDemoClient implements DemoClientPort {
  protected readonly subjects: ReadonlyMap<SubjectAlias, SyntheticSubject> = buildSyntheticSubjects();
  protected readonly contexts = new Map<string, SubjectAlias>();
  private counter = 0;
  private readonly delayMs: number;
  private readonly snapshotErrors: Partial<Record<SubjectAlias, ApiErrorCode>>;

  constructor(options: SyntheticClientOptions = {}) {
    this.delayMs = options.delayMs ?? 250;
    this.snapshotErrors = options.snapshotErrors ?? {};
  }

  /**
   * Slots/readiness from the shared fixture (S05 stays PENDING); labels from each subject's own data.
   * Ready synthetic subjects explicitly share the local EXPERIENCE fixture; this does not change API grants.
   * S01/S02 also share ACADEMICS+FORECAST so the 졸업 screen shows data (S01), pending (S02) and
   * out-of-scope (S03/S04) cases.
   */
  async listProfiles(signal?: AbortSignal): Promise<DemoProfileOption[]> {
    await wait(this.delayMs, signal);
    const {profiles} = DemoProfilesResponseSchema.parse(profilesJson);
    return DemoProfilesResponseSchema.parse({
      profiles: profiles.map(p => ({
        ...p,
        displayLabel: this.subjects.get(p.demoSubjectId)?.label ?? p.displayLabel,
        allowedSections: ACADEMIC_SHARERS.has(p.demoSubjectId) ? [...p.allowedSections, 'EXPERIENCE', 'ACADEMICS', 'FORECAST']
          : p.allowedSections.length ? [...p.allowedSections, 'EXPERIENCE'] : p.allowedSections,
      })),
    }).profiles;
  }

  async createContext(subject: SubjectAlias, runId: string, signal?: AbortSignal): Promise<DemoContext> {
    await wait(this.delayMs, signal);
    const data = this.subjects.get(subject);
    if (!data) throw new HufsApiError('FORBIDDEN', 403);
    const contextId = `SYN-CTX-${subject}-${++this.counter}`;
    this.contexts.set(contextId, subject);
    return DemoContextSchema.parse({
      contextId, actorId: 'SYN-ACTOR-DEV', demoSubjectId: subject, demoRunId: runId, sessionIdHash: 'SYN-HASH-DEV',
      datasetVersion: data.snapshot.versions.dataset, projectionVersion: data.snapshot.versions.projection,
      // Same value as the snapshot's consent version, as the real server binds them (overlay writes check it).
      sharingGrantVersion: data.snapshot.versions.consent, expiresAt: new Date(Date.parse(data.snapshot.asOf) + 86_400_000).toISOString(),
    });
  }

  async getSnapshot(contextId: string, signal?: AbortSignal): Promise<DemoSnapshot> {
    await wait(this.delayMs, signal);
    const subject = this.contexts.get(contextId);
    const data = subject && this.subjects.get(subject);
    if (!subject || !data) throw new HufsApiError('FORBIDDEN', 403);
    const forced = this.snapshotErrors[subject];
    if (forced) throw new HufsApiError(forced, ERROR_STATUS[forced]);
    return DemoSnapshotSchema.parse({...this.current(contextId, subject, data).snapshot, contextId});
  }

  /** Synthetic stand-in for the pending HufsApiClient.getCalendar (#71): the subject's own calendar. */
  async getCalendar(contextId: string, signal?: AbortSignal): Promise<CalendarResult> {
    await wait(this.delayMs, signal);
    const subject = this.contexts.get(contextId);
    const data = subject && this.subjects.get(subject);
    if (!data || !subject) throw new HufsApiError('FORBIDDEN', 403);
    return this.current(contextId, subject, data).calendar;
  }

  /** #85 temporary BETA choices per context (dev stand-in for the overlay API). */
  private readonly overlays = new Map<string, {version: number; value: DemoOverlayValue; updatedAt: string | null}>();
  /** Test hook: the next overlay write for these contexts fails once with this code. */
  readonly failNextOverlay = new Map<string, ApiErrorCode>();

  private current(contextId: string, subject: SubjectAlias, data: SyntheticSubject): SyntheticSubject {
    const o = this.overlays.get(contextId);
    return o ? applySyntheticOverlay(subject, data, o.value, o.version) : data;
  }

  private overlayResult(contextId: string): DemoOverlayResult {
    const subject = this.contexts.get(contextId);
    const data = subject && this.subjects.get(subject);
    if (!subject || !data) throw new HufsApiError('FORBIDDEN', 403);
    const o = this.overlays.get(contextId) ?? {version: 0, value: {}, updatedAt: null};
    const s = applySyntheticOverlay(subject, data, o.value, o.version);
    return DemoOverlayResultSchema.parse({overlay: o, snapshot: {...s.snapshot, contextId}, calendar: s.calendar});
  }

  async getDemoOverlay(context: DemoContext, signal?: AbortSignal): Promise<DemoOverlayResult> {
    await wait(this.delayMs, signal);
    return this.overlayResult(context.contextId);
  }

  private write(contextId: string, expectedVersion: number, value: DemoOverlayValue): DemoOverlayResult {
    const planned = this.failNextOverlay.get(contextId);
    if (planned) { this.failNextOverlay.delete(contextId); throw new HufsApiError(planned, ERROR_STATUS[planned]); }
    const cur = this.overlays.get(contextId) ?? {version: 0, value: {}, updatedAt: null};
    if (expectedVersion !== cur.version) throw new HufsApiError('VERSION_CONFLICT', 409);
    this.overlays.set(contextId, {version: cur.version + 1, value, updatedAt: new Date(Date.parse(this.asOfOf(contextId)) + 60_000).toISOString()});
    return this.overlayResult(contextId);
  }

  private asOfOf(contextId: string): string {
    const subject = this.contexts.get(contextId);
    const data = subject && this.subjects.get(subject);
    if (!data) throw new HufsApiError('FORBIDDEN', 403);
    return data.snapshot.asOf;
  }

  async setDemoOverlay(context: DemoContext, change: DemoOverlayPut, signal?: AbortSignal): Promise<DemoOverlayResult> {
    await wait(this.delayMs, signal);
    const input = DemoOverlayPutSchema.safeParse(change);
    if (!input.success) throw new HufsApiError('INVALID_INPUT', 422);
    return this.write(context.contextId, input.data.expectedVersion, input.data.value);
  }

  async resetDemoOverlay(context: DemoContext, expectedVersion: number, signal?: AbortSignal): Promise<DemoOverlayResult> {
    await wait(this.delayMs, signal);
    return this.write(context.contextId, expectedVersion, {});
  }

  /** Simulate an overlay change from another tab: bumps the stored version. */
  touchOverlay(contextId: string): void {
    const cur = this.overlays.get(contextId) ?? {version: 0, value: {}, updatedAt: null};
    this.overlays.set(contextId, {version: cur.version + 1, value: cur.value, updatedAt: new Date(Date.parse(this.asOfOf(contextId)) + 60_000).toISOString()});
  }

  /** In-memory synthetic sandbox log per subject (dev stand-in for the REVIEWER actions API). */
  private readonly logs = new Map<SubjectAlias, ReviewerSandboxClientAction[]>();

  async readActions(contextId: string, signal?: AbortSignal): Promise<ReviewerSandboxClientResult> {
    await wait(this.delayMs, signal);
    const subject = this.contexts.get(contextId);
    if (!subject) throw new HufsApiError('FORBIDDEN', 403);
    return {subjectId: subject, mode: 'SYNTHETIC_SANDBOX', actions: [...(this.logs.get(subject) ?? [])]};
  }

  async saveAction(contextId: string, action: unknown, signal?: AbortSignal): Promise<ReviewerSandboxClientResult> {
    await wait(this.delayMs, signal);
    const subject = this.contexts.get(contextId);
    if (!subject) throw new HufsApiError('FORBIDDEN', 403);
    const parsed = ReviewerSandboxClientActionSchema.safeParse(action);
    if (!parsed.success) throw new HufsApiError('INVALID_INPUT', 422);
    const log = [...(this.logs.get(subject) ?? []), parsed.data].slice(-200);
    this.logs.set(subject, log);
    return {subjectId: subject, mode: 'SYNTHETIC_SANDBOX', actions: [...log]};
  }

  async logout(): Promise<void> {
    this.contexts.clear();
    this.overlays.clear();
    this.logs.clear();
  }
}
