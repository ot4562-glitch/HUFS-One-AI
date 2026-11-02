import type {LocalAccountId, LocalAccountProfile, LocalAccountSession, LocalAccountSnapshot, LocalAccountWorkspace} from '@hufs-one/contracts';

export interface LocalAccountPort {
  bootstrap(signal:AbortSignal):Promise<LocalAccountSession>;
  select(id:LocalAccountId, session:LocalAccountSession|null, signal:AbortSignal):Promise<LocalAccountSession>;
  read(signal:AbortSignal):Promise<LocalAccountSnapshot>;
  saveProfile(profile:LocalAccountProfile, revision:number, session:LocalAccountSession, signal:AbortSignal):Promise<LocalAccountSnapshot>;
  saveWorkspace(workspace:LocalAccountWorkspace, revision:number, session:LocalAccountSession, signal:AbortSignal):Promise<LocalAccountSnapshot>;
  reset(revision:number, session:LocalAccountSession, signal:AbortSignal):Promise<LocalAccountSnapshot>;
}
export interface LocalAccountState {
  readonly session:LocalAccountSession|null; readonly snapshot:LocalAccountSnapshot|null;
  readonly busy:boolean; readonly error:string|null; readonly epoch:number;
}
function message(error:unknown):string {
  const status=typeof error==='object' && error!==null && 'status' in error ? Number(error.status) : 0;
  const text:Record<number,string>={401:'로컬 세션이 만료되었습니다.',403:'이 요청은 허용되지 않습니다.',409:'다른 탭에서 수정했습니다. 새로 불러온 뒤 다시 입력해 주세요.',503:'로컬 서버를 연결할 수 없습니다.'};
  return `${status || '연결/검증 오류'} · ${text[status] ?? '응답을 확인할 수 없습니다.'} 이전 화면과 미저장 입력을 지웠습니다.`;
}
/** Memory only. Cookie identity is established by the server; no account id is sent with data mutations. */
export class LocalAccountController {
  state:LocalAccountState={session:null,snapshot:null,busy:false,error:null,epoch:0};
  private listeners=new Set<()=>void>();
  private abort:AbortController|null=null;
  private peerCheck:AbortController|null=null;
  private peerTimeout:ReturnType<typeof setTimeout>|null=null;
  private queue:Promise<void>=Promise.resolve();
  private revisions=new Map<string,number>();
  constructor(private readonly port:LocalAccountPort, private readonly broadcast:()=>void=()=>{}) {}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
  getState=()=>this.state;
  private publish(state:LocalAccountState) {this.state=state; for(const listener of this.listeners) listener();}
  private notifyPeers() {try {this.broadcast();} catch {/* Closed tabs/channels are recovered by visible peer revalidation. */}}
  private stopPeerCheck() {this.peerCheck?.abort();this.peerCheck=null;if(this.peerTimeout!==null) clearTimeout(this.peerTimeout);this.peerTimeout=null;}
  private begin():{epoch:number;signal:AbortSignal} {
    this.abort?.abort();this.stopPeerCheck(); this.abort=new AbortController(); const epoch=this.state.epoch+1;
    this.publish({session:this.state.session,snapshot:null,busy:true,error:null,epoch});
    return {epoch,signal:this.abort.signal};
  }
  private accept(snapshot:LocalAccountSnapshot, session:LocalAccountSession, epoch:number) {
    if (epoch!==this.state.epoch) return;
    const key=`${session.sessionId}:${snapshot.accountId}`;
    if (snapshot.accountId!==session.accountId || snapshot.sessionId!==session.sessionId ||
      snapshot.revision<(this.revisions.get(key) ?? 0)) throw new Error('STALE_IDENTITY_OR_REVISION');
    this.revisions.set(key,snapshot.revision);
    this.publish({session,snapshot,busy:false,error:null,epoch});
  }
  private fail(error:unknown, epoch:number) {
    if(epoch===this.state.epoch) this.publish({session:null,snapshot:null,busy:false,error:message(error),epoch});
  }
  async load() {
    const {epoch,signal}=this.begin();
    try {const session=await this.port.bootstrap(signal); const snapshot=await this.port.read(signal); this.accept(snapshot,session,epoch);}
    catch(error) {this.fail(error,epoch);}
  }
  invalidate=()=>this.load();
  /** Check quietly so an unchanged account does not lose its active form drafts. */
  async revalidate() {
    const previous=this.state.snapshot;const epoch=this.state.epoch;
    if(!previous||this.state.busy||this.peerCheck) return;
    const check=new AbortController();this.peerCheck=check;
    this.peerTimeout=setTimeout(()=>{
      if(this.peerCheck!==check)return;
      check.abort();this.fail(Object.assign(new Error('peer check timed out'),{status:503}),epoch);
    },10_000);
    try {const current=await this.port.read(check.signal);
      if(check.signal.aborted||epoch!==this.state.epoch) return;
      if(current.sessionId!==previous.sessionId||current.accountId!==previous.accountId||current.revision!==previous.revision) await this.invalidate();
    } catch(error) {if(!check.signal.aborted)this.fail(error,epoch);}
    finally {if(this.peerCheck===check)this.stopPeerCheck();}
  }
  select(id:LocalAccountId) {
    const oldSession=this.state.session; const {epoch,signal}=this.begin();
    this.notifyPeers();
    // Serialize cookie-changing requests: an older Set-Cookie must never arrive after a newer switch.
    const operation=this.queue.then(async()=>{
      try {if(epoch!==this.state.epoch) return;
        const session=await this.port.select(id,oldSession,signal);
        if(epoch!==this.state.epoch) return;
        const snapshot=await this.port.read(signal);this.accept(snapshot,session,epoch);
      } catch(error) {this.fail(error,epoch);} finally {this.notifyPeers();}
    });
    this.queue=operation; return operation;
  }
  private mutate(action:(snapshot:LocalAccountSnapshot,session:LocalAccountSession,signal:AbortSignal)=>Promise<LocalAccountSnapshot>) {
    const previous=this.state.snapshot; const session=this.state.session; const {epoch,signal}=this.begin();
    this.notifyPeers();
    const operation=this.queue.then(async()=>{
      try {if(epoch!==this.state.epoch) return;
        if(!previous||!session) throw new Error('NO_SESSION');
        const result=await action(previous,session,signal);
        if(result.revision<=previous.revision) throw new Error('NON_ADVANCING_REVISION');
        this.accept(result,session,epoch);
      } catch(error) {this.fail(error,epoch);} finally {this.notifyPeers();}
    });
    this.queue=operation;return operation;
  }
  saveProfile(profile:LocalAccountProfile) {return this.mutate((snapshot,session,signal)=>this.port.saveProfile(profile,snapshot.revision,session,signal));}
  saveWorkspace(workspace:LocalAccountWorkspace) {return this.mutate((snapshot,session,signal)=>this.port.saveWorkspace(workspace,snapshot.revision,session,signal));}
  reset() {return this.mutate((snapshot,session,signal)=>{
    if(snapshot.accountId!=='BLANK_DEMO') throw new Error('RESET_NOT_ALLOWED');
    return this.port.reset(snapshot.revision,session,signal);
  });}
  clear() {this.abort?.abort();this.stopPeerCheck();this.publish({session:null,snapshot:null,busy:false,error:null,epoch:this.state.epoch+1});}
}
