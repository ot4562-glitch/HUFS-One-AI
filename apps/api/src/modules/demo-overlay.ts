import {z} from 'zod';
import {DemoContextSchema,DemoSnapshotSchema,DemoOverlayStateSchema,
  DemoOverlayPutSchema,DemoOverlayResetSchema,ISODateTimeSchema} from '@hufs-one/contracts';
import type {DemoOverlayPut,DemoOverlayState,DemoSnapshot,CalendarResult} from '@hufs-one/contracts';
import {computeAuthorizedSections} from './calendar.js';
import type {CalendarInputBundle,CalendarInputSource,CalendarReadRequest} from './calendar.js';
import {ApiFailure} from './auth/gates.js';

// Version identifiers are opaque: generated scope versions legitimately contain
// commas, plus signs and provenance separators. Preserve exact bytes in keys.
const KeyPart=z.string().min(1).max(200).regex(/^[^\u0000-\u001f\u007f]+$/);
export const DemoOverlayKeySchema=z.strictObject({
  actorId:KeyPart,sessionIdHash:KeyPart,demoRunId:KeyPart,
  demoSubjectId:z.enum(['S01','S02','S03','S04','S05']),
  datasetVersion:KeyPart,projectionVersion:KeyPart,sharingGrantVersion:KeyPart,
});
export type DemoOverlayKey=z.infer<typeof DemoOverlayKeySchema>;
export interface DemoOverlayStore{
  read(key:DemoOverlayKey):Promise<DemoOverlayState>;
  /** CAS; absent row has version zero. Reset writes an empty value with a NEW version. */
  put(key:DemoOverlayKey,change:DemoOverlayPut,now:string):Promise<DemoOverlayState>;
}
export type DemoOverlayResult={overlay:DemoOverlayState;snapshot:DemoSnapshot;calendar:CalendarResult};
export class DemoOverlayConflict extends Error{constructor(){super('Demo overlay version conflict');}}
export const emptyDemoOverlay=():DemoOverlayState=>({version:0,value:{},updatedAt:null});

/** Synthetic private test store; deployment requires the restricted PostgreSQL adapter. */
export class MemoryDemoOverlayStore implements DemoOverlayStore{
  private readonly rows=new Map<string,DemoOverlayState>();
  private key(raw:DemoOverlayKey){return JSON.stringify(DemoOverlayKeySchema.parse(raw));}
  async read(key:DemoOverlayKey):Promise<DemoOverlayState>{
    return structuredClone(this.rows.get(this.key(key))??emptyDemoOverlay());
  }
  async put(key:DemoOverlayKey,raw:DemoOverlayPut,now:string):Promise<DemoOverlayState>{
    const id=this.key(key),change=DemoOverlayPutSchema.parse(raw);
    const old=this.rows.get(id)??emptyDemoOverlay();
    if(old.version!==change.expectedVersion)throw new DemoOverlayConflict();
    if(!this.rows.has(id)&&this.rows.size>=4096)throw new Error('Synthetic overlay store full');
    const state=DemoOverlayStateSchema.parse({version:old.version+1,
      value:change.value,updatedAt:ISODateTimeSchema.parse(now)});
    this.rows.set(id,structuredClone(state));return structuredClone(state);
  }
}

/** Caller authenticates BETA + CSRF and supplies checked snapshot metadata.
 * This service rechecks subject/grant/source/version boundaries independently. */
