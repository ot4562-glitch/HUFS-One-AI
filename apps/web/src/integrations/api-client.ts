import {z} from 'zod';
import {
  AiTaskPathSchema, ApiErrorSchema, DemoContextSchema, DemoProfilesResponseSchema,
  DemoSnapshotSchema, httpStatusForError,
} from '@hufs-one/contracts';
import type {
  ApiErrorCode, AiTaskPath, DemoContext, DemoProfileOption, DemoSnapshot, SubjectAlias,
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
const ReviewerCapabilitiesSchema = z.object({
  role:z.literal('REVIEWER'), dataMode:z.literal('SYNTHETIC'),
  sandboxOnly:z.literal(true), ncpCalls:z.literal(false),
  externalSubmission:z.literal(false),
  sections:z.array(z.string()), actions:z.array(z.string()),
});
const AiJobAcceptedSchema = z.strictObject({
  jobId:z.string().min(1),state:z.literal('NEEDS_REVIEW'),provenance:z.literal('MOCK'),
});

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
      const declared=Number(response.headers.get('content-length') ?? '0');
      if(declared>262144)throw new Error('oversize');
      const text=await response.text();
      if(text.length>262144)throw new Error('oversize');
      payload=JSON.parse(text);
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

  async listProfiles(signal?:AbortSignal):Promise<DemoProfileOption[]> {
    const response=await this.request('/api/demo/profiles',DemoProfilesResponseSchema,{signal});
    return response.profiles;
  }

  async createContext(
    subject:SubjectAlias,runId:string,signal?:AbortSignal,
  ):Promise<DemoContext> {
    const csrf=await this.request('/api/auth/csrf',CsrfSchema,{signal});
    const context=await this.request('/api/demo/contexts',DemoContextSchema,{
      method:'POST',body:{demoSubjectId:subject,demoRunId:runId},
      csrf:csrf.csrfToken,signal,
    });
    if(context.demoSubjectId!==subject || context.demoRunId!==runId)
      throw new HufsApiError('VERSION_CONFLICT',409);
    return context;
  }

  getSnapshot(contextId:string,signal?:AbortSignal):Promise<DemoSnapshot> {
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(contextId))
      throw new HufsApiError('INVALID_INPUT',422);
    return this.request('/api/demo/contexts/'+encodeURIComponent(contextId)+'/snapshot',
      DemoSnapshotSchema,{signal});
  }

  loadReviewerCapabilities(signal?:AbortSignal) {
    return this.request('/api/reviewer/capabilities',ReviewerCapabilitiesSchema,{signal});
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
    AiTaskPathSchema.parse(taskPath);
    const csrf=await this.request('/api/auth/csrf',CsrfSchema,{signal});
    return this.request('/api/ai/'+taskPath,AiJobAcceptedSchema,{
      method:'POST',csrf:csrf.csrfToken,signal,
      body:{packetRef,idempotencyKey,...(contextId?{contextId}:{})},
    });
  }

  async logout(signal?:AbortSignal):Promise<void> {
    const csrf=await this.request('/api/auth/csrf',CsrfSchema,{signal});
    await this.request('/api/auth/logout',z.undefined(),{
      method:'POST',body:{},csrf:csrf.csrfToken,signal,
    });
  }
}
