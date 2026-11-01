import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {
  OwnerWorkspaceCreateSchema,OwnerWorkspaceUpdateSchema,
  OwnerWorkspaceDeleteSchema,OpportunityCatalogDetailSchema,
} from '@hufs-one/contracts';
import type {WorkspaceKind} from '@hufs-one/contracts';
import {ApiFailure} from '../auth/gates.js';
import {betaActor,betaRecheck} from './self-account-http.js';
import type {BetaRouteVerifier} from './self-account-http.js';
import type {OwnerWorkspacePort} from './self-workspace-postgres.js';
import {WorkspaceConflict,WorkspaceDenied,WorkspaceQuota} from './self-workspace-postgres.js';
import type {TrustedCatalogPort} from '../opportunities/owner-catalog-http.js';

const Id=z.string().regex(/^[A-Za-z0-9_-]{1,90}$/);
const Params=z.strictObject({id:Id});
const Empty=z.strictObject({});
const List=z.strictObject({afterId:Id.optional(),
  limit:z.coerce.number().int().min(1).max(50).optional()});
const FromOpportunity=z.strictObject({itemId:Id,opportunityId:Id});
type Ctx={
  app:FastifyInstance;store:OwnerWorkspacePort;session:BetaRouteVerifier;
  catalog?:TrustedCatalogPort;
};
const guarded=async<T>(action:()=>Promise<T>):Promise<T>=>{
  try{return await action();}
  catch(error){
    if(error instanceof WorkspaceDenied)throw new ApiFailure('FORBIDDEN');
    if(error instanceof WorkspaceConflict)throw new ApiFailure('VERSION_CONFLICT');
    if(error instanceof WorkspaceQuota)throw new ApiFailure('RATE_LIMITED');
    if(error instanceof z.ZodError)throw error;
    throw new ApiFailure('PROVIDER_UNAVAILABLE');
  }
};
/** Exact A13 owner CRUD paths, not demo SubjectAlias storage, school enrolment
 * judgment, an external application submission, or an NCP provider.
 */
