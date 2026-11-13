import {describe,expect,it,vi} from 'vitest';
import type {OwnerWorkspaceValue,WorkspaceKind} from '@hufs-one/contracts';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {DEMO_OPPORTUNITIES} from '../../packages/core/src/opportunities/demo-corpus.js';

const at='2026-11-20T00:00:00.000Z',csrfToken='C'.repeat(32);
const profile={version:1,value:{displayName:'Synthetic owner',interestTopics:['AI_ML'],desiredJobTopics:[]},updatedAt:at};
const choices={personalStorage:true,teamReview:false,externalAi:false,ncpStorage:false,presentation:false};
const json=(data:unknown)=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
type CrudKind=Exclude<WorkspaceKind,'GUIDE_CHECKLIST'|'RECOGNITION_PROOF'>;
const value=(kind:CrudKind):OwnerWorkspaceValue=>{
  switch(kind){
    case 'EXPERIENCE':return {kind,dataMode:'SYNTHETIC',state:'DRAFT',title:'Synthetic practice',summary:''};
    case 'STUDY_PLAN':return {kind,dataMode:'SYNTHETIC',state:'DRAFT',courseId:'SYN-COURSE',targetTerm:'2027-1',planned:true};
    case 'BOOKMARK':return {kind,dataMode:'SYNTHETIC',state:'SAVED',opportunityId:'SYN-OPP'};
    case 'ACTION_PLAN':return {kind,dataMode:'SYNTHETIC',state:'DRAFT',opportunityId:'SYN-OPP',task:'Read requirements',done:false};
  }
};
const record=(kind:CrudKind,itemId='SYN-I1',version=1)=>({itemId,version,value:value(kind),updatedAt:at});
const endpoints={EXPERIENCE:'/api/experience/cards',STUDY_PLAN:'/api/study-plans',
  BOOKMARK:'/api/saved-items',ACTION_PLAN:'/api/action-plans'} as const;
function harness(response:unknown){
  const calls:Array<{url:string;init:RequestInit}>=[];
  const client=new HufsApiClient(async(url,init)=>{
    calls.push({url,init});return json(url==='/api/auth/csrf'?{csrfToken}:response);
  });
  return {owner:client.owner,calls};
}
const source={sourceId:'SYN-SOURCE',revisionId:'SYN-REV',permissionRef:'SYN-RIGHT',status:'SYNTHETIC' as const};
const course={courseId:'SYN-C1',courseCode:'SYN1',title:'Synthetic course',campus:'DEMO',creditUnits:6,source};

