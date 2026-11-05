import Papa from 'papaparse';
import {z} from 'zod';
import {COURSE_CSV_HEADERS, CourseRecordSchema, type CourseRecord} from '../academics/index.js';

/** Exact 26 public question headers, not any team's answers. Source: A03 + Form export header. */
export const FORMS_HEADERS = [
  '타임스탬프',
  '이 양식의 수집 목적·보관 위치·철회 경로를 읽었습니까?',
  '동료 검증 에이전트/담당 팀원이 정제 자료를 검토해도 됩니까?',
  '선택한 경험/일부 정보의 외부 CLOVA AI 처리에 동의합니까?',
  '정제된 개인 정보의 비공개 NCP 저장에 동의합니까?',
  '가명화·검수된 본인 사례를 발표/녹화에 사용해도 됩니까?',
  '본인의 표시 이름(실명 또는 별명) 1~40자, 민감정보 기재 금지',
  '소속 캠퍼스',
  '입학연도 네 자리 연도 (예: 2025)',
  '입학유형',
  '현재 학적',
  '현재 학기(몇 학기째) 알면 숫자, 모르면 공란 예: 8',
  '제1전공의 공식 학과·전공명 표기(과 이름과 학부명 구분)',
  '두 번째 이수과정의 유형',
  '이중전공·제2전공의 공식 이름 / 없음이면 공란',
  '별도 부전공이 있다면 공식 이름 / 해당 없으면 공란',
  '적용 교육과정·학번별 예외를 알고 있다면',
  "목표 졸업학기 'YYYY-1\` 또는 \`YYYY-2\`, 미정 허용",
  '본인 화면에서 보이는 현재 취득학점 합계 숫자 또는 미확인',
  '현재 수강 중인 학점의 합계 숫자 또는 미확인',
  '관심 있는 분야(최대 5개)',
  '관심 직무(최대 3개) 예: 금융분석 / 데이터분석 / 소프트웨어',
  '지난 방학에 무엇을 했나요? 예: 활동명과 본인 역할만 1~5문장',
  '학기 중 학교 밖에서 어떤 활동을 하나요? 사실만 1~5문장',
  '학생 본인이 확인한 이수과목 CSV를 별도로 준비할 수 있습니까?',
  '수강자료에서 해석이 어려운 이수구분·대체 인정 등이 있습니까?',
] as const;

export const EXPECTED_REAL_CONTRIBUTORS = 4; // Five DEVELOPERS, four real intake subjects.
export const IntakeIssueCodeSchema=z.enum([
  'CSV_PARSE_ERROR','HEADER_MISMATCH','HEADER_DUPLICATE','ROW_WIDTH_MISMATCH',
  'ROW_EMPTY','COURSE_STATUS_INVALID','COURSE_CREDITS_INVALID','COURSE_DUPLICATE_REVIEW',
  'UNMAPPED_PERSON','DUPLICATE_PERSON','MISSING_PERSON','UNEXPECTED_PERSON',
  'INCOMPLETE_BATCH','CONSENT_UNKNOWN','CONSENT_DENIED','UNAPPROVED_FILENAME','CSV_FORMULA_INJECTION',
]);
export type IntakeIssueCode=z.infer<typeof IntakeIssueCodeSchema>;
export type IntakeIssue={code:IntakeIssueCode;row?:number;column?:number};
export type ConsentValue='GRANTED'|'DENIED'|'UNKNOWN';
export type FormConsentSummary={noticeAcknowledged:ConsentValue;teamReview:ConsentValue;externalAi:ConsentValue;ncpStorage:ConsentValue;presentation:ConsentValue};
export type FormParticipantSummary={subjectKey:string;consent:FormConsentSummary};
export type CourseCsvValidation={ok:boolean;rowCount:number;records:CourseRecord[];issues:IntakeIssue[]};
export type FormsCsvValidation={ok:boolean;rowCount:number;participants:FormParticipantSummary[];issues:IntakeIssue[]};

