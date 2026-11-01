import {describe,expect,it,vi} from 'vitest';
import {OwnerSessionController} from '../../apps/web/src/app/index.js';
import {HufsApiError} from '../../apps/web/src/integrations/api-client.js';

const beta=(actorId='SYN-ACTOR')=>({role:'BETA',actorId,schoolMailProofValid:true,betaAllowed:true});
function deferred<T>(){let resolve!:(v:T)=>void;
  const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}

describe('private owner session guard: independent of a demo selection',()=>{
  it('requires a server-verified BETA session; REVIEWER cannot invoke owner operations',async()=>{
    const run=vi.fn(async()=>({privateValue:'synthetic'}));
    const controller=new OwnerSessionController({getSession:async()=>beta()});
    expect(await controller.runLatest('profile',run)).toBeNull();
    await controller.initialize();expect(controller.getState().status).toBe('READY');
    expect(await controller.runLatest('profile',run)).toEqual({privateValue:'synthetic'});
    expect(controller.getState()).not.toHaveProperty('actorId');controller.dispose();
    const reviewer=new OwnerSessionController({getSession:async()=>({role:'REVIEWER'})});
    await reviewer.initialize();expect(reviewer.getState().status).toBe('FORBIDDEN');
    run.mockClear();expect(await reviewer.runLatest('profile',run)).toBeNull();expect(run).not.toHaveBeenCalled();
  });
  it('rejects an account switch before sending any owner request',async()=>{
    let actor='SYN-A';const controller=new OwnerSessionController({getSession:async()=>beta(actor)});
    await controller.initialize();actor='SYN-B';const run=vi.fn(async()=>42);
    expect(await controller.runLatest('profile',run)).toBeNull();expect(run).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe('SIGNED_OUT');
  });
  it('discards a result if the account changed during the owner request',async()=>{
    let actor='SYN-A';const controller=new OwnerSessionController({getSession:async()=>beta(actor)});
    await controller.initialize();
    expect(await controller.runLatest('profile',async()=>{actor='SYN-B';return 'old-private-record';})).toBeNull();
    expect(controller.getState().status).toBe('SIGNED_OUT');
  });
  it('keeps only the latest response for one read key even if transport ignores abort',async()=>{
    const controller=new OwnerSessionController({getSession:async()=>beta()});await controller.initialize();
    const started=deferred<void>(),old=deferred<string>();let signal:AbortSignal|undefined;
    const p=controller.runLatest('profile',async s=>{signal=s;started.resolve();return old.promise;});
    await started.promise;
    expect(await controller.runLatest('profile',async()=> 'new')).toBe('new');
    expect(signal?.aborted).toBe(true);old.resolve('old');expect(await p).toBeNull();controller.dispose();
  });
  it('allows independent read keys without dropping each other',async()=>{
    const controller=new OwnerSessionController({getSession:async()=>beta()});await controller.initialize();
    const values=await Promise.all([controller.runLatest('profile',async()=>1),controller.runLatest('consents',async()=>2)]);
    expect(values).toEqual([1,2]);controller.dispose();
  });
  it('clears the epoch before resume verification and never publishes the old read',async()=>{
    const controller=new OwnerSessionController({getSession:async()=>beta()});await controller.initialize();
    const started=deferred<void>(),late=deferred<string>();
    const p=controller.runLatest('workspace',async()=>{started.resolve();return late.promise;});await started.promise;
    const epoch=controller.getState().epoch;const refresh=controller.revalidate();
    expect(controller.getState().epoch).toBeGreaterThan(epoch);expect(controller.getState().status).toBe('CHECKING');
    await refresh;late.resolve('stale');expect(await p).toBeNull();controller.dispose();
  });
  it('serializes mutations and cancels old reads before the first write',async()=>{
    const controller=new OwnerSessionController({getSession:async()=>beta()});await controller.initialize();
    const readStarted=deferred<void>(),read=deferred<string>();
    const p=controller.runLatest('experience',async()=>{readStarted.resolve();return read.promise;});await readStarted.promise;
    const writeStarted=deferred<void>(),write=deferred<string>();
    const mutation=controller.runMutation(async()=>{writeStarted.resolve();return write.promise;});await writeStarted.promise;
    const duplicate=vi.fn(async()=> 'duplicate');
    expect(await controller.runMutation(duplicate)).toBeNull();
    expect(await controller.runLatest('experience',duplicate)).toBeNull();expect(duplicate).not.toHaveBeenCalled();
    read.resolve('stale');expect(await p).toBeNull();write.resolve('saved');expect(await mutation).toBe('saved');
    expect(await controller.runLatest('experience',async()=> 'fresh')).toBe('fresh');controller.dispose();
  });
  it.each(['UNAUTHENTICATED','FORBIDDEN','VERSION_CONFLICT','PROVIDER_UNAVAILABLE'] as const)(
    'fails closed and drops other pending work on %s',async code=>{
      const controller=new OwnerSessionController({getSession:async()=>beta()});await controller.initialize();
      const response=await controller.runLatest('profile',async()=>{throw new HufsApiError(code,code==='UNAUTHENTICATED'?401:code==='FORBIDDEN'?403:code==='VERSION_CONFLICT'?409:503);});
      expect(response).toBeNull();expect(controller.getState().error).toBe(code);
      expect(controller.getState().status).not.toBe('READY');controller.dispose();
    });
  it('cross-tab logout permanently invalidates outstanding work and unmount aborts it',async()=>{
    for(const dispose of [false,true]){
      const controller=new OwnerSessionController({getSession:async()=>beta()});await controller.initialize();
      const started=deferred<void>(),late=deferred<string>();
      const p=controller.runLatest('profile',async()=>{started.resolve();return late.promise;});await started.promise;
      if(dispose)controller.dispose();else controller.invalidateLocalSession();
      late.resolve('private');expect(await p).toBeNull();
      await controller.initialize();const run=vi.fn(async()=> 'private');
      expect(await controller.runLatest('profile',run)).toBeNull();expect(run).not.toHaveBeenCalled();
    }
  });
});
