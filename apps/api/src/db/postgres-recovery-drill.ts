import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {z} from 'zod';
import {recoveryFingerprint,recoverySqlContext} from './postgres-recovery-fingerprint.js';
import type {RecoveryConnection,RecoveryPool} from './postgres-recovery-fingerprint.js';
const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),Hash=z.string().regex(/^[a-f0-9]{64}$/);
export const RecoveryEndpointSchema=z.strictObject({database:z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,62}$/),
  role:z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,62}$/),address:z.string().refine(v=>isIP(v)>0),port:z.number().int().min(1).max(65535),
  serverAddress:z.string().refine(v=>isIP(v)>0).optional(),serverPort:z.number().int().min(1).max(65535).optional(),requireTls:z.boolean(),bypassRls:z.boolean(),
  credentialsRef:Ref,tlsServerName:z.string().regex(/^[a-z0-9.-]{1,253}$/).optional()});
export const RecoveryDrillPlanSchema=z.strictObject({version:z.literal(1),drillId:Ref,approvalRef:Ref,
  source:RecoveryEndpointSchema,target:RecoveryEndpointSchema,transferPolicySha256:Hash,maxArchiveBytes:z.number().int().min(1024).max(134217728),
  timeoutMs:z.number().int().min(100).max(120000),maxTables:z.number().int().min(1).max(128).default(128),maxRows:z.number().int().min(1).max(50000).default(50000),
}).superRefine((p,c)=>{
  if(p.source.database===p.target.database)c.addIssue({code:'custom',message:'A distinct fresh drill database name is required'});
  for(const e of [p.source,p.target])if(['postgres','template0','template1'].includes(e.database)||(!['127.0.0.1','::1'].includes(e.address)&&!e.requireTls))
    c.addIssue({code:'custom',message:'Private explicit recovery endpoint required'});
});
export type RecoveryDrillPlan=z.infer<typeof RecoveryDrillPlanSchema>;
export type RecoveryEndpoint=RecoveryDrillPlan['source'];
type ApprovalInput={planSha256:string;plan:RecoveryDrillPlan;now:string};
export interface RecoveryDrillApproval {
  authorize(input:ApprovalInput):Promise<{allowed:boolean;receipt?:string}>;
  revalidate(input:ApprovalInput&{receipt:string}):Promise<boolean>;
}
export interface RecoveryTransfer {
  run(input:{plan:RecoveryDrillPlan;planSha256:string;snapshot:string;signal:AbortSignal;authorizeLaunch:()=>Promise<void>}):Promise<{sha256:string;bytes:number}>;
}
export class RecoveryDrillError extends Error {
  constructor(readonly code:string,readonly targetState='QUARANTINED_UNCONFIRMED'){super('PostgreSQL recovery drill unavailable');this.name='RecoveryDrillError';}
}
function deny(code:string):never{throw new RecoveryDrillError(code);}
export const recoveryPlanSha256=(v:unknown)=>createHash('sha256').update(JSON.stringify(RecoveryDrillPlanSchema.parse(v))).digest('hex');
async function authorized<T>(read:()=>Promise<T>,signal:AbortSignal):Promise<T>{
  if(signal.aborted)deny('DRILL_ABORTED');let cancel:()=>void=()=>{};
  try{return await Promise.race([Promise.resolve().then(read),new Promise<never>((_,reject)=>{
    cancel=()=>reject(new RecoveryDrillError('DRILL_ABORTED'));signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
  })]);}finally{signal.removeEventListener('abort',cancel);}
}
async function identity(c:RecoveryConnection,e:RecoveryEndpoint){
  const result=await c.query(`SELECT current_database() AS database,current_user AS role,session_user AS session_role,host(inet_server_addr()) AS address,
    inet_server_port() AS port,current_setting('server_version_num')::int AS version,current_setting('server_encoding') AS encoding,
    r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolbypassrls,
    COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),false) AS tls,
    d.datcollate,d.datctype,d.datdba=r.oid AS owned FROM pg_roles r,pg_database d WHERE r.rolname=current_user AND d.datname=current_database()`);
  const row=result.rows[0];if(result.rows.length!==1||!row||row.database!==e.database||row.role!==e.role||row.session_role!==e.role
    ||row.address!==(e.serverAddress??e.address)||row.port!==(e.serverPort??e.port)||typeof row.version!=='number'||row.version<140000||row.encoding!=='UTF8'
    ||row.rolsuper!==false||row.rolcreaterole!==false||row.rolcreatedb!==false||row.rolbypassrls!==e.bypassRls||e.requireTls&&row.tls!==true)deny('TARGET_BINDING_DENIED');
  return {version:row.version,collate:row.datcollate,ctype:row.datctype,owned:row.owned};
}
/** Explicit streaming logical export/restore drill, not retained backup storage.
 * A restored DB remains isolated: no owner/ACL/global-role or current erasure
 * reconciliation is asserted and no application/worker is ever activated. */
