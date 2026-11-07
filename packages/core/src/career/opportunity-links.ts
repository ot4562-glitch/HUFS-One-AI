import {OwnerFeedResponseSchema,type OwnerFeedResponse,type TopicCode} from '@hufs-one/contracts';

export interface CareerOpportunityLink {
  readonly id:string;
  readonly title:string;
  readonly matchedTopics:readonly TopicCode[];
  readonly eligibility:'ELIGIBLE'|'UNKNOWN';
  readonly evidenceRefs:readonly string[];
}
/** Current authorized *visible page* only; never infer hidden results, admission or hiring odds. */
export function careerOpportunityLinks(raw:unknown,topics:readonly TopicCode[],max=6):CareerOpportunityLink[]{
  const response:OwnerFeedResponse=OwnerFeedResponseSchema.parse(raw);
  if(!Number.isInteger(max)||max<1||max>9)throw new RangeError('Invalid bounded career suggestions');
  const selected=new Set(topics),seen=new Set<string>(),result:CareerOpportunityLink[]=[];
  for(const item of [...response.feed.featured,...response.feed.compact]){
    if(item.dataMode!=='REAL'||item.eligibility==='INELIGIBLE'||seen.has(item.opportunityId))continue;
    const matched=item.topics.filter(code=>selected.has(code));
    if(!matched.length)continue;
    seen.add(item.opportunityId);
    result.push({id:item.opportunityId,title:item.title,matchedTopics:matched,
      eligibility:item.eligibility==='ELIGIBLE'?'ELIGIBLE':'UNKNOWN',
      evidenceRefs:item.evidenceRefs.slice(0,5)});
    if(result.length>=max)break;
  }
  return result;
}
