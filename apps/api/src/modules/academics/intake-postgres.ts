import {createHash} from 'node:crypto';
import Papa from 'papaparse';
import {z} from 'zod';
import {
  validateApprovedIntakeBundle,
} from '@hufs-one/contracts';
import type {
  ApprovedCourseFileBinding,FormsValidationOptions,
  CourseRecord,IntakeIssue,
} from '@hufs-one/contracts';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import {ApiFailure} from '../auth/gates.js';

const Ref=z.string().min(2).max(128).regex(/^[A-Za-z0-9_.:@-]+$/);
const Subject=z.string().min(2).max(64).regex(/^[A-Za-z0-9_-]+$/);
const Sha=z.string().regex(/^[a-f0-9]{64}$/);
const digest=(input:string)=>createHash('sha256').update(input,'utf8').digest('hex');
const MAX_SOURCE_BYTES=200_000;
export interface IntakeOperatorAuthority {
  /** Restricted LOCAL_REVIEW only; checks actual student and operator rights,
   * independent original-file provenance and student permission status. */
  mayProcess(input:{actorRef:string;subjectKey:string;action:'PREVIEW'|'APPLY';
    purpose:'LOCAL_TRANSCRIPT_REVIEW';now:string}):Promise<boolean>;
}
export interface RestrictedIntakeInput{
  actorRef:string;
  formsCsv:string;
  courseFiles:readonly {filename:string;content:string}[];
  /** Private runtime mapping; never embedded in source code or persisted. */
  formsOptions:FormsValidationOptions;
  approvedFileBindings:readonly ApprovedCourseFileBinding[];
}
export interface IntakePreview {
  ready:boolean;previewHash:string;
  formRowCount:number;courseRowCounts:Readonly<Record<string,number>>;
  /** Only stable issue identifiers and row indices, NEVER student values/names. */
  issues:readonly IntakeIssue[];
  creditCheckBySubject:Readonly<Record<string,'MATCH'|'MISMATCH'|'UNKNOWN'>>;
  /** Discrepancies need human review, not a silent graduation decision. */
  nextState:'STUDENT_REVIEW_PENDING';
}
export interface IntakeApplyResult {
  previewHash:string;
  applied:readonly {subjectKey:string;version:number;reused:boolean}[];
  nextState:'STUDENT_REVIEW_PENDING';
}
/**
 * Private operator entrypoint. Never expose this service directly to a browser
 * or enable it for reviewer demo flows. No automatic source material uploads,
 * NCP requests, model calls, course-rule judgments, or sharing approval.
 */
export class PostgresRestrictedIntakeImport {
  constructor(private readonly pool:ReviewerSqlPool,
    private readonly authority:IntakeOperatorAuthority,
    private readonly now:()=>string=()=>new Date().toISOString()){}

  private async authorize(actorRef:string,subjects:readonly string[],action:'PREVIEW'|'APPLY'){
    for(const subjectKey of subjects){
      const now=this.now();
      if(!Number.isFinite(Date.parse(now)))throw new Error('Trusted clock unavailable');
      if(await this.authority.mayProcess({
        actorRef,subjectKey,action,purpose:'LOCAL_TRANSCRIPT_REVIEW',now,
      })!==true)throw new ApiFailure('FORBIDDEN');
    }
  }

