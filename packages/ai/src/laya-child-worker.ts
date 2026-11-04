import {fork, type ChildProcess, type ForkOptions} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import type {LayaAdvice, LayaApproval, LayaJob, LayaWorker} from './laya-scheduler';
import {validateLayaApproval} from './laya-scheduler.js';

const MAX_MESSAGE_BYTES = 64 * 1024;
type Pending<T> = {resolve(value: T): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>};
const bounded = (value: unknown) => Buffer.byteLength(JSON.stringify(value)) <= MAX_MESSAGE_BYTES;

/** Must run in a dedicated service cgroup; approval alone cannot stand in for kernel limits. */
export async function verifyLayaCgroup(approval: LayaApproval): Promise<void> {
  if (process.platform !== 'linux') throw new Error('LAYA_LINUX_CGROUP_REQUIRED');
  const membership = await readFile('/proc/self/cgroup', 'utf8');
  const path = membership.split('\n').find(line => line.startsWith('0::'))?.slice(3);
  if (!path || path === '/') throw new Error('LAYA_DEDICATED_CGROUP_REQUIRED');
  const root = '/sys/fs/cgroup';
  const group = resolve(root, '.' + path);
  if (!group.startsWith(root + sep)) throw new Error('LAYA_INVALID_CGROUP');
  const [cpu, memory] = await Promise.all([readFile(resolve(group, 'cpu.max'), 'utf8'), readFile(resolve(group, 'memory.max'), 'utf8')]);
  if (cpu.trim() !== approval.isolation.cpuMax || !/^\d+$/.test(memory.trim()) || Number(memory.trim()) !== approval.isolation.memoryMaxBytes) throw new Error('LAYA_CGROUP_LIMIT_MISMATCH');
}

/** One persistent Node child, one outstanding inference, no respawn or provider fallback. */
export class LayaChildWorker implements LayaWorker {
  private child: ChildProcess | undefined;
  private failure: ((error: Error) => void) | undefined;
  private ready: Pending<void> | undefined;
  private inference: (Pending<LayaAdvice> & {id: number}) | undefined;
  private sequence = 0;
  private started = false;
  private stopped = false;
  constructor(private readonly options: {
    /** Trusted OS adapter seam for synthetic tests; default checks the real service cgroup. */
    verifyIsolation?: (approval: LayaApproval) => Promise<void>;
  } = {}) {}
  onFailure(callback: (error: Error) => void) {this.failure = callback;}
  async start(approval: LayaApproval): Promise<void> {
    validateLayaApproval(approval);
    if (this.started || this.stopped) throw new Error('LAYA_CHILD_SINGLE_USE');
    this.started = true;
    await (this.options.verifyIsolation ?? verifyLayaCgroup)(approval);
    if (this.stopped) throw new Error('WORKER_STOPPED');
    const workerEntry = import.meta.url.endsWith('.ts') ? new URL('../../../infra/laya/laya-worker.mjs', import.meta.url) :
      new URL('./laya-worker.mjs', import.meta.url);
    // fork forwards spawn options; Node 22's ForkOptions omits windowsHide in its
    // declarations even though the underlying spawn honors it.
    const forkOptions: ForkOptions & {windowsHide: boolean} = {
      execArgv: [], windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'json',
      env: {NODE_ENV: 'production', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1',
        TOKENIZERS_PARALLELISM: 'false', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', LAYA_ENABLED: 'true'},
    };
    const child = fork(workerEntry, [], forkOptions);
    this.child = child;
    child.on('message', message => this.receive(message));
    child.on('error', () => this.fail(new Error('WORKER_TRANSPORT_ERROR')));
    child.on('exit', () => {if (!this.stopped) this.fail(new Error('WORKER_EXIT'));});
    const promise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('MODEL_START_TIMEOUT')), 45_000);
      timer.unref();
      this.ready = {resolve, reject, timer};
    });
    this.send({type: 'init', manifest: approval.manifest});
    return promise;
  }
  async run(job: LayaJob): Promise<LayaAdvice> {
    if (!this.child || this.stopped || this.ready) throw new Error('WORKER_NOT_READY');
    if (this.inference) throw new Error('WORKER_BUSY');
    if (typeof job.text !== 'string' || Buffer.byteLength(job.text) > 16_384) throw new Error('MESSAGE_TOO_LARGE');
    const id = ++this.sequence;
    const message = {type: 'run', id, text: job.text, modelRevision: job.modelRevision, configVersion: job.configVersion};
    if (!bounded(message)) throw new Error('MESSAGE_TOO_LARGE');
    const promise = new Promise<LayaAdvice>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('EXECUTION_TIMEOUT')), 20_000);
      timer.unref();
      this.inference = {id, resolve, reject, timer};
    });
    this.send(message);
    return promise;
  }
  private send(message: unknown) {
    if (!bounded(message)) {this.fail(new Error('MESSAGE_TOO_LARGE')); return;}
    try {
      if (!this.child?.connected || !this.child.send(message as object, error => {if (error) this.fail(new Error('WORKER_TRANSPORT_ERROR'));})) {
        this.fail(new Error('WORKER_BACKPRESSURE'));
      }
    } catch {this.fail(new Error('WORKER_TRANSPORT_ERROR'));}
  }
  private receive(message: unknown) {
    if (this.stopped) return;
    if (!message || typeof message !== 'object' || !bounded(message)) {this.fail(new Error('INVALID_WORKER_MESSAGE')); return;}
    const value = message as Record<string, unknown>;
    if (value.type === 'ready' && this.ready) {
      const ready = this.ready; this.ready = undefined;
      clearTimeout(ready.timer); ready.resolve(); return;
    }
    if (value.type === 'error' && typeof value.code === 'string' && /^[A-Z_]{1,64}$/.test(value.code)) {
      this.fail(new Error(value.code)); return;
    }
    const pending = this.inference;
    if (value.type !== 'result' || !pending || pending.id !== value.id || !value.advice || typeof value.advice !== 'object') {
      this.fail(new Error('INVALID_WORKER_MESSAGE')); return;
    }
    this.inference = undefined;
    clearTimeout(pending.timer);
    pending.resolve(value.advice as LayaAdvice);
  }
  private fail(error: Error) {
    if (this.stopped) return;
    const callback = this.failure;
    this.shutdown(error);
    callback?.(error);
  }
  stop() {this.shutdown(new Error('WORKER_STOPPED'));}
  private shutdown(error: Error) {
    if (this.stopped) return;
    this.stopped = true;
    if (this.ready) {clearTimeout(this.ready.timer); this.ready.reject(error); this.ready = undefined;}
    if (this.inference) {clearTimeout(this.inference.timer); this.inference.reject(error); this.inference = undefined;}
    const child = this.child;
    this.child = undefined;
    if (child) {
      // No grace period for revoked data or runaway native inference. The cgroup also kills descendants.
      try {child.kill('SIGKILL');} catch { /* Already exited. */ }
      try {if (child.connected) child.disconnect();} catch { /* Already disconnected. */ }
    }
  }
}