describe('owner API client: typed private account and workspace, never demo identity',()=>{
  it('reads absent profile and consent explicitly without inventing a grant',async()=>{
    const a=harness({profile:null});expect(await a.owner.getProfile()).toEqual({profile:null});
    expect(a.calls[0]!.url).toBe('/api/profile');
    const b=harness({consents:null});expect(await b.owner.getConsents()).toEqual({consents:null});
  });
  it('PATCHes profile with a strict next-version receipt and fresh CSRF',async()=>{
    const {owner,calls}=harness({profile});
    const input={expectedVersion:0,value:{displayName:'Synthetic owner',interestTopics:['AI_ML' as const],desiredJobTopics:[]}};
    expect(await owner.updateProfile(input)).toEqual({profile});
    expect(calls.map(x=>x.url)).toEqual(['/api/auth/csrf','/api/profile']);
    expect(calls[1]!.init).toMatchObject({method:'PATCH',body:JSON.stringify(input),
      headers:{'x-csrf-token':csrfToken},cache:'no-store',credentials:'same-origin'});
    const wrong=harness({profile:{...profile,version:2}});
    await expect(wrong.owner.updateProfile(input)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  });
  it('PUTs individual purpose choices and verifies exactly what was acknowledged',async()=>{
    const response={consents:{version:2,choices,updatedAt:at}},h=harness(response);
    expect(await h.owner.updateConsents({expectedVersion:1,choices})).toEqual(response);
    expect(h.calls[1]!.init.method).toBe('PUT');
    const wrong=harness({consents:{version:2,choices:{...choices,externalAi:true},updatedAt:at}});
    await expect(wrong.owner.updateConsents({expectedVersion:1,choices})).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  });
  it.each(Object.keys(endpoints) as CrudKind[])('creates and lists only %s at its declared route',async kind=>{
    const item=record(kind),h=harness({item});
    expect(await h.owner.createWorkspace({itemId:item.itemId,value:item.value})).toEqual({item});
    expect(h.calls[1]!.url).toBe(endpoints[kind]);
    expect(h.calls[1]!.init.method).toBe('POST');
    const page=harness({items:[item],nextCursor:null});
    const signal=new AbortController().signal;
    expect((await page.owner.listWorkspace(kind,{afterId:'SYN-I0',limit:1},signal)).items).toHaveLength(1);
    expect(page.calls[0]!.url).toBe(endpoints[kind]+'?afterId=SYN-I0&limit=1');
    expect(page.calls[0]!.init.signal).toBe(signal);
  });
  it.each(['EXPERIENCE','STUDY_PLAN','ACTION_PLAN'] as const)('updates %s using its server verb and CAS',async kind=>{
    const item=record(kind,'SYN-I1',2),h=harness({item});
    expect(await h.owner.updateWorkspace('SYN-I1',{expectedVersion:1,value:item.value})).toEqual({item});
    expect(h.calls[1]!.url).toBe(endpoints[kind]+'/SYN-I1');
    expect(h.calls[1]!.init.method).toBe(kind==='STUDY_PLAN'?'PUT':'PATCH');
  });
  it.each(['EXPERIENCE','BOOKMARK'] as const)('deletes %s only with a next-version receipt',async kind=>{
    const h=harness({version:2});expect(await h.owner.deleteWorkspace(kind,'SYN-I1',1)).toEqual({version:2});
    expect(h.calls[1]!.url).toBe(endpoints[kind]+'/SYN-I1');
    expect(h.calls[1]!.init).toMatchObject({method:'DELETE',body:'{"expectedVersion":1}'});
    await expect(harness({version:1}).owner.deleteWorkspace(kind,'SYN-I1',1))
      .rejects.toMatchObject({code:'VERSION_CONFLICT'});
  });
  it('binds item reads and mutations to both ID and workspace kind',async()=>{
    expect(await harness({item:null}).owner.getExperience('SYN-I1')).toEqual({item:null});
    for(const item of [record('EXPERIENCE','SYN-OTHER'),record('BOOKMARK'),record('EXPERIENCE','SYN-I1',2)])
      await expect(harness({item}).owner.createWorkspace({itemId:'SYN-I1',value:value('EXPERIENCE')}))
        .rejects.toMatchObject({code:'VERSION_CONFLICT'});
    await expect(harness({item:record('BOOKMARK')}).owner.getExperience('SYN-I1'))
      .rejects.toMatchObject({code:'VERSION_CONFLICT'});
  });
  it('rejects cross-kind, unordered, oversized and fabricated pagination results',async()=>{
    for(const page of [
      {items:[record('BOOKMARK')],nextCursor:null},
      {items:[record('EXPERIENCE'),record('EXPERIENCE')],nextCursor:null},
      {items:[record('EXPERIENCE')],nextCursor:'SYN-OTHER'},
      {items:[record('EXPERIENCE','SYN-I0')],nextCursor:null},
      {items:[record('EXPERIENCE'),record('EXPERIENCE','SYN-I2')],nextCursor:null},
    ])await expect(harness(page).owner.listWorkspace('EXPERIENCE',{afterId:'SYN-I0',limit:1}))
      .rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
  });
  it('creates an experience draft from an approved opportunity without browser title or source authority',async()=>{
    const item={...record('EXPERIENCE'),value:{...value('EXPERIENCE'),sourceOpportunityId:'SYN-OPP'}};
    const h=harness({item});
    expect(await h.owner.createExperienceFromOpportunity({itemId:'SYN-I1',opportunityId:'SYN-OPP'})).toEqual({item});
    expect(h.calls[1]).toMatchObject({url:'/api/experience/from-opportunity',
      init:{method:'POST',body:'{"itemId":"SYN-I1","opportunityId":"SYN-OPP"}'}});
    await expect(harness({item:{...item,value:{...item.value,sourceOpportunityId:'SYN-OTHER'}}}).owner
      .createExperienceFromOpportunity({itemId:'SYN-I1',opportunityId:'SYN-OPP'}))
      .rejects.toMatchObject({code:'VERSION_CONFLICT'});
  });
  it('rejects unsupported operations and bad inputs before network or CSRF',async()=>{
    const transport=vi.fn(async()=>json({})),owner=new HufsApiClient(transport).owner;
    await expect(owner.updateProfile({expectedVersion:0,value:{...profile.value,actorId:'spoof'}} as never))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    await expect(owner.updateConsents({expectedVersion:0,choices:{...choices,externalAi:'yes'}} as never))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    await expect(owner.updateWorkspace('SYN-I1',{expectedVersion:1,value:value('BOOKMARK')}))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    await expect(owner.deleteWorkspace('STUDY_PLAN' as never,'SYN-I1',1)).rejects.toMatchObject({code:'INVALID_INPUT'});
    await expect(owner.listWorkspace('EXPERIENCE',{limit:51})).rejects.toMatchObject({code:'INVALID_INPUT'});
    await expect(owner.getExperience(undefined as never)).rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('owner catalog browser consumer: approved facts and bounded paging',()=>{
  it('reads an approved private transcript without exposing provider scope receipts',async()=>{
    const transcript={state:'OWNER_APPROVED',sourceRevisionId:'SYN-R1',sourceRightsVersion:'SYN-P1',
      asOf:at,reviewedAt:at,courses:[]};
    const h=harness({transcript});expect(await h.owner.getTranscript()).toEqual({transcript});
    expect(h.calls[0]!.url).toBe('/api/academics/transcript');
    await expect(harness({transcript,scopeToken:'private'}).owner.getTranscript())
      .rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
  });
  it('encodes query fields once and binds course paging to requested asOf/limit/cursor',async()=>{
    const page={asOf:at,items:[course],nextCursor:'SYN-C1'},h=harness(page);
    expect(await h.owner.listCourses({q:'AI & data',afterId:'SYN-C0',limit:1,asOf:at})).toEqual(page);
    const url=new URL(h.calls[0]!.url,'https://synthetic.invalid');
    expect(url.pathname).toBe('/api/courses');expect(url.searchParams.get('q')).toBe('AI & data');
    for(const bad of [{...page,asOf:'2026-11-21T00:00:00.000Z'},
      {...page,items:[{...course,courseId:'SYN-C0'}]}, {...page,nextCursor:'SYN-C9'}])
      await expect(harness(bad).owner.listCourses({afterId:'SYN-C0',limit:1,asOf:at}))
        .rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
  });
  it('rejects another course in offering results and future verification evidence',async()=>{
    const entry={courseId:'SYN-C1',term:'2026-2',status:'UNKNOWN',source};
    const page={asOf:at,items:[entry],nextCursor:null};
    expect((await harness(page).owner.listCourseOfferings('SYN-C1',{asOf:at})).items).toHaveLength(1);
    await expect(harness(page).owner.listCourseOfferings('SYN-C2',{asOf:at}))
      .rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
    const future={asOf:at,items:[{...course,source:{...source,status:'ACTIVE',verifiedAt:'2026-11-21T00:00:00.000Z'}}],nextCursor:null};
    await expect(harness(future).owner.listCourses({asOf:at})).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
  });
  it('validates synthetic opportunity identity instead of trusting HTTP 200',async()=>{
    const opportunity=DEMO_OPPORTUNITIES[0]!;
    const detail={opportunity,source};
    expect((await harness(detail).owner.getOpportunity(opportunity.id)).opportunity.id).toBe(opportunity.id);
    await expect(harness(detail).owner.getOpportunity('SYN-OTHER')).rejects.toMatchObject({code:'VERSION_CONFLICT'});
    const page={asOf:at,items:[detail],nextCursor:null};
    expect((await harness(page).owner.listOpportunities({asOf:at})).items).toHaveLength(1);
  });
});
