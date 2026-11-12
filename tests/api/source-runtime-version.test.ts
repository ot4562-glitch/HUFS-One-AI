import {describe,it,expect,vi} from 'vitest';
import {requireSourceRuntimeVersion} from '../../apps/api/src/modules/opportunities/source-runtime-version.js';

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
});
