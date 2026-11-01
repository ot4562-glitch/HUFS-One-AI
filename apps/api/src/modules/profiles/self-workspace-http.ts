import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {
  OwnerWorkspaceCreateSchema,OwnerWorkspaceUpdateSchema,
  OwnerWorkspaceDeleteSchema,OwnerWorkspaceRecordSchema,OpportunityCatalogDetailSchema,
  BookmarkStagePatchSchema,isNextBookmarkStage,
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
const OwnerList=z.strictObject({items:z.array(OwnerWorkspaceRecordSchema).max(50),
  nextCursor:Id.nullable()});
const DeleteReceipt=z.strictObject({version:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)});
function checkedRecord(raw:unknown,kind:WorkspaceKind,id?:string){
  const parsed=OwnerWorkspaceRecordSchema.safeParse(raw);
  if(!parsed.success||parsed.data.value.kind!==kind
    ||id!==undefined&&parsed.data.itemId!==id)
    throw new ApiFailure('PROVIDER_UNAVAILABLE');
  return parsed.data;
}
function checkedList(raw:unknown,kind:WorkspaceKind,limit:number,afterId?:string){
  const parsed=OwnerList.safeParse(raw);
  if(!parsed.success)throw new ApiFailure('PROVIDER_UNAVAILABLE');
  const {items,nextCursor}=parsed.data;
  if(items.length>limit
    ||items.some((item,i)=>item.value.kind!==kind
      ||afterId!==undefined&&item.itemId<=afterId
      ||i>0&&items[i-1]!.itemId>=item.itemId)
    ||nextCursor!==null
      &&(items.length!==limit||nextCursor!==items[items.length-1]?.itemId))
    throw new ApiFailure('PROVIDER_UNAVAILABLE');
  return parsed.data;
}
function checkedDelete(raw:unknown){
  const parsed=DeleteReceipt.safeParse(raw);
  if(!parsed.success)throw new ApiFailure('PROVIDER_UNAVAILABLE');
  return parsed.data;
}
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
      const safe=checkedList(result,kind,q.limit??50,q.afterId);
      await betaRecheck(request,session,actor);
      return safe;
    });
  };
  const get=(path:string,kind:WorkspaceKind)=>{
    app.get(path,async request=>{
      const {id}=Params.parse(request.params);Empty.parse(request.query);
      const actor=await betaActor(request,session);
      const item=await guarded(()=>store.read({actorId:actor.actorId,kind,itemId:id}));
      const safe=item===null?null:checkedRecord(item,kind,id);
      await betaRecheck(request,session,actor);
      return {item:safe};
    });
  };
  const create=(path:string,kind:WorkspaceKind)=>{
    app.post(path,async(request,reply)=>{
      const input=OwnerWorkspaceCreateSchema.parse(request.body);
      Empty.parse(request.query);
      if(input.value.kind!==kind)throw new ApiFailure('INVALID_INPUT');
      const actor=await betaActor(request,session);
      const record=checkedRecord(await guarded(()=>store.create({...input,actorId:actor.actorId})),kind,input.itemId);
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
      const record=checkedRecord(await guarded(()=>store.update({actorId:actor.actorId,kind,
        itemId:id,...input})),kind,id);
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
      const result=checkedDelete(await guarded(()=>store.delete({actorId:actor.actorId,kind,
        itemId:id,expectedVersion:input.expectedVersion})));
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
  // #80: only the authenticated owner can advance the saved item's
  // self-reported application stage. A legacy SAVED record has no stage.
  // The store owns the *atomic* actor + item + expectedVersion CAS and must
  // recheck current personal-storage consent/rights inside its transaction.
  app.patch('/api/saved-items/:id',async request=>{
    const {id}=Params.parse(request.params);Empty.parse(request.query);
    const input=BookmarkStagePatchSchema.parse(request.body);
    const actor=await betaActor(request,session);
    const raw=await guarded(()=>store.read({
      actorId:actor.actorId,kind:'BOOKMARK',itemId:id,
    }));
    if(raw===null)throw new ApiFailure('VERSION_CONFLICT');
    const previous=checkedRecord(raw,'BOOKMARK',id);
    if(previous.value.kind!=='BOOKMARK')throw new ApiFailure('PROVIDER_UNAVAILABLE');
    if(previous.version!==input.expectedVersion
      ||!isNextBookmarkStage(previous.value.stage,input.stage))
      throw new ApiFailure('VERSION_CONFLICT');
    // Do not accept changes to opportunityId, dataMode, or the SAVED marker.
    await betaRecheck(request,session,actor);
    const value={
      ...previous.value,stage:input.stage,
      ...(input.outcome?{outcome:input.outcome}:{}),
    };
    const updated=checkedRecord(await guarded(()=>store.update({
      actorId:actor.actorId,kind:'BOOKMARK',itemId:id,
      expectedVersion:input.expectedVersion,value,
    })),'BOOKMARK',id);
    if(updated.version!==input.expectedVersion+1
      ||JSON.stringify(updated.value)!==JSON.stringify(value))
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    await betaRecheck(request,session,actor);
    return {item:updated};
  });
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
    const record=checkedRecord(await guarded(()=>store.create({
      actorId:actor.actorId,itemId,value:{
        kind:'EXPERIENCE',state:'DRAFT',title:detail.opportunity.title,summary:'',
        sourceOpportunityId:opportunityId,
        dataMode:detail.opportunity.dataMode==='SYNTHETIC'?'SYNTHETIC':'OWNER_CONSENTED',
      },
    })), 'EXPERIENCE',itemId);
    if(record.itemId!==itemId||record.version!==1
      ||record.value.kind!=='EXPERIENCE'||record.value.state!=='DRAFT')
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    await betaRecheck(request,session,actor);
    reply.code(201);return {item:record};
  });
}
