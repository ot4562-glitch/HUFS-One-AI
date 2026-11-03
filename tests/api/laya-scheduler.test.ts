import {afterEach, describe, expect, it, vi} from 'vitest';
import {LayaScheduler, type LayaApproval, type LayaJob, type LayaWorker, type LayaAdvice} from '../../packages/ai/src/laya-scheduler';

const pin = {path: '/approved/synthetic', sha256: 'a'.repeat(64)};
const approval: LayaApproval = {
  enabled: true, operatorApprovalId: 'synthetic-approval', approvedAt: '2026-11-03T00:00:00.000Z',
  isolation: {cgroupV2: true, cpuMax: '100000 100000', memoryMaxBytes: 3 * 1024 ** 3, networkDenied: true, separateFromApi: true},
  manifest: {model: pin, runtime: {...pin, path: '/approved/runtime.mjs'}, driver: {...pin, path: '/approved/driver.mjs'}, artifacts: [], modelRevision: 'model-1', configVersion: 'config-1',
    labels: ['review'], inputNames: ['input_ids'], outputNames: ['scores']},
};
const job = (sourceId = 'source-1', extra: Partial<LayaJob> = {}): LayaJob => ({
  origin: 'INGEST', actorId: 'actor-1', sourceId, sourceRevision: 'rev-1', modelRevision: 'model-1', configVersion: 'config-1',
  permissionRevision: 'permission-1', asOf: '2026-11-03T00:00:00.000Z', text: 'synthetic source', ...extra,
});
function deferredWorker() {
  const pending: {job: LayaJob; resolve: (value: LayaAdvice) => void; reject: (error: Error) => void}[] = [];
  let crashed: ((error: Error) => void) | undefined;
  const worker: LayaWorker = {
    start: async () => {}, stop: () => {}, onFailure: callback => {crashed = callback;},
    run: value => new Promise((resolve, reject) => pending.push({job: value, resolve, reject})),
  };
  return {worker, pending, crash: () => crashed?.(new Error('synthetic OOM'))};
}
const advice: LayaAdvice = {label: 'review', score: 0.6, tokenCount: 4};
const flush = async () => {await Promise.resolve(); await Promise.resolve(); await Promise.resolve();};
afterEach(() => {vi.useRealTimers();});

