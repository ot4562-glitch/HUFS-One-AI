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

  it('uses context ID and epoch to ignore stale permission errors from a previous student',async()=>{
    const client:DemoClientPort={
      listProfiles:async()=>[],
      createContext:async(subject,runId)=>ctx(subject,runId),
      getSnapshot:async(id)=>id==='CTX-S02-RUN-A'?snap('S02','RUN-A'):snap('S01','RUN-A'),
      logout:async()=>{},
    };
    const controller=new DemoController(client,'RUN-A');
    await controller.select('S01');
    const previous=controller.getState();
    await controller.select('S02');
    const current=controller.getState();
    expect(current.snapshot?.demoSubjectId).toBe('S02');
    expect(controller.applyContextError(previous.context!.contextId,previous.epoch,
      new HufsApiError('SHARING_REVOKED',403))).toBe(false);
    expect(controller.getState().snapshot?.demoSubjectId).toBe('S02');
    expect(controller.applyContextError(current.context!.contextId,current.epoch,
      new HufsApiError('SHARING_REVOKED',403))).toBe(true);
    expect(controller.getState().status).toBe('REVOKED');
    expect(controller.getState().snapshot).toBeNull();
    expect(controller.getState().profiles).toEqual([]);
    controller.dispose();
  });

  it('handles session expiry as a terminal state and prevents replaying old requests',async()=>{
    let creations=0;
    const client:DemoClientPort={
      listProfiles:async()=>[],
      createContext:async(subject,runId)=>{creations++;return ctx(subject,runId);},
      getSnapshot:async()=>snap('S01','RUN-A'),
      logout:async()=>{},
    };
    const controller=new DemoController(client,'RUN-A');
    await controller.select('S01');
    const state=controller.getState();
    expect(controller.applyContextError(state.context!.contextId,state.epoch,
      new HufsApiError('UNAUTHENTICATED',401))).toBe(true);
    expect(controller.getState().status).toBe('SIGNED_OUT');
    await controller.select('S01');
    expect(creations).toBe(1); // Requires a new server-authenticated controller
    expect(controller.getState().snapshot).toBeNull();
    controller.dispose();
  });

  it('cannot select another student while server logout revocation is in flight',async()=>{
    let release!:()=>void;
    const revoked=new Promise<void>(resolve=>{release=resolve;});
    let requests=0;
    let logouts=0;
    const client:DemoClientPort={
      listProfiles:async()=>[],
      createContext:async(subject,runId)=>{requests++;return ctx(subject,runId);},
      getSnapshot:async()=>snap('S01','RUN-A'),
      logout:async()=>{logouts++;await revoked;},
    };
    const controller=new DemoController(client,'RUN-A');
    await controller.select('S01');
    const pending=controller.logout();
    expect(controller.getState().snapshot).toBeNull();
    await controller.select('S02');
    expect(requests).toBe(1);
    release();
    await pending;
    expect(controller.getState().status).toBe('SIGNED_OUT');
    expect(logouts).toBe(1);
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
