/**
 * #445/#449 Enforced operator-only preflight for optional native acquisition.
 * Nothing here fetches pages, grants source rights or reserves an NCP budget.
 * The private operator's current source/robots/terms/budget snapshot MUST be
 * loaded independently, not supplied by the crawler or HTTP client.
 */
import {NcpIngestionDraft} from '@hufs-one/contracts';

export interface TrustedSourceRefreshPreflight {
  loadCurrent(input:{
    sourceId:string;permissionRef:string;canonicalUrl:string;now:string;
  }):Promise<unknown>;
}
const denied=():never=>{throw new Error('Approved source preflight blocked');};

/** Fail closed on unbound, future, stale, out-of-scope or exhausted evidence.
 * READY_FOR_OPERATOR_RECHECK is only an admission screen, not rights/egress
 * authority. Existing exact URL, current rights and pinned DNS/TLS checks
 * remain mandatory independently of this result.
 */
export async function requireCurrentSourceRefreshPreflight(
  preflight:TrustedSourceRefreshPreflight,input:{
    sourceId:string;permissionRef:string;canonicalUrl:string;now:string;
  },
):Promise<void>{
  try{
    if(typeof preflight?.loadCurrent!=='function')denied();
    const raw=await preflight.loadCurrent(input);
    const parsed=NcpIngestionDraft.SourceRefreshPreflightDraftSchema.safeParse(raw);
    if(!parsed.success)denied();
    const value=parsed.data;
    if(value.registration.sourceId!==input.sourceId
      ||value.scope.sourceId!==input.sourceId
      ||value.registration.permissionRef!==input.permissionRef
      ||value.registration.canonicalUrl!==input.canonicalUrl
      ||value.pageUrl!==input.canonicalUrl
      ||value.now!==input.now
      ||value.scope.approvedOrigin!==new URL(input.canonicalUrl).origin+'/' )denied();
    const outcome=NcpIngestionDraft.evaluateSourceRefreshPreflight(value);
    if(outcome.state!=='READY_FOR_OPERATOR_RECHECK')denied();
  }catch{
    // No raw URL/source record, budget counts, provider error or credential in
    // operator logs; denial must never fall back to an unguarded HTTP fetch.
    denied();
  }
}
