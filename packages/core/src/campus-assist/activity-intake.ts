/** #339: synthetic, pre-NCP manual intake gate. No HTTP, crawler, file access,
 * persistence, RLS bypass or trusted real-school attestation is implemented.
 * Production source rights must be independently recorded by an operator. */
import {z} from 'zod';
import {ActivityOrganizationSchema,ActivityChannelSchema,ActivityRecordSchema,
  type ActivityOrganization,type ActivityChannel,type ActivityRecord} from '@hufs-one/contracts';

const Iso=z.iso.datetime({offset:true});
export type IntakeRejection='INVALID_RECORD'|'UNKNOWN_ORGANIZATION'|'UNKNOWN_CHANNEL'
  |'CONFLICTED_REGISTRY'|'CHANNEL_NOT_CLEARED'|'CHANNEL_OUT_OF_PERIOD'
  |'SCOPE_MISMATCH'|'URL_OUTSIDE_CHANNEL'|'RECORD_NOT_CURRENT'
  |'REAL_SOURCE_REQUIRES_OPERATOR';
export type QuarantinedActivity={entryId:string;reason:IntakeRejection};
export type ActivityIntakeReview={
  records:readonly ActivityRecord[];
  quarantined:readonly QuarantinedActivity[];
  /** Counts are synthetic intake diagnostics, NOT a proof of licensed source collection. */
  acceptedCount:number;
};
function registry<T extends { [k:string]:unknown }>(items:readonly T[],id:(r:T)=>string){
  const byId=new Map<string,T>(),conflicts=new Set<string>();
  for(const row of items){
    const key=id(row);
    if(byId.has(key))conflicts.add(key);
    else byId.set(key,row);
  }
  return {byId,conflicts};
}
/** A canonical HTTPS origin and a *path-segment-bounded* official base path.
 * Prefix string checks like /notice matching /notice-evil are not sufficient. */
function inChannel(source:string,base:string):boolean{
  try{
    const u=new URL(source),root=new URL(base);
    if(u.protocol!=='https:'||root.protocol!=='https:'||u.username||u.password
      ||root.username||root.password||root.search||root.hash||u.origin!==root.origin)
      return false;
    const basePath=root.pathname.replace(/\/+$/,'')||'/';
    return basePath==='/'||u.pathname===basePath||u.pathname.startsWith(basePath+'/');
  }catch{return false;}
}
const current=(time:string,at:number)=>Date.parse(time)<=at;

/** For synthetic, manually prepared data only. The registry must be a
 * separately controlled operator input; a browser cannot mark its own
 * channels VERIFIED or APPROVED. Real records are always quarantined here. */
export function reviewSyntheticActivityIntake(input:{
  raw:readonly unknown[];organizations:readonly ActivityOrganization[];
  channels:readonly ActivityChannel[];asOf:string;
}):ActivityIntakeReview{
  const at=Date.parse(Iso.parse(input.asOf));
  if(!Number.isFinite(at))throw new RangeError('Invalid asOf');
  if(input.raw.length>10000)throw new RangeError('Activity intake exceeds limit');
  const orgRows=ActivityOrganizationSchema.array().max(2000).parse(input.organizations);
  const channelRows=ActivityChannelSchema.array().max(2000).parse(input.channels);
  const org=registry(orgRows,r=>r.organizationId);
  const channel=registry(channelRows,r=>r.channelId);
  const records:ActivityRecord[]=[],quarantined:QuarantinedActivity[]=[];
  for(const original of input.raw){
    const parsed=ActivityRecordSchema.safeParse(original);
    if(!parsed.success){
      quarantined.push({entryId:'UNVALIDATED',reason:'INVALID_RECORD'});continue;
    }
    const r=parsed.data;
    const deny=(reason:IntakeRejection)=>{quarantined.push({entryId:r.entryId,reason});};
    if(r.provenance!=='SYNTHETIC'){deny('REAL_SOURCE_REQUIRES_OPERATOR');continue;}
    const o=org.byId.get(r.organizationId);
    if(!o){deny('UNKNOWN_ORGANIZATION');continue;}
    if(!r.channelId||!channel.byId.has(r.channelId)){deny('UNKNOWN_CHANNEL');continue;}
    if(org.conflicts.has(r.organizationId)||channel.conflicts.has(r.channelId)){
      deny('CONFLICTED_REGISTRY');continue;
    }
    const c=channel.byId.get(r.channelId)!;
    if(c.provenance!=='SYNTHETIC'||c.rights!=='APPROVED'||c.status!=='ACTIVE'){
      deny('CHANNEL_NOT_CLEARED');continue;
    }
    if(!current(o.verifiedAt,at)||!current(c.verifiedAt,at)
      ||!current(c.effectiveFrom,at)
      ||c.effectiveUntil!==undefined&&Date.parse(c.effectiveUntil)<=at){
      deny('CHANNEL_OUT_OF_PERIOD');continue;
    }
    if(c.organizationId!==r.organizationId
      ||o.campus!=='BOTH'&&r.campus!=='BOTH'&&o.campus!==r.campus){
      deny('SCOPE_MISMATCH');continue;
    }
    if(!inChannel(r.sourceUrl,c.sourceBaseUrl)){deny('URL_OUTSIDE_CHANNEL');continue;}
    if(!current(r.publishedAt,at)||!current(r.verifiedAt,at)){
      deny('RECORD_NOT_CURRENT');continue;
    }
    // Preserve an explicit REVOKED/DELETED head so currentActivityRecords()
    // can suppress its formerly approved revision; never resurrect history.
    records.push(r);
  }
  return {records,quarantined,acceptedCount:records.length};
}
