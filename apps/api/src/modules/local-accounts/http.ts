import Fastify,{type FastifyRequest} from 'fastify';
import {timingSafeEqual} from 'node:crypto';
import {ZodError} from 'zod';
import {LocalAccountSwitchSchema,LocalAccountProfilePutSchema,LocalAccountWorkspacePutSchema,LocalAccountResetSchema,
  type LocalAccountSnapshot} from '@hufs-one/contracts';
import {LocalAccountError,LocalAccountStore,type LocalAccountActor} from './store.js';

const COOKIE='hufs_local_synthetic';
const PREFIX='/api/local-accounts';
/** Deliberately separate from the normal fail-closed production API assembly. */
export function createLocalAccountApi(options:{mode:string;environment?:string;allowedOrigin?:string;store?:LocalAccountStore}){
  if(options.mode!=='SYNTHETIC'||[options.environment,process.env.APP_ENV,process.env.NODE_ENV].includes('production'))
    throw new Error('Local accounts require explicit SYNTHETIC mode and are disabled in production');
  const allowedOrigin=options.allowedOrigin??'http://127.0.0.1:5173';
  const originUrl=new URL(allowedOrigin);
  if(originUrl.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(originUrl.hostname)
    ||originUrl.origin!==allowedOrigin)throw new Error('Synthetic accounts require an exact loopback HTTP origin');
  const store=options.store??new LocalAccountStore();
  const app=Fastify({logger:false,bodyLimit:128*1024,requestTimeout:15_000});
  const receipts=new WeakMap<FastifyRequest,{actor:LocalAccountActor;revision?:number}>();
  function cookieId(request:FastifyRequest){
    return request.headers.cookie?.split(';').map(value=>value.trim()).find(value=>value.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  }
  function actor(request:FastifyRequest){return store.actor(cookieId(request));}
  function writeActor(request:FastifyRequest){
    const current=actor(request),csrf=request.headers['x-csrf-token'];
    const provided=typeof csrf==='string'?Buffer.from(csrf):Buffer.alloc(0),expected=Buffer.from(current.csrfToken);
    if(request.headers.origin!==allowedOrigin||provided.length!==expected.length
      ||!timingSafeEqual(provided,expected))throw new LocalAccountError(403,'CSRF_REJECTED');
    return current;
  }
  function remember(request:FastifyRequest,current:LocalAccountActor,snapshot:LocalAccountSnapshot){
    receipts.set(request,{actor:current,revision:snapshot.revision});return snapshot;
  }
  app.addHook('onRequest',async(request,reply)=>{
    reply.header('cache-control','no-store').header('vary','Origin, Cookie').header('x-content-type-options','nosniff');
    if(!['localhost','127.0.0.1','::1'].includes(request.hostname))throw new LocalAccountError(403,'HOST_REJECTED');
    const origin=request.headers.origin;
    if(origin!==undefined&&origin!==allowedOrigin)throw new LocalAccountError(403,'ORIGIN_REJECTED');
    if(origin===allowedOrigin)reply.header('access-control-allow-origin',allowedOrigin).header('access-control-allow-credentials','true');
  });
  app.addHook('preSerialization',async(request,_reply,payload)=>{
    const receipt=receipts.get(request);receipts.delete(request);
    if(receipt)store.assertCurrent(receipt.actor,receipt.revision);
    return payload;
  });
  app.setErrorHandler((error,_request,reply)=>{
    if(error instanceof LocalAccountError)return reply.status(error.status).send({error:error.code,
      ...(error.revision===undefined?{}:{revision:error.revision})});
    if(error instanceof ZodError)return reply.status(400).send({error:'INVALID_INPUT'});
    if(error instanceof Error&&'statusCode' in error&&typeof error.statusCode==='number'&&error.statusCode>=400&&error.statusCode<500)
      return reply.status(error.statusCode).send({error:'INVALID_REQUEST'});
    return reply.status(500).send({error:'INTERNAL_ERROR'});
  });
  app.options(PREFIX+'/*',async(request,reply)=>{
    if(request.headers.origin!==allowedOrigin)throw new LocalAccountError(403,'ORIGIN_REJECTED');
    return reply.header('access-control-allow-methods','GET, POST, PATCH, PUT, OPTIONS')
      .header('access-control-allow-headers','Content-Type, X-CSRF-Token').status(204).send();
  });
  app.get(PREFIX+'/session',async(request,reply)=>{
    let current:LocalAccountActor;
    let created=false;
    const presentedSession=cookieId(request);
    try{current=store.actor(presentedSession);}catch(error){
      if(!(error instanceof LocalAccountError)||error.status!==401)throw error;
      // A peer may still be sending a revoked cookie after another tab rotated it.
      // NEVER mint a new BLANK_DEMO cookie for that stale request: its delayed
      // Set-Cookie could overwrite the newer selected account in every tab.
      if(presentedSession!==undefined)throw error;
      current=store.createSession();created=true;
    }
    // A delayed read for a still-valid former session must never overwrite a newer switch cookie.
    if(created)reply.header('set-cookie',`${COOKIE}=${current.sessionId}; HttpOnly; SameSite=Strict; Path=/api/local-accounts; Max-Age=28800`);
    receipts.set(request,{actor:current});return store.session(current);
  });
  app.post(PREFIX+'/session',async(request,reply)=>{
    const current=writeActor(request),input=LocalAccountSwitchSchema.parse(request.body),next=store.switchSession(current,input.accountId);
    reply.header('set-cookie',`${COOKIE}=${next.sessionId}; HttpOnly; SameSite=Strict; Path=/api/local-accounts; Max-Age=28800`);
    receipts.set(request,{actor:next});return store.session(next);
  });
  app.get(PREFIX+'/snapshot',async request=>{
    const current=actor(request);return remember(request,current,await store.snapshot(current));
  });
  app.patch(PREFIX+'/profile',async request=>{
    const current=writeActor(request),input=LocalAccountProfilePutSchema.parse(request.body);
    return remember(request,current,await store.putProfile(current,input.expectedRevision,input.profile));
  });
  app.put(PREFIX+'/workspace',async request=>{
    const current=writeActor(request),input=LocalAccountWorkspacePutSchema.parse(request.body);
    return remember(request,current,await store.putWorkspace(current,input.expectedRevision,input.workspace));
  });
  app.post(PREFIX+'/reset',async request=>{
    const current=writeActor(request),input=LocalAccountResetSchema.parse(request.body);
    return remember(request,current,await store.reset(current,input.expectedRevision));
  });
  return app;
}
