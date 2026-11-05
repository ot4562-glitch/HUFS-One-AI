import {z} from 'zod';
import {FeedResultSchema, NoticeResultSchema} from '../corpus/index.js';
import {AcademicSummarySchema, ForecastSummarySchema} from '../academics/index.js';

export const SubjectAliasSchema = z.enum(['S01','S02','S03','S04','S05']);
export type SubjectAlias = z.infer<typeof SubjectAliasSchema>;
export const DatasetModeSchema = z.enum(['REAL_CONSENTED','SYNTHETIC','MIXED']);
export const ReadinessSchema = z.enum(['READY','PARTIAL','PENDING','REVOKED']);
export const SharedSectionSchema = z.enum(['FEED','NOTICES','EXPERIENCE','ACADEMICS','FORECAST']);
export const ISODateTimeSchema = z.iso.datetime({offset:true});

export const VersionEnvelopeSchema = z.strictObject({
  profile:z.string().min(1),projection:z.string().min(1),consent:z.string().min(1),
  dataset:z.string().min(1),topics:z.string().min(1),rules:z.string().min(1),
  overlay:z.string().min(1),rankConfig:z.string().min(1),
});
export type VersionEnvelope = z.infer<typeof VersionEnvelopeSchema>;

export const DemoContextSchema = z.strictObject({
  contextId:z.string().min(1),actorId:z.string().min(1),demoSubjectId:SubjectAliasSchema,
  demoRunId:z.string().min(1),sessionIdHash:z.string().min(1),datasetVersion:z.string().min(1),
  projectionVersion:z.string().min(1),sharingGrantVersion:z.string().min(1),expiresAt:ISODateTimeSchema,
});
export type DemoContext = z.infer<typeof DemoContextSchema>;
export const DemoProfileOptionSchema = z.strictObject({
  demoSubjectId:SubjectAliasSchema,displayLabel:z.string().trim().min(1).max(40),
  dataMode:DatasetModeSchema,readiness:ReadinessSchema,
  allowedSections:z.array(SharedSectionSchema),
});
export type DemoProfileOption = z.infer<typeof DemoProfileOptionSchema>;
export const DemoProfilesResponseSchema = z.strictObject({profiles:z.array(DemoProfileOptionSchema).length(5)})
  .refine(v=>new Set(v.profiles.map(p=>p.demoSubjectId)).size===5,{message:'Each demo slot must appear once'});

// IMPORTANT: grant is projection scope, not permission to access the course/raw Forms file.
export const SharingGrantSchema = z.strictObject({
  grantId:z.string().min(1),actorId:z.string().min(1),demoSubjectId:SubjectAliasSchema,
  allowedSections:z.array(SharedSectionSchema),
  displayNameAllowed:z.boolean(),recordingAllowed:z.boolean(),
  version:z.string().min(1),expiresAt:ISODateTimeSchema,revokedAt:ISODateTimeSchema.optional(),
});
export type SharingGrant = z.infer<typeof SharingGrantSchema>;

export const PendingSectionSchema = z.strictObject({state:z.enum(['NOT_SHARED','PENDING'])});
export const AiProvenanceSchema = z.enum(['LIVE_NCP','VALIDATED_CACHE','MOCK','NONE']);
export const DemoSnapshotSchema = z.strictObject({
  contextId:z.string().min(1),demoSubjectId:SubjectAliasSchema,datasetMode:DatasetModeSchema,
  asOf:ISODateTimeSchema,versions:VersionEnvelopeSchema,
  feed:FeedResultSchema,notices:NoticeResultSchema,
  academics:z.union([AcademicSummarySchema,PendingSectionSchema]),
  forecast:z.union([ForecastSummarySchema,PendingSectionSchema]),
  aiProvenance:AiProvenanceSchema,
}).superRefine((snapshot,ctx)=>{
  // The new list is checked at the shared parsing boundary, including both
  // server and browser REVIEWER consumers whose root must remain SYNTHETIC.
  if(snapshot.datasetMode!=='SYNTHETIC')return;
  for(const [index,card] of (snapshot.feed.ineligible??[]).entries()){
    if(card.dataMode!=='SYNTHETIC'||!card.opportunityId.startsWith('SYN-')
      ||card.evidenceRefs.some(ref=>!ref.startsWith('EV-SYN-'))
      ||card.explanation?.eligibility.evidenceRefs.some(ref=>!ref.startsWith('EV-SYN-')))
      ctx.addIssue({code:'custom',path:['feed','ineligible',index],message:'Synthetic feed contains non-synthetic evidence'});
  }
});
export type DemoSnapshot = z.infer<typeof DemoSnapshotSchema>;

/** Server-side authorization helper: no I/O or implicit current time. Does NOT grant raw Forms access. */
export function canReadSharedSection(grant: SharingGrant, request: {
  actorId:string;demoSubjectId:SubjectAlias;section:z.infer<typeof SharedSectionSchema>;asOf:string;
}):boolean {
  const at=Date.parse(request.asOf);
  return Number.isFinite(at) &&
    grant.actorId===request.actorId &&
    grant.demoSubjectId===request.demoSubjectId &&
    !grant.revokedAt &&
    Date.parse(grant.expiresAt)>at &&
    grant.allowedSections.includes(request.section);
}

export interface SelectionGuard {
  context: DemoContext;
  selectionEpoch: number; // from the request that produced this response
  currentSelectionEpoch: number; // latest tab-local value
}
/** Client-side stale response guard; the server MUST separately recheck grant on each request. */
export function isSnapshotCurrent(snapshot: DemoSnapshot, guard: SelectionGuard): boolean {
  return Number.isSafeInteger(guard.selectionEpoch) &&
    guard.selectionEpoch===guard.currentSelectionEpoch &&
    snapshot.contextId===guard.context.contextId &&
    snapshot.demoSubjectId===guard.context.demoSubjectId &&
    snapshot.versions.projection===guard.context.projectionVersion &&
    snapshot.versions.dataset===guard.context.datasetVersion;
}
