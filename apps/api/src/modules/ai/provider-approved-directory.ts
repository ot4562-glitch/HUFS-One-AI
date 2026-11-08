import {z} from 'zod';
import {ApprovedProviderInputsSchema,type ApprovedProviderInputs} from '@hufs-one/contracts';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import type {VerifiedActor} from '../../types.js';
import type {PostgresProviderAuthority} from './provider-authority-postgres.js';
import {authorizeSession} from '../auth/gates.js';

const Ref=z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/);
const Operation=z.literal('HCX_007');
const Iso=z.iso.datetime({offset:true});
const metadata=z.strictObject({
  input_ref:z.string().regex(/^[A-Za-z0-9_-]{1,90}$/),
  operation:Operation,as_of:Iso,
});
/** Bounded metadata discovery. Each current item is revalidated via the
 * full approval/consent/source/rights/session authority before listing. */
export class PostgresApprovedProviderDirectory {
  constructor(
    private readonly pool:ReviewerSqlPool,
    private readonly authority:Pick<PostgresProviderAuthority,'read'>,
    private readonly phaseId:string,
    private readonly operation:'HCX_007',
    private readonly now:()=>string=()=>new Date().toISOString(),
  ){Ref.parse(phaseId);Operation.parse(operation);}
  async list(actor:VerifiedActor):Promise<ApprovedProviderInputs>{
    const time=Iso.parse(this.now());
    if(actor.role!=='BETA')throw Error('Unavailable');
    authorizeSession(actor,time);
    const connection=await this.pool.connect();
    let begun=false;
    let rows:Record<string,unknown>[]=[];
    try{
      await connection.query('BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ ONLY');
      begun=true;
      await connection.query("SET LOCAL statement_timeout='5s'");
      await connection.query("SELECT set_config('hufs.self_actor',$1,true)",[actor.actorId]);
      rows=(await connection.query(
        'SELECT p.input_ref,p.operation,p.as_of FROM api_ai_provider_input_heads h '+
        'JOIN api_ai_provider_inputs p ON p.projection_id=h.projection_id '+
        'AND p.actor_id=h.actor_id AND p.input_ref=h.input_ref AND p.operation=h.operation '+
        'WHERE h.actor_id=$1 AND h.operation=$2 AND p.erased_at IS NULL '+
        'AND p.as_of<=clock_timestamp() AND p.expires_at>clock_timestamp() '+
        'ORDER BY p.input_ref LIMIT 16',
        [actor.actorId,this.operation])).rows;
      await connection.query('COMMIT');begun=false;
    }catch{
      if(begun)try{await connection.query('ROLLBACK');}catch{/* no raw/SQL logging */}
      throw Error('Unavailable');
    }finally{connection.release();}
    const items:ApprovedProviderInputs['items']=[];
    try {
      for(const raw of rows){
        const row=metadata.parse({...raw,as_of:raw.as_of instanceof Date
          ?raw.as_of.toISOString():raw.as_of});
        const snapshot=await this.authority.read({
          actor,inputRef:row.input_ref,operation:row.operation,asOf:row.as_of,
          phaseId:this.phaseId,idempotencyKey:'DISCOVERY0001',now:Iso.parse(this.now()),
        });
        if(!snapshot?.packet)continue;
        items.push({inputRef:row.input_ref,operation:row.operation,asOf:row.as_of,
          expiresAt:snapshot.expiresAt,task:snapshot.packet.task});
      }
      authorizeSession(actor,Iso.parse(this.now()));
      return ApprovedProviderInputsSchema.parse({items});
    }catch{throw Error('Unavailable');}
  }
}
