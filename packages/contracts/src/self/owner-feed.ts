import {z} from 'zod';
import {FeedResultSchema} from '../corpus/index.js';

/** Own-account feed, never an S01–S05 context or permission receipt. The opaque
 * version binds current profile/approval/source inputs without disclosing them. */
export const OwnerFeedResponseSchema=z.strictObject({
  version:z.string().regex(/^[a-f0-9]{64}$/),
  rankConfigVersion:z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),
  feed:FeedResultSchema,
}).superRefine((value,ctx)=>{
  for(const [section,cards] of [['featured',value.feed.featured],['compact',value.feed.compact],['ineligible',value.feed.ineligible??[]]] as const)
    for(const [index,card] of cards.entries())if(card.explanation&&card.explanation.rankConfigVersion!==value.rankConfigVersion)
      ctx.addIssue({code:'custom',path:['feed',section,index,'explanation','rankConfigVersion'],message:'Rank policy mismatch'});
});
export type OwnerFeedResponse=z.infer<typeof OwnerFeedResponseSchema>;
