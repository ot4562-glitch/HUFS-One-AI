/** Explicit, inert Google OIDC code-exchange composition for a private operator.
 * This never enables the public release, signs in a user, or grants BETA status.
 */
import {createGoogleCodeExchange} from './modules/auth/google-code-exchange.js';
import type {GoogleCodeExchangeConfig} from './modules/auth/google-code-exchange.js';
import type {PostgresGoogleAuthConfig} from './auth-postgres.js';

export function createOperatorGoogleIdentity(input:{
  clientId:string;redirectUri:string;allowedOrigin:string;
  exchange:Pick<GoogleCodeExchangeConfig,'clientSecret'|'fetchImpl'|'timeoutMs'>;
  now?:()=>Date;
}):PostgresGoogleAuthConfig['google']{
  const callback=new URL(input.redirectUri);
  if(callback.origin!==input.allowedOrigin)
    throw new Error('Operator Google origin and callback must match');
  const exchangeCode=createGoogleCodeExchange({
    clientId:input.clientId,redirectUri:input.redirectUri,
    ...input.exchange,
  });
  return {clientId:input.clientId,redirectUri:input.redirectUri,allowedOrigin:input.allowedOrigin,
    exchangeCode,...(input.now?{now:input.now}:{})};
}
