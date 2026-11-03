import {describe,expect,it,vi} from 'vitest';
import {readApprovedSourceBody} from '../../apps/api/src/modules/opportunities/source-response-body.js';

describe('approved source response ownership',()=>{
  it('accepts exactly the cap without cancelling a fully consumed representation',async()=>{
    const bytes=new Uint8Array(256*1024).fill(42),cancel=vi.fn();
    const response=new Response(new ReadableStream<Uint8Array>({
      start(controller){controller.enqueue(bytes);controller.close();},cancel,
    }),{headers:{'content-length':String(bytes.length)}});
    expect(new Uint8Array(await readApprovedSourceBody(response))).toEqual(bytes);
    expect(cancel).not.toHaveBeenCalled();expect(response.body?.locked).toBe(false);
  });
  it('cancels a declared oversize before reading the first chunk',async()=>{
    const cancel=vi.fn(),response=new Response(new ReadableStream<Uint8Array>({cancel}),
      {headers:{'content-length':String(256*1024+1)}});
    await expect(readApprovedSourceBody(response)).rejects.toThrow('Unbounded source payload');
    expect(cancel).toHaveBeenCalledOnce();expect(response.body?.locked).toBe(false);
  });
  it.each(['reject','never-resolve'])('preserves the size rejection when cancellation can %s',async mode=>{
    const cancel=vi.fn(()=>mode==='reject'?Promise.reject(Error('Private upstream cleanup error')):
      new Promise<void>(()=>{}));
    const response=new Response(new ReadableStream<Uint8Array>({
      start(controller){controller.enqueue(new Uint8Array(256*1024+1));},cancel,
    }));
    await expect(readApprovedSourceBody(response)).rejects.toThrow('Unbounded source payload');
    expect(cancel).toHaveBeenCalledOnce();expect(response.body?.locked).toBe(false);
  });
});
