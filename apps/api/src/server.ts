import Fastify from 'fastify';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {
  AI_TASK_PATHS, AiTaskPathSchema, DemoContextSchema, DemoProfilesResponseSchema,
  DemoSnapshotSchema, httpStatusForError, makeApiError, SharingGrantSchema,
  canReadSharedSection, SubjectAliasSchema, SafeLlmPacketSchema,
} from '@hufs-one/contracts';
import type {DemoContext, DemoSnapshot, SharingGrant, SubjectAlias, SharedSectionSchema} from '@hufs-one/contracts';
import type {FastifyRequest} from 'fastify';
import type {ApiOptions, VerifiedActor} from './types.js';
import {digestInviteToken} from './modules/auth/reviewer.js';
import {ReviewerSandboxActionSchema} from './modules/auth/reviewer-sandbox.js';
import type {ReviewerGrant} from './modules/auth/reviewer.js';
import {ApiFailure,authorizeSession,requireStateChangeProof} from './modules/auth/gates.js';
import {validateModelCandidate} from './modules/ai/candidate.js';

const SelectBody=z.strictObject({
  demoSubjectId:SubjectAliasSchema,
  demoRunId:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  expectedDatasetVersion:z.string().min(1).optional(),
  expectedProjectionVersion:z.string().min(1).optional(),
});
const ContextParams=z.strictObject({id:z.string().min(1).max(100)});
const AiPathParams=z.strictObject({task:AiTaskPathSchema});
const JobParams=z.strictObject({id:z.string().min(1).max(100)});
const ReviewerInviteBody=z.strictObject({enrollmentCode:z.string().regex(/^[A-Za-z0-9_-]{43}$/)});
const ReviewerSubject=z.strictObject({id:SubjectAliasSchema});
const AiRequest=z.strictObject({
  packetRef:z.string().regex(/^[a-zA-Z0-9_-]{1,90}$/),
  idempotencyKey:z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  contextId:z.string().min(1).max(100).optional(),
});
type Section='FEED'|'NOTICES'|'ACADEMICS'|'FORECAST'|'EXPERIENCE';
type Job={jobId:string;actorId:string;sessionIdHash:string;task:string;packetRef:string;
  state:'NEEDS_REVIEW';createdAt:string;candidate:ReturnType<typeof validateModelCandidate>};

function nowEpoch(now:string):number {
  const at=Date.parse(now);
  if(!Number.isFinite(at))throw new Error('Invalid trusted server clock');
  return at;
}

