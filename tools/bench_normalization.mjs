#!/usr/bin/env node
// #201 reproducible normalization benchmark runner (SYNTHETIC data only, no network/NCP).
// Usage: npm run bench:normalization -- [--seed 201] [--sizes 1000,5000,15000] [--warmup 2] [--repetitions 5] [--out file.json]
// Exit 1 when any stage output differs across repetitions or input order: such timings are not comparable.
// Timings are one machine's trend signal, never a production p95; do not gate CI on them.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {parseArgs} from 'node:util';

const moduleUrl = new URL('../dist/bench/packages/core/src/normalization/benchmark.js', import.meta.url);
const {measureNormalization, NORMALIZATION_BENCHMARK_AS_OF, NORMALIZATION_BENCHMARK_VERSION, NORMALIZATION_STAGES} = await import(moduleUrl.href);

const {values} = parseArgs({options:{
  seed:{type:'string', default:'201'}, sizes:{type:'string', default:'1000,5000,15000'},
  warmup:{type:'string', default:'2'}, repetitions:{type:'string', default:'5'}, out:{type:'string'},
}});
const int = (name, raw) => {
  if (!/^\d+$/u.test(raw)) throw new RangeError(`--${name} must be a non-negative integer`);
  return Number(raw);
};
const seed = int('seed', values.seed);
const sizes = values.sizes.split(',').map(s => int('sizes', s.trim()));
const warmup = int('warmup', values.warmup);
const repetitions = int('repetitions', values.repetitions);

const git = args => { try { return execFileSync('git', args, {encoding:'utf8', stdio:['ignore', 'pipe', 'ignore']}).trim(); } catch { return undefined; } };
const commit = git(['rev-parse', 'HEAD']) ?? 'UNKNOWN';
const dirty = git(['status', '--porcelain', '--untracked-files=no']);
const sha256 = text => createHash('sha256').update(text).digest('hex');
const cpu = os.cpus()[0];

let peakRss = process.memoryUsage().rss;
const results = [];
for (const size of sizes) {
  globalThis.gc?.();
  const r = measureNormalization({seed, size, warmup, repetitions, now:() => performance.now(), digest:sha256});
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  results.push({
    size, inputDigest:r.inputDigest, shape:r.shape,
    stages:Object.fromEntries(NORMALIZATION_STAGES.map(s => [s, r.stages[s]])),
  });
}

const failures = results.flatMap(r => NORMALIZATION_STAGES
  .filter(s => !r.stages[s].stableAcrossRepetitions || !r.stages[s].orderInvariant)
  .map(s => `${r.size}:${s}`));

const report = {
  benchmark:NORMALIZATION_BENCHMARK_VERSION,
  dataMode:'SYNTHETIC',
  commit, workingTreeDirty:dirty === undefined ? 'UNKNOWN' : dirty.length > 0,
  config:{seed, sizes, warmup, repetitions, asOf:NORMALIZATION_BENCHMARK_AS_OF},
  environment:{node:process.version, platform:process.platform, arch:process.arch, cpuModel:cpu?.model ?? 'UNKNOWN', logicalCpus:os.cpus().length, totalMemoryBytes:os.totalmem()},
  peakRssBytes:peakRss,
  status:failures.length ? 'FAIL_OUTPUT_MISMATCH' : 'PASS',
  failures,
  results,
  limits:'Single-process wall-clock on this machine only; not a production p95 or NCP measurement (#22). Compare runs only with equal inputDigest/outputDigest and environment.',
};

const text = `${JSON.stringify(report, null, 2)}\n`;
if (values.out) writeFileSync(values.out, text);
process.stdout.write(text);
process.exitCode = failures.length ? 1 : 0;
