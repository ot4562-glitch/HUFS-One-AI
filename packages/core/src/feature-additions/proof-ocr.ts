/** #346 — OCR lines of one proof document → a reviewable proof candidate.
 * Deterministic keyword/layout rules over already normalized CLOVA OCR lines (see
 * packages/ai/src/ocr-evidence.ts); no model call. Every value is copied from one OCR line and keeps
 * that line's id and bbox. The result is always NEEDS_REVIEW and never says the school or issuer
 * verified anything; feed `proposedKind`/`confidence` to `classifyProofCandidate` after owner review. */
export type ProofKind='CERTIFICATE'|'PARTICIPATION_PROOF'|'ACTIVITY_REPORT'|'AWARD_PROOF'|'OTHER';
export type BBox=readonly [number,number,number,number];
export interface ProofOcrLine{id:string;text:string;bboxNorm:BBox;confidence:number;}
export type ProofFieldName='ISSUER'|'PERIOD_START'|'PERIOD_END'|'ISSUED_ON'|'HOURS'|'AWARD_TITLE';
export interface ProofField{name:ProofFieldName;value:string;quote:string;lineId:string;bboxNorm:BBox;confidence:number;}
export type ProofFlag='NOT_A_PROOF_DOCUMENT'|'KIND_UNCLEAR'|'LOW_OCR_CONFIDENCE'|'ISSUER_NOT_FOUND'|'ISSUER_MISMATCH'
  |'PERIOD_NOT_FOUND'|'PERIOD_MISMATCH'|'MULTIPLE_PERIODS'|'ISSUED_BEFORE_END'|'CONTAINS_PERSONAL_DATA';
/** What the student entered for the activity; compared, never overwritten. */
export interface ClaimedActivity{organization?:string;startDate?:string;endDate?:string;}
export interface ProofExtraction{
  proposedKind:ProofKind|'UNKNOWN';kindEvidenceLineIds:readonly string[];
  /** Heuristic 0–1 (keyword margin × OCR confidence), not an authenticity score. */
  confidence:number;
  fields:readonly ProofField[];flags:readonly ProofFlag[];
  /** Lines holding names, birth dates, IDs or contacts: excluded from fields; mask before storing or showing. */
  personalDataLineIds:readonly string[];
  reviewStatus:'NEEDS_REVIEW';source:'OCR';officiallyVerified:false;
}

