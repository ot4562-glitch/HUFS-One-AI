import {
  DemoContextSchema, DemoProfilesResponseSchema, DemoSnapshotSchema, SubjectAliasSchema,
  isSnapshotCurrent,
} from '@hufs-one/contracts';
import type {
  ApiErrorCode, DemoContext, DemoProfileOption, DemoSnapshot, SubjectAlias,
} from '@hufs-one/contracts';
import {HufsApiError} from '../integrations/api-client.js';

export type DemoViewStatus =
  'IDLE'|'LOADING'|'READY'|'REVOKED'|'CONFLICT'|'UNAVAILABLE'|'SIGNED_OUT'|'INVALID';

export interface DemoViewState {
  readonly epoch:number;
  readonly selected:SubjectAlias|null;
  readonly status:DemoViewStatus;
  readonly profiles:readonly DemoProfileOption[];
  readonly context:DemoContext|null;
  readonly snapshot:DemoSnapshot|null;
  readonly error:ApiErrorCode|null;
}

/** Only required operations of the verified API client; no React feature module is modified. */
export interface DemoClientPort {
  listProfiles(signal?:AbortSignal):Promise<DemoProfileOption[]>;
  createContext(subject:SubjectAlias,runId:string,signal?:AbortSignal):Promise<DemoContext>;
  getSnapshot(contextId:string,signal?:AbortSignal):Promise<DemoSnapshot>;
  logout(signal?:AbortSignal):Promise<void>;
}

export function newTabDemoRunId():string {
  // Per-tab in-memory only; never use a global active student or persistent storage.
  return crypto.randomUUID();
}

function statusForError(error:unknown):{status:DemoViewStatus;code:ApiErrorCode} {
  const code=error instanceof HufsApiError?error.code:'PROVIDER_UNAVAILABLE';
  switch(code) {
    case 'UNAUTHENTICATED':return {status:'SIGNED_OUT',code};
    case 'FORBIDDEN':
    case 'SHARING_REVOKED':return {status:'REVOKED',code};
    case 'VERSION_CONFLICT':return {status:'CONFLICT',code};
    case 'INVALID_INPUT':
    case 'UNVERIFIED_EVIDENCE':return {status:'INVALID',code};
    default:return {status:'UNAVAILABLE',code};
  }
}

export class DemoController {
  private state:DemoViewState={
    epoch:0, selected:null, status:'IDLE',profiles:[],
    context:null,snapshot:null,error:null,
  };
  private current:AbortController|null=null;
  private revalidation:AbortController|null=null;
  private readonly listeners=new Set<()=>void>();
  private disposed=false;
  private endingSession=false;
  private profileGeneration=0;

