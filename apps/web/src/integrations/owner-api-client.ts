import {z} from 'zod';
import {OwnerExperienceCourseResponseSchema} from '@hufs-one/contracts';
import {FeatureAdditions as V} from '@hufs-one/contracts';
import {
  SelfProfileSchema,SelfProfilePatchSchema,SelfConsentSchema,SelfConsentPutSchema,
  OwnerWorkspaceRecordSchema,OwnerWorkspaceCreateSchema,OwnerWorkspaceUpdateSchema,
  OwnerWorkspaceDeleteSchema,WorkspaceKindSchema,OwnerTranscriptSchema,
  CourseCatalogPageSchema,CourseOfferingsPageSchema,OpportunityCatalogPageSchema,
  OpportunityCatalogDetailSchema,
  OwnerFeedResponseSchema,
  BookmarkStageSchema,BookmarkOutcomeSchema,BookmarkStagePatchSchema,isNextBookmarkStage,
  OwnerStudyPlanCheckRequestSchema,OwnerStudyPlanCheckResponseSchema,
  OwnerMajorWhatIfRequestSchema,OwnerMajorWhatIfResponseSchema,
  OpportunityExplanationRequestSchema,OpportunityExplanationResponseSchema,
  OpportunityRevisionComparisonRequestSchema,OpportunityRevisionComparisonResponseSchema,
  OpportunityRevisionComparisonContextResponseSchema,
  HufsAbilityMenuManifestSchema,SyntheticClubBoardResponseSchema,
  DemoProfileSaveSchema,DemoProfileResetSchema,DemoProfileResponseSchema,blankDemoProfileValue,
  DemoProfileWorkspaceSaveSchema,blankDemoProfileWorkspace,
  OwnerDoubleMajorAuditSchema,PrivateOwnerIntakeResponseSchema,
  ApprovedProviderInputsSchema,ApprovedProviderInputSchema,ProviderRunRequestSchema,
  ProviderAcceptedSchema,ProviderStoredJobSchema,AI_TASK_PATHS,AiTaskPathSchema,
  SyntheticClubDetailResponseSchema,SyntheticClubAdminListResponseSchema,SyntheticClubCreateSchema,
  SyntheticClubEditSchema,SyntheticClubWriteResponseSchema,SyntheticClubDecisionRequestSchema,
  SyntheticClubDecisionResponseSchema,
  ExperiencePortfolioSchema,ExperiencePortfolioQuerySchema,
  ExperienceTagApprovalSchema,ExperienceTagApprovalPutSchema,ExperienceTagApprovalDeleteSchema,
  ExperienceSkillPrepareRequestSchema,ExperienceSkillPrepareResponseSchema,ExperienceSkillCandidateResponseSchema,
} from '@hufs-one/contracts';
import type {WorkspaceKind,OwnerWorkspaceRecord,OwnerWorkspaceValue} from '@hufs-one/contracts';
import type {ApprovedProviderInput,AiTaskPath} from '@hufs-one/contracts';
import {HufsApiError,clientInput,requireMatchingReceipt} from './api-error.js';
import {ActivityArchiveResponseSchema,ActivityForecastSchema,ExchangePartnerListSchema,
  ExchangeApplicantSchema,ExchangeResultSchema,FaqAskResponseSchema} from '@hufs-one/contracts';
