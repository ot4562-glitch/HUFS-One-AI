import {describe,it,expect} from 'vitest';
import {ExperiencePortfolioSchema,SelfProfileSchema} from '@hufs-one/contracts';
import {buildCareerRoadmap,buildCareerTimeline} from './roadmap.js';

const asOf='2026-11-07T09:00:00.000Z';
const profile=SelfProfileSchema.parse({
  version:1,updatedAt:asOf,value:{
    displayName:'가상 소유자',interestTopics:['DATA_ANALYTICS','AI_ML'],desiredJobTopics:['AI_ML'],
    headline:'데이터 실험',visibility:'PRIVATE',
  },
});
const experience={
  itemId:'exp-one',version:2,updatedAt:asOf,
  value:{kind:'EXPERIENCE',dataMode:'OWNER_CONSENTED',state:'SELF_REPORTED',
    title:'가상 데이터 분석 프로젝트',summary:'허가된 자기보고',category:'PROJECT',role:'분석',startedOn:'2026-07-01'},
} as const;
const approval={
  state:'ACTIVE',version:1,contentVersion:2,consentVersion:1,topics:['DATA_ANALYTICS'],
  approvedAt:'2026-11-07T08:00:00.000Z',provenance:'LOCAL_USER_SELECTION',
} as const;
const portfolio=ExperiencePortfolioSchema.parse({
  items:[experience],nextCursor:null,
  portfolio:{asOf,consentVersion:1,coverage:'PAGE',complete:true,
    evidence:[{experienceId:'exp-one',contentVersion:2,approval}],
    topics:[{topicCode:'DATA_ANALYTICS',experienceIds:['exp-one']}]},
});

describe('#317 owner-only roadmap and portfolio',()=>{
  it('uses only currently approved own experience, never predicted credentials',()=>{
    const roadmap=buildCareerRoadmap({profile,portfolio});
    expect(roadmap.strengthTopics).toEqual([{topicCode:'DATA_ANALYTICS',experienceIds:['exp-one']}]);
    expect(roadmap.explorationTopics).toEqual(['AI_ML']);
    expect(roadmap.disclaimer).toContain('취업 적격');
    const [entry]=buildCareerTimeline(portfolio);
    expect(entry).toMatchObject({itemId:'exp-one',category:'PROJECT',role:'분석',
      certification:'NOT_INSTITUTION_VERIFIED',
      evidence:{state:'OWNER_APPROVED_TOPIC',topicCodes:['DATA_ANALYTICS']}});
  });

  it('does not treat a synthetic experience as owner-approved skills even if approval is ACTIVE',()=>{
    const synthetic=ExperiencePortfolioSchema.parse({
      items:[{...experience,value:{...experience.value,dataMode:'SYNTHETIC'}}],
      nextCursor:null,
      portfolio:{...portfolio.portfolio,evidence:[{experienceId:'exp-one',contentVersion:2,approval}],topics:[]},
    });
    expect(buildCareerRoadmap({profile,portfolio:synthetic}).strengthTopics).toEqual([]);
    expect(buildCareerTimeline(synthetic)).toEqual([]);
  });

  it('never invents a complete full-account assessment from a single cursor page',()=>{
    const partial=ExperiencePortfolioSchema.parse({
      ...portfolio,nextCursor:'exp-two',
      portfolio:{...portfolio.portfolio,complete:false},
    });
    const roadmap=buildCareerRoadmap({profile,portfolio:partial});
    expect(roadmap.coverage).toBe('PAGE');
    expect(roadmap.complete).toBe(false);
  });

  it('rejects mismatched versioned evidence rather than showing stale skills',()=>{
    expect(()=>buildCareerTimeline({
      ...portfolio,
      portfolio:{...portfolio.portfolio,evidence:[{experienceId:'exp-one',contentVersion:1,approval}]},
    })).toThrow();
  });
});
