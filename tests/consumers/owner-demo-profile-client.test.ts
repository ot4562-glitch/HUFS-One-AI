import {describe, expect, it} from 'vitest';
import {blankDemoProfileValue, type DemoProfileValue} from '@hufs-one/contracts';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {recomputeDemoProfile} from '../../apps/api/src/modules/profiles/demo-profile.js';

const at = '2026-11-03T00:00:00.000Z';
const csrfToken = 'C'.repeat(32);
const value: DemoProfileValue = {
  primaryMajor: '가상 정보학', earnedCreditUnits: 0,
  interestTopics: ['AI_ML'], doubleMajor: {kind: 'NONE'},
};
const response = (version: number, v: DemoProfileValue = value) =>
  recomputeDemoProfile({version, value: v, updatedAt: version === 0 ? null : at});
const json = (body: unknown) => new Response(JSON.stringify(body), {
  headers: {'content-type': 'application/json'},
});
function fixture(reply: unknown) {
  const calls: Array<{url: string; init: RequestInit}> = [];
  const client = new HufsApiClient(async (url, init) => {
    calls.push({url, init});
    return json(url === '/api/auth/csrf' ? {csrfToken} : reply);
  });
  return {client, calls};
}

describe('#132 owner EMPTY_DEMO browser↔typed API boundary', () => {
  it('reads only independent EMPTY_DEMO and forwards AbortSignal without leaking actor identities', async () => {
    const p = response(1), h = fixture(p);
    const signal = new AbortController().signal;
    expect(await h.client.owner.readDemoProfile(signal)).toEqual(p);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({url: '/api/demo-profile', init: {
      method: 'GET', signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    }});
    expect(JSON.stringify(h.calls[0])).not.toMatch(/S01|actorId|accountId/);
  });
  it('saves zero credits (not UNKNOWN) with CSRF, version CAS and exact value receipt', async () => {
    const h = fixture(response(2));
    expect(await h.client.owner.saveDemoProfile({expectedVersion: 1, value})).toEqual(response(2));
    expect(h.calls.map(call => call.url)).toEqual(['/api/auth/csrf', '/api/demo-profile']);
    expect(h.calls[1]!.init).toMatchObject({
      method: 'PATCH', cache: 'no-store', credentials: 'same-origin',
      body: JSON.stringify({expectedVersion: 1, value}),
      headers: {'x-csrf-token': csrfToken},
    });
    const wrong = fixture(response(3));
    await expect(wrong.client.owner.saveDemoProfile({expectedVersion: 1, value}))
      .rejects.toMatchObject({code: 'VERSION_CONFLICT'});
    const switched = fixture(response(2, {...value, primaryMajor: 'OTHER'}));
    await expect(switched.client.owner.saveDemoProfile({expectedVersion: 1, value}))
      .rejects.toMatchObject({code: 'VERSION_CONFLICT'});
  });
  it('resets all four fields with a CSRF-bound CAS receipt; stale/forged response fails closed', async () => {
    const blank = blankDemoProfileValue(), h = fixture(response(3, blank));
    expect(await h.client.owner.resetDemoProfile({expectedVersion: 2})).toEqual(response(3, blank));
    expect(h.calls.map(x => x.url)).toEqual(['/api/auth/csrf', '/api/demo-profile/reset']);
    expect(h.calls[1]!.init).toMatchObject({method: 'POST', body: '{"expectedVersion":2}'});
    for (const bad of [response(2, blank), response(3, value)]) {
      await expect(fixture(bad).client.owner.resetDemoProfile({expectedVersion: 2}))
        .rejects.toMatchObject({code: 'VERSION_CONFLICT'});
    }
  });
  it('never treats invalid original-account payloads or untrusted 200 response as valid', async () => {
    const h = fixture(response(1));
    await expect(h.client.owner.saveDemoProfile({expectedVersion: 0, value: {
      ...value, earnedCreditUnits: null,
    }} as never)).rejects.toMatchObject({code: 'INVALID_INPUT'});
    await expect(h.client.owner.resetDemoProfile({expectedVersion: -1}))
      .rejects.toMatchObject({code: 'INVALID_INPUT'});
    expect(h.calls).toHaveLength(0);
    await expect(fixture({...response(1),snapshot: {
      ...response(1).snapshot,namespace: 'S01',
    }}).client.owner.readDemoProfile()).rejects.toMatchObject({code: 'PROVIDER_UNAVAILABLE'});
    await expect(fixture({...response(1),profile: {
      ...response(1).profile,value: {...value, actorId: 'FORGED'},
    }}).client.owner.readDemoProfile()).rejects.toMatchObject({code: 'PROVIDER_UNAVAILABLE'});
  });
});
