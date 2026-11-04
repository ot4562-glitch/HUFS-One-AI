import {createHash} from 'node:crypto';
import {z} from 'zod';
export interface RecoveryConnection {
  query(sql:string,params?:readonly unknown[]):Promise<{rows:Record<string,unknown>[]}>;
  release(error?:Error):void;
}
export interface RecoveryPool {connect():Promise<RecoveryConnection>}
const Hash=z.string().regex(/^[a-f0-9]{64}$/),Name=z.string().min(1).max(63);
const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const quote=(value:string)=>'"'+Name.parse(value).replaceAll('"','""')+'"';
export async function recoverySqlContext(c:RecoveryConnection,timeoutMs=15000){
  const timeout=z.number().int().min(1).max(15000).parse(timeoutMs);
  await c.query(`SET statement_timeout='${timeout}ms';SET lock_timeout='3s';SET standard_conforming_strings='on';SET client_encoding='UTF8';SET search_path=public;SET timezone='UTC';SET datestyle='ISO,YMD';SET intervalstyle='postgres';SET extra_float_digits=3;SET row_security=off;`);
}
/** Logical public-schema proof only. Hashes are produced inside PostgreSQL;
 * original row values and function bodies never leave the database. Owners,
 * ACLs, global roles and erasure reconciliation are intentionally NOT attested. */