const LOW_CONFIDENCE=0.8;
const TOP_ZONE=0.3,BOTTOM_ZONE=0.55;
// Weights per compact (space-free, lower-case) keyword; letter-spaced titles ("수 료 증") still match.
const KIND_WORDS:Readonly<Record<ProofKind,readonly [string,number][]>>={
  CERTIFICATE:[['수료증',3],['이수증',3],['certificateofcompletion',3],['수료',1],['이수',1],['교육과정',1],['completion',1]],
  PARTICIPATION_PROOF:[['참가확인서',3],['참여확인서',3],['활동확인서',3],['봉사활동확인서',3],['실습확인서',3],
    ['certificateofparticipation',3],['참여하였음을확인',2],['활동하였음을확인',2],['participatedin',2],['확인서',1],
    ['증명서',1],['봉사',1],['인턴',1],['참가',1],['참여',1],['participation',1],['attendance',1]],
  ACTIVITY_REPORT:[['활동보고서',3],['결과보고서',3],['보고서',2],['activityreport',3],['활동내용',1],['느낀점',1],['report',1]],
  AWARD_PROOF:[['상장',3],['표창장',3],['certificateofaward',3],['수상',2],['최우수상',2],['우수상',2],['장려상',2],['금상',2],
    ['은상',2],['동상',2],['입상',2],['특별상',2],['award',2],['grandprize',2]],
  OTHER:[['위촉장',3],['임명장',3],['감사장',3],['서약서',3]],
};
/** Documents that are never activity proof, whatever else they mention. */
const NON_PROOF=['영수증','재학증명서','성적증명서','졸업증명서','주민등록','가족관계','통장사본','receipt','invoice'];
const PERSONAL=/성명|이름|생년월일|주민등록번호|학번|연락처|전화|휴대폰|e-?mail|이메일|\d{6}\s*-\s*[1-4]\d{6}|01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|[\w.+-]+@[\w-]+\.[\w.-]+|\b\d{7,}\b|\bname\s*:|date of birth/i;
const AWARD_TITLE=/최우수상|우수상|장려상|금상|은상|동상|입상|특별상|대상(?=\s*(?:을|수상|$))|grand prize|first prize|excellence award/i;
const ORG=/대학교|대학|재단|협회|센터|위원회|학회|연구원|연구소|교육원|공사|공단|주식회사|\(주\)|㈜|복지관|도서관|박물관|수련관|협의회|연합회|본부|구청|시청|군청|도청|은행|university|foundation|association|center|centre|institute|council|society|company|inc\.?|corp\.?|ltd\.?/i;
const ROLES=['대표이사','이사장','센터장','위원장','총장','관장','회장','원장','학장','소장','청장','대표','장','president','director','ceo'];
const ISSUER_CUE=/발급\s*기관|발행\s*기관|주관|주최|기관명|issued\s*by/i;
const PERIOD_CUE=/기간|일시|일정|period|duration/i;
const ISSUE_CUE=/발급|발행|issued|date\s*:/i;
const START_CUE=/시작|부터|from|start/i,END_CUE=/종료|까지|end/i;
const DATE=/(\d{4})\s*(?:[.\-/]|년)\s*(\d{1,2})\s*(?:[.\-/]|월)\s*(\d{1,2})\s*(?:일|\.)?/g;
/** Checked only on the text between two dates, so the hyphens inside "2026-07-01" never count. */
const RANGE_SEP=/[~〜–—-]|부터|\bto\b/i;
const HOURS=/(\d{1,4}(?:\.\d)?)\s*(?:시간|hours?\b)/i;

const compact=(s:string)=>s.normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g,'');
function isoDate(y:string,m:string,d:string):string|null{
  const year=Number(y),month=Number(m),day=Number(d);
  if(year<1990||year>2100||month<1||month>12||day<1)return null;
  const t=new Date(Date.UTC(year,month-1,day));
  return t.getUTCMonth()===month-1&&t.getUTCDate()===day?t.toISOString().slice(0,10):null;
}
function datesIn(text:string):{iso:string;quote:string;at:number;until:number}[]{
  const out:{iso:string;quote:string;at:number;until:number}[]=[];
  for(const m of text.normalize('NFKC').matchAll(DATE)){
    const iso=isoDate(m[1]!,m[2]!,m[3]!);
    if(iso)out.push({iso,quote:m[0].trim(),at:m.index!,until:m.index!+m[0].length});
  }
  return out;
}
const field=(name:ProofFieldName,value:string,quote:string,line:ProofOcrLine):ProofField=>
  ({name,value,quote,lineId:line.id,bboxNorm:line.bboxNorm,confidence:line.confidence});

