import {FORMS_HEADERS,COURSE_CSV_HEADERS} from '@hufs-one/contracts';
import type {RestrictedIntakeInput} from
  '../../apps/api/src/modules/academics/intake-postgres.js';

const csv=(cells:readonly string[])=>cells.map(v=>'"'+v.replaceAll('"','""')+'"').join(',');
/** Fictional-only, not a copy or transformation of student files. */
export function makeSyntheticIntake():RestrictedIntakeInput{
  const subjects=['SYN-INT-A','SYN-INT-B','SYN-INT-C','SYN-INT-D'];
  const names=['가상작성자A','가상작성자B','가상작성자C','가상작성자D'];
  const forms=[csv(FORMS_HEADERS)];
  for(const [index,name] of names.entries()){
    const fields=Array.from({length:26},()=>'');
    fields[0]='2026-10-20 09:00:00';
    for(let i=1;i<=5;i++)fields[i]='예';
    fields[6]=name;fields[7]='가상캠퍼스';fields[8]='2024';
    fields[18]=String((index%2)+2);fields[19]='0';
    forms.push(csv(fields));
  }
  const courseFiles=names.map((name,i)=>({
    filename:'이수과목_'+name+'.csv',
    content:[csv(COURSE_CSV_HEADERS),
      csv(['2026-1','SYN'+i,'가상 기초과목',String((i%2)+2),'가상전공','이수완료'])].join('\n'),
  }));
  return {
    actorRef:'SYN-APPROVED-OPERATOR',
    formsCsv:forms.join('\n'),
    courseFiles,
    formsOptions:{
      subjectByDisplayName:Object.fromEntries(names.map((n,i)=>[n,subjects[i]!])),
      expectedSubjectKeys:subjects,
    },
    approvedFileBindings:courseFiles.map((f,i)=>({
      filename:f.filename,subjectKey:subjects[i]!,
      verificationSource:'SUBJECT_CONFIRMATION' as const,
    })),
  };
}
