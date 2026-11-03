import {createHash} from 'node:crypto';
import Papa from 'papaparse';
import {z} from 'zod';
import {FORMS_HEADERS,validateCourseCsv} from '@hufs-one/contracts';
import type {CourseRecord,IntakeIssueCode} from '@hufs-one/contracts';
import type {RestrictedIntakeInput} from '../academics/intake-postgres.js';

const Ref=z.string().regex(/^[A-Za-z0-9_.:@-]{2,128}$/);
const Sha=z.string().regex(/^[a-f0-9]{64}$/);
const Utc=z.iso.datetime({offset:true});
const Consent=z.enum(['VERIFIED','PENDING','DENIED','REVOKED']);
export const OwnerRegistrySchema=z.strictObject({
  schemaVersion:z.literal(1),revision:z.number().int().positive(),formsSha256:Sha,
  consentConfirmation:z.strictObject({verifiedAt:Utc,evidenceRef:Ref,confirmedCount:z.literal(4)}),
  historicalGitPublication:Consent,internalSystemCollection:Consent,
  owners:z.array(z.strictObject({
    subjectKey:Ref,actorId:Ref,storageNamespace:Ref,identityRef:Ref,
    mapping:z.strictObject({method:z.enum(['OWNER_STATEMENT','SUBJECT_CONFIRMATION']),
      evidenceRef:Ref,verifiedAt:Utc,formsRowSha256:Sha,
      courseFilename:z.string().max(200).regex(/^이수과목_[^/\\]+\.csv$/u),
      courseSha256:Sha,sourceVersion:z.number().int().positive()}),
    consents:z.strictObject({selectedClova:Consent,refinedPrivateNcp:Consent,
      reviewedPseudonymousPresentation:Consent,localReview:Consent}),
    consentEvidenceRef:Ref,revokedAt:Utc.nullable(),
  })).length(4),
});
export type OwnerRegistry=z.infer<typeof OwnerRegistrySchema>;
export type OwnerPurpose='LOCAL_REVIEW'|'SELECTED_CLOVA'|'REFINED_PRIVATE_NCP'|'REVIEWED_PRESENTATION';
export const sourceDigest=(text:string)=>createHash('sha256').update(text,'utf8').digest('hex');
/** Fingerprints bind full row content, never its position or a guessed alias. */
export const formRowDigest=(cells:readonly string[])=>sourceDigest(JSON.stringify(cells));
const fail=(code:string):never=>{throw new Error(code);};

/** Attestation is supplied by a trusted restricted operator, never a browser. */
export function attestRegistry(input:unknown,now:string):OwnerRegistry{
  const parsed=OwnerRegistrySchema.safeParse(input);
  if(!parsed.success||!Utc.safeParse(now).success)return fail('REGISTRY_INVALID');
  const r=parsed.data;
  if(Date.parse(r.consentConfirmation.verifiedAt)>Date.parse(now))return fail('REGISTRY_INVALID');
  const identityReaders:((o:OwnerRegistry['owners'][number])=>string)[]=[
    o=>o.subjectKey,o=>o.actorId,o=>o.identityRef,
    o=>o.storageNamespace,o=>o.mapping.formsRowSha256,o=>o.mapping.courseFilename,
  ];
  for(const read of identityReaders)if(new Set(r.owners.map(read)).size!==4)return fail('REGISTRY_INVALID');
  if(r.owners.some(o=>Date.parse(o.mapping.verifiedAt)>Date.parse(now)))return fail('REGISTRY_INVALID');
  return r;
}

export function registrySummary(registry:OwnerRegistry|null){
  // The owner's explicit 4/4 consent confirmation persists independently of
  // identity mapping, historical Git publication and school collection rights.
  const keys=['selectedClova','refinedPrivateNcp','reviewedPseudonymousPresentation'] as const;
  return {ownersReady:registry?.owners.filter(o=>!o.revokedAt&&o.consents.localReview==='VERIFIED').length??0,
    mapping:registry?'ATTESTED':'PENDING',
    confirmedConsentCounts:Object.fromEntries(keys.map(k=>[k,registry?registry.owners.filter(o=>o.consents[k]==='VERIFIED').length:4])),
    historicalGitPublication:registry?.historicalGitPublication??'PENDING',
    internalSystemCollection:registry?.internalSystemCollection??'PENDING'};
}
export function mayAccessOwner(registry:OwnerRegistry,actorId:string,subjectKey:string,purpose:OwnerPurpose,now:string):boolean{
  if(!Utc.safeParse(now).success)return false;
  const owner=registry.owners.find(o=>o.actorId===actorId&&o.subjectKey===subjectKey);
  if(!owner||owner.revokedAt||Date.parse(owner.mapping.verifiedAt)>Date.parse(now))return false;
  const key={LOCAL_REVIEW:'localReview',SELECTED_CLOVA:'selectedClova',REFINED_PRIVATE_NCP:'refinedPrivateNcp',REVIEWED_PRESENTATION:'reviewedPseudonymousPresentation'} as const;
  return owner.consents[key[purpose]]==='VERIFIED';
}

function boundRows(registry:OwnerRegistry,formsCsv:string):Map<string,string[]>{
  if(Buffer.byteLength(formsCsv)>200_000||sourceDigest(formsCsv)!==registry.formsSha256)return fail('SOURCE_BINDING');
  const parsed=Papa.parse<string[]>(formsCsv.replace(/^\uFEFF/,''),{skipEmptyLines:'greedy'});
  if(parsed.errors.length||parsed.data.length!==5
    ||JSON.stringify(parsed.data[0])!==JSON.stringify(FORMS_HEADERS))return fail('SOURCE_BINDING');
  const rows=new Map<string,string[]>();
  for(const row of parsed.data.slice(1)){
    const sha=formRowDigest(row);
    if(row.length!==26||rows.has(sha))return fail('SOURCE_BINDING');
    rows.set(sha,row);
  }
  if(registry.owners.some(o=>!rows.has(o.mapping.formsRowSha256)))return fail('SOURCE_BINDING');
  return rows;
}

