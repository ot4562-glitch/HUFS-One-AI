import {mkdtemp,writeFile,rmdir,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {createNativeRecoveryTransfer,recoveryTransferPolicySha256} from '../../apps/api/src/db/postgres-recovery-process.js';
import {recoveryPlanSha256} from '../../apps/api/src/db/postgres-recovery-drill.js';

describe('native recovery transfer policy',()=>{
  it('has no credential or process IO at construction, and binds the complete executable policy',()=>{
    const launch=vi.fn(),credentials={resolve:vi.fn(),isPrivate:vi.fn()};
    const policy={version:'SYN-PIN',majorVersion:18,dump:{path:join(tmpdir(),'pg_dump'),sha256:'a'.repeat(64)},restore:{path:join(tmpdir(),'pg_restore'),sha256:'b'.repeat(64)}};
    createNativeRecoveryTransfer({policy,credentials,spawn:launch});
    expect(launch).not.toHaveBeenCalled();expect(credentials.resolve).not.toHaveBeenCalled();
    expect(recoveryTransferPolicySha256({...policy,majorVersion:19})).not.toBe(recoveryTransferPolicySha256(policy));
    expect(recoveryTransferPolicySha256({...policy,dump:{...policy.dump,sha256:'c'.repeat(64)}})).not.toBe(recoveryTransferPolicySha256(policy));
  });
  it('rejects a replaced pinned executable before native launch or credential access',async()=>{
    const folder=await mkdtemp(join(tmpdir(),'hufs-recovery-pin-')),dump=join(folder,'pg_dump'),restore=join(folder,'pg_restore');
    try{
      await writeFile(dump,'SYN-REPLACED');await writeFile(restore,'SYN-NO-EXECUTE');
      const policy={version:'SYN-PIN',majorVersion:18,dump:{path:dump,sha256:createHash('sha256').update('SYN-ORIGINAL').digest('hex')},restore:{path:restore,sha256:'b'.repeat(64)}};
      const endpoint=(database:string)=>({database,role:'SYN_OPERATOR',address:'127.0.0.1',port:55448,requireTls:false,bypassRls:true,credentialsRef:'SYN-REF'});
      const plan={version:1,drillId:'SYN-DRILL',approvalRef:'SYN-APPROVAL',source:endpoint('hufs_recovery_source_test'),target:endpoint('hufs_recovery_target_test'),
        transferPolicySha256:recoveryTransferPolicySha256(policy),maxArchiveBytes:1024,timeoutMs:1000};
      const launch=vi.fn(),credentials={resolve:vi.fn(),isPrivate:vi.fn()},authorizeLaunch=vi.fn();
      await expect(createNativeRecoveryTransfer({policy,credentials,spawn:launch}).run({
        plan:plan as never,planSha256:recoveryPlanSha256(plan),snapshot:'00000003-00000001-1',signal:new AbortController().signal,authorizeLaunch,
      })).rejects.toMatchObject({code:'TOOL_PIN_DENIED'});
      expect(launch).not.toHaveBeenCalled();expect(credentials.resolve).not.toHaveBeenCalled();expect(authorizeLaunch).not.toHaveBeenCalled();
    }finally{await unlink(dump);await unlink(restore);await rmdir(folder);}
  });
});
