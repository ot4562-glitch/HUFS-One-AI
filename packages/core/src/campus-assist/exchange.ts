import {ExchangeApplicantSchema,ExchangePolicySchema,ExchangeResultSchema,
  type ExchangeApplicant,type ExchangePolicy,type ExchangeResult,type ExchangeCheck} from '@hufs-one/contracts';
type Status=ExchangeCheck['status'];
const DISCLAIMER='제시된 기준에 대한 참고 결과이며 공식 지원 자격·선발 결과가 아닙니다.' as const;
export function evaluateExchange(rawApplicant:ExchangeApplicant,rawPolicy:ExchangePolicy|null,asOf:string):ExchangeResult{
  const applicant=ExchangeApplicantSchema.parse(rawApplicant);
  const clock=Date.parse(asOf);
  if(!Number.isFinite(clock))throw new RangeError('Invalid asOf');
  const policy=rawPolicy?ExchangePolicySchema.parse(rawPolicy):null;
  const valid=!!policy&&policy.rights==='APPROVED'&&Date.parse(policy.publishedAt)<=clock
    &&Date.parse(policy.verifiedAt)<=clock&&Date.parse(policy.effectiveFrom+'T00:00:00Z')<=clock
    &&(!policy.effectiveUntil||Date.parse(policy.effectiveUntil+'T23:59:59Z')>=clock);
  const checks:ExchangeCheck[]=[];
  const add=(code:ExchangeCheck['code'],status:Status,explanation:string)=>{
    checks.push({code,status,explanation,...(valid&&policy?{sourceRevision:policy.sourceRevision}:{})});
  };
  if(!valid||!policy){
    for(const code of ['TRACK','GPA','SEMESTERS','TRANSFER','CANCELLATION','PARTNER_GPA','LANGUAGE'] as const)
      add(code,'UNKNOWN','현재 적용되고 검증된 공식 규정 판본이 없습니다.');
    return ExchangeResultSchema.parse({asOf,checks,result:'UNKNOWN',disclaimer:DISCLAIMER});
  }
  add('TRACK',policy.track===applicant.track?'PASS':'UNKNOWN',
    policy.track===applicant.track?'선발 경로가 적용 규정과 일치합니다.':'선발 경로에 맞는 별도 규정을 확인해야 합니다.');
  const minimum=policy.minimumGpa;
  add('GPA',applicant.gpa===undefined?'UNKNOWN':applicant.gpa>=minimum?'PASS':'FAIL',
    applicant.gpa===undefined?'평점 기준 입력 필요':'일반 평점 기준 '+minimum.toFixed(1)+' 이상과 대조했습니다.');
  const max=applicant.duration===1?5:4, leave=applicant.duration===1?6:5;
  const sem=applicant.completedSemesters;
  const pass=sem!==undefined&&(applicant.status==='ENROLLED'&&sem>=2&&sem<=max
    ||applicant.status==='LEAVE'&&sem===leave);
  add('SEMESTERS',applicant.status==='UNKNOWN'||sem===undefined?'UNKNOWN':pass?'PASS':'FAIL',
    '1학기 파견은 재학 2~5/휴학 6학기, 2학기 파견은 재학 2~4/휴학 5학기 기준을 별도로 대조합니다.');
  add('TRANSFER',applicant.duration===1?'NOT_APPLICABLE':applicant.transfer===undefined?'UNKNOWN'
    :applicant.transfer?'FAIL':'PASS','2학기 프로그램의 편입생 제한은 1학기 프로그램과 구분합니다.');
  add('CANCELLATION',applicant.previousCancellation==='UNKNOWN'?'UNKNOWN'
    :applicant.previousCancellation==='CANCELLED'?'FAIL':'PASS',
    '이전 선발 프로그램 취소 이력은 현재 제도 범위의 공식 확인이 필요합니다.');
  add('PARTNER_GPA',policy.partnerMinimumGpa===undefined?'UNKNOWN':applicant.gpa===undefined?'UNKNOWN'
    :applicant.gpa>=policy.partnerMinimumGpa?'PASS':'FAIL',
    policy.partnerMinimumGpa===undefined?'파견대학별 평점 요건이 아직 검증되지 않았습니다.':'파견대학별 추가 평점 기준을 대조했습니다.');
  const lang=policy.requiredLanguage;
  let languageStatus:Status='UNKNOWN';
  if(lang&&applicant.language&&applicant.departureOn){
    const same=lang.test===applicant.language.test;
    languageStatus=!same||applicant.language.score<lang.minimumScore
      ||applicant.language.expiresOn<applicant.departureOn?'FAIL':'PASS';
  }
  add('LANGUAGE',languageStatus,lang?'파견 예정일의 시험 종류·점수·유효기간을 함께 확인합니다.':'파견대학별 공식 어학 기준 확인 필요.');
  const result=checks.some(x=>x.status==='FAIL')?'FAIL':checks.some(x=>x.status==='UNKNOWN')?'UNKNOWN':'PASS';
  return ExchangeResultSchema.parse({asOf,policyRevision:policy.sourceRevision,result,checks,disclaimer:DISCLAIMER});
}
