import {createHash} from 'node:crypto';
import Papa from 'papaparse';
import {z} from 'zod';
const Utc=z.iso.datetime({offset:true});
const Ref=z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/);
const Sha=z.string().regex(/^[a-f0-9]{64}$/);
const ScopeLabel=z.string().min(1).max(200).refine(v=>v===v.trim().normalize('NFKC'));
export const SavedCurriculumCaptureSchema=z.strictObject({
  capturedAt:Utc,term:z.string().regex(/^(?:\d{4}-[12]|UNKNOWN)$/),campus:ScopeLabel,scope:ScopeLabel,
  converterVersion:Ref,permissionRef:Ref,permissionVersion:Ref,
});
export type SavedCurriculumCapture=z.infer<typeof SavedCurriculumCaptureSchema>;
export type SavedCurriculumArtifactKey=Readonly<SavedCurriculumCapture&{
  sourceUrl:string;savedArtifactSha256:string;normalizedCsvSha256:string;
}>;
export interface SavedCurriculumAuthority {
  /** The exact private operator registry key, never a URL-only approval. */
  resolveSaved(key:SavedCurriculumArtifactKey,now:string):Promise<unknown|null>;
}
const PermissionBase=z.strictObject({
  sourceUrl:z.string().url(),permissionRef:Ref,permissionVersion:Ref,permissionEvidenceUrl:z.string().url(),
  verifiedAt:Utc,expiresAt:Utc,edition:Ref,sourceKind:z.enum(['CURRICULUM','OFFERINGS']),
  collection:z.literal('ALLOWED'),retention:z.literal('ALLOWED'),terms:z.literal('ALLOWED'),revoked:z.literal(false),
});
/** Robots metadata is not an access grant. Under a DISALLOWED rule the operator
 * must record a source-specific review of publicly accessible content,
 * applicable terms and collection impacts. This does not certify REP
 * compliance or bypass authentication/HTTP denial. A missing robots file
 * likewise does not grant content-reuse rights.
 */
const HttpPermission=PermissionBase.extend({
  robots:z.enum(['ALLOWED','NOT_FOUND','DISALLOWED']),
  acquisitionMethod:z.literal('HTTP').optional(),
  robotsReviewRef:Ref.optional(),
}).superRefine((v,ctx)=>{
  // A review reference cannot override an explicit robots prohibition.
  // Separately authorized operator-saved sources use the non-HTTP path.
  if(v.robots==='DISALLOWED'){
    ctx.addIssue({code:'custom',path:['robots'],
      message:'Robots-disallowed HTTP collection is not permitted'});
  }
});
const SavedPermission=PermissionBase.extend({acquisitionMethod:z.literal('OPERATOR_SAVED'),
  robots:z.literal('NOT_APPLICABLE'),savedArtifactSha256:Sha,normalizedCsvSha256:Sha,
  capturedAt:Utc,term:SavedCurriculumCaptureSchema.shape.term,campus:ScopeLabel,scope:ScopeLabel,converterVersion:Ref,
  redistribution:z.enum(['ALLOWED','DENIED'])});
