import {z} from 'zod';

/** Operator-chosen public metadata. Never student input, private academic data,
 * a verified SourceRevision or an automatically publishable opportunity. */
export const PublicApiProviderSchema=z.enum(['SARAMIN_JOB','CAREERNET_JOBS']);
export const PublicApiTopicSchema=z.enum(['DATA_ANALYTICS','SOFTWARE','MARKETING','BUSINESS']);
export const PublicApiDiscoveryRequestSchema=z.strictObject({
  provider:PublicApiProviderSchema,topic:PublicApiTopicSchema,
});
export type PublicApiProvider=z.infer<typeof PublicApiProviderSchema>;
export type PublicApiTopic=z.infer<typeof PublicApiTopicSchema>;

export const PublicApiPreviewCandidateSchema=z.strictObject({
  providerItemId:z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  kind:z.enum(['JOB_POSTING','CAREER_REFERENCE']),
  title:z.string().min(1).max(180),
  organization:z.string().min(1).max(100),
  /** Constructed only from reviewed fixed official origins, not provider HTML. */
  viewUrl:z.url().refine(url=>{
    const parsed=new URL(url);
    return parsed.protocol==='https:'&&!parsed.username&&!parsed.password
      &&!parsed.hash&&['www.saramin.co.kr','www.career.go.kr'].includes(parsed.hostname);
  }),
  dataMode:z.literal('RESEARCH_REFERENCE_ONLY'),
  reviewState:z.literal('NEEDS_REVIEW'),
  /** Never infer employer eligibility, deadline, admission or actual application. */
  applicationState:z.literal('UNKNOWN'),
  deadlineState:z.literal('UNKNOWN'),
});
export const PublicApiDiscoveryResponseSchema=z.strictObject({
  provider:PublicApiProviderSchema,topic:PublicApiTopicSchema,
  observedAt:z.iso.datetime({offset:true}),
  permissionRef:z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/),
  rightsPolicyVersion:z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/),
  mode:z.literal('OPERATOR_REVIEW_ONLY'),
  candidates:z.array(PublicApiPreviewCandidateSchema).max(10),
});
export type PublicApiDiscoveryResponse=z.infer<typeof PublicApiDiscoveryResponseSchema>;

/** Immediate, credential-free external **navigation** in /career.
 * Links are not API data, source licensing, enrollment or a live feed. */
export const PUBLIC_CAREER_REFERENCE_SOURCES=[
  {id:'WORK24',name:'고용24',label:'공식 채용·훈련 검색',url:'https://www.work24.go.kr/',
    api:'KEY_AND_BUSINESS_REVIEW',kind:'JOB'},
  {id:'CAREERNET',name:'커리어넷',label:'직업백과·진로 정보',url:'https://www.career.go.kr/',
    api:'KEY_REQUIRED',kind:'CAREER'},
  {id:'SARAMIN',name:'사람인',label:'채용공고 원문 확인',url:'https://www.saramin.co.kr/',
    api:'KEY_AND_SERVICE_REVIEW',kind:'JOB'},
  {id:'OPENDART',name:'Open DART',label:'기업 공시정보 확인',url:'https://opendart.fss.or.kr/',
    api:'KEY_REQUIRED',kind:'COMPANY'},
  {id:'ACADEMY_INFO',name:'대학알리미',label:'대학 공개정보 검색',url:'https://www.academyinfo.go.kr/',
    api:'KEY_REQUIRED',kind:'EDUCATION'},
] as const;
