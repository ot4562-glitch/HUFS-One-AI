import {ExchangeApplicantSchema,ExchangePolicySchema,ExchangeResultSchema,
  type ExchangeApplicant,type ExchangePolicy,type ExchangeResult,type ExchangeCheck} from '@hufs-one/contracts';
type Status=ExchangeCheck['status'];
const DISCLAIMER='제시된 기준에 대한 참고 결과이며 공식 지원 자격·선발 결과가 아닙니다.' as const;
/**
 * School exchange policy dates (`YYYY-MM-DD`) are calendar days in the school's
 * administrative time zone, Asia/Seoul (UTC+09:00, no daylight saving).
 * `effectiveFrom` applies from 00:00 KST of that day; `effectiveUntil` is
 * inclusive through the end of that KST day. `asOf` may carry any offset; the
 * comparison is on the absolute instant (#365). Use this single helper for both
 * the partner list and the evaluation so they never disagree at a day boundary.
 */
export const EXCHANGE_POLICY_TIME_ZONE='Asia/Seoul' as const;
export function exchangePolicyInEffect(
  policy:{effectiveFrom:string;effectiveUntil?:string|undefined},asOf:string,
):boolean{
  const at=Date.parse(asOf);
  if(!Number.isFinite(at))throw new RangeError('Invalid asOf');
  const start=Date.parse(policy.effectiveFrom+'T00:00:00+09:00');
  const endExclusive=policy.effectiveUntil
    ?Date.parse(policy.effectiveUntil+'T00:00:00+09:00')+86400000:Infinity;
  if(!Number.isFinite(start)||Number.isNaN(endExclusive))return false;
  return start<=at&&at<endExclusive;
}
export type ExchangePolicyResolution={
  policy:ExchangePolicy|null;
  reason:'CURRENT'|'NONE_IN_EFFECT'|'REVOKED_OR_BLOCKED_IN_EFFECT'|'CONFLICTING_IN_EFFECT';
};
/**
 * The one policy row that governs `partnerId`+`track` at `asOf` (#379).
 * Rows not yet published or verified at `asOf` are ignored; among the rows in
 * effect at `asOf` (KST day rule above): any REVOKED/BLOCKED row quarantines
 * the pair (a revocation never falls back to an older approval), two or more
 * approved rows are a conflict, and exactly one approved row is current.
 * Old and new editions with non-overlapping windows therefore no longer hide
 * each other. The partner list and the evaluation must both use this.
 */
export function resolveExchangePolicy(
  rules:readonly ExchangePolicy[],partnerId:string,track:ExchangePolicy['track'],asOf:string,
):ExchangePolicyResolution{
  const at=Date.parse(asOf);
  if(!Number.isFinite(at))throw new RangeError('Invalid asOf');
  const inEffect=rules.filter(r=>r.partnerId===partnerId&&r.track===track
    &&Date.parse(r.publishedAt)<=at&&Date.parse(r.verifiedAt)<=at&&exchangePolicyInEffect(r,asOf));
  if(!inEffect.length)return {policy:null,reason:'NONE_IN_EFFECT'};
  if(inEffect.some(r=>r.rights!=='APPROVED'))return {policy:null,reason:'REVOKED_OR_BLOCKED_IN_EFFECT'};
  if(inEffect.length>1)return {policy:null,reason:'CONFLICTING_IN_EFFECT'};
  return {policy:inEffect[0]!,reason:'CURRENT'};
}
export function evaluateExchange(rawApplicant:ExchangeApplicant,rawPolicy:ExchangePolicy|null,asOf:string):ExchangeResult{
  const applicant=ExchangeApplicantSchema.parse(rawApplicant);
  const clock=Date.parse(asOf);
  if(!Number.isFinite(clock))throw new RangeError('Invalid asOf');
  const policy=rawPolicy?ExchangePolicySchema.parse(rawPolicy):null;
  const valid=!!policy&&policy.rights==='APPROVED'&&Date.parse(policy.publishedAt)<=clock
    &&Date.parse(policy.verifiedAt)<=clock&&exchangePolicyInEffect(policy,asOf);
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
  const term=applicant.duration===1?policy.termRules?.one:policy.termRules?.two;
  const sem=applicant.completedSemesters;
  const interval=applicant.status==='ENROLLED'?term?.ENROLLED:applicant.status==='LEAVE'?term?.LEAVE:undefined;
  add('SEMESTERS',sem===undefined||!interval?'UNKNOWN'
    :sem>=interval.min&&sem<=interval.max?'PASS':'FAIL',
    interval?'규정 판본의 수료 학기 허용 구간 '+interval.min+'~'+interval.max+'와 대조했습니다.'
      :'학적별 파견 가능 수료 학기 구간의 최신 공식 근거가 누락되어 보류합니다.');
  let transfer:Status='NOT_APPLICABLE';
  if(applicant.duration===2)transfer=policy.twoSemesterTransfersAllowed===undefined
    ||applicant.transfer===undefined?'UNKNOWN'
    :applicant.transfer&&!policy.twoSemesterTransfersAllowed?'FAIL':'PASS';
  add('TRANSFER',transfer,policy.twoSemesterTransfersAllowed===undefined
    ?'2학기 프로그램의 편입생 제한 규정 출처가 미확인입니다.'
    :'2학기 프로그램의 확인된 편입생 제한과 대조했습니다.');
  const prior=policy.priorCancellationAllowed;
  add('CANCELLATION',prior===undefined||applicant.previousCancellation==='UNKNOWN'?'UNKNOWN'
    :applicant.previousCancellation==='CANCELLED'&&!prior?'FAIL':'PASS',
    prior===undefined?'이전 선발 취소 이력에 대한 현행 규정 확인이 필요합니다.'
      :'규정 판본의 과거 취소 이력 제한을 대조했습니다.');
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
