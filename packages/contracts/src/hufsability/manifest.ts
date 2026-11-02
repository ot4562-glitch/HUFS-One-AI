import {z} from 'zod';

/** #124 Public HUFSAbility student navigation baseline, not a cloned school portal.
 * None of the original campus systems is implemented or independently licensed
 * by this repository. Only an explicitly verified internal route can be enabled.
 */
export const HufsAbilityCapabilityStateSchema=z.enum([
  'DEMO_AVAILABLE','OFFICIAL_LINK_ONLY','NOT_IMPLEMENTED','UNVERIFIED',
]);
export const HufsAbilityMenuItemSchema=z.strictObject({
  id:z.string().regex(/^[a-z][a-z0-9-]{2,65}$/),
  label:z.string().min(1).max(70),
  state:HufsAbilityCapabilityStateSchema,
  dataMode:z.enum(['NONE','SYNTHETIC','REAL']),
  internalRoute:z.string().regex(/^\/[^?#\s]{1,120}$/).nullable(),
  officialUrl:z.url().nullable(),
  disabledText:z.enum(['🚫 미지원','🚫 검증 전','🚫 시연 불가']).nullable(),
}).superRefine((v,ctx)=>{
  const bad=(field:string)=>ctx.addIssue({code:'custom',path:[field],
    message:'A capability cannot be advertised without its verified route'});
  if(v.state==='DEMO_AVAILABLE'){
    if(v.internalRoute===null||v.dataMode==='NONE')bad('internalRoute');
    if(v.disabledText!==null||v.officialUrl!==null)bad('disabledText');
  }else{
    if(v.internalRoute!==null||v.dataMode!=='NONE')bad('internalRoute');
    if(v.disabledText===null)bad('disabledText');
    if(v.state==='OFFICIAL_LINK_ONLY'){
      if(v.officialUrl===null||new URL(v.officialUrl).origin!=='https://hufsability.hufs.ac.kr')
        bad('officialUrl');
    }else if(v.officialUrl!==null)bad('officialUrl');
  }
});
export const HufsAbilityMenuManifestSchema=z.strictObject({
  version:z.literal('hufsability-public-2026-10-29-v1'),
  source:z.strictObject({
    description:z.literal('HUFSAbility public student menu introduction; authenticated menus unverified'),
    url:z.literal('https://dep.hufs.ac.kr/iei/13534/subview.do'),
    observedOn:z.literal('2026-10-29'),
  }),
  officialHomepage:z.literal('https://hufsability.hufs.ac.kr/'),
  schoolAffiliation:z.literal('INDEPENDENT_DEMO_NOT_OFFICIAL'),
  categories:z.array(z.strictObject({
    id:z.string().regex(/^[a-z-]+$/),
    label:z.string().min(1).max(70),
    items:z.array(HufsAbilityMenuItemSchema).min(1).max(12),
  })).length(5),
  publicEntries:z.array(HufsAbilityMenuItemSchema).length(4),
}).superRefine((v,ctx)=>{
  const total=v.categories.reduce((n,x)=>n+x.items.length,0);
  if(total!==24)ctx.addIssue({code:'custom',path:['categories'],message:'All 24 official headings required'});
  const ids=[...v.categories.map(x=>x.id),...v.categories.flatMap(x=>x.items.map(y=>y.id)),
    ...v.publicEntries.map(x=>x.id)];
  if(new Set(ids).size!==ids.length)
    ctx.addIssue({code:'custom',path:['categories'],message:'Duplicate menu ID'});
});
export type HufsAbilityMenuManifest=z.infer<typeof HufsAbilityMenuManifestSchema>;

const specs=[
  {id:'competency',label:'역량관리',entries:[
    ['core-capability-intro','핵심역량 소개'],['hufsability-capability-score','HUFSAbility 역량 점수'],
    ['core-capability-diagnostic','핵심역량 진단검사'],['university-adaptation-test','대학생활적응검사'],
  ]},
  {id:'curricular-noncurricular',label:'교과/비교과',entries:[
    ['curricular-history-grades','교과(이수과목/성적)'],['noncurricular-program','비교과 프로그램'],
    ['external-noncurricular','외부비교과 활동'],['study-community','학습공동체'],['scholarship-application','장학 신청'],
  ]},
  {id:'recruitment',label:'채용',entries:[
    ['campus-jobs','채용정보(교내)'],['worknet-jobs','채용정보(워크넷)'],
    ['career-mentoring','취업멘토링'],['job-exploration','직업탐색'],
    ['youth-internship','청년인턴/강소기업'],['huffi-partners','외대친화기업(HUFFi)'],
  ]},
  {id:'career-development',label:'경력개발',entries:[
    ['career-goals','진로목표'],['career-roadmap','진로 로드맵'],
    ['portfolio','포트폴리오'],['career-books','진로취업도서관리'],
  ]},
  {id:'counseling',label:'통합상담',entries:[
    ['faculty-advising','교수(지도)상담'],['career-counseling','진로취업상담'],
    ['psychological-counseling','심리상담'],['international-student-counseling','외국인 유학생 상담'],
    ['learning-counseling','학습상담'],
  ]},
] as const;
function unavailable(id:string,label:string){
  return {id,label,state:'NOT_IMPLEMENTED' as const,dataMode:'NONE' as const,
    internalRoute:null,officialUrl:null,disabledText:'🚫 미지원' as const};
}
const baseline={
  version:'hufsability-public-2026-10-29-v1',
  source:{description:'HUFSAbility public student menu introduction; authenticated menus unverified',
    url:'https://dep.hufs.ac.kr/iei/13534/subview.do',observedOn:'2026-10-29'},
  officialHomepage:'https://hufsability.hufs.ac.kr/',
  schoolAffiliation:'INDEPENDENT_DEMO_NOT_OFFICIAL',
  categories:specs.map(s=>({id:s.id,label:s.label,
    items:s.entries.map(([id,label])=>unavailable(id,label))})),
  publicEntries:[
    ['public-noncurricular','교내비교과'],['public-scholarships','장학공지'],
    ['public-notices','공지사항'],['public-jobs','채용정보'],
  ].map(([id,label])=>({
    id:id!,label:label!,state:'OFFICIAL_LINK_ONLY' as const,dataMode:'NONE' as const,
    internalRoute:null,officialUrl:'https://hufsability.hufs.ac.kr/',
    disabledText:'🚫 시연 불가' as const,
  })),
};
/** Return an independently parsed snapshot, not a shared mutable authority. */
export function getHufsAbilityManifest():HufsAbilityMenuManifest{
  return HufsAbilityMenuManifestSchema.parse(baseline);
}
