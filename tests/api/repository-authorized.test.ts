import {describe,expect,it,vi} from 'vitest';
import {DemoSnapshotSchema} from '@hufs-one/contracts';
import {
  PostgresApiProjectionRepository,
} from '../../apps/api/src/repository-postgres.js';
import type {PurposeConsentVerifier} from
  '../../apps/api/src/repository-postgres.js';
import type {ReviewerSqlConnection,ReviewerSqlPool} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';
import rawSnapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';

const NOW='2026-10-31T00:00:00.000Z';
const actor='synthetic-google-sub-01';
const snapshot=DemoSnapshotSchema.parse(rawSnapshot);
function setup(consent?:PurposeConsentVerifier){
  let sections=['FEED','NOTICES'],revoked=false,version='v1';
  const calls:Array<{sql:string,params:readonly unknown[]}>=[],releases:number[]=[];
  const c:ReviewerSqlConnection={
    query:async(sql,params=[])=>{
      calls.push({sql,params});
      if(revoked||params[0]!==actor||params[1]!=='S01')return {rows:[]};
      if(sql.includes('JOIN api_sharing_grants')){
        if(params[2]!==version)return {rows:[]};
        if(!(params[3] as string[]).every(s=>sections.includes(s)))return {rows:[]};
        return {rows:[{
          subject_id:'S01',snapshot_json:snapshot,actor_id:actor,
          version,allowed_sections:sections,
        }]};
      }
      if(sql.includes('FROM api_sharing_grants'))return {rows:[{
        grant_id:'G1',actor_id:actor,subject_id:'S01',
        allowed_sections:sections,
        display_name_allowed:true,recording_allowed:true,
        display_name_consent_ref:'consent:name.1',
        recording_consent_ref:'consent-recording-1',
        version,expires_at:'2026-11-05T00:00:00.000Z',revoked_at:null,
      }]};
      return {rows:[]};
    },release:()=>{releases.push(1);},
  };
  const pool:ReviewerSqlPool={connect:async()=>c};
  return {
    repo:new PostgresApiProjectionRepository(pool,()=>NOW,consent),calls,releases,
    allow:(next:string[])=>{sections=next;},
    revoke:()=>{revoked=true;},version:(next:string)=>{version=next;},
  };
}
describe('TASK-27 atomic subject projection and independent purpose grants (SQL stub)',()=>{
  it('fails closed on a global precomputed feed/notice projection for any missing source section',async()=>{
    const h=setup();
    for(const sections of [
      ['FEED','NOTICES'],
      ['FEED','NOTICES','ACADEMICS'],
      ['FEED','NOTICES','EXPERIENCE'],
      ['ACADEMICS','FORECAST'],
    ]){
      h.allow(sections);
      // Even a request for just ACADEMICS gets a full DemoSnapshot wire.
      // Never release that wire while its precomputed FEED/NOTICES could
      // reveal unshared experiences, academic status or private interests.
      expect(await h.repo.readAuthorizedSnapshot({
        actorId:actor,subjectId:'S01',grantVersion:'v1',
        requiredSections:sections.includes('FEED')?['FEED','NOTICES']:['ACADEMICS'],
      })).toBeNull();
    }
    const query=h.calls[0]!;
    expect(query.sql).toContain('api_lock_authorized_personal_grant');
    expect(query.sql).toContain('g.actor_id=$1 AND p.subject_id=$2 AND g.version=$3');
    expect(query.sql).toContain('g.revoked_at IS NULL');
    expect(query.sql).toContain('p.current=true');
    expect(query.params).toEqual([actor,'S01','v1',['FEED','NOTICES','ACADEMICS','EXPERIENCE']]);
    expect(h.releases).toHaveLength(4);
  });
  it('releases a complete-source grant and still redacts unshared forecast',async()=>{
    const h=setup();
    h.allow(['FEED','NOTICES','ACADEMICS','EXPERIENCE']);
    const result=await h.repo.readAuthorizedSnapshot({
      actorId:actor,subjectId:'S01',grantVersion:'v1',
    });
    expect(result?.academics).toEqual(snapshot.academics);
    expect(result?.forecast).toEqual({state:'NOT_SHARED'});
    expect(result?.demoSubjectId).toBe('S01');
    h.allow(['FEED','NOTICES','ACADEMICS','EXPERIENCE','FORECAST']);
    const full=await h.repo.readAuthorizedSnapshot({
      actorId:actor,subjectId:'S01',grantVersion:'v1',requiredSections:['FEED','NOTICES','FORECAST'],
    });
    expect(full?.forecast).toEqual(snapshot.forecast);
    await expect(h.repo.readAuthorizedSnapshot({
      actorId:actor,subjectId:'S01',grantVersion:'v1',requiredSections:['RAW_COURSES'],
    })).rejects.toThrow();
  });
  it('denies an old context after revocation/version change, or cross-actor access',async()=>{
    const h=setup();
    h.version('v2');
    expect(await h.repo.readAuthorizedSnapshot({
      actorId:actor,subjectId:'S01',grantVersion:'v1',
    })).toBeNull();
    h.revoke();
    expect(await h.repo.readAuthorizedSnapshot({
      actorId:actor,subjectId:'S01',grantVersion:'v2',
    })).toBeNull();
    expect(await h.repo.readAuthorizedSnapshot({
      actorId:'other-oidc-actor',subjectId:'S01',grantVersion:'v2',
    })).toBeNull();
    await expect(h.repo.readAuthorizedSnapshot({
      actorId:actor,subjectId:'S01',grantVersion:'v2',
      requiredSections:['RAW_COURSES'],
    })).rejects.toThrow();
  });
  it('needs a distinct consent verifier for display name and recording',async()=>{
    const h=setup();
    const none=await h.repo.readGrant(actor,'S01');
    expect(none).toMatchObject({
      displayNameAllowed:false,recordingAllowed:false,
      allowedSections:['FEED','NOTICES'],
    });
    const verifier:PurposeConsentVerifier={
      isActive:vi.fn(async input=>input.purpose==='DISPLAY_NAME'),
    };
    const yes=setup(verifier);
    const grant=await yes.repo.readGrant(actor,'S01');
    expect(grant?.displayNameAllowed).toBe(true);
    expect(grant?.recordingAllowed).toBe(false);
    expect(verifier.isActive).toHaveBeenCalledTimes(2);
    expect(verifier.isActive).toHaveBeenCalledWith(expect.objectContaining({
      actorId:actor,subjectId:'S01',purpose:'DISPLAY_NAME',consentRef:'consent:name.1',
    }));
  });
  it('purpose consent ledger outage denies display/recording without granting raw access',async()=>{
    const h=setup({isActive:async()=>{throw new Error('ledger unavailable');}});
    const grant=await h.repo.readGrant(actor,'S01');
    expect(grant?.displayNameAllowed).toBe(false);
    expect(grant?.recordingAllowed).toBe(false);
  });
});
