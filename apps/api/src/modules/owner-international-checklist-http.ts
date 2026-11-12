import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {FeatureAdditions as V,OwnerWorkspaceRecordSchema} from '@hufs-one/contracts';
import {resolveInternationalGuide,reconcileGuideChecklist} from '../../../../packages/core/src/feature-additions/international-v2.js';
import {ApiFailure} from './auth/gates.js';
import {betaActor,betaRecheck,type BetaRouteVerifier} from './profiles/self-account-http.js';
import {WorkspaceConflict,WorkspaceDenied,WorkspaceQuota} from './profiles/self-workspace-postgres.js';
import type {OwnerInsightsServices,OwnerInsightsSnapshot} from './owner-v2-insights-http.js';
const Id=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),Locale=z.enum(['ko','en','zh']);
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const blank={state:'READY' as const,checkedStepIds:[],invalidatedStepIds:[],officialAdministrationComplete:false as const};
export function registerInternationalChecklistRoutes(options:{app:FastifyInstance;session:BetaRouteVerifier;
  services:OwnerInsightsServices|undefined;parse:(raw:unknown)=>OwnerInsightsSnapshot}){
  const {app,session,services}=options;
  for(const method of ['GET','PUT'] as const)app.route({method,
    url:'/api/owner/features/v2/international/:id/checklist',handler:async(req,reply)=>{
      reply.header('Cache-Control','no-store');
      const {id}=z.strictObject({id:Id}).parse(req.params);
      const queryLocale=method==='GET'?z.strictObject({locale:Locale.default('ko')}).parse(req.query).locale
        :(z.strictObject({}).parse(req.query),'ko' as const);
      const change=method==='PUT'?V.GuideChecklistWriteV2Schema.parse(req.body):undefined;
      const actor=await betaActor(req,session),asOf=session.now();
      if(!services?.checklists){await betaRecheck(req,session,actor);return {state:'NOT_CONNECTED' as const};}
      const store=services.checklists;
      try{
        if(await services.quota.consume({actorId:actor.actorId,kind:'INTERNATIONAL',now:asOf})!==true)
          throw new ApiFailure('RATE_LIMITED');
        await betaRecheck(req,session,actor);
        const raw=await services.source.read({actorId:actor.actorId,kind:'INTERNATIONAL',asOf});
        if(raw===null)throw new ApiFailure('FORBIDDEN');
        const snapshot=options.parse(raw);
        if(snapshot.kind!=='INTERNATIONAL'||snapshot.receipt.actorId!==actor.actorId
          ||Date.parse(snapshot.receipt.expiresAt)<=Date.parse(session.now())
          ||new Set(snapshot.guides.map(g=>g.guide.id)).size!==snapshot.guides.length)
          throw new ApiFailure('PROVIDER_UNAVAILABLE');
        const entry=snapshot.guides.find(g=>g.guide.id===id);
        if(!entry)throw new ApiFailure('FORBIDDEN');
        const recheck=async()=>{
          await betaRecheck(req,session,actor);
          if(Date.parse(snapshot.receipt.expiresAt)<=Date.parse(session.now())
            ||await services.source.revalidate({actorId:actor.actorId,kind:'INTERNATIONAL',receipt:snapshot.receipt,now:session.now()})!==true)
            throw new ApiFailure('FORBIDDEN');
          await betaRecheck(req,session,actor);
          if(Date.parse(snapshot.receipt.expiresAt)<=Date.parse(session.now()))throw new ApiFailure('FORBIDDEN');
        };
        await recheck();
        const locale=change?.locale??queryLocale;
        const resolved=resolveInternationalGuide({locale,guide:entry.guide,asOf,mode:'LIVE',
          topicCode:entry.selection.topicCode,audienceCodes:entry.selection.audienceCodes,
          ...(entry.selection.campus?{campus:entry.selection.campus}:{}),
          ...(entry.selection.term?{term:entry.selection.term}:{})});
        const usable=resolved.status==='READY'||resolved.status==='KOREAN_FALLBACK';
        const translationVersion=usable?entry.guide.translations[resolved.locale]!.translationVersion:null;
        const contextVersion=hash({actorId:actor.actorId,source:snapshot.receipt.sourceVersion,
          consent:snapshot.receipt.consentVersion,rights:snapshot.receipt.rightsVersion});
        // Consent epochs get different item identities, preventing old writes
        // from reviving a withdrawn record. Versions still CAS within an epoch.
        const itemId='guide-'+hash({guideId:id,consent:snapshot.receipt.consentVersion});
        let record=usable?await store.read({actorId:actor.actorId,kind:'GUIDE_CHECKLIST',itemId}):null;
        const checkedRecord=(raw:unknown)=>{
          const r=OwnerWorkspaceRecordSchema.parse(raw);
          if(r.itemId!==itemId||r.value.kind!=='GUIDE_CHECKLIST'||r.value.guideId!==id)
            throw new ApiFailure('PROVIDER_UNAVAILABLE');
          return r;
        };
        if(record)record=checkedRecord(record);
        if(change){
          if(!usable||change.guideRevisionId!==resolved.sourceRevisionId||change.displayedLocale!==resolved.locale
            ||change.translationVersion!==translationVersion||change.contextVersion!==contextVersion)
            throw new ApiFailure('VERSION_CONFLICT');
          const allowed=new Set(resolved.steps.map(s=>s.id));
          z.array(Id.refine(step=>allowed.has(step))).parse(change.checkedStepIds);
          if((record?.version??0)!==change.expectedVersion)throw new ApiFailure('VERSION_CONFLICT');
          const value={kind:'GUIDE_CHECKLIST' as const,dataMode:'OWNER_CONSENTED' as const,state:'SELF_REPORTED' as const,
            guideId:id,guideRevisionId:resolved.sourceRevisionId,locale:resolved.locale,translationVersion:translationVersion!,
            contextVersion,ownerCheckedStepIds:[...change.checkedStepIds].sort()};
          await recheck();
          record=checkedRecord(record?await store.update({actorId:actor.actorId,kind:'GUIDE_CHECKLIST',itemId,
            expectedVersion:change.expectedVersion,value}):await store.create({actorId:actor.actorId,itemId,value}));
          if(record.version!==change.expectedVersion+1||JSON.stringify(record.value)!==JSON.stringify(value))
            throw new ApiFailure('PROVIDER_UNAVAILABLE');
        }
        let checklist:ReturnType<typeof reconcileGuideChecklist>=usable?blank:{...blank,state:'STALE_GUIDE'};
        if(record&&record.value.kind==='GUIDE_CHECKLIST'){
          const saved=record.value;
          checklist=saved.locale!==resolved.locale||saved.contextVersion!==contextVersion
            ?{...blank,state:'STALE_GUIDE',invalidatedStepIds:[...saved.ownerCheckedStepIds].sort()}
            :reconcileGuideChecklist(entry.guide,{...saved,expectedVersion:record.version},record.version,asOf,'LIVE');
        }
        await recheck();
        return V.GuideChecklistResponseV2Schema.parse({state:'READY',guide:resolved,translationVersion,
          contextVersion,version:record?.version??0,checklist});
      }catch(error){
        if(error instanceof ApiFailure||error instanceof z.ZodError)throw error;
        if(error instanceof WorkspaceDenied)throw new ApiFailure('FORBIDDEN');
        if(error instanceof WorkspaceConflict)throw new ApiFailure('VERSION_CONFLICT');
        if(error instanceof WorkspaceQuota)throw new ApiFailure('RATE_LIMITED');
        throw new ApiFailure('PROVIDER_UNAVAILABLE');
      }
    }});
}
