import {describe, expect, it, vi} from 'vitest';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {syntheticExperienceSkillPort} from '../../apps/web/src/dev/syntheticExperienceSkills.js';
import {ExperienceReviewPageSchema} from '../../apps/web/src/features/experience/skillReviewView.js';
import {ownerExperienceSkillPort} from '../../apps/web/src/features/experience/ownerExperiencePort.js';

const at = '2026-11-06T00:00:00.000Z';
const expiresAt = '2026-11-07T00:00:00.000Z';
const csrfToken = 'C'.repeat(32);
const id = 'SYN-EXP-01';
const jobId = '6b0c3f1e-2d4a-4c1b-9e7f-0a1b2c3d4e01';
const signal = () => new AbortController().signal;
const json = (data: unknown) => new Response(JSON.stringify(data), {headers: {'content-type': 'application/json'}});
const portfolio = () => ({items: [{itemId: id, version: 2, value: {kind: 'EXPERIENCE', dataMode: 'SYNTHETIC',
  state: 'SELF_REPORTED', title: '합성 분석 경험', summary: '합성 설문을 정리했습니다.'}, updatedAt: at}], nextCursor: null,
  portfolio: {asOf: at, consentVersion: 3, coverage: 'PAGE', complete: true,
    evidence: [{experienceId: id, contentVersion: 2, approval: {state: 'INACTIVE', version: 0, reason: 'NOT_APPROVED'}}], topics: []}});
const prepared = () => ({items: [{experienceId: id, inputRef: 'SYN-INPUT-01', operation: 'HCX_007',
  asOf: at, expiresAt, contentVersion: 2, consentVersion: 3}], unavailable: [] as string[]});
const candidate = async () => ExperienceReviewPageSchema.parse(await syntheticExperienceSkillPort().load(signal())).items[0]!.candidate!;

