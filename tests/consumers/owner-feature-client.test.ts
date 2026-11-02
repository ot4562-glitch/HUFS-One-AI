import {describe,expect,it,vi} from 'vitest';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {OwnerSessionController} from '../../apps/web/src/app/owner-session-controller.js';
import type {HufsOwnerApiClient} from '../../apps/web/src/integrations/owner-api-client.js';
const at='2026-11-01T00:00:00.000Z',csrfToken='C'.repeat(32);
const session={actorId:'SYN-OWNER',role:'BETA',schoolMailProofValid:true,betaAllowed:true};
const json=(data:unknown)=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
const review={state:'NEEDS_REVIEW',asOf:at,term:'2026-2',versions:{plan:'SYN-PLAN'},
  termLoadCreditUnits:0,planIssues:[],unchecked:[],evidenceLinks:[],
  caveats:['NOT_OFFICIAL_REGISTRATION','NOT_GRADUATION_DECISION','RULEPACK_UNVERIFIED'],
  disclosure:{mode:'REDACTED',visibleCourseRefs:[]}};
const scenario={action:'ADD_MINOR' as const,targetMajorId:'SYN-MAJOR'};
const blocked={state:'BLOCKED_DEPENDENCY',asOf:at,scenario,
  blockers:['CALCULATION_CORE_UNAVAILABLE'],caveat:'HYPOTHETICAL_NOT_OFFICIAL'};
const explanationInput={asOf:at,sourceRevisionId:'SYN-REV',rankConfigVersion:'rank-v1.0'};
const explanation={...explanationInput,opportunityId:'SYN-OPP',state:'NOT_FEATURED',reason:'NOT_EVALUATED',
  notes:[],evidenceRefs:[],provenance:'CODE_RULES'};
const comparisonInput={asOf:at,beforeRevisionId:'SYN-BEFORE',afterRevisionId:'SYN-AFTER'};
const comparison={...comparisonInput,opportunityId:'SYN-OPP',state:'NEEDS_REVIEW',reason:'REVISION_NOT_REVIEWED'};
const operations:Array<{name:string;response:unknown;run:(owner:HufsOwnerApiClient,signal?:AbortSignal)=>Promise<unknown>}>=
  [
    {name:'study-plan',response:review,run:(owner,signal)=>owner.checkStudyPlan({term:'2026-2'},signal)},
    {name:'what-if',response:blocked,run:(owner,signal)=>owner.checkMajorWhatIf({scenario},signal)},
    {name:'explanation',response:explanation,run:(owner,signal)=>owner.explainOpportunity('SYN-OPP',explanationInput,signal)},
    {name:'comparison',response:comparison,run:(owner,signal)=>owner.compareOpportunityRevisions('SYN-OPP',comparisonInput,signal)},
  ];
