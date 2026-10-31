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
/** Default deny. Current rights are checked on every request, even for past asOf. */
export function createPostgresTemporalGateway(
  reader:Pick<PostgresTemporalEvidenceReader,'retrieve'>,
  resolver:EvidenceRightsResolver,
):NonNullable<ApiOptions['temporalEvidence']>{
  return {
    async query({actor,query,asOf,topK,now}):Promise<TemporalResult>{
      if(actor.role!=='BETA'&&actor.role!=='ADMIN')
        throw new Error('Non-student identity cannot query evidence');
      if(Date.parse(asOf)>Date.parse(now))
        throw new Error('Future evidence replay refused');
      const current=await resolver.resolveFor({actor,now});
      if(!current||!current.permissionRefs.size){
        const envelope=RetrievalEnvelopeVNextSchema.parse({
          queryVersion:'query-1',asOf,sourceRevisionIds:[],
          permissionPolicyVersion:current?.policyVersion??'no-authority',
          retrievalConfigVersion:'pg-lexical-v1',
          retrievalState:'NO_EVIDENCE',evidence:[],
        });
        return {envelope,hits:[]};
      }
      const request={
        query,asOf,topK,permissionRefs:current.permissionRefs,
        ...(current.sourceIds?{sourceIds:current.sourceIds}:{}),
        ...(current.campus?{campus:current.campus}:{}),
        ...(current.majorCode?{majorCode:current.majorCode}:{}),
        ...(current.cohort!==undefined?{cohort:current.cohort}:{}),
      };
      const result=await reader.retrieve(request);
      const envelope=RetrievalEnvelopeVNextSchema.parse({
        ...result.envelope,permissionPolicyVersion:current.policyVersion,
      });
      // Never persist permission snapshots or reuse a previous actor's result.
      return {envelope,hits:result.hits};
    },
  };
}
