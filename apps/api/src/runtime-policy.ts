/** Project approval is owner-confirmed. Runtime readiness is a separate fact:
 * authorization does not create a session, credentials, a DB connection or a
 * successful test. This policy replaces the unconditional production embargo.
 */
export const PROJECT_AUTHORIZATION = 'OWNER_CONFIRMED_APPROVED' as const;
export type RuntimeMode = 'production';

interface RuntimeDependencies {
  runtime?:RuntimeMode;
  allowedOrigin:string;
  googleAuth?:unknown;
  schoolMailProof?:unknown;
  syntheticAiProvider?:unknown;
  realAi?:unknown;
  approvedAiInputs?:unknown;
}
const method=(value:unknown,name:string):boolean=>value!==null&&typeof value==='object'
  &&typeof (value as Record<string,unknown>)[name]==='function';

/** No network, process-env mutation, secrets, or permission defaults. */
export function assertRuntimeConfiguration(deps:RuntimeDependencies):void {
  const appEnv=process.env.APP_ENV,nodeEnv=process.env.NODE_ENV;
  const explicit=deps.runtime==='production';
  if(deps.runtime!==undefined&&!explicit)
    throw new Error('Unknown runtime configuration');
  const allowedApp=explicit?['test','development','local','synthetic','production']:['test','development','local','synthetic'];
  const allowedNode=explicit?['test','development','production']:['test','development'];
  if((appEnv!==undefined&&!allowedApp.includes(appEnv))
    ||(nodeEnv!==undefined&&!allowedNode.includes(nodeEnv)))
    throw new Error('Production integration disabled: explicit runtime configuration required');
  let origin:URL;
  try{origin=new URL(deps.allowedOrigin);}catch{throw new Error('Exactly one HTTPS origin is required');}
  if(origin.protocol!=='https:'||origin.origin!==deps.allowedOrigin||origin.username||origin.password)
    throw new Error('Exactly one HTTPS origin is required');
  if(!explicit)return;
  for(const name of ['verifySession','revokeSession','start','callback','clearSession'])
    if(!method(deps.googleAuth,name))throw new Error('Production requires configured Google OIDC and revocation');
  if(!method(deps.schoolMailProof,'issue')||!method(deps.schoolMailProof,'verify'))
    throw new Error('Production requires a configured school-mail verifier');
  if(deps.syntheticAiProvider!==undefined)
    throw new Error('Production cannot use the synthetic model adapter');
  if(Boolean(deps.realAi)!==Boolean(deps.approvedAiInputs))
    throw new Error('Production AI executor and actor-bound input directory must be configured together');
}
