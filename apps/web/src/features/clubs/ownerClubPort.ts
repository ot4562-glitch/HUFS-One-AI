import {z} from 'zod';
import type {HufsOwnerApiClient} from '../../integrations/owner-api-client.js';
import {HufsApiError,requireMatchingReceipt} from '../../integrations/api-error.js';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';
import type {OwnerClubPort} from './OwnerClubBoard.js';
import type {ClubModerationPort} from './ClubModerationPanel.js';

export function createOwnerClubPort(api:HufsOwnerApiClient,session:OwnerSessionController):OwnerClubPort{
  return {session,list:signal=>api.listSyntheticClubs(signal),detail:(id,signal)=>api.getSyntheticClub(id,signal)};
}
const Admin=z.strictObject({actorId:z.string().min(1),role:z.literal('ADMIN'),
  schoolMailProofValid:z.literal(true),betaAllowed:z.literal(true)});
type AdminClient={owner:Pick<HufsOwnerApiClient,'listSyntheticClubModeration'|'createSyntheticClub'|'editSyntheticClub'|'decideSyntheticClub'>;
  getSession(signal?:AbortSignal):Promise<unknown>};
/** Browser rendering still requires independent API authority and a durable grant. */
export function createClubModerationPort(api:AdminClient):ClubModerationPort{
  let actor:string|null=null;
  const current=async(signal?:AbortSignal)=>{
    if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
    const parsed=Admin.safeParse(await api.getSession(signal));
    if(!parsed.success)throw new HufsApiError('FORBIDDEN',403);
    if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
    if(actor!==null&&actor!==parsed.data.actorId)throw new HufsApiError('UNAUTHENTICATED',401);
    actor=parsed.data.actorId;return actor;
  };
  const guarded=async<T>(perform:(actor:string)=>Promise<T>,signal?:AbortSignal):Promise<T>=>{
    const before=await current(signal),result=await perform(before);
    if(await current(signal)!==before)throw new HufsApiError('UNAUTHENTICATED',401);return result;
  };
  return {
    list:signal=>guarded(()=>api.owner.listSyntheticClubModeration(signal),signal),
    create:(input,signal)=>guarded(async actor=>{
      const result=await api.owner.createSyntheticClub(input,signal);
      requireMatchingReceipt(result.record.lastActor.actorId===actor);return result;
    },signal),
    edit:(id,input,signal)=>guarded(async actor=>{
      const result=await api.owner.editSyntheticClub(id,input,signal);
      requireMatchingReceipt(result.record.lastActor.actorId===actor);return result;
    },signal),
    decide:(id,input,signal)=>guarded(()=>api.owner.decideSyntheticClub(id,input,signal),signal),
  };
}
