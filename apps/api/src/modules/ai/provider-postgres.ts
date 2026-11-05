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
  enabled?:()=>boolean;
  /** Optional live emergency pause; project approval is already owner-confirmed.
   * No request/browser flag may supply this server-owned control. */
  liveApproved?:()=>boolean;
  now?:()=>string;timeoutMs?:number;
  transport?:ProviderRuntimeOptions['transport'];
}
/** Construction never reads credentials or invokes a provider. Actual enablement
 * is explicit server configuration, not a repeated project approval request.
 * Per-input actor/session/source/consent and budget checks remain mandatory. */
export function createPostgresProviderRuntime<O extends PostgresProviderConfig['operation']>(
  config:PostgresProviderConfig & {operation:O}){
  const phaseId=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/).parse(config.phaseId);
  const operation=z.enum(['OCR_GENERAL','HCX_005','HCX_007']).parse(config.operation) as O;
  if(operation==='OCR_GENERAL'&&!config.transport&&!config.ocrEndpoint)
    throw new Error('Configured General OCR endpoint required');
  const now=config.now??(()=>new Date().toISOString());
  const enabled=config.enabled??(()=>false);
  const liveApproved=config.liveApproved??(()=>true);
  const authority=new PostgresProviderAuthority(config.pools.authority,{policyVersion:config.inputPolicyVersion,
    sessionIsCurrent:config.sessionIsCurrent,now});
  const directory=operation==='OCR_GENERAL'?undefined:new PostgresApprovedProviderDirectory(
    config.pools.authority,authority,phaseId,operation,now);
  const executor=createProviderExecutor({enabled,liveApproved,now,authority,
    ledger:new PostgresAiBudgetLedger(config.pools.budget),results:new PostgresProviderResults(config.pools.results),
    transport:config.transport??createNodeClovaTransport({secret:config.secret,...(config.ocrEndpoint?{ocrEndpoint:config.ocrEndpoint}:{}),
      ...(config.timeoutMs!==undefined?{timeoutMs:config.timeoutMs}:{})}),
    policy:config.policy,...(config.timeoutMs!==undefined?{timeoutMs:config.timeoutMs}:{}),
  });
  return {phaseId,operation,executor,
    // Discovery remains actor-scoped and metadata-only. It neither executes a
    // model nor turns project authorization into permission for another user.
    approvedInputs:{list:(actor:VerifiedActor)=>
      (directory&&enabled()===true&&liveApproved()===true)
        ?directory.list(actor):Promise.resolve({items:[]})},
  };
}
