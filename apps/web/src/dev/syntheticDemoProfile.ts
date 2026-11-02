import {HufsApiError} from '../integrations/api-client.js';
import {BLANK_PROFILE, DemoProfileValueSchema, type DemoProfilePort, type DemoProfileRecord} from '../features/profile/demoProfile.js';

/**
 * Dev-only stand-in for the #132 blank demo account API: one in-memory fictitious account that starts
 * BLANK, compare-and-set saves (409 on a stale version), reset back to BLANK. No S01–S05, team or
 * REVIEWER data is touched. Never reached from a production build.
 */
export function syntheticDemoProfilePort(options: {delayMs?: number; now?: () => Date} = {}): DemoProfilePort & {readonly current: DemoProfileRecord} {
  const delay = options.delayMs ?? 150;
  const now = options.now ?? (() => new Date('2026-11-20T00:00:00.000Z'));
  let record: DemoProfileRecord = {version: 1, value: BLANK_PROFILE, updatedAt: now().toISOString()};
  const wait = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, delay);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, {once: true});
  });
  const next = (value: DemoProfileRecord['value']) => { record = {version: record.version + 1, value, updatedAt: now().toISOString()}; return record; };
  return {
    get current() { return record; },
    async get(signal) { await wait(signal); return record; },
    async save(expectedVersion, value, signal) {
      await wait(signal);
      if (expectedVersion !== record.version) throw new HufsApiError('VERSION_CONFLICT', 409);
      const parsed = DemoProfileValueSchema.safeParse(value);
      if (!parsed.success) throw new HufsApiError('INVALID_INPUT', 422);
      return next(parsed.data);
    },
    async reset(expectedVersion, signal) {
      await wait(signal);
      if (expectedVersion !== record.version) throw new HufsApiError('VERSION_CONFLICT', 409);
      return next(BLANK_PROFILE);
    },
  };
}
