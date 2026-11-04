// Dedicated IPC child. Never run as an HTTP handler or standalone daemon.
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat, realpath} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';

const MAX_MESSAGE = 64 * 1024;
let state = 'NEW';
let manifest;
let driver;
let session;
let ort;
let watchdog;
let lastId = 0;
const fail = code => {
  state = 'STOPPED';
  if (watchdog) clearTimeout(watchdog);
  // Error codes only: do not return native error messages, paths, tensors or source text.
  if (process.connected) process.send({type: 'error', code}, () => process.exit(1));
  setTimeout(() => process.exit(1), 50).unref();
};
const send = value => {
  if (!process.connected || Buffer.byteLength(JSON.stringify(value)) > MAX_MESSAGE || !process.send(value)) fail('IPC_BACKPRESSURE');
};
const validNames = names => Array.isArray(names) && names.length > 0 && names.length <= 128 &&
  names.every(name => typeof name === 'string' && name.length > 0 && name.length <= 256) && new Set(names).size === names.length;
async function verify(pin) {
  if (!pin || !isAbsolute(pin.path) || !/^[a-f0-9]{64}$/.test(pin.sha256)) throw Error('INVALID_ARTIFACT');
  const file = await lstat(pin.path);
  if (!file.isFile() || file.isSymbolicLink() || file.size <= 0 || file.size > 3 * 1024 ** 3 || await realpath(pin.path) !== pin.path) throw Error('INVALID_ARTIFACT');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(pin.path)) hash.update(chunk);
  if (hash.digest('hex') !== pin.sha256) throw Error('ARTIFACT_HASH_MISMATCH');
}
async function initialize(value) {
  if (state !== 'NEW' || process.env.LAYA_ENABLED !== 'true') throw Error('INIT_DENIED');
  state = 'STARTING';
  watchdog = setTimeout(() => fail('MODEL_START_TIMEOUT'), 45_000);
  manifest = value;
  if (!manifest || !validNames(manifest.labels) || !validNames(manifest.inputNames) || !validNames(manifest.outputNames) ||
      typeof manifest.modelRevision !== 'string' || typeof manifest.configVersion !== 'string' || !Array.isArray(manifest.artifacts) || manifest.artifacts.length > 128) throw Error('INVALID_MANIFEST');
  const pins = [manifest.model, manifest.runtime, manifest.driver, ...manifest.artifacts];
  if (new Set(pins.map(pin => pin.path)).size !== pins.length) throw Error('INVALID_MANIFEST');
  // Verify every artifact before any executable runtime/driver import or model loading.
  for (const pin of pins) await verify(pin);
  const importedRuntime = await import(pathToFileURL(manifest.runtime.path).href);
  ort = importedRuntime.default ?? importedRuntime;
  const importedDriver = await import(pathToFileURL(manifest.driver.path).href);
  if (typeof importedDriver.createLayaDriver !== 'function' || typeof ort.InferenceSession?.create !== 'function') throw Error('INVALID_RUNTIME_DRIVER');
  driver = await importedDriver.createLayaDriver({artifacts: manifest.artifacts, labels: manifest.labels});
  if (['tokenize', 'createFeeds', 'decode'].some(method => typeof driver?.[method] !== 'function')) throw Error('INVALID_RUNTIME_DRIVER');
  // Model shape, tokenizer and label mapping belong to the separately validated driver manifest.
  // No assumed transformer tensor names, language labels, model downloads or provider fallback.
  session = await ort.InferenceSession.create(manifest.model.path, {
    executionProviders: ['cpu'], executionMode: 'sequential', intraOpNumThreads: 1, interOpNumThreads: 1,
    extra: {session: {intra_op: {allow_spinning: '0'}, inter_op: {allow_spinning: '0'}}},
  });
  if (JSON.stringify(session.inputNames) !== JSON.stringify(manifest.inputNames) ||
      JSON.stringify(session.outputNames) !== JSON.stringify(manifest.outputNames)) throw Error('MODEL_SHAPE_MISMATCH');
  clearTimeout(watchdog);
  state = 'READY';
  send({type: 'ready'});
}
async function run(message) {
  if (state !== 'READY' || !Number.isSafeInteger(message.id) || message.id <= lastId || typeof message.text !== 'string' ||
      !message.text.length || Buffer.byteLength(message.text) > 16_384 || message.modelRevision !== manifest.modelRevision ||
      message.configVersion !== manifest.configVersion) throw Error('INVALID_JOB');
  state = 'BUSY';
  lastId = message.id;
  watchdog = setTimeout(() => fail('EXECUTION_TIMEOUT'), 20_000);
  const tokens = await driver.tokenize(message.text);
  if (!tokens || !Array.isArray(tokens.inputIds) || !tokens.inputIds.length || tokens.inputIds.length > 512 ||
      !tokens.inputIds.every(token => Number.isSafeInteger(token) && token >= 0)) throw Error('TOKEN_LIMIT');
  const tokenCount = tokens.inputIds.length; // Includes model special tokens; no substring/word-count approximation.
  const feeds = await driver.createFeeds(tokens, ort);
  if (!feeds || JSON.stringify(Object.keys(feeds).sort()) !== JSON.stringify([...manifest.inputNames].sort())) throw Error('INPUT_SHAPE_MISMATCH');
  const outputs = await session.run(feeds);
  const advice = await driver.decode(outputs);
  if (!advice || !manifest.labels.includes(advice.label) || !Number.isFinite(advice.score) || advice.score < 0 || advice.score > 1) throw Error('INVALID_OUTPUT');
  clearTimeout(watchdog);
  state = 'READY';
  send({type: 'result', id: message.id, advice: {label: advice.label, score: advice.score, tokenCount}});
}
if (typeof process.send !== 'function') process.exit(1);
process.on('message', message => {
  if (!message || typeof message !== 'object' || Buffer.byteLength(JSON.stringify(message)) > MAX_MESSAGE) return fail('INVALID_MESSAGE');
  const work = message.type === 'init' ? initialize(message.manifest) : message.type === 'run' ? run(message) : Promise.reject(Error('INVALID_MESSAGE'));
  work.catch(error => {
    const safe = new Set(['INIT_DENIED','INVALID_ARTIFACT','ARTIFACT_HASH_MISMATCH','INVALID_MANIFEST','INVALID_RUNTIME_DRIVER',
      'MODEL_SHAPE_MISMATCH','INVALID_JOB','TOKEN_LIMIT','INPUT_SHAPE_MISMATCH','INVALID_OUTPUT','INVALID_MESSAGE']);
    fail(safe.has(error?.message) ? error.message : 'RUNTIME_FAILED');
  });
});
process.on('disconnect', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
process.on('uncaughtException', () => fail('WORKER_FAILED'));
process.on('unhandledRejection', () => fail('WORKER_FAILED'));
