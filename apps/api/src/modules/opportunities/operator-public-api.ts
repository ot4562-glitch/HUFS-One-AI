import {z} from 'zod';
import {
  PublicApiDiscoveryRequestSchema,PublicApiDiscoveryResponseSchema,
  type PublicApiProvider,type PublicApiTopic,type PublicApiDiscoveryResponse,
} from '@hufs-one/contracts';
import {createApprovedPinnedTransport,type ApprovedPinnedEgress} from './approved-egress.js';
import {discardUnreadSourceBody,readApprovedSourceBody} from './source-response-body.js';

const PROVIDERS={
  SARAMIN_JOB:{origin:'https://oapi.saramin.co.kr',path:'/job-search',
    param:'access-key'},
  CAREERNET_JOBS:{origin:'https://www.career.go.kr',path:'/cnet/front/openapi/jobs.json',
    param:'apiKey'},
} as const;
const QUERY:Readonly<Record<PublicApiTopic,string>>={
  DATA_ANALYTICS:'데이터 분석',SOFTWARE:'소프트웨어',MARKETING:'마케팅',BUSINESS:'경영',
};
const Identity=z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/);
const ApiKey=z.string().min(8).max(128).regex(/^[A-Za-z0-9_+=-]+$/);
const ApplicantId=z.union([z.string(),z.number().int().nonnegative()]);
const Text=z.string().trim().min(1).max(2000);
const SaraminItem=z.object({
  id:ApplicantId,url:z.string().optional(),active:z.union([z.literal(1),z.literal('1')]),
  company:z.object({detail:z.object({name:Text})}),
  position:z.object({title:Text}),
});
const SaraminResult=z.object({
  jobs:z.object({job:z.union([SaraminItem,z.array(SaraminItem)]).optional()}),
});
const CareerNetJob=z.object({
  job_cd:ApplicantId,job_nm:Text,
});
const CareerNetResult=z.object({jobs:z.array(CareerNetJob).max(100)});

