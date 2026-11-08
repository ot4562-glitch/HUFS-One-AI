/** Personal identifiers a student may paste into an FAQ question. None of them helps answer a
 * public FAQ, so they are replaced before the question leaves the server for a model (#341 D). */
export type FaqRedaction='RRN'|'PHONE'|'EMAIL'|'LONG_NUMBER';
const RULES:readonly [FaqRedaction,RegExp,string][]=[
  ['RRN',/\d{6}\s*-\s*[1-4]\d{6}/g,'[주민번호]'],
  ['PHONE',/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g,'[전화번호]'],
  ['EMAIL',/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,'[이메일]'],
  // Student numbers and other IDs; FAQ facts (years, credits, scores) are shorter.
  ['LONG_NUMBER',/\d{7,}/g,'[번호]'],
];
export function maskFaqQuestion(question:string):{text:string;redactions:FaqRedaction[]}{
  let text=question;
  const redactions:FaqRedaction[]=[];
  for(const [kind,pattern,label] of RULES){
    const next=text.replace(pattern,label);
    if(next!==text){redactions.push(kind);text=next;}
  }
  return {text,redactions};
}
