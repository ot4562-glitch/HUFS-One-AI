// Explicit operator entry. Build owned modules with laya-build.mjs before an approved ON.
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {chmod, lstat, readFile, realpath, unlink} from 'node:fs/promises';
import {dirname, isAbsolute, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const MAX_BYTES = 64 * 1024;
async function secureFile(path, maxBytes) {
  if (typeof path !== 'string' || !isAbsolute(path) || await realpath(path) !== path) throw Error('INVALID_CONFIG_PATH');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > maxBytes || (info.mode & 0o022) ||
      (typeof process.getuid === 'function' && info.uid !== process.getuid())) throw Error('INSECURE_CONFIG_FILE');
  return info;
}
async function authorityDriver(pin) {
  if (!pin || !/^[a-f0-9]{64}$/.test(pin.sha256)) throw Error('AUTHORITY_PIN_REQUIRED');
  await secureFile(pin.path, 1024 * 1024);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(pin.path)) hash.update(chunk);
  if (hash.digest('hex') !== pin.sha256) throw Error('AUTHORITY_HASH_MISMATCH');
  const imported = await import(pathToFileURL(pin.path).href);
  if (typeof imported.createLayaAuthority !== 'function') throw Error('AUTHORITY_DRIVER_REQUIRED');
  const authority = await imported.createLayaAuthority();
  if (typeof authority?.isCurrent !== 'function' || typeof authority.apiPressure !== 'function') throw Error('AUTHORITY_DRIVER_REQUIRED');
  return authority;
}
async function socketAvailable(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || Buffer.byteLength(path) > 100 || resolve(path) !== path) throw Error('INVALID_SOCKET_PATH');
  const parent = dirname(path);
  if (await realpath(parent) !== parent) throw Error('INSECURE_SOCKET_DIRECTORY');
  const info = await lstat(parent);
  if (!info.isDirectory() || (info.mode & 0o077) || (typeof process.getuid === 'function' && info.uid !== process.getuid())) throw Error('INSECURE_SOCKET_DIRECTORY');
  try {await lstat(path);} catch (error) {if (error.code === 'ENOENT') return; throw error;}
  throw Error('SOCKET_PATH_EXISTS');
}
const currentCgroup = async () => {
  const membership = await readFile('/proc/self/cgroup', 'utf8');
  const relative = membership.split('\n').find(line => line.startsWith('0::'))?.slice(3);
  if (!relative || relative === '/') throw Error('LAYA_DEDICATED_CGROUP_REQUIRED');
  return resolve('/sys/fs/cgroup', '.' + relative);
};

