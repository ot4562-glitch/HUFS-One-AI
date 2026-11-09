import {z} from 'zod';
import type {ApiErrorCode} from '@hufs-one/contracts';
import {HufsApiError} from '../integrations/api-error.js';

const BetaSession=z.strictObject({
  actorId:z.string().min(1),role:z.literal('BETA'),
  schoolMailProofValid:z.literal(true),betaAllowed:z.literal(true),
});
export type OwnerSessionStatus='IDLE'|'CHECKING'|'READY'|'FORBIDDEN'
  |'SIGNED_OUT'|'CONFLICT'|'UNAVAILABLE';
export interface OwnerSessionState {
  readonly epoch:number;
  readonly status:OwnerSessionStatus;
  readonly error:ApiErrorCode|null;
}
export interface OwnerSessionPort {
  /** Must query the live, authenticated same-origin session; never localStorage. */
  getSession(signal?:AbortSignal):Promise<unknown>;
}

/** Isolated owner-private session scope, intentionally independent of
 * demo subject selection. The actual API/SQL still enforces every permission.
 * No owner identity or private response is exposed by public controller state.
 */
export class OwnerSessionController {
  private state:OwnerSessionState={epoch:0,status:'IDLE',error:null};
  private readonly listeners=new Set<()=>void>();
  private readonly reads=new Map<string,AbortController>();
  private mutation:AbortController|null=null;
  private actorId:string|null=null;
  private disposed=false;
  private closed=false;
  constructor(private readonly api:OwnerSessionPort){}

  readonly getState=():OwnerSessionState=>this.state;
  readonly subscribe=(listener:()=>void):(()=>void)=>{
    if(this.disposed)return ()=>{};
    this.listeners.add(listener);
    return ()=>this.listeners.delete(listener);
  };
  private emit(status:OwnerSessionStatus,error:ApiErrorCode|null=null):void{
    if(this.disposed)return;
    this.state={epoch:this.state.epoch,status,error};
    for(const listener of this.listeners)listener();
  }
  private abortWork():void{
    for(const pending of this.reads.values())pending.abort();
    this.reads.clear();
    this.mutation?.abort();
    this.mutation=null;
  }
  private invalidate(status:OwnerSessionStatus,error:ApiErrorCode|null=null):number{
    this.abortWork();
    this.state={epoch:this.state.epoch+1,status,error};
    if(!this.disposed)for(const listener of this.listeners)listener();
    return this.state.epoch;
  }
  private fail(code:ApiErrorCode):void{
    const status:OwnerSessionStatus=code==='UNAUTHENTICATED'?'SIGNED_OUT'
      :code==='FORBIDDEN'||code==='SHARING_REVOKED'?'FORBIDDEN'
      :code==='VERSION_CONFLICT'?'CONFLICT':'UNAVAILABLE';
    if(status==='SIGNED_OUT'){this.actorId=null;this.closed=true;}
    this.invalidate(status,code);
  }
  private still(epoch:number):boolean{
    return !this.disposed&&!this.closed&&this.state.epoch===epoch;
  }
  private async checkIdentity(epoch:number,signal?:AbortSignal):Promise<boolean>{
    if(!this.still(epoch)||signal?.aborted)return false;
    let response:unknown;
    try{response=await this.api.getSession(signal);}
    catch(error){
      if(this.still(epoch)&&!signal?.aborted)
        this.fail(error instanceof HufsApiError?error.code:'PROVIDER_UNAVAILABLE');
      return false;
    }
    if(!this.still(epoch)||signal?.aborted)return false;
    const verified=BetaSession.safeParse(response);
    if(!verified.success){this.fail('FORBIDDEN');return false;}
    if(this.actorId!==null&&this.actorId!==verified.data.actorId){
      this.fail('UNAUTHENTICATED');return false;
    }
    this.actorId=verified.data.actorId;
    return true;
  }
  async initialize():Promise<void>{
    if(this.disposed||this.closed||this.state.status!=='IDLE')return;
    const epoch=this.invalidate('CHECKING');
    if(await this.checkIdentity(epoch)&&this.still(epoch))this.emit('READY');
  }
  async revalidate():Promise<void>{
    if(this.disposed||this.closed||this.state.status!=='READY')return;
    const epoch=this.invalidate('CHECKING');
    if(await this.checkIdentity(epoch)&&this.still(epoch))this.emit('READY');
  }
  /**
   * Explicit user-triggered recovery from a transient service outage or
   * version conflict. Never retries an existing mutation or private read.
   * SIGNED_OUT/FORBIDDEN are terminal until a fresh login and controller.
   */
  async retry():Promise<void>{
    if(this.disposed||this.closed||
      (this.state.status!=='UNAVAILABLE'&&this.state.status!=='CONFLICT'))return;
    const epoch=this.invalidate('CHECKING');
    if(await this.checkIdentity(epoch)&&this.still(epoch))this.emit('READY');
  }
  async runLatest<T>(key:string,perform:(signal:AbortSignal)=>Promise<T>):Promise<T|null>{
    if(!key||key.length>120||this.disposed||this.closed||this.state.status!=='READY'
      ||this.mutation)return null;
    this.reads.get(key)?.abort();
    const request=new AbortController();
    this.reads.set(key,request);
    const epoch=this.state.epoch;
    const current=()=>this.still(epoch)&&this.state.status==='READY'
      &&!request.signal.aborted&&!this.mutation&&this.reads.get(key)===request;
    try{
      if(!await this.checkIdentity(epoch,request.signal)||!current())return null;
      const result=await perform(request.signal);
      if(!current())return null;
      if(!await this.checkIdentity(epoch,request.signal)||!current())return null;
      return result;
    }catch(error){
      if(current()&&!(error instanceof Error&&error.name==='AbortError'))
        this.fail(error instanceof HufsApiError?error.code:'PROVIDER_UNAVAILABLE');
      return null;
    }finally{
      if(this.reads.get(key)===request)this.reads.delete(key);
    }
  }
  /** Strict one-write-at-a-time: abort old reads, recheck actor before/after. */
  async runMutation<T>(perform:(signal:AbortSignal)=>Promise<T>):Promise<T|null>{
    if(this.disposed||this.closed||this.state.status!=='READY'||this.mutation)return null;
    for(const pending of this.reads.values())pending.abort();
    this.reads.clear();
    const request=new AbortController();this.mutation=request;
    const epoch=this.state.epoch;
    const current=()=>this.still(epoch)&&this.state.status==='READY'
      &&!request.signal.aborted&&this.mutation===request;
    try{
      if(!await this.checkIdentity(epoch,request.signal)||!current())return null;
      const result=await perform(request.signal);
      if(!current())return null;
      if(!await this.checkIdentity(epoch,request.signal)||!current())return null;
      return result;
    }catch(error){
      if(current()&&!(error instanceof Error&&error.name==='AbortError'))
        this.fail(error instanceof HufsApiError?error.code:'PROVIDER_UNAVAILABLE');
      return null;
    }finally{
      if(this.mutation===request)this.mutation=null;
    }
  }
  invalidateLocalSession():void{
    if(this.disposed)return;
    this.closed=true;this.actorId=null;
    this.invalidate('SIGNED_OUT');
  }
  dispose():void{
    if(this.disposed)return;
    this.closed=true;this.actorId=null;
    this.abortWork();this.disposed=true;
    this.state={epoch:this.state.epoch+1,status:'SIGNED_OUT',error:null};
    this.listeners.clear();
  }
}
