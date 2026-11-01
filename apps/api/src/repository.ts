import {
  DemoProfileOptionSchema, DemoSnapshotSchema, SafeLlmPacketSchema, SharingGrantSchema,
} from '@hufs-one/contracts';
import type {
  DemoProfileOption, DemoSnapshot, SafeLlmPacket, SharingGrant, SubjectAlias, AiTask,
} from '@hufs-one/contracts';
import type {ApiRepository} from './types.js';

/** Precomputed feed/notices may depend on private academic and experience inputs.
 * Until an independently verified per-grant projection exists, never return
 * these potentially derived results to a partially scoped viewer.
 */
const PRECOMPUTED_DERIVED_INPUTS=['FEED','NOTICES','ACADEMICS','EXPERIENCE'] as const;

/** In-memory, intentionally non-durable test adapter. Not a live database/identity provider. */
export class MemoryApiRepository implements ApiRepository {
  private readonly profiles: DemoProfileOption[];
  private readonly grants = new Map<string, SharingGrant>();
  private readonly projections = new Map<SubjectAlias, DemoSnapshot>();
  private readonly packets = new Map<string, SafeLlmPacket>();

  constructor(init: {
    profiles: DemoProfileOption[];
    grants?: SharingGrant[];
    projections?: DemoSnapshot[];
    safePackets?: Array<{actorId: string; ref: string; packet: SafeLlmPacket}>;
  }) {
    this.profiles = init.profiles.map(v => DemoProfileOptionSchema.parse(v));
    for (const g of init.grants ?? []) this.setGrant(g);
    for (const p of init.projections ?? []) this.setProjection(p);
    for (const p of init.safePackets ?? []) this.setSafePacket(p.actorId,p.ref,p.packet);
  }

  async listProfiles(): Promise<DemoProfileOption[]> {
    return structuredClone(this.profiles);
  }
  async readGrant(actorId: string, subject: SubjectAlias): Promise<SharingGrant|null> {
    return structuredClone(this.grants.get(`${actorId}\0${subject}`) ?? null);
  }
  async readSnapshot(subject: SubjectAlias): Promise<DemoSnapshot|null> {
    return structuredClone(this.projections.get(subject) ?? null);
  }
  /**
   * Synchronous in-memory proof used by synthetic tests ONLY. Checking the
   * grant and taking the snapshot happens without any await/interleaving.
   * Real or mixed snapshots are never exposed by this memory-only method:
   * PostgreSQL MUST implement readAuthorizedSnapshot with a locked live grant
   * and a reviewed grant-scoped projection (or fail closed).
   */
  async readAuthorizedSnapshot(input:{
    actorId:string;subjectId:SubjectAlias;grantVersion:string;
    requiredSections?:Array<'FEED'|'NOTICES'|'ACADEMICS'|'FORECAST'|'EXPERIENCE'>;
    now?:string;
  }):Promise<DemoSnapshot|null>{
    const granted=this.grants.get(`${input.actorId}\0${input.subjectId}`);
    const source=this.projections.get(input.subjectId);
    const now=Date.parse(input.now??new Date().toISOString());
    const required=input.requiredSections??['FEED','NOTICES'];
    if(!granted||!source||source.datasetMode!=='SYNTHETIC'
      ||!Number.isFinite(now)
      ||granted.version!==input.grantVersion
      ||granted.actorId!==input.actorId||granted.demoSubjectId!==input.subjectId
      ||granted.revokedAt!==undefined||Date.parse(granted.expiresAt)<=now
      ||!required.length||new Set(required).size!==required.length
      ||required.some(s=>!granted.allowedSections.includes(s))
      ||PRECOMPUTED_DERIVED_INPUTS.some(section=>!granted.allowedSections.includes(section))
      ||Date.parse(source.asOf)>now
      ||source.feed.asOf!==source.asOf||source.notices.asOf!==source.asOf)
      return null;
    return structuredClone(DemoSnapshotSchema.parse({
      ...source,
      academics:granted.allowedSections.includes('ACADEMICS')
        ?source.academics:{state:'NOT_SHARED'},
      forecast:granted.allowedSections.includes('FORECAST')
        ?source.forecast:{state:'NOT_SHARED'},
    }));
  }
  async readSafePacket(actorId: string, task: AiTask, ref: string): Promise<SafeLlmPacket|null> {
    const item=this.packets.get(`${actorId}\0${ref}`);
    return item?.task===task ? structuredClone(item) : null;
  }
  setGrant(grant: SharingGrant): void {
    const g=SharingGrantSchema.parse(grant);
    this.grants.set(`${g.actorId}\0${g.demoSubjectId}`,structuredClone(g));
  }
  revokeGrant(actorId:string, subject:SubjectAlias, at:string):void {
    const k=`${actorId}\0${subject}`,g=this.grants.get(k);
    if(g)this.setGrant({...g,revokedAt:at,version:g.version+'-revoked'});
  }
  setProjection(snapshot:DemoSnapshot):void {
    const value=DemoSnapshotSchema.parse(snapshot);
    this.projections.set(value.demoSubjectId,structuredClone(value));
  }
  setSafePacket(actorId:string,ref:string,packet:SafeLlmPacket):void {
    if(!actorId||!ref)throw new Error('opaque packet keys required');
    this.packets.set(`${actorId}\0${ref}`,structuredClone(SafeLlmPacketSchema.parse(packet)));
  }
}

export const closedRepository: ApiRepository = {
  listProfiles: async()=>[],
  readGrant:async()=>null,
  readSnapshot:async()=>null,
  readSafePacket:async()=>null,
};