function harness(response:unknown){
  const calls:Array<{url:string;init:RequestInit}>=[];
  const client=new HufsApiClient(async(url,init)=>{
    calls.push({url,init});return json(url==='/api/auth/csrf'?{csrfToken}:response);
  });return {owner:client.owner,calls};
}
describe('remaining owner API consumers',()=>{
  it('checks study plans without transmitting private ledgers or authority',async()=>{
    const {owner,calls}=harness(review),signal=new AbortController().signal;
    expect(await owner.checkStudyPlan({term:'2026-2',expectedPlanVersion:'SYN-PLAN'},signal)).toEqual(review);
    expect(calls.map(c=>c.url)).toEqual(['/api/auth/csrf','/api/study-plans/check']);
    expect(calls[1]!.init).toMatchObject({method:'POST',signal,credentials:'same-origin',cache:'no-store',
      headers:{'x-csrf-token':csrfToken},body:'{"term":"2026-2","expectedPlanVersion":"SYN-PLAN"}'});
  });
  it('binds study-plan term and version, and What-if scenario to the request',async()=>{
    for(const value of [{...review,term:'2027-1'},{...review,versions:{plan:'SYN-OTHER'}}])
      await expect(harness(value).owner.checkStudyPlan({term:'2026-2',expectedPlanVersion:'SYN-PLAN'}))
        .rejects.toMatchObject({code:'VERSION_CONFLICT'});
    expect(await harness(blocked).owner.checkMajorWhatIf({scenario})).toEqual(blocked);
    await expect(harness({...blocked,scenario:{action:'REMOVE_MINOR'}}).owner.checkMajorWhatIf({scenario}))
      .rejects.toMatchObject({code:'VERSION_CONFLICT'});
  });
  it('reads only the selected opportunity explanation at the exact requested dependencies',async()=>{
    const h=harness(explanation);
    expect(await h.owner.explainOpportunity('SYN-OPP',explanationInput)).toEqual(explanation);
    expect(h.calls[1]!.url).toBe('/api/opportunities/SYN-OPP/explanation');
    for(const key of ['opportunityId','sourceRevisionId','rankConfigVersion'] as const)
      await expect(harness({...explanation,[key]:'SYN-OTHER'}).owner.explainOpportunity('SYN-OPP',explanationInput))
        .rejects.toMatchObject({code:'VERSION_CONFLICT'});
    await expect(harness({...explanation,asOf:'2026-10-01T00:00:00Z'}).owner.explainOpportunity('SYN-OPP',explanationInput))
      .rejects.toMatchObject({code:'VERSION_CONFLICT'});
  });
  it('rejects private or malformed input before any network request',async()=>{
    const fetch=vi.fn(async()=>json({})),owner=new HufsApiClient(fetch).owner;
    await expect(owner.checkStudyPlan({term:'2026-2',transcript:[]} as never)).rejects.toMatchObject({code:'INVALID_INPUT'});
    await expect(owner.checkMajorWhatIf({scenario,actorId:'SYN-SPOOF'} as never)).rejects.toMatchObject({code:'INVALID_INPUT'});
    await expect(owner.explainOpportunity('../hidden',explanationInput)).rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(fetch).not.toHaveBeenCalled();
  });
  it('binds revision comparison to the same visible opportunity, both revisions and replay time',async()=>{
    const h=harness(comparison);
    expect(await h.owner.compareOpportunityRevisions('SYN-OPP',comparisonInput)).toEqual(comparison);
    expect(h.calls[1]!.url).toBe('/api/opportunities/SYN-OPP/revisions/compare');
    for(const key of ['opportunityId','beforeRevisionId','afterRevisionId','asOf'] as const)
      await expect(harness({...comparison,[key]:key==='asOf'?'2026-10-01T00:00:00Z':'SYN-OTHER'})
        .owner.compareOpportunityRevisions('SYN-OPP',comparisonInput)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
    await expect(h.owner.compareOpportunityRevisions('SYN-OPP',{...comparisonInput,beforeRevisionId:'SYN-AFTER'}))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
  });
  it.each(operations)('drops a valid late $name result after owner logout',async operation=>{
    let finish!:(value:Response)=>void;
    const client=new HufsApiClient(async url=>url==='/api/auth/csrf'?json({csrfToken}):new Promise(r=>{finish=r;}));
    const guard=new OwnerSessionController({getSession:async()=>session});await guard.initialize();
    const pending=guard.runLatest(operation.name,signal=>operation.run(client.owner,signal));
    await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
    guard.invalidateLocalSession();finish(json(operation.response));expect(await pending).toBeNull();
    expect(guard.getState().status).toBe('SIGNED_OUT');guard.dispose();
  });
  it.each(operations)('propagates 401/403/409 for $name without converting errors into data',async operation=>{
    for(const [status,code] of [[401,'UNAUTHENTICATED'],[403,'FORBIDDEN'],[409,'VERSION_CONFLICT']] as const){
      const client=new HufsApiClient(async url=>url==='/api/auth/csrf'?json({csrfToken}):
        new Response(JSON.stringify({code,message:'Request unavailable',requestId:'SYN-REQUEST',retryable:false}),
          {status,headers:{'content-type':'application/json'}}));
      await expect(operation.run(client.owner)).rejects.toMatchObject({status,code});
    }
  });
});
