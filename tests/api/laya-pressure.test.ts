import {afterEach, describe, expect, it, vi} from 'vitest';
import {LayaPressureMonitor, readLayaPressure} from '../../packages/ai/src/laya-pressure';
import type {LayaPressure} from '../../packages/ai/src/laya-scheduler';

afterEach(() => vi.useRealTimers());
describe('Laya pressure instrumentation', () => {
  it('resolves Linux metric paths identically on any host and stays inside the cgroup tree', async () => {
    const read=vi.fn(async(path:string)=>{
      const files:Record<string,string>={
        '/proc/stat':'cpu 1 0 1 8 0 0 0 0\n',
        '/proc/pressure/cpu':'some avg10=0.00 avg60=0.00 avg300=0.00 total=0\n',
        '/proc/meminfo':'MemAvailable: 1024 kB\n',
        '/sys/fs/cgroup/laya/memory.current':'0\n',
        '/sys/fs/cgroup/laya/memory.events':'oom 0\noom_kill 0\n',
      };
      if(!(path in files))throw Error('Unexpected metric path');
      return files[path]!;
    });
    const result=await readLayaPressure({cgroupPath:'/sys/fs/cgroup/worker/../laya/',read,
      api:{p95Ms:1,baselineP95Ms:1,errorRatio:0}});
    expect(result).toEqual({cpu:{total:10,idle:8}});
    expect(read.mock.calls.map(([path])=>path)).toEqual(['/proc/stat','/proc/pressure/cpu',
      '/proc/meminfo','/sys/fs/cgroup/laya/memory.current','/sys/fs/cgroup/laya/memory.events']);
  });
  it.each(['laya','C:\\sys\\fs\\cgroup\\laya','/sys/fs/cgroup','/sys/fs/cgroup/',
    '/sys/fs/cgroup-other/laya','/sys/fs/cgroup/../../etc',
    '/sys/fs/cgroup/laya\\..\\etc','/sys/fs/cgroup/laya\u0000',
    '/sys/fs/cgroup/laya\n'])('rejects an invalid metric path before any read: %j',async cgroupPath=>{
    const read=vi.fn(async()=> '');
    await expect(readLayaPressure({cgroupPath,read,
      api:{p95Ms:1,baselineP95Ms:1,errorRatio:0}})).rejects.toThrow('INVALID_CGROUP_METRICS_PATH');
    expect(read).not.toHaveBeenCalled();
  });
  it('combines independent API latency with CPU deltas, PSI, available RAM and cgroup OOM', async () => {
    const files: Record<string, string> = {
      '/proc/stat': 'cpu  50 0 30 900 20 0 0 0 0 0\n',
      '/proc/pressure/cpu': 'some avg10=12.30 avg60=3.00 avg300=0.00 total=123\n',
      '/proc/meminfo': 'MemAvailable:   5242880 kB\n',
      '/sys/fs/cgroup/laya/memory.current': '1073741824\n',
      '/sys/fs/cgroup/laya/memory.events': 'low 0\nhigh 0\nmax 0\noom 0\noom_kill 0\n',
    };
    const api = {p95Ms: 125, baselineP95Ms: 100, errorRatio: 0.002};
    const read = async (path: string) => {if (!(path in files)) throw Error('missing'); return files[path]!;};
    const first = await readLayaPressure({cgroupPath:'/sys/fs/cgroup/laya', read, api});
    expect(first.pressure).toBeUndefined(); // CPU needs an actual interval, not a fabricated zero.
    files['/proc/stat'] = 'cpu  80 0 50 950 20 0 0 0 0 0\n';
    const second = await readLayaPressure({cgroupPath:'/sys/fs/cgroup/laya', read, api, previousCpu:first.cpu});
    expect(second.pressure).toEqual({hostCpuPercent:50, cpuPressureAvg10:12.3, availableBytes:5368709120,
      workerRssBytes:1073741824, apiP95Ms:125, apiBaselineP95Ms:100, apiErrorRatio:0.002, oom:false});
    files['/sys/fs/cgroup/laya/memory.events'] = 'max 0\noom 1\noom_kill 1\n';
    files['/proc/stat'] = 'cpu  90 0 50 960 20 0 0 0 0 0\n';
    expect((await readLayaPressure({cgroupPath:'/sys/fs/cgroup/laya', read, api, previousCpu:second.cpu})).pressure?.oom).toBe(true);
  });
  it('fails closed on absent or malformed host/API telemetry', async () => {
    await expect(readLayaPressure({cgroupPath:'/sys/fs/cgroup/laya', read:async () => '',
      api:{p95Ms:100, baselineP95Ms:100, errorRatio:0}})).rejects.toThrow();
  });
  it('stops on observer failure and never restarts its own scheduler', async () => {
    vi.useFakeTimers();
    let reads = 0;
    const events: string[] = [];
    const monitor = new LayaPressureMonitor({sample: async () => {reads++; throw Error('observer unavailable');},
      observe: () => {events.push('observed');}, off: reason => {events.push(reason);}});
    await monitor.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reads).toBe(1);
    expect(events).toEqual(['LAYA_TELEMETRY_UNAVAILABLE']);
  });
  it('bounds a hung observer and never overlaps samples', async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    let reads = 0;
    const monitor = new LayaPressureMonitor({sample: async () => {reads++; return new Promise<LayaPressure>(() => {});},
      observe: () => {events.push('observed');}, off: reason => {events.push(reason);}});
    const start = monitor.start();
    await vi.advanceTimersByTimeAsync(5000);
    await start;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reads).toBe(1);
    expect(events).toEqual(['LAYA_TELEMETRY_UNAVAILABLE']);
  });
});