function classify(lines:readonly ProofOcrLine[]){
  const top=lines.filter(l=>l.bboxNorm[1]<TOP_ZONE);
  if(top.some(l=>NON_PROOF.some(w=>compact(l.text).includes(w))))return {kind:'UNKNOWN' as const,evidence:[],score:0,margin:0,nonProof:true};
  const scores=(Object.keys(KIND_WORDS) as ProofKind[]).map(kind=>{
    let score=0;const evidence=new Set<string>();
    for(const line of lines){
      const text=compact(line.text),zone=line.bboxNorm[1]<TOP_ZONE?2:1;
      // Count only the strongest keyword per line, so "봉사활동확인서" is not also "확인서" + "봉사".
      const best=Math.max(0,...KIND_WORDS[kind].filter(([w])=>text.includes(w)).map(([,v])=>v));
      if(best){score+=best*zone;evidence.add(line.id);}
    }
    return {kind,score,evidence:[...evidence]};
  }).sort((a,b)=>b.score-a.score);
  const [first,second]=[scores[0]!,scores[1]!];
  const margin=first.score-second.score;
  if(first.score<4||margin<2)return {kind:'UNKNOWN' as const,evidence:first.evidence,score:first.score,margin,nonProof:first.score===0};
  return {kind:first.kind,evidence:first.evidence,score:first.score,margin,nonProof:false};
}
/** Organization text before a role word; the role and any name after it are dropped. */
function issuerOf(text:string):string|null{
  const cleaned=text.normalize('NFKC').replace(/\(인\)|\[인\]|직인|\(seal\)/gi,' ').replace(ISSUER_CUE,' ')
    .replace(/^[\s:：]+/,'').trim();
  if(!ORG.test(cleaned))return null;
  const tokens=cleaned.split(/\s+/);
  for(let i=0;i<tokens.length;i++){
    for(const role of ROLES){
      const token=tokens[i]!;
      if(!token.toLocaleLowerCase('en').endsWith(role))continue;
      const rest=token.slice(0,token.length-role.length);
      // "평생교육원장" is 평생교육원 + 장, not 평생교육 + 원장: a glued remainder must itself be an organization.
      if(rest?!ORG.test(rest):i===0)continue;
      const org=[...tokens.slice(0,i),rest].filter(Boolean).join(' ');
      if(ORG.test(org))return org;
    }
  }
  return cleaned;
}
function sameOrganization(a:string,b:string):boolean{
  const norm=(s:string)=>compact(s).replace(/주식회사|\(주\)|㈜|재단법인|사단법인|[^\p{L}\p{N}]/gu,'');
  const x=norm(a),y=norm(b);
  if(!x||!y)return false;
  if(x.includes(y)||y.includes(x))return true;
  const grams=(s:string)=>new Set([...s].slice(1).map((c,i)=>s[i]+c));
  const gx=grams(x),gy=grams(y);
  return [...gx].filter(g=>gy.has(g)).length/Math.max(gx.size,1)>=0.6;
}

