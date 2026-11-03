#!/usr/bin/env node
// Offline pin validation by default; optional READ ONLY database preflight.
// Mutating apply requires the programmatic independent approval/backup gate.
import {readFile,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Pool} from 'pg';

try{
  const args=process.argv.slice(2);let path,variable;
  for(let i=0;i<args.length;i+=2){
    const value=args[i+1];if(!value)throw new Error('Invalid arguments');
    if(args[i]==='--plan'&&path===undefined)path=value;
    else if(args[i]==='--database-env'&&variable===undefined&&/^[A-Z][A-Z0-9_]{0,63}$/.test(value))variable=value;
    else throw new Error('Invalid arguments');
  }
  if(!path)throw new Error('Explicit plan required');
  const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw new Error('Invalid plan');
  const raw=JSON.parse(await readFile(path,'utf8')),workspace=fileURLToPath(new URL('..',import.meta.url));
  const {compileMigrationPlan}=await import('../dist/apps/api/src/db/migration-plan.js');
  const compiled=await compileMigrationPlan(workspace,raw);
  let result={state:'PINS_VERIFIED',planSha256:compiled.sha256,files:compiled.files.map(({path,sha256})=>({path,sha256})),release:'RELEASE_BLOCKED'};
  if(variable){
    const rawUrl=process.env[variable];if(!rawUrl)throw new Error('Explicit database URL required');
    const url=new URL(rawUrl),target=compiled.plan.target,host=url.hostname.replace(/^\[|\]$/g,'');
    if(!['postgres:','postgresql:'].includes(url.protocol)||url.search||url.hash||host!==target.address
      ||decodeURIComponent(url.pathname)!=='/'+target.database||decodeURIComponent(url.username)!==target.role
      ||Number(url.port||5432)!==target.port)throw new Error('Database binding mismatch');
    const pool=new Pool({connectionString:rawUrl,ssl:target.requireTls?{rejectUnauthorized:true}:false,max:1,connectionTimeoutMillis:3000});
    try{
      const {createReviewedMigrationRunner,postgresMigrationPool}=await import('../dist/apps/api/src/db/reviewed-migrations.js');
      const runner=await createReviewedMigrationRunner({workspace,plan:raw,pool:postgresMigrationPool(pool)});
      result={state:'CHECKED',...await runner.check()};
    }finally{await pool.end();}
  }
  process.stdout.write(JSON.stringify(result)+'\n');
}catch{
  // Never print URI, SQL, driver errors, environment values or operator secrets.
  process.stderr.write(JSON.stringify({state:'DENIED',code:'MIGRATION_PREFLIGHT_UNAVAILABLE',release:'RELEASE_BLOCKED'})+'\n');
  process.exitCode=1;
}
