import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ActivityRecordSchema,ExchangeApplicantSchema,ExchangePolicySchema,
  FaqDocumentSchema,type ActivityRecord,type ExchangePolicy,type FaqDocument} from '@hufs-one/contracts';
import type {VerifiedActor,VerifySession} from '../types.js';
import {ApiFailure,authorizeSession,requireStateChangeProof} from './auth/gates.js';
import {archiveActivities,forecastActivity} from '../../../../packages/core/src/campus-assist/activities.js';
import {evaluateExchange} from '../../../../packages/core/src/campus-assist/exchange.js';
import {retrieveFaqEvidence} from '../../../../packages/core/src/campus-assist/faq.js';
import {buildFaqHcx007Request,parseFaqHcx007Response} from '../../../../packages/ai/src/faq-hcx007.js';

const Iso=z.iso.datetime({offset:true});
const Id=z.string().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/);
interface Receipt{actorId:string;sourceVersion:string;expiresAt:string;}
interface Snapshot<T>{items:readonly T[];receipt:Receipt;}
interface SourcePort<T>{
  read(input:{actor:VerifiedActor;asOf:string}):Promise<Snapshot<T>|null>;
  revalidate(input:{actor:VerifiedActor;receipt:Receipt;now:string}):Promise<boolean>;
}
/** Only server-owned approved source snapshots; no request-controlled source URL or raw text. */
export interface CampusAssistServices{
  activities?:SourcePort<ActivityRecord>;
  exchange?:SourcePort<ExchangePolicy>;
  faq?:SourcePort<FaqDocument>;
  /** Optional billable provider, default ABSENT. Must enforce durable budget and per-actor quota
   * before any external call and never silently substitute a mock model. */
  hcx007?:{
    admit(input:{actor:VerifiedActor;sourceVersion:string;now:string}):Promise<boolean>;
    execute(input:{actor:VerifiedActor;wire:ReturnType<typeof buildFaqHcx007Request>}):Promise<unknown>;
  };
}
interface Session{verify:VerifySession;now:()=>string;allowedOrigin:string;}
const Read=z.strictObject({
  asOf:Iso,organizationId:Id.optional(),year:z.coerce.number().int().min(2000).max(2200).optional(),
  query:z.string().max(100).optional(),
});
const Forecast=z.strictObject({asOf:Iso,organizationId:Id,seriesId:Id,
  targetYear:z.coerce.number().int().min(2000).max(2200)});
