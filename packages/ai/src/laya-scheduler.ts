import {createHash, randomUUID} from 'node:crypto';
import {isAbsolute} from 'node:path';

/** Artifact pins refer to operator-installed, read-only files. No downloader exists. */
export interface LayaFilePin {path: string; sha256: string}
export interface LayaManifest {
  model: LayaFilePin;
  runtime: LayaFilePin;
  driver: LayaFilePin;
  /** Include tokenizer vocabulary/config and runtime native/shared-library artifacts. */
  artifacts: LayaFilePin[];
  modelRevision: string;
  configVersion: string;
  labels: string[];
  inputNames: string[];
  outputNames: string[];
}
export interface LayaApproval {
  enabled: true;
  operatorApprovalId: string;
  approvedAt: string;
  isolation: {cgroupV2: boolean; cpuMax: string; memoryMaxBytes: number; networkDenied: boolean; separateFromApi: boolean};
  manifest: LayaManifest;
}
export interface LayaJob {
  origin: 'INGEST';
  actorId: string;
  sourceId: string;
  sourceRevision: string;
  modelRevision: string;
  configVersion: string;
  permissionRevision: string;
  asOf: string;
  text: string;
}
export interface LayaAdvice {label: string; score: number; tokenCount: number}
export type LayaOutcome =
  | {status: 'ADVICE'; verification: 'UNVERIFIED'; advice: LayaAdvice; binding: Omit<LayaJob, 'text' | 'origin'>}
  | {status: 'NEEDS_REVIEW'; verification: 'UNKNOWN'; fallback: 'RULES'; reason: string};
export interface LayaWorker {
  start(approval: LayaApproval): Promise<void>;
  run(job: LayaJob): Promise<LayaAdvice>;
  stop(): void;
  onFailure(callback: (error: Error) => void): void;
}
export interface LayaPressure {
  hostCpuPercent: number;
  cpuPressureAvg10: number;
  availableBytes: number;
  workerRssBytes: number;
  apiP95Ms: number;
  apiBaselineP95Ms: number;
  apiErrorRatio: number;
  oom: boolean;
}
export interface LayaHandle {id: string; result: Promise<LayaOutcome>; cancel(): void}
type Entry = {
  id: string; key: string; digest: string; job: LayaJob; epoch: number; settled: boolean;
  result: Promise<LayaOutcome>; resolve(value: LayaOutcome): void;
  timer: ReturnType<typeof setTimeout> | undefined;
};
const GiB = 1024 ** 3;
const fallback = (reason: string): LayaOutcome => ({status: 'NEEDS_REVIEW', verification: 'UNKNOWN', fallback: 'RULES', reason});
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;
const canonicalTime = (value: unknown): value is string => typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function validateLayaApproval(value: LayaApproval): void {
  if (!value || value.enabled !== true || !nonempty(value.operatorApprovalId) || !canonicalTime(value.approvedAt)) throw new Error('LAYA_APPROVAL_REQUIRED');
  const isolation = value.isolation;
  if (!isolation || isolation.cgroupV2 !== true || isolation.networkDenied !== true || isolation.separateFromApi !== true ||
    isolation.cpuMax !== '100000 100000' || !Number.isSafeInteger(isolation.memoryMaxBytes) ||
    isolation.memoryMaxBytes <= 0 || isolation.memoryMaxBytes > 3 * GiB) throw new Error('LAYA_ISOLATION_REQUIRED');
  const manifest = value.manifest;
  if (!manifest || !nonempty(manifest.modelRevision) || !nonempty(manifest.configVersion) || !Array.isArray(manifest.artifacts) || manifest.artifacts.length > 128) throw new Error('LAYA_MANIFEST_REQUIRED');
  for (const names of [manifest.labels, manifest.inputNames, manifest.outputNames]) {
    if (!Array.isArray(names) || !names.length || names.length > 128 || !names.every(nonempty) || new Set(names).size !== names.length) throw new Error('LAYA_MANIFEST_LABELS_OR_SHAPES_REQUIRED');
  }
  const paths = new Set<string>();
  for (const pin of [manifest.model, manifest.runtime, manifest.driver, ...manifest.artifacts]) {
    if (!pin || typeof pin.path !== 'string' || pin.path.length > 4096 || !isAbsolute(pin.path) ||
      !/^[a-f0-9]{64}$/.test(pin.sha256) || paths.has(pin.path)) throw new Error('LAYA_PIN_REQUIRED');
    paths.add(pin.path);
  }
}