export function registerOwnerWorkspaceRoutes(options:Ctx):void{
  const {app,store,session,catalog}=options;
  const list=(path:string,kind:WorkspaceKind)=>{
    app.get(path,async request=>{
      const q=List.parse(request.query);
      const actor=await betaActor(request,session);
      const result=await guarded(()=>store.list({actorId:actor.actorId,kind,
        limit:q.limit??50,...(q.afterId?{afterId:q.afterId}:{})}));
      await betaRecheck(request,session,actor);
      return result;
    });
  };
  const get=(path:string,kind:WorkspaceKind)=>{
    app.get(path,async request=>{
      const {id}=Params.parse(request.params);Empty.parse(request.query);
      const actor=await betaActor(request,session);
      const item=await guarded(()=>store.read({actorId:actor.actorId,kind,itemId:id}));
      await betaRecheck(request,session,actor);
      return {item};
    });
  };
  const create=(path:string,kind:WorkspaceKind)=>{
    app.post(path,async(request,reply)=>{
      const input=OwnerWorkspaceCreateSchema.parse(request.body);
      Empty.parse(request.query);
      if(input.value.kind!==kind)throw new ApiFailure('INVALID_INPUT');
      const actor=await betaActor(request,session);
      const record=await guarded(()=>store.create({...input,actorId:actor.actorId}));
      if(record.value.kind!==kind||record.itemId!==input.itemId||record.version!==1)
        throw new ApiFailure('PROVIDER_UNAVAILABLE');
      await betaRecheck(request,session,actor);
      reply.code(201);return {item:record};
    });
  };
  const update=(path:string,kind:WorkspaceKind,method:'PUT'|'PATCH')=>{
    app.route({method,url:path,handler:async request=>{
      const {id}=Params.parse(request.params);Empty.parse(request.query);
      const input=OwnerWorkspaceUpdateSchema.parse(request.body);
      if(input.value.kind!==kind)throw new ApiFailure('INVALID_INPUT');
      const actor=await betaActor(request,session);
      const record=await guarded(()=>store.update({actorId:actor.actorId,kind,
        itemId:id,...input}));
      if(record.value.kind!==kind||record.itemId!==id
        ||record.version!==input.expectedVersion+1)
        throw new ApiFailure('PROVIDER_UNAVAILABLE');
      await betaRecheck(request,session,actor);
      return {item:record};
    }});
  };
  const remove=(path:string,kind:WorkspaceKind)=>{
    app.delete(path,async request=>{
      const {id}=Params.parse(request.params);Empty.parse(request.query);
      const input=OwnerWorkspaceDeleteSchema.parse(request.body);
      const actor=await betaActor(request,session);
      const result=await guarded(()=>store.delete({actorId:actor.actorId,kind,
        itemId:id,expectedVersion:input.expectedVersion}));
      if(result.version!==input.expectedVersion+1)
        throw new ApiFailure('PROVIDER_UNAVAILABLE');
      await betaRecheck(request,session,actor);
      return result;
    });
  };
  list('/api/experience/cards','EXPERIENCE');
  get('/api/experience/cards/:id','EXPERIENCE');
  create('/api/experience/cards','EXPERIENCE');
  update('/api/experience/cards/:id','EXPERIENCE','PATCH');
  remove('/api/experience/cards/:id','EXPERIENCE');

  list('/api/study-plans','STUDY_PLAN');
  create('/api/study-plans','STUDY_PLAN');
  update('/api/study-plans/:id','STUDY_PLAN','PUT');

  list('/api/saved-items','BOOKMARK');
  create('/api/saved-items','BOOKMARK');
  remove('/api/saved-items/:id','BOOKMARK');

  list('/api/action-plans','ACTION_PLAN');
  create('/api/action-plans','ACTION_PLAN');
  update('/api/action-plans/:id','ACTION_PLAN','PATCH');

  // A13: create only a private draft from an independently current and
  // permission-scoped approved opportunity. No actual external application.
  if(catalog)app.post('/api/experience/from-opportunity',async(request,reply)=>{
    Empty.parse(request.query);
    const {itemId,opportunityId}=FromOpportunity.parse(request.body);
    const actor=await betaActor(request,session);
    let resolved:Awaited<ReturnType<TrustedCatalogPort['getOpportunity']>>;
    try{resolved=await catalog.getOpportunity({
      actorId:actor.actorId,id:opportunityId,now:session.now(),
    });}catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    if(!resolved)throw new ApiFailure('FORBIDDEN');
    let detail;
    try{detail=OpportunityCatalogDetailSchema.parse(resolved.result);}
    catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    if(detail.opportunity.id!==opportunityId
      ||detail.opportunity.title.length>120
      ||(detail.source.status==='ACTIVE'&&(!detail.source.verifiedAt
        ||Date.parse(detail.source.verifiedAt)>Date.parse(session.now()))))
      throw new ApiFailure('FORBIDDEN');
    let valid=false;
    try{valid=await catalog.revalidate({actorId:actor.actorId,
      scopeToken:resolved.scopeToken,now:session.now()})===true;}
    catch{/* deny */}
    if(!valid)throw new ApiFailure('FORBIDDEN');
    const record=await guarded(()=>store.create({
      actorId:actor.actorId,itemId,value:{
        kind:'EXPERIENCE',state:'DRAFT',title:detail.opportunity.title,summary:'',
        sourceOpportunityId:opportunityId,
        dataMode:detail.opportunity.dataMode==='SYNTHETIC'?'SYNTHETIC':'OWNER_CONSENTED',
      },
    }));
    if(record.itemId!==itemId||record.version!==1
      ||record.value.kind!=='EXPERIENCE'||record.value.state!=='DRAFT')
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    await betaRecheck(request,session,actor);
    reply.code(201);return {item:record};
  });
}
