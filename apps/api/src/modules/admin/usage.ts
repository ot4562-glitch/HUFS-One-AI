import {z} from 'zod';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';

// Integer micro-KRW recorded by the existing reservation/settlement ledger.
// Decimal strings are deliberate: PostgreSQL charged_units is numeric(30,0),
// which may exceed Number.MAX_SAFE_INTEGER and must never be rounded or clamped.
const Decimal=z.string().regex(/^(0|[1-9][0-9]{0,29})$/);
const Actor=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Instant=z.iso.datetime({offset:true});
export const AdminUsagePhaseSchema=z.strictObject({
  phaseId:Actor,
  enabled:z.boolean(),
  startsAt:Instant,
  endsAt:Instant,
  maxUnits:Decimal,
  actorMaxUnits:Decimal,
  maxAttempts:z.number().int().nonnegative(),
  actorMaxAttempts:z.number().int().nonnegative(),
  reservedUnits:Decimal,
  chargedUnits:Decimal,
  attempts:z.number().int().nonnegative(),
  jobs:z.strictObject({
    reserved:Decimal,dispatched:Decimal,unknownBilling:Decimal,released:Decimal,settled:Decimal,
  }),
});
export const AdminUsageReportSchema=z.strictObject({
  asOf:Instant,
  status:z.enum(['READY','NOT_CONFIGURED']),
  unit:z.literal('MICRO_KRW'),
  phases:z.array(AdminUsagePhaseSchema).max(100),
  // The budget ledger has neither verified provider token counts nor error
  // telemetry. Null denotes NOT_COLLECTED, never a falsely asserted zero.
  tokenCount:z.null(),
  errorCount:z.null(),
  metricCoverage:z.strictObject({
    tokens:z.literal('NOT_COLLECTED'),errors:z.literal('NOT_COLLECTED'),
  }),
}).superRefine((report,ctx)=>{
  if((report.phases.length===0)!==(report.status==='NOT_CONFIGURED'))
    ctx.addIssue({code:'custom',message:'Usage status does not match configured phases'});
  if(new Set(report.phases.map(p=>p.phaseId)).size!==report.phases.length)
    ctx.addIssue({code:'custom',message:'Duplicate budget phase'});
});
export type AdminUsageReport=z.infer<typeof AdminUsageReportSchema>;
export interface AdminUsagePort {
  read(input:{actorId:string;now:string}):Promise<AdminUsageReport>;
}

const unavailable=()=>new Error('Admin usage unavailable');
const decimal=(v:unknown):string=>{
  if(typeof v==='bigint')return Decimal.parse(v.toString());
  if(typeof v==='number'&&Number.isSafeInteger(v))return Decimal.parse(String(v));
  return Decimal.parse(v);
};
const integer=(v:unknown):number=>{
  if(typeof v!=='number'&&(typeof v!=='string'||!/^([0-9]+)$/.test(v)))throw unavailable();
  const n=Number(v);
  if(!Number.isSafeInteger(n)||n<0)throw unavailable();
  return n;
};
const instant=(v:unknown):string=>{
  if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.toISOString();
  return Instant.parse(v);
};

/** Requires a separately reviewed, dedicated EXECUTE-only SQL role and migration.
 * Never creates a pool, grants a role, configures a phase or calls a provider. */
export class PostgresAdminUsageReader implements AdminUsagePort {
  constructor(private readonly pool:ReviewerSqlPool){}
  async read(input:{actorId:string;now:string}):Promise<AdminUsageReport>{
    try{Actor.parse(input.actorId);Instant.parse(input.now);}catch{throw unavailable();}
    let connection:Awaited<ReturnType<ReviewerSqlPool['connect']>>;
    try{connection=await this.pool.connect();}catch{throw unavailable();}
    try{
      await connection.query('BEGIN READ ONLY');
      await connection.query("SELECT set_config('app.actor_id',$1,true)",[input.actorId]);
      const rows=(await connection.query('SELECT * FROM public.ai_budget_admin_usage()')).rows;
      if(rows.length>100)throw unavailable();
      const phases=rows.map(row=>AdminUsagePhaseSchema.parse({
        phaseId:row.phase_id,enabled:row.enabled,
        startsAt:instant(row.starts_at),endsAt:instant(row.ends_at),
        maxUnits:decimal(row.max_units),actorMaxUnits:decimal(row.actor_max_units),
        maxAttempts:integer(row.max_attempts),actorMaxAttempts:integer(row.actor_max_attempts),
        reservedUnits:decimal(row.reserved_units),chargedUnits:decimal(row.charged_units),
        attempts:integer(row.attempts),
        jobs:{reserved:decimal(row.jobs_reserved),dispatched:decimal(row.jobs_dispatched),
          unknownBilling:decimal(row.jobs_unknown_billing),released:decimal(row.jobs_released),
          settled:decimal(row.jobs_settled)},
      }));
      const result=AdminUsageReportSchema.parse({
        asOf:input.now,status:phases.length?'READY':'NOT_CONFIGURED',
        unit:'MICRO_KRW',phases,tokenCount:null,errorCount:null,
        metricCoverage:{tokens:'NOT_COLLECTED',errors:'NOT_COLLECTED'},
      });
      await connection.query('COMMIT');
      return result;
    }catch{
      try{await connection.query('ROLLBACK');}catch{/* No database errors or raw rows in logs. */}
      throw unavailable();
    }finally{connection.release();}
  }
}