const Exchange=z.strictObject({asOf:Iso,partnerId:Id,applicant:ExchangeApplicantSchema});
const Ask=z.strictObject({asOf:Iso,question:z.string().trim().min(2).max(500)});
/** Only explicitly injected, currently revalidated BETA routes. No public or synthetic backdoor. */
export function registerCampusAssistRoutes(app:FastifyInstance,services:CampusAssistServices,session:Session):void{
  const verify=async(request:Parameters<VerifySession>[0]):Promise<VerifiedActor>=>{
    const actor=authorizeSession(await session.verify(request),session.now());
    if(actor.role!=='BETA')throw new ApiFailure('FORBIDDEN');
    return actor;
  };
  const same=async(request:Parameters<VerifySession>[0],actor:VerifiedActor):Promise<VerifiedActor>=>{
    const fresh=await verify(request);
    if(fresh.actorId!==actor.actorId||fresh.sessionIdHash!==actor.sessionIdHash)
      throw new ApiFailure('FORBIDDEN');
    return fresh;
  };
  const read=async<T>(port:SourcePort<T>,actor:VerifiedActor,asOf:string):Promise<Snapshot<T>>=>{
    if(Date.parse(asOf)>Date.parse(session.now()))throw new ApiFailure('FORBIDDEN');
    const snapshot=await port.read({actor,asOf});
    if(!snapshot||snapshot.receipt.actorId!==actor.actorId||!snapshot.receipt.sourceVersion
      ||Date.parse(snapshot.receipt.expiresAt)<=Date.parse(session.now()))
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    return snapshot;
  };
  const current=async<T>(request:Parameters<VerifySession>[0],actor:VerifiedActor,port:SourcePort<T>,snapshot:Snapshot<T>)=>{
    const fresh=await same(request,actor);
    if(!await port.revalidate({actor:fresh,receipt:snapshot.receipt,now:session.now()}))
      throw new ApiFailure('FORBIDDEN');
  };
  if(services.activities){
    const port=services.activities;
    app.get('/api/owner/activities',async req=>{
      const actor=await verify(req),args=Read.parse(req.query);
      const snapshot=await read(port,actor,args.asOf);
      const rows=ActivityRecordSchema.array().max(10000).parse(snapshot.items);
      const answer=archiveActivities(rows,args.asOf,{
        ...(args.organizationId?{organizationId:args.organizationId}:{}),
        ...(args.year?{year:args.year}:{}),...(args.query?{query:args.query}:{})});
      await current(req,actor,port,snapshot);
      return {asOf:args.asOf,sourceVersion:snapshot.receipt.sourceVersion,items:answer.slice(0,200)};
    });
    app.get('/api/owner/activities/forecast',async req=>{
      const actor=await verify(req),args=Forecast.parse(req.query);
      const snapshot=await read(port,actor,args.asOf);
      const rows=ActivityRecordSchema.array().max(10000).parse(snapshot.items);
      const answer=forecastActivity(rows,args.asOf,args.targetYear,args.organizationId,args.seriesId);
      await current(req,actor,port,snapshot);
      return answer;
    });
  }
  if(services.exchange){
    const port=services.exchange;
    app.post('/api/owner/exchange/evaluate',async req=>{
      const actor=await verify(req);requireStateChangeProof(req,actor,session.allowedOrigin);
      const args=Exchange.parse(req.body);
      const snapshot=await read(port,actor,args.asOf);
      const rules=ExchangePolicySchema.array().max(500).parse(snapshot.items);
      const matches=rules.filter(r=>r.partnerId===args.partnerId&&r.track===args.applicant.track);
      // An unresolved revision conflict is not a license to pick a convenient policy.
      const policy=matches.length===1?matches[0]!:null;
      const result=evaluateExchange(args.applicant,policy,args.asOf);
      await current(req,actor,port,snapshot);
      return result;
    });
  }
  if(services.faq){
    const port=services.faq;
    app.post('/api/owner/faq/ask',async req=>{
      const actor=await verify(req);requireStateChangeProof(req,actor,session.allowedOrigin);
      const args=Ask.parse(req.body);
      const snapshot=await read(port,actor,args.asOf);
      const docs=FaqDocumentSchema.array().max(10000).parse(snapshot.items);
      const evidence=retrieveFaqEvidence(args.question,docs,args.asOf,6);
      await current(req,actor,port,snapshot);
      if(evidence.length===0)return {status:'NOT_FOUND' as const,evidence:[],asOf:args.asOf};
      if(!services.hcx007)return {status:'CONFIGURATION_REQUIRED' as const,
        evidence:[],asOf:args.asOf};
      if(!await services.hcx007.admit({actor,sourceVersion:snapshot.receipt.sourceVersion,now:session.now()}))
        throw new ApiFailure('RATE_LIMITED');
      const wire=buildFaqHcx007Request(args.question,evidence);
      let raw:unknown;
      try{raw=await services.hcx007.execute({actor,wire});}
      catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
      let validated:ReturnType<typeof parseFaqHcx007Response>;
      try{validated=parseFaqHcx007Response(raw,evidence);}
      catch{throw new ApiFailure('UNVERIFIED_EVIDENCE');}
      await current(req,actor,port,snapshot);
      return {status:'NEEDS_REVIEW' as const,asOf:args.asOf,
        answer:validated.candidate,evidence:evidence.map(e=>({
          citationId:e.citationId,sourceUrl:e.sourceUrl,title:e.title,verifiedAt:e.verifiedAt})),
        usage:validated.usage};
    });
  }
}
