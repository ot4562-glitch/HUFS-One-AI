import {
  DemoContextSchema, DemoSnapshotSchema, isSnapshotCurrent,
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
  private readonly listeners=new Set<()=>void>();
  private disposed=false;
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
  }

  async loadProfiles():Promise<void> {
    if(this.disposed)return;
    const generation=++this.profileGeneration;
    try {
      const profiles=await this.api.listProfiles();
      if(this.disposed||generation!==this.profileGeneration)return;
      // Defense in depth; actual transport parses the exactly-five-slot contract.
      if(profiles.length!==5 || new Set(profiles.map(p=>p.demoSubjectId)).size!==5)
        throw new HufsApiError('PROVIDER_UNAVAILABLE',503);
      this.emit({...this.state,profiles});
    } catch(error) {
      if(this.disposed||generation!==this.profileGeneration)return;
      const failure=statusForError(error);
      this.emit({...this.state,profiles:[],context:null,snapshot:null,
        status:failure.status,error:failure.code});
    }
  }

  /** Abort the old request and erase the previous subject BEFORE any new network call. */
  async select(subject:SubjectAlias):Promise<void> {
    if(this.disposed)return;
    this.abort();
    const epoch=this.state.epoch+1;
    const abort=new AbortController();
    this.current=abort;
    this.emit({...this.state,epoch,selected:subject,status:'LOADING',
      context:null,snapshot:null,error:null});
    const allowed=this.state.profiles.find(p=>p.demoSubjectId===subject);
    if(this.state.profiles.length && (!allowed
      || !['READY','PARTIAL'].includes(allowed.readiness) || !allowed.allowedSections.length)) {
      this.emit({...this.state,status:'REVOKED',error:'FORBIDDEN'});
      return;
    }
    const current=()=>!this.disposed && !abort.signal.aborted
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
      this.emit({...this.state,status:failure.status,
        snapshot:null,context:null,error:failure.code});
    }
  }

  retry():Promise<void> {
    return this.state.selected && ['CONFLICT','UNAVAILABLE','INVALID'].includes(this.state.status)
      ?this.select(this.state.selected):Promise.resolve();
  }

  clear():void {
    this.abort();
    this.profileGeneration++;
    this.emit({epoch:this.state.epoch+1,selected:null,status:'IDLE',profiles:[],
      context:null,snapshot:null,error:null});
  }

  /** On logout we clear on-screen data immediately, then require real server revocation. */
  async logout():Promise<void> {
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
