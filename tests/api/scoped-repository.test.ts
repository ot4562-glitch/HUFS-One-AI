import {describe,expect,it,vi} from 'vitest';
import {DemoSnapshotSchema,SharingGrantSchema} from '@hufs-one/contracts';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {ScopedApiRepository} from '../../apps/api/src/scoped-repository.js';
import type {CalendarInputSource} from '../../apps/api/src/modules/calendar.js';
import snapshotRaw from '../../packages/fixtures/synthetic/demo-snapshot.json';

const now='2026-10-31T00:00:00.000Z';
const grant=SharingGrantSchema.parse({grantId:'SYN-G',actorId:'SYN-ACTOR',demoSubjectId:'S01',
  allowedSections:['FEED','NOTICES'],displayNameAllowed:false,recordingAllowed:false,
  version:'G1',expiresAt:'2026-11-05T00:00:00.000Z'});
const request={actorId:grant.actorId,subjectId:'S01' as const,grantVersion:grant.version,now};
function fixture(){
  const snapshot=DemoSnapshotSchema.parse(snapshotRaw);
  snapshot.feed.featured[0]!.title='UNSCOPED PRIVATE MARKER';
  const base=new MemoryApiRepository({profiles:[],grants:[grant],projections:[snapshot]});
  const read:CalendarInputSource['readAuthorizedInputs']=async input=>({
    actorId:grant.actorId,context:input.context,grant:structuredClone(grant),
    asOf:now,datasetMode:'SYNTHETIC',sourceVersion:'S1',authorizationToken:'A1',
    scopeKey:'FEED,NOTICES',provenance:{},
    profile:{interestTopics:[],desiredJobTopics:[],approvedExperienceTopics:['AI_ML'],
      approvedLanguageCodes:[],officialMajorTopics:[],facts:{}},
    noticeStudent:{openRequirementIds:['PRIVATE-REQ'],courseIds:['PRIVATE-COURSE'],interestTopics:[]},
    opportunities:[],notices:[],revisions:[],authorizedRevisionIds:[],
  });
  const source:CalendarInputSource={readAuthorizedInputs:vi.fn(read),
    revalidateAuthorization:vi.fn(async()=>true)};
  return {base,source,repository:new ScopedApiRepository(base,source,()=>now)};
}
describe('server-owned per-grant recomputation before HTTP context creation',()=>{
  it('stamps exactly the rank configuration used for recomputed feed, not old snapshot metadata',async()=>{
    const h=fixture();
    const original=(await h.base.readSnapshot('S01'))!;
    expect(original.versions.rankConfig).not.toBe('rank-v1.0');
    const result=await h.repository.readAuthorizedSnapshot(request);
    expect(result?.versions.rankConfig).toBe('rank-v1.0');
    expect((await h.base.readSnapshot('S01'))?.versions.rankConfig)
      .toBe(original.versions.rankConfig);
    const source=h.source.readAuthorizedInputs;
    h.source.readAuthorizedInputs=async req=>{
      const bundle=await source(req);
      if(!bundle)return null;
      const approved=DemoSnapshotSchema.parse({...snapshotRaw,asOf:now,
        feed:{...snapshotRaw.feed,asOf:now},
        notices:{...snapshotRaw.notices,asOf:now},
        versions:{...snapshotRaw.versions,rankConfig:'rank-v1.1'}});
      return {...bundle,approvedSnapshot:approved};
    };
    const fresh=await h.repository.readAuthorizedSnapshot(request);
    expect(fresh?.versions.rankConfig).toBe('rank-v1.0');
  });
  it('recomputes partial-scope results instead of reusing a full-share feed',async()=>{
    const h=fixture();
    expect(await h.base.readAuthorizedSnapshot(request)).toBeNull();
    const result=await h.repository.readAuthorizedSnapshot(request);
    expect(result?.feed.featured).toEqual([]);
    expect(result?.notices.items).toEqual([]);
    expect(result?.academics).toEqual({state:'NOT_SHARED'});
    expect(result?.forecast).toEqual({state:'NOT_SHARED'});
    expect(result?.asOf).toBe(now);
    expect(result?.feed.asOf).toBe(now);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(h.source.revalidateAuthorization).toHaveBeenCalledOnce();
  });
  it.each([
    {...request,actorId:'OTHER'}, {...request,grantVersion:'old'},
    {...request,requiredSections:['ACADEMICS'] as Array<'ACADEMICS'>},
  ])('rejects unauthorized actor/version/section before reading inputs: %j',async input=>{
    const h=fixture();
    expect(await h.repository.readAuthorizedSnapshot(input)).toBeNull();
    expect(h.source.readAuthorizedInputs).not.toHaveBeenCalled();
  });
  it('discards recomputation when source rights or grant changed during the operation',async()=>{
    const h=fixture();vi.mocked(h.source.revalidateAuthorization).mockResolvedValue(false);
    expect(await h.repository.readAuthorizedSnapshot(request)).toBeNull();
  });
  it('rejects mismatched projection metadata and never falls back to the unsafe snapshot',async()=>{
    const h=fixture(),read=h.source.readAuthorizedInputs;
    h.source.readAuthorizedInputs=async input=>{
      const bundle=await read(input);
      return bundle?{...bundle,context:{...bundle.context,projectionVersion:'OTHER'}}:null;
    };
    await expect(h.repository.readAuthorizedSnapshot(request)).rejects.toThrow();
  });
  it('never copies unreceipted academic results from the separately read base snapshot',async()=>{
    const h=fixture(),fullGrant={...grant,allowedSections:[...grant.allowedSections,'ACADEMICS' as const]};
    h.base.setGrant(fullGrant);
    h.base.setProjection(DemoSnapshotSchema.parse({...snapshotRaw,academics:{state:'READY',
      rulePackVersion:'PRIVATE-RULE',asOf:snapshotRaw.asOf,earnedCreditUnits:120,
      inProgressCreditUnits:20,plannedCreditUnits:5,deficits:[],caveats:[]}}));
    const read=h.source.readAuthorizedInputs;
    h.source.readAuthorizedInputs=async input=>{
      const bundle=await read(input);
      return bundle?{...bundle,grant:fullGrant,scopeKey:'ACADEMICS,FEED,NOTICES'}:null;
    };
    const result=await h.repository.readAuthorizedSnapshot(request);
    expect(result?.academics).toEqual({state:'PENDING'});
    expect(JSON.stringify(result)).not.toContain('PRIVATE-RULE');
  });
  it.each(['asOf','dataset','projection','subject'])('rejects receipted metadata inconsistent with its input bundle: %s',async fault=>{
    const h=fixture(),read=h.source.readAuthorizedInputs;
    h.source.readAuthorizedInputs=async input=>{
      const bundle=await read(input);if(!bundle)return null;
      const approved=DemoSnapshotSchema.parse({...snapshotRaw,asOf:now});
      if(fault==='asOf')approved.asOf=snapshotRaw.asOf;
      if(fault==='dataset')approved.versions.dataset='OTHER';
      if(fault==='projection')approved.versions.projection='OTHER';
      if(fault==='subject')approved.demoSubjectId='S02';
      return {...bundle,approvedSnapshot:approved};
    };
    expect(await h.repository.readAuthorizedSnapshot(request)).toBeNull();
  });

  it.each(['base','approved'] as const)('does not evaluate hidden %s getters before masking',async target=>{
    const h=fixture();
    const hidden=()=>{
      const value=DemoSnapshotSchema.parse({...snapshotRaw,asOf:now});
      for(const key of ['academics','forecast'])
        Object.defineProperty(value,key,{enumerable:true,get:()=>{throw Error('Hidden value was evaluated');}});
      return value;
    };
    if(target==='base')h.base.readSnapshot=async()=>hidden();
    else{
      const read=h.source.readAuthorizedInputs;
      h.source.readAuthorizedInputs=async input=>{
        const bundle=await read(input);
        return bundle?{...bundle,approvedSnapshot:hidden()}:null;
      };
    }
    const result=await h.repository.readAuthorizedSnapshot(request);
    expect(result?.academics).toEqual({state:'NOT_SHARED'});
    expect(result?.forecast).toEqual({state:'NOT_SHARED'});
  });
});
