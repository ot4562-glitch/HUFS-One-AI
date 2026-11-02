import {describe, expect, it, vi} from 'vitest';
import type {LocalAccountId, LocalAccountSession, LocalAccountSnapshot} from '@hufs-one/contracts';
import {LocalAccountController, type LocalAccountPort} from './controller.js';

const profile = {displayName:'빈 데모 계정', primaryMajor:null, doubleMajorStatus:'UNSET' as const, doubleMajor:null,
  earnedCredits:null, interestTopics:[], desiredJobTopics:[], campus:null, cohort:null};
export const session = (accountId:LocalAccountId='BLANK_DEMO'):LocalAccountSession => ({mode:'SYNTHETIC',sessionId:`session-${accountId}`,csrfToken:'csrf-token',accountId,
  accounts:['BLANK_DEMO','SYN_OWNER_1','SYN_OWNER_2','SYN_OWNER_3','SYN_OWNER_4'].map(id=>({accountId:id as LocalAccountId,label:id,resettable:id==='BLANK_DEMO',dataMode:'SYNTHETIC'}))});
export const snapshot = (accountId:LocalAccountId='BLANK_DEMO', revision=0):LocalAccountSnapshot => ({mode:'SYNTHETIC',sessionId:`session-${accountId}`,accountId,revision,profile,
  workspace:{bookmarks:[],experiences:[],planCourseIds:[],search:'',notifications:false}, asOf:'2026-11-02T00:00:00Z',
  feed:{asOf:'2026-11-02T00:00:00Z',featured:[],compact:[],hasMore:false,totalCandidates:0},
  notices:{asOf:'2026-11-02T00:00:00Z',items:[],pinnedIds:[]},clubs:{recommended:[],all:[]},
  academics:{state:'UNKNOWN',reason:'검수된 학칙 없음'},forecast:{state:'UNKNOWN',reason:'확인된 개설 이력 없음'}});

class Port implements LocalAccountPort {
  current:LocalAccountId='BLANK_DEMO';
  reads:Array<(v:LocalAccountSnapshot)=>void>=[];
  pending=false;
  async bootstrap() {return session(this.current);}
  async select(id:LocalAccountId) {this.current=id;return session(id);}
  async read() {return this.pending ? new Promise<LocalAccountSnapshot>(resolve=>this.reads.push(resolve)) : snapshot(this.current);}
  async saveProfile() {return snapshot(this.current,1);}
  async saveWorkspace() {return snapshot(this.current,1);}
  async reset() {return snapshot(this.current,1);}
}
const flush=async()=>{for(let i=0;i<8;i++) await Promise.resolve();};

describe('local account asynchronous isolation',()=>{
  it('invalidates peers before reset and again when the committed reset response is lost',async()=>{
    let revision=0;
    const peerPort=new Port();peerPort.read=async()=>snapshot('BLANK_DEMO',revision);
    const peer=new LocalAccountController(peerPort);await peer.load();
    const senderPort=new Port();senderPort.read=async()=>snapshot('BLANK_DEMO',revision);
    senderPort.reset=async()=>{revision=1;throw Object.assign(new Error('response lost'),{status:503});};
    const broadcast=vi.fn(()=>{void peer.invalidate();});
    const sender=new LocalAccountController(senderPort,broadcast);await sender.load();
    const resetting=sender.reset();expect(broadcast).toHaveBeenCalledTimes(1);expect(peer.state.snapshot).toBeNull();
    await resetting;await flush();expect(broadcast).toHaveBeenCalledTimes(2);
    expect(sender.state.snapshot).toBeNull();expect(peer.state.snapshot?.revision).toBe(1);
  });
  it('broadcasts after a session switch commits even when its snapshot read fails',async()=>{
    const port=new Port();const broadcast=vi.fn();const controller=new LocalAccountController(port,broadcast);await controller.load();
    port.read=async()=>{throw new Error('response lost');};
    await controller.select('SYN_OWNER_2');expect(broadcast).toHaveBeenCalledTimes(2);
    expect(port.current).toBe('SYN_OWNER_2');expect(controller.state.snapshot).toBeNull();
  });
  it('peer checks preserve unchanged drafts but clear and refetch when a revision changes',async()=>{
    const port=new Port();const controller=new LocalAccountController(port);await controller.load();
    const before=controller.state;await controller.revalidate();expect(controller.state).toBe(before);
    port.read=async()=>snapshot('BLANK_DEMO',1);const observed:Array<number|null>=[];
    controller.subscribe(()=>observed.push(controller.state.snapshot?.revision??null));
    await controller.revalidate();expect(observed).toContain(null);expect(controller.state.snapshot?.revision).toBe(1);
  });
  it('ignores a late peer check after clearing the controller',async()=>{
    const port=new Port();const controller=new LocalAccountController(port);await controller.load();
    port.pending=true;const checking=controller.revalidate();await flush();controller.clear();
    port.reads[0]!(snapshot('BLANK_DEMO',1));await checking;expect(controller.state.snapshot).toBeNull();
  });
  it('clears A immediately and rejects a late A read after switching to B',async()=>{
    const port=new Port(); const controller=new LocalAccountController(port); await controller.load();
    port.pending=true; const a=controller.load(); await flush();
    const b=controller.select('SYN_OWNER_1');
    expect(controller.state.snapshot).toBeNull(); await flush();
    port.reads[0]!(snapshot()); await a; expect(controller.state.snapshot).toBeNull();
    port.reads[1]!(snapshot('SYN_OWNER_1')); await b;
    expect(controller.state.snapshot?.accountId).toBe('SYN_OWNER_1');
  });
  it('rejects mismatched session identity',async()=>{
    const port=new Port(); const controller=new LocalAccountController(port); await controller.load();
    port.read=async()=>snapshot('SYN_OWNER_2'); await controller.load();
    expect(controller.state.snapshot).toBeNull(); expect(controller.state.error).toBeTruthy();
  });
  it('rejects a response that regresses the revision after a saved update',async()=>{
    const port=new Port(); const controller=new LocalAccountController(port); await controller.load();
    await controller.saveProfile(profile);expect(controller.state.snapshot?.revision).toBe(1);
    await controller.load();expect(controller.state.snapshot).toBeNull();expect(controller.state.error).toBeTruthy();
  });
  it('rejects nonadvancing mutation revisions',async()=>{
    const port=new Port(); const controller=new LocalAccountController(port); await controller.load();
    port.saveProfile=async()=>snapshot();await controller.saveProfile(profile);
    expect(controller.state.snapshot).toBeNull();expect(controller.state.error).toBeTruthy();
  });
  it('remote invalidation clears before refetch and does not reuse drafts',async()=>{
    const port=new Port(); const controller=new LocalAccountController(port); await controller.load();
    port.pending=true; const work=controller.invalidate();
    expect(controller.state.snapshot).toBeNull(); await flush();
    port.reads[0]!(snapshot()); await work; expect(controller.state.snapshot).not.toBeNull();
  });
  it.each([401,403,409,503])('clears outputs on HTTP %s',async(status)=>{
    const port=new Port(); const controller=new LocalAccountController(port); await controller.load();
    port.saveProfile=async()=>{throw Object.assign(new Error('blocked'),{status});};
    await controller.saveProfile(profile);
    expect(controller.state.snapshot).toBeNull(); expect(controller.state.error).toContain(String(status));
  });
  it('reset is unavailable for synthetic owner accounts',async()=>{
    const port=new Port(); const controller=new LocalAccountController(port); await controller.select('SYN_OWNER_1');
    await controller.reset(); expect(controller.state.snapshot).toBeNull(); expect(controller.state.error).toBeTruthy();
  });
});
