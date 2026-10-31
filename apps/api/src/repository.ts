import {
  DemoProfileOptionSchema, DemoSnapshotSchema, SafeLlmPacketSchema, SharingGrantSchema,
} from '@hufs-one/contracts';
import type {
  DemoProfileOption, DemoSnapshot, SafeLlmPacket, SharingGrant, SubjectAlias, AiTask,
} from '@hufs-one/contracts';
import type {ApiRepository} from './types.js';

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