  private async inspect(input:RestrictedIntakeInput,action:'PREVIEW'|'APPLY'){
    const actorRef=Ref.parse(input.actorRef);
    if(typeof input.formsCsv!=='string'
      ||Buffer.byteLength(input.formsCsv,'utf8')>MAX_SOURCE_BYTES
      ||input.courseFiles.length!==4||input.approvedFileBindings.length!==4)
      throw new ApiFailure('INVALID_INPUT');
    const subjects=input.formsOptions.expectedSubjectKeys;
    if(subjects.length!==4||new Set(subjects).size!==4
      ||subjects.some(x=>!Subject.safeParse(x).success)
      ||Object.keys(input.formsOptions.subjectByDisplayName).length>8
      ||input.courseFiles.some(x=>typeof x.content!=='string'
        ||Buffer.byteLength(x.content,'utf8')>MAX_SOURCE_BYTES))
      throw new ApiFailure('INVALID_INPUT');
    // Authorize before interpreting any source lines. Form-supplied consent is
    // NOT a substitute for this independent purpose-specific authority.
    await this.authorize(actorRef,subjects,action);
    const report=validateApprovedIntakeBundle(input);
    const issues=[...report.issues];
    for(const p of report.forms?.participants??[]){
      if(p.consent.noticeAcknowledged!=='GRANTED'
        ||p.consent.teamReview!=='GRANTED')
        issues.push({code:'CONSENT_DENIED'});
    }
    const hashBySubject=new Map<string,string>();
    for(const file of input.courseFiles){
      const binding=input.approvedFileBindings.find(x=>x.filename===file.filename);
      if(binding&&subjects.includes(binding.subjectKey))
        hashBySubject.set(binding.subjectKey,digest(file.content));
    }
    const formHash=digest(input.formsCsv);
    // A receipt binds the reviewed actor and private filename/subject mapping,
    // not just the raw bytes: reassigning a file invalidates old previews.
    const bindingBySubject=new Map(input.approvedFileBindings.map(x=>[x.subjectKey,{
      filename:x.filename,verificationSource:x.verificationSource,
    }]));
    const previewHash=digest(JSON.stringify({
      actorRef,formHash,subjects:[...subjects].sort().map(subjectKey=>({
        subjectKey,sha:hashBySubject.get(subjectKey)??null,
        binding:bindingBySubject.get(subjectKey)??null,
      })),
      nameBinding:Object.entries(input.formsOptions.subjectByDisplayName)
        .map(([name,key])=>[name.trim().normalize('NFKC'),key])
        .sort(([a],[b])=>a!.localeCompare(b!,'ko-KR')),
    }));
    // The 19th/20th Forms columns are self reports, NEVER a verified transcript.
    // Compare only when both sides are finite half-credit increments; otherwise
    // keep the status UNKNOWN rather than asserting a graduation total.
    const claimed=new Map<string,[string,string]>();
    if(report.forms?.ok){
      const parsed=Papa.parse<string[]>(input.formsCsv.replace(/^\uFEFF/,''),{
        header:false,skipEmptyLines:'greedy',dynamicTyping:false,
      });
      if(parsed.errors.length===0)for(const values of parsed.data.slice(1)){
        const name=(values[6]??'').trim().normalize('NFKC');
        const pair=input.formsOptions.subjectByDisplayName;
        const alias=Object.entries(pair).find(([label])=>label.trim().normalize('NFKC')===name)?.[1];
        if(alias&&subjects.includes(alias))claimed.set(alias,[values[18]??'',values[19]??'']);
      }
    }
    const reportCredit=(subjectKey:string):'MATCH'|'MISMATCH'|'UNKNOWN'=>{
      const raw=claimed.get(subjectKey),records=report.courses[subjectKey]?.records;
      if(!raw||!records||!raw.every(x=>/^\d+(?:\.[05])?$/.test(x.trim())))return 'UNKNOWN';
      const submitted=raw.map(x=>Number(x.trim())*2);
      if(submitted.some(x=>!Number.isSafeInteger(x)||x>5000))return 'UNKNOWN';
      const earned=records.filter(x=>x.ledger==='EARNED')
        .reduce((sum,x)=>sum+x.creditUnits,0);
      const enrolled=records.filter(x=>x.ledger==='IN_PROGRESS')
        .reduce((sum,x)=>sum+x.creditUnits,0);
      return submitted[0]===earned&&submitted[1]===enrolled?'MATCH':'MISMATCH';
    };
    const creditCheckBySubject:Record<string,'MATCH'|'MISMATCH'|'UNKNOWN'>=
      Object.fromEntries(subjects.map(key=>[key,reportCredit(key)]));
    return {actorRef,subjects:[...subjects].sort(),report,issues,
      hashBySubject,formHash,previewHash,creditCheckBySubject};
  }

