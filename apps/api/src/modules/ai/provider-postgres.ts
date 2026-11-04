import {z} from 'zod';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import {PostgresAiBudgetLedger} from './budget-postgres.js';
import {PostgresProviderAuthority} from './provider-authority-postgres.js';
import type {PostgresProviderAuthorityOptions} from './provider-authority-postgres.js';
import {PostgresProviderResults} from './provider-results-postgres.js';
import {createNodeClovaTransport} from './provider-transport.js';
import type {NodeClovaOptions} from './provider-transport.js';
import {createProviderExecutor} from './provider-runtime.js';
import type {ProviderRuntimeOptions} from './provider-runtime.js';

export interface PostgresProviderConfig {
  pools:{authority:ReviewerSqlPool;budget:ReviewerSqlPool;results:ReviewerSqlPool};
  phaseId:string;operation:'HCX_005'|'HCX_007';inputPolicyVersion:string;
  sessionIsCurrent:PostgresProviderAuthorityOptions['sessionIsCurrent'];
  policy:ProviderRuntimeOptions['policy'];secret:NodeClovaOptions['secret'];ocrEndpoint?:string;
  enabled?:()=>boolean;liveApproved?:()=>boolean;now?:()=>string;timeoutMs?:number;
  /** Explicit trusted server transport, for isolated providers/offline tests.
   * Never populated by request fields or environment-based activation. */
  transport?:ProviderRuntimeOptions['transport'];
}
/** Construction has no side effects. Every activation/price/credential is a
 * private server dependency; no environment flag alone manufactures approval. */
export function createPostgresProviderRuntime(config:PostgresProviderConfig){
  const phaseId=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/).parse(config.phaseId);
  const operation=z.enum(['HCX_005','HCX_007']).parse(config.operation);
  const now=config.now??(()=>new Date().toISOString());
  const executor=createProviderExecutor({
    enabled:config.enabled??(()=>false),liveApproved:config.liveApproved??(()=>false),now,
    authority:new PostgresProviderAuthority(config.pools.authority,{policyVersion:config.inputPolicyVersion,
      sessionIsCurrent:config.sessionIsCurrent,now}),
    ledger:new PostgresAiBudgetLedger(config.pools.budget),results:new PostgresProviderResults(config.pools.results),
    transport:config.transport??createNodeClovaTransport({secret:config.secret,...(config.ocrEndpoint?{ocrEndpoint:config.ocrEndpoint}:{}),
      ...(config.timeoutMs!==undefined?{timeoutMs:config.timeoutMs}:{})}),
    policy:config.policy,...(config.timeoutMs!==undefined?{timeoutMs:config.timeoutMs}:{}),
  });
  return {phaseId,operation,executor};
}
