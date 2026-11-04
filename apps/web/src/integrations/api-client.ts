import {z} from 'zod';
import {
  ReviewerSandboxClientActionSchema, ReviewerSandboxClientResultSchema,
} from './reviewer-sandbox-contract.js';
import type {ReviewerSandboxClientAction,ReviewerSandboxClientResult}
  from './reviewer-sandbox-contract.js';
import {
  AiTaskPathSchema, AiTaskSchema, TopicCodeSchema, ApiErrorSchema, CalendarResultSchema,
  DemoContextSchema, DemoProfilesResponseSchema, DemoSnapshotSchema, SubjectAliasSchema, httpStatusForError,
  RetrievalEnvelopeVNextSchema, DemoOverlayPutSchema, DemoOverlayResetSchema,
  DemoOverlayResultSchema, ExperienceTagApprovalSchema, ExperienceTagApprovalPutSchema,
  ExperienceTagApprovalDeleteSchema,
} from '@hufs-one/contracts';
import type {
  ApiErrorCode, AiTaskPath, CalendarResult, DemoContext, DemoProfileOption, DemoSnapshot, SubjectAlias,
  RetrievalEnvelopeVNext, DemoOverlayPut, DemoOverlayResult, ExperienceTagApprovalPut,
  ExperienceTagApprovalDelete,
} from '@hufs-one/contracts';

import {HufsApiError,clientInput} from './api-error.js';
import {HufsOwnerApiClient} from './owner-api-client.js';
import type {BrowserRequestOptions} from './owner-api-client.js';
export {HufsApiError} from './api-error.js';

const ExperienceTagResultSchema=z.strictObject({approval:ExperienceTagApprovalSchema});
const OwnerItemIdSchema=z.string().regex(/^[A-Za-z0-9_-]{1,90}$/);

/** Browser fetch only. No actor/role headers, localStorage, third-party URLs or provider keys. */
export type ApiFetch = (url: string, init: RequestInit) => Promise<Response>;

const CsrfSchema = z.strictObject({csrfToken:z.string().min(16)});
const ReviewerSectionSchema=z.enum([
  'TODAY','OPPORTUNITIES','NOTICES','EXPERIENCE','GRADUATION','COURSE_PLANNER',
  'OUTLOOK','SAVED','APPLICATIONS','SETTINGS',
]);
const ReviewerActionSchema=z.enum([
  'BOOKMARK','MARK_READ','CHECKLIST','EXPERIENCE','APPLICATION_DRAFT',
  'SIMULATE_APPLICATION','SET_INTERESTS','SET_DESIRED_JOBS','PLAN_COURSE',
  'SET_SEARCH','SET_NOTIFICATIONS','RESET_SANDBOX',
]);
const ReviewerCapabilitiesSchema = z.strictObject({
  role:z.literal('REVIEWER'), dataMode:z.literal('SYNTHETIC'),
  sandboxOnly:z.literal(true), ncpCalls:z.literal(false),
  externalSubmission:z.literal(false),
  sections:z.array(ReviewerSectionSchema).max(10),
  actions:z.array(ReviewerActionSchema).max(12),
  aiProvenance:z.literal('MOCK'),actualBrowserUiVerified:z.boolean(),
}).refine(v=>new Set(v.sections).size===v.sections.length
  &&new Set(v.actions).size===v.actions.length,
  {message:'Duplicate REVIEWER capability'});

