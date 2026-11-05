import {z} from 'zod';
import {TopicCodeSchema} from '../topics/index.js';
import {OwnerWorkspaceRecordSchema} from './workspace.js';
import {ExperienceTagApprovalSchema} from './experience-approval.js';

const Id=z.string().regex(/^[A-Za-z0-9_-]{1,90}$/);
const Version=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1);
export const ExperiencePortfolioQuerySchema=z.strictObject({
  view:z.literal('portfolio'),afterId:Id.optional(),limit:z.coerce.number().int().min(1).max(20).optional(),
});
export const ExperiencePortfolioSchema=z.strictObject({
  items:z.array(OwnerWorkspaceRecordSchema).max(20),nextCursor:Id.nullable(),
  portfolio:z.strictObject({
    asOf:z.iso.datetime({offset:true}),consentVersion:Version,
    /** Topic inventory covers only this cursor page, not the entire account. */
    coverage:z.literal('PAGE'),complete:z.boolean(),
    evidence:z.array(z.strictObject({experienceId:Id,contentVersion:Version,
      approval:ExperienceTagApprovalSchema})).max(20),
    topics:z.array(z.strictObject({topicCode:TopicCodeSchema,experienceIds:z.array(Id).min(1).max(20)})).max(24),
  }),
}).superRefine((value,ctx)=>{
  if(value.portfolio.complete!==(value.nextCursor===null))
    ctx.addIssue({code:'custom',message:'Page completion must match current cursor'});
  const ids=new Set(value.items.map(item=>item.itemId));
  if(ids.size!==value.items.length||value.items.some(item=>item.value.kind!=='EXPERIENCE')
    ||value.portfolio.evidence.length!==value.items.length)
    ctx.addIssue({code:'custom',message:'Portfolio requires distinct experience records and bound evidence'});
  const expected=new Map<string,Set<string>>();
  value.portfolio.evidence.forEach((item,index)=>{
    const record=value.items[index];
    if(!record||record.itemId!==item.experienceId||record.version!==item.contentVersion)
      ctx.addIssue({code:'custom',message:'Portfolio evidence identity or version mismatch'});
    if(item.approval.state==='ACTIVE'){
      if(item.approval.contentVersion!==item.contentVersion
        ||item.approval.consentVersion!==value.portfolio.consentVersion
        ||Date.parse(item.approval.approvedAt)>Date.parse(value.portfolio.asOf))
        ctx.addIssue({code:'custom',message:'Portfolio approval is not current'});
      // Synthetic experience may be displayed for practice, but is not a
      // real owner-consented skill signal for personalized recommendations.
      if(record?.value.dataMode==='OWNER_CONSENTED')for(const topic of item.approval.topics){
        const rows=expected.get(topic)??new Set<string>();rows.add(item.experienceId);expected.set(topic,rows);
      }
    }
  });
  if(value.portfolio.topics.length!==expected.size
    ||new Set(value.portfolio.topics.map(item=>item.topicCode)).size!==expected.size
    ||value.portfolio.topics.some(item=>{
      const ids=expected.get(item.topicCode);
      return !ids||ids.size!==item.experienceIds.length||item.experienceIds.some(id=>!ids.has(id))
        ||new Set(item.experienceIds).size!==item.experienceIds.length;
    }))ctx.addIssue({code:'custom',message:'Only current owner-approved topic evidence may be aggregated'});
});
export type ExperiencePortfolio=z.infer<typeof ExperiencePortfolioSchema>;