import type {ExchangeApplicant} from '@hufs-one/contracts';
const CampusToken=z.string().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/);

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
const ExperienceTagResult=z.strictObject({approval:ExperienceTagApprovalSchema});
const PortfolioQuery=ExperiencePortfolioQuerySchema.omit({view:true});
const BookmarkAdvance=z.strictObject({stage:BookmarkStageSchema,outcome:BookmarkOutcomeSchema.optional()});
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
  /** #124: original HUFSAbility menus are informational; no school login or
   * unverified internal routes are made available through this method.
   * Invalidate the consuming screen on session/snapshot changes.
   */
  getHufsAbilityCapabilities(signal?:AbortSignal){
    return this.request('/api/hufsability/capabilities',HufsAbilityMenuManifestSchema,{signal});
  }
  /** #123: simulated student-specific club recommendations. The server chooses
   * the synthetic identity and review history; never send actor/profile IDs.
   */
  listSyntheticClubs(signal?:AbortSignal){
    return this.request('/api/synthetic/clubs',SyntheticClubBoardResponseSchema,{signal});
  }
  async getSyntheticClub(clubId:string,signal?:AbortSignal){
    const id=clientInput(z.string().regex(/^SYN-CLUB-[0-9]{3}$/),clubId);
    const detail=await this.request('/api/synthetic/clubs/'+id,
      SyntheticClubDetailResponseSchema,{signal});
    requireMatchingReceipt(detail.item.post.id===id);return detail;
  }
  /** Independent ADMIN-only synthetic publication; server rechecks the grant
   * inside the durable transaction. This client never supplies actor/asOf/source. */
  listSyntheticClubModeration(signal?:AbortSignal){
    return this.request('/api/admin/synthetic/clubs',SyntheticClubAdminListResponseSchema,{signal});
  }
  async createSyntheticClub(change:z.infer<typeof SyntheticClubCreateSchema>,signal?:AbortSignal){
    const input=clientInput(SyntheticClubCreateSchema,change);
    const result=await this.mutate('/api/admin/synthetic/clubs',SyntheticClubWriteResponseSchema,'POST',input,signal);
    const {id,state,createdAt,updatedAt,approvedAt,...content}=result.record.post;
    requireMatchingReceipt(id===input.id&&result.record.version===1&&state==='REVIEW_PENDING'
      &&approvedAt===undefined&&same(content,input.content));
    return result;
  }
  async editSyntheticClub(clubId:string,change:z.infer<typeof SyntheticClubEditSchema>,signal?:AbortSignal){
    const id=clientInput(z.string().regex(/^SYN-CLUB-[0-9]{3}$/),clubId),input=clientInput(SyntheticClubEditSchema,change);
    const result=await this.mutate('/api/admin/synthetic/clubs/'+id,SyntheticClubWriteResponseSchema,'PATCH',input,signal);
    const {id:receivedId,state,createdAt,updatedAt,approvedAt,...content}=result.record.post;
    requireMatchingReceipt(receivedId===id&&result.record.version===input.expectedVersion+1&&state==='REVIEW_PENDING'
      &&approvedAt===undefined&&same(content,input.content));return result;
  }
  async decideSyntheticClub(clubId:string,change:z.infer<typeof SyntheticClubDecisionRequestSchema>,signal?:AbortSignal){
    const id=clientInput(z.string().regex(/^SYN-CLUB-[0-9]{3}$/),clubId),input=clientInput(SyntheticClubDecisionRequestSchema,change);
    const result=await this.mutate('/api/admin/synthetic/clubs/'+id+'/decision',SyntheticClubDecisionResponseSchema,'POST',input,signal);
    const state={APPROVE:'APPROVED',REJECT:'REJECTED',REVOKE:'REVOKED'}[input.decision];
    requireMatchingReceipt(result.id===id&&result.version===input.expectedVersion+1&&result.state===state);return result;
  }
  getProfile(signal?:AbortSignal){return this.request('/api/profile',ProfileRead,{signal});}
  /** Authenticated BETA's own attested CSV, never a selected S01–S05 demo identity. */
  getPrivateIntake(signal?:AbortSignal){return this.request('/api/private-intake/self',PrivateOwnerIntakeResponseSchema,{signal});}
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
  /** This cursor page is never a complete account-wide recommendation signal. */
  async getExperiencePortfolio(query:z.input<typeof PortfolioQuery>={},signal?:AbortSignal){
    const q=clientInput(PortfolioQuery,query);
    const page=await this.request(queryPath(Paths.EXPERIENCE,{...q,view:'portfolio'}),ExperiencePortfolioSchema,{signal});
    assertPage(page,{...q,limit:q.limit??20},item=>item.itemId);
    return page;
  }
  async getExperienceTagApproval(experienceId:string,signal?:AbortSignal){
    const id=clientInput(Id,experienceId);
    return this.request(Paths.EXPERIENCE+'/'+id+'/tag-approval',ExperienceTagResult,{signal});
  }
  /** Explicit owner selection, not an AI credential or a sharing grant. */
  async approveExperienceTags(experienceId:string,change:z.infer<typeof ExperienceTagApprovalPutSchema>,signal?:AbortSignal){
    const id=clientInput(Id,experienceId),input=clientInput(ExperienceTagApprovalPutSchema,change);
    const result=await this.mutate(Paths.EXPERIENCE+'/'+id+'/tag-approval',ExperienceTagResult,'PUT',input,signal);
    const a=result.approval;
    requireMatchingReceipt(a.state==='ACTIVE'&&a.version===input.expectedApprovalVersion+1
      &&a.contentVersion===input.expectedContentVersion&&a.consentVersion===input.expectedConsentVersion
      &&same(a.topics,input.topics));
    return result;
  }
  async revokeExperienceTags(experienceId:string,change:z.infer<typeof ExperienceTagApprovalDeleteSchema>,signal?:AbortSignal){
    const id=clientInput(Id,experienceId),input=clientInput(ExperienceTagApprovalDeleteSchema,change);
    const result=await this.mutate(Paths.EXPERIENCE+'/'+id+'/tag-approval',ExperienceTagResult,'DELETE',input,signal);
    const a=result.approval;
    requireMatchingReceipt(a.state==='INACTIVE'&&(a.version===input.expectedApprovalVersion+1&&a.reason==='REVOKED'
      ||input.expectedApprovalVersion===0&&a.version===0&&a.reason==='NOT_APPROVED'));
    return result;
  }
  /** Only discovers operator-approved inputs. It does not run a provider or approve tags. */
  async prepareExperienceSkills(change:z.infer<typeof ExperienceSkillPrepareRequestSchema>,signal?:AbortSignal){
    const input=clientInput(ExperienceSkillPrepareRequestSchema,change);
    const result=await this.mutate('/api/experience/ai-skills/prepare',ExperienceSkillPrepareResponseSchema,'POST',input,signal);
    const received=[...result.items.map(i=>i.experienceId),...result.unavailable];
    requireMatchingReceipt(received.length===input.experienceIds.length
      &&received.every(id=>input.experienceIds.includes(id))
      &&result.items.every(i=>Date.parse(i.asOf)<Date.parse(i.expiresAt)));
    return result;
  }
  /** jobId must come from this session's explicit submit response; never guess a latest job. */
  async getExperienceSkillCandidate(experienceId:string,jobId:string,signal?:AbortSignal){
    const id=clientInput(Id,experienceId),job=clientInput(z.uuid(),jobId);
    const result=await this.request(Paths.EXPERIENCE+'/'+id+'/ai-skills/'+job,ExperienceSkillCandidateResponseSchema,{signal});
    requireMatchingReceipt(result.experienceId===id&&result.jobId===job&&result.candidate.task==='experience_skills');
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
  /**
   * Owner-only #80 self-reported application progression, never a real submission.
   * The complete prior record binds CAS, the immutable opportunity and data mode.
   * Route and state machine belong to Agent 05 (#97); UI writes use
   * OwnerSessionController.runMutation to reject duplicate clicks.
   */
  async advanceBookmarkStage(bookmark:OwnerWorkspaceRecord,
    change:z.infer<typeof BookmarkAdvance>,signal?:AbortSignal){
    const previous=clientInput(OwnerWorkspaceRecordSchema,bookmark);
    if(previous.value.kind!=='BOOKMARK')throw new HufsApiError('INVALID_INPUT',422);
    const next=clientInput(BookmarkAdvance,change);
    const patch=clientInput(BookmarkStagePatchSchema,{...next,expectedVersion:previous.version});
    if(!isNextBookmarkStage(previous.value.stage,patch.stage))
      throw new HufsApiError('VERSION_CONFLICT',409);
    const result=await this.mutate(Paths.BOOKMARK+'/'+previous.itemId,ItemWrite,'PATCH',patch,signal);
    matchItem(result.item,previous.itemId,'BOOKMARK',previous.version+1);
    requireMatchingReceipt(result.item.value.kind==='BOOKMARK'
      &&result.item.value.state==='SAVED'
      &&result.item.value.opportunityId===previous.value.opportunityId
      &&result.item.value.dataMode===previous.value.dataMode
      &&result.item.value.stage===patch.stage
      &&same(result.item.value.outcome,patch.outcome));
    return result;
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
  /** #375 current purpose-granted links only, no browser-supplied transcript. */
  getExperienceCourseEvidence(signal?:AbortSignal){
    return this.request('/api/owner/academics/experience-courses',OwnerExperienceCourseResponseSchema,{signal});
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
  /** Current authorized owner feed version; never infer from S01–S05 synthetic snapshots. */
  getOwnerFeed(signal?:AbortSignal){
    return this.request('/api/owner/feed',OwnerFeedResponseSchema,{signal});
  }
  async getOpportunity(opportunityId:string,signal?:AbortSignal){
    const id=clientInput(CatalogId,opportunityId);
    const result=await this.request('/api/opportunities/'+encodeURIComponent(id),OpportunityCatalogDetailSchema,{signal});
    requireMatchingReceipt(result.opportunity.id===id);return result;
  }
  /** Private read-only calculations still use POST/CSRF. Render through
   * OwnerSessionController.runLatest so late actor/tab responses are dropped. */
  async checkStudyPlan(change:z.infer<typeof OwnerStudyPlanCheckRequestSchema>,signal?:AbortSignal){
    const input=clientInput(OwnerStudyPlanCheckRequestSchema,change);
    const result=await this.mutate('/api/study-plans/check',OwnerStudyPlanCheckResponseSchema,'POST',input,signal);
    requireMatchingReceipt(result.term===input.term
      &&(input.expectedPlanVersion===undefined||result.versions.plan===input.expectedPlanVersion));
    return result;
  }
  async checkMajorWhatIf(change:z.infer<typeof OwnerMajorWhatIfRequestSchema>,signal?:AbortSignal){
    const input=clientInput(OwnerMajorWhatIfRequestSchema,change);
    const result=await this.mutate('/api/academics/major-what-if',OwnerMajorWhatIfResponseSchema,'POST',input,signal);
    requireMatchingReceipt(same(result.scenario,input.scenario));
    return result;
  }
  async explainOpportunity(opportunityId:string,change:z.infer<typeof OpportunityExplanationRequestSchema>,signal?:AbortSignal){
    const id=clientInput(CatalogId,opportunityId),input=clientInput(OpportunityExplanationRequestSchema,change);
    const result=await this.mutate('/api/opportunities/'+encodeURIComponent(id)+'/explanation',
      OpportunityExplanationResponseSchema,'POST',input,signal);
    requireMatchingReceipt(result.opportunityId===id&&result.sourceRevisionId===input.sourceRevisionId
      &&result.rankConfigVersion===input.rankConfigVersion&&Date.parse(result.asOf)===Date.parse(input.asOf));
    return result;
  }
  /** Server-authorized exact current, independently reviewed pair only.
   * Never derive or guess revision IDs from public feed card contents. */
  async getRevisionComparisonContext(opportunityId:string,asOf:string,signal?:AbortSignal){
    const id=clientInput(z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),opportunityId),
      at=clientInput(Iso,asOf);
    const result=await this.request(queryPath('/api/opportunities/'+encodeURIComponent(id)+
      '/revisions/comparison-context',{asOf:at}),OpportunityRevisionComparisonContextResponseSchema,{signal});
    requireMatchingReceipt(result.opportunityId===id&&result.asOf===at);
    return result;
  }
  async compareOpportunityRevisions(opportunityId:string,change:z.infer<typeof OpportunityRevisionComparisonRequestSchema>,signal?:AbortSignal){
    const id=clientInput(CatalogId,opportunityId),input=clientInput(OpportunityRevisionComparisonRequestSchema,change);
    const result=await this.mutate('/api/opportunities/'+encodeURIComponent(id)+'/revisions/compare',
      OpportunityRevisionComparisonResponseSchema,'POST',input,signal);
    requireMatchingReceipt(result.opportunityId===id&&result.beforeRevisionId===input.beforeRevisionId
      &&result.afterRevisionId===input.afterRevisionId&&Date.parse(result.asOf)===Date.parse(input.asOf));
    return result;
  }
  /** #144 Approved Owner double-major read; server binds exact actor, consent, effective RulePack and heads.
   * Never send an actor ID, hypothetical major or school rule from the browser.
   */
  getDoubleMajor(signal?:AbortSignal){
    return this.request('/api/academics/double-major',OwnerDoubleMajorAuditSchema,{signal});
  }
  /** #132 Independent EMPTY_DEMO, never a demo subject or reviewer session.
   * Server derives BETA actor; no-store and CSRF are enforced by this client.
   * The profile/snapshot version match is validated by the response schema.
   */
  readDemoProfile(signal?:AbortSignal){
    return this.request('/api/demo-profile',DemoProfileResponseSchema,{signal});
  }
  async saveDemoProfile(change:z.infer<typeof DemoProfileSaveSchema>,signal?:AbortSignal){
    const input=clientInput(DemoProfileSaveSchema,change);
    const result=await this.mutate('/api/demo-profile',DemoProfileResponseSchema,'PATCH',input,signal);
    requireMatchingReceipt(result.profile.version===input.expectedVersion+1
      &&same(result.profile.value,input.value));
    return result;
  }
  async saveDemoWorkspace(change:z.infer<typeof DemoProfileWorkspaceSaveSchema>,signal?:AbortSignal){
    const input=clientInput(DemoProfileWorkspaceSaveSchema,change);
    const result=await this.mutate('/api/demo-profile/workspace',DemoProfileResponseSchema,'PUT',input,signal);
    requireMatchingReceipt(result.profile.version===input.expectedVersion+1
      &&same(result.profile.workspace,input.workspace));
    return result;
  }
  async resetDemoProfile(change:z.infer<typeof DemoProfileResetSchema>,signal?:AbortSignal){
    const input=clientInput(DemoProfileResetSchema,change);
    const result=await this.mutate('/api/demo-profile/reset',DemoProfileResponseSchema,'POST',input,signal);
    requireMatchingReceipt(result.profile.version===input.expectedVersion+1
      &&same(result.profile.value,blankDemoProfileValue())
      &&same(result.profile.workspace,blankDemoProfileWorkspace()));
    return result;
  }

  /** Separate from REVIEWER MOCK. Only a currently authorized BETA owner may use
   * these operations; a listed ref is metadata, NOT execution authorization. */
  getApprovedProviderInputs(signal?:AbortSignal){
    return this.request('/api/ai/approved-inputs',ApprovedProviderInputsSchema,{signal});
  }
  async submitApprovedProvider(input:ApprovedProviderInput,taskPath:AiTaskPath,
    idempotencyKey:string,signal?:AbortSignal){
    const approved=clientInput(ApprovedProviderInputSchema,input);
    const path=clientInput(AiTaskPathSchema,taskPath);
    if(AI_TASK_PATHS[path]!==approved.task)throw new HufsApiError('INVALID_INPUT',422);
    const payload=clientInput(ProviderRunRequestSchema,{packetRef:approved.inputRef,
      asOf:approved.asOf,idempotencyKey});
    const result=await this.mutate('/api/ai/'+path,ProviderAcceptedSchema,'POST',payload,signal);
    return result;
  }
  async readApprovedProviderJob(jobId:string,taskPath:AiTaskPath,signal?:AbortSignal){
    const id=clientInput(z.uuid(),jobId),task=clientInput(AiTaskPathSchema,taskPath);
    const result=await this.request('/api/ai/jobs/'+id,ProviderStoredJobSchema,{signal});
    requireMatchingReceipt(result.candidate.task===AI_TASK_PATHS[task]);
    return result;
  }


  /** #367: configured source ports only. Rights and data freshness are checked on actual reads. */
  getCampusAssistCapabilities(signal?:AbortSignal){
    return this.request('/api/owner/campus-assist/capabilities',z.strictObject({
      activities:z.boolean(),exchange:z.boolean(),faq:z.boolean(),hcx007:z.boolean(),
    }),{signal});
  }
  /** #343/#349: current owner-only read, never browser-created sources. */
  getOwnerPreparation(signal?:AbortSignal){
    return this.request('/api/owner/features/v2/preparation',V.OwnerPreparationResponseSchema,{signal});
  }
  /** #366/#348: server signs all cursors and revalidates owner/consent/source on every page. */
  async searchApprovedV2Catalog(query:z.input<typeof V.OwnerV2CatalogQuerySchema>={},signal?:AbortSignal){
    const input=clientInput(V.OwnerV2CatalogQuerySchema,query);
    const path=queryPath('/api/owner/features/v2/catalog',{
      ...(input.q!==undefined?{q:input.q}:{}),
      ...(input.category?{category:input.category}:{}),
      ...(input.campus?{campus:input.campus}:{}),
      ...(input.eligibility?{eligibility:input.eligibility}:{}),
      ...(input.deadlineBefore?{deadlineBefore:input.deadlineBefore}:{}),
      ...(input.includeClosed!==undefined?{includeClosed:String(input.includeClosed)}:{}),
      sort:input.sort,pageSize:input.pageSize,
      ...(input.asOf?{asOf:input.asOf}:{}),...(input.cursor?{cursor:input.cursor}:{}),
    });
    const result=await this.request(path,V.OwnerV2CatalogResponseSchema,{signal});
    if(input.asOf&&result.state==='READY')
      requireMatchingReceipt(Date.parse(result.page.at)===Date.parse(input.asOf));
    return result;
  }
  /** #366: caller chooses only purpose filters; official offices and rights come from the server. */
  findCounseling(change:{purposes:string[];campus?:string;language?:string},signal?:AbortSignal){
    const params=clientInput(z.strictObject({
      purposes:z.array(z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/)).min(1).max(5),
      campus:z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/).optional(),
      language:z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/).optional(),
    }),change);
    const response=z.discriminatedUnion('state',[
      z.strictObject({state:z.literal('NOT_CONNECTED'),asOf:Iso}),
      z.strictObject({state:z.literal('READY'),asOf:Iso,sourceVersion:z.string().min(1).max(128),
        guide:V.CounselingGuideV2Schema}),
    ]);
    return this.mutate('/api/owner/counseling/routes',response,'POST',params,signal);
  }
  /** #339: the server owns the rights-gated source data. Never accept browser source payloads. */
  listCampusActivities(query:{asOf:string;organizationId?:string;year?:number;query?:string},signal?:AbortSignal){
    const checked=clientInput(z.strictObject({asOf:Iso,organizationId:CampusToken.optional(),
      year:z.number().int().min(2000).max(2200).optional(),query:z.string().max(100).optional()}),query);
    return this.request(queryPath('/api/owner/activities',checked),ActivityArchiveResponseSchema,{signal});
  }
  getCampusActivityForecast(query:{asOf:string;organizationId:string;seriesId:string;targetYear:number},signal?:AbortSignal){
    const checked=clientInput(z.strictObject({asOf:Iso,organizationId:CampusToken,
      seriesId:CampusToken,targetYear:z.number().int().min(2000).max(2200)}),query);
    const result=this.request(queryPath('/api/owner/activities/forecast',checked),
      ActivityForecastSchema,{signal});
    return result;
  }
  /** #340: one current server-approved partner rule per track; missing or forked rules stay UNKNOWN. */
  listExchangePartners(asOf:string,signal?:AbortSignal){
    const at=clientInput(Iso,asOf);
    return this.request(queryPath('/api/owner/exchange/partners',{asOf:at}),ExchangePartnerListSchema,{signal});
  }
  async checkExchangeEligibility(change:{asOf:string;partnerId:string;applicant:ExchangeApplicant},signal?:AbortSignal){
    const input=clientInput(z.strictObject({asOf:Iso,partnerId:CampusToken,
      applicant:ExchangeApplicantSchema}),change);
    const result=await this.mutate('/api/owner/exchange/evaluate',ExchangeResultSchema,'POST',input,signal);
    requireMatchingReceipt(Date.parse(result.asOf)===Date.parse(input.asOf));
    return result;
  }
  /** #341: no local model/keys; only the bounded, authorized server-side FAQ query. */
  async askCampusFaq(change:{asOf:string;question:string},signal?:AbortSignal){
    const input=clientInput(z.strictObject({asOf:Iso,question:z.string().trim().min(2).max(500)}),change);
    const result=await this.mutate('/api/owner/faq/ask',FaqAskResponseSchema,'POST',input,signal);
    requireMatchingReceipt(Date.parse(result.asOf)===Date.parse(input.asOf));
    return result;
  }
}
