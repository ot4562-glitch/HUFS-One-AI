import {describe,expect,it} from 'vitest';
import {projectOpportunityExplanation} from
  '../../apps/api/src/modules/opportunities/opportunity-explanation-projection.js';

const asOf='2026-11-01T00:00:00.000Z';
const binding={asOf,opportunityId:'SYN-PERMITTED',sourceRevisionId:'SYN-REV-1',
  rankConfigVersion:'SYN-RANK-1'};
const item={opportunityId:binding.opportunityId,reason:'LOW_RELEVANCE',notes:[],
  placement:'LIST',text:'SYN-PRIVATE-FREE-TEXT',
  fields:['SYN-PRIVATE-PERSONAL-SECTION'],evidenceRefs:['SYN-EV-1']};
const report={asOf,rankConfigVersion:binding.rankConfigVersion,
  provenance:'CODE_RULES',featuredIds:['SYN-OTHER-FEATURED'],items:[item,
    {opportunityId:'SYN-HIDDEN-OTHER',candidateScore:999,privateFacts:['SYN-PRIVATE-FACT']}]};

describe('#86 single permitted candidate explanation projection (no recommendation engine)',()=>{
  it('selects one code reason and discards text, personal fields, scores and other candidates',()=>{
    const result=projectOpportunityExplanation(report,binding);
    expect(result).toEqual({...binding,provenance:'CODE_RULES',state:'NOT_FEATURED',
      reason:'LOW_RELEVANCE',notes:[],evidenceRefs:['SYN-EV-1']});
    const encoded=JSON.stringify(result);
    for(const secret of ['SYN-PRIVATE','SYN-HIDDEN','SYN-OTHER','999','placement'])
      expect(encoded).not.toContain(secret);
  });
  it('projects a featured candidate without copying the report or guessing a reason',()=>{
    expect(projectOpportunityExplanation({...report,featuredIds:[binding.opportunityId],
      items:report.items.slice(1)},binding)).toEqual({...binding,state:'FEATURED',
      evidenceRefs:[],provenance:'CODE_RULES'});
    expect(projectOpportunityExplanation(report,{...binding,opportunityId:'SYN-ABSENT'})).toBeNull();
  });
  it('does not invent a result from unavailable or mismatched reports',()=>{
    for(const raw of [null,{},[],{...report,rankConfigVersion:'SYN-OLD'},
      {...report,asOf:'2026-10-31T00:00:00Z'},{...report,provenance:'MODEL'},
      {...report,items:{}},{...report,items:Array(501).fill(item)},
      {...report,featuredIds:Array(501).fill('SYN-OTHER')},
      {...report,extraReportClaim:'SYN-PRIVATE'},
    ])expect(projectOpportunityExplanation(raw,binding)).toBeNull();
    expect(projectOpportunityExplanation(report,{...binding,sourceRevisionId:'<script>'})).toBeNull();
  });
  it('fails closed for duplicated or contradictory selected-candidate decisions',()=>{
    for(const raw of [{...report,items:[item,item]},
      {...report,featuredIds:[binding.opportunityId]},
      {...report,featuredIds:[binding.opportunityId,binding.opportunityId],items:[]},
    ])expect(projectOpportunityExplanation(raw,binding)).toBeNull();
  });
  it('strictly validates the selected reason and copies only bounded safe evidence',()=>{
    for(const changed of [{...item,reason:'SECRET_REASON'},
      {...item,unknownPersonalField:'SYN-PRIVATE'},
      {...item,evidenceRefs:['SYN-EV-1','SYN-EV-1']},
      {...item,evidenceRefs:Array(31).fill('SYN-EV-1')},
      {...item,evidenceRefs:['<script>']},{...item,notes:['UNKNOWN_NOTE']},
      {...item,reason:'ELIGIBILITY_NOT_MET',notes:['ELIGIBILITY_UNKNOWN']},
    ])expect(projectOpportunityExplanation({...report,items:[changed]},binding)).toBeNull();
  });
  it.each(['HIDDEN_BY_USER','NOT_EVALUATED'])
    ('removes evaluation evidence and notes for %s',reason=>{
      expect(projectOpportunityExplanation({...report,items:[{...item,reason,
        notes:['ELIGIBILITY_UNKNOWN'],evidenceRefs:['SYN-PRIVATE-EVAL']}]},binding))
        .toEqual({...binding,state:'NOT_FEATURED',reason,notes:[],evidenceRefs:[],
          provenance:'CODE_RULES'});
    });
  it('keeps the safe NOT_EVALUATED note on an independently code-derived reason',()=>{
    expect(projectOpportunityExplanation({...report,items:[{...item,
      notes:['NOT_EVALUATED']}]},binding)).toEqual({...binding,state:'NOT_FEATURED',
      reason:'LOW_RELEVANCE',notes:['NOT_EVALUATED'],evidenceRefs:['SYN-EV-1'],
      provenance:'CODE_RULES'});
  });
  it('does not mutate the report or selected candidate when suppressing evaluation fields',()=>{
    const original={...report,items:[{...item,reason:'NOT_EVALUATED',
      notes:['ELIGIBILITY_UNKNOWN']}]};
    const before=structuredClone(original);
    projectOpportunityExplanation(original,binding);
    expect(original).toEqual(before);
  });
});
