import {describe,it,expect,vi} from 'vitest';
import {requireSourceRuntimeVersion,pinSourceRuntimeVersion} from '../../apps/api/src/modules/opportunities/source-runtime-version.js';

const expected={gitSha:'a'.repeat(40),buildSha:'b'.repeat(64),migrationVersion:'migration-1',
  adapterVersion:'adapter-1',datasetRevision:'dataset-1',schemaVersion:1};
const request={sourceId:'SYN-SOURCE',permissionRef:'SYN-PERM',now:'2026-11-12T00:00:00Z'};
const make=(active:unknown=expected)=>({expected,reader:{minSchemaVersion:1,maxSchemaVersion:1},
  loadCurrent:vi.fn(async()=>active)});

describe('#445/#449 runtime version handshake',()=>{
  it('accepts only the pinned code/build/migration/adapter/dataset/schema',async()=>{
    const port=make();
    await expect(requireSourceRuntimeVersion(port,request)).resolves.toBeUndefined();
    expect(port.loadCurrent).toHaveBeenCalledExactlyOnceWith(request);
  });
  it.each(Object.keys(expected))('rejects drift in %s before IO',async key=>{
    const changed={...expected,[key]:key==='schemaVersion'?2:key==='gitSha'?'c'.repeat(40):key==='buildSha'?'d'.repeat(64):'changed'};
    await expect(requireSourceRuntimeVersion(make(changed),request)).rejects.toThrow('Source runtime version blocked');
  });
  it('rechecks active state on each call and redacts loader failures',async()=>{
    const port=make();
    await requireSourceRuntimeVersion(port,request);
    port.loadCurrent.mockResolvedValue({...expected,datasetRevision:'dataset-2'});
    await expect(requireSourceRuntimeVersion(port,request)).rejects.toThrow('Source runtime version blocked');
    port.loadCurrent.mockRejectedValue(new Error('PRIVATE-SERVER-TOKEN'));
    await expect(requireSourceRuntimeVersion(port,request)).rejects.toThrow('Source runtime version blocked');
  });
  it('rejects unsupported readers even with an otherwise identical version',async()=>{
    await expect(requireSourceRuntimeVersion({...make(),reader:{minSchemaVersion:2,maxSchemaVersion:2}},request))
      .rejects.toThrow('Source runtime version blocked');
  });
  it('snapshots deployment and reader targets without freezing caller-owned configuration',async()=>{
    const port={...make(),expected:{...expected},reader:{minSchemaVersion:1,maxSchemaVersion:1}};
    const pinned=pinSourceRuntimeVersion(port);
    port.expected.datasetRevision='SYN-NEW';port.reader.maxSchemaVersion=2;
    expect(pinned.expected.datasetRevision).toBe('dataset-1');expect(pinned.reader.maxSchemaVersion).toBe(1);
    expect(Object.isFrozen(pinned.expected)).toBe(true);expect(Object.isFrozen(pinned.reader)).toBe(true);
    port.loadCurrent.mockResolvedValue({...expected,datasetRevision:'SYN-NEW'});
    await expect(requireSourceRuntimeVersion(pinned,request)).rejects.toThrow('Source runtime version blocked');
  });
  it('does not allow reader widening while a current-state lookup is awaiting IO',async()=>{
    const port=make({...expected,schemaVersion:2});
    port.loadCurrent.mockImplementation(async()=>{port.reader.maxSchemaVersion=2;return {...expected,schemaVersion:2};});
    // Matching expected schemaVersion is allowed by a later deployment, but
    // it must not widen this invocation's independently pinned reader range.
    const wider={...port,expected:{...expected,schemaVersion:2}};
    await expect(requireSourceRuntimeVersion(wider,request)).rejects.toThrow('Source runtime version blocked');
  });
});