export const CurriculumPermissionSchema=z.union([HttpPermission,SavedPermission]);
export type CurriculumPermission=z.infer<typeof CurriculumPermissionSchema>;
export interface CurriculumAuthority{
  /** Trusted operator evidence, not page assertions. Check exact URL, allowed
   * reuse/retention, current robots/terms and operator review of robots restrictions,
   * review expiry and revocations. */
  resolve(sourceUrl:string,now:string):Promise<unknown|null>;
}
export const courseCsvHeaders=['courseCode','courseName','credits','category','major','semester','campus','cohort'] as const;
export interface PublicCurriculumCourse{
  courseCode:string;courseName:string;creditUnits:number;category:string;major:string;semester:string;campus:string;cohort:string;
  sourceUrl:string;verifiedAt:string;edition:string;collectionStatus:'COLLECTED'|'NEEDS_REVIEW';
  offeringStatus:'CONFIRMED'|'UNKNOWN';rulesStatus:'NEEDS_REVIEW';
}
export interface CurriculumRevision{
  version:number;sourceSha256:string;previousSha256:string|null;permissionRef:string;permissionVersion:string;
  sourceUrl:string;edition:string;verifiedAt:string;courses:PublicCurriculumCourse[];duplicateRows:number;reused:boolean;
  lastCheckedAt?:string;
  manualCapture?:{originalSha256:string;normalizedCsvSha256:string;capturedAt:string;
    term:string;campus:string;scope:string;converterVersion:string;redistribution:'ALLOWED'|'DENIED'};
}
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
function officialUrl(value:string):boolean{
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.port
    &&(u.hostname==='hufs.ac.kr'||u.hostname.endsWith('.hufs.ac.kr'))
    &&!/(?:login|signin|sso|auth|session|password|token)/i.test(u.pathname+u.search);
  }catch{return false;}
}
function permission(value:unknown,url:string,now:string,method:'HTTP'|'OPERATOR_SAVED'='HTTP'):CurriculumPermission{
  const p=CurriculumPermissionSchema.safeParse(value);
  if(!p.success||!Utc.safeParse(now).success||p.data.sourceUrl!==url
    ||!officialUrl(url)||!officialUrl(p.data.permissionEvidenceUrl)
    ||(p.data.acquisitionMethod??'HTTP')!==method
    ||Date.parse(p.data.verifiedAt)>Date.parse(now)||Date.parse(p.data.expiresAt)<=Date.parse(now)
    ||p.data.acquisitionMethod==='OPERATOR_SAVED'&&Date.parse(p.data.capturedAt)>Date.parse(p.data.verifiedAt))throw new Error('SOURCE_NOT_PERMITTED');
  return p.data;
}
/** Parser for an operator-reviewed public CSV export. No inferred PDF/HTML
 * rules, personal columns, login scraping or academic approval is performed. */
