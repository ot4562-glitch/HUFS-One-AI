// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {OwnerSessionController} from './owner-session-controller.js';
import {OwnerSessionFailure} from './OwnerSessionFailure.js';
import {HufsApiError} from '../integrations/api-error.js';

const OWNER={actorId:'SYN-OWNER',role:'BETA' as const,schoolMailProofValid:true,betaAllowed:true};
const outage=()=>{throw new HufsApiError('PROVIDER_UNAVAILABLE',503);};
function fixture(){
  let identity:unknown=OWNER;
  const getSession=vi.fn(async()=>identity);
  return {controller:new OwnerSessionController({getSession}),getSession,
    setIdentity:(next:unknown)=>{identity=next;}};
}
afterEach(cleanup);

describe('#374 explicit owner session recovery, never replaying a mutation',()=>{
  it('recovers from a transient read 503 only after user initiates retry',async()=>{
    const f=fixture();await f.controller.initialize();
    expect(f.controller.getState().status).toBe('READY');
    const returned=await f.controller.runLatest('private',async()=>outage());
    expect(returned).toBeNull();
    expect(f.controller.getState().status).toBe('UNAVAILABLE');
    await f.controller.revalidate();
    expect(f.controller.getState().status).toBe('UNAVAILABLE');
    expect(await f.controller.runLatest('private',async()=> 'stale')).toBeNull();
    render(<OwnerSessionFailure controller={f.controller}>이전 개인 화면은 숨겼습니다.</OwnerSessionFailure>);
    expect(screen.getByRole('alert').textContent).toContain('숨겼습니다');
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'현재 계정·권한 다시 확인'}));});
    await waitFor(()=>expect(f.controller.getState().status).toBe('READY'));
    expect(await f.controller.runLatest('private',async()=> 'fresh')).toBe('fresh');
  });
  it('rejects a changed BETA actor and cannot revive a signed-out account',async()=>{
    const f=fixture();await f.controller.initialize();
    await f.controller.runLatest('private',async()=>outage());
    f.setIdentity({...OWNER,actorId:'SYN-ANOTHER'});
    await f.controller.retry();
    expect(f.controller.getState().status).toBe('SIGNED_OUT');
    const calls=f.getSession.mock.calls.length;
    await f.controller.retry();await f.controller.initialize();
    expect(f.getSession.mock.calls.length).toBe(calls);
    expect(f.controller.getState().status).toBe('SIGNED_OUT');
  });
  it('explicit retry is single-flight even under two clicks',async()=>{
    const f=fixture();await f.controller.initialize();
    await f.controller.runLatest('private',async()=>outage());
    let release!:(next:unknown)=>void;
    const pending=new Promise<unknown>(resolve=>{release=resolve;});
    f.getSession.mockImplementation(async()=>pending);
    const one=f.controller.retry();
    const two=f.controller.retry();
    expect(f.controller.getState().status).toBe('CHECKING');
    expect(f.getSession).toHaveBeenCalledTimes(3); // initial, read pre-check, one retry
    release(OWNER);
    await Promise.all([one,two]);
    expect(f.controller.getState().status).toBe('READY');
  });
  it('never replays an ambiguous write after timeout; consent must be rechecked before a new user action',async()=>{
    const f=fixture();await f.controller.initialize();
    const mutation=vi.fn(async()=>outage());
    expect(await f.controller.runMutation(mutation)).toBeNull();
    expect(f.controller.getState().status).toBe('UNAVAILABLE');
    expect(await f.controller.runMutation(mutation)).toBeNull();
    await f.controller.retry();
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(f.controller.getState().status).toBe('READY');
  });
  it('requires an explicit retry to reload after VERSION_CONFLICT',async()=>{
    const f=fixture();await f.controller.initialize();
    await f.controller.runMutation(async()=>{throw new HufsApiError('VERSION_CONFLICT',409);});
    expect(f.controller.getState().status).toBe('CONFLICT');
    await f.controller.retry();
    expect(f.controller.getState().status).toBe('READY');
    f.controller.invalidateLocalSession();
    await f.controller.retry();
    expect(f.controller.getState().status).toBe('SIGNED_OUT');
  });
  it('keeps FORBIDDEN terminal and does not display the retry action',async()=>{
    const f=fixture();await f.controller.initialize();
    f.setIdentity({...OWNER,schoolMailProofValid:false});
    await f.controller.revalidate();
    expect(f.controller.getState().status).toBe('FORBIDDEN');
    render(<OwnerSessionFailure controller={f.controller}>권한 없음</OwnerSessionFailure>);
    expect(screen.queryByRole('button',{name:'현재 계정·권한 다시 확인'})).toBeNull();
    const calls=f.getSession.mock.calls.length;
    await f.controller.retry();
    expect(f.getSession.mock.calls.length).toBe(calls);
  });
});
