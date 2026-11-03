import {afterEach, describe, expect, it} from 'vitest';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {LayaChildWorker} from '../../packages/ai/src/laya-child-worker';
import type {LayaApproval, LayaJob} from '../../packages/ai/src/laya-scheduler';

const dirs: string[] = [];
const workers: LayaChildWorker[] = [];
afterEach(async () => {
  for (const worker of workers.splice(0)) worker.stop();
  for (const dir of dirs.splice(0)) await rm(dir, {recursive: true, force: true});
});
async function fixture(tokenCount = 4, runtimeBody?: string) {
  const dir = await mkdtemp(join(tmpdir(), 'hufs-laya-synthetic-'));
  dirs.push(dir);
  const loaded = join(dir, 'runtime-imported');
  const modelLoaded = join(dir, 'session-created');
  const runtime = runtimeBody ?? `
    import {writeFile} from 'node:fs/promises';
    await writeFile(${JSON.stringify(loaded)}, 'yes');
    export const InferenceSession = {create: async (_model, options) => {
      if(options.intraOpNumThreads !== 1 || options.interOpNumThreads !== 1 || options.executionMode !== 'sequential' ||
        options.extra.session.intra_op.allow_spinning !== '0' || options.extra.session.inter_op.allow_spinning !== '0') throw Error('UNSAFE_THREADS');
      await writeFile(${JSON.stringify(modelLoaded)}, 'yes');
      return {inputNames:['input_ids'], outputNames:['scores'], run: async feeds => {
        if (feeds.input_ids === 'crash') process.exit(7);
        return {scores: [0.7]};
      }, release: async () => {}};
    }};
  `;
  const sources = {
    model: 'SYNTHETIC-NOT-A-MODEL', runtime,
    driver: `export async function createLayaDriver() {return {
      tokenize: text => ({inputIds: Array.from({length:${tokenCount}}, () => 1), text}),
      createFeeds: tokens => ({input_ids: tokens.text}),
      decode: output => ({label:'review', score:output.scores[0]})
    };}`,
  };
  const pins = {} as Record<keyof typeof sources, {path: string; sha256: string}>;
  for (const name of ['model', 'runtime', 'driver'] as const) {
    const path = join(dir, `${name}.mjs`);
    await writeFile(path, sources[name]);
    pins[name] = {path, sha256: createHash('sha256').update(sources[name]).digest('hex')};
  }
  const approval: LayaApproval = {
    enabled: true, operatorApprovalId: 'synthetic-local-test', approvedAt: '2026-11-03T00:00:00.000Z',
    isolation: {cgroupV2:true, cpuMax:'100000 100000', memoryMaxBytes:3 * 1024 ** 3, networkDenied:true, separateFromApi:true},
    manifest: {...pins, artifacts: [], modelRevision:'synthetic-model-1', configVersion:'synthetic-config-1',
      labels:['review'], inputNames:['input_ids'], outputNames:['scores']},
  };
  // The synthetic child is not a real approved NCP model and does not assert host resource evidence.
  const worker = new LayaChildWorker({verifyIsolation: async () => {}});
  workers.push(worker);
  return {worker, approval, loaded, modelLoaded};
}
const job: LayaJob = {origin:'INGEST', actorId:'synthetic-actor', sourceId:'synthetic-source', sourceRevision:'revision-1',
  modelRevision:'synthetic-model-1', configVersion:'synthetic-config-1', permissionRevision:'grant-1', asOf:'2026-11-03T00:00:00.000Z', text:'synthetic text'};

describe('Laya real child IPC with synthetic runtime only', () => {
  it('hashes model/runtime/driver before imports and returns bounded tokenizer-counted advice', async () => {
    const {worker, approval, modelLoaded} = await fixture();
    await worker.start(approval);
    expect(await worker.run(job)).toEqual({label:'review', score:0.7, tokenCount:4});
    expect(await readFile(modelLoaded, 'utf8')).toBe('yes');
  });
  it('refuses a corrupted model before importing runtime or creating any session', async () => {
    const {worker, approval, loaded} = await fixture();
    await writeFile(approval.manifest.model.path, 'corrupted synthetic bytes');
    await expect(worker.start(approval)).rejects.toThrow('ARTIFACT_HASH_MISMATCH');
    await expect(readFile(loaded)).rejects.toMatchObject({code:'ENOENT'});
  });
  it('rejects tokenizer output above 512 rather than inferring or truncating it', async () => {
    const {worker, approval} = await fixture(513);
    await worker.start(approval);
    await expect(worker.run(job)).rejects.toThrow('TOKEN_LIMIT');
  });
  it('fails pending inference on unexpected child exit', async () => {
    const {worker, approval} = await fixture();
    await worker.start(approval);
    await expect(worker.run({...job, text:'crash'})).rejects.toThrow('WORKER_EXIT');
    await expect(worker.run(job)).rejects.toThrow();
  });
  it('rejects oversized input at the parent boundary without leaking source text in errors', async () => {
    const {worker, approval} = await fixture();
    await worker.start(approval);
    await expect(worker.run({...job, text:'secret'.repeat(10_000)})).rejects.toThrow('MESSAGE_TOO_LARGE');
  });
});
