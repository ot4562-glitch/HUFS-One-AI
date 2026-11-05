import {z} from 'zod';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import type {VerifiedActor} from '../../types.js';
import {PostgresAiBudgetLedger} from './budget-postgres.js';
import {PostgresProviderAuthority} from './provider-authority-postgres.js';
import type {PostgresProviderAuthorityOptions} from './provider-authority-postgres.js';
import {PostgresProviderResults} from './provider-results-postgres.js';
import {createNodeClovaTransport} from './provider-transport.js';
import type {NodeClovaOptions} from './provider-transport.js';
import {createProviderExecutor} from './provider-runtime.js';
import {PostgresApprovedProviderDirectory} from './provider-approved-directory.js';
import type {ProviderRuntimeOptions} from './provider-runtime.js';

export interface PostgresProviderConfig {
  pools:{authority:ReviewerSqlPool;budget:ReviewerSqlPool;results:ReviewerSqlPool};
  phaseId:string;operation:'OCR_GENERAL'|'HCX_005'|'HCX_007';inputPolicyVersion:string;
  sessionIsCurrent:PostgresProviderAuthorityOptions['sessionIsCurrent'];
  policy:ProviderRuntimeOptions['policy'];secret:NodeClovaOptions['secret'];ocrEndpoint?:string;
  enabled?:()=>boolean;liveApproved?:()=>boolean;now?:()=>string;timeoutMs?:number;
  /** Explicit trusted server transport, for isolated providers/offline tests.
   * Never populated by request fields or environment-based activation. */
  transport?:ProviderRuntimeOptions['transport'];
}
/** Construction has no side effects. Every activation/price/credential is a
 * private server dependency; no environment flag alone manufactures approval. */
export function createPostgresProviderRuntime<O extends PostgresProviderConfig['operation']>(
  config:PostgresProviderConfig & {operation:O}){
  const phaseId=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/).parse(config.phaseId);
  const operation=z.enum(['OCR_GENERAL','HCX_005','HCX_007']).parse(config.operation) as O;
  if(operation==='OCR_GENERAL'&&!config.transport&&!config.ocrEndpoint)
    throw new Error('Reviewed General OCR endpoint required');
  const now=config.now??(()=>new Date().toISOString());
  const authority=new PostgresProviderAuthority(config.pools.authority,{policyVersion:config.inputPolicyVersion,
    sessionIsCurrent:config.sessionIsCurrent,now});
  // General OCR is a privileged processing operation. It is never offered
  // through the student HCX packet discovery endpoint.
  const directory=operation==='OCR_GENERAL'?undefined:new PostgresApprovedProviderDirectory(
    config.pools.authority,authority,phaseId,operation,now);
  const executor=createProviderExecutor({
    enabled:config.enabled??(()=>false),liveApproved:config.liveApproved??(()=>false),now,
    authority,
    ledger:new PostgresAiBudgetLedger(config.pools.budget),results:new PostgresProviderResults(config.pools.results),
    transport:config.transport??createNodeClovaTransport({secret:config.secret,...(config.ocrEndpoint?{ocrEndpoint:config.ocrEndpoint}:{}),
      ...(config.timeoutMs!==undefined?{timeoutMs:config.timeoutMs}:{})}),
    policy:config.policy,...(config.timeoutMs!==undefined?{timeoutMs:config.timeoutMs}:{}),
  });
  return {phaseId,operation,executor,
    // This metadata-only directory does not activate the provider and is empty
    // whenever the explicitly approved runtime is OFF. No browser/ENV override.
    approvedInputs:{list:(actor:VerifiedActor)=>
      (directory&&config.enabled?.()===true&&config.liveApproved?.()===true)
        ?directory.list(actor):Promise.resolve({items:[]})},
  };
}
