import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync(
  new URL('../../infra/sql/20261031_temporal_evidence.sql',import.meta.url),'utf8',
);
describe('TASK-19/21 offline PostgreSQL DDL safety review (NOT executed on a DB)',()=>{
  it('ties supersession edges to revisions from the same source',()=>{
    expect(sql).toMatch(/UNIQUE\(source_id,revision_id\)/i);
    expect(sql).toMatch(/FOREIGN KEY\(source_id,supersedes\)/i);
    expect(sql).toMatch(/REFERENCES source_revisions_vnext\(source_id,revision_id\)/i);
  });
  it('prevents in-place UPDATE and DELETE of historical revisions and quotes',()=>{
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON source_revisions_vnext/i);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON source_paragraphs_vnext/i);
    expect(sql).toMatch(/RAISE EXCEPTION 'immutable evidence history'/i);
  });
  it('retains independent HTTP observations and rejects unverified ACTIVE rights',()=>{
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS source_check_observations/i);
    expect(sql).toMatch(/status!='ACTIVE'/i);
    expect(sql).toMatch(/last_verified_at IS NOT NULL/i);
    expect(sql).toMatch(/provenance!='RESEARCH_ONLY'/i);
  });
  it('does not grant public read/write rights to raw evidence or events',()=>{
    for(const table of [
      'source_revisions_vnext','source_paragraphs_vnext',
      'source_ingest_heads','source_check_observations',
      'source_invalidation_events',
    ])expect(sql).toContain(`REVOKE ALL ON TABLE ${table} FROM PUBLIC`);
  });
  it('uses a composite source/asOf index; leaves production roles/operator approval separate',()=>{
    expect(sql).toMatch(/ON source_revisions_vnext\(source_id,fetched_at DESC/i);
    expect(sql).not.toMatch(/GRANT ALL ON TABLE/i);
    expect(sql).toContain('DRAFT, not applied to any DB');
  });
});