/** Owner ingest only: instantiate in the isolated supervisor, never in a GET handler. */
export class LayaScheduler {
  private state: 'OFF' | 'STARTING' | 'ON' | 'PAUSED' = 'OFF';
  private reason = 'LAYA_OFF';
  private worker: LayaWorker | undefined;
  private approval: LayaApproval | undefined;
  private epoch = 0;
  private entries = new Map<string, Entry>();
  private queue: Entry[] = [];
  private active: Entry | undefined;
  private starts: number[] = [];
  private windows = new Map<string, number>();
  private abortStart: (() => void) | undefined;
  constructor(private readonly options: {
    createWorker(): LayaWorker;
    /** Must synchronously inspect the authoritative revision/permission/asOf snapshot; exceptions fail closed. */
    isCurrent(job: Readonly<LayaJob>): boolean;
    now?: () => number;
  }) {}

  status() {return {state: this.state, reason: this.reason, waiting: this.queue.length, running: this.active ? 1 : 0,
    fallback: 'RULES' as const, modelRevision: this.approval?.manifest.modelRevision};}
  private now() {return this.options.now?.() ?? Date.now();}

  async start(approval: LayaApproval): Promise<void> {
    validateLayaApproval(approval);
    if (this.state !== 'OFF') throw new Error('LAYA_ALREADY_STARTED');
    const now = this.now();
    this.starts = this.starts.filter(time => now - time < 3_600_000);
    if (this.starts.length >= 3) throw new Error('LAYA_RESTART_LIMIT');
    this.starts.push(now);
    this.epoch++;
    const epoch = this.epoch;
    this.approval = structuredClone(approval);
    this.windows.clear();
    this.state = 'STARTING';
    this.reason = 'MODEL_STARTING';
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    let abortThisStart: (() => void) | undefined;
    try {
      const worker = this.options.createWorker();
      this.worker = worker;
      worker.onFailure(() => {if (this.worker === worker) this.stop('WORKER_FAILED');});
      const deadline = new Promise<never>((_, reject) => {
        abortThisStart = () => reject(new Error('LAYA_START_CANCELLED'));
        this.abortStart = abortThisStart;
        startupTimer = setTimeout(() => reject(new Error('MODEL_START_TIMEOUT')), 45_000);
        startupTimer.unref?.();
      });
      await Promise.race([worker.start(this.approval), deadline]);
      if (this.epoch !== epoch || this.state !== 'STARTING') throw new Error('LAYA_START_CANCELLED');
      this.state = 'ON';
      this.reason = 'READY';
    } catch (error) {
      if (this.epoch === epoch) this.stop('MODEL_START_FAILED');
      throw error;
    } finally {
      if (startupTimer) clearTimeout(startupTimer);
      if (this.abortStart === abortThisStart) this.abortStart = undefined;
    }
  }

