import {createHash} from 'node:crypto';
import Papa from 'papaparse';
import {z} from 'zod';
const Utc=z.iso.datetime({offset:true});
const Ref=z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/);
export const CurriculumPermissionSchema=z.strictObject({
  sourceUrl:z.string().url(),permissionRef:Ref,permissionVersion:Ref,permissionEvidenceUrl:z.string().url(),
  verifiedAt:Utc,expiresAt:Utc,edition:Ref,sourceKind:z.enum(['CURRICULUM','OFFERINGS']),
  collection:z.literal('ALLOWED'),retention:z.literal('ALLOWED'),robots:z.literal('ALLOWED'),terms:z.literal('ALLOWED'),revoked:z.literal(false),
});
export type CurriculumPermission=z.infer<typeof CurriculumPermissionSchema>;
export interface CurriculumAuthority{
  /** Trusted operator evidence, not page assertions. Check exact URL, allowed
   * reuse/retention, current robots/terms, review expiry and revocations. */
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
}
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
function officialUrl(value:string):boolean{
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.port
    &&(u.hostname==='hufs.ac.kr'||u.hostname.endsWith('.hufs.ac.kr'))
    &&!/(?:login|signin|sso|auth|session|password|token)/i.test(u.pathname+u.search);
  }catch{return false;}
}
function permission(value:unknown,url:string,now:string):CurriculumPermission{
  const p=CurriculumPermissionSchema.safeParse(value);
  if(!p.success||!Utc.safeParse(now).success||p.data.sourceUrl!==url
    ||!officialUrl(url)||!officialUrl(p.data.permissionEvidenceUrl)
    ||Date.parse(p.data.verifiedAt)>Date.parse(now)||Date.parse(p.data.expiresAt)<=Date.parse(now))throw new Error('SOURCE_NOT_PERMITTED');
  return p.data;
}
/** Parser for an operator-reviewed public CSV export. No inferred PDF/HTML
 * rules, personal columns, login scraping or academic approval is performed. */
export function normalizeCurriculum(csv:string,policy:CurriculumPermission,now:string){
  permission(policy,policy.sourceUrl,now);
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
    const content=JSON.stringify(cells);
    if(seen.has(content)){duplicateRows++;continue;}seen.add(content);
    const row:PublicCurriculumCourse={courseCode,courseName,creditUnits:Number(credits)*2,category,major,semester,campus,cohort,
      sourceUrl:policy.sourceUrl,verifiedAt:now,edition:policy.edition,collectionStatus:'COLLECTED',
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
  const normalized=normalizeCurriculum(text,end,verifiedAt),sourceSha256=digest(text),previous=options.previous;
  if(previous&&(previous.sourceUrl!==end.sourceUrl||!Number.isSafeInteger(previous.version)||previous.version<1))throw new Error('CATALOG_INVALID');
  const reused=!!previous&&previous.sourceSha256===sourceSha256&&previous.permissionVersion===end.permissionVersion&&previous.edition===end.edition;
  return {version:previous?(reused?previous.version:previous.version+1):1,sourceSha256,
    previousSha256:reused?previous!.previousSha256:previous?.sourceSha256??null,
    permissionRef:end.permissionRef,permissionVersion:end.permissionVersion,sourceUrl:end.sourceUrl,edition:end.edition,verifiedAt,
    ...normalized,reused};
}
