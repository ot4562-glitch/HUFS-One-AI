import {describe,it,expect} from 'vitest';
import {DemoSnapshotSchema,DemoContextSchema,DemoProfilesResponseSchema,isSnapshotCurrent,makeApiError,httpStatusForError,type SubjectAlias} from '@hufs-one/contracts';
import {fixture} from '../contracts/helpers.js';
const baseContext=DemoContextSchema.parse(fixture('synthetic/demo-context.json'));
const baseSnapshot=DemoSnapshotSchema.parse(fixture('synthetic/demo-snapshot.json'));
const subjects=['S01','S02','S03','S04','S05'] as const;

describe('Consumer 1: UI/mobile contract reviewed with synthetic data',()=>{
  it('renders exactly five selector rows with missing person PENDING',()=>{
    const {profiles}=DemoProfilesResponseSchema.parse(fixture('synthetic/demo-profiles.json'));
    expect(profiles.map(x=>x.demoSubjectId)).toEqual(subjects);
    expect(profiles.at(-1)?.readiness).toBe('PENDING');
    expect(profiles.at(-1)?.allowedSections).toEqual([]);
  });
  it('rejects all 20 cross-subject late responses',()=>{
    let rejected=0;
    for(const target of subjects){
      const context={...baseContext,contextId:'SYN-CTX-'+target,demoSubjectId:target};
      for(const returned of subjects){
        if(returned===target)continue;
        const snapshot={...baseSnapshot,contextId:context.contextId,demoSubjectId:returned};
        if(!isSnapshotCurrent(snapshot,{context,selectionEpoch:1,currentSelectionEpoch:1}))rejected++;
      }
    }
    expect(rejected).toBe(20);
  });
  it('does not cross tabs, selected epoch, or dataset version',()=>{
    const tab1={...baseContext,demoRunId:'RUN-1',contextId:baseSnapshot.contextId};
    const tab2={...baseContext,demoRunId:'RUN-2',contextId:'SYN-CTX-TAB-2'};
    expect(isSnapshotCurrent(baseSnapshot,{context:tab1,selectionEpoch:3,currentSelectionEpoch:3})).toBe(true);
    expect(isSnapshotCurrent(baseSnapshot,{context:tab2,selectionEpoch:3,currentSelectionEpoch:3})).toBe(false);
    expect(isSnapshotCurrent(baseSnapshot,{context:tab1,selectionEpoch:3,currentSelectionEpoch:4})).toBe(false);
  });
  it('can represent PENDING/NOT_SHARED academics without raw record fallbacks',()=>{
    const pending={...baseSnapshot,academics:{state:'NOT_SHARED'},forecast:{state:'PENDING'}};
    expect(DemoSnapshotSchema.safeParse(pending).success).toBe(true);
    expect(DemoSnapshotSchema.safeParse({...pending,academics:{state:'READY',courseRows:[1,2,3]}}).success).toBe(false);
  });
  it('distinguishes revoked/409/503 UI states with safe errors',()=>{
    for(const [code,status] of [['SHARING_REVOKED',403],['VERSION_CONFLICT',409],['PROVIDER_UNAVAILABLE',503]] as const){
      expect(httpStatusForError(makeApiError(code,'SYN-REQ-1'))).toBe(status);
    }
  });
});