  enqueue(input: LayaJob): LayaHandle {
    const rejected = (reason: string): LayaHandle => ({id: randomUUID(), result: Promise.resolve(fallback(reason)), cancel() {}});
    if (this.state !== 'ON') return rejected(this.state === 'PAUSED' ? 'LAYA_PAUSED' : 'LAYA_OFF');
    const job = structuredClone(input);
    if (!this.valid(job)) return rejected('INVALID_INPUT');
    if (!this.current(job)) return rejected('STALE_EPOCH');
    const key = JSON.stringify([job.actorId, job.sourceId, job.sourceRevision, job.modelRevision, job.configVersion, job.permissionRevision, job.asOf]);
    const digest = createHash('sha256').update(job.text).digest('hex');
    const existing = this.entries.get(key);
    if (existing) return existing.digest === digest ? this.handle(existing) : rejected('INPUT_CONFLICT');
    if (this.queue.length >= 16) return rejected('QUEUE_FULL');
    let resolve!: (value: LayaOutcome) => void;
    const result = new Promise<LayaOutcome>(done => {resolve = done;});
    const entry: Entry = {id: randomUUID(), key, digest, job, epoch: this.epoch, result, resolve, settled: false, timer: undefined};
    entry.timer = setTimeout(() => this.finish(entry, fallback('QUEUE_TIMEOUT')), 30_000);
    entry.timer.unref?.();
    this.entries.set(key, entry);
    this.queue.push(entry);
    this.pump();
    return this.handle(entry);
  }

  private valid(job: LayaJob) {
    return job && job.origin === 'INGEST' && [job.actorId, job.sourceId, job.sourceRevision, job.modelRevision, job.configVersion, job.permissionRevision].every(nonempty) &&
      canonicalTime(job.asOf) && typeof job.text === 'string' && job.text.length > 0 && Buffer.byteLength(job.text) <= 16_384 &&
      job.modelRevision === this.approval?.manifest.modelRevision && job.configVersion === this.approval?.manifest.configVersion;
  }
  private current(job: LayaJob) {try {return this.options.isCurrent(Object.freeze({...job})) === true;} catch {return false;}}
  private handle(entry: Entry): LayaHandle {return {id: entry.id, result: entry.result, cancel: () => this.cancel(entry.id)};}

