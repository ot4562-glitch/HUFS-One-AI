import {describe,expect,it} from 'vitest';
import {
  DemoProfileOptionSchema,DemoSnapshotSchema,SafeLlmPacketSchema,
} from '@hufs-one/contracts';
import {PostgresApiProjectionRepository} from '../../apps/api/src/repository-postgres.js';
import type {ReviewerSqlConnection,ReviewerSqlPool} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';
import rawProfiles from '../../packages/fixtures/synthetic/demo-profiles.json';
import rawSnapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';

const NOW='2026-10-31T00:00:00.000Z';
const AFTER='2026-11-05T00:00:00.000Z';
const ACTOR='synthetic-google-sub-01';
const profiles=rawProfiles.profiles.map(p=>DemoProfileOptionSchema.parse(p));
const snapshot=DemoSnapshotSchema.parse(rawSnapshot);
const packet=SafeLlmPacketSchema.parse({
  packetId:'packet-ref01',task:'opportunity_terms',
  providerInputClass:'SYNTHETIC_CLEARED',
  sourceTokens:[{token:'SYN-TOK-1',paragraphs:[{
    id:'p1',text:'합성 공고 모집',
  }]}],
  allowedTopicCodes:['DATA_ANALYTICS'],allowedObjectTokens:['SYN-OBJECT'],
  approvedFacts:[],schemaVersion:'1',promptVersion:'1',
});
const grant={
  grant_id:'G1',actor_id:ACTOR,subject_id:'S01',
  allowed_sections:['FEED','NOTICES'],display_name_allowed:false,
  recording_allowed:false,version:'v1',
  expires_at:AFTER,revoked_at:null,
};
function stub(rowsBySql:(sql:string,params:readonly unknown[])=>Record<string,unknown>[]){
  const queries:Array<{sql:string,params:readonly unknown[]}>=[],released:number[]=[];
  const connection:ReviewerSqlConnection={
    query:async(sql,params=[])=>{
      queries.push({sql,params});
      return {rows:rowsBySql(sql,params)};
    },release:()=>{released.push(1);},
  };
  const pool:ReviewerSqlPool={connect:async()=>connection};
  return {repo:new PostgresApiProjectionRepository(pool,()=>NOW),queries,released};
}
const profileRows=profiles.map(p=>({
  subject_id:p.demoSubjectId,profile_json:p,
}));
const packetRow={actor_id:ACTOR,task:'opportunity_terms',packet_ref:'packet-ref01',packet_json:packet};