describe('#284 owner experience client contracts', () => {
  it('reads a bounded PAGE portfolio and propagates abort without accepting identity input', async () => {
    const fetch = vi.fn(async () => json(portfolio())), api = new HufsApiClient(fetch), abort = new AbortController();
    expect((await api.owner.getExperiencePortfolio({limit: 20}, abort.signal)).portfolio.coverage).toBe('PAGE');
    expect(fetch).toHaveBeenCalledWith('/api/experience/cards?limit=20&view=portfolio', expect.objectContaining({signal: abort.signal, cache: 'no-store'}));
    fetch.mockClear();
    await expect(api.owner.getExperiencePortfolio({actorId: 'other'} as never)).rejects.toMatchObject({code: 'INVALID_INPUT'});
    await expect(api.owner.getExperiencePortfolio({limit: 21})).rejects.toMatchObject({code: 'INVALID_INPUT'});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('prepares only requested IDs with fresh CSRF, then binds candidate ID and job', async () => {
    const answer = await candidate();
    const fetch = vi.fn(async (url: string) => json(url === '/api/auth/csrf' ? {csrfToken}
      : url.endsWith('/prepare') ? prepared() : answer));
    const api = new HufsApiClient(fetch), abort = new AbortController();
    expect((await api.owner.prepareExperienceSkills({experienceIds: [id]}, abort.signal)).items).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith('/api/experience/ai-skills/prepare', expect.objectContaining({
      method: 'POST', body: JSON.stringify({experienceIds: [id]}), signal: abort.signal,
      headers: expect.objectContaining({'x-csrf-token': csrfToken}),
    }));
    expect(await api.owner.getExperienceSkillCandidate(id, jobId, abort.signal)).toEqual(answer);
    expect(fetch).toHaveBeenLastCalledWith(`/api/experience/cards/${id}/ai-skills/${jobId}`, expect.objectContaining({method: 'GET', signal: abort.signal}));
  });

  it.each(['missing', 'foreign', 'expired-order'] as const)('rejects %s prepare receipt', async kind => {
    const result = prepared();
    if (kind === 'missing') result.items = [];
    if (kind === 'foreign') result.items[0]!.experienceId = 'SYN-OTHER';
    if (kind === 'expired-order') result.items[0]!.expiresAt = at;
    const api = new HufsApiClient(async url => json(url === '/api/auth/csrf' ? {csrfToken} : result));
    await expect(api.owner.prepareExperienceSkills({experienceIds: [id]})).rejects.toMatchObject({code: 'VERSION_CONFLICT'});
  });

  it.each(['experienceId', 'jobId', 'task'] as const)('rejects candidate cross-binding %s', async field => {
    const value = structuredClone(await candidate());
    if (field === 'experienceId') value.experienceId = 'SYN-OTHER';
    if (field === 'jobId') value.jobId = '6b0c3f1e-2d4a-4c1b-9e7f-0a1b2c3d4e02';
    if (field === 'task') { value.candidate.task = 'opportunity_terms'; delete value.candidate.result; }
    const api = new HufsApiClient(async () => json(value));
    await expect(api.owner.getExperienceSkillCandidate(id, jobId)).rejects.toMatchObject({code: 'VERSION_CONFLICT'});
  });

  it('does not request CSRF or network for malformed selection, job or path', async () => {
    const fetch = vi.fn(async () => json({})), api = new HufsApiClient(fetch);
    await expect(api.owner.prepareExperienceSkills({experienceIds: [id, id]})).rejects.toMatchObject({code: 'INVALID_INPUT'});
    await expect(api.owner.getExperienceSkillCandidate('../other', jobId)).rejects.toMatchObject({code: 'INVALID_INPUT'});
    await expect(api.owner.getExperienceSkillCandidate(id, 'latest')).rejects.toMatchObject({code: 'INVALID_INPUT'});
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('#258 owner adapter: explicit jobs and current portfolio', () => {
  const selection = [{experienceId: id, contentVersion: 2, consentVersion: 3}];

  it('does not guess historical jobs; only a returned jobId supplies a candidate', async () => {
    const value = await candidate(), calls: string[] = [];
    const api = new HufsApiClient(async url => {
      calls.push(url);
      return json(url === '/api/auth/csrf' ? {csrfToken} : url.includes('?view=portfolio') ? portfolio()
        : url.endsWith('/prepare') ? prepared() : url === '/api/ai/experience-skills'
          ? {jobId, state: 'NEEDS_REVIEW', provenance: 'CANDIDATE_CACHE'} : value);
    });
    const port = ownerExperienceSkillPort(api.owner);
    expect(ExperienceReviewPageSchema.parse(await port.load(signal())).items[0]!.candidate).toBeNull();
    expect(calls).toEqual(['/api/experience/cards?view=portfolio']);
    expect(await port.requestCandidates!(selection, signal())).toEqual({ready: 1, pending: 0, unavailable: 0});
    expect(ExperienceReviewPageSchema.parse(await port.load(signal())).items[0]!.candidate?.jobId).toBe(jobId);
    port.clear!(); calls.length = 0;
    expect(ExperienceReviewPageSchema.parse(await port.load(signal())).items[0]!.candidate).toBeNull();
    expect(calls).toEqual(['/api/experience/cards?view=portfolio']);
  });

  it('reuses the same provider idempotency key after PENDING and never auto-polls', async () => {
    const submitted: string[] = [];
    const api = new HufsApiClient(async (url, init) => {
      if (url === '/api/ai/experience-skills') submitted.push(JSON.parse(String(init.body)).idempotencyKey);
      return json(url === '/api/auth/csrf' ? {csrfToken} : url.endsWith('/prepare') ? prepared()
        : url.includes('?view=portfolio') ? portfolio() : {jobId, state: 'PENDING'});
    });
    const port = ownerExperienceSkillPort(api.owner);
    await port.requestCandidates!(selection, signal());
    expect(submitted).toHaveLength(1);
    const page = ExperienceReviewPageSchema.parse(await port.load(signal()));
    expect(page.items[0]).toMatchObject({candidate: null, candidateState: 'PENDING'});
    expect(submitted).toHaveLength(1);
    await port.requestCandidates!(selection, signal());
    expect(submitted).toHaveLength(2);
    expect(submitted[0]).toBe(submitted[1]);
  });

  it('blocks a changed content/consent batch before any provider call', async () => {
    const result = prepared(); result.items[0]!.consentVersion++;
    const calls: string[] = [];
    const api = new HufsApiClient(async url => { calls.push(url); return json(url === '/api/auth/csrf' ? {csrfToken} : result); });
    await expect(ownerExperienceSkillPort(api.owner).requestCandidates!(selection, signal())).rejects.toMatchObject({code: 'VERSION_CONFLICT'});
    expect(calls).toEqual(['/api/auth/csrf', '/api/experience/ai-skills/prepare']);
  });

  it('drops an in-flight prepare after session clear; it cannot start a provider job', async () => {
    let finish!: (value: Response) => void;
    const calls: string[] = [];
    const api = new HufsApiClient(async url => {
      calls.push(url);
      if (url === '/api/auth/csrf') return json({csrfToken});
      return new Promise<Response>(resolve => { finish = resolve; });
    });
    const port = ownerExperienceSkillPort(api.owner);
    const work = port.requestCandidates!(selection, signal());
    await vi.waitFor(() => expect(finish).toBeDefined());
    port.clear!(); finish(json(prepared()));
    await expect(work).rejects.toMatchObject({name: 'AbortError'});
    expect(calls).toEqual(['/api/auth/csrf', '/api/experience/ai-skills/prepare']);
  });
});
