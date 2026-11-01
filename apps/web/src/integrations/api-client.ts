import {z} from 'zod';
import {
  ReviewerSandboxClientActionSchema, ReviewerSandboxClientResultSchema,
} from './reviewer-sandbox-contract.js';
import type {ReviewerSandboxClientAction,ReviewerSandboxClientResult}
  from './reviewer-sandbox-contract.js';
import {
  AiTaskPathSchema, AiTaskSchema, TopicCodeSchema, ApiErrorSchema, CalendarResultSchema,
  DemoContextSchema, DemoProfilesResponseSchema, DemoSnapshotSchema, SubjectAliasSchema, httpStatusForError,
} from '@hufs-one/contracts';
import type {
  ApiErrorCode, AiTaskPath, CalendarResult, DemoContext, DemoProfileOption, DemoSnapshot, SubjectAlias,
} from '@hufs-one/contracts';

/** Browser fetch only. No actor/role headers, localStorage, third-party URLs or provider keys. */
export type ApiFetch = (url: string, init: RequestInit) => Promise<Response>;

export class HufsApiError extends Error {
  constructor(readonly code: ApiErrorCode, readonly status: number) {
    super(code);
    this.name = 'HufsApiError';
  }
}

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
  actorId:z.string().min(1),role:z.literal('BETA'),
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
async function readBoundedJson(response:Response):Promise<unknown> {
  const contentType=response.headers.get('content-type')?.toLowerCase()??'';
  if(!contentType.startsWith('application/json'))
    throw new Error('Unexpected API content type');
  const header=response.headers.get('content-length');
  if(header!==null&&(!/^[0-9]+$/.test(header)
    ||Number(header)>MAX_RESPONSE_BYTES))
    throw new Error('Invalid or oversized API response');
  if(!response.body)throw new Error('Empty API JSON');
  const reader=response.body.getReader();
  let size=0;
  const chunks:Uint8Array[]=[];
  try{
    while(true){
      const step=await reader.read();
      if(step.done)break;
      size+=step.value.byteLength;
      if(size>MAX_RESPONSE_BYTES){
        await reader.cancel();
        throw new Error('Oversized streamed API response');
      }
      chunks.push(step.value);
    }
  }finally{reader.releaseLock();}
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
  constructor(private readonly transport: ApiFetch =
    (url, init) => fetch(url, init)) {}

  private async request<T>(
    path: string, schema: z.ZodType<T>,
    options: {method?: 'GET'|'POST'; body?: unknown; signal?: AbortSignal|undefined; csrf?: string|undefined} = {},
  ): Promise<T> {
    if (!validApiPath(path)) throw new HufsApiError('INVALID_INPUT',422);
    const method=options.method ?? 'GET';
    const headers: Record<string,string>={accept:'application/json'};
    if (method==='POST') headers['content-type']='application/json';
    if (options.csrf) headers['x-csrf-token']=options.csrf;
    const init:RequestInit={
      method, headers, credentials:'same-origin', cache:'no-store',
      redirect:'error', mode:'same-origin', referrerPolicy:'no-referrer',
      ...(method==='POST'?{body:JSON.stringify(options.body ?? {})}:{}),
      ...(options.signal?{signal:options.signal}:{}),
    };
    let response:Response;
    try { response=await this.transport(path,init); }
    catch (error) {
      if (error instanceof Error && error.name==='AbortError') throw error;
      throw new HufsApiError('PROVIDER_UNAVAILABLE',503);
    }
    if(response.status===204 && response.ok) {
      const parsed=schema.safeParse(undefined);
      if(parsed.success)return parsed.data;
      throw new HufsApiError('PROVIDER_UNAVAILABLE',503);
    }
    let payload:unknown;
    try {
      payload=await readBoundedJson(response);
    } catch {
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

  /**
   * Fail closed until PR #33's authoritative RetrievalEnvelopeVNextSchema
   * and PR #34's permission-first route are merged and reviewed.
   * Never expose unvalidated evidence as JSON in the browser.
   */
  async searchEvidence(_query:string,_asOf?:string,_signal?:AbortSignal):Promise<never> {
    throw new HufsApiError('PROVIDER_UNAVAILABLE',503);
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
