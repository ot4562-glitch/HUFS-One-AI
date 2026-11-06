// @vitest-environment jsdom
import {StrictMode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {OwnerSessionController} from '../../app/owner-session-controller.js';
import {HufsApiClient} from '../../integrations/api-client.js';
import {OwnerExperiencePanel} from './OwnerExperiencePanel.js';
import {ownerExperienceSkillPort} from './ownerExperiencePort.js';

afterEach(cleanup);
const flush = async () => { for (let i = 0; i < 3; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
const at = '2026-11-06T00:00:00.000Z';
const id = 'SYN-EXP-01';
const json = (body: unknown) => new Response(JSON.stringify(body), {headers: {'content-type': 'application/json'}});
function setup() {
  const keys: string[] = [];
  const request = vi.fn(async (path: string, init: RequestInit) => {
    if (path === '/api/auth/csrf') return json({csrfToken: 'C'.repeat(32)});
    if (path === '/api/experience/cards?view=portfolio') return json({
      items: [{itemId: id, version: 1, value: {kind: 'EXPERIENCE', dataMode: 'OWNER_CONSENTED',
        state: 'SELF_REPORTED', title: '본인 경험', summary: '직접 작성한 내용'}, updatedAt: at}], nextCursor: null,
      portfolio: {asOf: at, consentVersion: 3, coverage: 'PAGE', complete: true,
        evidence: [{experienceId: id, contentVersion: 1, approval: {state: 'INACTIVE', version: 0, reason: 'NOT_APPROVED'}}], topics: []},
    });
    if (path === '/api/experience/ai-skills/prepare') return json({items: [{experienceId: id,
      inputRef: 'OWNER-INPUT-01', operation: 'HCX_007', asOf: at, expiresAt: '2026-11-07T00:00:00.000Z',
      contentVersion: 1, consentVersion: 3}], unavailable: []});
    if (path === '/api/ai/experience-skills') {
      keys.push(JSON.parse(String(init.body)).idempotencyKey);
      return json({jobId: '6b0c3f1e-2d4a-4c1b-9e7f-0a1b2c3d4e01', state: 'PENDING'});
    }
    throw new Error('Unexpected request path');
  });
  const api = new HufsApiClient(request);
  const session = new OwnerSessionController({getSession: async () => ({actorId: 'OWNER-A', role: 'BETA', schoolMailProofValid: true, betaAllowed: true})});
  const port = {session, skills: ownerExperienceSkillPort(api.owner)};
  return {port, keys};
}
async function selectAndRequest() {
  const group = screen.getByRole('group', {name: 'AI 후보를 확인할 내 경험 선택 (최대 16개)'});
  const selected = within(group).getByRole('checkbox', {name: '본인 경험'}) as HTMLInputElement;
  if (!selected.checked) fireEvent.click(selected);
  const consent = within(group).getByRole('checkbox', {name: /선택한 경험의 AI 후보 분석을 요청합니다/}) as HTMLInputElement;
  if (!consent.checked) fireEvent.click(consent);
  fireEvent.click(screen.getByRole('button', {name: '선택한 경험 AI 후보 요청'}));
  await flush();
}

describe('#258 owner experience lifecycle review', () => {
  it('loads through the real adapter with immediate identity responses and StrictMode effects', async () => {
    const f = setup();
    render(<StrictMode><OwnerExperiencePanel port={f.port} /></StrictMode>);
    await flush();
    expect(f.port.session.getState().status).toBe('READY');
    expect(screen.getByRole('article', {name: '본인 경험'})).toBeTruthy();
  });

  it('preserves a pending request idempotency key when the same owner revalidates on focus', async () => {
    const f = setup();
    render(<OwnerExperiencePanel port={f.port} />);
    await flush();
    await selectAndRequest();
    expect(f.keys).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toContain('준비 중 1개');
    await act(async () => { await f.port.session.revalidate(); });
    await flush();
    expect(f.port.session.getState().status).toBe('READY');
    await selectAndRequest();
    expect(f.keys).toHaveLength(2);
    expect(f.keys[1]).toBe(f.keys[0]);
  });

  it('keeps the same request receipt when the owner leaves and returns to the route', async () => {
    const f = setup();
    const first = render(<OwnerExperiencePanel port={f.port} />);
    await flush();
    await selectAndRequest();
    first.unmount();
    render(<OwnerExperiencePanel port={f.port} />);
    await flush();
    expect(screen.getByText(/AI 후보를 준비 중입니다/)).toBeTruthy();
    await selectAndRequest();
    expect(f.keys).toHaveLength(2);
    expect(f.keys[1]).toBe(f.keys[0]);
  });

  it.each([false, true])('erases receipt metadata after terminal session closure (unmounted: %s)', async unmounted => {
    const f = setup();
    const clear = vi.spyOn(f.port.skills, 'clear');
    const view = render(<OwnerExperiencePanel port={f.port} />);
    await flush();
    await selectAndRequest();
    clear.mockClear();
    if (unmounted) view.unmount();
    await act(async () => { f.port.session.invalidateLocalSession(); });
    if (unmounted) render(<OwnerExperiencePanel port={f.port} />);
    await flush();
    expect(clear).toHaveBeenCalled();
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('이전 경험과 AI 후보를 비웠습니다');
    expect(f.keys).toHaveLength(1);
  });
});
