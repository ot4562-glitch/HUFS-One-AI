/** Optional, explicitly enabled PostgreSQL-WASM proof for Windows development.
 * No socket, NCP connection, real data or package installation by the test.
 * The native multi-connection CI proof remains pg-full-live-opt-in.test.ts. */
import {readFile} from 'node:fs/promises';
import type {Pool} from 'pg';
import {describe,it} from 'vitest';
import {proveSourceBrowserPg} from './source-browser-live-slice.js';

describe.skipIf(process.env.HUFS_SOURCE_BROWSER_PGLITE!=='1')('local synthetic browser SQL via PGlite',()=>{
  it('retains separate bytes, requires review and invalidates changed/revoked dependencies',async()=>{
    const moduleUrl=new URL('../../local_only/sql-validation/node_modules/@electric-sql/pglite/dist/index.js',import.meta.url);
    const {PGlite}=await import(/* @vite-ignore */ moduleUrl.href);
    const db=new PGlite();
    try{
      for(const file of ['20261031_temporal_evidence.sql','20261101_source_review.sql',
        '20261105_source_image_evidence.sql','20261109_source_image_ocr_unique.sql','20261105_source_pdf_evidence.sql',
        '20261101_source_http_validators.sql','20261111_source_korean_document_media.sql',
        '20261101_verified_source_rights.sql','20261112_source_browser_evidence.sql'])
        await db.exec(await readFile(new URL('../../infra/sql/'+file,import.meta.url),'utf8'));
      await db.exec(`CREATE ROLE synthetic_browser_reader NOLOGIN;
        GRANT USAGE ON SCHEMA public TO synthetic_browser_reader;
        GRANT SELECT ON source_effective_revisions_vnext TO synthetic_browser_reader;`);
      const admin={query:async(sql:string,params:readonly unknown[]=[])=>db.query(sql,[...params]),
        connect:async()=>({query:async(sql:string,params:readonly unknown[]=[])=>db.query(sql,[...params]),release:()=>{}})};
      const reader={query:async(sql:string,params:readonly unknown[]=[])=>db.transaction(async(tx:any)=>{
        await tx.exec('SET LOCAL ROLE synthetic_browser_reader');return tx.query(sql,[...params]);
      })};
      await proveSourceBrowserPg(admin as unknown as Pool,reader as unknown as Pool);
    }finally{await db.close();}
  },30000);
});
