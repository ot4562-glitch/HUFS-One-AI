import {createHash} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {isIP} from 'node:net';
import {isAbsolute,relative,resolve,sep} from 'node:path';
import {z} from 'zod';

const Ref=z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/),Hash=z.string().regex(/^[a-f0-9]{64}$/);
export const ReviewedMigrationPlanSchema=z.strictObject({
  version:z.literal(1),planId:Ref,approvalRef:Ref,backupRef:Ref,
  target:z.strictObject({database:Ref,role:Ref,address:z.string().refine(value=>isIP(value)>0),
    port:z.number().int().min(1).max(65535),minimumVersion:z.number().int().min(140000).max(999999),requireTls:z.boolean()}),
  files:z.array(z.strictObject({path:z.string().regex(/^infra\/sql\/[A-Za-z0-9_-]+\.sql$/),sha256:Hash})).min(1).max(64),
}).superRefine((value,ctx)=>{
  if(new Set(value.files.map(f=>f.path)).size!==value.files.length)ctx.addIssue({code:'custom',message:'Duplicate migration path'});
  if(!['127.0.0.1','::1'].includes(value.target.address)&&!value.target.requireTls)
    ctx.addIssue({code:'custom',message:'Remote migrations require encrypted transport'});
});
export type ReviewedMigrationPlan=z.infer<typeof ReviewedMigrationPlanSchema>;
export const migrationSha256=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'
  ?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,value])=>[k,canonical(value)])):v;

/** A transaction-envelope lexer, not an SQL safety/approval scanner. Treats
 * PostgreSQL strings, dollar bodies, identifiers and nested comments as opaque.
 * Pinned SQL still requires independent review and the restricted target role. */
function migrationParts(sql:string):{body:string;statements:string[]}{
  if(!sql||Buffer.byteLength(sql)>1_048_576||sql.includes('\0'))throw new Error('MIGRATION_SQL_BOUNDARY');
  const statements:Array<{start:number;end:number;tokens:string[]}>=[];
  let i=0,start=0,escapePrefixEnd=-1,tokens:string[]=[];
  const fail=()=>{throw new Error('MIGRATION_SQL_BOUNDARY');};
  // PostgreSQL accepts UTF-8 high bytes in unquoted identifiers, including
  // characters JavaScript calls Unicode whitespace. Only SQL ASCII whitespace
  // separates tokens here; an E suffix in such a name is not E'...'.
  const identStart=(c:string)=>/[A-Za-z_]/.test(c)||c.charCodeAt(0)>=128;
  const identPart=(c:string)=>identStart(c)||/[0-9$]/.test(c);
  while(i<sql.length){
    const c=sql[i]!;
    if(/[ \t\n\r\f\v]/.test(c)){i++;continue;}
    if(sql.startsWith('--',i)){i+=2;while(i<sql.length&&sql[i]!=='\n'&&sql[i]!=='\r')i++;continue;}
    if(sql.startsWith('/*',i)){
      let depth=1;i+=2;
      while(i<sql.length&&depth){
        if(sql.startsWith('/*',i)){if(++depth>32)fail();i+=2;}
        else if(sql.startsWith('*/',i)){depth--;i+=2;}else i++;
      }
      if(depth)fail();continue;
    }
    if(c==="'"||c==='"'){
      const escaped=c==="'"&&escapePrefixEnd===i;
      tokens.push('QUOTED');i++;let closed=false;
      while(i<sql.length){
        if(escaped&&sql[i]==='\\'){i+=2;continue;}
        if(sql[i]===c){if(sql[i+1]===c){i+=2;continue;}i++;closed=true;break;}i++;
      }
      if(!closed)fail();continue;
    }
    if(c==='$'){
      let end=i+1;
      if(sql[end]!=='$'&&end<sql.length&&identStart(sql[end]!)){
        end++;while(end<sql.length&&sql[end]!=='$'&&identPart(sql[end]!))end++;
      }
      const tag=sql[end]==='$'?sql.slice(i,end+1):undefined;
      if(tag){const end=sql.indexOf(tag,i+tag.length);if(end<0)fail();tokens.push('QUOTED');i=end+tag.length;continue;}
    }
    if(c===';'){if(tokens.length)statements.push({start,end:i+1,tokens});tokens=[];start=++i;continue;}
    if(identStart(c)){const from=i++;while(i<sql.length&&identPart(sql[i]!))i++;const word=sql.slice(from,i);
      tokens.push(word.toUpperCase());if(word==='E'||word==='e')escapePrefixEnd=i;}
    else{tokens.push(c);i++;}
  }
  if(tokens.length||!statements.length)fail();
  const first=statements[0]!,last=statements[statements.length-1]!;
  const wrapped=first.tokens.length===1&&first.tokens[0]==='BEGIN';
  if(wrapped&&(statements.length<3||last.tokens.length!==1||last.tokens[0]!=='COMMIT'))fail();
  const body=wrapped?statements.slice(1,-1):statements;
  // Session settings could change quoting/role/timeout semantics assumed by the
  // enclosing runner. Function-local SET clauses remain inside CREATE statements.
  const controls=new Set(['BEGIN','START','COMMIT','END','ROLLBACK','ABORT','PREPARE','SAVEPOINT','RELEASE','SET','RESET','DISCARD']);
  if(body.some(statement=>controls.has(statement.tokens[0]!)))fail();
  return {body:wrapped?sql.slice(first.end,last.start):sql,statements:body.map(statement=>sql.slice(statement.start,statement.end))};
}
export const migrationTransactionBody=(sql:string)=>migrationParts(sql).body;

export interface CompiledMigrationPlan {plan:ReviewedMigrationPlan;sha256:string;files:Array<{path:string;sha256:string;statements:string[]}>}
/** Reads only exact flat infra/sql paths. Captured immutable bytes are what the
 * runner executes; no later filesystem race can replace reviewed SQL. */
export async function compileMigrationPlan(workspace:string,raw:unknown):Promise<CompiledMigrationPlan>{
  const plan=ReviewedMigrationPlanSchema.parse(raw),root=await realpath(workspace),sqlRoot=resolve(root,'infra','sql');
  const actualRoot=await realpath(sqlRoot);
  if(actualRoot!==sqlRoot)throw new Error('MIGRATION_PATH_DENIED');
  const files:CompiledMigrationPlan['files']=[];let total=0;
  for(const pin of plan.files){
    const path=resolve(root,...pin.path.split('/')),rel=relative(sqlRoot,path);
    if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep)||(await lstat(path)).isSymbolicLink()
      ||await realpath(path)!==path)throw new Error('MIGRATION_PATH_DENIED');
    const stat=await lstat(path);if(!stat.isFile()||stat.size>1_048_576)throw new Error('MIGRATION_FILE_DENIED');
    const bytes=await readFile(path);total+=bytes.length;
    if(total>4_194_304||migrationSha256(bytes)!==pin.sha256)throw new Error('MIGRATION_HASH_MISMATCH');
    const sql=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
    if(sql.charCodeAt(0)===0xfeff)throw new Error('MIGRATION_FILE_DENIED');
    files.push({...pin,statements:migrationParts(sql).statements});
  }
  return {plan,sha256:migrationSha256(JSON.stringify(canonical(plan))),files};
}
