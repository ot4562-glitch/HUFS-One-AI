import {describe,expect,it} from 'vitest';
import {SourceJobEnqueueSchema,SourceJobStatusSchema} from '@hufs-one/contracts';
const at='2026-11-04T00:00:00.000Z';
const pending={jobId:'5e349658-7e58-4ba3-9353-49eea646cefb',sourceId:'SYN-SOURCE',state:'PENDING',attemptCount:0,
  queuedAt:at,updatedAt:at,observedAt:at,requiresOperatorReview:false};
describe('operator source job wire',()=>{
  it('rejects browser actors, raw URLs and independent source approval claims',()=>{
    for(const extra of [{actorRef:'SYN-A'},{canonicalUrl:'https://synthetic.invalid/raw'},{approved:true}])
      expect(SourceJobEnqueueSchema.safeParse({sourceId:'SYN-SOURCE',permissionRef:'SYN-PERM',requestKey:'SYN-KEY',...extra}).success).toBe(false);
    for(const extra of [{leaseToken:'SYN-LEASE'},{requestKey:'SYN-KEY'},{actorRef:'SYN-PRIVATE'},{verification:'VERIFIED'}])
      expect(SourceJobStatusSchema.safeParse({...pending,...extra}).success).toBe(false);
  });
  it('requires terminal revision/attempt and uncertain completion bindings',()=>{
    expect(SourceJobStatusSchema.safeParse({...pending,state:'NEW_DRAFT',attemptCount:1,outcomeRevisionId:'SYN-REV'}).success).toBe(true);
    for(const invalid of [{...pending,outcomeRevisionId:'SYN-REV'},
      {...pending,state:'NEW_DRAFT',attemptCount:1},{...pending,state:'NEEDS_REVIEW',attemptCount:1,lastErrorCode:'UNKNOWN_COMPLETION'},
      {...pending,state:'LEASED',attemptCount:1},{...pending,updatedAt:'2026-11-05T00:00:00.000Z'}])
      expect(SourceJobStatusSchema.safeParse(invalid).success).toBe(false);
  });
});