export async function recoveryFingerprint(c:RecoveryConnection,limits:{maxTables:number;maxRows:number},signal?:AbortSignal){
  const read=async(sql:string,params:readonly unknown[]=[])=>{signal?.throwIfAborted();const result=await c.query(sql,params);signal?.throwIfAborted();return result;};
  const unsupported=await read(`SELECT
    (SELECT count(*) FROM pg_namespace WHERE nspname<>'public' AND nspname<>'information_schema' AND nspname !~ '^pg_')+
    (SELECT count(*) FROM pg_extension WHERE extname<>'plpgsql')+
    (SELECT count(*) FROM pg_foreign_table)+(SELECT count(*) FROM pg_event_trigger)+
    (SELECT count(*) FROM pg_publication)+(SELECT count(*) FROM pg_subscription WHERE subdbid=(SELECT oid FROM pg_database WHERE datname=current_database()))+
    (SELECT count(*) FROM pg_largeobject_metadata)+(SELECT count(*) FROM pg_seclabel)+
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('m','c'))+
    (SELECT count(*) FROM pg_collation c JOIN pg_namespace n ON n.oid=c.collnamespace WHERE n.nspname='public')+
    (SELECT count(*) FROM pg_operator c JOIN pg_namespace n ON n.oid=c.oprnamespace WHERE n.nspname='public')+
    (SELECT count(*) FROM pg_opclass c JOIN pg_namespace n ON n.oid=c.opcnamespace WHERE n.nspname='public')+
    (SELECT count(*) FROM pg_opfamily c JOIN pg_namespace n ON n.oid=c.opfnamespace WHERE n.nspname='public')+
    (SELECT count(*) FROM pg_conversion c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public')+
    (SELECT count(*) FROM pg_ts_config c JOIN pg_namespace n ON n.oid=c.cfgnamespace WHERE n.nspname='public')+
    (SELECT count(*) FROM pg_ts_dict c JOIN pg_namespace n ON n.oid=c.dictnamespace WHERE n.nspname='public')+
    (SELECT count(*) FROM pg_ts_parser c JOIN pg_namespace n ON n.oid=c.prsnamespace WHERE n.nspname='public')+
    (SELECT count(*) FROM pg_ts_template c JOIN pg_namespace n ON n.oid=c.tmplnamespace WHERE n.nspname='public')+
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind NOT IN ('f','p'))+
    (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype IN ('r','m')) AS n`);
  if(unsupported.rows.length!==1||Number(unsupported.rows[0]?.n)!==0)throw new Error('RECOVERY_UNSUPPORTED_SCHEMA');
  const tables=await read(`SELECT c.relname AS name,c.relkind AS kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','S') ORDER BY c.relname COLLATE "C" LIMIT $1`,[limits.maxTables+1]);
  const names=z.array(z.object({name:Name,kind:z.enum(['r','p','S'])})).max(limits.maxTables).parse(tables.rows);
  const catalog=await read(`WITH objects AS (
    SELECT 'relation' AS kind,c.relname::text AS name,jsonb_build_object('kind',c.relkind,'persistence',c.relpersistence,
      'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'options',c.reloptions,
      'parents',ARRAY(SELECT i.inhparent::regclass::text FROM pg_inherits i WHERE i.inhrelid=c.oid ORDER BY 1),
      'partition',CASE WHEN c.relispartition THEN pg_get_expr(c.relpartbound,c.oid,true) ELSE NULL END,
      'comment',obj_description(c.oid,'pg_class'),
      'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
        'notnull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
      'view',CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) ELSE NULL END,
      'sequence',(SELECT jsonb_build_object('type',format_type(s.seqtypid,NULL),'start',s.seqstart::text,'increment',s.seqincrement::text,
        'min',s.seqmin::text,'max',s.seqmax::text,'cache',s.seqcache::text,'cycle',s.seqcycle) FROM pg_sequence s WHERE s.seqrelid=c.oid)) AS definition
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')
    UNION ALL SELECT 'constraint',jsonb_build_array(CASE WHEN c.conrelid<>0 THEN c.conrelid::regclass::text ELSE c.contypid::regtype::text END,c.conname)::text,
      jsonb_build_object('definition',pg_get_constraintdef(c.oid,true),'validated',c.convalidated,'deferrable',c.condeferrable,'deferred',c.condeferred)
      FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'
    UNION ALL SELECT 'index',c.relname::text,to_jsonb(pg_get_indexdef(c.oid)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='i'
    UNION ALL SELECT 'policy',jsonb_build_array(p.polrelid::regclass::text,p.polname)::text,
      jsonb_build_object('cmd',p.polcmd,'permissive',p.polpermissive,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid),
        'roles',ARRAY(SELECT CASE WHEN role=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role)::text END FROM unnest(p.polroles) role ORDER BY 1))
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    UNION ALL SELECT 'trigger',jsonb_build_array(t.tgrelid::regclass::text,t.tgname)::text,jsonb_build_object('definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled)
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
    UNION ALL SELECT 'rule',jsonb_build_array(r.ev_class::regclass::text,r.rulename)::text,to_jsonb(pg_get_ruledef(r.oid,true))
      FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    UNION ALL SELECT 'type',t.typname::text,jsonb_build_object('kind',t.typtype,'base',CASE WHEN t.typtype='d' THEN format_type(t.typbasetype,t.typtypmod) ELSE NULL END,
      'notnull',t.typnotnull,'default',t.typdefault,'enum',ARRAY(SELECT e.enumlabel FROM pg_enum e WHERE e.enumtypid=t.oid ORDER BY e.enumsortorder))
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype IN ('e','d')
    UNION ALL SELECT 'routine',jsonb_build_array(p.proname,pg_get_function_identity_arguments(p.oid))::text,to_jsonb(pg_get_functiondef(p.oid))
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p')
  ) SELECT kind,name,encode(sha256(convert_to(definition::text,'UTF8')),'hex') AS digest FROM objects
    ORDER BY kind COLLATE "C",name COLLATE "C" LIMIT 2049`);
  const objects=z.array(z.object({kind:z.string().max(32),name:z.string().max(1024),digest:Hash})).max(2048).parse(catalog.rows);
  const content:Array<{name:string;kind:string;digest:string;count:number}>=[];let total=0;
  for(const table of names){
    const relation='"public".'+quote(table.name);
    if(table.kind==='S'){
      const state=await read(`SELECT last_value::text AS value,is_called FROM ${relation}`);
      const sequence=z.array(z.object({value:z.string().regex(/^-?[0-9]{1,20}$/),is_called:z.boolean()})).length(1).parse(state.rows);
      content.push({name:table.name,kind:table.kind,digest:sha(sequence),count:0});continue;
    }
    const rows=await read(`SELECT h FROM (SELECT encode(sha256(convert_to(row_to_json(t)::text,'UTF8')),'hex') AS h
      FROM ONLY ${relation} t) hashed ORDER BY h COLLATE "C" LIMIT $1`,[limits.maxRows-total+1]);
    const hashes=z.array(z.object({h:Hash})).max(limits.maxRows-total).parse(rows.rows);
    total+=hashes.length;content.push({name:table.name,kind:table.kind,digest:sha(hashes),count:hashes.length});
  }
  return {sha256:sha({objects,content}),tableCount:names.filter(n=>n.kind!=='S').length,rowCount:total};
}
