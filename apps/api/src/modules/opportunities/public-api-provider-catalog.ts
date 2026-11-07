import type {ApprovedFetchPolicy} from './approved-fetch.js';

/** Curated from yybmion/public-apis-4Kr (2026-11-08).
 * Discovery metadata, NOT an API-key grant, source license, ingestion allowlist
 * or evidence that the upstream endpoint is live. No HTTP is performed here.
 */
export const PUBLIC_API_PROVIDER_CATALOG={
  CAREER_NET:{name:'커리어넷',category:'CAREER',homepage:'https://www.career.go.kr/cnet/front/openapi/openApiUseGuideCenter.do',authentication:'API_KEY',priority:'HIGH',dataUse:'직업/진로 탐색·설명',connection:'REQUIRES_PROVIDER_ADAPTER'},
  WORK24:{name:'고용24',category:'EMPLOYMENT',homepage:'https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do',authentication:'REVIEWED_API_KEY',priority:'HIGH',dataUse:'채용/직업훈련 공고',connection:'REQUIRES_PROVIDER_ADAPTER'},
  SARAMIN:{name:'사람인',category:'EMPLOYMENT',homepage:'https://oapi.saramin.co.kr/',authentication:'API_KEY',priority:'HIGH',dataUse:'채용 공고',connection:'REQUIRES_PROVIDER_ADAPTER'},
  KERIS:{name:'KERIS 학술연구정보',category:'RESEARCH',homepage:'https://www.data.go.kr/data/3046254/openapi.do',authentication:'API_KEY',priority:'MEDIUM',dataUse:'학술 자료 메타데이터',connection:'REQUIRES_PROVIDER_ADAPTER'},
  KOSIS:{name:'KOSIS 국가통계포털',category:'STATISTICS',homepage:'https://kosis.kr/serviceInfo/openAPIGuide.do',authentication:'API_KEY',priority:'MEDIUM',dataUse:'국가 통계·진로/산업 맥락',connection:'REQUIRES_PROVIDER_ADAPTER'},
  KESS:{name:'교육통계서비스',category:'STATISTICS',homepage:'https://kess.kedi.re.kr/index',authentication:'NONE_LISTED',priority:'LOW',dataUse:'교육 통계 참고',connection:'REFERENCE_ONLY'},
  RISS_CATALOG:{name:'RISS 종합목록',category:'RESEARCH',homepage:'https://www.data.go.kr/data/15071949/fileData.do',authentication:'UNVERIFIED',priority:'LOW',dataUse:'도서관 목록 참고',connection:'REFERENCE_ONLY'},
} as const;

export type PublicApiProviderId=keyof typeof PUBLIC_API_PROVIDER_CATALOG;
const Id=/^[A-Za-z0-9_.:-]{1,128}$/;

/** Operators may reuse the existing secure source pipeline only for an
 * independently reviewed, exact HTTPS public representation URL. Provider
 * documentation/portal pages are explicitly rejected as ingest targets.
 * Dynamic JSON APIs requiring headers, tokens, pagination, POST or OAuth need
 * separate provider adapters; never embed keys in a canonicalUrl.
 */
export function approvedPublicApiSourcePolicy(input:{
  providerId:PublicApiProviderId;
  sourceId:string;permissionRef:string;canonicalUrl:string;
  /** Affirmation is not enough for execution: the DB receipt is rechecked by
   * createOperatorApprovedSource and every ingestion step. */
  rightsReviewed:boolean;
}):ApprovedFetchPolicy{
  if(!Object.prototype.hasOwnProperty.call(PUBLIC_API_PROVIDER_CATALOG,input.providerId))
    throw new Error('Unlisted public API provider');
  const provider=PUBLIC_API_PROVIDER_CATALOG[input.providerId];
  if(provider.connection!=='REQUIRES_PROVIDER_ADAPTER')
    throw new Error('Reference-only provider cannot be ingested');
  if(!input.rightsReviewed||!Id.test(input.sourceId)||!Id.test(input.permissionRef))
    throw new Error('Reviewed rights and stable source IDs required');
  let url:URL;
  try{url=new URL(input.canonicalUrl);}catch{throw new Error('Invalid source URL');}
  if(url.href!==input.canonicalUrl||url.protocol!=='https:'||url.port
    ||url.username||url.password||url.hash||url.search||url.pathname==='/'||
    url.hostname==='localhost'||url.hostname.endsWith('.local')||
    url.hostname.endsWith('.localhost')||!url.hostname.includes('.'))
    throw new Error('Source must be an exact, query-free HTTPS public document');
  if(url.href===provider.homepage)
    throw new Error('API documentation is not a data source');
  // Operator approval of the exact URL is necessary, but this function cannot
  // grant a DB right or allowlist network egress by itself.
  return {
    sourceId:input.sourceId,permissionRef:input.permissionRef,
    canonicalUrl:url.href,approvedOrigin:url.origin+'/',
    sourceClass:'LICENSED_EXTERNAL',provenance:'REAL_APPROVED',
    rightsReviewed:true,
  };
}
