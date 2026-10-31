import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {
  PostgresSharingGrantAdmin,SharingGrantWriteError,
} from '../../apps/api/src/modules/auth/sharing-grant-postgres.js';
import type {SharingGrantAdminAuthority} from
  '../../apps/api/src/modules/auth/sharing-grant-postgres.js';
import type {ReviewerSqlConnection,ReviewerSqlPool} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';

const NOW='2026-10-31T00:00:00.000Z';
const GRANT={
  grantId:'GRANT-1',actorId:'synthetic-google-sub-1',demoSubjectId:'S01',
  allowedSections:['FEED','NOTICES'],displayNameAllowed:false,
  recordingAllowed:false,version:'v1',expiresAt:'2026-11-15T00:00:00.000Z',
};
function setup(opt:{mayIssue?:boolean;mayRevoke?:boolean;
  insertReturns?:number;updateReturns?:number;failEvent?:boolean}={}){
  const calls:Array<{sql:string;params:readonly unknown[]}>=[],releases:number[]=[];
  const authority:SharingGrantAdminAuthority={
    mayIssue:vi.fn(async()=>opt.mayIssue!==false),
    mayRevoke:vi.fn(async()=>opt.mayRevoke!==false),
  };
  const conn:ReviewerSqlConnection={
    query:async(sql,params=[])=>{
      calls.push({sql,params});
      if(opt.failEvent&&sql.includes('INSERT INTO api_grant_events'))
        throw new Error('synthetic write failure');
      if(sql.includes('INSERT INTO api_sharing_grants'))
        return {rows:opt.insertReturns===0?[]:[{grant_id:'GRANT-1'}]};
      if(sql.includes('UPDATE api_sharing_grants'))
        return {rows:opt.updateReturns===0?[]:[{grant_id:'GRANT-1'}]};
      return {rows:[]};
    },
    release:()=>{releases.push(1);},
  };
  const pool:ReviewerSqlPool={connect:async()=>conn};
  const writer=new PostgresSharingGrantAdmin(pool,authority,()=>NOW);
  return {writer,calls,releases,authority};
}
const issuance=(grant:unknown=GRANT)=>({
  operatorId:'operator-1',consentRef:'consent-sections-1',grant,
});
const revoke=()=>({
  operatorId:'operator-1',actorId:GRANT.actorId,subjectId:'S01' as const,
  expectedVersion:'v1',newVersion:'v2',reason:'OWNER_REVOKED' as const,
});

