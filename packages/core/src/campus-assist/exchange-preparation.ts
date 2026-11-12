/** #340 NCP-free preparation checklist. This pure formatter never determines
 * official eligibility, creates an application, or invents a deadline. The
 * caller must supply independently verified, actor-authorized server results. */
import {ExchangeResultSchema,type ExchangeCheck,type ExchangePolicy,
  type ExchangeResult} from '@hufs-one/contracts';

const ACTIONS:Record<ExchangeCheck['code'],string>={
  TRACK:'해당 선발 경로의 최신 모집공고와 담당 부서를 직접 확인하세요.',
  GPA:'공식 성적증명서의 적용 학기·총평점과 모집공고의 계산 기준을 확인하세요.',
  SEMESTERS:'지원 시점 수료 학기·재학/휴학 인정 범위를 공식 공고에서 확인하세요.',
  TRANSFER:'편입생에게 적용되는 교환 기간·학점 인정 규정을 별도 확인하세요.',
  CANCELLATION:'과거 국제교류 프로그램 취소 이력과 실제 제한 범위를 확인하세요.',
  PARTNER_GPA:'파견대학의 별도 평점·전공 요건을 최신 홈페이지에서 확인하세요.',
  LANGUAGE:'파견대학의 시험종류·점수·파견 시점 유효기간을 확인하세요.',
};
const CODES=Object.keys(ACTIONS) as ExchangeCheck['code'][];
type PartnerSource=Pick<ExchangePolicy,'partnerId'|'track'|'sourceRevision'|'sourceUrl'>;
export type ExchangePreparationStep={
  code:ExchangeCheck['code'];
  state:'REVIEW_READY'|'NEEDS_EVIDENCE'|'CONDITION_BLOCKER'|'NOT_APPLICABLE';
  dataStatus:'POLICY_SCOPE'|'SELF_REPORTED'|'MISSING'|'NOT_APPLICABLE';
  action:string;sourceRevision:string;
};
export type ExchangePreparation={
  state:'READY_FOR_OFFICIAL_REVIEW'|'NEEDS_EVIDENCE'|'HAS_BLOCKERS'|'STALE_POLICY';
  partnerId:string;track:PartnerSource['track'];asOf:string;
  sourceRevision:string|null;officialSourceUrl:string|null;
  steps:readonly ExchangePreparationStep[];
  /** Application windows are not present in the approved summary contract. */
  officialDeadlineKnown:false;
  automaticApplication:false;
  officialAdmissionDecision:false;
};
export function prepareExchangeApplication(input:{
  partner:PartnerSource;result:ExchangeResult;expectedAsOf:string;
}):ExchangePreparation{
  const p=input.partner,result=ExchangeResultSchema.parse(input.result);
  const base={partnerId:p.partnerId,track:p.track,asOf:input.expectedAsOf,
    officialDeadlineKnown:false as const,automaticApplication:false as const,
    officialAdmissionDecision:false as const};
  const stale=()=>({...base,state:'STALE_POLICY' as const,
    sourceRevision:null,officialSourceUrl:null,steps:[]});
  const at=Date.parse(input.expectedAsOf);
  if(!Number.isFinite(at)||Date.parse(result.asOf)!==at
    ||!result.policyRevision||result.policyRevision!==p.sourceRevision
    ||result.checks.length!==CODES.length||new Set(result.checks.map(c=>c.code)).size!==CODES.length
    ||result.checks.some(c=>!CODES.includes(c.code)||c.sourceRevision!==p.sourceRevision))
    return stale();
  const steps:ExchangePreparationStep[]=result.checks.map(check=>({
    code:check.code,sourceRevision:p.sourceRevision,
    state:check.status==='FAIL'?'CONDITION_BLOCKER'
      :check.status==='UNKNOWN'?'NEEDS_EVIDENCE'
      :check.status==='NOT_APPLICABLE'?'NOT_APPLICABLE':'REVIEW_READY',
    // Even a PASS against an official rule only compares *self-declared*
    // applicant facts. It is not an institution-verified student record.
    dataStatus:check.status==='NOT_APPLICABLE'?'NOT_APPLICABLE'
      :check.status==='UNKNOWN'?'MISSING'
      :check.code==='TRACK'?'POLICY_SCOPE':'SELF_REPORTED',
    action:ACTIONS[check.code],
  }));
  const state=steps.some(s=>s.state==='CONDITION_BLOCKER')?'HAS_BLOCKERS'
    :steps.some(s=>s.state==='NEEDS_EVIDENCE')?'NEEDS_EVIDENCE'
    :'READY_FOR_OFFICIAL_REVIEW';
  return {...base,state,sourceRevision:p.sourceRevision,
    officialSourceUrl:p.sourceUrl,steps};
}