describe('Laya owner scheduler', () => {
  it('defaults OFF and rejects incomplete host/model approval before starting a worker', async () => {
    let starts = 0;
    const fake = deferredWorker();
    fake.worker.start = async () => {starts++;};
    const scheduler = new LayaScheduler({createWorker: () => fake.worker, isCurrent: () => true});
    expect(await scheduler.enqueue(job()).result).toMatchObject({status: 'NEEDS_REVIEW', reason: 'LAYA_OFF', fallback: 'RULES'});
    await expect(scheduler.start({...approval, isolation: {...approval.isolation, cgroupV2: false}})).rejects.toThrow();
    expect(starts).toBe(0);
    expect(scheduler.status().state).toBe('OFF');
  });

  it('runs only one job, deduplicates scoped work and bounds waiting work at 16', async () => {
    const fake = deferredWorker();
    const scheduler = new LayaScheduler({createWorker: () => fake.worker, isCurrent: () => true});
    await scheduler.start(approval);
    const first = scheduler.enqueue(job());
    expect(scheduler.enqueue(job()).result).toBe(first.result);
    await flush();
    const queue = Array.from({length: 16}, (_, i) => scheduler.enqueue(job(`queued-${i}`)));
    expect(await scheduler.enqueue(job('overflow')).result).toMatchObject({reason: 'QUEUE_FULL'});
    expect(fake.pending).toHaveLength(1);
    expect(scheduler.status().waiting).toBe(16);
    fake.pending[0]!.resolve(advice);
    expect(await first.result).toMatchObject({status: 'ADVICE', verification: 'UNVERIFIED', advice});
    await flush();
    expect(fake.pending).toHaveLength(2);
    scheduler.stop();
    await Promise.all(queue.map(item => item.result));
  });

  it('does not deduplicate across actor, permission, asOf or source revisions', async () => {
    const fake = deferredWorker();
    const scheduler = new LayaScheduler({createWorker: () => fake.worker, isCurrent: () => true});
    await scheduler.start(approval);
    const first = scheduler.enqueue(job());
    const second = scheduler.enqueue(job('source-1', {actorId: 'actor-2'}));
    const third = scheduler.enqueue(job('source-1', {permissionRevision: 'permission-2'}));
    const fourth = scheduler.enqueue(job('source-1', {asOf: '2026-11-02T00:00:00.000Z'}));
    const fifth = scheduler.enqueue(job('source-1', {sourceRevision: 'rev-2'}));
    expect(new Set([first.result, second.result, third.result, fourth.result, fifth.result]).size).toBe(5);
    expect(await scheduler.enqueue(job('source-1', {text: 'different content'})).result).toMatchObject({reason: 'INPUT_CONFLICT'});
    scheduler.stop();
  });

  it('expires waiting work at 30s and running work at 20s without restarting', async () => {
    vi.useFakeTimers();
    const fake = deferredWorker();
    const scheduler = new LayaScheduler({createWorker: () => fake.worker, isCurrent: () => true});
    await scheduler.start(approval);
    const running = scheduler.enqueue(job());
    const waiting = scheduler.enqueue(job('queued'));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await running.result).toMatchObject({reason: 'EXECUTION_TIMEOUT'});
    expect(await waiting.result).toMatchObject({fallback: 'RULES'});
    expect(scheduler.status().state).toBe('OFF');
    expect(fake.pending).toHaveLength(1);
    await scheduler.start(approval);
    scheduler.pause('TEST_PAUSE');
    // Paused admission fails immediately; existing queues expire while paused.
    expect(await scheduler.enqueue(job('paused')).result).toMatchObject({reason: 'LAYA_PAUSED'});
    scheduler.stop();
  });

  it('expires a paused queue at 30s without executing its stale work', async () => {
    vi.useFakeTimers();
    const fake = deferredWorker();
    const scheduler = new LayaScheduler({createWorker: () => fake.worker, isCurrent: () => true});
    await scheduler.start(approval);
    const first = scheduler.enqueue(job());
    const waiting = scheduler.enqueue(job('waiting'));
    await flush();
    scheduler.pause();
    fake.pending[0]!.resolve(advice);
    await first.result;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await waiting.result).toMatchObject({reason: 'QUEUE_TIMEOUT'});
    expect(fake.pending).toHaveLength(1);
    expect(scheduler.status().waiting).toBe(0);
    scheduler.stop();
  });

  it('checks corrected revision and permission again before dequeuing', async () => {
    const fake = deferredWorker();
    let current = true;
    const scheduler = new LayaScheduler({createWorker: () => fake.worker, isCurrent: value => value.sourceId !== 'waiting' || current});
    await scheduler.start(approval);
    const first = scheduler.enqueue(job());
    const waiting = scheduler.enqueue(job('waiting'));
    await flush();
    current = false;
    fake.pending[0]!.resolve(advice);
    await first.result;
    expect(await waiting.result).toMatchObject({reason: 'STALE_EPOCH'});
    expect(fake.pending).toHaveLength(1);
    scheduler.stop();
  });

  it('limits manual failed restarts to three per hour and bounds initialization at 45s', async () => {
    vi.useFakeTimers();
    const fake = deferredWorker();
    fake.worker.start = async () => new Promise<void>(() => {});
    const scheduler = new LayaScheduler({createWorker: () => fake.worker, isCurrent: () => true});
    for (let i = 0; i < 3; i++) {
      const start = scheduler.start(approval);
      const failed = expect(start).rejects.toThrow('MODEL_START_TIMEOUT');
      await vi.advanceTimersByTimeAsync(45_000);
      await failed;
      expect(scheduler.status().state).toBe('OFF');
    }
    await expect(scheduler.start(approval)).rejects.toThrow('LAYA_RESTART_LIMIT');
  });

  it('does not let late initialization from a stopped epoch activate a later worker', async () => {
    const fake = deferredWorker();
    let ready!: () => void;
    let attempts = 0;
    fake.worker.start = async () => {if (++attempts === 1) await new Promise<void>(resolve => {ready = resolve;});};
    const scheduler = new LayaScheduler({createWorker: () => fake.worker, isCurrent: () => true});
    const firstStart = scheduler.start(approval);
    const aborted = expect(firstStart).rejects.toThrow('LAYA_START_CANCELLED');
    scheduler.stop();
    await scheduler.start(approval);
    ready();
    await aborted;
    expect(scheduler.status().state).toBe('ON');
    scheduler.stop();
  });

  it('keeps the newer initialization deadline when an older aborted start settles', async () => {
    vi.useFakeTimers();
    const fake = deferredWorker();
    fake.worker.start = async () => new Promise<void>(() => {});
    const scheduler = new LayaScheduler({createWorker: () => fake.worker, isCurrent: () => true});
    const firstStart = scheduler.start(approval);
    const aborted = expect(firstStart).rejects.toThrow('LAYA_START_CANCELLED');
    scheduler.stop();
    const secondStart = scheduler.start(approval);
    const timedOut = expect(secondStart).rejects.toThrow('MODEL_START_TIMEOUT');
    await aborted;
    await vi.advanceTimersByTimeAsync(45_000);
    expect(scheduler.status().state).toBe('OFF');
    await timedOut;
  });

  it('discards results after source correction, cancellation and permission revocation', async () => {
    const fake = deferredWorker();
    let current = true;
    const scheduler = new LayaScheduler({createWorker: () => fake.worker, isCurrent: () => current});
    await scheduler.start(approval);
    const first = scheduler.enqueue(job());
    await flush();
    current = false;
    fake.pending[0]!.resolve(advice);
    expect(await first.result).toMatchObject({reason: 'STALE_EPOCH'});
    current = true;
    const second = scheduler.enqueue(job('source-2'));
    await flush();
    scheduler.revoke('actor-1');
    expect(await second.result).toMatchObject({reason: 'PERMISSION_REVOKED'});
    fake.pending[1]!.resolve(advice);
    await flush();
    expect(scheduler.status().state).toBe('OFF');
    await scheduler.start(approval);
    const third = scheduler.enqueue(job('source-3'));
    third.cancel();
    expect(await third.result).toMatchObject({reason: 'CANCELLED'});
    scheduler.stop();
  });

  it('fails closed on child crash and does not automatically restart', async () => {
    const fake = deferredWorker();
    const scheduler = new LayaScheduler({createWorker: () => fake.worker, isCurrent: () => true});
    await scheduler.start(approval);
    const running = scheduler.enqueue(job());
    const waiting = scheduler.enqueue(job('waiting'));
    fake.crash();
    expect(await running.result).toMatchObject({reason: 'WORKER_FAILED'});
    expect(await waiting.result).toMatchObject({reason: 'WORKER_FAILED'});
    expect(await scheduler.enqueue(job('later')).result).toMatchObject({reason: 'LAYA_OFF'});
  });

  it('pauses for sustained pressure, resumes only after 60s healthy, and OOM latches OFF', async () => {
    vi.useFakeTimers();
    const fake = deferredWorker();
    const scheduler = new LayaScheduler({createWorker: () => fake.worker, isCurrent: () => true});
    await scheduler.start(approval);
    const sample = {hostCpuPercent: 75, cpuPressureAvg10: 0, availableBytes: 5 * 1024 ** 3,
      workerRssBytes: 1024 ** 3, apiP95Ms: 100, apiBaselineP95Ms: 100, apiErrorRatio: 0, oom: false};
    scheduler.observe(sample);
    await vi.advanceTimersByTimeAsync(20_000);
    scheduler.observe(sample);
    expect(scheduler.status().state).toBe('PAUSED');
    scheduler.observe({...sample, hostCpuPercent: 40});
    await vi.advanceTimersByTimeAsync(59_999);
    scheduler.observe({...sample, hostCpuPercent: 40});
    expect(scheduler.status().state).toBe('PAUSED');
    await vi.advanceTimersByTimeAsync(1);
    scheduler.observe({...sample, hostCpuPercent: 40});
    expect(scheduler.status().state).toBe('ON');
    scheduler.observe({...sample, hostCpuPercent: 40, oom: true});
    expect(scheduler.status().state).toBe('OFF');
    scheduler.observe({...sample, hostCpuPercent: 0});
    expect(scheduler.status().state).toBe('OFF');
  });

  it('never publishes malformed, over-token or unapproved model outputs', async () => {
    const fake = deferredWorker();
    const scheduler = new LayaScheduler({createWorker: () => fake.worker, isCurrent: () => true});
    await scheduler.start(approval);
    const first = scheduler.enqueue(job());
    await flush();
    fake.pending[0]!.resolve({...advice, tokenCount: 513});
    expect(await first.result).toMatchObject({reason: 'INVALID_OUTPUT'});
    scheduler.stop();
  });
});