export function normalizeCurriculum(csv:string,policy:CurriculumPermission,now:string){
  permission(policy,policy.sourceUrl,now,policy.acquisitionMethod??'HTTP');
  if(Buffer.byteLength(csv)>1_000_000)throw new Error('CATALOG_INVALID');
  const parsed=Papa.parse<string[]>(csv.replace(/^\uFEFF/,''),{skipEmptyLines:'greedy'});
  if(parsed.errors.length||parsed.data.length>5001||JSON.stringify(parsed.data[0])!==JSON.stringify(courseCsvHeaders))throw new Error('CATALOG_INVALID');
  const courses:PublicCurriculumCourse[]=[],seen=new Set<string>(),byIdentity=new Map<string,PublicCurriculumCourse[]>();
  let duplicateRows=0;
  for(const raw of parsed.data.slice(1)){
    if(raw.length!==8)throw new Error('CATALOG_INVALID');
    const cells=raw.map(x=>x.trim().normalize('NFKC'));
    if(cells.some(x=>!x||x.length>200||/^[=+@]/.test(x)))throw new Error('CATALOG_INVALID');
    const [courseCode,courseName,credits,category,major,semester,campus,cohort]=cells as [string,string,string,string,string,string,string,string];
    if(!/^[A-Za-z0-9_.-]{1,40}$/.test(courseCode)||!/^\d+(?:\.[05])?$/.test(credits)
      ||Number(credits)>30||!Number.isSafeInteger(Number(credits)*2)
      ||!(/^(?:\d{4}-[12]|UNKNOWN)$/.test(semester)))throw new Error('CATALOG_INVALID');
    if(policy.acquisitionMethod==='OPERATOR_SAVED'
      &&(semester!==policy.term||campus!==policy.campus||major!==policy.scope))throw new Error('SOURCE_NOT_PERMITTED');
    const content=JSON.stringify(cells);
    if(seen.has(content)){duplicateRows++;continue;}seen.add(content);
    const row:PublicCurriculumCourse={courseCode,courseName,creditUnits:Number(credits)*2,category,major,semester,campus,cohort,
      sourceUrl:policy.sourceUrl,verifiedAt:policy.acquisitionMethod==='OPERATOR_SAVED'?policy.verifiedAt:now,
      edition:policy.edition,collectionStatus:'COLLECTED',
      offeringStatus:policy.sourceKind==='OFFERINGS'&&semester!=='UNKNOWN'?'CONFIRMED':'UNKNOWN',rulesStatus:'NEEDS_REVIEW'};
    const identity=JSON.stringify([courseCode,major,semester,campus,cohort]);
    const collisions=byIdentity.get(identity)??[];
    if(collisions.length){row.collectionStatus='NEEDS_REVIEW';for(const old of collisions)old.collectionStatus='NEEDS_REVIEW';}
    collisions.push(row);byIdentity.set(identity,collisions);courses.push(row);
  }
  return {courses,duplicateRows};
}
export async function collectCurriculum(options:{sourceUrl:string;authority:CurriculumAuthority;
  fetcher?:typeof fetch;now?:()=>string;sleep?:(ms:number)=>Promise<void>;previous?:CurriculumRevision;
}):Promise<CurriculumRevision>{
  const clock=options.now??(()=>new Date().toISOString());
  const start=permission(await options.authority.resolve(options.sourceUrl,clock()),options.sourceUrl,clock());
  const fetcher=options.fetcher??fetch,sleep=options.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  let response:Response|undefined;
  // One exact approved URL, at most three requests; no link discovery, redirects,
  // cookies, credentials or login. Each request has its own time/byte bounds.
  for(let attempt=0;attempt<3;attempt++){
    permission(await options.authority.resolve(options.sourceUrl,clock()),options.sourceUrl,clock());
    response=await fetcher(options.sourceUrl,{redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(10_000),headers:{'accept':'text/csv','user-agent':'HUFS-One-Local-Curriculum/1.0'}});
    if(response.status!==429&&response.status!==503)break;
    await response.body?.cancel();
    if(attempt===2)throw new Error('COLLECTION_FAILED');
    const retry=Number(response.headers.get('retry-after'));
    await sleep(Math.max(1000,Math.min(5000,Number.isFinite(retry)?retry*1000:1000*2**attempt)));
  }
  if(!response?.ok||response.redirected||response.url&&response.url!==options.sourceUrl)throw new Error('COLLECTION_FAILED');
  const length=Number(response.headers.get('content-length'));
  if(Number.isFinite(length)&&length>1_000_000)throw new Error('COLLECTION_FAILED');
  const reader=response.body?.getReader(),parts:Uint8Array[]=[];let size=0;
  if(reader){try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
    if(size>1_000_000)throw new Error('COLLECTION_FAILED');parts.push(part.value);}}finally{await reader.cancel();}}
  const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts));
  const verifiedAt=clock();
  const end=permission(await options.authority.resolve(options.sourceUrl,verifiedAt),options.sourceUrl,verifiedAt);
  if(JSON.stringify(start)!==JSON.stringify(end))throw new Error('SOURCE_NOT_PERMITTED');
  return revision(text,end,verifiedAt,options.previous);
}
function revision(text:string,end:CurriculumPermission,checkedAt:string,previous?:CurriculumRevision,
  manualCapture?:CurriculumRevision['manualCapture']):CurriculumRevision{
  const normalized=normalizeCurriculum(text,end,checkedAt),sourceSha256=manualCapture?.originalSha256??digest(text);
  if(previous&&(previous.sourceUrl!==end.sourceUrl||!Number.isSafeInteger(previous.version)
    ||previous.version<1||previous.version>=Number.MAX_SAFE_INTEGER))throw new Error('CATALOG_INVALID');
  if(previous&&manualCapture&&(!previous.manualCapture
    ||previous.manualCapture.term!==manualCapture.term||previous.manualCapture.campus!==manualCapture.campus
    ||previous.manualCapture.scope!==manualCapture.scope))throw new Error('CATALOG_INVALID');
  const reused=!!previous&&previous.sourceSha256===sourceSha256&&previous.permissionRef===end.permissionRef
    &&previous.permissionVersion===end.permissionVersion&&previous.edition===end.edition
    &&JSON.stringify(previous.manualCapture??null)===JSON.stringify(manualCapture??null);
  return {version:previous?(reused?previous.version:previous.version+1):1,sourceSha256,
    previousSha256:reused?previous!.previousSha256:previous?.sourceSha256??null,
    permissionRef:end.permissionRef,permissionVersion:end.permissionVersion,sourceUrl:end.sourceUrl,edition:end.edition,
    verifiedAt:manualCapture?end.verifiedAt:checkedAt,...(manualCapture?{manualCapture,lastCheckedAt:checkedAt}:{}),
    ...normalized,reused};
}

