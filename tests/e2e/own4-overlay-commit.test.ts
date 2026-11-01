import {describe,expect,it,vi} from 'vitest';
import {DemoContextSchema,DemoSnapshotSchema,DemoOverlayResultSchema} from '@hufs-one/contracts';
import type {DemoContext,DemoOverlayResult,SubjectAlias} from '@hufs-one/contracts';
import {DemoController} from '../../apps/web/src/app/demo-controller.js';
import {HufsApiError} from '../../apps/web/src/integrations/api-client.js';
import original from '../../packages/fixtures/synthetic/demo-snapshot.json';

function deferred<T>(){let resolve!:(v:T)=>void, reject!:(e:unknown)=>void;
  const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const ctx=(subject:SubjectAlias)=>DemoContextSchema.parse({contextId:'SYN-CTX-'+subject,
  actorId:'SYN-ACTOR',demoSubjectId:subject,demoRunId:'RUN',sessionIdHash:'SYN-HASH',
  datasetVersion:'D1',projectionVersion:'PR1',sharingGrantVersion:'C1',expiresAt:'2026-12-01T00:00:00.000Z'});
const snap=(c:DemoContext,version=0)=>DemoSnapshotSchema.parse({...original,
  contextId:c.contextId,demoSubjectId:c.demoSubjectId,
  versions:{...original.versions,overlay:'BETA_OVERLAY:'+version},
  feed:{...original.feed,featured:[],compact:[]},notices:{...original.notices,items:[],pinnedIds:[]}});
const result=(c:DemoContext,version=1):DemoOverlayResult=>DemoOverlayResultSchema.parse({
  overlay:{version,value:{interestTopics:['AI_ML']},updatedAt:original.asOf},snapshot:snap(c,version),
  calendar:{asOf:original.asOf,from:original.asOf,to:original.asOf,entries:[],undated:[],needsConfirmation:[],ambiguousNoticeIds:[]},
});
function harness(){
  const contexts=new Map<string,DemoContext>();
  return new DemoController({listProfiles:async()=>[],createContext:async subject=>{
    const c=ctx(subject);contexts.set(c.contextId,c);return c;
  },getSnapshot:async id=>snap(contexts.get(id)!),logout:async()=>{}},'RUN');
}

describe('tab-local overlay receipt commit (no React implementation changes)',()=>{
  it('atomically replaces the current snapshot with the validated recomputation',async()=>{
    const controller=harness();await controller.select('S01');
    const response=result(ctx('S01'));
    expect(await controller.runOverlayOperation(async()=>response)).toEqual(response);
    expect(controller.getState().snapshot?.versions.overlay).toBe('BETA_OVERLAY:1');
    expect(controller.getState().status).toBe('READY');controller.dispose();
  });
  it('discards late results after subject switch even when the transport ignores abort',async()=>{
    const controller=harness();await controller.select('S01');
    const late=deferred<DemoOverlayResult>();
    const pending=controller.runOverlayOperation(async()=>late.promise);
    await controller.select('S02');late.resolve(result(ctx('S01')));
    expect(await pending).toBeNull();
    expect(controller.getState().selected).toBe('S02');
    expect(controller.getState().snapshot?.versions.overlay).toBe('BETA_OVERLAY:0');controller.dispose();
  });
  it('allows the new subject to write while a cancelled old transport is stuck',async()=>{
    const controller=harness();await controller.select('S01');
    const late=deferred<DemoOverlayResult>(),pending=controller.runOverlayOperation(async()=>late.promise);
    await controller.select('S02');
    expect(await controller.runOverlayOperation(async()=>result(ctx('S02')))).not.toBeNull();
    late.reject(new HufsApiError('FORBIDDEN',403));expect(await pending).toBeNull();
    expect(controller.getState().snapshot?.demoSubjectId).toBe('S02');controller.dispose();
  });
  it('serializes operations within one context to prevent out-of-order snapshot regression',async()=>{
    const controller=harness();await controller.select('S01');
    const late=deferred<DemoOverlayResult>(),pending=controller.runOverlayOperation(async()=>late.promise);
    const second=vi.fn(async()=>result(ctx('S01'),2));
    expect(await controller.runOverlayOperation(second)).toBeNull();expect(second).not.toHaveBeenCalled();
    late.resolve(result(ctx('S01')));await pending;
    expect((await controller.runOverlayOperation(second))?.overlay.version).toBe(2);controller.dispose();
  });
  it('refuses to regress a committed overlay version',async()=>{
    const controller=harness();await controller.select('S01');
    await controller.runOverlayOperation(async()=>result(ctx('S01'),2));
    expect(await controller.runOverlayOperation(async()=>result(ctx('S01'),1))).toBeNull();
    expect(controller.getState()).toMatchObject({status:'CONFLICT',snapshot:null});controller.dispose();
  });
  it.each(['context','asOf','shape'] as const)('rejects a different %s before rendering any result',async what=>{
    const controller=harness();await controller.select('S01');const response=result(ctx('S01'));
    if(what==='context')response.snapshot.contextId='SYN-OTHER';
    if(what==='asOf'){
      const at='2026-10-31T09:00:00.000Z';response.snapshot.asOf=at;response.snapshot.feed.asOf=at;
      response.snapshot.notices.asOf=at;response.calendar={...response.calendar,asOf:at,from:at,to:at};
    }
    if(what==='shape')(response as unknown as Record<string,unknown>).privateOriginal='forbidden';
    expect(await controller.runOverlayOperation(async()=>response)).toBeNull();
    expect(controller.getState().snapshot).toBeNull();
    expect(controller.getState().status).toBe(what==='shape'?'UNAVAILABLE':'CONFLICT');controller.dispose();
  });
  it('invalidates pending work on resume, logout and unmount',async()=>{
    for(const action of ['resume','logout','dispose'] as const){
      const controller=harness();await controller.select('S01');
      const late=deferred<DemoOverlayResult>(),pending=controller.runOverlayOperation(async()=>late.promise);
      if(action==='resume')await controller.revalidate();
      else if(action==='logout')await controller.logout();else controller.dispose();
      late.resolve(result(ctx('S01')));expect(await pending).toBeNull();
      expect(controller.getState().snapshot?.versions.overlay??null).toBe(action==='resume'?'BETA_OVERLAY:0':null);
    }
  });
  it('never performs a write from an unselected or signed-out controller',async()=>{
    const controller=harness(),perform=vi.fn(async()=>result(ctx('S01')));
    expect(await controller.runOverlayOperation(perform)).toBeNull();
    controller.invalidateLocalSession();expect(await controller.runOverlayOperation(perform)).toBeNull();
    expect(perform).not.toHaveBeenCalled();controller.dispose();
  });
});
