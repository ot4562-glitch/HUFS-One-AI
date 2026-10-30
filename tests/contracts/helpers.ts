import {readFileSync} from 'node:fs';

/** Repository-owned fixtures are intentionally synthetic only; never point this at csv/ or local_only/. */
export function fixture<T = unknown>(path:string):T {
  if (!/^(synthetic|negative)\/[a-z0-9-]+\.json$/.test(path)) throw new Error('Fixture scope denied');
  return JSON.parse(readFileSync(new URL('../../packages/fixtures/'+path, import.meta.url),'utf8')) as T;
}