describe('TASK-27 purpose-specific SharingGrant write / revoke transactions',()=>{
  it('creates scoped grant with reviewed consent and append-only audit in the same transaction',async()=>{
    const h=setup();
    await h.writer.issue(issuance());
    expect(h.authority.mayIssue).toHaveBeenCalledOnce();
    expect(h.calls[0]?.sql.trim()).toBe('BEGIN');
    expect(h.calls.some(x=>x.sql.includes('SET LOCAL statement_timeout'))).toBe(true);
    const insert=h.calls.find(x=>x.sql.includes('INSERT INTO api_sharing_grants'))!;
    expect(insert.sql).toContain('ON CONFLICT(actor_id,subject_id) DO NOTHING');
    expect(insert.params).toContain(GRANT.actorId);
    expect(insert.params).toContain('consent-sections-1');
    expect(h.calls.some(x=>x.sql.includes('INSERT INTO api_grant_events'))).toBe(true);
    expect(h.calls.at(-1)?.sql.trim()).toBe('COMMIT');
    expect(h.releases).toHaveLength(1);
  });
  it('rejects pending consent, malformed grants and expired approvals before DB connection',async()=>{
    for(const grant of [
      {...GRANT,allowedSections:[]},
      {...GRANT,allowedSections:['FEED','FEED']},
      {...GRANT,expiresAt:'2026-01-01T00:00:00.000Z'},
      {...GRANT,revokedAt:NOW},
      {...GRANT,allowedSections:['RAW_COURSES']},
    ]){
      const h=setup();
      await expect(h.writer.issue(issuance(grant))).rejects.toThrow();
      expect(h.calls).toHaveLength(0);
    }
  });
  it('requires explicit additional name and recording consent references',async()=>{
    const h=setup();
    await expect(h.writer.issue(issuance({...GRANT,displayNameAllowed:true})))
      .rejects.toBeInstanceOf(SharingGrantWriteError);
    await expect(h.writer.issue(issuance({...GRANT,recordingAllowed:true})))
      .rejects.toBeInstanceOf(SharingGrantWriteError);
    expect(h.calls).toHaveLength(0);
    await h.writer.issue({
      ...issuance({...GRANT,displayNameAllowed:true,recordingAllowed:true}),
      displayNameConsentRef:'consent-name',
      recordingConsentRef:'consent-record',
    });
    expect(h.calls.find(x=>x.sql.includes('INSERT INTO api_sharing_grants'))?.params)
      .toEqual(expect.arrayContaining(['consent-name','consent-record']));
  });
  it('fails closed if the independent operator consent ledger denies the grant',async()=>{
    const h=setup({mayIssue:false});
    await expect(h.writer.issue(issuance())).rejects.toBeInstanceOf(SharingGrantWriteError);
    expect(h.calls).toHaveLength(0);
  });
  it('does not silently upsert/overwrite existing grants on duplicate actor and subject',async()=>{
    const h=setup({insertReturns:0});
    await expect(h.writer.issue(issuance())).rejects.toBeInstanceOf(SharingGrantWriteError);
    expect(h.calls.some(x=>x.sql.trim()==='ROLLBACK')).toBe(true);
    expect(h.calls.every(x=>!x.sql.includes('INSERT INTO api_grant_events'))).toBe(true);
    expect(h.releases).toHaveLength(1);
  });
  it('rolls back grant creation if audit insertion fails',async()=>{
    const h=setup({failEvent:true});
    await expect(h.writer.issue(issuance())).rejects.toBeInstanceOf(SharingGrantWriteError);
    expect(h.calls.some(x=>x.sql.trim()==='ROLLBACK')).toBe(true);
    expect(h.calls.every(x=>x.sql.trim()!=='COMMIT')).toBe(true);
    expect(h.releases).toHaveLength(1);
  });
  it('revoke changes version + timestamp under expectedVersion CAS and writes audit',async()=>{
    const h=setup();
    await h.writer.revoke(revoke());
    expect(h.authority.mayRevoke).toHaveBeenCalledOnce();
    const update=h.calls.find(x=>x.sql.includes('UPDATE api_sharing_grants'))!;
    expect(update.sql).toContain('WHERE actor_id=$1 AND subject_id=$2 AND version=$3');
    expect(update.sql).toContain('revoked_at IS NULL');
    expect(update.params).toEqual([
      GRANT.actorId,'S01','v1',NOW,'v2',
    ]);
    const audit=h.calls.find(x=>x.sql.includes('INSERT INTO api_grant_events'))!;
    expect(audit.params).toContain('OWNER_REVOKED');
    expect(h.calls.at(-1)?.sql.trim()).toBe('COMMIT');
    expect(h.releases).toHaveLength(1);
  });
  it('does not claim success when the row is already revoked or version-conflicted',async()=>{
    const h=setup({updateReturns:0});
    await expect(h.writer.revoke(revoke()))
      .rejects.toBeInstanceOf(SharingGrantWriteError);
    expect(h.calls.some(x=>x.sql.trim()==='ROLLBACK')).toBe(true);
    expect(h.calls.every(x=>!x.sql.includes('INSERT INTO api_grant_events'))).toBe(true);
  });
  it('rejects unauthorized revocation, equal versions and malformed operator ID before SQL',async()=>{
    const denied=setup({mayRevoke:false});
    await expect(denied.writer.revoke(revoke()))
      .rejects.toBeInstanceOf(SharingGrantWriteError);
    expect(denied.calls).toHaveLength(0);
    const equal=setup();
    await expect(equal.writer.revoke({...revoke(),newVersion:'v1'}))
      .rejects.toBeInstanceOf(SharingGrantWriteError);
    expect(equal.calls).toHaveLength(0);
    await expect(equal.writer.revoke({...revoke(),operatorId:' '}))
      .rejects.toThrow();
    expect(equal.calls).toHaveLength(0);
  });
  it('rolls back revocation if the audit ledger fails; no half-revoked grant',async()=>{
    const h=setup({failEvent:true});
    await expect(h.writer.revoke(revoke()))
      .rejects.toBeInstanceOf(SharingGrantWriteError);
    expect(h.calls.some(x=>x.sql.trim()==='ROLLBACK')).toBe(true);
    expect(h.releases).toHaveLength(1);
  });
});

describe('TASK-27 offline SQL privilege and audit gate (not a DB integration test)',()=>{
  const ddl=readFileSync(
    new URL('../../infra/sql/20261031_api_projections.sql',import.meta.url),'utf8',
  );
  it('separates only reviewed display projections from raw CSV or Forms storage',()=>{
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS api_demo_profile_projections/);
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS api_demo_snapshot_projections/);
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS api_sharing_grants/);
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS api_approved_safe_packets/);
    expect(ddl).not.toMatch(/CREATE TABLE.*raw_forms/);
  });
  it('guards one live projection per subject and actor/subject grant uniqueness',()=>{
    expect(ddl).toContain('api_profile_one_current_per_subject');
    expect(ddl).toContain('api_snapshot_one_current_per_subject');
    expect(ddl).toContain('UNIQUE(actor_id,subject_id)');
  });
  it('keeps audit immutable and revokes public access to all projection tables',()=>{
    expect(ddl).toContain('BEFORE UPDATE OR DELETE ON api_grant_events');
    for(const table of [
      'api_demo_profile_projections','api_demo_snapshot_projections',
      'api_sharing_grants','api_approved_safe_packets','api_grant_events',
    ])expect(ddl).toContain(`REVOKE ALL ON TABLE ${table} FROM PUBLIC`);
  });
});