const ReviewerEnrollmentSchema = z.strictObject({
  role:z.literal('REVIEWER'),accessEndsAt:z.iso.datetime({offset:true}),
  dataMode:z.literal('SYNTHETIC'),readOnly:z.boolean(),sandboxOnly:z.literal(true),
});
const TeamSessionSchema = z.strictObject({
  actorId:z.string().min(1),role:z.enum(['BETA','ADMIN']),
  schoolMailProofValid:z.literal(true),betaAllowed:z.literal(true),
});
const ReviewerSessionSchema = z.strictObject({
  role:z.literal('REVIEWER'),accessEndsAt:z.iso.datetime({offset:true}),
  dataMode:z.literal('SYNTHETIC'),readOnly:z.literal(false),sandboxOnly:z.literal(true),
});
const SessionSchema = z.union([TeamSessionSchema,ReviewerSessionSchema]);
const SchoolMailChallengeSchema=z.strictObject({
  challengeId:z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  expiresAt:z.iso.datetime({offset:true}),
});
const SchoolMailVerifiedSchema=z.strictObject({verified:z.boolean()});
const SchoolEmail=/^[A-Za-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@hufs\.ac\.kr$/;
const MailChallengeId=/^[A-Za-z0-9_-]{22}$/;
const MailCode=/^[0-9]{8}$/;

/** Use normal same-origin browser navigation, never fetch an OAuth redirect or accept a next URL. */
export function googleSignInPath(intent:'REVIEWER'|'BETA'):string {
  if(intent!=='REVIEWER'&&intent!=='BETA')
    throw new HufsApiError('INVALID_INPUT',422);
  return '/api/auth/google/start?intent='+intent;
}

const AiJobAcceptedSchema = z.strictObject({
  jobId:z.string().min(1),state:z.literal('NEEDS_REVIEW'),provenance:z.literal('MOCK'),
});
const AiJobCandidateSchema=z.strictObject({
  task:AiTaskSchema,reviewState:z.literal('NEEDS_REVIEW'),
  provenance:z.literal('MOCK'),
  citations:z.array(z.strictObject({
    sourceToken:z.string().min(1).max(128),
    paragraphId:z.string().min(1).max(128),
    quote:z.string().min(1).max(600),
    topicCode:TopicCodeSchema.optional(),
  })).max(6),
});
const AiJobResponseSchema=z.strictObject({
  jobId:z.string().min(1).max(100),state:z.literal('NEEDS_REVIEW'),
  task:AiTaskSchema,createdAt:z.iso.datetime({offset:true}),
  candidate:AiJobCandidateSchema,
}).refine(v=>v.task===v.candidate.task,{
  message:'Cross-task model candidate cannot be rendered',
});

const MAX_RESPONSE_BYTES=256*1024;
function assertNotAborted(signal?:AbortSignal):void {
  // Do not expose the caller's potentially private signal.reason to the UI.
  if(signal?.aborted)throw new DOMException('Request cancelled','AbortError');
}
function isAbort(error:unknown):boolean {
  return error instanceof Error&&error.name==='AbortError';
}
async function readBoundedJson(response:Response,signal?:AbortSignal):Promise<unknown> {
  assertNotAborted(signal);
  const contentType=response.headers.get('content-type')?.toLowerCase()??'';
  if(!contentType.startsWith('application/json'))
    throw new Error('Unexpected API content type');
  const header=response.headers.get('content-length');
  if(header!==null&&(!/^[0-9]+$/.test(header)
    ||Number(header)>MAX_RESPONSE_BYTES))
    throw new Error('Invalid or oversized API response');
  if(!response.body)throw new Error('Empty API JSON');
  const reader=response.body.getReader();
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  let size=0;
  const chunks:Uint8Array[]=[];
  try{
    assertNotAborted(signal);
    while(true){
      const step=await reader.read();
      assertNotAborted(signal);
      if(step.done)break;
      size+=step.value.byteLength;
      if(size>MAX_RESPONSE_BYTES){
        await reader.cancel();
        throw new Error('Oversized streamed API response');
      }
      chunks.push(step.value);
    }
  }finally{
    signal?.removeEventListener('abort',cancel);
    reader.releaseLock();
  }
  const buffer=new Uint8Array(size);
  let pos=0;
  for(const chunk of chunks){buffer.set(chunk,pos);pos+=chunk.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
}

function validApiPath(path: string): boolean {
  return path.startsWith('/api/') && !path.startsWith('//')
    && !/[\\#\u0000-\u001f]/.test(path);
}

/** Transport JSON is untrusted even on 200; never render server/SQL/provider error text. */
export class HufsApiClient {
  readonly owner:HufsOwnerApiClient;
  constructor(private readonly transport: ApiFetch =
    (url, init) => fetch(url, init)) {
    this.owner=new HufsOwnerApiClient((path,schema,options)=>this.request(path,schema,options),
      signal=>this.getCsrfProof(signal));
  }

  private async request<T>(
    path: string, schema: z.ZodType<T>,
    options: BrowserRequestOptions = {},
  ): Promise<T> {
    if (!validApiPath(path)) throw new HufsApiError('INVALID_INPUT',422);
    const method=options.method ?? 'GET';
    const headers: Record<string,string>={accept:'application/json'};
    if (method!=='GET') headers['content-type']='application/json';
    if (options.csrf) headers['x-csrf-token']=options.csrf;
    const init:RequestInit={
      method, headers, credentials:'same-origin', cache:'no-store',
      redirect:'error', mode:'same-origin', referrerPolicy:'no-referrer',
      ...(method!=='GET'?{body:JSON.stringify(options.body ?? {})}:{}),
      ...(options.signal?{signal:options.signal}:{}),
    };
    assertNotAborted(options.signal);
    let response:Response;
    try { response=await this.transport(path,init); }
    catch (error) {
      assertNotAborted(options.signal);
      if (isAbort(error)) throw new DOMException('Request cancelled','AbortError');
      throw new HufsApiError('PROVIDER_UNAVAILABLE',503);
    }
    if(options.signal?.aborted){
      void response.body?.cancel().catch(()=>{});
      assertNotAborted(options.signal);
    }
    if(response.status===204 && response.ok) {
      const parsed=schema.safeParse(undefined);
      if(parsed.success)return parsed.data;
      throw new HufsApiError('PROVIDER_UNAVAILABLE',503);
    }
    let payload:unknown;
    try {
      payload=await readBoundedJson(response,options.signal);
      assertNotAborted(options.signal);
    } catch (error) {
      assertNotAborted(options.signal);
      if(isAbort(error))throw new DOMException('Request cancelled','AbortError');
      // Do not echo a malformed response or its body into the UI.
      throw new HufsApiError(response.status===401?'UNAUTHENTICATED':'PROVIDER_UNAVAILABLE',
        response.status===401?401:503);
    }
    if(!response.ok) {
      const err=ApiErrorSchema.safeParse(payload);
      if(err.success && httpStatusForError(err.data)===response.status)
        throw new HufsApiError(err.data.code,response.status);
      throw new HufsApiError(response.status===401?'UNAUTHENTICATED':'PROVIDER_UNAVAILABLE',
        response.status===401?401:503);
    }
    const parsed=schema.safeParse(payload);
    if(!parsed.success)throw new HufsApiError('PROVIDER_UNAVAILABLE',503);
    return parsed.data;
  }

  async getSession(signal?:AbortSignal) {
    return this.request('/api/auth/session',SessionSchema,{signal});
  }

  /** Server-issued proof is required on every mutation. Never expose it in URLs. */
  async getCsrfProof(signal?:AbortSignal) {
    return this.request('/api/auth/csrf',CsrfSchema,{signal});
  }

  async requestSchoolMailProof(schoolEmail:string,signal?:AbortSignal) {
    if(typeof schoolEmail!=='string'||schoolEmail.length>254
      ||schoolEmail!==schoolEmail.toLowerCase()||!SchoolEmail.test(schoolEmail))
      throw new HufsApiError('INVALID_INPUT',422);
    const {csrfToken}=await this.getCsrfProof(signal);
    return this.request('/api/auth/school-mail/request',SchoolMailChallengeSchema,{
      method:'POST',csrf:csrfToken,signal,body:{schoolEmail},
    });
  }

  async confirmSchoolMailProof(input:{
    schoolEmail:string;challengeId:string;code:string;
  },signal?:AbortSignal) {
    if(!input||typeof input.schoolEmail!=='string'||input.schoolEmail.length>254
      ||input.schoolEmail!==input.schoolEmail.toLowerCase()
      ||!SchoolEmail.test(input.schoolEmail)
      ||typeof input.challengeId!=='string'||!MailChallengeId.test(input.challengeId)
      ||typeof input.code!=='string'||!MailCode.test(input.code))
      throw new HufsApiError('INVALID_INPUT',422);
    const {csrfToken}=await this.getCsrfProof(signal);
    const confirmed=await this.request('/api/auth/school-mail/confirm',SchoolMailVerifiedSchema,{
      method:'POST',csrf:csrfToken,signal,body:input,
    });
    if(!confirmed.verified)throw new HufsApiError('FORBIDDEN',403);
    return confirmed;
  }

  async listProfiles(signal?:AbortSignal):Promise<DemoProfileOption[]> {
    const response=await this.request('/api/demo/profiles',DemoProfilesResponseSchema,{signal});
    return response.profiles;
  }

  async createContext(
    subject:SubjectAlias,runId:string,signal?:AbortSignal,
  ):Promise<DemoContext> {
    if(!SubjectAliasSchema.safeParse(subject).success
      || !/^[A-Za-z0-9_-]{1,64}$/.test(runId))
      throw new HufsApiError('INVALID_INPUT',422);
    const csrf=await this.request('/api/auth/csrf',CsrfSchema,{signal});
    const context=await this.request('/api/demo/contexts',DemoContextSchema,{
      method:'POST',body:{demoSubjectId:subject,demoRunId:runId},
      csrf:csrf.csrfToken,signal,
    });
    if(context.demoSubjectId!==subject || context.demoRunId!==runId)
      throw new HufsApiError('VERSION_CONFLICT',409);
    return context;
  }

  async getSnapshot(contextId:string,signal?:AbortSignal):Promise<DemoSnapshot> {
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(contextId))
      throw new HufsApiError('INVALID_INPUT',422);
    return this.request('/api/demo/contexts/'+encodeURIComponent(contextId)+'/snapshot',
      DemoSnapshotSchema,{signal});
  }

  /** The BETA and REVIEWER contexts share the server-authorized calendar route.
   * The UI must also check the result against the active snapshot's asOf and
   * discard late replies through DemoController.runContextOperation.
   */
  async getCalendar(contextId:string,signal?:AbortSignal):Promise<CalendarResult> {
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(contextId))
      throw new HufsApiError('INVALID_INPUT',422);
    return this.request('/api/demo/contexts/'+encodeURIComponent(contextId)+'/calendar',
      CalendarResultSchema,{signal});
  }

  private checkedOverlayResult(context:DemoContext,result:DemoOverlayResult):DemoOverlayResult {
    const s=result.snapshot;
    if(s.contextId!==context.contextId||s.demoSubjectId!==context.demoSubjectId
      ||s.versions.dataset!==context.datasetVersion||s.versions.projection!==context.projectionVersion
      ||s.versions.consent!==context.sharingGrantVersion)
      throw new HufsApiError('VERSION_CONFLICT',409);
    return result;
  }

  /** Temporary BETA choices; caller must use the tab controller's epoch guard. */
  async getDemoOverlay(context:DemoContext,signal?:AbortSignal):Promise<DemoOverlayResult> {
    const c=this.checkedReviewerContext(context);
    return this.checkedOverlayResult(c,await this.request(
      '/api/demo/contexts/'+c.contextId+'/overlay',DemoOverlayResultSchema,{signal}));
  }

  async setDemoOverlay(context:DemoContext,change:DemoOverlayPut,signal?:AbortSignal):Promise<DemoOverlayResult> {
    const c=this.checkedReviewerContext(context),input=clientInput(DemoOverlayPutSchema,change);
    const {csrfToken}=await this.getCsrfProof(signal);
    const result=this.checkedOverlayResult(c,await this.request(
      '/api/demo/contexts/'+c.contextId+'/overlay',DemoOverlayResultSchema,
      {method:'PATCH',body:input,csrf:csrfToken,signal}));
    if(result.overlay.version!==input.expectedVersion+1
      ||JSON.stringify(result.overlay.value)!==JSON.stringify(input.value))
      throw new HufsApiError('VERSION_CONFLICT',409);
    return result;
  }

  async resetDemoOverlay(context:DemoContext,expectedVersion:number,signal?:AbortSignal):Promise<DemoOverlayResult> {
    const c=this.checkedReviewerContext(context),input=clientInput(DemoOverlayResetSchema,{expectedVersion});
    const {csrfToken}=await this.getCsrfProof(signal);
    const result=this.checkedOverlayResult(c,await this.request(
      '/api/demo/contexts/'+c.contextId+'/reset',DemoOverlayResultSchema,
      {method:'POST',body:input,csrf:csrfToken,signal}));
    if(result.overlay.version!==input.expectedVersion+1||Object.keys(result.overlay.value).length!==0)
      throw new HufsApiError('VERSION_CONFLICT',409);
    return result;
  }

  async getExperienceTagApproval(experienceId:string,signal?:AbortSignal) {
    const id=clientInput(OwnerItemIdSchema,experienceId);
    return this.request('/api/experience/cards/'+id+'/tag-approval',ExperienceTagResultSchema,{signal});
  }

  /** Local user approval is not an AI-generated credential or a sharing grant. */
  async approveExperienceTags(experienceId:string,change:ExperienceTagApprovalPut,signal?:AbortSignal) {
    const id=clientInput(OwnerItemIdSchema,experienceId),input=clientInput(ExperienceTagApprovalPutSchema,change);
    const {csrfToken}=await this.getCsrfProof(signal);
    const result=await this.request('/api/experience/cards/'+id+'/tag-approval',ExperienceTagResultSchema,
      {method:'PUT',body:input,csrf:csrfToken,signal});
    const a=result.approval;
    if(a.state!=='ACTIVE'||a.version!==input.expectedApprovalVersion+1
      ||a.contentVersion!==input.expectedContentVersion||a.consentVersion!==input.expectedConsentVersion
      ||JSON.stringify(a.topics)!==JSON.stringify(input.topics))
      throw new HufsApiError('VERSION_CONFLICT',409);
    return result;
  }

  async revokeExperienceTags(experienceId:string,change:ExperienceTagApprovalDelete,signal?:AbortSignal) {
    const id=clientInput(OwnerItemIdSchema,experienceId),input=clientInput(ExperienceTagApprovalDeleteSchema,change);
    const {csrfToken}=await this.getCsrfProof(signal);
    const result=await this.request('/api/experience/cards/'+id+'/tag-approval',ExperienceTagResultSchema,
      {method:'DELETE',body:input,csrf:csrfToken,signal});
    const a=result.approval;
    if(a.state!=='INACTIVE'||!(a.version===input.expectedApprovalVersion+1&&a.reason==='REVOKED'
      ||input.expectedApprovalVersion===0&&a.version===0&&a.reason==='NOT_APPROVED'))
      throw new HufsApiError('VERSION_CONFLICT',409);
    return result;
  }

  loadReviewerCapabilities(signal?:AbortSignal) {
    return this.request('/api/reviewer/capabilities',ReviewerCapabilitiesSchema,{signal});
  }

  async listReviewerProfiles(signal?:AbortSignal):Promise<DemoProfileOption[]> {
    const response=await this.request('/api/reviewer/demo/profiles',DemoProfilesResponseSchema,{signal});
    if(response.profiles.some(profile=>profile.dataMode!=='SYNTHETIC'))
      throw new HufsApiError('FORBIDDEN',403);
    return response.profiles;
  }

  async getReviewerSnapshot(subject:SubjectAlias,signal?:AbortSignal):Promise<DemoSnapshot> {
    if(!SubjectAliasSchema.safeParse(subject).success)
      throw new HufsApiError('INVALID_INPUT',422);
    const snapshot=await this.request(
      '/api/reviewer/demo/subjects/'+subject+'/snapshot',DemoSnapshotSchema,{signal});
    if(snapshot.demoSubjectId!==subject || snapshot.datasetMode!=='SYNTHETIC'
      ||(snapshot.aiProvenance!=='MOCK'&&snapshot.aiProvenance!=='NONE')
      ||snapshot.feed.asOf!==snapshot.asOf || snapshot.notices.asOf!==snapshot.asOf)
      throw new HufsApiError('FORBIDDEN',403);
    // REVIEWER must never render real academic rules, course histories or
    // model caches accidentally embedded beneath a SYNTHETIC root label.
    // This is a defense-in-depth consumer check, not proof of source rights:
    // the independent server-side reviewer sandbox is still authoritative.
    const syntheticEvidence=(refs:readonly string[])=>
      refs.every(ref=>ref.startsWith('EV-SYN-'));
    const academics=snapshot.academics;
    if('rulePackVersion' in academics
      &&(!academics.rulePackVersion.startsWith('SYN-')
        ||Date.parse(academics.asOf)>Date.parse(snapshot.asOf)
        ||academics.deficits.some(d=>!d.requirementId.startsWith('SYN-')
          ||!syntheticEvidence(d.evidenceRefs))))
      throw new HufsApiError('FORBIDDEN',403);
    const forecast=snapshot.forecast;
    if('items' in forecast
      &&(Date.parse(forecast.asOf)>Date.parse(snapshot.asOf)
        ||forecast.items.some(item=>!item.courseId.startsWith('SYN-')
          ||Date.parse(item.asOf)>Date.parse(snapshot.asOf)
          ||!syntheticEvidence(item.evidenceRefs))))
      throw new HufsApiError('FORBIDDEN',403);
    const cards=[...snapshot.feed.featured,...snapshot.feed.compact];
    if(cards.some(card=>card.dataMode!=='SYNTHETIC'||!card.opportunityId.startsWith('SYN-')
      ||card.evidenceRefs.some(ref=>!ref.startsWith('EV-SYN-')))
      ||snapshot.notices.items.some(notice=>!notice.noticeId.startsWith('SYN-')
        ||notice.evidenceRefs.some(ref=>!ref.startsWith('EV-SYN-'))))
      throw new HufsApiError('FORBIDDEN',403);
    return snapshot;
  }

  /**
   * The UI owner removes the URL fragment *before* invoking this method.
   * A token is transmitted only in a CSRF-protected POST body, never the URL
   * or persistent browser storage. Google identity is still verified server-side.
   */
  async redeemReviewerInvite(enrollmentCode:string,signal?:AbortSignal) {
    if(!/^[A-Za-z0-9_-]{43}$/.test(enrollmentCode))
      throw new HufsApiError('INVALID_INPUT',422);
    const {csrfToken}=await this.request('/api/auth/csrf',CsrfSchema,{signal});
    return this.request('/api/reviewer/invitations/redeem',ReviewerEnrollmentSchema,{
      method:'POST',body:{enrollmentCode},csrf:csrfToken,signal,
    });
  }

  private checkedReviewerContext(context:DemoContext):DemoContext {
    const parsed=DemoContextSchema.safeParse(context);
    if(!parsed.success || !/^[A-Za-z0-9_-]{1,100}$/.test(parsed.data.contextId))
      throw new HufsApiError('INVALID_INPUT',422);
    return parsed.data;
  }

  /**
   * Synthetic REVIEWER activity is scoped to an independently verified
   * server-issued actor/session/context and never writes real records.
   */
  async readReviewerActions(
    context:DemoContext,signal?:AbortSignal,
  ):Promise<ReviewerSandboxClientResult> {
    const verified=this.checkedReviewerContext(context);
    const result=await this.request(
      '/api/reviewer/demo/contexts/'+verified.contextId+'/actions',
      ReviewerSandboxClientResultSchema,{signal});
    if(result.subjectId!==verified.demoSubjectId)
      throw new HufsApiError('FORBIDDEN',403);
    return result;
  }

  async saveReviewerAction(
    context:DemoContext,action:ReviewerSandboxClientAction,signal?:AbortSignal,
  ):Promise<ReviewerSandboxClientResult> {
    const verified=this.checkedReviewerContext(context);
    const valid=ReviewerSandboxClientActionSchema.safeParse(action);
    if(!valid.success)throw new HufsApiError('INVALID_INPUT',422);
    const {csrfToken}=await this.getCsrfProof(signal);
    const result=await this.request(
      '/api/reviewer/demo/contexts/'+verified.contextId+'/actions',
      ReviewerSandboxClientResultSchema,{
        method:'POST',body:valid.data,csrf:csrfToken,signal,
      });
    if(result.subjectId!==verified.demoSubjectId)
      throw new HufsApiError('FORBIDDEN',403);
    return result;
  }

  /** Current server authorization is mandatory; never cache or supply browser source rights. */
  async searchEvidence(query:string,asOf?:string,signal?:AbortSignal):Promise<RetrievalEnvelopeVNext> {
    const input=z.strictObject({q:z.string().trim().min(2).max(200),
      asOf:z.iso.datetime({offset:true}).optional()}).safeParse({q:query,asOf});
    if(!input.success)throw new HufsApiError('INVALID_INPUT',422);
    const params=new URLSearchParams({q:input.data.q});
    if(input.data.asOf!==undefined)params.set('asOf',input.data.asOf);
    const result=await this.request('/api/evidence/search?'+params.toString(),
      RetrievalEnvelopeVNextSchema,{signal});
    if(input.data.asOf!==undefined&&result.asOf!==input.data.asOf)
      throw new HufsApiError('PROVIDER_UNAVAILABLE',503);
    return result;
  }

  async submitSyntheticAi(
    taskPath:AiTaskPath,packetRef:string,idempotencyKey:string,
    contextId?:string,signal?:AbortSignal,
  ) {
    if(!AiTaskPathSchema.safeParse(taskPath).success
      || !/^[A-Za-z0-9_-]{1,90}$/.test(packetRef)
      || !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey))
      throw new HufsApiError('INVALID_INPUT',422);
    const csrf=await this.request('/api/auth/csrf',CsrfSchema,{signal});
    return this.request('/api/ai/'+taskPath,AiJobAcceptedSchema,{
      method:'POST',csrf:csrf.csrfToken,signal,
      body:{packetRef,idempotencyKey,...(contextId?{contextId}:{})},
    });
  }

  async getSyntheticAiJob(jobId:string,signal?:AbortSignal) {
    if(typeof jobId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(jobId))
      throw new HufsApiError('INVALID_INPUT',422);
    // This wire DTO can ONLY represent a mock NEEDS_REVIEW candidate.
    // A model response never becomes official eligibility or graduation truth.
    return this.request('/api/ai/jobs/'+jobId,AiJobResponseSchema,{signal});
  }

  async logout(signal?:AbortSignal):Promise<void> {
    const csrf=await this.request('/api/auth/csrf',CsrfSchema,{signal});
    await this.request('/api/auth/logout',z.undefined(),{
      method:'POST',body:{},csrf:csrf.csrfToken,signal,
    });
  }
}
