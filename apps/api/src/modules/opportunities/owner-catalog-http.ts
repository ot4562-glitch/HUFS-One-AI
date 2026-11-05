import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {
  OwnerTranscriptSchema,CourseCatalogPageSchema,CourseOfferingsPageSchema,
  AcademicTermVNextSchema,
  OpportunityCatalogPageSchema,OpportunityCatalogDetailSchema,
} from '@hufs-one/contracts';
import type {
  OwnerTranscript,CourseCatalogPage,CourseOfferingsPage,
  OpportunityCatalogPage,OpportunityCatalogDetail,
} from '@hufs-one/contracts';
import {ApiFailure} from '../auth/gates.js';
import {ReceiptAdmissionError} from '../auth/owner-receipts.js';
import {betaActor,betaRecheck} from '../profiles/self-account-http.js';
import type {BetaRouteVerifier} from '../profiles/self-account-http.js';

const Empty=z.strictObject({});
const Name=z.string().regex(/^[A-Za-z0-9_:-]{1,90}$/);
const Params=z.strictObject({id:Name});
const Listing=z.strictObject({
  q:z.string().trim().min(2).max(100).optional(),
  afterId:Name.optional(),
  limit:z.coerce.number().int().min(1).max(50).optional(),
  asOf:z.iso.datetime({offset:true}).optional(),
});
const Offerings=z.strictObject({
  afterId:AcademicTermVNextSchema.optional(),
  limit:z.coerce.number().int().min(1).max(50).optional(),
  asOf:z.iso.datetime({offset:true}).optional(),
});
export type CatalogRequest={
  actorId:string;now:string;asOf:string;limit:number;afterId?:string;q?:string;
};
export type ReadReceipt<T>={
  /** Server-only; never part of the HTTP body. Must bind permission, source-head,
   * actor, row scope and request version in the trusted adapter. */
  scopeToken:string;result:T;
};
export interface TrustedCatalogPort{
  readTranscript(input:{actorId:string;now:string}):
    Promise<ReadReceipt<OwnerTranscript>|null>;
  listCourses(input:CatalogRequest):Promise<ReadReceipt<CourseCatalogPage>|null>;
  listOfferings(input:CatalogRequest&{courseId:string}):
    Promise<ReadReceipt<CourseOfferingsPage>|null>;
  listOpportunities(input:CatalogRequest):
    Promise<ReadReceipt<OpportunityCatalogPage>|null>;
  getOpportunity(input:{actorId:string;now:string;id:string}):
    Promise<ReadReceipt<OpportunityCatalogDetail>|null>;
  /** Must compare latest source head, permitted purpose and scoped selection
   * with the receipt while locked/atomically observed; not a cached boolean. */
  revalidate(input:{actorId:string;scopeToken:string;now:string}):Promise<boolean>;
}
function assertSourceFresh(value:{
  source:{status:'ACTIVE'|'SYNTHETIC';verifiedAt?:string|undefined};
},asOf:string):void{
  if(value.source.status==='ACTIVE'&&(
    !value.source.verifiedAt||Date.parse(value.source.verifiedAt)>Date.parse(asOf)))
    throw new ApiFailure('FORBIDDEN');
}
function assertPage<T extends {items:readonly unknown[];asOf:string;nextCursor:string|null}>(
  page:T,at:string,limit:number,extract:(item:T['items'][number])=>string,
  afterId?:string,
):void{
  if(page.asOf!==at||page.items.length>limit
    ||page.items.some((item,i)=>(i>0&&extract(page.items[i-1])>=extract(item))
      ||(afterId!==undefined&&extract(item)<=afterId)))
    throw new ApiFailure('PROVIDER_UNAVAILABLE');
  const last=page.items.length?extract(page.items[page.items.length-1]):null;
  if(page.nextCursor!==null&&(last===null||page.nextCursor!==last))
    throw new ApiFailure('PROVIDER_UNAVAILABLE');
}
export function registerOwnerCatalogRoutes(
  app:FastifyInstance,catalog:TrustedCatalogPort,session:BetaRouteVerifier,
):void{
  const serve=async<T>(request:Parameters<typeof betaActor>[0],
    fetch:(actorId:string,now:string)=>Promise<ReadReceipt<T>|null>,
    validate:(raw:unknown)=>T):Promise<T>=>{
    const actor=await betaActor(request,session);
    let value:ReadReceipt<T>|null;
    try{value=await fetch(actor.actorId,session.now());}
    catch(error){if(error instanceof ReceiptAdmissionError)throw error;throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    if(!value)throw new ApiFailure('FORBIDDEN');
    if(!value.scopeToken||value.scopeToken.length>2048)
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    let result:T;
    try{result=validate(value.result);}
    catch(error){
      if(error instanceof ApiFailure)throw error;
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    }
    await betaRecheck(request,session,actor);
    let okay=false;
    try{okay=await catalog.revalidate({
      actorId:actor.actorId,scopeToken:value.scopeToken,now:session.now(),
    })===true;}catch{/* current policy unavailable means deny */}
    if(!okay)throw new ApiFailure('FORBIDDEN');
    await betaRecheck(request,session,actor);
    return result;
  };
  const query=(raw:unknown):{
    now:string;asOf:string;limit:number;afterId?:string;q?:string;
  }=>{
    const q=Listing.parse(raw),now=session.now(),asOf=q.asOf??now;
    if(Date.parse(asOf)>Date.parse(now))throw new ApiFailure('INVALID_INPUT');
    return {now,asOf,limit:q.limit??50,
      ...(q.afterId?{afterId:q.afterId}:{}),...(q.q?{q:q.q}:{})};
  };
  app.get('/api/academics/transcript',async request=>{
    Empty.parse(request.query);
    return {transcript:await serve(request,(actorId,now)=>catalog.readTranscript({actorId,now}),
      raw=>{
        const x=OwnerTranscriptSchema.parse(raw);
        if(Date.parse(x.asOf)>Date.parse(session.now())
          ||Date.parse(x.reviewedAt)>Date.parse(x.asOf))
          throw new ApiFailure('FORBIDDEN');
        return x;
      })};
  });
  app.get('/api/courses',async request=>{
    const q=query(request.query);
    return serve(request,actorId=>catalog.listCourses({actorId,...q}),raw=>{
      const x=CourseCatalogPageSchema.parse(raw);
      assertPage(x,q.asOf,q.limit,item=>item.courseId,q.afterId);
      for(const item of x.items)assertSourceFresh(item,q.asOf);
      return x;
    });
  });
  app.get('/api/courses/:id/offerings',async request=>{
    const {id}=Params.parse(request.params);
    const rq=Offerings.parse(request.query);
    const q=query(rq);
    return serve(request,actorId=>catalog.listOfferings({actorId,...q,courseId:id}),raw=>{
      const x=CourseOfferingsPageSchema.parse(raw);
      if(x.items.some(item=>item.courseId!==id))
        throw new ApiFailure('PROVIDER_UNAVAILABLE');
      // Do not trust the provider's after-term cursor: ordering, page cutoff and
      // continuation must agree with the one-term/one-status contract.
      assertPage(x,q.asOf,q.limit,item=>item.term,q.afterId);
      for(const item of x.items)assertSourceFresh(item,q.asOf);
      return x;
    });
  });
  app.get('/api/opportunities',async request=>{
    const q=query(request.query);
    return serve(request,actorId=>catalog.listOpportunities({actorId,...q}),raw=>{
      const x=OpportunityCatalogPageSchema.parse(raw);
      assertPage(x,q.asOf,q.limit,item=>item.opportunity.id,q.afterId);
      for(const item of x.items){
        assertSourceFresh(item,q.asOf);
        if(item.opportunity.verifiedAt&&Date.parse(item.opportunity.verifiedAt)>Date.parse(q.asOf))
          throw new ApiFailure('FORBIDDEN');
      }
      return x;
    });
  });
  app.get('/api/opportunities/:id',async request=>{
    const {id}=Params.parse(request.params);
    Empty.parse(request.query);
    return serve(request,(actorId,now)=>catalog.getOpportunity({actorId,now,id}),raw=>{
      const x=OpportunityCatalogDetailSchema.parse(raw);
      if(x.opportunity.id!==id)throw new ApiFailure('FORBIDDEN');
      assertSourceFresh(x,session.now());
      if(x.opportunity.verifiedAt&&Date.parse(x.opportunity.verifiedAt)>Date.parse(session.now()))
        throw new ApiFailure('FORBIDDEN');
      return x;
    });
  });
}
