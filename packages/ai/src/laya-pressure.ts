import {readFile} from 'node:fs/promises';
import {posix} from 'node:path';
import type {LayaPressure} from './laya-scheduler';

export interface LayaCpuSnapshot {total: number; idle: number}
export interface LayaApiPressure {p95Ms: number; baselineP95Ms: number; errorRatio: number}

/** Reads only named Linux/cgroup metrics, never request/source content or credentials. */
export async function readLayaPressure(options: {
  cgroupPath: string;
  api: LayaApiPressure;
  previousCpu?: LayaCpuSnapshot;
  read?: (path: string) => Promise<string>;
}): Promise<{cpu: LayaCpuSnapshot; pressure?: LayaPressure}> {
  const read = options.read ?? (path => readFile(path, 'utf8'));
  // These are Linux kernel paths even when an offline injected reader runs on
  // Windows. Host drive letters/separators must never rewrite metric names.
  const group = posix.resolve(options.cgroupPath);
  if (!posix.isAbsolute(options.cgroupPath) || /[\\\x00-\x1f\x7f]/.test(options.cgroupPath) ||
    !group.startsWith('/sys/fs/cgroup/')) throw new Error('INVALID_CGROUP_METRICS_PATH');
  if (![options.api.p95Ms, options.api.baselineP95Ms, options.api.errorRatio].every(Number.isFinite) ||
    options.api.p95Ms < 0 || options.api.baselineP95Ms <= 0 || options.api.errorRatio < 0 || options.api.errorRatio > 1) throw new Error('INVALID_API_METRICS');
  const [stat, pressure, memory, rss, events] = await Promise.all([
    read('/proc/stat'), read('/proc/pressure/cpu'), read('/proc/meminfo'),
    read(posix.join(group, 'memory.current')), read(posix.join(group, 'memory.events')),
  ]);
  const match = /^cpu\s+([^\n]+)$/m.exec(stat);
  const values = match?.[1]?.trim().split(/\s+/).map(Number);
  const psiMatch = /^some .*?avg10=([\d.]+)/m.exec(pressure);
  const availableMatch = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(memory);
  const oomMatch = /^oom\s+(\d+)$/m.exec(events);
  const killMatch = /^oom_kill\s+(\d+)$/m.exec(events);
  if (!values || values.length < 8 || !values.every(value => Number.isSafeInteger(value) && value >= 0) ||
    !psiMatch?.[1] || !availableMatch?.[1] || !/^\d+\s*$/.test(rss) || !oomMatch?.[1] || !killMatch?.[1]) throw new Error('INVALID_HOST_METRICS');
  // guest/guest_nice are already included in user/nice; do not double-count them.
  const cpu = {total: values.slice(0, 8).reduce((total, value) => total + value, 0), idle: values[3]! + values[4]!};
  const previous = options.previousCpu;
  if (!previous) return {cpu};
  const elapsed = cpu.total - previous.total;
  const idle = cpu.idle - previous.idle;
  if (elapsed <= 0 || idle < 0 || idle > elapsed) throw new Error('INVALID_CPU_DELTA');
  const result: LayaPressure = {
    hostCpuPercent: (1 - idle / elapsed) * 100,
    cpuPressureAvg10: Number(psiMatch[1]), availableBytes: Number(availableMatch[1]) * 1024,
    workerRssBytes: Number(rss.trim()), apiP95Ms: options.api.p95Ms, apiBaselineP95Ms: options.api.baselineP95Ms,
    apiErrorRatio: options.api.errorRatio, oom: Number(oomMatch[1]) > 0 || Number(killMatch[1]) > 0,
  };
  if (![result.hostCpuPercent, result.cpuPressureAvg10, result.availableBytes, result.workerRssBytes].every(Number.isFinite) || result.cpuPressureAvg10 > 100) throw new Error('INVALID_HOST_METRICS');
  return {cpu, pressure: result};
}

/** Explicitly started observer; failure/timeout latches OFF and never restarts workers. */
export class LayaPressureMonitor {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private epoch = 0;
  private running = false;
  constructor(private readonly options: {
    sample(): Promise<LayaPressure | undefined>;
    observe(sample: LayaPressure): void;
    off(reason: string): void;
  }) {}
  async start(): Promise<void> {
    if (this.running) throw new Error('LAYA_MONITOR_ALREADY_RUNNING');
    this.running = true;
    const epoch = ++this.epoch;
    await this.poll(epoch);
  }
  stop() {
    this.running = false;
    this.epoch++;
    if (this.timer) clearTimeout(this.timer);
    if (this.deadline) clearTimeout(this.deadline);
    this.timer = undefined; this.deadline = undefined;
  }
  private async poll(epoch: number): Promise<void> {
    if (!this.running || this.epoch !== epoch) return;
    try {
      const deadline = new Promise<never>((_, reject) => {
        this.deadline = setTimeout(() => reject(new Error('TELEMETRY_TIMEOUT')), 5_000);
        this.deadline.unref?.();
      });
      const sample = await Promise.race([this.options.sample(), deadline]);
      if (this.epoch !== epoch || !this.running) return;
      if (this.deadline) clearTimeout(this.deadline);
      this.deadline = undefined;
      if (sample) this.options.observe(sample);
      this.timer = setTimeout(() => {void this.poll(epoch);}, 10_000);
      this.timer.unref?.();
    } catch {
      if (this.epoch !== epoch) return;
      this.stop();
      this.options.off('LAYA_TELEMETRY_UNAVAILABLE');
    }
  }
}