  cancel(id: string) {
    const entry = [...this.entries.values()].find(value => value.id === id);
    if (!entry) return;
    if (this.active === entry) this.stop('CANCELLED');
    else this.finish(entry, fallback('CANCELLED'));
  }
  revoke(actorId: string) {this.invalidate(actorId, undefined, 'PERMISSION_REVOKED');}
  /** Call on corrections/cancellation/permission changes, in addition to isCurrent checks. */
  invalidate(actorId: string, sourceId?: string, reason = 'STALE_EPOCH') {
    const matches = (entry: Entry) => entry.job.actorId === actorId && (sourceId === undefined || entry.job.sourceId === sourceId);
    if (this.active && matches(this.active)) {this.stop(reason); return;}
    for (const entry of [...this.queue]) if (matches(entry)) this.finish(entry, fallback(reason));
  }
  pause(reason = 'LAYA_DISABLED_RESOURCE') {
    if (this.state === 'STARTING') {this.stop(reason); return;}
    if (this.state !== 'ON') return;
    this.state = 'PAUSED'; this.reason = reason; this.windows.delete('healthy');
  }
  stop(reason = 'LAYA_OFF') {
    this.epoch++;
    this.state = 'OFF'; this.reason = reason;
    const worker = this.worker;
    this.worker = undefined;
    this.abortStart?.();
    for (const entry of [...this.entries.values()]) this.finish(entry, fallback(reason));
    this.active = undefined;
    this.queue = [];
    this.windows.clear();
    try {worker?.stop();} catch { /* Child is already failed; remain OFF. */ }
  }
  private finish(entry: Entry, outcome: LayaOutcome) {
    if (entry.settled) return;
    entry.settled = true;
    if (entry.timer) clearTimeout(entry.timer);
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    this.queue = this.queue.filter(item => item !== entry);
    entry.resolve(outcome);
  }
  private pump() {
    if (this.state !== 'ON' || this.active || !this.worker) return;
    const entry = this.queue.shift();
    if (!entry) return;
    if (entry.epoch !== this.epoch || !this.current(entry.job)) {
      this.finish(entry, fallback('STALE_EPOCH')); this.pump(); return;
    }
    this.active = entry;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => this.stop('EXECUTION_TIMEOUT'), 20_000);
    entry.timer.unref?.();
    // The backend performs tokenization and native inference in the child, never here.
    Promise.resolve().then(() => {
      if (entry.settled || entry.epoch !== this.epoch) return undefined;
      return this.worker!.run(entry.job);
    }).then(advice => {
      if (entry.settled || entry.epoch !== this.epoch) return;
      if (!this.current(entry.job)) this.finish(entry, fallback('STALE_EPOCH'));
      else if (!advice || !this.approval?.manifest.labels.includes(advice.label) || !Number.isFinite(advice.score) || advice.score < 0 || advice.score > 1 ||
        !Number.isSafeInteger(advice.tokenCount) || advice.tokenCount <= 0 || advice.tokenCount > 512) this.stop('INVALID_OUTPUT');
      else {
        const {text: _text, origin: _origin, ...binding} = entry.job;
        this.finish(entry, {status: 'ADVICE', verification: 'UNVERIFIED', advice: {...advice}, binding});
      }
    }).catch(() => {if (!entry.settled && entry.epoch === this.epoch) this.stop('WORKER_FAILED');})
      .finally(() => {if (this.active === entry) {this.active = undefined; this.pump();}});
  }

  /** Samples must come from an independent trusted host/API observer, not the model. */
  observe(sample: LayaPressure) {
    if (this.state === 'OFF') return;
    if (!sample || ![sample.hostCpuPercent, sample.cpuPressureAvg10, sample.availableBytes, sample.workerRssBytes,
      sample.apiP95Ms, sample.apiBaselineP95Ms, sample.apiErrorRatio].every(value => Number.isFinite(value) && value >= 0) ||
      sample.apiBaselineP95Ms <= 0 || sample.hostCpuPercent > 100 || sample.cpuPressureAvg10 > 100 || sample.apiErrorRatio > 1 || typeof sample.oom !== 'boolean') {
      this.stop('INVALID_RESOURCE_SAMPLE'); return;
    }
    const now = this.now();
    const sustained = (key: string, condition: boolean, duration: number) => {
      if (!condition) {this.windows.delete(key); return false;}
      if (!this.windows.has(key)) this.windows.set(key, now);
      return now - this.windows.get(key)! >= duration;
    };
    const apiBad = sample.apiP95Ms > sample.apiBaselineP95Ms * 1.25 || sample.apiP95Ms >= 400 || sample.apiErrorRatio >= 0.01;
    const severeCpu = sustained('offCpu', (sample.hostCpuPercent >= 90 || sample.cpuPressureAvg10 > 20) && apiBad, 10_000);
    const severeApi = sustained('offApi', sample.apiP95Ms > sample.apiBaselineP95Ms * 1.5 || sample.apiErrorRatio >= 0.01, 30_000);
    if (sample.oom || sample.availableBytes < 2 * GiB || sample.workerRssBytes >= 3 * GiB || severeCpu || severeApi) {
      this.stop('LAYA_DISABLED_RESOURCE'); return;
    }
    const pauseCpu = sustained('pauseCpu', sample.hostCpuPercent >= 70 || sample.cpuPressureAvg10 > 10, 20_000);
    const pauseApi = sustained('pauseApi', apiBad, 30_000);
    if (sample.availableBytes < 3 * GiB || sample.workerRssBytes > 2.5 * GiB || this.queue.length > 12 || pauseCpu || pauseApi) {
      this.pause(); this.windows.delete('healthy'); return;
    }
    const healthy = sample.hostCpuPercent < 50 && sample.cpuPressureAvg10 <= 10 && sample.availableBytes > 4 * GiB &&
      sample.workerRssBytes <= 2.5 * GiB && sample.apiP95Ms <= sample.apiBaselineP95Ms * 1.1 && sample.apiErrorRatio < 0.005;
    if (sustained('healthy', healthy, 60_000) && this.state === 'PAUSED') {
      this.state = 'ON'; this.reason = 'READY'; this.pump();
    }
  }
}