  constructor(private readonly api:DemoClientPort,private readonly runId:string) {
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(runId))throw new Error('Invalid tab-local run id');
  }
  readonly getState=():DemoViewState=>this.state;
  readonly subscribe=(listener:()=>void):(()=>void)=>{
    if(this.disposed)return ()=>{};
    this.listeners.add(listener);
    return ()=>this.listeners.delete(listener);
  };
  private emit(next:DemoViewState):void {
    if(this.disposed)return;
    this.state=next;
    for(const listener of this.listeners)listener();
  }
  private abort():void {
    this.current?.abort();
    this.current=null;
    this.revalidation?.abort();
    this.revalidation=null;
  }

  async loadProfiles():Promise<void> {
    if(this.disposed||this.endingSession)return;
    const generation=++this.profileGeneration;
    try {
      const profiles=await this.api.listProfiles();
      if(this.disposed||this.endingSession||generation!==this.profileGeneration)return;
      // The injected transport may be replaced: validate its data independently.
      const parsed=DemoProfilesResponseSchema.safeParse({profiles});
      if(!parsed.success)throw new HufsApiError('PROVIDER_UNAVAILABLE',503);
      this.emit({...this.state,profiles:parsed.data.profiles});
    } catch(error) {
      if(this.disposed||generation!==this.profileGeneration)return;
      const failure=statusForError(error);
      if(failure.status==='SIGNED_OUT')this.endingSession=true;
      this.emit({...this.state,profiles:[],context:null,snapshot:null,
        status:failure.status,error:failure.code});
    }
  }

  /** Abort the old request and erase the previous subject BEFORE any new network call. */
  async select(subject:SubjectAlias):Promise<void> {
    if(this.disposed||this.endingSession)return;
    this.abort();
    const epoch=this.state.epoch+1;
    const abort=new AbortController();
    this.current=abort;
    this.emit({...this.state,epoch,selected:subject,status:'LOADING',
      context:null,snapshot:null,error:null});
    if(!SubjectAliasSchema.safeParse(subject).success) {
      this.emit({...this.state,selected:null,status:'INVALID',error:'INVALID_INPUT'});
      return;
    }
    const allowed=this.state.profiles.find(p=>p.demoSubjectId===subject);
    if(this.state.profiles.length && (!allowed
      || !['READY','PARTIAL'].includes(allowed.readiness) || !allowed.allowedSections.length)) {
      this.emit({...this.state,status:'REVOKED',error:'FORBIDDEN'});
      return;
    }
    const current=()=>!this.disposed && !this.endingSession && !abort.signal.aborted
      && this.current===abort && this.state.epoch===epoch;
    try {
      const rawContext=await this.api.createContext(subject,this.runId,abort.signal);
      if(!current())return;
      const parsedContext=DemoContextSchema.safeParse(rawContext);
      if(!parsedContext.success || parsedContext.data.demoSubjectId!==subject
        || parsedContext.data.demoRunId!==this.runId)
        throw new HufsApiError('VERSION_CONFLICT',409);
      const context=parsedContext.data;
      const rawSnapshot=await this.api.getSnapshot(context.contextId,abort.signal);
      if(!current())return;
      const parsedSnapshot=DemoSnapshotSchema.safeParse(rawSnapshot);
      if(!parsedSnapshot.success)throw new HufsApiError('PROVIDER_UNAVAILABLE',503);
      if(!isSnapshotCurrent(parsedSnapshot.data,{
        context,selectionEpoch:epoch,currentSelectionEpoch:this.state.epoch,
      }))throw new HufsApiError('VERSION_CONFLICT',409);
      this.emit({...this.state,status:'READY',context,
        snapshot:parsedSnapshot.data,error:null});
    } catch(error) {
      if(!current())return;
      const failure=statusForError(error);
      if(failure.status==='SIGNED_OUT')this.endingSession=true;
      this.emit({...this.state,status:failure.status,
        snapshot:null,context:null,error:failure.code});
    }
  }

  /**
   * On resume/focus, hide previously rendered data BEFORE rechecking the live
   * server's session, consent, grant, invitation and dataset revision gates.
   * The server's snapshot route is the authority: a cached browser roster or
   * OAuth access hint alone never proves a current SharingGrant.
   */
  async revalidate():Promise<void> {
    if(this.disposed||this.endingSession||this.state.status!=='READY'
      ||!this.state.context)return;
    this.revalidation?.abort();
    const active=new AbortController();
    this.revalidation=active;
    const {context,epoch}=this.state;
    this.emit({...this.state,status:'LOADING',snapshot:null,error:null});
    const current=()=>!this.disposed&&!this.endingSession
      &&!active.signal.aborted&&this.revalidation===active
      &&this.state.epoch===epoch
      &&this.state.context?.contextId===context.contextId;
    try{
      const raw=await this.api.getSnapshot(context.contextId,active.signal);
      if(!current())return;
      const parsed=DemoSnapshotSchema.safeParse(raw);
      if(!parsed.success)throw new HufsApiError('PROVIDER_UNAVAILABLE',503);
      if(!isSnapshotCurrent(parsed.data,{
        context,selectionEpoch:epoch,currentSelectionEpoch:this.state.epoch,
      }))throw new HufsApiError('VERSION_CONFLICT',409);
      this.emit({...this.state,status:'READY',snapshot:parsed.data,error:null});
    }catch(error){
      if(current())this.applyContextError(context.contextId,epoch,error);
    }finally{
      if(this.revalidation===active)this.revalidation=null;
    }
  }

  /**
   * Report a failed section or REVIEWER sandbox call only for the exact
   * epoch+context that issued it. A delayed 403 from an old student may not
   * erase a different student's newer screen. 401 always requires a fresh
   * authenticated app/controller; no in-memory session reuse is permitted.
   */
  applyContextError(contextId:string,requestEpoch:number,error:unknown):boolean {
    if(this.disposed||this.endingSession||this.state.context?.contextId!==contextId
      ||this.state.epoch!==requestEpoch)return false;
    const failure=statusForError(error);
    this.abort();
    this.profileGeneration++;
    if(failure.status==='SIGNED_OUT')this.endingSession=true;
    this.emit({
      ...this.state,epoch:this.state.epoch+1,
      status:failure.status,context:null,snapshot:null,error:failure.code,
      profiles:failure.status==='SIGNED_OUT'||failure.status==='REVOKED'
        ?[]:this.state.profiles,
    });
    return true;
  }

  retry():Promise<void> {
    if(this.endingSession)return Promise.resolve();
    return this.state.selected && ['CONFLICT','UNAVAILABLE','INVALID'].includes(this.state.status)
      ?this.select(this.state.selected):Promise.resolve();
  }

  clear():void {
    this.abort();
    this.profileGeneration++;
    this.emit({epoch:this.state.epoch+1,selected:null,status:'IDLE',profiles:[],
      context:null,snapshot:null,error:null});
  }

  /** On logout, prevent all new requests until a NEW verified controller is created. */
  async logout():Promise<void> {
    if(this.disposed||this.endingSession)return;
    this.endingSession=true;
    this.clear();
    try {
      await this.api.logout();
      this.emit({...this.state,status:'SIGNED_OUT',error:null});
    } catch(error) {
      const failure=statusForError(error);
      this.emit({...this.state,status:failure.status,error:failure.code});
      throw error;
    }
  }

  dispose():void {
    this.clear();
    this.disposed=true;
    this.listeners.clear();
  }
}