function canonical(v:string):string{return v.trim().normalize('NFKC');}
function extractTable(csv:string):{rows:string[][];issues:IntakeIssue[]}{
  const parsed=Papa.parse<string[]>(csv.replace(/^\uFEFF/,''),{header:false,skipEmptyLines:'greedy',dynamicTyping:false});
  // Never return raw parser diagnostics: they can embed personal response content.
  return {rows:parsed.data,issues:parsed.errors.map(e=>({code:'CSV_PARSE_ERROR',...(e.row===undefined?{}:{row:e.row+1})}))};
}
function checkHeaders(actual:readonly string[],expected:readonly string[]):IntakeIssue[]{
  const h=actual.map(canonical),e=expected.map(canonical);const issues:IntakeIssue[]=[];
  if(h.length!==e.length||h.some((v,i)=>v!==e[i]))issues.push({code:'HEADER_MISMATCH',row:1});
  if(new Set(h).size!==h.length)issues.push({code:'HEADER_DUPLICATE',row:1});
  return issues;
}
function parseConsent(text:string|undefined):ConsentValue{
  const x=canonical(text||''),english=x.toUpperCase();
  // The actual owner-confirmed Forms export contains exact YES/NO values.
  // These are per-question answers; they never substitute owner identity mapping,
  // independent evidence rights, a live SharingGrant or an unrevoked session.
  if(english==='YES')return 'GRANTED';
  if(english==='NO')return 'DENIED';
  if(['예','네','동의','동의합니다','동의함','확인했습니다'].includes(x))return 'GRANTED';
  if(['아니요','아니오','비동의','동의하지 않습니다','동의하지 않음'].includes(x))return 'DENIED';
  return 'UNKNOWN'; // Any unlisted or future answer stays fail-closed.
}

export function validateCourseCsv(csv:string):CourseCsvValidation{
  const {rows,issues}=extractTable(csv);
  if(rows.length===0)return {ok:false,rowCount:0,records:[],issues:[...issues,{code:'HEADER_MISMATCH',row:1}]};
  issues.push(...checkHeaders(rows[0]||[],COURSE_CSV_HEADERS));
  if(issues.length>0)return {ok:false,rowCount:Math.max(0,rows.length-1),records:[],issues};
  const records:CourseRecord[]=[];const seen=new Set<string>();
  for(const [index,cols] of rows.slice(1).entries()){
    const row=index+2;
    if(cols.length!==COURSE_CSV_HEADERS.length){issues.push({code:'ROW_WIDTH_MISMATCH',row});continue;}
    const [term='',code='',name='',credit='',category='',status='']=cols;
    if(!canonical(term)||!canonical(name)){issues.push({code:'ROW_EMPTY',row});continue;}
    if(status!=='이수완료'&&status!=='수강중'){issues.push({code:'COURSE_STATUS_INVALID',row,column:6});continue;}
    if([term,code,name,category].some(v=>/^[=+@]/.test(v.trim()))){issues.push({code:'CSV_FORMULA_INJECTION',row});continue;}
    const creditText=credit.trim();
    const creditNumber=Number(creditText);
    if(!/^\d+(?:\.[05])?$/.test(creditText)||!Number.isFinite(creditNumber)||creditNumber<0||creditNumber>30||!Number.isInteger(creditNumber*2)){
      issues.push({code:'COURSE_CREDITS_INVALID',row,column:4});continue;
    }
    const record=CourseRecordSchema.safeParse({term,courseCode:code,courseName:name,
      creditUnits:creditNumber*2,category,ledger:status==='이수완료'?'EARNED':'IN_PROGRESS'});
    if(!record.success){issues.push({code:'COURSE_CREDITS_INVALID',row});continue;}
    // Flag for manual review: same course/term might be a separate section/repeat.
    const key=[canonical(term),canonical(code),canonical(name),status].join('|');
    if(seen.has(key))issues.push({code:'COURSE_DUPLICATE_REVIEW',row});
    seen.add(key);records.push(record.data);
  }
  return {ok:issues.length===0,rowCount:Math.max(0,rows.length-1),records,issues};
}

export interface FormsValidationOptions{
  /** Runtime-private mapping from an approved display name/alias to an opaque subject key. */
  subjectByDisplayName:Readonly<Record<string,string>>;
  expectedSubjectKeys:readonly string[]; // e.g. synthetic opaque keys; do not commit real maps.
}
export function validateFormsCsv(csv:string,opts:FormsValidationOptions):FormsCsvValidation{
  const {rows,issues}=extractTable(csv);const participants:FormParticipantSummary[]=[];
  if(rows.length===0)return {ok:false,rowCount:0,participants,issues:[...issues,{code:'HEADER_MISMATCH',row:1}]};
  issues.push(...checkHeaders(rows[0]||[],FORMS_HEADERS));
  const expected=opts.expectedSubjectKeys;
  if(expected.length!==EXPECTED_REAL_CONTRIBUTORS||new Set(expected).size!==expected.length){
    issues.push({code:'INCOMPLETE_BATCH'});
  }
  if(issues.length>0)return {ok:false,rowCount:Math.max(0,rows.length-1),participants,issues};
  const names=new Map<string,string>();
  for(const [untrustedName,subject] of Object.entries(opts.subjectByDisplayName)){
    const k=canonical(untrustedName);
    if(names.has(k)&&names.get(k)!==subject){issues.push({code:'UNMAPPED_PERSON'});return {ok:false,rowCount:Math.max(0,rows.length-1),participants,issues};}
    names.set(k,subject);
  }
  const seen=new Set<string>();const wanted=new Set(expected);
  for(const [index,cols] of rows.slice(1).entries()){
    const row=index+2;
    if(cols.length!==FORMS_HEADERS.length){issues.push({code:'ROW_WIDTH_MISMATCH',row});continue;}
    const subject=names.get(canonical(cols[6]||''));
    if(!subject||!wanted.has(subject)){issues.push({code:'UNMAPPED_PERSON',row});continue;}
    if(seen.has(subject)){issues.push({code:'DUPLICATE_PERSON',row});continue;}
    seen.add(subject);
    const consent:FormConsentSummary={
      noticeAcknowledged:parseConsent(cols[1]),teamReview:parseConsent(cols[2]),
      externalAi:parseConsent(cols[3]),ncpStorage:parseConsent(cols[4]),presentation:parseConsent(cols[5]),
    };
    // Incomplete consent blocks APPROVED input, not the respondent's right to refuse.
    if(Object.values(consent).some(v=>v==='UNKNOWN'))issues.push({code:'CONSENT_UNKNOWN',row});
    participants.push({subjectKey:subject,consent});
  }
  for(const key of wanted)if(!seen.has(key))issues.push({code:'MISSING_PERSON'});
  if(rows.length-1!==EXPECTED_REAL_CONTRIBUTORS)issues.push({code:'INCOMPLETE_BATCH'});
  return {ok:issues.length===0,rowCount:Math.max(0,rows.length-1),participants,issues};
}