export class DemoOverlayService{
  private readonly now:()=>string;
  constructor(private readonly config:{source:CalendarInputSource;store:DemoOverlayStore;now?:()=>string}){
    this.now=config.now??(()=>new Date().toISOString());
  }
  private key(input:CalendarReadRequest):DemoOverlayKey{
    const c=DemoContextSchema.parse(input.context),at=ISODateTimeSchema.parse(input.now);
    if(input.reviewerInviteId!==undefined||input.actorId!==c.actorId||Date.parse(c.expiresAt)<=Date.parse(at))
      throw new ApiFailure('FORBIDDEN');
    return DemoOverlayKeySchema.parse({actorId:input.actorId,sessionIdHash:c.sessionIdHash,
      demoRunId:c.demoRunId,demoSubjectId:c.demoSubjectId,datasetVersion:c.datasetVersion,
      projectionVersion:c.projectionVersion,sharingGrantVersion:c.sharingGrantVersion});
  }
  private async load(input:CalendarReadRequest,raw:DemoSnapshot){
    const key=this.key(input),metadata=DemoSnapshotSchema.parse(raw),c=input.context;
    if(metadata.contextId!==c.contextId||metadata.demoSubjectId!==c.demoSubjectId
      ||metadata.versions.dataset!==c.datasetVersion||metadata.versions.projection!==c.projectionVersion
      ||metadata.versions.consent!==c.sharingGrantVersion)
      throw new ApiFailure('VERSION_CONFLICT',c.contextId);
    const bundle=await this.config.source.readAuthorizedInputs(input);
    if(!bundle)throw new ApiFailure('FORBIDDEN');
    // Validate the original grant, provenance, context and current source selection BEFORE a write.
    computeAuthorizedSections(bundle,input);
    if(metadata.datasetMode!==bundle.datasetMode||metadata.asOf!==bundle.asOf
      ||('asOf' in metadata.academics&&metadata.academics.asOf!==bundle.asOf)
      ||('asOf' in metadata.forecast&&metadata.forecast.asOf!==bundle.asOf))
      throw new ApiFailure('VERSION_CONFLICT',c.contextId);
    return {key,metadata,bundle};
  }
  private async recheck(input:CalendarReadRequest,bundle:CalendarInputBundle){
    const now=ISODateTimeSchema.parse(this.now());
    if(Date.parse(input.context.expiresAt)<=Date.parse(now)
      ||!await this.config.source.revalidateAuthorization(input,{
        authorizationToken:bundle.authorizationToken,sourceVersion:bundle.sourceVersion,
        scopeKey:bundle.scopeKey,asOf:bundle.asOf},now))throw new ApiFailure('FORBIDDEN');
  }
  private async finish(input:CalendarReadRequest,
    loaded:Awaited<ReturnType<DemoOverlayService['load']>>,overlay:DemoOverlayState):Promise<DemoOverlayResult>{
    const {key,metadata,bundle}=loaded,copy=structuredClone(bundle),value=overlay.value;
    if(value.interestTopics!==undefined){
      copy.profile.interestTopics=value.interestTopics;
      copy.noticeStudent.interestTopics=value.interestTopics;
    }
    if(value.desiredJobTopics!==undefined)copy.profile.desiredJobTopics=value.desiredJobTopics;
    if(value.hiddenOpportunityIds!==undefined)copy.hiddenOpportunityIds=value.hiddenOpportunityIds;
    const result=computeAuthorizedSections(copy,input);
    const snapshot=DemoSnapshotSchema.parse({...metadata,
      versions:{...metadata.versions,overlay:'BETA_OVERLAY:'+overlay.version,rankConfig:result.rankConfigVersion},
      feed:result.feed,notices:result.notices,aiProvenance:'NONE',
      academics:bundle.grant!.allowedSections.includes('ACADEMICS')?metadata.academics:{state:'NOT_SHARED'},
      forecast:bundle.grant!.allowedSections.includes('FORECAST')?metadata.forecast:{state:'NOT_SHARED'}});
    await this.recheck(input,bundle);
    const current=DemoOverlayStateSchema.parse(await this.config.store.read(key));
    if(current.version!==overlay.version)throw new ApiFailure('VERSION_CONFLICT',input.context.contextId);
    // The store read can await PostgreSQL after the first authorization check.
    // Catch a grant/source withdrawal during that final storage operation too.
    await this.recheck(input,bundle);
    return {overlay,snapshot,calendar:result.calendar};
  }
  async read(input:CalendarReadRequest,metadata:DemoSnapshot):Promise<DemoOverlayResult>{
    const loaded=await this.load(input,metadata);
    return this.finish(input,loaded,DemoOverlayStateSchema.parse(await this.config.store.read(loaded.key)));
  }
  async put(input:CalendarReadRequest,metadata:DemoSnapshot,raw:unknown):Promise<DemoOverlayResult>{
    const change=DemoOverlayPutSchema.parse(raw),loaded=await this.load(input,metadata);
    await this.recheck(input,loaded.bundle);
    let overlay:DemoOverlayState;
    try{overlay=DemoOverlayStateSchema.parse(await this.config.store.put(loaded.key,change,this.now()));}
    catch(error){if(error instanceof DemoOverlayConflict)throw new ApiFailure('VERSION_CONFLICT',input.context.contextId);
      throw error;}
    if(overlay.version!==change.expectedVersion+1)throw new ApiFailure('VERSION_CONFLICT',input.context.contextId);
    return this.finish(input,loaded,overlay);
  }
  async reset(input:CalendarReadRequest,metadata:DemoSnapshot,raw:unknown):Promise<DemoOverlayResult>{
    const change=DemoOverlayResetSchema.parse(raw);
    return this.put(input,metadata,{expectedVersion:change.expectedVersion,value:{}});
  }
}
