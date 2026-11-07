import {describe,it,expect} from 'vitest';
import {buildOwnerCareerSnapshot} from './owner-roadmap.js';
import type {OwnerCareerInputs} from './owner-roadmap.js';
import type {SelfConsent,SelfProfile,ExperiencePortfolio,OwnerWorkspaceRecord} from '@hufs-one/contracts';

const now='2026-11-20T00:00:00.000Z';
const profile:SelfProfile={version:1,updatedAt:now,value:{
  displayName:'가상 소유자',interestTopics:['DATA_ANALYTICS','CLOUD_INFRA'],
  desiredJobTopics:['DATA_ANALYTICS','SOFTWARE_DEV'],
}};
const consents:SelfConsent={version:3,updatedAt:now,choices:{
  personalStorage:true,teamReview:false,externalAi:false,ncpStorage:false,presentation:false,
}};
const exp=(id:string,mode:'SYNTHETIC'|'OWNER_CONSENTED',version=1):OwnerWorkspaceRecord=>({
  itemId:id,version,updatedAt:now,value:{
    kind:'EXPERIENCE',dataMode:mode,state:'SELF_REPORTED',title:'개인 활동',
    summary:'당사자 자기진술',role:'기획',startedOn:'2026-01-01',
  },
});
const approval=(topics:('DATA_ANALYTICS'|'SOFTWARE_DEV')[],version=1)=>({
  state:'ACTIVE' as const,version:1,contentVersion:version,consentVersion:3,
  topics,approvedAt:now,provenance:'LOCAL_USER_SELECTION' as const,
});
const inactive={state:'INACTIVE' as const,version:0,reason:'REVOKED' as const};
function page(items:OwnerWorkspaceRecord[],approvals:(ReturnType<typeof approval>|typeof inactive)[],
  complete=true):ExperiencePortfolio {
  return {
    items,nextCursor:complete?null:items[items.length-1]?.itemId??null,
    portfolio:{asOf:now,consentVersion:3,coverage:'PAGE',complete,
      evidence:items.map((r,i)=>({experienceId:r.itemId,contentVersion:r.version,approval:approvals[i]!})),
      topics:[]},
  };
}
function input(pages:ExperiencePortfolio[]):OwnerCareerInputs {
  return {profile,consents,pages,bookmarks:[],bookmarksComplete:true};
}
describe('FEAT-03/05/07 owner-private career projection',()=>{
  it('returns no personal fields after storage consent is revoked',()=>{
    const result=buildOwnerCareerSnapshot({...input([page([exp('x','OWNER_CONSENTED')],[approval(['DATA_ANALYTICS'])])]),
      consents:{...consents,choices:{...consents.choices,personalStorage:false}}});
    expect(result).toMatchObject({displayName:null,experiences:[],approvedEvidence:[],bookmarks:[],complete:false});
  });
  it('includes only current, owner-consented approvals; retains unapproved drafts without claiming proficiency',()=>{
    const result=buildOwnerCareerSnapshot(input([page([
      exp('a','OWNER_CONSENTED'),exp('b','SYNTHETIC'),exp('c','OWNER_CONSENTED'),
    ],[approval(['DATA_ANALYTICS']),approval(['SOFTWARE_DEV']),inactive])]));
    expect(result.approvedEvidence).toEqual([{topicCode:'DATA_ANALYTICS',experienceIds:['a']}]);
    expect(result.exploreTopics).toEqual(['SOFTWARE_DEV','CLOUD_INFRA']);
    expect(result.experiences.map(x=>x.id)).toEqual(['a','c']);
    expect(result.experiences[1]?.approvedTopics).toEqual([]);
    expect(result.complete).toBe(true);
  });
  it('rejects cross-page duplicate IDs and a changed consent revision',()=>{
    const p=page([exp('a','OWNER_CONSENTED')],[approval(['DATA_ANALYTICS'])]);
    expect(()=>buildOwnerCareerSnapshot(input([p,p]))).toThrow(/Duplicate/);
    expect(()=>buildOwnerCareerSnapshot({...input([p]),consents:{...consents,version:4}}))
      .toThrow(/consent/);
  });
  it('never represents an incomplete cursor as a complete account inventory',()=>{
    const p=page([exp('a','OWNER_CONSENTED')],[inactive],false);
    expect(buildOwnerCareerSnapshot(input([p])).complete).toBe(false);
    expect(buildOwnerCareerSnapshot({...input([page([],[])]),bookmarksComplete:false}).complete).toBe(false);
  });
  it('distinguishes owner-entered application records from submitted employer applications',()=>{
    const saved:OwnerWorkspaceRecord={itemId:'save-a',version:1,updatedAt:now,value:{
      kind:'BOOKMARK',dataMode:'OWNER_CONSENTED',opportunityId:'SYN-OPP-001',state:'SAVED',
      stage:'SUBMITTED_SELF_REPORTED',
    }};
    const result=buildOwnerCareerSnapshot({...input([page([],[])]),bookmarks:[saved]});
    expect(result.bookmarks).toEqual([{id:'save-a',opportunityId:'SYN-OPP-001',
      stage:'SUBMITTED_SELF_REPORTED'}]);
  });
});
