import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {
  SyntheticClubPostSchema,SyntheticClubProfileSchema,
  SyntheticClubBoardResponseSchema,SyntheticClubDetailResponseSchema,SyntheticClubDecisionRequestSchema,
  SyntheticClubDecisionResponseSchema,
} from '@hufs-one/contracts';
import {composeClubBoard} from '../../../../../packages/core/src/opportunities/clubs.js';
import {ApiFailure,authorizeSession} from '../auth/gates.js';
import {betaActor,betaRecheck} from '../profiles/self-account-http.js';
import type {BetaRouteVerifier} from '../profiles/self-account-http.js';
import type {VerifiedTeamActor} from '../../types.js';

const Empty=z.strictObject({});
const Id=z.string().regex(/^SYN-CLUB-[0-9]{3}$/);
const Params=z.strictObject({id:Id});
const Receipt=z.string().regex(/^[A-Za-z0-9_.:-]{8,256}$/);
const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Clock=z.iso.datetime({offset:true});

/** Only server-chosen synthetic inputs. A browser cannot choose another
 * subject's interests, review status, admin approvals or simulated time. */
export interface TrustedSyntheticClubReadPort{
  read(input:{actorId:string;now:string}):Promise<{
    profile:unknown;posts:unknown;asOf:string;receipt:string;revision:string;
  }|null>;
  revalidate(input:{actorId:string;receipt:string;revision:string;now:string}):Promise<boolean>;
}
export interface TrustedSyntheticClubModerationPort{
  /** Must run assertCurrentAdmin within its atomic CAS decision transaction.
   * No real school records or identity provider are part of this simulation. */
  decide(input:{adminActorId:string;postId:string;expectedVersion:number;
    decision:'APPROVE'|'REJECT'|'REVOKE';now:string;
    assertCurrentAdmin:()=>Promise<boolean>}):Promise<unknown>;
}
export interface TrustedSyntheticClubAdminAuthority{
  isApproved(input:{actor:VerifiedTeamActor;now:string}):Promise<boolean>;
}

export function registerSyntheticClubRoutes(options:{
  app:FastifyInstance;session:BetaRouteVerifier;
  source?:TrustedSyntheticClubReadPort;
  moderation?:TrustedSyntheticClubModerationPort;
  adminAuthority?:TrustedSyntheticClubAdminAuthority;
}):void{
  const {app,session,source,moderation,adminAuthority}=options;
  const available=async<T>(f:()=>Promise<T>):Promise<T>=>{
    try{return await f();}catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
  };
  const read=async(request:FastifyRequest)=>{
    const actor=await betaActor(request,session);
    if(!source)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const raw=await available(()=>source.read({actorId:actor.actorId,now:session.now()}));
    if(!raw)throw new ApiFailure('FORBIDDEN');
    if(!Receipt.safeParse(raw.receipt).success||!Ref.safeParse(raw.revision).success
      ||!Clock.safeParse(raw.asOf).success)
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const posts=z.array(SyntheticClubPostSchema).max(100).safeParse(raw.posts);
    const profile=SyntheticClubProfileSchema.safeParse(raw.profile);
    if(!posts.success||!profile.success)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const {campus,...knownProfile}=profile.data;
    const scopedProfile={...knownProfile,...(campus===undefined?{}:{campus})};
    const validatedPosts=posts.data.map(({approvedAt,recruitOpensAt,recruitClosesAt,...post})=>({
      ...post,...(approvedAt===undefined?{}:{approvedAt}),
      ...(recruitOpensAt===undefined?{}:{recruitOpensAt}),
      ...(recruitClosesAt===undefined?{}:{recruitClosesAt}),
    }));
    const board=composeClubBoard(scopedProfile,validatedPosts,{asOf:raw.asOf});
    const dto=SyntheticClubBoardResponseSchema.safeParse({
      mode:'SYNTHETIC_DEMO',approvalNotice:'가상 관리자 승인(시연)',
      applicationNotice:'실제 지원 불가',asOf:board.asOf,configVersion:board.configVersion,
      items:board.all.map(({post,lifecycle,eligibility,reasons,evidenceRefs})=>({
        post,lifecycle,eligibility,reasons,evidenceRefs,
      })),
      recommendedIds:board.recommended.map(x=>x.post.id),
    });
    if(!dto.success)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    await betaRecheck(request,session,actor);
    if(await available(()=>source.revalidate({actorId:actor.actorId,receipt:raw.receipt,
      revision:raw.revision,now:session.now()}))!==true)throw new ApiFailure('FORBIDDEN');
    await betaRecheck(request,session,actor);
    return dto.data;
  };
  app.get('/api/synthetic/clubs',async request=>{
    Empty.parse(request.query);
    return read(request);
  });
  app.get('/api/synthetic/clubs/:id',async request=>{
    Empty.parse(request.query);
    const {id}=Params.parse(request.params);
    const board=await read(request);
    const item=board.items.find(x=>x.post.id===id);
    if(!item)throw new ApiFailure('FORBIDDEN');
    const detail=SyntheticClubDetailResponseSchema.safeParse({
      mode:board.mode,approvalNotice:board.approvalNotice,
      applicationNotice:board.applicationNotice,asOf:board.asOf,item,
    });
    if(!detail.success)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    return detail.data;
  });
  const currentAdmin=async(request:FastifyRequest):Promise<VerifiedTeamActor>=>{
    let raw:Awaited<ReturnType<typeof session.verify>>;
    try{raw=await session.verify(request);}catch{throw new ApiFailure('UNAUTHENTICATED');}
    const actor=authorizeSession(raw,session.now(),'INDEPENDENT_OPERATOR_POLICY');
    if(actor.role!=='ADMIN'||!adminAuthority
      ||await available(()=>adminAuthority.isApproved({actor,now:session.now()}))!==true)
      throw new ApiFailure('FORBIDDEN');
    return actor;
  };
  app.post('/api/admin/synthetic/clubs/:id/decision',async request=>{
    Empty.parse(request.query);
    const {id}=Params.parse(request.params);
    const input=SyntheticClubDecisionRequestSchema.parse(request.body);
    const actor=await currentAdmin(request);
    if(!moderation)throw new ApiFailure('PROVIDER_UNAVAILABLE');
    const assertCurrentAdmin=async()=>{
      try{
        const current=await currentAdmin(request);
        return current.actorId===actor.actorId&&current.sessionIdHash===actor.sessionIdHash
          &&current.role===actor.role;
      }catch{return false;}
    };
    const raw=await available(()=>moderation.decide({
      adminActorId:actor.actorId,postId:id,...input,now:session.now(),assertCurrentAdmin,
    }));
    if(raw===null)throw new ApiFailure('FORBIDDEN');
    const parsed=SyntheticClubDecisionResponseSchema.safeParse(raw);
    if(!parsed.success||parsed.data.id!==id
      ||parsed.data.version!==input.expectedVersion+1
      ||(input.decision==='APPROVE'&&parsed.data.state!=='APPROVED')
      ||(input.decision==='REJECT'&&parsed.data.state!=='REJECTED')
      ||(input.decision==='REVOKE'&&parsed.data.state!=='REVOKED'))
      throw new ApiFailure('PROVIDER_UNAVAILABLE');
    if(!await assertCurrentAdmin())throw new ApiFailure('FORBIDDEN');
    return parsed.data;
  });
}
