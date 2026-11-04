import {afterEach,describe,expect,it,vi} from 'vitest';
import type {ManagedDataPool,DataPoolSettings} from '../../apps/api/src/db/pg-pool.js';
import {makeSyntheticIntake} from './synthetic-intake-fixture.js';

const NOW='2026-10-31T00:00:00.000Z';
const runtimePath='../../apps/api/src/admin/intake-runtime.js';
async function runtime(){
  const module=await import(runtimePath).catch(()=>null);
  expect(module,'The private intake command consumer must be implemented').not.toBeNull();
  return module!;
}
const database:DataPoolSettings={
  connectionString:'postgresql://synthetic@private-db.example.test/intake',
  environment:'production',expectedRole:'hufs_intake_writer',
  trustedCaPem:'-----BEGIN CERTIFICATE-----\nSYNTHETIC-CA\n-----END CERTIFICATE-----',
};
afterEach(()=>{vi.unstubAllEnvs();});

function fixture(versions:readonly number[]=[0,0,0,0]){
  const input=makeSyntheticIntake();
  const subjects=input.formsOptions.expectedSubjectKeys;
  type Head={version:number;hash:string|null};
  let heads=new Map<string,Head>(subjects.map((key,i)=>[key,{version:versions[i]!,hash:null}]));
  let pending:Map<string,Head>|null=null,pendingRevisions:unknown[][]=[];
  const revisions:unknown[][]=[];
  let loaded=0,opened=0,closed=0,released=0,rollbacks=0,allowed=true,withdrawOnWrite=false;
  const pool:ManagedDataPool={
    close:async()=>{closed++;},
    connect:async()=>({
      release:()=>{released++;},
      query:async(sql:string,values?:readonly unknown[])=>{
        const v=values??[];
        if(sql==='BEGIN'){pending=structuredClone(heads);pendingRevisions=[];}
        else if(sql==='COMMIT'){
          heads=pending!;pending=null;revisions.push(...pendingRevisions);pendingRevisions=[];
        }else if(sql==='ROLLBACK'){pending=null;pendingRevisions=[];rollbacks++;}
        else if(sql.includes('INSERT INTO api_intake_heads')){
          if(!pending!.has(String(v[0])))pending!.set(String(v[0]),{version:0,hash:null});
        }else if(sql.includes('SELECT current_version')){
          const head=pending!.get(String(v[0]))!;
          return {rows:[{current_version:head.version,current_batch_sha256:head.hash}]};
        }else if(sql.includes('INSERT INTO api_intake_revisions')){
          pendingRevisions.push([...v]);if(withdrawOnWrite)allowed=false;
          return {rows:[{import_version:v[1]}]};
        }else if(sql.includes('UPDATE api_intake_heads')){
          const head=pending!.get(String(v[0]))!;
          if(head.version!==v[3])return {rows:[]};
          pending!.set(String(v[0]),{version:Number(v[1]),hash:String(v[2])});
          return {rows:[{current_version:v[1]}]};
        }else if(!sql.startsWith('SET LOCAL'))throw new Error('Unexpected synthetic SQL');
        return {rows:[]};
      },
    }),
  };
  const config={input,database,authority:{mayProcess:async()=>allowed}};
  const deps={
    loadConfig:async()=>{loaded++;return config;},
    createPool:(_settings:DataPoolSettings)=>{opened++;return pool;},
    now:()=>NOW,
  };
  const expectedVersions=Object.fromEntries(subjects.map((key,i)=>[key,versions[i]!]));
  const args=(previewHash:string,expected=expectedVersions)=>[
    '--apply','--preview-hash',previewHash,
    ...Object.entries(expected).flatMap(([subject,version])=>['--expected-version',subject+'='+version]),
  ];
  return {input,config,deps,args,revisions,pool,
    counts:()=>({loaded,opened,closed,released,rollbacks}),
    heads:()=>[...heads.values()].map(x=>x.version),
    deny:()=>{allowed=false;},withdrawDuringWrite:()=>{withdrawOnWrite=true;}};
}

