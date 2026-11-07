import {describe,it,expect} from 'vitest';
import {filterClubs,NO_FILTER,type ClubCardView} from './clubView.js';

const club=(id:string,scope:ClubCardView['scope']):ClubCardView=>({
  id,name:'가상동아리 '+id,summary:'합성 모집',scope,
  scopeText:scope==='CAMPUS'?'교내 가상 동아리':scope==='INTERUNIVERSITY'?'연합 가상 동아리':'교외 가상 소모임',
  category:'LANGUAGE',categoryText:'언어',campus:'SEOUL',campusText:'서울',
  lifecycle:'OPEN',lifecycleText:'모집 중',recruitable:true,deadlineText:null,
  dday:null,eligibilityText:'확인 필요',topicTexts:[],activityTexts:[],reasons:[],
  times:[],posterSeed:'fake',recommended:false,
});

describe('#317 synthetic club scopes',()=>{
  const cards=[club('a','CAMPUS'),club('b','INTERUNIVERSITY'),club('c','EXTERNAL')];
  it('separates campus, inter-university and outside practice listings',()=>{
    expect(filterClubs(cards,{...NO_FILTER,scope:'CAMPUS'}).map(c=>c.id)).toEqual(['a']);
    expect(filterClubs(cards,{...NO_FILTER,scope:'INTERUNIVERSITY'}).map(c=>c.id)).toEqual(['b']);
    expect(filterClubs(cards,{...NO_FILTER,scope:'EXTERNAL'}).map(c=>c.id)).toEqual(['c']);
    expect(filterClubs(cards,NO_FILTER).map(c=>c.id)).toEqual(['a','b','c']);
  });
  it('does not promote a hidden post merely because a scope is selected',()=>{
    expect(filterClubs([{...cards[1]!,recruitable:false}],{...NO_FILTER,scope:'INTERUNIVERSITY'})).toEqual([]);
  });
});
