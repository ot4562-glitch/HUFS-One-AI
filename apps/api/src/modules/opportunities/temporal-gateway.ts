import {RetrievalEnvelopeVNextSchema} from '@hufs-one/contracts';
import type {VerifiedTeamActor,ApiOptions} from '../../types.js';
import type {TemporalResult} from './revision-ledger.js';
import type {PostgresTemporalEvidenceReader} from './temporal-postgres.js';

export interface CurrentEvidenceGrants {
  /** This set must come from a live, server-side authorization lookup. */
  permissionRefs:ReadonlySet<string>;
  sourceIds?:ReadonlySet<string>;
  campus?:string;
  majorCode?:string;
  cohort?:number;
  policyVersion:string;
}
export interface EvidenceRightsResolver {
  resolveFor(input:{actor:VerifiedTeamActor;now:string}):
    Promise<CurrentEvidenceGrants|null>;
}
function policyFingerprint(scope:CurrentEvidenceGrants):string{
  return JSON.stringify({
    policyVersion:scope.policyVersion,
    permissions:[...scope.permissionRefs].sort(),
    sources:scope.sourceIds?[...scope.sourceIds].sort():null,
    campus:scope.campus??null,majorCode:scope.majorCode??null,
    cohort:scope.cohort??null,
  });
}
function noEvidence(asOf:string,version:string):TemporalResult{
  const envelope=RetrievalEnvelopeVNextSchema.parse({
    queryVersion:'query-1',asOf,sourceRevisionIds:[],
    permissionPolicyVersion:version,
    retrievalConfigVersion:'pg-lexical-v1',
    retrievalState:'NO_EVIDENCE',evidence:[],
  });
  return {envelope,hits:[]};
}
/** Default deny. Rights are rechecked after retrieval as well as before it. */
export function createPostgresTemporalGateway(
  reader:Pick<PostgresTemporalEvidenceReader,'retrieve'>,
  resolver:EvidenceRightsResolver,
):NonNullable<ApiOptions['temporalEvidence']>{
  return {
    async query({actor,query,asOf,topK,now}):Promise<TemporalResult>{
      if(actor.role!=='BETA'&&actor.role!=='ADMIN')
        throw new Error('Non-student identity cannot query evidence');
      if(!Number.isFinite(Date.parse(asOf))||!Number.isFinite(Date.parse(now))
        ||Date.parse(asOf)>Date.parse(now))
        throw new Error('Future or invalid evidence replay refused');
      const current=await resolver.resolveFor({actor,now});
      if(!current||!current.permissionRefs.size)
        return noEvidence(asOf,current?.policyVersion??'no-authority');
      // Capture the original rights snapshot before starting asynchronous SQL.
      // A grant store may mutate a Set in place during revocation.
      const authorizedPolicy=policyFingerprint(current);
      const request={
        query,asOf,topK,permissionRefs:current.permissionRefs,
        ...(current.sourceIds?{sourceIds:current.sourceIds}:{}),
        ...(current.campus?{campus:current.campus}:{}),
        ...(current.majorCode?{majorCode:current.majorCode}:{}),
        ...(current.cohort!==undefined?{cohort:current.cohort}:{}),
      };
      const result=await reader.retrieve(request);
      // A permission grant may be revoked or narrowed while the SQL query is
      // running. Revalidate against the current resolver before returning any
      // quote. A change forces a fresh, independently authorized query.
      const rechecked=await resolver.resolveFor({actor,now});
      if(!rechecked||!rechecked.permissionRefs.size
        ||policyFingerprint(rechecked)!==authorizedPolicy)
        return noEvidence(asOf,rechecked?.policyVersion??'no-authority');
      const envelope=RetrievalEnvelopeVNextSchema.parse({
        ...result.envelope,permissionPolicyVersion:rechecked.policyVersion,
      });
      if(envelope.asOf!==asOf||result.hits.length!==envelope.evidence.length
        ||result.hits.length>topK
        ||result.hits.some((hit,i)=>{
          const span=envelope.evidence[i];
          return !span||span.kind!=='TEXT'||span.sourceRevisionId!==hit.revisionId
            ||span.paragraphId!==hit.paragraphId||span.quote!==hit.quote;
        }))throw new Error('Untrusted retrieval evidence mismatch');
      // Never persist permission snapshots or reuse a previous actor's result.
      return {envelope,hits:result.hits};
    },
  };
}