/** dependency injection is for in-process synthetic tests, never exposed by CLI/socket. */
export async function startLayaSupervisor({configPath, env = process.env, dependencies = {}} = {}) {
  if (env.LAYA_ENABLED !== 'true') return {status: () => ({state:'OFF', reason:'LAYA_OFF', fallback:'RULES'}), close: async () => {}};
  await secureFile(configPath, MAX_BYTES);
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  if (config.version !== 1 || config.enabled !== true) throw Error('ENABLED_CONFIG_REQUIRED');
  const runtimeDirectory = config.runtimeDirectory ?? fileURLToPath(new URL('../../dist/laya/',import.meta.url));
  if (!isAbsolute(runtimeDirectory) || await realpath(runtimeDirectory) !== resolve(runtimeDirectory)) throw Error('INVALID_BUILT_RUNTIME_PATH');
  const [{LayaScheduler,validateLayaApproval},{LayaChildWorker},{LayaPressureMonitor,readLayaPressure}] = await Promise.all([
    import(pathToFileURL(resolve(runtimeDirectory,'laya-scheduler.js')).href),
    import(pathToFileURL(resolve(runtimeDirectory,'laya-child-worker.js')).href),
    import(pathToFileURL(resolve(runtimeDirectory,'laya-pressure.js')).href),
  ]);
  validateLayaApproval(config.approval);
  await socketAvailable(config.socketPath); // Preserve stale/foreign files; never unlink on startup.
  const authority = await authorityDriver(config.authority);
  const scheduler = new LayaScheduler({createWorker: dependencies.createWorker ?? (() => new LayaChildWorker()),
    isCurrent: job => authority.isCurrent(job) === true});
  let previousCpu;
  const cgroupPath = dependencies.sample ? undefined : await currentCgroup();
  const sample = dependencies.sample ?? (async () => {
    let reading = await readLayaPressure({cgroupPath, api:await authority.apiPressure(), ...(previousCpu ? {previousCpu} : {})});
    previousCpu = reading.cpu;
    if (!reading.pressure) {
      await delay(100);
      reading = await readLayaPressure({cgroupPath, api:await authority.apiPressure(), previousCpu});
      previousCpu = reading.cpu;
    }
    if (!reading.pressure) throw Error('LAYA_TELEMETRY_UNAVAILABLE');
    return reading.pressure;
  });
  const monitor = new LayaPressureMonitor({sample, observe: pressure => scheduler.observe(pressure), off: reason => scheduler.stop(reason)});
  const clients = new Set();
  let server;
  let ownedSocket;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    monitor.stop(); scheduler.stop('SUPERVISOR_STOPPED');
    for (const client of clients) client.destroy();
    if (server?.listening) await new Promise(done => server.close(done));
    if (ownedSocket) {
      try {
        const current = await lstat(config.socketPath);
        if (current.isSocket() && current.dev === ownedSocket.dev && current.ino === ownedSocket.ino) await unlink(config.socketPath);
      } catch (error) {if (error.code !== 'ENOENT') throw error;}
    }
    await authority.close?.();
  };
  try {
    // Check real available memory/API baseline before any model startup, with a bounded observer.
    let initial;
    let initialFailure;
    const initialMonitor = new LayaPressureMonitor({sample, observe: pressure => {initial = pressure;}, off: reason => {initialFailure = reason;}});
    await initialMonitor.start(); initialMonitor.stop();
    if (initialFailure || !initial || ![initial.hostCpuPercent,initial.cpuPressureAvg10,initial.availableBytes,initial.workerRssBytes,
      initial.apiP95Ms,initial.apiBaselineP95Ms,initial.apiErrorRatio].every(value=>Number.isFinite(value)&&value>=0) ||
      initial.oom !== false || initial.cpuPressureAvg10 > 10 || initial.availableBytes <= 4 * 1024 ** 3 ||
      initial.workerRssBytes >= 2.5 * 1024 ** 3 || initial.hostCpuPercent >= 50 || initial.apiBaselineP95Ms <= 0 ||
      initial.apiP95Ms > initial.apiBaselineP95Ms * 1.1 || initial.apiErrorRatio >= 0.005) throw Error('LAYA_INITIAL_RESOURCE_GATE');
    // Observe cold-load/warm-up pressure as well as steady-state inference.
    await Promise.all([scheduler.start(config.approval),monitor.start()]);
    if (scheduler.status().state !== 'ON') throw Error('LAYA_RESOURCE_GATE');
    server = createServer(socket => {
      if (clients.size >= 24) {socket.destroy(); return;}
      clients.add(socket);
      socket.setTimeout(5_000, () => socket.destroy());
      socket.on('error', () => {});
      socket.on('close', () => clients.delete(socket));
      let buffer = Buffer.alloc(0);
      let handled = false;
      const reply = value => {
        const encoded = JSON.stringify(value) + '\n';
        socket.end(Buffer.byteLength(encoded) <= MAX_BYTES ? encoded : '{"error":"RESPONSE_TOO_LARGE"}\n');
      };
      socket.on('data', chunk => {
        if (handled) {socket.destroy(); return;}
        if (buffer.length + chunk.length > MAX_BYTES) {handled = true; reply({error:'MESSAGE_TOO_LARGE'}); return;}
        buffer = Buffer.concat([buffer, chunk]);
        const end = buffer.indexOf(10);
        if (end < 0) return;
        handled = true;
        socket.setTimeout(55_000);
        if (end !== buffer.length - 1) {reply({error:'ONE_REQUEST_PER_CONNECTION'}); return;}
        let request;
        try {request = JSON.parse(buffer.subarray(0,end).toString('utf8'));} catch {reply({error:'INVALID_JSON'}); return;}
        buffer = Buffer.alloc(0);
        try {
          if (request.operation === 'status') reply(scheduler.status());
          else if (request.operation === 'enqueue') {
            const handle = scheduler.enqueue(request.job);
            socket.on('close', () => handle.cancel());
            handle.result.then(reply, () => reply({error:'JOB_FAILED'}));
          } else if (request.operation === 'cancel' && typeof request.id === 'string' && request.id.length <= 64) {
            scheduler.cancel(request.id); reply({ok:true});
          } else if ((request.operation === 'revoke' || request.operation === 'invalidate') && typeof request.actorId === 'string' && request.actorId.length <= 256 &&
              (request.sourceId === undefined || typeof request.sourceId === 'string' && request.sourceId.length <= 256)) {
            if (request.operation === 'revoke') scheduler.revoke(request.actorId);
            else scheduler.invalidate(request.actorId, request.sourceId);
            reply({ok:true});
          } else reply({error:'INVALID_OPERATION'});
        } catch {reply({error:'INVALID_REQUEST'});}
      });
    });
    const originalMask = process.umask(0o077);
    try {
      await new Promise((done, reject) => {server.once('error',reject); server.listen(config.socketPath,done);});
    } finally {process.umask(originalMask);}
    ownedSocket = await lstat(config.socketPath);
    await chmod(config.socketPath,0o600);
    server.on('error', () => {void close();});
    return {status: () => scheduler.status(), close};
  } catch (error) {
    await close();
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--config')) {
    process.stderr.write('LAYA_INVALID_CLI\n'); process.exitCode = 1;
  } else {
    startLayaSupervisor({configPath:args[1]}).then(service => {
      process.stdout.write(JSON.stringify(service.status()) + '\n');
      let stopping = false;
      const shutdown = () => {if (stopping) return; stopping = true; service.close().then(() => process.exit(0), () => process.exit(1));};
      process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
    }).catch(() => {process.stderr.write('LAYA_STARTUP_BLOCKED\n'); process.exitCode = 1;});
  }
}
