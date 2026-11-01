import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const dir=new URL('../../infra/sql/',import.meta.url);
const migration=readFileSync(new URL('20261101_self_workspace_tombstones.sql',dir),'utf8');
const base=readFileSync(new URL('20261101_self_workspace.sql',dir),'utf8');
const store=readFileSync(new URL(
  '../../apps/api/src/modules/profiles/self-workspace-postgres.ts',import.meta.url),'utf8');

describe('A02 private workspace deletion invariant (offline static checks)',()=>{
  it('scrubs legacy payload without losing lifetime identity/version or actor audit',()=>{
    expect(migration).toContain('UPDATE public.api_self_workspace_records');
    expect(migration).toContain('WHERE deleted_at IS NOT NULL');
    expect(migration).toContain('ADD CONSTRAINT api_self_workspace_deleted_payload_minimal');
    expect(migration).toContain('VALIDATE CONSTRAINT api_self_workspace_deleted_payload_minimal');
    expect(migration).toContain('NEW.value_json := minimal;');
    expect(migration).toContain('NEW.version IS DISTINCT FROM OLD.version+1');
    expect(migration).toContain('NEW.deleted_at IS DISTINCT FROM OLD.deleted_at');
    expect(migration).toContain("USING ERRCODE='P6002'");
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE TABLE|GRANT ALL PRIVILEGES/);
  });

  it('preserves existing FORCE RLS, CAS and append-only audit boundaries',()=>{
    expect(base).toContain('ALTER TABLE api_self_workspace_records FORCE ROW LEVEL SECURITY');
    expect(base).toContain('BEFORE UPDATE OR DELETE ON api_self_workspace_events');
    expect(migration).toContain('REVOKE ALL ON FUNCTION');
    expect(migration).not.toMatch(/LANGUAGE plpgsql SECURITY DEFINER/);
    expect(store).toContain("value_json=jsonb_build_object('kind',kind,'dataMode'");
    expect(store).toContain('AND version=$4 AND deleted_at IS NULL RETURNING version');
    expect(store).toContain("action:'DELETED'");
  });
});
