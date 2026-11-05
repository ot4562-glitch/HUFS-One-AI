import {DemoContextSchema,DemoSnapshotSchema,SharingGrantSchema,canReadSharedSection} from '@hufs-one/contracts';
import type {ApiRepository} from './types.js';
import {maskUnsharedSnapshot,SnapshotMetadataSchema} from './snapshot-visibility.js';
import {computeAuthorizedSections} from './modules/calendar.js';
import type {CalendarInputSource,CalendarReadRequest} from './modules/calendar.js';

/**
 * The base snapshot supplies version metadata only, never academic summaries.
 * Its precomputed feed/notices are never returned, including for partial grants.
 * The authoritative input source binds and rechecks current grant/source rights.
 */
export class ScopedApiRepository implements ApiRepository {
  constructor(private readonly base:ApiRepository,private readonly inputs:CalendarInputSource,
    private readonly now:()=>string=()=>new Date().toISOString()){}
  listProfiles:ApiRepository['listProfiles']=()=>this.base.listProfiles();
  readGrant:ApiRepository['readGrant']=(actor,subject)=>this.base.readGrant(actor,subject);
  readSnapshot:ApiRepository['readSnapshot']=subject=>this.base.readSnapshot(subject);
  readSafePacket:ApiRepository['readSafePacket']=(actor,task,ref)=>this.base.readSafePacket(actor,task,ref);

  async readAuthorizedSnapshot(input:Parameters<NonNullable<ApiRepository['readAuthorizedSnapshot']>>[0]){
    const now=this.now();
    const rawGrant=await this.base.readGrant(input.actorId,input.subjectId);
    if(!rawGrant)return null;
    const grant=SharingGrantSchema.parse(rawGrant);
    const required=input.requiredSections??['FEED','NOTICES'];
    if(!required.length||new Set(required).size!==required.length
      ||grant.version!==input.grantVersion
      ||[...new Set([...required,'FEED','NOTICES'] as const)].some(section=>
        !canReadSharedSection(grant,{actorId:input.actorId,demoSubjectId:input.subjectId,section,asOf:now})))
      return null;
    // Only metadata is needed from the unreceipted base row. The PostgreSQL
    // adapter projects these fields in SQL, so hidden summaries are never
    // fetched or parsed here. Legacy synthetic adapters may still return a
    // full object; select only these fields without reading unused sections.
    const raw=this.base.readSnapshotMetadata
      ?await this.base.readSnapshotMetadata(input.subjectId)
      :await this.base.readSnapshot(input.subjectId);
    if(!raw)return null;
    const metadata=SnapshotMetadataSchema.parse({demoSubjectId:raw.demoSubjectId,
      datasetMode:raw.datasetMode,asOf:raw.asOf,versions:raw.versions});
    if(metadata.demoSubjectId!==input.subjectId||Date.parse(metadata.asOf)>Date.parse(now))return null;
    // Internal computation receipt; never issued as a browser session/context.
    const context=DemoContextSchema.parse({contextId:'INTERNAL-SCOPED-PROJECTION',actorId:input.actorId,
      demoSubjectId:input.subjectId,demoRunId:'INTERNAL',sessionIdHash:'INTERNAL-NO-SESSION',
      datasetVersion:metadata.versions.dataset,projectionVersion:metadata.versions.projection,
      sharingGrantVersion:grant.version,expiresAt:grant.expiresAt});
    const request:CalendarReadRequest={actorId:input.actorId,context,now};
    const bundle=await this.inputs.readAuthorizedInputs(request);
    if(!bundle)return null;
    const result=computeAuthorizedSections(bundle,request);
    const currentGrant=SharingGrantSchema.parse(bundle.grant);
    if(required.some(section=>!canReadSharedSection(currentGrant,{
      actorId:input.actorId,demoSubjectId:input.subjectId,section,asOf:this.now()})))return null;
    if(bundle.datasetMode!==metadata.datasetMode)return null;
    const approved=bundle.approvedSnapshot===undefined?undefined:DemoSnapshotSchema.parse(
      maskUnsharedSnapshot(bundle.approvedSnapshot,currentGrant.allowedSections.includes('ACADEMICS'),
        currentGrant.allowedSections.includes('FORECAST')));
    if(approved&&(approved.demoSubjectId!==input.subjectId
      ||approved.versions.dataset!==context.datasetVersion||approved.versions.projection!==context.projectionVersion
      ||approved.datasetMode!==bundle.datasetMode||approved.asOf!==bundle.asOf
      ||('asOf' in approved.academics&&approved.academics.asOf!==bundle.asOf)
      ||('asOf' in approved.forecast&&approved.forecast.asOf!==bundle.asOf)))return null;
    const candidate=DemoSnapshotSchema.parse({...approved??metadata,contextId:context.contextId,asOf:bundle.asOf,
      versions:{...(approved?.versions??metadata.versions),consent:currentGrant.version,
        rankConfig:result.rankConfigVersion},feed:result.feed,notices:result.notices,
      academics:currentGrant.allowedSections.includes('ACADEMICS')?approved?.academics??{state:'PENDING'}:{state:'NOT_SHARED'},
      forecast:currentGrant.allowedSections.includes('FORECAST')?approved?.forecast??{state:'PENDING'}:{state:'NOT_SHARED'},
      aiProvenance:'NONE'});
    if(!await this.inputs.revalidateAuthorization(request,{
      authorizationToken:bundle.authorizationToken,sourceVersion:bundle.sourceVersion,
      scopeKey:bundle.scopeKey,asOf:bundle.asOf},this.now()))return null;
    return candidate;
  }
}
