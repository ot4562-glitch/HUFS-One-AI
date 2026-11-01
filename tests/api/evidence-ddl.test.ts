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
  it('uses valid PL/pgSQL dollar quoting for the immutable-history trigger',()=>{
    expect(sql).toMatch(/RETURNS trigger LANGUAGE plpgsql AS \$\$\s*BEGIN/i);
    expect(sql).toMatch(/END;\s*\$\$;/i);
    expect(sql).not.toMatch(/LANGUAGE plpgsql AS \$\s/);
  });
  it('restricts per-target outbox retries to private, lease-fenced rows',()=>{
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS source_invalidation_deliveries');
    expect(sql).toMatch(/PRIMARY KEY\(event_id,target\)/i);
    expect(sql).toContain('lease_token uuid');
    expect(sql).toContain('lease_until timestamptz');
    expect(sql).toContain('source_delivery_retry');
    expect(sql).toContain('REVOKE ALL ON TABLE source_invalidation_deliveries FROM PUBLIC');
  });
  it('requires reviewed, immutable and private conflict decisions with historical resolution',()=>{
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS source_conflict_decisions_vnext');
    expect(sql).toMatch(/disposition IN \('CONFLICT','RESOLVED'\)/i);
    expect(sql).toContain('reviewed_at timestamptz NOT NULL');
    expect(sql).toContain('reviewer_id text NOT NULL');
    expect(sql).toContain('CHECK(left_revision_id<right_revision_id)');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON source_conflict_decisions_vnext');
    expect(sql).toContain('REVOKE ALL ON TABLE source_conflict_decisions_vnext FROM PUBLIC');
  });
  it('retains independent HTTP observations and rejects unverified ACTIVE rights',()=>{
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS source_check_observations/i);
    expect(sql).toMatch(/status!='ACTIVE'/i);
    expect(sql).toMatch(/last_verified_at IS NOT NULL/i);
    expect(sql).toMatch(/provenance!='RESEARCH_ONLY'/i);
  });
  it('retains all reviewed academic notice restrictions, including a one-sided cohort',()=>{
    for(const column of [
      'scope_campuses text[]','scope_majors text[]','scope_colleges text[]',
      'scope_major_roles text[]','scope_admission_types text[]',
      'scope_enrollment_states text[]','scope_graduation_terms text[]',
      'cohort_min integer','cohort_max integer',
    ])expect(sql).toContain(column);
    expect(sql).toContain("ARRAY['PRIMARY','DOUBLE','MINOR']");
    expect(sql).toMatch(/cohort_min IS NULL OR cohort_max IS NULL OR cohort_min<=cohort_max/i);
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
