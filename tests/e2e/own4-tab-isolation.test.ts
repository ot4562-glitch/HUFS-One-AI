import {describe,expect,it} from 'vitest';
import type {DemoContext,DemoSnapshot,DemoProfileOption,SubjectAlias} from '@hufs-one/contracts';
import {HufsApiError} from '../../apps/web/src/integrations/api-client.js';
import {DemoController} from '../../apps/web/src/app/demo-controller.js';
import type {DemoClientPort} from '../../apps/web/src/app/demo-controller.js';
import {useDemoControllerState} from '../../apps/web/src/app/react-store.js';
import contextFixture from '../../packages/fixtures/synthetic/demo-context.json';
import snapshotFixture from '../../packages/fixtures/synthetic/demo-snapshot.json';

const baseContext=contextFixture as DemoContext;
const baseSnapshot=snapshotFixture as DemoSnapshot;
const ctx=(subject:SubjectAlias,runId:string):DemoContext=>({
  ...baseContext,contextId:'CTX-'+subject+'-'+runId,
  demoSubjectId:subject,demoRunId:runId,
});
const snap=(subject:SubjectAlias,runId:string):DemoSnapshot=>({
  ...baseSnapshot,contextId:'CTX-'+subject+'-'+runId,demoSubjectId:subject,
});

describe('synthetic transport-level E2E (NOT a real browser test)',()=>{
  it('drops a late S01 createContext after S02 has become visible',async()=>{
    let finishFirst!: (value:DemoContext)=>void;
    const first=new Promise<DemoContext>(resolve=>{finishFirst=resolve;});
    const runId='RUN-A';
    const client:DemoClientPort={
      listProfiles:async()=>[] as DemoProfileOption[],
      createContext:async(subject)=>subject==='S01'?first:ctx(subject,runId),
      getSnapshot:async(id)=>id==='CTX-S02-RUN-A'?snap('S02',runId):snap('S01',runId),
      logout:async()=>{},
    };
    const controller=new DemoController(client,runId);
    const old=controller.select('S01');
    const fresh=controller.select('S02');
    await fresh;
    expect(controller.getState().snapshot?.demoSubjectId).toBe('S02');
    finishFirst(ctx('S01',runId));
    await old;
    expect(controller.getState().snapshot?.demoSubjectId).toBe('S02');
    controller.dispose();
  });

  it('erases a previous student before rejecting an invalid new selector id',async()=>{
    let calls=0;
    const client:DemoClientPort={
      listProfiles:async()=>[],
      createContext:async(subject,runId)=>{calls++;return ctx(subject,runId);},
      getSnapshot:async()=>snap('S01','RUN-A'),
      logout:async()=>{},
    };
    const controller=new DemoController(client,'RUN-A');
    await controller.select('S01');
    expect(controller.getState().snapshot?.demoSubjectId).toBe('S01');
    await controller.select('S09' as never);
    expect(controller.getState().status).toBe('INVALID');
    expect(controller.getState().snapshot).toBeNull();
    expect(calls).toBe(1);
    controller.dispose();
  });

  it('keeps two independent controllers and demoRunId values isolated',async()=>{
    const client:DemoClientPort={
      listProfiles:async()=>[],
      createContext:async(subject,runId)=>ctx(subject,runId),
      getSnapshot:async(id)=>{
        const parts=/^CTX-(S0[1-5])-(RUN-[AB])$/.exec(id);
        if(!parts)throw new HufsApiError('FORBIDDEN',403);
        return snap(parts[1] as SubjectAlias,parts[2]!);
      },
      logout:async()=>{},
    };
    const tabA=new DemoController(client,'RUN-A');
    const tabB=new DemoController(client,'RUN-B');
    await Promise.all([tabA.select('S01'),tabB.select('S02')]);
    expect(tabA.getState().snapshot?.contextId).toBe('CTX-S01-RUN-A');
    expect(tabB.getState().snapshot?.contextId).toBe('CTX-S02-RUN-B');
    tabA.clear();
    expect(tabA.getState().snapshot).toBeNull();
    expect(tabB.getState().snapshot?.demoSubjectId).toBe('S02');
    tabA.dispose();tabB.dispose();
  });

  it.each([
    ['UNAUTHENTICATED','SIGNED_OUT'],['SHARING_REVOKED','REVOKED'],
    ['VERSION_CONFLICT','CONFLICT'],['INVALID_INPUT','INVALID'],
    ['RATE_LIMITED','UNAVAILABLE'],['PROVIDER_UNAVAILABLE','UNAVAILABLE'],
  ] as const)('fails closed for %s -> %s',async(code,status)=>{
    const client:DemoClientPort={
      listProfiles:async()=>[],
      createContext:async()=>{throw new HufsApiError(code,403);},
      getSnapshot:async()=>baseSnapshot,
      logout:async()=>{},
    };
    const controller=new DemoController(client,'RUN-A');
    await controller.select('S01');
    expect(controller.getState().status).toBe(status);
    expect(controller.getState().snapshot).toBeNull();
    controller.dispose();
  });

  it('connects the immutable external store to React useSyncExternalStore without modifying UI modules',async()=>{
    const client:DemoClientPort={
      listProfiles:async()=>[],
      createContext:async()=>ctx('S01','RUN-A'),
      getSnapshot:async()=>snap('S01','RUN-A'),
      logout:async()=>{},
    };
    const controller=new DemoController(client,'RUN-A');
    let updates=0;
    const unsubscribe=controller.subscribe(()=>{updates++;});
    const hook=useDemoControllerState(controller,(subscribe,getSnapshot)=>{
      expect(subscribe).toBe(controller.subscribe);
      return getSnapshot();
    });
    expect(hook.status).toBe('IDLE');
    await controller.select('S01');
    expect(updates).toBeGreaterThan(0);
    expect(controller.getState().status).toBe('READY');
    unsubscribe();
    controller.dispose();
  });
});
