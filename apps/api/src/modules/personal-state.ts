import {z} from 'zod';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {
  PersonalRecordValueSchema,PersonalStateDenied,PersonalStateConflict,
} from '../db/personal-state-postgres.js';
import type {
  PostgresPersonalStateStore,PersonalKind,StoredPersonalRecord,TrustedPersonalScope,
} from '../db/personal-state-postgres.js';
import {ApiFailure} from './auth/gates.js';

/** The injected store retains independent owner-consent and synthetic-fixture checks. */
export interface PersonalStatePort extends Pick<PostgresPersonalStateStore,
  'create'|'read'|'list'|'update'|'delete'> {}
type Section='FEED'|'NOTICES'|'ACADEMICS'|'EXPERIENCE';
const sections:Record<PersonalKind,Section>={
  EXPERIENCE:'EXPERIENCE',BOOKMARK:'FEED',READ_RECEIPT:'NOTICES',
  PREFERENCES:'FEED',COURSE_PLAN:'ACADEMICS',APPLICATION_DRAFT:'FEED',
};
const Kind=z.enum(['EXPERIENCE','BOOKMARK','READ_RECEIPT','PREFERENCES','COURSE_PLAN','APPLICATION_DRAFT']);
const ItemId=z.string().regex(/^[A-Za-z0-9_-]{1,90}$/);
const Version=z.number().int().positive().max(Number.MAX_SAFE_INTEGER-1);
const Params=z.strictObject({id:z.string().min(1).max(100),itemId:ItemId});
const Context=z.strictObject({id:z.string().min(1).max(100)});
const Value=PersonalRecordValueSchema.superRefine((value,ctx)=>{
  if(value.kind==='EXPERIENCE'&&value.startedOn&&value.endedOn&&value.endedOn<value.startedOn)
    ctx.addIssue({code:'custom',path:['endedOn'],message:'Experience ends before it starts'});
  if(Buffer.byteLength(JSON.stringify(value),'utf8')>8192)
    ctx.addIssue({code:'custom',message:'Personal record too large'});
});
const Create=z.strictObject({itemId:ItemId,value:Value});
const Update=z.strictObject({expectedVersion:Version,value:Value});
const Remove=z.strictObject({kind:Kind,expectedVersion:Version});
const Read=z.strictObject({kind:Kind});
const List=z.strictObject({kind:Kind,afterId:ItemId.optional(),limit:z.coerce.number().int().min(1).max(100).optional()});
const PublicRecord=z.strictObject({
  itemId:ItemId,kind:Kind,version:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  value:Value,updatedAt:z.iso.datetime({offset:true}),
});
function publicRecord(record:StoredPersonalRecord,scope:TrustedPersonalScope,kind:PersonalKind,itemId?:string){
  if(record.actorId!==scope.actorId||record.subjectId!==scope.subjectId
    ||record.kind!==kind||record.value.kind!==kind
    ||(itemId!==undefined&&record.itemId!==itemId))throw new ApiFailure('FORBIDDEN');
  const parsed=PublicRecord.safeParse({itemId:record.itemId,kind:record.kind,
    version:record.version,value:record.value,updatedAt:record.updatedAt});
  if(!parsed.success)throw new ApiFailure('PROVIDER_UNAVAILABLE');
  return parsed.data;
}
async function stored<T>(operation:()=>Promise<T>):Promise<T>{
  try{return await operation();}
  catch(error){
    if(error instanceof PersonalStateDenied)throw new ApiFailure('FORBIDDEN');
    if(error instanceof PersonalStateConflict)throw new ApiFailure('VERSION_CONFLICT');
    throw new ApiFailure('PROVIDER_UNAVAILABLE');
  }
}
/**
 * Registered inside the API's authenticated, no-store, Origin/CSRF protected scope.
 * Authorization resolves actor/session/context/current grant on EVERY operation.
 * REVIEWER sandbox actions use separate routes and never reach this store.
 */
export function registerPersonalStateRoutes(app:FastifyInstance,options:{
  store:PersonalStatePort|undefined;
  authorize(request:FastifyRequest,contextId:string,section:Section):Promise<TrustedPersonalScope>;
}):void {
  const authorize=async(request:FastifyRequest,id:string,kind:PersonalKind)=>{
    const scope=await options.authorize(request,id,sections[kind]);
    if(!options.store)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    return {scope,store:options.store};
  };
  app.post('/api/demo/contexts/:id/personal',async(request,reply)=>{
    const {id}=Context.parse(request.params),body=Create.parse(request.body);
    const {scope,store}=await authorize(request,id,body.value.kind);
    const result=await stored(()=>store.create({scope,itemId:body.itemId,value:body.value}));
    const response=publicRecord(result,scope,body.value.kind,body.itemId);
    if(response.version!==1)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    reply.code(201);return response;
  });
  app.get('/api/demo/contexts/:id/personal',async(request)=>{
    const {id}=Context.parse(request.params),query=List.parse(request.query);
    const {scope,store}=await authorize(request,id,query.kind);
    const results=await stored(()=>store.list({scope,kind:query.kind,
      ...(query.afterId!==undefined?{afterId:query.afterId}:{}),
      ...(query.limit!==undefined?{limit:query.limit}:{}),
    }));
    if(!Array.isArray(results)||results.length>(query.limit??50))throw new ApiFailure('PROVIDER_UNAVAILABLE');
    return {items:results.map(result=>publicRecord(result,scope,query.kind))};
  });
  app.get('/api/demo/contexts/:id/personal/:itemId',async(request)=>{
    const {id,itemId}=Params.parse(request.params),{kind}=Read.parse(request.query);
    const {scope,store}=await authorize(request,id,kind);
    const result=await stored(()=>store.read({scope,kind,itemId}));
    return result===null?{item:null}:publicRecord(result,scope,kind,itemId);
  });
  app.put('/api/demo/contexts/:id/personal/:itemId',async(request)=>{
    const {id,itemId}=Params.parse(request.params),body=Update.parse(request.body);
    const {scope,store}=await authorize(request,id,body.value.kind);
    const result=await stored(()=>store.update({scope,itemId,...body}));
    const response=publicRecord(result,scope,body.value.kind,itemId);
    if(response.version!==body.expectedVersion+1)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    return response;
  });
  app.delete('/api/demo/contexts/:id/personal/:itemId',async(request)=>{
    const {id,itemId}=Params.parse(request.params),body=Remove.parse(request.body);
    const {scope,store}=await authorize(request,id,body.kind);
    const result=await stored(()=>store.delete({scope,itemId,...body}));
    if(result.version!==body.expectedVersion+1)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    return {version:result.version};
  });
}
