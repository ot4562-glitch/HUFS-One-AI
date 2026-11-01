import Fastify from 'fastify';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {
  AI_TASK_PATHS, AiTaskPathSchema, DemoContextSchema, DemoProfilesResponseSchema,
  DemoSnapshotSchema, httpStatusForError, makeApiError, SharingGrantSchema,
  canReadSharedSection, SubjectAliasSchema, SafeLlmPacketSchema,
  RetrievalEnvelopeVNextSchema,
  DemoPreflightStateSchema,DemoPreflightReportSchema,
  DemoOverlayPutSchema,DemoOverlayResetSchema,DemoOverlayStateSchema,CalendarResultSchema,
} from '@hufs-one/contracts';
import type {DemoContext, DemoSnapshot, SharingGrant, SubjectAlias, SharedSectionSchema} from '@hufs-one/contracts';
import type {FastifyRequest} from 'fastify';
import type {ApiOptions, VerifiedActor} from './types.js';
import {digestInviteToken} from './modules/auth/reviewer.js';
import {ReviewerSandboxActionSchema} from './modules/auth/reviewer-sandbox.js';
import type {ReviewerGrant} from './modules/auth/reviewer.js';
import {ApiFailure,authorizeSession,requireStateChangeProof} from './modules/auth/gates.js';
import {GoogleAuthFlowError} from './modules/auth/google-auth-flow.js';
import {SchoolMailProofError} from './modules/auth/school-mail-proof.js';
import {validateModelCandidate} from './modules/ai/candidate.js';
import {computeAuthorizedCalendar} from './modules/calendar.js';
import type {CalendarReadRequest} from './modules/calendar.js';
import {registerPersonalStateRoutes} from './modules/personal-state.js';

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
const SchoolMailRequest=z.strictObject({schoolEmail:z.email().max(254)});
const SchoolMailConfirm=z.strictObject({
  schoolEmail:z.email().max(254),
  challengeId:z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  code:z.string().regex(/^\d{8}$/),
});
const EvidenceSearchQuery=z.strictObject({
  q:z.string().trim().min(2).max(200),
  asOf:z.iso.datetime({offset:true}).optional(),
  topK:z.coerce.number().int().min(1).max(12).optional(),
});
const OverlayResultSchema=z.strictObject({overlay:DemoOverlayStateSchema,
  snapshot:DemoSnapshotSchema,calendar:CalendarResultSchema});
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
  if(options.googleAuth&&(options.verifySession||options.revokeSession))
    throw new Error('Google auth flow must exclusively own session verification and revocation');
  if(options.schoolMailProof&&!options.googleAuth)
    throw new Error('Verified Google browser identity required for school mail proof');
  const app=Fastify({logger:false,trustProxy:false,bodyLimit:65536,requestIdHeader:false});
  const clock=options.now??(()=>new Date().toISOString());
  const newId=options.newId??randomUUID;
  const verifier=options.verifySession??options.googleAuth?.verifySession??(async()=>null);
  const verifiedSession=async(request:FastifyRequest):Promise<VerifiedActor>=>{
    const raw=await verifier(request);
    if(raw?.role!=='ADMIN')return authorizeSession(raw,clock());
    // Validate all ordinary session proofs first; independently check the
    // operator policy every time, including after asynchronous inspections.
    const actor=authorizeSession(raw,clock(),'INDEPENDENT_OPERATOR_POLICY');
    if(actor.role!=='ADMIN'||!options.adminAuthority
      ||!await options.adminAuthority.isApproved({actor,now:clock()}))throw new ApiFailure('FORBIDDEN');
    return authorizeSession(actor,clock(),'INDEPENDENT_OPERATOR_POLICY');
  };
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
    const path=request.url.split('?')[0];
    if(options.googleAuth&&request.method==='GET'&&(
      path==='/api/auth/google/start'||path==='/api/auth/google/callback'))return;
    let actor:VerifiedActor;
    try { actor=await verifiedSession(request); }
    catch(error) { if(error instanceof ApiFailure)throw error;throw new ApiFailure('UNAUTHENTICATED'); }
    if(actor.role==='REVIEWER') {
      if(!options.reviewerAccess)throw new ApiFailure('FORBIDDEN');
      const enrollment=request.method==='POST'&&path==='/api/reviewer/invitations/redeem';
      const reviewerRead=request.method==='GET'&&(
        path==='/api/auth/session'
        ||path==='/api/auth/csrf'
        ||path==='/api/reviewer/demo/profiles'
        ||path==='/api/reviewer/capabilities'
        ||path==='/api/demo/profiles'
        ||/^\/api\/reviewer\/demo\/subjects\/S0[1-5]\/snapshot$/.test(path??'')
        ||/^\/api\/demo\/contexts\/[^/]+\/(snapshot|notices|graduation|outlook|calendar)$/.test(path??'')
        ||/^\/api\/reviewer\/demo\/contexts\/[^/]+\/actions$/.test(path??'')
        ||/^\/api\/ai\/jobs\/[^/]+$/.test(path??'')
      );
      const reviewerWrite=request.method==='POST'&&(
        path==='/api/demo/contexts'
        ||/^\/api\/reviewer\/demo\/contexts\/[^/]+\/actions$/.test(path??'')
        ||/^\/api\/ai\/[^/]+$/.test(path??'')
      );
      const schoolMail=request.method==='POST'&&!!options.schoolMailProof&&(
        path==='/api/auth/school-mail/request'
        ||path==='/api/auth/school-mail/confirm');
      const logout=request.method==='POST'&&path==='/api/auth/logout';
      if(!enrollment&&!reviewerRead&&!reviewerWrite&&!logout&&!schoolMail)
        throw new ApiFailure('FORBIDDEN');
      // A new reviewer needs CSRF proof in order to redeem the invitation.
      // Logout must remain available when a reviewer invitation has expired
      // or been revoked; data access still requires a live grant.
      if(!enrollment&&!schoolMail&&!logout&&path!=='/api/auth/csrf'){
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
  // Checked AFTER awaiting a repository, provider or synthetic read. An
  // onRequest check alone cannot protect a response whose session/invite
  // expires while that asynchronous operation is in flight.
  const recheckCurrent=async(req:FastifyRequest,actor:VerifiedActor,
    context?:DemoContext,sections:Section[]=[])=>{
    const sameSession=(next:VerifiedActor)=>
      next.role===actor.role&&next.actorId===actor.actorId
      &&next.sessionIdHash===actor.sessionIdHash
      &&(actor.role!=='REVIEWER'
        ||next.role==='REVIEWER'&&next.verifiedEmail===actor.verifiedEmail);
    if(!sameSession(await verifiedSession(req)))throw new ApiFailure('FORBIDDEN');
    if(actor.role==='REVIEWER'){
      const initial=reviewerGrants.get(req);
      if(!initial||!options.reviewerAccess)throw new ApiFailure('FORBIDDEN');
      const active=await options.reviewerAccess.readActive({
        actorId:actor.actorId,verifiedEmail:actor.verifiedEmail,now:clock()});
      if(!active||active.inviteId!==initial.inviteId
        ||active.actorId!==actor.actorId||active.verifiedEmail!==actor.verifiedEmail
        ||active.startsAt!==initial.startsAt||active.endsAt!==initial.endsAt
        ||Date.parse(active.endsAt)<=nowEpoch(clock())
        ||context&&context.sharingGrantVersion!=='REVIEWER:'+active.inviteId)
        throw new ApiFailure('FORBIDDEN');
    }else if(context){
      const grant=await getGrant(actor,context.demoSubjectId);
      if(grant.version!==context.sharingGrantVersion
        ||sections.some(section=>!allowed(grant,actor,context.demoSubjectId,section)))
        throw new ApiFailure('VERSION_CONFLICT',context.contextId);
    }
    if(!sameSession(await verifiedSession(req))
      ||context&&Date.parse(context.expiresAt)<=nowEpoch(clock()))
      throw new ApiFailure('FORBIDDEN');
  };
  const overlayResult=async(raw:unknown,req:FastifyRequest,actor:VerifiedActor,context:DemoContext)=>{
    const checked=OverlayResultSchema.safeParse(raw);
    if(!checked.success)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const r=checked.data,s=r.snapshot;
    if(s.contextId!==context.contextId||s.demoSubjectId!==context.demoSubjectId
      ||s.versions.dataset!==context.datasetVersion||s.versions.projection!==context.projectionVersion
      ||s.versions.consent!==context.sharingGrantVersion||s.asOf!==r.calendar.asOf
      ||s.asOf!==s.feed.asOf||s.asOf!==s.notices.asOf
      ||s.versions.overlay!=='BETA_OVERLAY:'+r.overlay.version)
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const current=await verifiedSession(req);
    if(current.role!==actor.role||current.actorId!==actor.actorId
      ||current.sessionIdHash!==actor.sessionIdHash||Date.parse(context.expiresAt)<=nowEpoch(clock()))
      throw new ApiFailure('FORBIDDEN');
    return r;
  };
  const checkedContext=async(req:FastifyRequest,id:string,sections:Section[]=['FEED','NOTICES'],applyOverlay=true)=>{
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
      await recheckCurrent(req,actor,context);
      return {actor,context,result:DemoSnapshotSchema.parse({...checked,contextId:context.contextId})};
    }
    const grant=await getGrant(actor,context.demoSubjectId);
    if(grant.version!==context.sharingGrantVersion)throw new ApiFailure('VERSION_CONFLICT',id);
    for(const section of sections)mustAllow(grant,actor,context.demoSubjectId,section);
    // Do NOT call the subject-only repository method after a detached grant read.
    // A revoke/scope change between those two awaits would expose a stale
    // precomputed feed or notice. The adapter must enforce the grant and return
    // a scoped projection in ONE operation (PR #35 / Issue #39).
    if(!options.repository.readAuthorizedSnapshot)throw new ApiFailure('FORBIDDEN');
    const source=await options.repository.readAuthorizedSnapshot({
      actorId:actor.actorId,subjectId:context.demoSubjectId,
      grantVersion:context.sharingGrantVersion,
      requiredSections:[...new Set<Section>(['FEED','NOTICES',...sections])],
      now:clock(),
    });
    if(!source)throw new ApiFailure('FORBIDDEN',id);
    const snapshot=DemoSnapshotSchema.parse(source);
    if(snapshot.demoSubjectId!==context.demoSubjectId
      ||snapshot.versions.dataset!==context.datasetVersion
      ||snapshot.versions.projection!==context.projectionVersion
      ||snapshot.feed.asOf!==snapshot.asOf||snapshot.notices.asOf!==snapshot.asOf
      ||("asOf" in snapshot.academics&&snapshot.academics.asOf!==snapshot.asOf)
      ||("asOf" in snapshot.forecast&&snapshot.forecast.asOf!==snapshot.asOf)
      ||("items" in snapshot.forecast&&snapshot.forecast.items.some(item=>Date.parse(item.asOf)>Date.parse(snapshot.asOf)))
      ||Date.parse(snapshot.asOf)>nowEpoch(clock()))
      throw new ApiFailure('VERSION_CONFLICT',id);
    const result=DemoSnapshotSchema.parse({
      ...snapshot,contextId:context.contextId,
      academics:allowed(grant,actor,context.demoSubjectId,'ACADEMICS')?snapshot.academics:{state:'NOT_SHARED'},
      forecast:allowed(grant,actor,context.demoSubjectId,'FORECAST')?snapshot.forecast:{state:'NOT_SHARED'},
    });
    await recheckCurrent(req,actor,context,sections);
    if(applyOverlay&&options.demoOverlay&&actor.role==='BETA'){
      const r=await overlayResult(await options.demoOverlay.read({actorId:actor.actorId,context,now:clock()},result),
        req,actor,context);
      return {actor,context,grant,result:r.snapshot};
    }
    return {actor,context,grant,result};
  };

  app.setErrorHandler((err,req,reply)=>{
    const code=err instanceof GoogleAuthFlowError||err instanceof SchoolMailProofError
      ?'FORBIDDEN':
      err instanceof ApiFailure?err.code:
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

  // Login routes exist only when an operator supplies a trusted OAuth adapter.
  if(options.googleAuth){
    app.get('/api/auth/google/start',async(req,reply)=>options.googleAuth!.start(req,reply));
    app.get('/api/auth/google/callback',async(req,reply)=>options.googleAuth!.callback(req,reply));
  }
  app.get('/api/auth/csrf',async(req)=>({csrfToken:principal(req).csrfToken}));
  app.post('/api/admin/demo/preflight',async(req)=>{
    const actor=principal(req);
    if(actor.role!=='ADMIN')throw new ApiFailure('FORBIDDEN');
    z.strictObject({}).parse(req.body);
    if(!options.demoPreflight)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const raw=await options.demoPreflight.inspect({actor,now:clock()});
    const parsed=DemoPreflightStateSchema.safeParse(raw);
    if(!parsed.success||Date.parse(parsed.data.asOf)>nowEpoch(clock()))
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const state=parsed.data;
    if(!await options.demoPreflight.revalidate({actor,version:state.version,now:clock()}))
      throw new ApiFailure('VERSION_CONFLICT');
    const current=await verifiedSession(req);
    if(current.role!=='ADMIN'||current.actorId!==actor.actorId||current.sessionIdHash!==actor.sessionIdHash)
      throw new ApiFailure('FORBIDDEN');
    return DemoPreflightReportSchema.parse({...state,
      readiness:state.slots.every(s=>s.readiness==='READY')&&state.checks.every(c=>c.state==='PASS')?'READY':'BLOCKED'});
  });
  if(options.schoolMailProof){
    const googleSubject=(req:FastifyRequest):string=>{
      const actor=principal(req);
      if(actor.role!=='REVIEWER'||!actor.actorId.startsWith('google:'))
        throw new ApiFailure('FORBIDDEN');
      const value=actor.actorId.slice('google:'.length);
      if(!value)throw new ApiFailure('FORBIDDEN');
      return value;
    };
    app.post('/api/auth/school-mail/request',async(req,reply)=>{
      const schoolEmail=SchoolMailRequest.parse(req.body).schoolEmail;
      const response=await options.schoolMailProof!.issue({
        googleSubject:googleSubject(req),schoolEmail,clientIp:req.ip,
      });
      reply.code(202).send(response);
    });
    app.post('/api/auth/school-mail/confirm',async(req)=>{
      const body=SchoolMailConfirm.parse(req.body);
      const verified=await options.schoolMailProof!.verify({
        googleSubject:googleSubject(req),...body,clientIp:req.ip,
      });
      return {verified};
    });
  }
  // Optional permission-first Temporal RAG endpoint. REVIEWER is explicitly
  // excluded by the auth hook; no browser-provided grants/source IDs accepted.
  app.get('/api/evidence/search',async(req)=>{
    const actor=principal(req);
    if(actor.role!=='BETA'&&actor.role!=='ADMIN')throw new ApiFailure('FORBIDDEN');
    if(!options.temporalEvidence)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const q=EvidenceSearchQuery.parse(req.query);
    const at=q.asOf??clock();
    if(nowEpoch(at)>nowEpoch(clock()))throw new ApiFailure('INVALID_INPUT');
    const result=await options.temporalEvidence.query({
      actor,query:q.q,asOf:at,topK:q.topK??12,now:clock(),
    });
    const current=await verifiedSession(req);
    if(current.actorId!==actor.actorId||current.sessionIdHash!==actor.sessionIdHash
      ||current.role!==actor.role)throw new ApiFailure('FORBIDDEN');
    const validated=RetrievalEnvelopeVNextSchema.parse(result.envelope);
    if(validated.asOf!==at)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    return validated;
  });
  app.get('/api/demo/contexts/:id/calendar',async(req)=>{
    const {id}=ContextParams.parse(req.params);
    z.strictObject({}).parse(req.query);
    const actor=principal(req),context=contexts.get(id);
    if(!context||context.actorId!==actor.actorId||context.sessionIdHash!==actor.sessionIdHash)
      throw new ApiFailure('FORBIDDEN');
    if(Date.parse(context.expiresAt)<=nowEpoch(clock()))throw new ApiFailure('VERSION_CONFLICT',id);
    if(!options.calendarSource)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const input:CalendarReadRequest={actorId:actor.actorId,context,now:clock()};
    if(actor.role==='REVIEWER'){
      const grant=reviewerGrants.get(req);
      if(!grant||context.sharingGrantVersion!==`REVIEWER:${grant.inviteId}`)
        throw new ApiFailure('FORBIDDEN');
      input.reviewerInviteId=grant.inviteId;
    }
    if(options.demoOverlay&&actor.role==='BETA'){
      const metadata=(await checkedContext(req,id,['FEED','NOTICES'],false)).result;
      return (await overlayResult(await options.demoOverlay.read(input,metadata),req,actor,context)).calendar;
    }
    const bundle=await options.calendarSource.readAuthorizedInputs(input);
    if(!bundle)throw new ApiFailure('FORBIDDEN');
    let result;
    try {result=computeAuthorizedCalendar(bundle,input);}
    catch(error){
      // A malformed server projection is an unavailable provider, not invalid client input.
      if(error instanceof ApiFailure)throw error;
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    }
    // All awaits can race with expiry/revoke. Recheck the session, context, invite and atomic
    // source receipt just before returning; never send an already-computed stale result.
    const current=await verifiedSession(req);
    if(current.actorId!==actor.actorId||current.sessionIdHash!==actor.sessionIdHash||current.role!==actor.role)
      throw new ApiFailure('FORBIDDEN');
    if(Date.parse(context.expiresAt)<=nowEpoch(clock()))throw new ApiFailure('VERSION_CONFLICT',id);
    if(!await options.calendarSource.revalidateAuthorization(input,{
      authorizationToken:bundle.authorizationToken,sourceVersion:bundle.sourceVersion,
      scopeKey:bundle.scopeKey,asOf:bundle.asOf,
    },clock()))throw new ApiFailure('FORBIDDEN');
    if(actor.role==='REVIEWER'){
      const active=await options.reviewerAccess!.readActive({actorId:actor.actorId,verifiedEmail:actor.verifiedEmail,now:clock()});
      if(!active||active.inviteId!==input.reviewerInviteId||Date.parse(active.endsAt)<=nowEpoch(clock()))
        throw new ApiFailure('FORBIDDEN');
    }
    await verifiedSession(req);
    if(Date.parse(context.expiresAt)<=nowEpoch(clock()))throw new ApiFailure('VERSION_CONFLICT',id);
    return result;
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
      return {role:'REVIEWER',accessEndsAt:grant.endsAt,dataMode:'SYNTHETIC',
        readOnly:false,sandboxOnly:true};
    }
    return {actorId:actor.actorId,role:actor.role,schoolMailProofValid:true,betaAllowed:true};
  });
  app.post('/api/auth/logout',async(req,reply)=>{
    const actor=principal(req);
    const invalidate=options.revokeSession??options.googleAuth?.revokeSession;
    if(!invalidate)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    try { await invalidate(actor); }
    catch {throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    for(const [id,ctx] of contexts)if(ctx.actorId===actor.actorId&&ctx.sessionIdHash===actor.sessionIdHash)
      contexts.delete(id);
    for(const [id,job] of jobs)if(job.actorId===actor.actorId&&job.sessionIdHash===actor.sessionIdHash)
      jobs.delete(id);
    options.googleAuth?.clearSession(reply);
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
    // Enrollment can commit while its HTTP request is still pending.
    // A durable row is not proof of a currently authorized response.
    // Verify the original session and active invitation after redeem().
    reviewerGrants.set(req,grant);
    await recheckCurrent(req,actor);
    reply.code(200);
    return {role:'REVIEWER',accessEndsAt:grant.endsAt,dataMode:'SYNTHETIC',
      readOnly:false,sandboxOnly:true};
  });

  const reviewerDemo=()=>{
    if(!options.reviewerDemo)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    return options.reviewerDemo;
  };
  const validateReviewerSnapshot=(raw:unknown,id:SubjectAlias)=>{
    const snap=DemoSnapshotSchema.parse(raw);
    if(snap.datasetMode!=='SYNTHETIC'||snap.demoSubjectId!==id
      ||(snap.aiProvenance!=='MOCK'&&snap.aiProvenance!=='NONE')
      ||snap.feed.asOf!==snap.asOf||snap.notices.asOf!==snap.asOf
      )throw new ApiFailure('FORBIDDEN');
    // Scenario asOf is a frozen fictitious clock; only the live authenticated
    // invitation session and rights checks use the actual request clock.
    const syntheticEvidence=(refs:readonly string[])=>refs.every(ref=>ref.startsWith('EV-SYN-'));
    const academic=snap.academics;
    if('rulePackVersion' in academic
      &&(!academic.rulePackVersion.startsWith('SYN-')
        ||Date.parse(academic.asOf)>Date.parse(snap.asOf)
        ||academic.deficits.some(d=>!d.requirementId.startsWith('SYN-')
          ||!syntheticEvidence(d.evidenceRefs))))
      throw new ApiFailure('FORBIDDEN');
    const forecast=snap.forecast;
    if('items' in forecast
      &&(Date.parse(forecast.asOf)>Date.parse(snap.asOf)
        ||forecast.items.some(item=>!item.courseId.startsWith('SYN-')
          ||Date.parse(item.asOf)>Date.parse(snap.asOf)
          ||!syntheticEvidence(item.evidenceRefs))))
      throw new ApiFailure('FORBIDDEN');
    const cards=[...snap.feed.featured,...snap.feed.compact];
    if(cards.some(c=>c.dataMode!=='SYNTHETIC'||!c.opportunityId.startsWith('SYN-')
      ||c.evidenceRefs.some(ref=>!ref.startsWith('EV-SYN-')))
      ||snap.notices.items.some(n=>!n.noticeId.startsWith('SYN-')
      ||n.evidenceRefs.some(ref=>!ref.startsWith('EV-SYN-'))))
      throw new ApiFailure('FORBIDDEN');
    return snap;
  };
  // UI can expose the full student navigation without granting any real-world side effects.
  // This manifest is served only after active enrollment has been rechecked.
  app.get('/api/reviewer/capabilities',async()=>({
    role:'REVIEWER',dataMode:'SYNTHETIC',sandboxOnly:true,
    sections:['TODAY','OPPORTUNITIES','NOTICES','EXPERIENCE','GRADUATION',
      'COURSE_PLANNER','OUTLOOK','SAVED','APPLICATIONS','SETTINGS'],
    actions:['BOOKMARK','MARK_READ','CHECKLIST','EXPERIENCE',
      'APPLICATION_DRAFT','SIMULATE_APPLICATION','SET_INTERESTS',
      'SET_DESIRED_JOBS','PLAN_COURSE','SET_SEARCH','SET_NOTIFICATIONS',
      'RESET_SANDBOX'],
    aiProvenance:'MOCK',externalSubmission:false,ncpCalls:false,
    actualBrowserUiVerified:false,
  }));
  app.get('/api/reviewer/demo/profiles',async(req)=>{
    const list=DemoProfilesResponseSchema.parse({profiles:await reviewerDemo().listProfiles()});
    // Separate curated fixture source. Never reuse the team-member repository or grants.
    if(list.profiles.some(p=>p.dataMode!=='SYNTHETIC'))throw new ApiFailure('FORBIDDEN');
    await recheckCurrent(req,principal(req));
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
    await recheckCurrent(req,principal(req));
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
      await recheckCurrent(req,actor);
      return response;
    }
    const raw=await options.repository.listProfiles();
    const {profiles}=DemoProfilesResponseSchema.parse({profiles:raw});
    const selected=[];
    const seenGrants=new Map<SubjectAlias,{value:string|null;active:boolean}>();
    for(const profile of profiles){
      const grant=await options.repository.readGrant(actor.actorId,profile.demoSubjectId);
      const valid=grant?SharingGrantSchema.safeParse(grant):null;
      const active=!!valid?.success&&!valid.data.revokedAt
        &&Date.parse(valid.data.expiresAt)>nowEpoch(clock());
      seenGrants.set(profile.demoSubjectId,{
        value:valid?.success?JSON.stringify(valid.data):null,active,
      });
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
    // An earlier profile's SharingGrant can change while later reads await.
    // Reject the entire response rather than serializing stale names or scope.
    for(const profile of profiles){
      const raw=await options.repository.readGrant(actor.actorId,profile.demoSubjectId);
      const checked=raw?SharingGrantSchema.safeParse(raw):null;
      const current=checked?.success?checked.data:null;
      const prior=seenGrants.get(profile.demoSubjectId)!;
      if((current?JSON.stringify(current):null)!==prior.value
        ||prior.active&&(!current||!!current.revokedAt
          ||Date.parse(current.expiresAt)<=nowEpoch(clock())))
        throw new ApiFailure('SHARING_REVOKED');
    }
    await recheckCurrent(req,actor);
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
      await recheckCurrent(req,actor,context);
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
    // Context creation must obey the same atomic authorization invariant as
    // every later read; a grant check followed by a subject-only fetch is unsafe.
    if(!options.repository.readAuthorizedSnapshot)throw new ApiFailure('FORBIDDEN');
    const snapshotValue=await options.repository.readAuthorizedSnapshot({
      actorId:actor.actorId,subjectId:body.demoSubjectId,grantVersion:grant.version,
      requiredSections:['FEED','NOTICES'],now:clock(),
    });
    if(!snapshotValue)throw new ApiFailure('FORBIDDEN');
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
    await recheckCurrent(req,actor,context,['FEED','NOTICES']);
    contexts.set(context.contextId,context);
    reply.code(201);
    return context;
  });
  app.get('/api/demo/contexts/:id/overlay',async(req)=>{
    const {id}=ContextParams.parse(req.params);z.strictObject({}).parse(req.query);
    const {actor,context,result}=await checkedContext(req,id,['FEED','NOTICES'],false);
    if(actor.role!=='BETA')throw new ApiFailure('FORBIDDEN');
    if(!options.demoOverlay)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    return overlayResult(await options.demoOverlay.read({actorId:actor.actorId,context,now:clock()},result),req,actor,context);
  });
  app.patch('/api/demo/contexts/:id/overlay',async(req)=>{
    const {id}=ContextParams.parse(req.params);z.strictObject({}).parse(req.query);
    const body=DemoOverlayPutSchema.parse(req.body);
    const {actor,context,result}=await checkedContext(req,id,['FEED','NOTICES'],false);
    if(actor.role!=='BETA')throw new ApiFailure('FORBIDDEN');
    if(!options.demoOverlay)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    return overlayResult(await options.demoOverlay.put({actorId:actor.actorId,context,now:clock()},result,body),req,actor,context);
  });
  app.post('/api/demo/contexts/:id/reset',async(req)=>{
    const {id}=ContextParams.parse(req.params);z.strictObject({}).parse(req.query);
    const body=DemoOverlayResetSchema.parse(req.body);
    const {actor,context,result}=await checkedContext(req,id,['FEED','NOTICES'],false);
    if(actor.role!=='BETA')throw new ApiFailure('FORBIDDEN');
    if(!options.demoOverlay)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    return overlayResult(await options.demoOverlay.reset({actorId:actor.actorId,context,now:clock()},result,body),req,actor,context);
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
    const result=await options.reviewerSandbox.read({inviteId:grant.inviteId,
      actorId:actor.actorId,subjectId:context.demoSubjectId});
    await recheckCurrent(req,actor,context);
    return result;
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
    const result=await options.reviewerSandbox.save({inviteId:grant.inviteId,
      actorId:actor.actorId,subjectId:context.demoSubjectId,action});
    await recheckCurrent(req,actor,context);
    return result;
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
      await recheckCurrent(req,actor);
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
    await recheckCurrent(req,actor);
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
  registerPersonalStateRoutes(app,{
    store:options.personalState,
    authorize:async(request,id,section)=>{
      if(principal(request).role==='REVIEWER')throw new ApiFailure('FORBIDDEN');
      const {actor,context}=await checkedContext(request,id,[section]);
      return {actorId:actor.actorId,subjectId:context.demoSubjectId,
        grantVersion:context.sharingGrantVersion};
    },
    revalidate:async(request,id,section)=>{
      await checkedContext(request,id,[section],false);
    },
  });
  return app;
}