describe('private operator intake command',()=>{
  it('accepts only a direct canonical private config module path',async()=>{
    const {privateIntakeConfigPath}=await runtime();
    expect(typeof privateIntakeConfigPath).toBe('function');
    expect(privateIntakeConfigPath('/etc/hufs-one/private/intake-approved.mjs'))
      .toBe('/etc/hufs-one/private/intake-approved.mjs');
  });
  it('refuses nested, traversal and symlink-directory spellings before private IO',async()=>{
    const {privateIntakeConfigPath}=await runtime();
    expect(typeof privateIntakeConfigPath).toBe('function');
    for(const name of [
      undefined,'','relative.mjs','/etc/hufs-one/private/other/adapter.mjs',
      '/etc/hufs-one/private/linked/../adapter.mjs',
      '/etc/hufs-one/private/../adapter.mjs','/etc/hufs-one/private/./adapter.mjs',
      '/etc/hufs-one/private//adapter.mjs','/etc/hufs-one/private-copy/adapter.mjs',
      '/etc/hufs-one/private/adapter.js','/etc/hufs-one/private/adapter.mjs/child.mjs',
      '/etc/hufs-one/private/back\\\\slash.mjs','/etc/hufs-one/private/'+ 'a'.repeat(500)+'.mjs',
    ])expect(()=>privateIntakeConfigPath(name)).toThrow('Private intake factory path refused');
  });
  it('plans without loading private configuration or constructing a database pool',async()=>{
    const f=fixture(),{runRestrictedIntakeCommand}=await runtime();
    const result=await runRestrictedIntakeCommand(['--plan'],f.deps);
    expect(result).toEqual({operation:'PLAN',release:'RELEASE_BLOCKED',
      sourceRead:false,databaseWrite:false});
    expect(f.counts()).toEqual({loaded:0,opened:0,closed:0,released:0,rollbacks:0});
  });
  it.each([
    [],['--preview','extra'],['--plan','--apply'],['--apply'],
    ['--apply','--preview-hash','invalid'],
  ].map(args=>({args})))('rejects malformed command arguments before reading private inputs ($args)',async ({args})=>{
    const f=fixture(),{runRestrictedIntakeCommand}=await runtime();
    await expect(runRestrictedIntakeCommand(args,f.deps))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(f.counts().loaded).toBe(0);expect(f.counts().opened).toBe(0);
  });
  it('rejects duplicate, missing, noncanonical and overflowed subject versions',async()=>{
    const f=fixture(),{runRestrictedIntakeCommand}=await runtime();
    const valid=f.args('a'.repeat(64));
    const malformed=[
      valid.slice(0,-2),
      [...valid,'--expected-version','SYN-EXTRA=0'],
      [...valid.slice(0,-1),'SYN-INT-A=0'],
      [...valid.slice(0,-1),'SYN-INT-D=01'],
      [...valid.slice(0,-1),'SYN-INT-D=-1'],
      [...valid.slice(0,-1),'SYN-INT-D=9007199254740992'],
    ];
    for(const args of malformed)await expect(runRestrictedIntakeCommand(args,f.deps))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(f.counts().loaded).toBe(0);expect(f.counts().opened).toBe(0);
  });
  it('previews aggregate diagnostics with no database and no participant or source contents',async()=>{
    const f=fixture(),{runRestrictedIntakeCommand}=await runtime();
    const result=await runRestrictedIntakeCommand(['--preview'],f.deps);
    expect(result).toMatchObject({operation:'PREVIEW',ready:true,formRowCount:4,
      courseFileCount:4,courseRowCount:4,issueCounts:[],
      creditChecks:{MATCH:4,MISMATCH:0,UNKNOWN:0},nextState:'STUDENT_REVIEW_PENDING'});
    expect(result.previewHash).toMatch(/^[a-f0-9]{64}$/);
    expect(f.counts()).toEqual({loaded:1,opened:0,closed:0,released:0,rollbacks:0});
    const output=JSON.stringify(result);
    for(const value of ['가상작성자','가상 기초과목','SYN-INT-A','subjectKey','filename','formsCsv'])
      expect(output).not.toContain(value);
  });
  it('keeps invalid preview diagnostics unready without promoting student review',async()=>{
    const f=fixture(),{runRestrictedIntakeCommand}=await runtime();
    f.config.input.formsCsv=f.input.formsCsv.replace('"예"','"아니오"');
    const result=await runRestrictedIntakeCommand(['--preview'],f.deps);
    expect(result).toMatchObject({ready:false,nextState:'STUDENT_REVIEW_PENDING'});
    expect(result.issueCounts).toContainEqual({code:'CONSENT_DENIED',count:1});
    expect(f.counts().opened).toBe(0);
  });
  it('applies mixed per-subject versions atomically and keeps retry idempotent',async()=>{
    const f=fixture([2,0,9,1]),{runRestrictedIntakeCommand}=await runtime();
    const original=structuredClone(f.input);
    const preview=await runRestrictedIntakeCommand(['--preview'],f.deps);
    const applied=await runRestrictedIntakeCommand(f.args(preview.previewHash),f.deps);
    expect(applied).toEqual({operation:'APPLY',previewHash:preview.previewHash,
      participantCount:4,newRevisionCount:4,reusedCount:0,nextState:'STUDENT_REVIEW_PENDING'});
    expect(f.heads()).toEqual([3,1,10,2]);expect(f.revisions).toHaveLength(4);
    const repeated=await runRestrictedIntakeCommand(f.args(preview.previewHash),f.deps);
    expect(repeated).toMatchObject({newRevisionCount:0,reusedCount:4});
    expect(f.heads()).toEqual([3,1,10,2]);expect(f.revisions).toHaveLength(4);
    expect(f.counts()).toMatchObject({opened:2,closed:2,released:2,rollbacks:0});
    expect(f.input).toEqual(original);
    expect(JSON.stringify(applied)).not.toContain('SYN-INT-A');
  });
  it('rolls back all subjects when one expected version is stale',async()=>{
    const f=fixture([2,0,9,1]),{runRestrictedIntakeCommand}=await runtime();
    const preview=await runRestrictedIntakeCommand(['--preview'],f.deps);
    const expected={'SYN-INT-A':2,'SYN-INT-B':0,'SYN-INT-C':9,'SYN-INT-D':0};
    await expect(runRestrictedIntakeCommand(f.args(preview.previewHash,expected),f.deps))
      .rejects.toMatchObject({code:'VERSION_CONFLICT'});
    expect(f.heads()).toEqual([2,0,9,1]);expect(f.revisions).toHaveLength(0);
    expect(f.counts()).toMatchObject({opened:1,closed:1,released:1,rollbacks:1});
  });
  it('never opens a pool for denied purpose rights or a changed preview hash',async()=>{
    const {runRestrictedIntakeCommand}=await runtime();
    const denied=fixture();denied.deny();
    await expect(runRestrictedIntakeCommand(denied.args('a'.repeat(64)),denied.deps))
      .rejects.toMatchObject({code:'FORBIDDEN'});
    expect(denied.counts().opened).toBe(0);
    const changed=fixture();
    await expect(runRestrictedIntakeCommand(changed.args('f'.repeat(64)),changed.deps))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(changed.counts().opened).toBe(0);
  });
  it('requires an explicit authority and dedicated production TLS pool settings',async()=>{
    const {runRestrictedIntakeCommand}=await runtime();
    for(const missing of ['authority','database','production'] as const){
      const f=fixture();
      if(missing==='authority')(f.config as any).authority=undefined;
      if(missing==='database')(f.config as any).database=undefined;
      if(missing==='production')f.config.database={...database,environment:'local-test'};
      await expect(runRestrictedIntakeCommand(f.args('a'.repeat(64)),f.deps)).rejects.toBeDefined();
      expect(f.counts().opened).toBe(0);
    }
  });
  it('rolls back when rights are withdrawn during apply and closes the pool',async()=>{
    const f=fixture(),{runRestrictedIntakeCommand}=await runtime();
    const preview=await runRestrictedIntakeCommand(['--preview'],f.deps);
    f.withdrawDuringWrite();
    await expect(runRestrictedIntakeCommand(f.args(preview.previewHash),f.deps))
      .rejects.toMatchObject({code:'FORBIDDEN'});
    expect(f.heads()).toEqual([0,0,0,0]);expect(f.revisions).toHaveLength(0);
    expect(f.counts()).toMatchObject({closed:1,released:1,rollbacks:1});
  });
  it('refuses a production invocation before loading private configuration',async()=>{
    const f=fixture(),{runRestrictedIntakeCommand}=await runtime();
    vi.stubEnv('APP_ENV','production');
    await expect(runRestrictedIntakeCommand(['--preview'],f.deps)).rejects.toBeDefined();
    expect(f.counts().loaded).toBe(0);
  });
  it('redacts private factory failures',async()=>{
    const f=fixture(),{runRestrictedIntakeCli}=await runtime();
    f.deps.loadConfig=async()=>{throw new Error('synthetic confidential path and credential');};
    const stdout:string[]=[],stderr:string[]=[];
    const exit=await runRestrictedIntakeCli(['--preview'],f.deps,{
      stdout:(value:string)=>stdout.push(value),stderr:(value:string)=>stderr.push(value),
    });
    expect(exit).toBe(1);expect(stdout).toEqual([]);
    expect(stderr).toEqual(['INTAKE_COMMAND_REFUSED_OR_UNCONFIRMED\n']);
  });
  it('suppresses success output when pool shutdown fails after an applied commit',async()=>{
    const f=fixture(),{runRestrictedIntakeCommand,runRestrictedIntakeCli}=await runtime();
    const preview=await runRestrictedIntakeCommand(['--preview'],f.deps);
    f.pool.close=async()=>{throw new Error('synthetic confidential shutdown details');};
    const stdout:string[]=[],stderr:string[]=[];
    const exit=await runRestrictedIntakeCli(f.args(preview.previewHash),f.deps,{
      stdout:(value:string)=>stdout.push(value),stderr:(value:string)=>stderr.push(value),
    });
    expect(exit).toBe(1);expect(stdout).toEqual([]);
    expect(stderr).toEqual(['INTAKE_COMMAND_REFUSED_OR_UNCONFIRMED\n']);
    // The command must not claim rollback when its commit was already applied.
    expect(f.heads()).toEqual([1,1,1,1]);expect(f.revisions).toHaveLength(4);
  });
});
