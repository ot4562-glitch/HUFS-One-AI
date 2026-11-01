import {DemoProfilesResponseSchema,DemoSnapshotSchema,SubjectAliasSchema} from '@hufs-one/contracts';
import type {AiTask,DemoSnapshot,SafeLlmPacket,SubjectAlias} from '@hufs-one/contracts';
import {buildDemoSnapshots,DEMO_AS_OF,DEMO_CORPUS_VERSION,DEMO_STUDENTS}
  from '../../../../../packages/core/src/opportunities/index.js';
import type {ReviewerDemoRepository} from './reviewer.js';

/** Public synthetic artifact; no actual four-person intake or independent gold-review assertion. */
export function buildSharedSyntheticCorpus(){
  return {datasetMode:'SYNTHETIC' as const,version:DEMO_CORPUS_VERSION,asOf:DEMO_AS_OF,
    independentGoldReview:'PENDING' as const,snapshots:buildDemoSnapshots()};
}

/** Only injected into the already invitation-gated REVIEWER runtime; never issues a grant. */
export class GeneratedSyntheticReviewerRepository implements ReviewerDemoRepository {
  private readonly snapshots=new Map(buildSharedSyntheticCorpus().snapshots.map(s=>[s.demoSubjectId,s]));
  async listProfiles(){
    return DemoProfilesResponseSchema.parse({profiles:DEMO_STUDENTS.map(s=>({
      demoSubjectId:s.subject,displayLabel:s.label,dataMode:'SYNTHETIC',readiness:'READY',
      allowedSections:['FEED','NOTICES','EXPERIENCE','ACADEMICS','FORECAST'],
    }))}).profiles;
  }
  async readSnapshot(subject:SubjectAlias):Promise<DemoSnapshot|null>{
    if(!SubjectAliasSchema.safeParse(subject).success)return null;
    const value=this.snapshots.get(subject);
    return value?DemoSnapshotSchema.parse(structuredClone(value)):null;
  }
  async readSafePacket(_subject:SubjectAlias,_task:AiTask,_ref:string):Promise<SafeLlmPacket|null>{
    // Corpus display does not approve provider packets or manufacture live AI results.
    return null;
  }
}
