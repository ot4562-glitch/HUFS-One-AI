import {
  DemoPlanSimulationResponseSchema,DemoOutlookScenarioResponseSchema,
  type DemoPlanSimulationRequest,type DemoOutlookScenarioRequest,
  type DemoSnapshot,
} from '@hufs-one/contracts';

/** Safe simulation over an already-authorized, current, redacted context snapshot.
 * No transcript access, RulePack activation, school credit recognition or writes. */
export function simulateDemoPlan(snapshot:DemoSnapshot,input:DemoPlanSimulationRequest){
  const base={contextId:snapshot.contextId,asOf:snapshot.asOf};
  const academic=snapshot.academics;
  if(!('earnedCreditUnits' in academic))return DemoPlanSimulationResponseSchema.parse({
    ...base,state:'PENDING',
    caveats:['현재 공유된 학업 요약이 없어 계획을 계산하지 않습니다.'],
  });
  const added=input.plannedCourses.reduce((sum,course)=>sum+course.creditUnits,0);
  return DemoPlanSimulationResponseSchema.parse({
    ...base,state:'HYPOTHETICAL_ONLY',rulePackVersion:academic.rulePackVersion,
    current:{earnedCreditUnits:academic.earnedCreditUnits,
      inProgressCreditUnits:academic.inProgressCreditUnits,
      plannedCreditUnits:academic.plannedCreditUnits},
    hypothetical:{additionalPlannedCreditUnits:added,
      resultingPlannedCreditUnits:academic.plannedCreditUnits+added},
    caveats:['제안 과목은 기존 계획에 더한 가정이며 실제 수강신청·학점인정이 아닙니다.',
      '선수과목·중복/재수강·학점 상한·졸업 요건에 대한 공식 검증이 필요합니다.'],
  });
}

/** A changed personnel/curriculum assumption is NEVER interpreted as proof
 * of cancellation, offering probability or a new official academic notice. */
export function simulateDemoOutlook(snapshot:DemoSnapshot,input:DemoOutlookScenarioRequest){
  const forecast=snapshot.forecast;
  if(!('items' in forecast))return DemoOutlookScenarioResponseSchema.parse({
    state:'PENDING',contextId:snapshot.contextId,asOf:snapshot.asOf,
    targetTerm:input.targetTerm,assumption:input.assumption,items:[],
    caveats:['현재 공유된 개설 전망이 없어 가정 결과를 계산하지 않습니다.'],
  });
  return DemoOutlookScenarioResponseSchema.parse({
    state:'HYPOTHETICAL_ONLY',contextId:snapshot.contextId,asOf:snapshot.asOf,
    targetTerm:input.targetTerm,assumption:input.assumption,
    items:input.courseIds.map(courseId=>{
      const prior=forecast.items.find(item=>item.courseId===courseId&&item.targetTerm===input.targetTerm);
      return {courseId,baselineSignal:prior?.signal??'UNKNOWN',
        hypotheticalSignal:'NEEDS_REVIEW',
        evidenceRefs:prior?.evidenceRefs??[],
        caveat:prior
          ?'기준 전망은 근거가 있는 기존 관찰입니다. 가정만으로 향후 개설을 확정하지 않습니다.'
          :'해당 과목·학기 전망의 검증된 근거가 없어 예측하지 않습니다.'};
    }),
    caveats:['가정 변경은 공식 개설·폐강·담당 교원 공지가 아닙니다.',
      '과거 개설 횟수는 개설 확률이나 개설 보장이 아닙니다.'],
  });
}
