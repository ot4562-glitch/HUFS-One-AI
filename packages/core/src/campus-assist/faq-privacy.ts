/** Personal identifiers a student may paste into an FAQ question. None of them helps answer a
 * public FAQ, so they are replaced before the question leaves the server for a model (#341 D).
 * A bare "저는 …입니다" is not masked: by rule it is too often a status ("휴학생"), so the screen
 * must still tell students not to type personal data. */
export type FaqRedaction='RRN'|'PHONE'|'EMAIL'|'STUDENT_ID'|'NAME'|'LONG_NUMBER';
const RULES:readonly [FaqRedaction,RegExp,string][]=[
  ['RRN',/\d{6}\s*-\s*[1-4]\d{6}/g,'[주민번호]'],
  ['PHONE',/(?:\+\s?82[-\s.]?0?1[016789]|01[016789])[-\s.]?\d{3,4}[-\s.]?\d{4}/g,'[전화번호]'],
  ['EMAIL',/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,'[이메일]'],
  // A labelled student number in any shape ("학번은 2020-12345", "학번: 2020 12345").
  ['STUDENT_ID',/(학번\s*(?:은|는|이|:)?\s*)\d[\d\s-]{3,}\d/g,'$1[학번]'],
  ['NAME',/(이름\s*(?:은|는|이|:)\s*)[가-힣]{2,4}/g,'$1[이름]'],
  // Student numbers and other IDs, also split by hyphens; FAQ facts (years, credits, scores)
  // are shorter, and ISO dates ("2026-03-02") stay.
  ['LONG_NUMBER',/\d{7,}|\d{2,}(?:-\d{2,})+/g,'[번호]'],
];
function keepNumber(m:string):boolean{
  return /^\d{4}-\d{1,2}-\d{1,2}$/.test(m)||m.replace(/-/g,'').length<7;
}
export function maskFaqQuestion(question:string):{text:string;redactions:FaqRedaction[]}{
  let text=question;
  const redactions:FaqRedaction[]=[];
  for(const [kind,pattern,label] of RULES){
    const next=kind==='LONG_NUMBER'?text.replace(pattern,m=>keepNumber(m)?m:label):text.replace(pattern,label);
    if(next!==text){redactions.push(kind);text=next;}
  }
  return {text,redactions};
}