describe('TASK-27 PostgreSQL privacy-scoped API repository (synthetic SQL stub)',()=>{
  it('reads exactly five validated projection-only profile slots',async()=>{
    const h=stub(()=>profileRows);
    const result=await h.repo.listProfiles();
    expect(result).toHaveLength(5);
    expect(result.map(x=>x.demoSubjectId)).toEqual(['S01','S02','S03','S04','S05']);
    expect(h.queries[0]?.sql).toContain('WHERE current=true');
    expect(h.queries[0]?.sql).not.toContain('raw_csv');
    expect(h.released).toHaveLength(1);
  });
  it('rejects partial lists, duplicate subject IDs and unknown raw columns',async()=>{
    for(const rows of [
      profileRows.slice(0,4),
      [...profileRows.slice(0,4),profileRows[0]!],
      profileRows.map((row,i)=>i===1?{
        ...row,profile_json:{...row.profile_json,rawCourses:['private']},
      }:row),
    ]){
      const h=stub(()=>rows);
      await expect(h.repo.listProfiles()).rejects.toThrow();
      expect(h.released).toHaveLength(1);
    }
  });
  it('binds a live grant to immutable OIDC actor and exact subject',async()=>{
    const h=stub(()=>[grant]);
    const result=await h.repo.readGrant(ACTOR,'S01');
    expect(result).toMatchObject({
      actorId:ACTOR,demoSubjectId:'S01',allowedSections:['FEED','NOTICES'],
      displayNameAllowed:false,
    });
    expect(h.queries[0]?.params).toEqual([ACTOR,'S01',NOW]);
    expect(h.queries[0]?.sql).toContain('actor_id=$1 AND subject_id=$2');
    expect(h.queries[0]?.sql).toContain('revoked_at IS NULL');
    expect(h.queries[0]?.sql).toContain('expires_at>$3');
    expect(h.released).toHaveLength(1);
  });
  it('rejects a foreign actor grant, alien student subject, unsafe sections and expired row',async()=>{
    for(const fake of [
      {...grant,actor_id:'other-google-sub'},
      {...grant,subject_id:'S02'},
      {...grant,allowed_sections:['RAW_COURSES']},
      {...grant,expires_at:'2026-01-01T00:00:00.000Z'},
      {...grant,revoked_at:'2026-10-30T00:00:00.000Z'},
    ]){
      const h=stub(()=>[fake]);
      await expect(h.repo.readGrant(ACTOR,'S01')).rejects.toThrow();
      expect(h.released).toHaveLength(1);
    }
  });
  it('returns null for no or expired grant without granting a profile',async()=>{
    const h=stub(()=>[]);
    expect(await h.repo.readGrant(ACTOR,'S01')).toBeNull();
    expect(h.released).toHaveLength(1);
  });
  it('rejects malformed/injected actor and subject before connecting',async()=>{
    const h=stub(()=>[]);
    await expect(h.repo.readGrant('admin\' OR true--','S01')).rejects.toThrow();
    await expect(h.repo.readGrant(ACTOR,'S06' as 'S01')).rejects.toThrow();
    expect(h.queries).toHaveLength(0);
  });
  it('only reads a current and exact matching snapshot, without raw original material',async()=>{
    const h=stub(()=>[{subject_id:'S01',snapshot_json:snapshot}]);
    const result=await h.repo.readSnapshot('S01');
    expect(result?.demoSubjectId).toBe('S01');
    expect(h.queries[0]?.params).toEqual(['S01']);
    expect(h.queries[0]?.sql).toContain('WHERE subject_id=$1 AND current=true');
    expect(h.released).toHaveLength(1);
  });
  it('rejects another subject, future asOf and extra raw student records in snapshot',async()=>{
    for(const forged of [
      {...snapshot,demoSubjectId:'S02'},
      {...snapshot,asOf:'2026-11-03T00:00:00.000Z'},
      {...snapshot,rawForms:{fullName:'private'}},
    ]){
      const h=stub(()=>[{subject_id:'S01',snapshot_json:forged}]);
      await expect(h.repo.readSnapshot('S01')).rejects.toThrow();
    }
  });
  it('returns null if a user has not approved a projection',async()=>{
    const h=stub(()=>[]);
    expect(await h.repo.readSnapshot('S01')).toBeNull();
    expect(h.released).toHaveLength(1);
  });
  it('loads only approved synthetic packet for same actor/task/ref, with expiry and revocation',async()=>{
    const h=stub(()=>[packetRow]);
    const data=await h.repo.readSafePacket(ACTOR,'opportunity_terms','packet-ref01');
    expect(data?.task).toBe('opportunity_terms');
    expect(h.queries[0]?.params).toEqual([
      ACTOR,'opportunity_terms','packet-ref01',NOW,
    ]);
    expect(h.queries[0]?.sql).toContain("approval_state='APPROVED'");
    expect(h.queries[0]?.sql).toContain("input_class='SYNTHETIC_CLEARED'");
    expect(h.queries[0]?.sql).toContain('revoked_at IS NULL');
  });
  it('refuses cross-actor/task/ref matches, forbidden input classes and raw packet keys',async()=>{
    for(const row of [
      {...packetRow,actor_id:'other-actor'},
      {...packetRow,task:'graduation_explanation'},
      {...packetRow,packet_ref:'another'},
      {...packetRow,packet_json:{...packet,providerInputClass:'PUBLIC_CLEARED'}},
      {...packetRow,packet_json:{...packet,studentId:'secret'}},
      {...packetRow,packet_json:{...packet,packetId:'different'}},
    ]){
      const h=stub(()=>[row]);
      await expect(h.repo.readSafePacket(ACTOR,'opportunity_terms','packet-ref01'))
        .rejects.toThrow();
      expect(h.released).toHaveLength(1);
    }
  });
  it('returns null for absent packet and denies too-large provider JSON',async()=>{
    const absent=stub(()=>[]);
    expect(await absent.repo.readSafePacket(ACTOR,'opportunity_terms','packet-ref01'))
      .toBeNull();
    const huge=stub(()=>[{
      ...packetRow,packet_json:{...packet,sourceTokens:[{token:'large',paragraphs:[{
        id:'p1',text:'x'.repeat(70_000),
      }]}]},
    }]);
    await expect(huge.repo.readSafePacket(ACTOR,'opportunity_terms','packet-ref01'))
      .rejects.toThrow(/Oversized/);
  });
  it('releases the connection after SQL/database rejection',async()=>{
    const h=stub(()=>{throw new Error('synthetic database down');});
    await expect(h.repo.readGrant(ACTOR,'S01')).rejects.toThrow(/synthetic/);
    expect(h.released).toHaveLength(1);
  });

  it('returns only version metadata for scoped computation without weakening the full snapshot reader',async()=>{
    const metadata={demoSubjectId:snapshot.demoSubjectId,datasetMode:snapshot.datasetMode,
      asOf:snapshot.asOf,versions:snapshot.versions};
    const h=stub(()=>[{subject_id:'S01',snapshot_metadata:metadata,
      snapshot_json:{...snapshot,academics:null,forecast:null}}]);
    expect(await h.repo.readSnapshotMetadata('S01')).toEqual(metadata);
    expect(h.queries[0]?.params).toEqual(['S01']);
    expect(h.queries[0]?.sql).toContain('jsonb_build_object');
    expect(h.queries[0]?.sql).toContain('WHERE subject_id=$1 AND current=true');
    expect(h.queries[0]?.sql).not.toContain("snapshot_json->'academics'");
    expect(h.queries[0]?.sql).not.toContain("snapshot_json->'forecast'");
    await expect(h.repo.readSnapshot('S01')).rejects.toThrow();
  });
});