/** Explicit private operator handoff from an independently reviewed converter
 * (e.g. #138). No HTTP, browser automation, HTML parser, school login, approval
 * creation or storage writes occur here. A saved page alone grants no rights. */
export async function importSavedCurriculum(options:{sourceUrl:string;originalBytes:Uint8Array;csv:string;
  capture:SavedCurriculumCapture;authority:SavedCurriculumAuthority;now?:()=>string;previous?:CurriculumRevision;
}):Promise<CurriculumRevision>{
  if(typeof options.authority?.resolveSaved!=='function')throw new Error('SOURCE_NOT_PERMITTED');
  if(!(options.originalBytes instanceof Uint8Array)||options.originalBytes.byteLength===0
    ||options.originalBytes.byteLength>5_000_000||typeof options.csv!=='string'
    ||Buffer.byteLength(options.csv)>1_000_000)throw new Error('CATALOG_INVALID');
  const metadata=SavedCurriculumCaptureSchema.safeParse(options.capture);
  const sourceUrl=options.sourceUrl,clock=options.now??(()=>new Date().toISOString()),authority=options.authority;
  if(!metadata.success||!officialUrl(sourceUrl))throw new Error('SOURCE_NOT_PERMITTED');
  // Snapshot all caller-owned inputs before any authority await. Hashes identify
  // actual saved bytes and exact normalized CSV, not a claimed URL or filename.
  const originalBytes=new Uint8Array(options.originalBytes),csv=options.csv;
  const previous=options.previous===undefined?undefined:structuredClone(options.previous);
  const originalSha256=createHash('sha256').update(originalBytes).digest('hex'),normalizedCsvSha256=digest(csv);
  const key:SavedCurriculumArtifactKey=Object.freeze({sourceUrl,savedArtifactSha256:originalSha256,
    normalizedCsvSha256,...metadata.data});
  const resolve=async()=>{
    const raw=await authority.resolveSaved(key,clock()),checkedAt=clock();
    const value=permission(raw,sourceUrl,checkedAt,'OPERATOR_SAVED');
    if(value.acquisitionMethod!=='OPERATOR_SAVED'
      ||Object.entries(key).some(([field,expected])=>value[field as keyof typeof value]!==expected))
      throw new Error('SOURCE_NOT_PERMITTED');
    return {value,checkedAt};
  };
  const start=await resolve();
  const capture={originalSha256,normalizedCsvSha256,capturedAt:key.capturedAt,
    term:key.term,campus:key.campus,scope:key.scope,converterVersion:key.converterVersion,
    redistribution:start.value.redistribution};
  const parsed=revision(csv,start.value,start.checkedAt,previous,capture);
  const end=await resolve();
  if(JSON.stringify(start.value)!==JSON.stringify(end.value))throw new Error('SOURCE_NOT_PERMITTED');
  return {...parsed,lastCheckedAt:end.checkedAt};
}