export class PublicApiDiscoveryUnavailable extends Error{
  constructor(){super('Public API metadata lookup unavailable');}
}
export interface PublicApiMetadataGrant {
  provider:PublicApiProvider;permissionRef:string;policyVersion:string;
  status:'APPROVED'|'REVOKED';reviewedAt:string;expiresAt?:string;
  /** Must come from independent, operator-trusted current rights reviewer. */
  allowedPurposes:ReadonlySet<'LOOKUP_METADATA'|'DISPLAY_SOURCE_LINK'>;
}
export interface PublicApiDiscoveryScope {
  provider:PublicApiProvider;permissionRef:string;apiKey:string;
}
export interface OperatorPublicApiDiscoveryInput {
  scopes:readonly PublicApiDiscoveryScope[];
  egress:ApprovedPinnedEgress;
  /** Never a browser/header-supplied grant. Rechecked before, during and after IO. */
  resolveRights(input:{provider:PublicApiProvider;permissionRef:string;now:string}):
    Promise<PublicApiMetadataGrant|null>;
  /** Mandatory provider quota reservation before every outbound request, across hosts. */
  reserveCall(input:{provider:PublicApiProvider;topic:PublicApiTopic;now:string}):Promise<boolean>;
  now?:()=>Date;
}
export interface OperatorPublicApiDiscovery {
  permissionRef(provider:PublicApiProvider):string|null;
  lookup(input:{provider:PublicApiProvider;topic:PublicApiTopic}):
    Promise<PublicApiDiscoveryResponse>;
}
function safeText(value:string,max:number):string{
  const result=value.replace(/[<>\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();
  if(!result||result.length>max)throw new PublicApiDiscoveryUnavailable();
  return result;
}
function safeId(raw:string|number):string{
  const value=String(raw);
  if(!/^[0-9]{1,32}$/.test(value))throw new PublicApiDiscoveryUnavailable();
  return value;
}
function replyCandidates(provider:PublicApiProvider,payload:unknown){
  if(provider==='SARAMIN_JOB'){
    const parsed=SaraminResult.parse(payload),jobs=parsed.jobs.job??[];
    const list=Array.isArray(jobs)?jobs:[jobs];
    return list.slice(0,10).map(job=>{
      const id=safeId(job.id);
      return {providerItemId:id,kind:'JOB_POSTING' as const,
        title:safeText(job.position.title,180),
        organization:safeText(job.company.detail.name,100),
        // The upstream response may contain http links or tracking parameters.
        // Construct a canonical provider-origin HTTPS URL from only a numeric ID.
        viewUrl:'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx='+id,
        dataMode:'RESEARCH_REFERENCE_ONLY' as const,reviewState:'NEEDS_REVIEW' as const,
        applicationState:'UNKNOWN' as const,deadlineState:'UNKNOWN' as const};
    });
  }
  const parsed=CareerNetResult.parse(payload);
  return parsed.jobs.slice(0,10).map(job=>({
    providerItemId:safeId(job.job_cd),kind:'CAREER_REFERENCE' as const,
    title:safeText(job.job_nm,180),organization:'커리어넷 직업백과',
    // There is no trustworthy stable detail URL in the public API docs.
    viewUrl:'https://www.career.go.kr/',
    dataMode:'RESEARCH_REFERENCE_ONLY' as const,reviewState:'NEEDS_REVIEW' as const,
    applicationState:'UNKNOWN' as const,deadlineState:'UNKNOWN' as const,
  }));
}
/** Inert, server-only factory. No network/keys/timers/DB unless the operator
 * explicitly selects an approved provider and an approved metadata purpose.
 * No student signals, target account, subject or free-form query may leave. */
export function createOperatorPublicApiDiscovery(input:OperatorPublicApiDiscoveryInput):
  OperatorPublicApiDiscovery{
  if(!input||typeof input.egress?.resolveAddresses!=='function'
    ||typeof input.egress?.requestPinned!=='function'
    ||typeof input.resolveRights!=='function'||typeof input.reserveCall!=='function'
    ||!Array.isArray(input.scopes)||input.scopes.length===0||input.scopes.length>2)
    throw new PublicApiDiscoveryUnavailable();
  const configs=new Map<PublicApiProvider,PublicApiDiscoveryScope>();
  for(const scope of input.scopes){
    if(!scope||!Identity.safeParse(scope.permissionRef).success
      ||!ApiKey.safeParse(scope.apiKey).success
      ||!Object.prototype.hasOwnProperty.call(PROVIDERS,scope.provider)
      ||configs.has(scope.provider))
      throw new PublicApiDiscoveryUnavailable();
    configs.set(scope.provider,{...scope});
  }
  const clock=input.now??(()=>new Date());
  const at=()=>{
    const value=clock();
    if(!(value instanceof Date)||!Number.isFinite(value.getTime()))
      throw new PublicApiDiscoveryUnavailable();
    return value.toISOString();
  };
  const current=async(scope:PublicApiDiscoveryScope):Promise<string>=>{
    const timestamp=at();
    const grant=await input.resolveRights({provider:scope.provider,permissionRef:scope.permissionRef,now:timestamp});
    if(!grant||grant.provider!==scope.provider||grant.permissionRef!==scope.permissionRef
      ||grant.status!=='APPROVED'||!Identity.safeParse(grant.policyVersion).success
      ||!Number.isFinite(Date.parse(grant.reviewedAt))
      ||Date.parse(grant.reviewedAt)>Date.parse(timestamp)
      ||(grant.expiresAt!==undefined&&(
        !Number.isFinite(Date.parse(grant.expiresAt))||Date.parse(grant.expiresAt)<=Date.parse(timestamp)))
      ||!grant.allowedPurposes?.has('LOOKUP_METADATA')||!grant.allowedPurposes.has('DISPLAY_SOURCE_LINK'))
      throw new PublicApiDiscoveryUnavailable();
    return grant.policyVersion;
  };
  return {
    permissionRef:provider=>configs.get(provider)?.permissionRef??null,
    async lookup(raw){
      const query=PublicApiDiscoveryRequestSchema.parse(raw);
      const scope=configs.get(query.provider);
      if(!scope)throw new PublicApiDiscoveryUnavailable();
      try{
        const first=await current(scope);
        if(await input.reserveCall({provider:query.provider,topic:query.topic,now:at()})!==true)
          throw new PublicApiDiscoveryUnavailable();
        const spec=PROVIDERS[query.provider];
        const url=new URL(spec.path,spec.origin);
        url.searchParams.set(spec.param,scope.apiKey);
        if(query.provider==='SARAMIN_JOB'){
          url.searchParams.set('keywords',QUERY[query.topic]);
          url.searchParams.set('count','10');url.searchParams.set('start','0');
        }else{
          url.searchParams.set('searchJobNm',QUERY[query.topic]);
          url.searchParams.set('pageIndex','1');
        }
        // Exact URL DNS-pinned egress. No global fetch or API-key-containing logs.
        const transport=createApprovedPinnedTransport({
          canonicalUrl:url.href,beforeSend:async()=>{
            if(await current(scope)!==first)throw new PublicApiDiscoveryUnavailable();
          },
        },input.egress);
        let response:Response|undefined;
        try{
          response=await transport(url,{method:'GET',credentials:'omit',redirect:'error',
            headers:{Accept:'application/json'},signal:AbortSignal.timeout(5_000)});
          if(response.status!==200
            ||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))
            throw new PublicApiDiscoveryUnavailable();
          const bytes=await readApprovedSourceBody(response);
          const parsed=JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
          if(await current(scope)!==first)throw new PublicApiDiscoveryUnavailable();
          return PublicApiDiscoveryResponseSchema.parse({
            provider:query.provider,topic:query.topic,observedAt:at(),
            permissionRef:scope.permissionRef,rightsPolicyVersion:first,
            mode:'OPERATOR_REVIEW_ONLY',
            candidates:replyCandidates(query.provider,parsed),
          });
        }finally{if(response)discardUnreadSourceBody(response);}
      }catch{
        // Never expose key-bearing URLs, credentials, raw provider errors,
        // prompt/response bodies or an unverified partial result.
        throw new PublicApiDiscoveryUnavailable();
      }
    },
  };
}
