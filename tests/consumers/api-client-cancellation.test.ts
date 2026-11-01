import {describe,expect,it,vi} from 'vitest';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';

const session={actorId:'SYN-ACTOR',role:'BETA',schoolMailProofValid:true,betaAllowed:true};
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});

describe('browser transport cancellation is never a success or provider failure',()=>{
  it('does not fetch when the supplied signal was already aborted',async()=>{
    const controller=new AbortController();controller.abort('private cancellation detail');
    const transport=vi.fn(async()=>json(session));
    await expect(new HufsApiClient(transport).getSession(controller.signal))
      .rejects.toMatchObject({name:'AbortError'});
    expect(transport).not.toHaveBeenCalled();
  });
  it('discards a response when a transport ignored cancellation',async()=>{
    const controller=new AbortController();
    const client=new HufsApiClient(async()=>{controller.abort();return json(session);});
    await expect(client.getSession(controller.signal)).rejects.toMatchObject({name:'AbortError'});
  });
  it('does not send a mutation if cancellation occurs while fetching its CSRF proof',async()=>{
    const controller=new AbortController(),calls:string[]=[];
    const client=new HufsApiClient(async url=>{
      calls.push(url);controller.abort();return json({csrfToken:'C'.repeat(32)});
    });
    await expect(client.approveExperienceTags('SYN-EXP',{expectedApprovalVersion:0,
      expectedContentVersion:1,expectedConsentVersion:1,topics:['AI_ML']},controller.signal))
      .rejects.toMatchObject({name:'AbortError'});
    expect(calls).toEqual(['/api/auth/csrf']);
  });
  it('actively cancels a pending streamed body and releases the reader',async()=>{
    const controller=new AbortController();
    let reading!:()=>void;
    const ready=new Promise<void>(resolve=>{reading=resolve;});
    let cancelled=false;
    const stream=new ReadableStream<Uint8Array>({
      pull(){reading();},
      cancel(){cancelled=true;},
    },{highWaterMark:0});
    const client=new HufsApiClient(async()=>new Response(stream,{
      headers:{'content-type':'application/json'},
    }));
    const pending=client.getSession(controller.signal);
    const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
    await ready;controller.abort();await rejected;
    expect(cancelled).toBe(true);
    expect(stream.locked).toBe(false);
  });
  it('does not convert a body AbortError into an external-provider outage',async()=>{
    const stream=new ReadableStream<Uint8Array>({
      start(c){c.error(new DOMException('Request cancelled','AbortError'));},
    });
    const client=new HufsApiClient(async()=>new Response(stream,{
      headers:{'content-type':'application/json'},
    }));
    await expect(client.getSession()).rejects.toMatchObject({name:'AbortError'});
  });
});
