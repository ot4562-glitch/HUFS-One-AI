import {readFile} from 'node:fs/promises';
import type {Pool} from 'pg';
import {describe,it} from 'vitest';
import {proveRecognitionCleanup} from './recognition-cleanup-live-slice.js';
describe.skipIf(process.env.HUFS_PROOF_CLEANUP_PGLITE!=='1')('synthetic recognition cleanup SQL',()=>{
  it('enqueues redaction/consent erasure atomically, isolates owners and drains only acknowledged cleanup',async()=>{
    const {PGlite}=await import(/* @vite-ignore */ new URL('../../local_only/sql-validation/node_modules/@electric-sql/pglite/dist/index.js',import.meta.url).href);
    const db=new PGlite();try{
      for(const file of ['20261101_self_account.sql','20261101_self_workspace.sql','20261101_self_workspace_tombstones.sql',
        '20261101_experience_tag_approval.sql','20261113_international_checklists.sql','20261113_recognition_proof_cleanup.sql'])
        await db.exec(await readFile(new URL('../../infra/sql/'+file,import.meta.url),'utf8'));
      await db.exec(`CREATE ROLE synthetic_proof_owner NOLOGIN;
        GRANT USAGE ON SCHEMA public TO synthetic_proof_owner;
        GRANT SELECT,INSERT,UPDATE ON api_self_consents TO synthetic_proof_owner;
        GRANT SELECT,INSERT,UPDATE,DELETE ON api_self_profiles,api_self_workspace_records,api_experience_tag_approvals TO synthetic_proof_owner;
        GRANT INSERT ON api_self_consent_events,api_self_workspace_events,api_experience_tag_events TO synthetic_proof_owner;
        GRANT SELECT ON api_self_proof_cleanup TO synthetic_proof_owner;
        GRANT UPDATE(status,receipt_id,acknowledged_at) ON api_self_proof_cleanup TO synthetic_proof_owner;`);
      const admin={query:async(sql:string,params:readonly unknown[]=[])=>db.query(sql,[...params])};
      const owner={connect:async()=>({release:()=>{},query:async(sql:string,params:readonly unknown[]=[])=>{
        if(sql==='BEGIN'){await db.exec('BEGIN');await db.exec('SET LOCAL ROLE synthetic_proof_owner');return {rows:[]};}
        return db.query(sql,[...params]);
      }})};
      await proveRecognitionCleanup(admin as unknown as Pool,owner as unknown as Pool);
    }finally{await db.close();}
  },30000);
});
