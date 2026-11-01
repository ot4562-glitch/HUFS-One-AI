import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {DemoProfilesResponseSchema,DemoSnapshotSchema} from '@hufs-one/contracts';
import {buildDemoSnapshots,DEMO_CORPUS_VERSION,DEMO_AS_OF} from '../../packages/core/src/opportunities/index.js';

describe('single synthetic corpus artifact for UI/API/REVIEWER',()=>{
  it('publishes all five separately computed snapshots at the canonical version and asOf',()=>{
    const data=JSON.parse(readFileSync(new URL('../../packages/fixtures/synthetic/demo-corpus-snapshots.json',import.meta.url),'utf8'));
    expect(data).toMatchObject({datasetMode:'SYNTHETIC',version:DEMO_CORPUS_VERSION,
      asOf:DEMO_AS_OF,independentGoldReview:'PENDING'});
    expect(data.snapshots).toHaveLength(5);
    const parsed=data.snapshots.map((s:unknown)=>DemoSnapshotSchema.parse(s));
    expect(parsed).toEqual(buildDemoSnapshots());
    expect(new Set(parsed.map((s:{demoSubjectId:string})=>s.demoSubjectId)).size).toBe(5);
    expect(parsed[0].feed.featured.map((x:{opportunityId:string})=>x.opportunityId))
      .not.toEqual(parsed[1].feed.featured.map((x:{opportunityId:string})=>x.opportunityId));
  });

  it('provides a synthetic-only reviewer adapter with per-subject snapshots and defensive copies',async()=>{
    const {GeneratedSyntheticReviewerRepository}=await import('../../apps/api/src/modules/auth/reviewer-generated-corpus.js');
    const repo=new GeneratedSyntheticReviewerRepository();
    const profiles=DemoProfilesResponseSchema.parse({profiles:await repo.listProfiles()}).profiles;
    expect(profiles.map(p=>[p.demoSubjectId,p.dataMode,p.readiness]))
      .toEqual(['S01','S02','S03','S04','S05'].map(id=>[id,'SYNTHETIC','READY']));
    const first=await repo.readSnapshot('S01');
    const other=await repo.readSnapshot('S02');
    expect(first?.demoSubjectId).toBe('S01');expect(other?.demoSubjectId).toBe('S02');
    expect(first?.feed.featured).not.toEqual(other?.feed.featured);
    first!.feed.featured.length=0;
    expect((await repo.readSnapshot('S01'))?.feed.featured.length).toBeGreaterThan(0);
    expect(await repo.readSnapshot('S99' as never)).toBeNull();
    expect(await repo.readSafePacket('S01','experience_skills','unapproved')).toBeNull();
    expect(first?.academics).toEqual({state:'PENDING'});
  });
});
