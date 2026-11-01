import {z} from 'zod';
import {
  SelfProfileSchema,SelfProfilePatchSchema,SelfConsentSchema,SelfConsentPutSchema,
  OwnerWorkspaceRecordSchema,OwnerWorkspaceCreateSchema,OwnerWorkspaceUpdateSchema,
  OwnerWorkspaceDeleteSchema,WorkspaceKindSchema,OwnerTranscriptSchema,
  CourseCatalogPageSchema,CourseOfferingsPageSchema,OpportunityCatalogPageSchema,
  OpportunityCatalogDetailSchema,
} from '@hufs-one/contracts';
import type {WorkspaceKind,OwnerWorkspaceRecord,OwnerWorkspaceValue} from '@hufs-one/contracts';
import {HufsApiError,clientInput,requireMatchingReceipt} from './api-error.js';

export interface BrowserRequestOptions {
  method?:'GET'|'POST'|'PATCH'|'PUT'|'DELETE';body?:unknown;
  signal?:AbortSignal|undefined;csrf?:string|undefined;
}
export type BrowserRequest=<T>(path:string,schema:z.ZodType<T>,options?:BrowserRequestOptions)=>Promise<T>;
const Id=z.string().regex(/^[A-Za-z0-9_-]{1,90}$/);
const CatalogId=z.string().regex(/^[A-Za-z0-9_:-]{1,90}$/);
const Limit=z.number().int().min(1).max(50);
const Iso=z.iso.datetime({offset:true});
const WorkspaceQuerySchema=z.strictObject({afterId:Id.optional(),limit:Limit.optional()});
const CatalogQuerySchema=z.strictObject({q:z.string().trim().min(2).max(100).optional(),
  afterId:CatalogId.optional(),limit:Limit.optional(),asOf:Iso.optional()});
const OfferingQuerySchema=z.strictObject({afterId:z.string().regex(/^20\d{2}-[12]$/).optional(),
  limit:Limit.optional(),asOf:Iso.optional()});
export type WorkspaceQuery=z.infer<typeof WorkspaceQuerySchema>;
export type CatalogQuery=z.infer<typeof CatalogQuerySchema>;
export type OfferingQuery=z.infer<typeof OfferingQuerySchema>;
const ProfileRead=z.strictObject({profile:SelfProfileSchema.nullable()});
const ProfileWrite=z.strictObject({profile:SelfProfileSchema});
const ConsentsRead=z.strictObject({consents:SelfConsentSchema.nullable()});
const ConsentsWrite=z.strictObject({consents:SelfConsentSchema});
const ItemRead=z.strictObject({item:OwnerWorkspaceRecordSchema.nullable()});
const ItemWrite=z.strictObject({item:OwnerWorkspaceRecordSchema});
const WorkspacePage=z.strictObject({items:z.array(OwnerWorkspaceRecordSchema).max(50),nextCursor:Id.nullable()});
const DeleteReceipt=z.strictObject({version:z.number().int().min(1)});
const FromOpportunity=z.strictObject({itemId:Id,opportunityId:Id});
const Paths:Record<WorkspaceKind,string>={EXPERIENCE:'/api/experience/cards',
  STUDY_PLAN:'/api/study-plans',BOOKMARK:'/api/saved-items',ACTION_PLAN:'/api/action-plans'};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function unavailable():never {throw new HufsApiError('PROVIDER_UNAVAILABLE',503);}
function queryPath(path:string,query:Record<string,string|number|undefined>):string {
  const parts=new URLSearchParams();
  for(const [key,value] of Object.entries(query))if(value!==undefined)parts.set(key,String(value));
  const suffix=parts.toString();return suffix?path+'?'+suffix:path;
}
function assertPage<T>(page:{items:T[];nextCursor:string|null;asOf?:string},
  query:Pick<CatalogQuery,'afterId'|'limit'|'asOf'>,id:(item:T)=>string):void {
  if(page.items.length>(query.limit??50))unavailable();
  let previous=query.afterId??'';
  for(const item of page.items){const current=id(item);if(current<=previous)unavailable();previous=current;}
  if(page.nextCursor!==null&&(!page.items.length||page.nextCursor!==previous))unavailable();
  if(query.asOf!==undefined&&(page.asOf===undefined||Date.parse(page.asOf)!==Date.parse(query.asOf)))unavailable();
}
function freshSource(source:{verifiedAt?:string|undefined},asOf:string):void {
  if(source.verifiedAt!==undefined&&Date.parse(source.verifiedAt)>Date.parse(asOf))unavailable();
}
function matchItem(item:OwnerWorkspaceRecord,id:string,kind:WorkspaceKind,
  version?:number,value?:OwnerWorkspaceValue):void {
  requireMatchingReceipt(item.itemId===id&&item.value.kind===kind
    &&(version===undefined||item.version===version)&&(value===undefined||same(item.value,value)));
}

/** Owner-private REST operations. No demo subject, actor, role, permission token,
 * browser storage or provider credentials can be supplied by the caller.
 * Use a session-scoped operation guard before committing results to the UI.
 */