/** Reuses the existing restricted Postgres importer without guessing bindings.
 * Raw input and this returned mapping MUST stay inside the restricted process. */
function bindOwnerSources(registry:OwnerRegistry,input:Pick<RestrictedIntakeInput,'actorRef'|'formsCsv'|'courseFiles'>,now:string):RestrictedIntakeInput{
  const current=attestRegistry(registry,now),rows=boundRows(current,input.formsCsv);
  if(input.courseFiles.length!==4||input.courseFiles.some(f=>Buffer.byteLength(f.content)>200_000)
    ||new Set(input.courseFiles.map(f=>f.filename)).size!==4)return fail('SOURCE_BINDING');
  const names:Record<string,string>={};
  for(const owner of current.owners){
    const file=input.courseFiles.find(f=>f.filename===owner.mapping.courseFilename);
    if(!file||sourceDigest(file.content)!==owner.mapping.courseSha256)return fail('SOURCE_BINDING');
    const label=rows.get(owner.mapping.formsRowSha256)![6]!.trim().normalize('NFKC');
    if(!label||Object.hasOwn(names,label))return fail('SOURCE_BINDING');
    names[label]=owner.subjectKey;
  }
  return {...input,formsOptions:{subjectByDisplayName:names,expectedSubjectKeys:current.owners.map(o=>o.subjectKey)},
    approvedFileBindings:current.owners.map(o=>({filename:o.mapping.courseFilename,subjectKey:o.subjectKey,verificationSource:o.mapping.method}))};
}
export function resolveOwnerIntake(registry:OwnerRegistry,input:Pick<RestrictedIntakeInput,'actorRef'|'formsCsv'|'courseFiles'>,now:string):RestrictedIntakeInput{
  const current=attestRegistry(registry,now);
  if(current.owners.some(o=>o.revokedAt||o.consents.localReview!=='VERIFIED'))return fail('OWNER_REVOKED');
  return bindOwnerSources(current,input,now);
}

export interface RestrictedOwnerSnapshot{
  actorId:string;subjectKey:string;storageNamespace:string;registryRevision:number;
  profile:{primaryMajor:string;secondaryMajor:string|null;secondaryType:string;campus:string;cohort:string;
    earnedCreditsSelfReported:string;inProgressCreditsSelfReported:string;interestsSelfReported:string};
  transcript:{version:number;sourceSha256:string;records:CourseRecord[];
    state:'STUDENT_REVIEW_PENDING'|'NEEDS_REVIEW';issueCodes:IntakeIssueCode[]};
  offeringStatus:'UNKNOWN';rulesStatus:'NEEDS_REVIEW';
}
/** Runtime integration seam: reload registry/revocation on EVERY access; resolve
 * only a server-authenticated actor. Never expose registry or other owner rows. */
export function createRestrictedOwnerDirectory(options:{
  loadRegistry:()=>Promise<unknown|null>;
  verifyStorage:()=>Promise<boolean>;
  loadSources:()=>Promise<Pick<RestrictedIntakeInput,'formsCsv'|'courseFiles'>>;
  now?:()=>string;
}){
  const clock=options.now??(()=>new Date().toISOString());
  return {async resolve(actorId:string):Promise<RestrictedOwnerSnapshot|null>{
    if(!await options.verifyStorage())return null;
    const raw=await options.loadRegistry();if(!raw)return null;
    const r=attestRegistry(raw,clock());
    const owner=r.owners.find(o=>o.actorId===actorId);
    if(!owner||!mayAccessOwner(r,actorId,owner.subjectKey,'LOCAL_REVIEW',clock()))return null;
    const sources=await options.loadSources();
    // Validate all bindings atomically before reading the actor's selected row.
    bindOwnerSources(r,{...sources,actorRef:actorId},clock());
    const row=boundRows(r,sources.formsCsv).get(owner.mapping.formsRowSha256)!;
    const course=sources.courseFiles.find(f=>f.filename===owner.mapping.courseFilename)!;
    const validated=validateCourseCsv(course.content);
    // An invalid transcript does not invalidate an attested identity/profile.
    // Quarantine its records; never use a positional header workaround.
    const latestRaw=await options.loadRegistry();if(!latestRaw||!await options.verifyStorage())return null;
    const latest=attestRegistry(latestRaw,clock());
    if(sourceDigest(JSON.stringify(latest))!==sourceDigest(JSON.stringify(r))
      ||!mayAccessOwner(latest,actorId,owner.subjectKey,'LOCAL_REVIEW',clock()))return null;
    return {actorId,subjectKey:owner.subjectKey,storageNamespace:owner.storageNamespace,registryRevision:r.revision,
      profile:{primaryMajor:row[12]!,secondaryType:row[13]!,secondaryMajor:row[14]||null,campus:row[7]!,cohort:row[8]!,
        earnedCreditsSelfReported:row[18]!,inProgressCreditsSelfReported:row[19]!,interestsSelfReported:row[20]!},
      transcript:{version:owner.mapping.sourceVersion,sourceSha256:owner.mapping.courseSha256,
        records:validated.ok?validated.records:[],state:validated.ok?'STUDENT_REVIEW_PENDING':'NEEDS_REVIEW',
        issueCodes:[...new Set(validated.issues.map(i=>i.code))]},
      offeringStatus:'UNKNOWN',rulesStatus:'NEEDS_REVIEW'};
  }};
}
