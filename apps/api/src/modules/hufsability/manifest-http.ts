import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {getHufsAbilityManifest} from '@hufs-one/contracts';
import {betaActor,betaRecheck} from '../profiles/self-account-http.js';
import type {BetaRouteVerifier} from '../profiles/self-account-http.js';

/** #124 Existing HUFSAbility menu labels only. All original campus systems
 * remain non-functional inside this app until separately verified and approved.
 * The public official homepage is not a private deep link or sign-on integration.
 */
export function registerHufsAbilityCapabilitiesRoute(app:FastifyInstance,
  session:BetaRouteVerifier):void{
  app.get('/api/hufsability/capabilities',async request=>{
    z.strictObject({}).parse(request.query);
    const actor=await betaActor(request,session);
    const manifest=getHufsAbilityManifest();
    await betaRecheck(request,session,actor);
    return manifest;
  });
}