export class HufsOwnerApiClient {
  constructor(private readonly request:BrowserRequest,
    private readonly csrf:(signal?:AbortSignal)=>Promise<{csrfToken:string}>){ }
  private async mutate<T>(path:string,schema:z.ZodType<T>,method:'POST'|'PUT'|'PATCH'|'DELETE',
    body:unknown,signal?:AbortSignal):Promise<T>{
    const {csrfToken}=await this.csrf(signal);
    return this.request(path,schema,{method,body,csrf:csrfToken,signal});
  }
  getProfile(signal?:AbortSignal){return this.request('/api/profile',ProfileRead,{signal});}
  async updateProfile(change:z.infer<typeof SelfProfilePatchSchema>,signal?:AbortSignal){
    const input=clientInput(SelfProfilePatchSchema,change);
    const result=await this.mutate('/api/profile',ProfileWrite,'PATCH',input,signal);
    requireMatchingReceipt(result.profile.version===input.expectedVersion+1&&same(result.profile.value,input.value));
    return result;
  }
  getConsents(signal?:AbortSignal){return this.request('/api/consents',ConsentsRead,{signal});}
  async updateConsents(change:z.infer<typeof SelfConsentPutSchema>,signal?:AbortSignal){
    const input=clientInput(SelfConsentPutSchema,change);
    const result=await this.mutate('/api/consents',ConsentsWrite,'PUT',input,signal);
    requireMatchingReceipt(result.consents.version===input.expectedVersion+1&&same(result.consents.choices,input.choices));
    return result;
  }
  async listWorkspace(kind:WorkspaceKind,query:WorkspaceQuery={},signal?:AbortSignal){
    const k=clientInput(WorkspaceKindSchema,kind),q=clientInput(WorkspaceQuerySchema,query);
    const page=await this.request(queryPath(Paths[k],q),WorkspacePage,{signal});
    assertPage(page,q,item=>item.itemId);
    if(page.items.some(item=>item.value.kind!==k))unavailable();
    return page;
  }
  async getExperience(itemId:string,signal?:AbortSignal){
    const id=clientInput(Id,itemId);
    const result=await this.request(Paths.EXPERIENCE+'/'+id,ItemRead,{signal});
    if(result.item)matchItem(result.item,id,'EXPERIENCE');
    return result;
  }
  async createWorkspace(change:z.infer<typeof OwnerWorkspaceCreateSchema>,signal?:AbortSignal){
    const input=clientInput(OwnerWorkspaceCreateSchema,change);
    const result=await this.mutate(Paths[input.value.kind],ItemWrite,'POST',input,signal);
    matchItem(result.item,input.itemId,input.value.kind,1,input.value);return result;
  }
  async updateWorkspace(itemId:string,change:z.infer<typeof OwnerWorkspaceUpdateSchema>,signal?:AbortSignal){
    const id=clientInput(Id,itemId),input=clientInput(OwnerWorkspaceUpdateSchema,change);
    if(input.value.kind==='BOOKMARK')throw new HufsApiError('INVALID_INPUT',422);
    const method=input.value.kind==='STUDY_PLAN'?'PUT':'PATCH';
    const result=await this.mutate(Paths[input.value.kind]+'/'+id,ItemWrite,method,input,signal);
    matchItem(result.item,id,input.value.kind,input.expectedVersion+1,input.value);return result;
  }
  async deleteWorkspace(kind:'EXPERIENCE'|'BOOKMARK',itemId:string,expectedVersion:number,signal?:AbortSignal){
    const k=clientInput(z.enum(['EXPERIENCE','BOOKMARK']),kind),id=clientInput(Id,itemId);
    const input=clientInput(OwnerWorkspaceDeleteSchema,{expectedVersion});
    const result=await this.mutate(Paths[k]+'/'+id,DeleteReceipt,'DELETE',input,signal);
    requireMatchingReceipt(result.version===expectedVersion+1);return result;
  }
  async createExperienceFromOpportunity(change:z.infer<typeof FromOpportunity>,signal?:AbortSignal){
    const input=clientInput(FromOpportunity,change);
    const result=await this.mutate('/api/experience/from-opportunity',ItemWrite,'POST',input,signal);
    matchItem(result.item,input.itemId,'EXPERIENCE',1);
    requireMatchingReceipt(result.item.value.kind==='EXPERIENCE'&&result.item.value.state==='DRAFT'
      &&result.item.value.summary===''&&result.item.value.sourceOpportunityId===input.opportunityId);
    return result;
  }
  async getTranscript(signal?:AbortSignal){
    const result=await this.request('/api/academics/transcript',z.strictObject({transcript:OwnerTranscriptSchema}),{signal});
    if(Date.parse(result.transcript.reviewedAt)>Date.parse(result.transcript.asOf))unavailable();
    return result;
  }
  async listCourses(query:CatalogQuery={},signal?:AbortSignal){
    const q=clientInput(CatalogQuerySchema,query);
    const page=await this.request(queryPath('/api/courses',q),CourseCatalogPageSchema,{signal});
    assertPage(page,q,item=>item.courseId);
    for(const item of page.items)freshSource(item.source,page.asOf);
    return page;
  }
  async listCourseOfferings(courseId:string,query:OfferingQuery={},signal?:AbortSignal){
    const id=clientInput(CatalogId,courseId),q=clientInput(OfferingQuerySchema,query);
    const page=await this.request(queryPath('/api/courses/'+encodeURIComponent(id)+'/offerings',q),CourseOfferingsPageSchema,{signal});
    assertPage(page,q,item=>item.term);
    for(const item of page.items){if(item.courseId!==id)unavailable();freshSource(item.source,page.asOf);}
    return page;
  }
  async listOpportunities(query:CatalogQuery={},signal?:AbortSignal){
    const q=clientInput(CatalogQuerySchema,query);
    const page=await this.request(queryPath('/api/opportunities',q),OpportunityCatalogPageSchema,{signal});
    assertPage(page,q,item=>item.opportunity.id);
    for(const item of page.items){
      freshSource(item.source,page.asOf);
      freshSource(item.opportunity,page.asOf);
    }
    return page;
  }
  async getOpportunity(opportunityId:string,signal?:AbortSignal){
    const id=clientInput(CatalogId,opportunityId);
    const result=await this.request('/api/opportunities/'+encodeURIComponent(id),OpportunityCatalogDetailSchema,{signal});
    requireMatchingReceipt(result.opportunity.id===id);return result;
  }
}
