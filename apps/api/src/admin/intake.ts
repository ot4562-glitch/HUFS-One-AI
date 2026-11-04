/** Private, operator-invoked transcript staging. Never a browser intake route.
 * --plan does not load private configuration or construct a database pool.
 */
import {lstatSync,realpathSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPostgresDataPool} from '../db/pg-pool.js';
import {runRestrictedIntakeCli} from './intake-runtime.js';
import type {RestrictedIntakeConfig} from './intake-runtime.js';

async function loadPrivateConfig():Promise<RestrictedIntakeConfig>{
  if(process.platform!=='linux'
    ||process.env.HUFS_INTAKE_OPERATOR_MODE!=='private-staging'
    ||process.env.HUFS_INTAKE_OPERATOR_ACK!=='PRIVATE_INTAKE_NOT_RELEASE')
    throw new Error('Reviewed private intake operator runtime required');
  const name=process.env.HUFS_INTAKE_CONFIG_MODULE;
  if(!name||name.length>512||!isAbsolute(name)||!name.endsWith('.mjs')
    ||!name.startsWith('/etc/hufs-one/private/'))
    throw new Error('Separate private intake factory required');
  for(const directory of ['/etc','/etc/hufs-one','/etc/hufs-one/private']){
    const stat=lstatSync(directory);
    if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==0||stat.mode&0o022)
      throw new Error('Private intake directory permissions refused');
  }
  const stat=lstatSync(name);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0||stat.nlink!==1
    ||stat.mode&0o077||stat.size>65_536||realpathSync(name)!==name)
    throw new Error('Private intake factory permissions or path refused');
  const module=await import(pathToFileURL(name).href) as {
    createRestrictedIntakeConfig?:()=>RestrictedIntakeConfig|Promise<RestrictedIntakeConfig>;
  };
  if(typeof module.createRestrictedIntakeConfig!=='function')
    throw new Error('Private intake factory export required');
  return module.createRestrictedIntakeConfig();
}

process.exitCode=await runRestrictedIntakeCli(process.argv.slice(2),{
  loadConfig:loadPrivateConfig,createPool:createPostgresDataPool,
},{
  stdout:value=>process.stdout.write(value),
  stderr:value=>process.stderr.write(value),
});
