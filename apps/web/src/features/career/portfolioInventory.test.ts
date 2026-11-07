import {describe,expect,it,vi} from 'vitest';
import {ExperiencePortfolioSchema,SelfConsentSchema,SelfProfileSchema,type ExperiencePortfolio}
  from '@hufs-one/contracts';
import {scanCareerInventory,type InventoryPort} from './portfolioInventory.js';

const asOf='2026-11-07T09:00:00Z';
const profile=SelfProfileSchema.parse({version:1,updatedAt:asOf,value:{
  displayName:'가상 본인',interestTopics:['DATA_ANALYTICS','AI_ML'],desiredJobTopics:['AI_ML'],
  visibility:'PRIVATE',
}});
const consent=SelfConsentSchema.parse({version:1,updatedAt:asOf,choices:{
  personalStorage:true,externalAi:false,ncpStorage:false,teamReview:false,presentation:false,
}});
const id=(n:number)=>'exp-'+String(n).padStart(3,'0');
const record=(n:number,synthetic=false)=>({
  itemId:id(n),version:1,updatedAt:asOf,
  value:{kind:'EXPERIENCE',dataMode:synthetic?'SYNTHETIC':'OWNER_CONSENTED',
    state:'SELF_REPORTED',title:'활동 '+n,summary:'허가된 자기보고',category:'PROJECT'},
});
const approval={state:'ACTIVE',version:1,contentVersion:1,consentVersion:1,
  topics:['DATA_ANALYTICS'],approvedAt:'2026-11-07T08:00:00Z',provenance:'LOCAL_USER_SELECTION'};
const inactive={state:'INACTIVE',version:0,reason:'NOT_APPROVED'};
function page(start:number,count:number,nextCursor:string|null,
  changed=false,synthetic=false):ExperiencePortfolio{
  const items=Array.from({length:count},(_,i)=>record(start+i,synthetic&&i===0));
  if(changed)items[0]!.version=2;
  const evidence=items.map(x=>({experienceId:x.itemId,contentVersion:x.version,
    approval:x.itemId===id(0)||x.itemId===id(20)&&synthetic
      ?{...approval,contentVersion:x.version}:inactive}));
  return ExperiencePortfolioSchema.parse({items,nextCursor,portfolio:{
    asOf,consentVersion:1,coverage:'PAGE',complete:nextCursor===null,
    evidence,topics:items.some(x=>x.itemId===id(0))?[{topicCode:'DATA_ANALYTICS',experienceIds:[id(0)]}]:[],
  }});
}
const first=page(0,20,id(19)),last=page(20,1,null);
function ports(pages:ExperiencePortfolio[]= [first,last]):InventoryPort & {getPortfolio:ReturnType<typeof vi.fn>}{
  const getPortfolio=vi.fn(async(q:{afterId?:string})=>q.afterId?pages[1]!:pages[0]!);
  return {getPortfolio,
    getConsents:vi.fn(async()=>({consents:consent})),
    getProfile:vi.fn(async()=>({profile})),
  };
}
describe('#317 bounded double-traversal owner career inventory',()=>{
  it('only calls bounded cursor pages twice and aggregates owner approvals',async()=>{
    const p=ports();
    const found=await scanCareerInventory(p,profile,new AbortController().signal);
    expect(p.getPortfolio).toHaveBeenCalledTimes(4);
    expect(p.getPortfolio.mock.calls.map(c=>c[0])).toEqual([
      {limit:20},{limit:20,afterId:id(19)},{limit:20},{limit:20,afterId:id(19)},
    ]);
    expect(found).toMatchObject({
      coverage:'DOUBLE_SCANNED_PAGES',pages:2,scannedRecords:21,excludedSynthetic:0,
      evidenceCount:1,strengths:[{topicCode:'DATA_ANALYTICS',experienceIds:[id(0)]}],
      explorationTopics:['AI_ML'],
    });
    expect(found.timeline).toHaveLength(21);
  });
  it('never counts a synthetic accepted-looking row as owner-approved evidence',async()=>{
    const one=page(20,1,null,false,true);
    const p=ports([first,one]);
    const result=await scanCareerInventory(p,profile,new AbortController().signal);
    expect(result.excludedSynthetic).toBe(1);
    expect(result.strengths[0]?.experienceIds).toEqual([id(0)]);
    expect(result.timeline).toHaveLength(20);
  });
  it('refuses a mutable later page even if its cursor and consent still look valid',async()=>{
    const p=ports();let call=0;
    p.getPortfolio.mockImplementation(async(q:{afterId?:string})=>{
      call++;
      return q.afterId?(call>2?page(20,1,null,true):last):first;
    });
    await expect(scanCareerInventory(p,profile,new AbortController().signal)).rejects.toThrow(/changed/);
  });
  it('fails closed when consent is withdrawn during paging',async()=>{
    const p=ports();let reads=0;
    p.getConsents=vi.fn(async()=>({consents:++reads===1?consent:
      SelfConsentSchema.parse({...consent,version:2,choices:{...consent.choices,personalStorage:false}})}));
    await expect(scanCareerInventory(p,profile,new AbortController().signal)).rejects.toThrow();
  });
  it('fails closed on profile edits during two passes',async()=>{
    const p=ports();let reads=0;
    p.getProfile=vi.fn(async()=>({profile:++reads===1?profile:
      SelfProfileSchema.parse({...profile,version:2})}));
    await expect(scanCareerInventory(p,profile,new AbortController().signal)).rejects.toThrow(/profile changed/);
  });
  it('does not claim a complete inventory after cancellation or invalid cursor',async()=>{
    const p=ports();
    const abort=new AbortController();abort.abort();
    await expect(scanCareerInventory(p,profile,abort.signal)).rejects.toThrow(/cancelled/);
    const bad=ports();
    bad.getPortfolio.mockImplementation(async(q:{afterId?:string})=>
      q.afterId?first:first);
    await expect(scanCareerInventory(bad,profile,new AbortController().signal)).rejects.toThrow();
  });
});
