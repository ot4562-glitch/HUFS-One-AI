import {mkdtemp,mkdir,writeFile,unlink,rmdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrationSha256} from '../../apps/api/src/db/migration-plan.js';
import type {ReviewedMigrationPlan} from '../../apps/api/src/db/migration-plan.js';

export async function migrationWorkspace(){
  const root=await mkdtemp(join(tmpdir(),'hufs-reviewed-migrations-'));
  await mkdir(join(root,'infra'));await mkdir(join(root,'infra','sql'));
  const names=new Set<string>();
  return {root,async put(name:string,sql:string){
    if(!/^[A-Za-z0-9_-]+\.sql$/.test(name))throw new Error('Synthetic migration name required');
    names.add(name);await writeFile(join(root,'infra','sql',name),sql,'utf8');
    return {path:'infra/sql/'+name,sha256:migrationSha256(sql)};
  },async copyProject(name:string){
    const sql=await readFile(new URL('../../infra/sql/'+name,import.meta.url),'utf8');
    return this.put(name,sql);
  },async close(){
    // Only exact files created by this fixture; no recursive filesystem cleanup.
    for(const name of names)await unlink(join(root,'infra','sql',name));
    await rmdir(join(root,'infra','sql'));await rmdir(join(root,'infra'));await rmdir(root);
  }};
}
export function migrationPlan(files:ReviewedMigrationPlan['files'],port=55448):ReviewedMigrationPlan{
  return {version:1,planId:'SYN-MIGRATION-PLAN',approvalRef:'SYN-INDEPENDENT-APPROVAL',backupRef:'SYN-RECOVERY-RECEIPT',
    target:{database:'hufs_one_migration_test',role:'hufs_test_migrator',address:'127.0.0.1',port,minimumVersion:140000,requireTls:false},files};
}