export function extractProofCandidate(raw:readonly ProofOcrLine[],claimed:ClaimedActivity={}):ProofExtraction{
  const all=raw.filter(l=>l.text.trim()).map(l=>({...l,bboxNorm:[...l.bboxNorm] as unknown as BBox}));
  const flags=new Set<ProofFlag>();
  const personal=all.filter(l=>PERSONAL.test(l.text));
  if(personal.length)flags.add('CONTAINS_PERSONAL_DATA');
  const personalIds=new Set(personal.map(l=>l.id));
  // A birth date or student number must never become a period, issue date or issuer.
  const lines=all.filter(l=>!personalIds.has(l.id));
  const kind=classify(all);
  if(kind.nonProof)flags.add('NOT_A_PROOF_DOCUMENT');else if(kind.kind==='UNKNOWN')flags.add('KIND_UNCLEAR');
  const fields:ProofField[]=[];

  // Period: a line with two dates and a range separator, preferring a "기간" line.
  const ranges=lines.flatMap(line=>{
    const ds=datesIn(line.text);
    const between=ds.length>=2?line.text.normalize('NFKC').slice(ds[0]!.until,ds[1]!.at):'';
    return ds.length>=2&&RANGE_SEP.test(between)?[{line,start:ds[0]!,end:ds[1]!}]:[];
  });
  const distinct=new Set(ranges.map(r=>r.start.iso+'/'+r.end.iso));
  if(distinct.size>1)flags.add('MULTIPLE_PERIODS');
  let period=ranges.find(r=>PERIOD_CUE.test(r.line.text))||(distinct.size===1?ranges[0]:undefined);
  let startLine:ProofOcrLine|undefined,endLine:ProofOcrLine|undefined,start,end;
  if(period){startLine=endLine=period.line;start=period.start;end=period.end;}
  else if(!ranges.length){
    // Separate "시작일 …" / "종료일 …" lines.
    const single=(cue:RegExp)=>lines.find(l=>cue.test(l.text)&&datesIn(l.text).length===1);
    const s=single(START_CUE),e=single(END_CUE);
    if(s&&e&&s.id!==e.id){startLine=s;endLine=e;start=datesIn(s.text)[0];end=datesIn(e.text)[0];}
  }
  if(start&&end&&startLine&&endLine&&start.iso<=end.iso){
    fields.push(field('PERIOD_START',start.iso,start.quote,startLine),field('PERIOD_END',end.iso,end.quote,endLine));
  }else{start=end=undefined;flags.add('PERIOD_NOT_FOUND');}

  // Issue date: a single date on an issue-cue line, else the lowest single date in the bottom zone.
  const usedForPeriod=new Set([startLine?.id,endLine?.id]);
  const singles=lines.filter(l=>!usedForPeriod.has(l.id)&&datesIn(l.text).length===1);
  const issueLine=singles.find(l=>ISSUE_CUE.test(l.text))
    ||singles.filter(l=>l.bboxNorm[1]>=BOTTOM_ZONE).sort((a,b)=>b.bboxNorm[1]-a.bboxNorm[1])[0];
  if(issueLine){
    const d=datesIn(issueLine.text)[0]!;
    fields.push(field('ISSUED_ON',d.iso,d.quote,issueLine));
    if(end&&d.iso<end.iso)flags.add('ISSUED_BEFORE_END');
  }

  const hoursLine=lines.find(l=>HOURS.test(l.text));
  if(hoursLine){const m=hoursLine.text.normalize('NFKC').match(HOURS)!;fields.push(field('HOURS',m[1]!,m[0],hoursLine));}
  if(kind.kind==='AWARD_PROOF'){
    const awardLine=lines.find(l=>AWARD_TITLE.test(l.text.normalize('NFKC')));
    if(awardLine){const m=awardLine.text.normalize('NFKC').match(AWARD_TITLE)!;fields.push(field('AWARD_TITLE',m[0],m[0],awardLine));}
  }

  // Issuer: an explicit cue line first, then organization lines from the bottom up.
  const issuerLines=[...lines.filter(l=>ISSUER_CUE.test(l.text)),
    ...lines.filter(l=>l.bboxNorm[1]>=BOTTOM_ZONE).sort((a,b)=>b.bboxNorm[1]-a.bboxNorm[1])];
  let issuer:ProofField|undefined;
  for(const line of issuerLines){
    const org=issuerOf(line.text);
    if(org){issuer=field('ISSUER',org,org,line);break;}
  }
  if(issuer)fields.push(issuer);else flags.add('ISSUER_NOT_FOUND');

  if(claimed.organization&&issuer&&!sameOrganization(claimed.organization,issuer.value))flags.add('ISSUER_MISMATCH');
  if(start&&end&&((claimed.startDate&&claimed.startDate!==start.iso)||(claimed.endDate&&claimed.endDate!==end.iso)))
    flags.add('PERIOD_MISMATCH');
  const used=[...new Set([...kind.evidence,...fields.map(f=>f.lineId)])].map(id=>all.find(l=>l.id===id)!);
  if(used.some(l=>l.confidence<LOW_CONFIDENCE))flags.add('LOW_OCR_CONFIDENCE');

  const ocr=used.length?Math.min(...used.map(l=>l.confidence)):0;
  const keyword=kind.kind==='UNKNOWN'?0:Math.min(1,kind.margin/Math.max(kind.score,1)+0.5);
  return {proposedKind:kind.kind,kindEvidenceLineIds:kind.evidence,confidence:Math.round(keyword*ocr*100)/100,
    fields,flags:[...flags].sort(),personalDataLineIds:[...personalIds],reviewStatus:'NEEDS_REVIEW',source:'OCR',
    officiallyVerified:false};
}
