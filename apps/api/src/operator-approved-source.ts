/** Offline-safe production composition for approved SourceRevision ingestion.
 * Operator supplies exact allowlisted URLs, independently approved rights,
 * restricted SQL pools and a pinned egress implementation. No crawler, network,
 * background job, migration or DB connection is created by this factory.
 */
import {isIP} from 'node:net';
import type {PostgresPlatformConfig} from './platform-postgres.js';
import type {ReviewerSqlPool} from './modules/auth/reviewer-postgres.js';
import {PostgresApprovedSourceRightsResolver} from './modules/opportunities/rights-postgres.js';
import {PostgresSourceRevisionWriter} from './modules/opportunities/temporal-writer-postgres.js';
import {createApprovedDurableSourceExecutor} from './modules/opportunities/source-ingestion-durable.js';
import type {ApprovedFetchPolicy,SourceContentExtractor} from './modules/opportunities/approved-fetch.js';
import type {ApprovedPinnedEgress} from './modules/opportunities/approved-egress.js';
import type {TrustedSourceIngestionAuthority} from './modules/opportunities/source-ingestion-queue-postgres.js';
import type {SourceDocumentExtractor} from './modules/opportunities/source-document-extractor.js';
import type {ApprovedSourceAcquisition} from './modules/opportunities/source-acquisition.js';
import type {TrustedSourceRefreshPreflight} from './modules/opportunities/source-refresh-operator-preflight.js';

type OperatorSourcePort=NonNullable<PostgresPlatformConfig['sourceIngestion']>;
export interface OperatorApprovedSourceInput {
  operatorActorId:string;
  policies:readonly ApprovedFetchPolicy[];
  pools:{rights:ReviewerSqlPool;headReader:ReviewerSqlPool;writer:ReviewerSqlPool;queue:ReviewerSqlPool};
  egress:ApprovedPinnedEgress;
  extractor:SourceContentExtractor;
  documentExtractor?:SourceDocumentExtractor;
  acquisition?:ApprovedSourceAcquisition;
  preflight?:TrustedSourceRefreshPreflight;
  /** Independently revocation-aware operator authorization, never a browser claim. */
  authority:TrustedSourceIngestionAuthority;
  now?:()=>string;
}

const Actor=/^[A-Za-z0-9_.:@-]{1,128}$/;
export function createOperatorApprovedSource(input:OperatorApprovedSourceInput):OperatorSourcePort{
  if(!input||!Actor.test(input.operatorActorId)||!Array.isArray(input.policies)
    ||input.policies.length===0||input.policies.length>50
    ||typeof input.egress?.resolveAddresses!=='function'
    ||typeof input.egress?.requestPinned!=='function'
    ||typeof input.extractor?.extract!=='function'
    ||(input.documentExtractor!==undefined&&typeof input.documentExtractor?.extract!=='function')
    ||(input.acquisition!==undefined&&typeof input.acquisition?.acquire!=='function')
    ||(input.acquisition!==undefined&&typeof input.preflight?.loadCurrent!=='function')
    ||(input.preflight!==undefined&&typeof input.preflight?.loadCurrent!=='function')
    ||typeof input.authority?.mayProcess!=='function')
    throw new Error('Approved SourceRevision configuration missing');
  const pools=Object.values(input.pools??{});
  if(pools.length!==4||new Set(pools).size!==4
    ||pools.some(pool=>typeof pool?.connect!=='function'))
    throw new Error('Four independent restricted SourceRevision pools required');
  const policies=new Map<string,ApprovedFetchPolicy>();
  for(const policy of input.policies){
    if(!policy||!policy.rightsReviewed||policy.provenance!=='REAL_APPROVED'
      ||policy.sourceClass!=='LICENSED_EXTERNAL'
      ||!Actor.test(policy.sourceId)||!Actor.test(policy.permissionRef)
      ||policies.has(policy.sourceId))
      throw new Error('Approved source registry invalid');
    const url=new URL(policy.canonicalUrl),origin=new URL(policy.approvedOrigin);
    if(url.href!==policy.canonicalUrl||url.protocol!=='https:'||url.port
      ||url.username||url.password||url.hash||url.origin!==origin.origin
      ||origin.href!==origin.origin+'/'||!url.hostname.includes('.')
      ||url.hostname.endsWith('.local')||url.hostname.endsWith('.localhost')
      ||isIP(url.hostname)!==0)
      throw new Error('Approved source URL invalid');
    policies.set(policy.sourceId,{...policy});
  }
  const now=input.now??(()=>new Date().toISOString());
  const rights=new PostgresApprovedSourceRightsResolver(input.pools.rights,{
    actorId:input.operatorActorId,now,
  });
  const authority:TrustedSourceIngestionAuthority={
    async mayProcess(request){
      const policy=policies.get(request.sourceId);
      if(!policy||request.actorRef!==input.operatorActorId
        ||request.permissionRef!==policy.permissionRef)return false;
      const current=await rights.resolve({
        sourceId:request.sourceId,permissionRef:request.permissionRef,now:request.now,
      });
      if(!current||current.canonicalUrl!==policy.canonicalUrl
        ||!current.allowedPurposes.has('COLLECT')||!current.allowedPurposes.has('STORE'))
        return false;
      if(await input.authority.mayProcess(request)!==true)return false;
      const renewed=await rights.resolve({
        sourceId:request.sourceId,permissionRef:request.permissionRef,now:now(),
      });
      return renewed?.policyVersion===current.policyVersion;
    },
  };
  const writer=new PostgresSourceRevisionWriter(input.pools.writer);
  const executor=createApprovedDurableSourceExecutor({
    policies,rights,egress:input.egress,extractor:input.extractor,
    ...(input.documentExtractor?{documentExtractor:input.documentExtractor}:{}),
    ...(input.acquisition?{acquisition:input.acquisition}:{}),
    ...(input.preflight?{preflight:input.preflight}:{}),
    readerPool:input.pools.headReader,writer,now,
  });
  return {pool:input.pools.queue,authority,executor};
}