/** Every route starts by denying unverified credentials; no mock header bypass exists. */
export function createApi(options:ApiOptions) {
  if(!options.allowedOrigin||new URL(options.allowedOrigin).origin!==options.allowedOrigin)
    throw new Error('Exact allowedOrigin required');
  const app=Fastify({logger:false,trustProxy:false,bodyLimit:65536,requestIdHeader:false});
  const clock=options.now??(()=>new Date().toISOString());
  const newId=options.newId??randomUUID;
  const verifier=options.verifySession??(async()=>null);
  const actors=new WeakMap<FastifyRequest,VerifiedActor>();
  const reviewerGrants=new WeakMap<FastifyRequest,ReviewerGrant>();
  const inviteAttempts=new Map<string,{window:number;attempts:number}>();
  const contexts=new Map<string,DemoContext>();
  const jobs=new Map<string,Job>();
  const aiIdempotency=new Map<string,string>();
  const aiUsage=new Map<string,{minute:number;count:number}>();

  app.addHook('onRequest',async(request,reply)=>{
    reply.header('Cache-Control','no-store');
    reply.header('Pragma','no-cache');
    reply.header('X-Content-Type-Options','nosniff');
    reply.header('Referrer-Policy','no-referrer');
    reply.header('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
    if(!request.raw.url?.startsWith('/api/'))throw new ApiFailure('FORBIDDEN');
    let verified:unknown;
    try { verified=await verifier(request); }
    catch { throw new ApiFailure('UNAUTHENTICATED'); }
    const actor=authorizeSession(verified,clock());
    const path=request.url.split('?')[0];
    if(actor.role==='REVIEWER') {
      if(!options.reviewerAccess)throw new ApiFailure('FORBIDDEN');
      const enrollment=request.method==='POST'&&path==='/api/reviewer/invitations/redeem';
      const reviewerRead=request.method==='GET'&&(
        path==='/api/auth/session'
        ||path==='/api/reviewer/demo/profiles'
        ||path==='/api/demo/profiles'
        ||/^\/api\/reviewer\/demo\/subjects\/S0[1-5]\/snapshot$/.test(path??'')
        ||/^\/api\/demo\/contexts\/[^/]+\/(snapshot|notices|graduation|outlook)$/.test(path??'')
        ||/^\/api\/reviewer\/demo\/contexts\/[^/]+\/actions$/.test(path??'')
        ||/^\/api\/ai\/jobs\/[^/]+$/.test(path??'')
      );
      const reviewerWrite=request.method==='POST'&&(
        path==='/api/demo/contexts'
        ||/^\/api\/reviewer\/demo\/contexts\/[^/]+\/actions$/.test(path??'')
        ||/^\/api\/ai\/[^/]+$/.test(path??'')
      );
      const logout=request.method==='POST'&&path==='/api/auth/logout';
      if(!enrollment&&!reviewerRead&&!reviewerWrite&&!logout)
        throw new ApiFailure('FORBIDDEN');
      if(!enrollment){
        const grant=await options.reviewerAccess.readActive({
          actorId:actor.actorId,verifiedEmail:actor.verifiedEmail,now:clock(),
        });
        if(!grant)throw new ApiFailure('FORBIDDEN');
        reviewerGrants.set(request,grant);
      }
    } else if(path?.startsWith('/api/reviewer/')) {
      throw new ApiFailure('FORBIDDEN');
    }
    actors.set(request,actor);
    if(!['GET','HEAD','OPTIONS'].includes(request.method))
      requireStateChangeProof(request,actor,options.allowedOrigin);
  });
  const principal=(req:FastifyRequest):VerifiedActor=>{
    const v=actors.get(req);
    if(!v)throw new ApiFailure('UNAUTHENTICATED');
    return v;
  };
  const getGrant=async(actor:VerifiedActor,subject:SubjectAlias):Promise<SharingGrant>=>{
    const raw=await options.repository.readGrant(actor.actorId,subject);
    if(!raw)throw new ApiFailure('FORBIDDEN');
    const grant=SharingGrantSchema.parse(raw);
    if(grant.revokedAt)throw new ApiFailure('SHARING_REVOKED');
    return grant;
  };
  const allowed=(grant:SharingGrant,actor:VerifiedActor,subject:SubjectAlias,section:Section):boolean=>
    canReadSharedSection(grant,{actorId:actor.actorId,demoSubjectId:subject,section,asOf:clock()});
  const mustAllow=(grant:SharingGrant,actor:VerifiedActor,subject:SubjectAlias,section:Section):void=>{
    if(!allowed(grant,actor,subject,section))throw new ApiFailure('FORBIDDEN');
  };
  const checkedContext=async(req:FastifyRequest,id:string,sections:Section[]=['FEED','NOTICES'])=>{
    const actor=principal(req),context=contexts.get(id);
    if(!context||context.actorId!==actor.actorId||context.sessionIdHash!==actor.sessionIdHash)
      throw new ApiFailure('FORBIDDEN');
    if(Date.parse(context.expiresAt)<=nowEpoch(clock()))throw new ApiFailure('VERSION_CONFLICT',id);
    if(actor.role==='REVIEWER'){
      const granted=reviewerGrants.get(req);
      if(!granted||context.sharingGrantVersion!=='REVIEWER:'+granted.inviteId)
        throw new ApiFailure('FORBIDDEN');
      const snap=await reviewerDemo().readSnapshot(context.demoSubjectId);
      if(!snap)throw new ApiFailure('VERSION_CONFLICT',id);
      const checked=validateReviewerSnapshot(snap,context.demoSubjectId);
      if(checked.versions.dataset!==context.datasetVersion
        ||checked.versions.projection!==context.projectionVersion)
        throw new ApiFailure('VERSION_CONFLICT',id);
      return {actor,context,result:DemoSnapshotSchema.parse({...checked,contextId:context.contextId})};
    }
    const grant=await getGrant(actor,context.demoSubjectId);
    if(grant.version!==context.sharingGrantVersion)throw new ApiFailure('VERSION_CONFLICT',id);
    for(const section of sections)mustAllow(grant,actor,context.demoSubjectId,section);
    const source=await options.repository.readSnapshot(context.demoSubjectId);
    if(!source)throw new ApiFailure('VERSION_CONFLICT',id);
    const snapshot=DemoSnapshotSchema.parse(source);
    if(snapshot.demoSubjectId!==context.demoSubjectId
      ||snapshot.versions.dataset!==context.datasetVersion
      ||snapshot.versions.projection!==context.projectionVersion
      ||snapshot.feed.asOf!==snapshot.asOf||snapshot.notices.asOf!==snapshot.asOf
      ||Date.parse(snapshot.asOf)>nowEpoch(clock()))
      throw new ApiFailure('VERSION_CONFLICT',id);
    const result=DemoSnapshotSchema.parse({
      ...snapshot,contextId:context.contextId,
      academics:allowed(grant,actor,context.demoSubjectId,'ACADEMICS')?snapshot.academics:{state:'NOT_SHARED'},
      forecast:allowed(grant,actor,context.demoSubjectId,'FORECAST')?snapshot.forecast:{state:'NOT_SHARED'},
    });
    return {actor,context,grant,result};
  };

  app.setErrorHandler((err,req,reply)=>{
    const code=err instanceof ApiFailure?err.code:
      (err instanceof z.ZodError || (typeof err==='object'&&err!==null&&'statusCode' in err
        &&(err.statusCode===400||err.statusCode===413)))
        ?'INVALID_INPUT':'PROVIDER_UNAVAILABLE';
    const response=makeApiError(code,req.id,
      err instanceof ApiFailure?err.contextId:undefined);
    reply.code(httpStatusForError(response)).send(response);
  });
  app.setNotFoundHandler((req,reply)=>{
    const error=makeApiError('FORBIDDEN',req.id);
    reply.code(httpStatusForError(error)).send(error);
  });

  app.get('/api/health',async()=>({
    mode:'LOCAL_ONLY',releaseReady:false,oidcConnected:false,schoolMailOtpConnected:false,
    ncpConnected:false,aiProviderConnected:false,
  }));
  app.get('/api/auth/session',async(req)=>{
    const actor=principal(req);
    if(actor.role==='REVIEWER'){
      const grant=reviewerGrants.get(req);
      if(!grant)throw new ApiFailure('FORBIDDEN');
      return {role:'REVIEWER',accessEndsAt:grant.endsAt,dataMode:'SYNTHETIC',readOnly:true};
    }
    return {actorId:actor.actorId,role:actor.role,schoolMailProofValid:true,betaAllowed:true};
  });
  app.post('/api/auth/logout',async(req,reply)=>{
    const actor=principal(req);
    if(!options.revokeSession)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    try { await options.revokeSession(actor); }
    catch {throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    for(const [id,ctx] of contexts)if(ctx.actorId===actor.actorId&&ctx.sessionIdHash===actor.sessionIdHash)
      contexts.delete(id);
    for(const [id,job] of jobs)if(job.actorId===actor.actorId&&job.sessionIdHash===actor.sessionIdHash)
      jobs.delete(id);
    reply.code(204).send();
  });

  // Only a trusted OIDC identity may redeem. A PDF/link alone grants nothing.
  // Re-enrollment by the SAME actor remains idempotent; browsing is not quota-limited.
  app.post('/api/reviewer/invitations/redeem',async(req,reply)=>{
    const actor=principal(req);
    if(actor.role!=='REVIEWER'||!options.reviewerAccess)throw new ApiFailure('FORBIDDEN');
    const bucket=Math.floor(nowEpoch(clock())/900_000);
    const key=actor.actorId;
    const previous=inviteAttempts.get(key);
    const used=previous?.window===bucket?previous.attempts:0;
    if(used>=5)throw new ApiFailure('RATE_LIMITED');
    inviteAttempts.set(key,{window:bucket,attempts:used+1});
    const body=ReviewerInviteBody.parse(req.body);
    const grant=await options.reviewerAccess.redeem({
      tokenDigest:digestInviteToken(body.enrollmentCode),
      actorId:actor.actorId,verifiedEmail:actor.verifiedEmail,now:clock(),
    });
    if(!grant)throw new ApiFailure('FORBIDDEN');
    reply.code(200);
    return {role:'REVIEWER',accessEndsAt:grant.endsAt,dataMode:'SYNTHETIC',readOnly:true};
  });

  const reviewerDemo=()=>{
    if(!options.reviewerDemo)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    return options.reviewerDemo;
  };
  const validateReviewerSnapshot=(raw:unknown,id:SubjectAlias)=>{
    const snap=DemoSnapshotSchema.parse(raw);
    if(snap.datasetMode!=='SYNTHETIC'||snap.demoSubjectId!==id
      ||snap.aiProvenance==='LIVE_NCP'
      ||snap.feed.asOf!==snap.asOf||snap.notices.asOf!==snap.asOf
      ||nowEpoch(snap.asOf)>nowEpoch(clock()))throw new ApiFailure('FORBIDDEN');
    const cards=[...snap.feed.featured,...snap.feed.compact];
    if(cards.some(c=>c.dataMode!=='SYNTHETIC'||!c.opportunityId.startsWith('SYN-')
      ||c.evidenceRefs.some(ref=>!ref.startsWith('EV-SYN-')))
      ||snap.notices.items.some(n=>!n.noticeId.startsWith('SYN-')
      ||n.evidenceRefs.some(ref=>!ref.startsWith('EV-SYN-'))))
      throw new ApiFailure('FORBIDDEN');
    return snap;
  };
  app.get('/api/reviewer/demo/profiles',async()=>{
    const list=DemoProfilesResponseSchema.parse({profiles:await reviewerDemo().listProfiles()});
    // Separate curated fixture source. Never reuse the team-member repository or grants.
    if(list.profiles.some(p=>p.dataMode!=='SYNTHETIC'))throw new ApiFailure('FORBIDDEN');
    return list;
  });
  app.get('/api/reviewer/demo/subjects/:id/snapshot',async(req)=>{
    const {id}=ReviewerSubject.parse(req.params);
    const demo=reviewerDemo();
    const list=DemoProfilesResponseSchema.parse({profiles:await demo.listProfiles()});
    const profile=list.profiles.find(p=>p.demoSubjectId===id);
    if(!profile||profile.dataMode!=='SYNTHETIC'||profile.readiness==='REVOKED'
      ||profile.readiness==='PENDING')throw new ApiFailure('FORBIDDEN');
    const source=await demo.readSnapshot(id);
    if(!source)throw new ApiFailure('FORBIDDEN');
    return validateReviewerSnapshot(source,id);
  });

  app.get('/api/demo/profiles',async(req)=>{
    const actor=principal(req);
    if(actor.role==='REVIEWER'){
      const response=DemoProfilesResponseSchema.parse({
        profiles:await reviewerDemo().listProfiles(),
      });
      if(response.profiles.some(p=>p.dataMode!=='SYNTHETIC'))
        throw new ApiFailure('FORBIDDEN');
      return response;
    }
    const raw=await options.repository.listProfiles();
    const {profiles}=DemoProfilesResponseSchema.parse({profiles:raw});
    const selected=[];
    for(const profile of profiles){
      const grant=await options.repository.readGrant(actor.actorId,profile.demoSubjectId);
      const valid=grant?SharingGrantSchema.safeParse(grant):null;
      const active=valid?.success&&!valid.data.revokedAt
        &&Date.parse(valid.data.expiresAt)>nowEpoch(clock());
      const sections=active?profile.allowedSections.filter(section=>
        canReadSharedSection(valid.data,{
          actorId:actor.actorId,demoSubjectId:profile.demoSubjectId,section,asOf:clock(),
        })):[];
      selected.push({
        ...profile,
        displayLabel:active&&valid.data.displayNameAllowed
          ?profile.displayLabel:`시연 대상 ${profile.demoSubjectId.slice(-1)}`,
        readiness:active&&sections.length?profile.readiness:'PENDING',
        allowedSections:sections,
      });
    }
    return DemoProfilesResponseSchema.parse({profiles:selected});
  });
  app.post('/api/demo/contexts',async(req,reply)=>{
    const actor=principal(req);
    const body=SelectBody.parse(req.body);
    if(actor.role==='REVIEWER'){
      const grant=reviewerGrants.get(req);
      if(!grant)throw new ApiFailure('FORBIDDEN');
      const profiles=DemoProfilesResponseSchema.parse({
        profiles:await reviewerDemo().listProfiles(),
      }).profiles;
      const profile=profiles.find(p=>p.demoSubjectId===body.demoSubjectId);
      if(!profile||profile.dataMode!=='SYNTHETIC'||profile.readiness!=='READY')
        throw new ApiFailure('FORBIDDEN');
      const raw=await reviewerDemo().readSnapshot(body.demoSubjectId);
      if(!raw)throw new ApiFailure('VERSION_CONFLICT');
      const snap=validateReviewerSnapshot(raw,body.demoSubjectId);
      if(body.expectedDatasetVersion&&body.expectedDatasetVersion!==snap.versions.dataset)
        throw new ApiFailure('VERSION_CONFLICT');
      if(body.expectedProjectionVersion&&body.expectedProjectionVersion!==snap.versions.projection)
        throw new ApiFailure('VERSION_CONFLICT');
      const exp=Math.min(nowEpoch(clock())+5*60_000,Date.parse(actor.sessionExpiresAt),
        Date.parse(actor.identityProofExpiresAt),Date.parse(grant.endsAt));
      if(exp<=nowEpoch(clock()))throw new ApiFailure('FORBIDDEN');
      const context=DemoContextSchema.parse({
        contextId:newId(),actorId:actor.actorId,demoSubjectId:body.demoSubjectId,
        demoRunId:body.demoRunId,sessionIdHash:actor.sessionIdHash,
        datasetVersion:snap.versions.dataset,projectionVersion:snap.versions.projection,
        sharingGrantVersion:'REVIEWER:'+grant.inviteId,
        expiresAt:new Date(exp).toISOString(),
      });
      if(contexts.size>=200)throw new ApiFailure('RATE_LIMITED');
      contexts.set(context.contextId,context);
      reply.code(201);
      return context;
    }
    const grant=await getGrant(actor,body.demoSubjectId);
    mustAllow(grant,actor,body.demoSubjectId,'FEED');
    mustAllow(grant,actor,body.demoSubjectId,'NOTICES');
    const profiles=DemoProfilesResponseSchema.parse({profiles:await options.repository.listProfiles()}).profiles;
    const profile=profiles.find(p=>p.demoSubjectId===body.demoSubjectId);
    if(!profile || !['READY','PARTIAL'].includes(profile.readiness))
      throw new ApiFailure('FORBIDDEN');
    const snapshotValue=await options.repository.readSnapshot(body.demoSubjectId);
    if(!snapshotValue)throw new ApiFailure('VERSION_CONFLICT');
    const snapshot=DemoSnapshotSchema.parse(snapshotValue);
    if(snapshot.demoSubjectId!==body.demoSubjectId
      ||Date.parse(snapshot.asOf)>nowEpoch(clock()))throw new ApiFailure('VERSION_CONFLICT');
    if(body.expectedDatasetVersion&&body.expectedDatasetVersion!==snapshot.versions.dataset)
      throw new ApiFailure('VERSION_CONFLICT');
    if(body.expectedProjectionVersion&&body.expectedProjectionVersion!==snapshot.versions.projection)
      throw new ApiFailure('VERSION_CONFLICT');
    const time=nowEpoch(clock());
    const expiry=Math.min(time+5*60_000,Date.parse(actor.sessionExpiresAt),
      Date.parse(actor.schoolMailProofExpiresAt),Date.parse(grant.expiresAt));
    if(expiry<=time)throw new ApiFailure('FORBIDDEN');
    const context=DemoContextSchema.parse({
      contextId:newId(),actorId:actor.actorId,demoSubjectId:body.demoSubjectId,
      demoRunId:body.demoRunId,sessionIdHash:actor.sessionIdHash,
      datasetVersion:snapshot.versions.dataset,projectionVersion:snapshot.versions.projection,
      sharingGrantVersion:grant.version,expiresAt:new Date(expiry).toISOString(),
    });
    for(const [id,item] of contexts)if(Date.parse(item.expiresAt)<=time)contexts.delete(id);
    if(contexts.size>=200)throw new ApiFailure('RATE_LIMITED');
    contexts.set(context.contextId,context);
    reply.code(201);
    return context;
  });
  app.get('/api/demo/contexts/:id/snapshot',async(req)=>{
    const {id}=ContextParams.parse(req.params);
    return (await checkedContext(req,id)).result;
  });
  app.get('/api/demo/contexts/:id/notices',async(req)=>{
    const {id}=ContextParams.parse(req.params);
    return (await checkedContext(req,id,['FEED','NOTICES'])).result.notices;
  });
  app.get('/api/demo/contexts/:id/graduation',async(req)=>{
    const {id}=ContextParams.parse(req.params);
    return (await checkedContext(req,id,['FEED','NOTICES','ACADEMICS'])).result.academics;
  });
  app.get('/api/demo/contexts/:id/outlook',async(req)=>{
    const {id}=ContextParams.parse(req.params);
    return (await checkedContext(req,id,['FEED','NOTICES','FORECAST'])).result.forecast;
  });

  app.get('/api/reviewer/demo/contexts/:id/actions',async(req)=>{
    const actor=principal(req);
    if(actor.role!=='REVIEWER'||!options.reviewerSandbox)throw new ApiFailure('FORBIDDEN');
    const {id}=ContextParams.parse(req.params);
    const {context}=await checkedContext(req,id,[]);
    const grant=reviewerGrants.get(req);
    if(!grant)throw new ApiFailure('FORBIDDEN');
    return options.reviewerSandbox.read({inviteId:grant.inviteId,
      actorId:actor.actorId,subjectId:context.demoSubjectId});
  });
  app.post('/api/reviewer/demo/contexts/:id/actions',async(req)=>{
    const actor=principal(req);
    if(actor.role!=='REVIEWER'||!options.reviewerSandbox)throw new ApiFailure('FORBIDDEN');
    const {id}=ContextParams.parse(req.params);
    const {context}=await checkedContext(req,id,[]);
    const grant=reviewerGrants.get(req);
    if(!grant)throw new ApiFailure('FORBIDDEN');
    const action=ReviewerSandboxActionSchema.parse(req.body);
    // Simulated operations have no production side effects or external sends.
    return options.reviewerSandbox.save({inviteId:grant.inviteId,
      actorId:actor.actorId,subjectId:context.demoSubjectId,action});
  });

  app.post('/api/ai/:task',async(req,reply)=>{
    const actor=principal(req);
    const {task:taskPath}=AiPathParams.parse(req.params);
    const task=AI_TASK_PATHS[taskPath];
    const body=AiRequest.parse(req.body);
    // In REVIEWER mode all task results are LOCAL SYNTHETIC MOCKS, never an NCP call.
    let reviewerSubject:SubjectAlias|undefined;
    if(actor.role==='REVIEWER'){
      if(!body.contextId)throw new ApiFailure('INVALID_INPUT');
      const selected=await checkedContext(req,body.contextId,[]);
      reviewerSubject=selected.context.demoSubjectId;
    }else if(!options.syntheticAiProvider){
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    }
    const existingKey=[actor.actorId,actor.sessionIdHash,task,body.idempotencyKey,
      reviewerSubject??'TEAM'].join('\0');
    const existing=aiIdempotency.get(existingKey);
    if(existing){
      const job=jobs.get(existing);
      if(!job||job.packetRef!==body.packetRef)throw new ApiFailure('VERSION_CONFLICT');
      reply.code(202);
      return {jobId:job.jobId,state:job.state,provenance:'MOCK'};
    }
    const packetRaw=actor.role==='REVIEWER'
      ?await reviewerDemo().readSafePacket?.(reviewerSubject!,task,body.packetRef)
      :await options.repository.readSafePacket(actor.actorId,task,body.packetRef);
    if(!packetRaw)throw new ApiFailure('FORBIDDEN');
    const packet=SafeLlmPacketSchema.parse(packetRaw);
    if(packet.task!==task || packet.providerInputClass!=='SYNTHETIC_CLEARED')
      throw new ApiFailure('UNVERIFIED_EVIDENCE');
    let raw:unknown;
    if(actor.role==='REVIEWER'){
      const source=packet.sourceTokens[0];
      const paragraph=source?.paragraphs[0];
      raw={task,reviewRequired:true,citations:paragraph?[{
        sourceToken:source.token,paragraphId:paragraph.id,
        quote:paragraph.text.slice(0,Math.min(80,paragraph.text.length)),
      }]:[]};
    }else{
      const minute=Math.floor(nowEpoch(clock())/60_000);
      const usageKey=actor.actorId+'\0'+actor.sessionIdHash;
      const current=aiUsage.get(usageKey);
      const count=current?.minute===minute?current.count:0;
      const limit=Math.min(options.maxSyntheticAiCallsPerActor??3,10);
      if(count>=limit)throw new ApiFailure('RATE_LIMITED');
      aiUsage.set(usageKey,{minute,count:count+1});
      try {raw=await options.syntheticAiProvider!.analyze(packet);}
      catch {throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    }
    const candidate=validateModelCandidate(packet,raw);
    const job:Job={jobId:newId(),actorId:actor.actorId,sessionIdHash:actor.sessionIdHash,
      task,packetRef:body.packetRef,state:'NEEDS_REVIEW',createdAt:clock(),candidate};
    if(jobs.size>=200)throw new ApiFailure('RATE_LIMITED');
    jobs.set(job.jobId,job);
    aiIdempotency.set(existingKey,job.jobId);
    reply.code(202);
    return {jobId:job.jobId,state:job.state,provenance:'MOCK'};
  });
  app.get('/api/ai/jobs/:id',async(req)=>{
    const actor=principal(req),{id}=JobParams.parse(req.params),job=jobs.get(id);
    if(!job||job.actorId!==actor.actorId||job.sessionIdHash!==actor.sessionIdHash)
      throw new ApiFailure('FORBIDDEN');
    return {jobId:job.jobId,state:job.state,task:job.task,createdAt:job.createdAt,candidate:job.candidate};
  });
  return app;
}
