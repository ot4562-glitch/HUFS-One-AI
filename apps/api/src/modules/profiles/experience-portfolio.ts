import {z} from 'zod';
import {ExperiencePortfolioSchema,ExperienceTagApprovalSchema,OwnerWorkspaceRecordSchema,SelfConsentSchema} from '@hufs-one/contracts';
import type {ExperiencePortfolio} from '@hufs-one/contracts';
import type {SelfAccountPort} from './self-account-postgres.js';
import type {OwnerWorkspacePort} from './self-workspace-postgres.js';
import type {ExperienceApprovalPort} from './experience-approval-postgres.js';
import {ApiFailure} from '../auth/gates.js';

const Page=z.strictObject({items:z.array(OwnerWorkspaceRecordSchema).max(20),
  nextCursor:z.string().regex(/^[A-Za-z0-9_-]{1,90}$/).nullable()});
export interface ExperiencePortfolioPorts {
  accounts:Pick<SelfAccountPort,'readConsents'>;
  workspace:Pick<OwnerWorkspacePort,'read'>;
  approvals:Pick<ExperienceApprovalPort,'read'>;
}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** No classifier, provider request, subjective proficiency score, or automatic
 * tag approval. Aggregates only this owner's current explicit selections.
 * Existing SQL stores retain their transactions/RLS and permission rechecks. */
export async function readExperiencePortfolio(input:ExperiencePortfolioPorts&{
  actorId:string;page:unknown;now:()=>string;
}):Promise<ExperiencePortfolio>{
  const actorId=z.string().regex(/^[A-Za-z0-9_.:@-]{1,200}$/).parse(input.actorId);
  const page=Page.parse(input.page);
  if(page.items.some(item=>item.value.kind!=='EXPERIENCE')
    ||new Set(page.items.map(item=>item.itemId)).size!==page.items.length)
    throw new ApiFailure('PROVIDER_UNAVAILABLE');
  const asOf=z.iso.datetime({offset:true}).parse(input.now());
  const currentConsent=async()=>{
    const raw=await input.accounts.readConsents(actorId);
    if(raw===null)throw new ApiFailure('FORBIDDEN');
    const consent=SelfConsentSchema.parse(raw);
    if(!consent.choices.personalStorage)throw new ApiFailure('FORBIDDEN');
    if(Date.parse(consent.updatedAt)>Date.parse(asOf))throw new ApiFailure('VERSION_CONFLICT');
    return consent;
  };
  const consent=await currentConsent();
  const evidence:ExperiencePortfolio['portfolio']['evidence']=[];
  for(const item of page.items){
    const raw=await input.workspace.read({actorId,kind:'EXPERIENCE',itemId:item.itemId});
    if(raw===null||!same(OwnerWorkspaceRecordSchema.parse(raw),item))throw new ApiFailure('VERSION_CONFLICT');
    const approval=ExperienceTagApprovalSchema.parse(await input.approvals.read({actorId,experienceId:item.itemId}));
    if(approval.state==='ACTIVE'&&(approval.contentVersion!==item.version
      ||approval.consentVersion!==consent.version||Date.parse(approval.approvedAt)>Date.parse(asOf)))
      throw new ApiFailure('VERSION_CONFLICT');
    evidence.push({experienceId:item.itemId,contentVersion:item.version,approval});
  }
  // Refuse a mixed-version view if any dependency changed while awaiting I/O.
  // This is a read view, not a write receipt or a globally atomic snapshot.
  for(const item of page.items){
    const current=await input.workspace.read({actorId,kind:'EXPERIENCE',itemId:item.itemId});
    const approval=await input.approvals.read({actorId,experienceId:item.itemId});
    const expected=evidence.find(value=>value.experienceId===item.itemId)!;
    if(current===null||!same(OwnerWorkspaceRecordSchema.parse(current),item)
      ||!same(ExperienceTagApprovalSchema.parse(approval),expected.approval))
      throw new ApiFailure('VERSION_CONFLICT');
  }
  if(!same(await currentConsent(),consent))throw new ApiFailure('VERSION_CONFLICT');
  const topics=new Map<string,Set<string>>();
  for(const [index,item] of evidence.entries()){
    // Display synthetic experience for demo, never count it as an owner
    // evidence signal; the recommendation adapter has the same distinction.
    if(item.approval.state!=='ACTIVE'||page.items[index]?.value.dataMode!=='OWNER_CONSENTED')continue;
    for(const topic of item.approval.topics){
      const ids=topics.get(topic)??new Set<string>();ids.add(item.experienceId);topics.set(topic,ids);
    }
  }
  return ExperiencePortfolioSchema.parse({...page,portfolio:{asOf,
    consentVersion:consent.version,coverage:'PAGE',complete:page.nextCursor===null,evidence,
    topics:[...topics].sort(([a],[b])=>a<b?-1:a>b?1:0)
      .map(([topicCode,ids])=>({topicCode,experienceIds:[...ids].sort()})),
  }});
}
