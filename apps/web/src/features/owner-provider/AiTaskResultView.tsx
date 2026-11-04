import type {AiEvidenceText,AiTaskResult} from '@hufs-one/contracts';
import {TOPIC_TEXT} from '../demo/topicText.js';

function EvidencePhrase({value}:{value:AiEvidenceText}){
  return <span>{value.text} · 근거 {value.citationIndexes.map(index=>index+1).join(', ')}</span>;
}
const conditionText={ELIGIBILITY:'지원 자격',PRIORITY:'우선 선발',COMPLETION:'수료 조건'} as const;
const dateText={APPLICATION_DEADLINE:'신청 마감',EVENT_PERIOD:'행사 기간',
  RESULT_ANNOUNCEMENT:'결과 발표',OTHER:'기타 일정',UNKNOWN:'일정 종류 확인 필요'} as const;

/** Display only the reviewed packet's extractive candidate; no new action or numeric decision. */
export function AiTaskResultView({result}:{result:AiTaskResult}){
  return <section aria-label="작업별 검토 후보">
    {result.kind==='experience_skills'&&<>
      <h3>경험 역량·역할 후보</h3>
      <ul>{result.skills.map((item,index)=><li key={index}>
        <strong>{TOPIC_TEXT[item.topicCode]}</strong>
        <p>역량: <EvidencePhrase value={item.skill}/></p>
        <p>역할: <EvidencePhrase value={item.role}/></p>
      </li>)}</ul>
      <p>경험 태그는 본인의 확인을 거쳐야 적용됩니다.</p>
    </>}
    {result.kind==='opportunity_terms'&&<>
      <h3>공고 조건 후보</h3>
      <p>관련 분야: {result.topicCodes.map(topic=>TOPIC_TEXT[topic]).join(', ')}</p>
      <ul>{result.conditions.map((item,index)=><li key={'condition-'+index}>
        <strong>{conditionText[item.kind]}</strong>: <EvidencePhrase value={item.evidence}/>
      </li>)}
      {result.dates.map((item,index)=><li key={'date-'+index}>
        <strong>{dateText[item.kind]}</strong>: <EvidencePhrase value={item.evidence}/>
      </li>)}</ul>
      {result.roleSteps.length>0&&<ol>{result.roleSteps.map((item,index)=><li key={index}>
        <EvidencePhrase value={item.role}/> — <EvidencePhrase value={item.step}/>
      </li>)}</ol>}
      <p>지원 가능 여부와 확정 마감일은 원문과 별도 검토가 필요합니다.</p>
    </>}
    {result.kind==='personal_action_brief'&&<>
      <h3>선택된 행동 설명</h3>
      <p><EvidencePhrase value={result.headline}/></p>
      <ol>{result.actions.map(item=><li key={item.actionToken}>
        <EvidencePhrase value={item.explanation}/>
      </li>)}</ol>
    </>}
    {result.kind==='graduation_explanation'&&<>
      <h3>졸업 요건 설명 후보</h3>
      <ol>{result.requirements.map(item=><li key={item.requirementToken}>
        <EvidencePhrase value={item.explanation}/>
      </li>)}</ol>
      <p>학점과 충족 여부는 학업 계산 결과에서 확인하세요. 이 설명은 졸업 판정이 아닙니다.</p>
    </>}
  </section>;
}
