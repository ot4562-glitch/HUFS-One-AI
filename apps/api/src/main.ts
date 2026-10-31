import {createApi} from './server.js';
import {closedRepository} from './repository.js';

/**
 * Local-only readiness harness. Intentionally HAS NO usable login/OTP/provider adapter.
 * Production deployment is blocked until Google OIDC + school-mail + allowlist,
 * durable DB, persistent revocation, CSRF and ingress/storage E2E are integrated.
 */
if(process.env.APP_ENV==='production') {
  throw new Error('Production API blocked: OIDC/mail verification, database, and security gates are not configured.');
}
const port=Number(process.env.API_INTERNAL_PORT ?? '3000');
if(!Number.isSafeInteger(port)||port<1024||port>65535)
  throw new Error('Invalid internal port');
const app=createApi({repository:closedRepository,allowedOrigin:'http://127.0.0.1:'+port});
await app.listen({host:'127.0.0.1',port});
process.stdout.write('HUFS One API local harness started (all sessions and AI calls disabled).\n');
