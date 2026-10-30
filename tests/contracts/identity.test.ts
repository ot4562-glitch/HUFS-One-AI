import {describe,it,expect} from 'vitest';
import {DemoProfilesResponseSchema,DemoContextSchema,DemoSnapshotSchema,SharingGrantSchema,isSnapshotCurrent,SubjectAliasSchema,type DemoContext,type DemoSnapshot} from '@hufs-one/contracts';
import {fixture} from './helpers.js';

const context=DemoContextSchema.parse(fixture('synthetic/demo-context.json'));
const snapshot=DemoSnapshotSchema.parse(fixture('synthetic/demo-snapshot.json'));
const clone=<T>(value:T):T=>structuredClone(value);

describe('A02 identity and 5-slot selector contracts',()=>{
  it('parses all 5 synthetic selectors, last slot PENDING',()=>{
    const x=DemoProfilesResponseSchema.parse(fixture('synthetic/demo-profiles.json'));
    expect(x.profiles).toHaveLength(5);
    expect(x.profiles[4]?.readiness).toBe('PENDING');
  });
  it('rejects a duplicate/missing selector without inventing a student',()=>{
    const x=fixture<{profiles:Array<{demoSubjectId:string}>}>('synthetic/demo-profiles.json');
    x.profiles[4]!.demoSubjectId='S01';
    expect(DemoProfilesResponseSchema.safeParse(x).success).toBe(false);
    expect(SubjectAliasSchema.safeParse('S06').success).toBe(false);
  });
  it('accepts schema-complete synthetic context/snapshot',()=>{
    expect(DemoContextSchema.parse(context).actorId).toBe('SYN-ACTOR-01');
    expect(DemoSnapshotSchema.parse(snapshot).aiProvenance).toBe('MOCK');
  });
  it('rejects unknown/secret/raw fields on wire',()=>{
    expect(DemoSnapshotSchema.safeParse({...snapshot,rawTranscript:'SYN-PRIVATE'}).success).toBe(false);
    expect(DemoContextSchema.safeParse({...context,password:'SYN-NEVER'}).success).toBe(false);
  });
  it('guards current response by context, subject, epoch, dataset and projection',()=>{
    const guard={context,selectionEpoch:3,currentSelectionEpoch:3};
    expect(isSnapshotCurrent(snapshot,guard)).toBe(true);
    expect(isSnapshotCurrent(snapshot,{...guard,currentSelectionEpoch:4})).toBe(false);
    expect(isSnapshotCurrent(snapshot,{...guard,context:{...context,contextId:'NEW'}})).toBe(false);
    expect(isSnapshotCurrent(snapshot,{...guard,context:{...context,demoSubjectId:'S02'}})).toBe(false);
    expect(isSnapshotCurrent(snapshot,{...guard,context:{...context,datasetVersion:'D2'}})).toBe(false);
    expect(isSnapshotCurrent(snapshot,{...guard,context:{...context,projectionVersion:'PR2'}})).toBe(false);
  });
  it('rejects invalid version envelopes and subject enum',()=>{
    const bad=clone(snapshot);
    Object.assign(bad.versions,{unknownContract:'v1'});
    expect(DemoSnapshotSchema.safeParse(bad).success).toBe(false);
  });
  it('does not mistake an actual grant for raw-source access',()=>{
    const grant=SharingGrantSchema.parse({grantId:'SYN-GRANT',actorId:context.actorId,demoSubjectId:context.demoSubjectId,
      allowedSections:['FEED','NOTICES'],displayNameAllowed:false,recordingAllowed:false,
      version:'G1',expiresAt:context.expiresAt});
    expect(grant.allowedSections).not.toContain('PRIVATE_FORMS');
    expect(SharingGrantSchema.safeParse({...grant,allowedSections:['RAW_TRANSCRIPT']}).success).toBe(false);
  });
  it('rejects real-data modes and incomplete sections when wire contract is inconsistent',()=>{
    const bad=clone(snapshot) as DemoSnapshot;
    (bad as any).academics={state:'READY'};
    expect(DemoSnapshotSchema.safeParse(bad).success).toBe(false);
  });
});
