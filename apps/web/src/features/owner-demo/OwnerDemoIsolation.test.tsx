// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen,waitFor,fireEvent} from '@testing-library/react';
import {blankDemoProfileValue} from '@hufs-one/contracts';
import {OwnerSessionController} from '../../app/owner-session-controller.js';
import {HufsApiError} from '../../integrations/api-error.js';
import {recomputeDemoProfile} from '../../../../api/src/modules/profiles/demo-profile.js';
import {OwnerDemoProfile,type OwnerDemoProfilePort} from './OwnerDemoProfile.js';
import type {DemoProfileChanges} from './demoProfileChanges.js';
const actor={actorId:'SYN-EMPTY-OWNER',role:'BETA',schoolMailProofValid:true,betaAllowed:true};
const blank=(version=0)=>recomputeDemoProfile({version,value:blankDemoProfileValue(),updatedAt:version?'2026-11-05T00:00:00.000Z':null});
const saved=()=>recomputeDemoProfile({version:1,updatedAt:'2026-11-05T00:00:00.000Z',
  value:{primaryMajor:'OLD-SYNTHETIC-MAJOR',earnedCreditUnits:0,interestTopics:['AI_ML'],doubleMajor:{kind:'NONE'}}});
function fixture(){
 const listeners=new Set<()=>void>();
 const changes:DemoProfileChanges={subscribe:f=>{listeners.add(f);return ()=>{listeners.delete(f);};},notify:vi.fn()};
 const session=new OwnerSessionController({getSession:async()=>actor});
 const port:OwnerDemoProfilePort={session,changes,read:vi.fn(async()=>saved()),
  save:vi.fn(async()=>saved()),reset:vi.fn(async()=>blank(2)),saveWorkspace:vi.fn(async()=>saved())};
 return {port,peer:()=>{for(const f of listeners)f();}};
}
afterEach(cleanup);
describe('#132 tab, resume and late-failure isolation',()=>{
 it('drops an in-flight pre-reset response after peer invalidation',async()=>{
   const f=fixture();let finish!:(v:ReturnType<typeof saved>)=>void;
   const delayed=new Promise<ReturnType<typeof saved>>(resolve=>{finish=resolve;});
   f.port.read=vi.fn().mockImplementationOnce(()=>delayed).mockResolvedValue(blank(2));
   render(<OwnerDemoProfile port={f.port}/>);
   await waitFor(()=>expect(f.port.read).toHaveBeenCalledTimes(1));
   await act(async()=>{f.peer();});
   await screen.findByText(/프로필 버전 2/);
   await act(async()=>{finish(saved());await delayed;});
   expect((screen.getByLabelText('주전공') as HTMLInputElement).value).toBe('');
   expect(screen.queryByText('OLD-SYNTHETIC-MAJOR')).toBeNull();
 });
 for(const [status,code] of [[401,'UNAUTHENTICATED'],[403,'FORBIDDEN'],[409,'VERSION_CONFLICT'],[503,'PROVIDER_UNAVAILABLE']] as const){
   it('clears loaded content on '+status+' during resume',async()=>{
     const f=fixture();render(<OwnerDemoProfile port={f.port}/>);
     await screen.findByText(/프로필 버전 1/);
     f.port.read=vi.fn(async()=>{throw new HufsApiError(code,status);});
     await act(async()=>{window.dispatchEvent(new Event('pageshow'));});
     await screen.findByRole('alert');expect(screen.queryByText(/프로필 버전/)).toBeNull();
     expect(screen.queryByRole('region',{name:'빈 계정 추천'})).toBeNull();
   });
 }
 it('ends only after a successful whole-profile reset and notifies peers without a private payload',async()=>{
   const f=fixture();render(<OwnerDemoProfile port={f.port}/>);
   await screen.findByText(/프로필 버전 1/);
   fireEvent.click(screen.getByRole('button',{name:'초기화 후 시연 종료'}));
   expect(f.port.reset).not.toHaveBeenCalled();
   fireEvent.click(screen.getByRole('button',{name:'초기화 확인'}));
   await screen.findByRole('region',{name:'시연 종료'});
   expect(f.port.reset).toHaveBeenCalledWith({expectedVersion:1},expect.any(AbortSignal));
   expect(f.port.changes?.notify).toHaveBeenCalledWith();
   expect(screen.queryByRole('region',{name:'빈 계정 추천'})).toBeNull();
 });
});