/** Partial bundle readiness is not consent to share raw data or deploy to NCP. */
export function validateIntakeBundle(input:{
  formsCsv?:string;
  courseCsvBySubject:Readonly<Record<string,string>>;
  formsOptions:FormsValidationOptions;
}):{ready:boolean;forms?:FormsCsvValidation;courses:Record<string,CourseCsvValidation>;issues:IntakeIssue[]}{
  const {expectedSubjectKeys}=input.formsOptions;const ids=new Set(expectedSubjectKeys);
  const courses:Record<string,CourseCsvValidation>={};const issues:IntakeIssue[]=[];
  const forms=input.formsCsv===undefined?undefined:validateFormsCsv(input.formsCsv,input.formsOptions);
  if(forms)issues.push(...forms.issues);else issues.push({code:'INCOMPLETE_BATCH'});
  for(const [key,value] of Object.entries(input.courseCsvBySubject)){
    if(!ids.has(key)){issues.push({code:'UNEXPECTED_PERSON'});continue;}
    const result=validateCourseCsv(value);courses[key]=result;issues.push(...result.issues);
  }
  for(const id of ids)if(!courses[id])issues.push({code:'MISSING_PERSON'});
  return {ready:issues.length===0,...(forms?{forms}:{}),courses,issues};
}

/** Explicitly owner-/student-confirmed file binding. File names are NOT identities. */
export type ApprovedCourseFileBinding={
  filename:string;subjectKey:string;verificationSource:'OWNER_STATEMENT'|'SUBJECT_CONFIRMATION';
};
/** Preferred entrypoint. Raw text must remain in the caller's restricted workspace. */
export function validateApprovedIntakeBundle(input:{
  formsCsv?:string;
  courseFiles:readonly {filename:string;content:string}[];
  approvedFileBindings:readonly ApprovedCourseFileBinding[];
  formsOptions:FormsValidationOptions;
}):ReturnType<typeof validateIntakeBundle>{
  const approved=new Map<string,ApprovedCourseFileBinding>();
  const issues:IntakeIssue[]=[];
  for(const record of input.approvedFileBindings){
    if(approved.has(record.filename))issues.push({code:'UNAPPROVED_FILENAME'});
    approved.set(record.filename,record);
  }
  const courseCsvBySubject:Record<string,string>={};
  for(const file of input.courseFiles){
    // Explicitly reject paths/symlinks and disallow auto-assignment by student name.
    if(!/^이수과목_[^/\\]+\.csv$/u.test(file.filename)){
      issues.push({code:'UNAPPROVED_FILENAME'});continue;
    }
    const binding=approved.get(file.filename);
    if(!binding||!input.formsOptions.expectedSubjectKeys.includes(binding.subjectKey)){
      issues.push({code:'UNAPPROVED_FILENAME'});continue;
    }
    if(Object.hasOwn(courseCsvBySubject,binding.subjectKey)){
      issues.push({code:'DUPLICATE_PERSON'});continue;
    }
    courseCsvBySubject[binding.subjectKey]=file.content;
  }
  const report=validateIntakeBundle({...(input.formsCsv===undefined?{}:{formsCsv:input.formsCsv}),
    courseCsvBySubject,formsOptions:input.formsOptions});
  return {...report,ready:report.ready&&issues.length===0,issues:[...report.issues,...issues]};
}
