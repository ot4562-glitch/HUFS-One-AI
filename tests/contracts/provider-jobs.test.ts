import {describe,expect,it} from 'vitest';
import {
  AI_TASK_PATHS,AiTaskSchema,ApprovedProviderInputsSchema,ProviderRunRequestSchema,
  ProviderAcceptedSchema,ProviderStoredJobSchema,ProviderCandidateSchema,
} from '@hufs-one/contracts';

const item={inputRef:'SYN-INPUT',operation:'HCX_007',task:'opportunity_terms',
  asOf:'2026-11-03T01:00:00.000Z',expiresAt:'2026-11-04T01:00:00.000Z'};
const jobId='00000000-0000-4000-8000-000000000001';
const candidate={task:'opportunity_terms',reviewRequired:true,reviewState:'NEEDS_REVIEW',
  citations:[{sourceToken:'DOC1',paragraphId:'p1',quote:'Synthetic approved notice'}],
  objectTokens:[],usage:{promptTokens:40,completionTokens:20,totalTokens:60}};
describe('approved Provider DTOs do not promote uncertain candidate',()=>{
  it('keeps four canonical tasks exactly equal to the shared AI task map',()=>{
    expect([...AiTaskSchema.options].sort()).toEqual(Object.values(AI_TASK_PATHS).sort());
  });
  it('only exposes bounded approved metadata and rejects duplicate/forged/expired entries',()=>{
    expect(ApprovedProviderInputsSchema.parse({items:[item]}).items[0]).toEqual(item);
    for(const invalid of [{items:[item,item]},{items:[{...item,actorId:'SYN-OWNER'}]},
      {items:[{...item,expiresAt:item.asOf}]},{items:[{...item,operation:'OCR_GENERAL'}]},
      {items:[{...item,safePacket:{text:'PRIVATE'}}]}])
      expect(ApprovedProviderInputsSchema.safeParse(invalid).success).toBe(false);
  });
  it('strictly distinguishes no-result PENDING from independently reviewed candidate',()=>{
    expect(ProviderAcceptedSchema.parse({jobId,state:'PENDING'})).toEqual({jobId,state:'PENDING'});
    for(const invalid of [{jobId,state:'PENDING',provenance:'LIVE'},
      {jobId,state:'NEEDS_REVIEW'}, {jobId,state:'NEEDS_REVIEW',provenance:'MOCK'},
      {jobId,state:'NEEDS_REVIEW',provenance:'LIVE',billing:'SETTLED'}])
      expect(ProviderAcceptedSchema.safeParse(invalid).success).toBe(false);
    expect(ProviderAcceptedSchema.parse({jobId,state:'NEEDS_REVIEW',provenance:'LIVE'}))
      .toMatchObject({state:'NEEDS_REVIEW'});
  });
  it('rejects unreviewed, malformed or cross-task cached job receipts',()=>{
    const valid={jobId,state:'NEEDS_REVIEW',billing:'SETTLED',
      provenance:'CANDIDATE_CACHE',candidate};
    expect(ProviderStoredJobSchema.parse(valid)).toEqual(valid);
    const broken=[{...valid,state:'PENDING'}, {...valid,billing:'UNKNOWN_BILLING'},
      {...valid,candidate:{...candidate,reviewState:'APPROVED'}},
      {...valid,candidate:{...candidate,usage:{...candidate.usage,totalTokens:999}}},
      {...valid,candidate:{...candidate,citations:[{...candidate.citations[0],url:'https://evil.invalid'}]}},
      {...valid,sourceBytes:'PRIVATE'}];
    for(const candidate of broken)expect(ProviderStoredJobSchema.safeParse(candidate).success).toBe(false);
    expect(ProviderCandidateSchema.safeParse(candidate).success).toBe(true);
    expect(ProviderRunRequestSchema.safeParse({packetRef:'SYN-INPUT',
      idempotencyKey:'KEY00001',asOf:item.asOf}).success).toBe(true);
    expect(ProviderRunRequestSchema.safeParse({packetRef:'SYN-INPUT',
      idempotencyKey:'KEY00001',asOf:item.asOf,phaseId:'FORGED'}).success).toBe(false);
  });
});