export function createPostgresRecoveryDrill(options:{plan:unknown;source:RecoveryPool;target:RecoveryPool;transfer:RecoveryTransfer;approval?:RecoveryDrillApproval;now?:()=>string}){
  const plan=RecoveryDrillPlanSchema.parse(options.plan),planSha256=recoveryPlanSha256(plan),clock=options.now??(()=>new Date().toISOString());let active=false;
  const auth=():ApprovalInput=>({planSha256,plan:structuredClone(plan),now:z.iso.datetime({offset:true}).parse(clock())});
  return {async run(){
    if(active)deny('DRILL_BUSY');const approval=options.approval;if(!approval)deny('APPROVAL_REQUIRED');
    active=true;const abort=new AbortController();let source:RecoveryConnection|undefined,target:RecoveryConnection|undefined,transaction=false,held=false;
    let timer:ReturnType<typeof setTimeout>|undefined,monitor:ReturnType<typeof setInterval>|undefined,polling=false;
    let stopUnconfirmed=false;
    let receipt:string|undefined;
    const current=async()=>{const allowed=await authorized(()=>approval!.revalidate({...auth(),receipt:receipt!}),abort.signal);
      if(abort.signal.aborted||allowed!==true)deny('APPROVAL_REVOKED');};
    try{
      timer=setTimeout(()=>abort.abort(),plan.timeoutMs);
      const granted=await authorized(()=>approval!.authorize(auth()),abort.signal);
      if(granted.allowed!==true||!Ref.safeParse(granted.receipt).success)deny('APPROVAL_REQUIRED');receipt=granted.receipt;
      source=await options.source.connect();target=await options.target.connect();await recoverySqlContext(source,Math.min(plan.timeoutMs,15000));await recoverySqlContext(target,Math.min(plan.timeoutMs,15000));
      const original=await identity(source,plan.source),destination=await identity(target,plan.target);
      if(original.version!==destination.version||original.collate!==destination.collate||original.ctype!==destination.ctype||destination.owned!==true)deny('TARGET_BINDING_DENIED');
      const isolation=await target.query(`SELECT
        (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema')+
        (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema')+
        (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema')+
        (SELECT count(*) FROM pg_namespace WHERE nspname<>'public' AND nspname<>'information_schema' AND nspname !~ '^pg_')+
        (SELECT count(*) FROM pg_extension WHERE extname<>'plpgsql')+(SELECT count(*) FROM pg_event_trigger)+
        (SELECT count(*) FROM pg_largeobject_metadata)+(SELECT count(*) FROM pg_publication)+
        (SELECT count(*) FROM pg_subscription WHERE subdbid=(SELECT oid FROM pg_database WHERE datname=current_database())) AS objects,
        (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) AS peers,
        (SELECT count(*) FROM pg_database d CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a
          WHERE d.datname=current_database() AND a.privilege_type='CONNECT' AND a.grantee<>d.datdba) AS others,
        (SELECT count(*) FROM pg_roles r WHERE r.rolname<>current_user AND NOT r.rolsuper
          AND pg_has_role(r.oid,(SELECT oid FROM pg_roles WHERE rolname=current_user),'MEMBER')) AS members`);
      if(isolation.rows.length!==1||['objects','peers','others','members'].some(k=>Number(isolation.rows[0]?.[k])!==0))deny('TARGET_NOT_FRESH_ISOLATED');
      const guard=await target.query('SELECT pg_try_advisory_lock(64091011,(SELECT oid::int FROM pg_database WHERE datname=current_database())) AS acquired');
      if(guard.rows.length!==1||guard.rows[0]?.acquired!==true)deny('DRILL_BUSY');held=true;
      await current();await source.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');transaction=true;
      const snapshot=await source.query('SELECT pg_export_snapshot() AS snapshot,transaction_timestamp() AS at');
      const state=z.array(z.object({snapshot:z.string().regex(/^[0-9A-Fa-f-]{1,64}$/),at:z.preprocess(v=>v instanceof Date?v.toISOString():v,z.iso.datetime({offset:true}))})).length(1).parse(snapshot.rows)[0]!;
      const before=await recoveryFingerprint(source,plan,abort.signal);await current();
      monitor=setInterval(()=>{if(polling)return;polling=true;void current().catch(()=>abort.abort()).finally(()=>{polling=false;});},250);
      const transfer=await options.transfer.run({plan:structuredClone(plan),planSha256,snapshot:state.snapshot,signal:abort.signal,authorizeLaunch:current});
      if(abort.signal.aborted)deny('TRANSFER_ABORTED');Hash.parse(transfer.sha256);
      if(!Number.isSafeInteger(transfer.bytes)||transfer.bytes<=0||transfer.bytes>plan.maxArchiveBytes)deny('TRANSFER_BOUND_EXCEEDED');
      await current();await recoverySqlContext(target,Math.min(plan.timeoutMs,15000));await identity(target,plan.target);const after=await recoveryFingerprint(target,plan,abort.signal);
      if(before.sha256!==after.sha256)deny('RESTORE_MISMATCH');await current();
      return {state:'VERIFIED_QUARANTINED' as const,planSha256,archiveSha256:transfer.sha256,archiveBytes:transfer.bytes,
        fingerprint:before.sha256,tableCount:before.tableCount,rowCount:before.rowCount,asOf:state.at,
        retainedBackup:false,ownershipAndAclRestored:false,currentErasureStateReconciled:false,release:'RELEASE_BLOCKED' as const};
    }catch(error){stopUnconfirmed=error instanceof RecoveryDrillError&&error.code==='STOP_UNCONFIRMED';abort.abort();
      throw error instanceof RecoveryDrillError?error:new RecoveryDrillError('DRILL_UNAVAILABLE');}
    finally{
      abort.abort();if(timer)clearTimeout(timer);if(monitor)clearInterval(monitor);
      if(source&&transaction)try{await source.query('ROLLBACK');}catch{/* discard */}
      if(target&&held&&!stopUnconfirmed)try{await target.query('SELECT pg_advisory_unlock(64091011,(SELECT oid::int FROM pg_database WHERE datname=current_database()))');}catch{/* discard */}
      source?.release(new Error('Recovery snapshot connection discarded'));
      if(!stopUnconfirmed)target?.release(new Error('Recovery controller connection discarded'));
      // Never free the execution fence while a native process may still run.
      // Unknown stop requires operator recovery, not an automatic second drill.
      active=stopUnconfirmed;
    }
  }};
}