  async preview(input:RestrictedIntakeInput):Promise<IntakePreview>{
    const x=await this.inspect(input,'PREVIEW');
    return {ready:x.issues.length===0,previewHash:x.previewHash,
      formRowCount:x.report.forms?.rowCount??0,
      courseRowCounts:Object.fromEntries(x.subjects.map(k=>[
        k,x.report.courses[k]?.rowCount??0,
      ])),
      issues:x.issues,creditCheckBySubject:x.creditCheckBySubject,
      nextState:'STUDENT_REVIEW_PENDING'};
  }

  async apply(input:RestrictedIntakeInput,confirmation:{
    previewHash:string;expectedVersions:Readonly<Record<string,number>>;
  }):Promise<IntakeApplyResult>{
    const x=await this.inspect(input,'APPLY');
    if(!x.report.ready||x.issues.length
      ||!Sha.safeParse(confirmation.previewHash).success
      ||confirmation.previewHash!==x.previewHash
      ||Object.keys(confirmation.expectedVersions).length!==4
      ||x.subjects.some(s=>!Number.isSafeInteger(confirmation.expectedVersions[s])
        ||confirmation.expectedVersions[s]!<0))
      throw new ApiFailure('INVALID_INPUT');
    const c=await this.pool.connect();
    let started=false;
    try{
      await c.query('BEGIN');started=true;
      await c.query("SET LOCAL statement_timeout='5s'");
      const applied:IntakeApplyResult['applied'][number][]=[];
      // Sorted exclusive row locks prevent cross-import deadlocks and ensure
      // one atomic all-four commit. Historical revisions are immutable.
      for(const subjectKey of x.subjects){
        await c.query(`INSERT INTO api_intake_heads(subject_key) VALUES($1)
          ON CONFLICT(subject_key) DO NOTHING`,[subjectKey]);
        const response=await c.query(`SELECT current_version,current_batch_sha256
          FROM api_intake_heads WHERE subject_key=$1 FOR UPDATE`,[subjectKey]);
        if(response.rows.length!==1)throw new Error('Intake head missing');
        const raw=response.rows[0]!;
        const current=Number(raw.current_version);
        if(!Number.isSafeInteger(current)||current<0)
          throw new Error('Invalid intake version');
        const course=x.report.courses[subjectKey];
        const courseHash=x.hashBySubject.get(subjectKey);
        if(!course||!course.ok||!courseHash)throw new ApiFailure('INVALID_INPUT');
        const batchHash=digest(JSON.stringify({previewHash:x.previewHash,form:x.formHash,courseHash,subjectKey}));
        if(raw.current_batch_sha256===batchHash){
          applied.push({subjectKey,version:current,reused:true});
          continue;
        }
        if(confirmation.expectedVersions[subjectKey]!==current)
          throw new ApiFailure('VERSION_CONFLICT');
        const version=current+1;
        const rows=JSON.stringify(course.records satisfies CourseRecord[]);
        if(Buffer.byteLength(rows)>MAX_SOURCE_BYTES)
          throw new ApiFailure('INVALID_INPUT');
        const saved=await c.query(`INSERT INTO api_intake_revisions(
          subject_key,import_version,batch_sha256,forms_sha256,course_sha256,actor_ref,course_rows)
          VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING import_version`,[
          subjectKey,version,batchHash,x.formHash,courseHash,x.actorRef,rows,
        ]);
        if(saved.rows.length!==1)throw new Error('Intake audit write failed');
        const changed=await c.query(`UPDATE api_intake_heads
          SET current_version=$2,current_batch_sha256=$3,updated_at=clock_timestamp()
          WHERE subject_key=$1 AND current_version=$4 RETURNING current_version`,
          [subjectKey,version,batchHash,current]);
        if(changed.rows.length!==1)throw new ApiFailure('VERSION_CONFLICT');
        applied.push({subjectKey,version,reused:false});
      }
      // Connection acquisition, row locks and writes may outlive purpose rights.
      // Recheck before the all-four commit, including an idempotent replay.
      await this.authorize(x.actorRef,x.subjects,'APPLY');
      await c.query('COMMIT');started=false;
      return {previewHash:x.previewHash,applied,nextState:'STUDENT_REVIEW_PENDING'};
    }catch(error){
      if(started)try{await c.query('ROLLBACK');}catch{/* fail closed */}
      throw error;
    }finally{c.release();}
  }
}
