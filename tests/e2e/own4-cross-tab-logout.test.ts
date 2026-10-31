import {describe,expect,it} from 'vitest';
import {DemoController} from '../../apps/web/src/app/demo-controller.js';
import type {DemoClientPort} from '../../apps/web/src/app/demo-controller.js';
import {
  attachCrossTabSessionClosure,SESSION_CLOSE_CHANNEL,
} from '../../apps/web/src/app/session-broadcast.js';
import type {SessionCloseChannel}
  from '../../apps/web/src/app/session-broadcast.js';
import type {DemoContext,DemoSnapshot,SubjectAlias} from '@hufs-one/contracts';
import contextFixture from '../../packages/fixtures/synthetic/demo-context.json';
import snapshotFixture from '../../packages/fixtures/synthetic/demo-snapshot.json';

const context=contextFixture as DemoContext;
const snapshot=snapshotFixture as DemoSnapshot;
function testClient(){
  let created=0,revocations=0;
  const port:DemoClientPort={
    listProfiles:async()=>[],
    createContext:async(subject,runId)=>{
      created++;
      return {...context,contextId:'SYN-'+subject+'-'+runId,
        demoSubjectId:subject,demoRunId:runId};
    },
    getSnapshot:async(id)=>{
      const match=/^SYN-(S0[1-5])-(RUN-[AB])$/.exec(id);
      if(!match)throw new Error('Unknown synthetic context');
      return {...snapshot,contextId:id,demoSubjectId:match[1] as SubjectAlias};
    },
    logout:async()=>{revocations++;},
  };
  return {port,created:()=>created,revocations:()=>revocations};
}

function bus(){
  const listeners=new Set<Set<(event:MessageEvent)=>void>>();
  const messages:unknown[]=[];
  function makeChannel():SessionCloseChannel{
    const handlers=new Set<(event:MessageEvent)=>void>();
    listeners.add(handlers);
    return {
      postMessage(value:unknown){
        messages.push(value);
        for(const peer of listeners)if(peer!==handlers)
          for(const handler of peer)handler({data:value} as MessageEvent);
      },
      addEventListener(type,listener){if(type==='message')handlers.add(listener);},
      removeEventListener(type,listener){if(type==='message')handlers.delete(listener);},
    };
  }
  return {makeChannel,messages};
}

describe('same-origin tab session closure (fake BroadcastChannel only)',()=>{
  it('erases a second visible tab when one tab completes server-side logout',async()=>{
    const apiA=testClient(),apiB=testClient();
    const a=new DemoController(apiA.port,'RUN-A');
    const b=new DemoController(apiB.port,'RUN-B');
    await Promise.all([a.select('S01'),b.select('S02')]);
    expect(a.getState().snapshot?.demoSubjectId).toBe('S01');
    expect(b.getState().snapshot?.demoSubjectId).toBe('S02');
    const channel=bus();
    const unA=attachCrossTabSessionClosure(a,channel.makeChannel());
    const unB=attachCrossTabSessionClosure(b,channel.makeChannel());
    expect(SESSION_CLOSE_CHANNEL).toBe('hufs-one-session-close-v1');
    await a.logout();
    expect(apiA.revocations()).toBe(1);
    expect(apiB.revocations()).toBe(0); // Receiver never revokes another account.
    expect(a.getState().status).toBe('SIGNED_OUT');
    expect(b.getState().status).toBe('SIGNED_OUT');
    expect(a.getState().snapshot).toBeNull();
    expect(b.getState().snapshot).toBeNull();
    await b.select('S01');
    expect(apiB.created()).toBe(1); // Session is terminal until new login.
    expect(channel.messages).toEqual([{kind:'HUFS_SESSION_CLOSED',version:1}]);
    expect(JSON.stringify(channel.messages)).not.toContain('S01');
    expect(JSON.stringify(channel.messages)).not.toContain('S02');
    unA();unB();a.dispose();b.dispose();
  });

  it('ignores forged authority increases and extra token fields; message may only clear',async()=>{
    const api=testClient();
    const viewer=new DemoController(api.port,'RUN-B');
    await viewer.select('S02');
    const broadcast=bus();
    const a=broadcast.makeChannel(),b=broadcast.makeChannel();
    const detach=attachCrossTabSessionClosure(viewer,b);
    a.postMessage({kind:'AUTHENTICATED',version:1});
    a.postMessage({kind:'HUFS_SESSION_CLOSED',version:1,studentId:'PRIVATE'});
    a.postMessage({kind:'HUFS_SESSION_CLOSED',version:2});
    expect(viewer.getState().status).toBe('READY');
    expect(viewer.getState().snapshot?.demoSubjectId).toBe('S02');
    a.postMessage({kind:'HUFS_SESSION_CLOSED',version:1});
    expect(viewer.getState().status).toBe('SIGNED_OUT');
    expect(viewer.getState().snapshot).toBeNull();
    // Incoming session close is not reflected again (no message storm).
    expect(broadcast.messages).toHaveLength(4);
    detach();detach();
    viewer.dispose();
  });

  it('rejects absent channel wiring without changing the user session',async()=>{
    const api=testClient();
    const controller=new DemoController(api.port,'RUN-A');
    await controller.select('S01');
    expect(()=>attachCrossTabSessionClosure(controller,{} as never))
      .toThrow('browser-only channel');
    expect(controller.getState().status).toBe('READY');
    controller.dispose();
  });
});
