import {z} from 'zod';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';

const Token=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const Hash=z.string().regex(/^[a-f0-9]{64}$/);
// Integer micro-KRW. This is a local accounting ceiling, not a provider tariff.
const Units=z.number().int().nonnegative().max(1_000_000_000_000);
// Actual verified spend may exceed quote/cap. Preserve exact safe integers; never clamp.
const ActualUnits=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Identity=z.strictObject({phaseId:Token,jobId:z.uuid(),requestSha256:Hash});
const Reserve=z.strictObject({phaseId:Token,task:z.enum(['OCR_GENERAL','HCX_005','HCX_007']),
  idempotencyKey:Token,requestSha256:Hash,worstCaseUnits:Units.refine(n=>n>0)});
const Transition=z.discriminatedUnion('action',[
  Identity.extend({action:z.literal('DISPATCHED')}),
  Identity.extend({action:z.literal('UNKNOWN_BILLING')}),
  Identity.extend({action:z.literal('RELEASED')}),
  Identity.extend({action:z.literal('SETTLED'),actualUnits:ActualUnits,receiptSha256:Hash}),
]);
export type AiBudgetReservation=z.infer<typeof Reserve>;
export type AiBudgetTransition=z.infer<typeof Transition>;
export interface AiBudgetEntry {
  jobId:string;state:'RESERVED'|'DISPATCHED'|'UNKNOWN_BILLING'|'RELEASED'|'SETTLED';
  worstCaseUnits:number;chargedUnits:number|null;changed:boolean;
}
export class AiBudgetDenied extends Error {
  constructor(){super('AI budget operation denied');this.name='AiBudgetDenied';}
}
function units(raw:unknown,actual=false):number {
  if(typeof raw!=='number'&&(typeof raw!=='string'||!/^\d+$/.test(raw)))throw new AiBudgetDenied();
  return (actual?ActualUnits:Units).parse(Number(raw));
}
function entry(rows:Record<string,unknown>[]):AiBudgetEntry {
  if(rows.length!==1)throw new AiBudgetDenied();
  const r=rows[0]!;
  const result={jobId:z.uuid().parse(r.job_id),
    state:z.enum(['RESERVED','DISPATCHED','UNKNOWN_BILLING','RELEASED','SETTLED']).parse(r.state),
    worstCaseUnits:units(r.worst_case_units),chargedUnits:r.charged_units===null?null:units(r.charged_units,true),
    changed:z.boolean().parse(r.changed)};
  if(result.worstCaseUnits<=0||(result.state==='SETTLED')!==(result.chargedUnits!==null))throw new AiBudgetDenied();
  return result;
}

/** Server-only accounting; callers still need current rights/source/consent gates.
 * Does not open a DB, apply migration, calculate price or call any provider. */
export class PostgresAiBudgetLedger {
  constructor(private readonly pool:ReviewerSqlPool){}
  async reserve(authenticatedActorId:string,value:AiBudgetReservation):Promise<AiBudgetEntry>{
    try{
      const v=Reserve.parse(value);Token.parse(authenticatedActorId);
      return await this.run(authenticatedActorId,`SELECT * FROM public.ai_budget_reserve($1,$2,$3,$4,$5)`,
        [v.phaseId,v.task,v.idempotencyKey,v.requestSha256,v.worstCaseUnits],r=>r.worstCaseUnits===v.worstCaseUnits);
    }catch{throw new AiBudgetDenied();}
  }
  async transition(authenticatedActorId:string,value:AiBudgetTransition):Promise<AiBudgetEntry>{
    try{
      const v=Transition.parse(value);Token.parse(authenticatedActorId);
      return await this.run(authenticatedActorId,`SELECT * FROM public.ai_budget_transition($1,$2,$3,$4,$5,$6)`,
        [v.phaseId,v.jobId,v.requestSha256,v.action,v.action==='SETTLED'?v.actualUnits:null,
          v.action==='SETTLED'?v.receiptSha256:null],r=>r.state===v.action
          &&(v.action!=='SETTLED'||r.chargedUnits===v.actualUnits));
    }catch{throw new AiBudgetDenied();}
  }
  private async run(actor:string,sql:string,params:readonly unknown[],valid:(v:AiBudgetEntry)=>boolean){
    const c=await this.pool.connect();
    try{
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.actor_id',$1,true)`,[actor]);
      const result=entry((await c.query(sql,params)).rows);
      if(!valid(result))throw new AiBudgetDenied();
      await c.query('COMMIT');return result;
    }catch{
      try{await c.query('ROLLBACK');}catch{/* Never log connection errors/payloads. */}
      throw new AiBudgetDenied();
    }finally{c.release();}
  }
}
