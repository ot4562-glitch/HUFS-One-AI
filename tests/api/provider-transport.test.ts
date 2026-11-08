import {EventEmitter} from 'node:events';
import {describe,it,expect,vi} from 'vitest';
import {createNodeClovaTransport} from '../../apps/api/src/modules/ai/provider-transport.js';
function fixture(status=200,headers:Record<string,string>={'content-type':'application/json'},body='{"ok":true}'){
  const sent:any[]=[];let destroyed=false;
  const request=vi.fn((config:any,callback:any)=>{
    const req:any=new EventEmitter();req.destroy=()=>{destroyed=true;};req.end=(payload:string)=>{
      sent.push({config,payload});queueMicrotask(()=>{
        if(destroyed)return;const response:any=new EventEmitter();response.statusCode=status;response.headers=headers;
        response.complete=true;response.destroy=()=>{destroyed=true;};callback(response);
        response.emit('data',Buffer.from(body));response.emit('end');
      });
    };return req;
  });
  const resolve=vi.fn(async()=>['1.1.1.1']),secret=vi.fn(async()=> 'SYNTHETIC-KEY');
  const transport=createNodeClovaTransport({resolveAddresses:resolve,request:request as never,secret});
  const beforeSend=vi.fn(async()=>{});
  const input={stage:'INFER' as const,operation:'HCX_007' as const,requestId:'00000000-0000-4000-8000-000000000001',
    body:'{}',signal:new AbortController().signal,beforeSend};
  return {transport,input,request,resolve,secret,sent,beforeSend};
}
describe('pinned CLOVA POST transport',()=>{
  it('blocks retired model before secrets, DNS or outbound sockets',async()=>{
    const f=fixture();
    await expect(f.transport.post({...f.input,operation:'HCX_005'})).rejects.toThrow('Provider transport unavailable');
    expect(f.resolve).not.toHaveBeenCalled();
    expect(f.secret).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
  });
  it('pins two identical public DNS answers, validates TLS name and reauthorizes immediately before sending',async()=>{
    const f=fixture(),r=await f.transport.post(f.input);expect(await r.json()).toEqual({ok:true});
    expect(f.resolve).toHaveBeenCalledTimes(2);expect(f.beforeSend).toHaveBeenCalledOnce();
    expect(f.sent[0].config).toMatchObject({hostname:'1.1.1.1',servername:'clovastudio.stream.ntruss.com',
      rejectUnauthorized:true,agent:false,path:'/v3/chat-completions/HCX-007',method:'POST'});
    expect(f.sent[0].config.headers.authorization).toBe('Bearer SYNTHETIC-KEY');
    expect(f.sent[0].config.headers).not.toHaveProperty('cookie');
  });
  it('uses the documented model tokenizer endpoint without generation parameters',async()=>{
    const f=fixture();await f.transport.post({...f.input,stage:'TOKENIZE'});
    expect(f.sent[0].config.path).toBe('/v3/api-tools/chat-tokenize/HCX-007');
  });
  it.each(['private','rebind','revoked','cancelled','key'] as const)('makes zero socket writes when %s',async kind=>{
    const f=fixture();const ctl=new AbortController();
    if(kind==='private')f.resolve.mockResolvedValue(['127.0.0.1']);
    if(kind==='rebind')f.resolve.mockResolvedValueOnce(['1.1.1.1']).mockResolvedValueOnce(['8.8.8.8']);
    if(kind==='revoked')f.beforeSend.mockRejectedValue(Error('revoked'));
    if(kind==='cancelled')ctl.abort();
    if(kind==='key')f.secret.mockResolvedValue('key\r\nCookie: secret');
    await expect(f.transport.post({...f.input,signal:ctl.signal})).rejects.toThrow('Provider transport unavailable');expect(f.sent).toHaveLength(0);
  });
  it.each([302,307])('never follows redirects %s',async status=>{
    const f=fixture(status,{location:'https://other.test'});
    await expect(f.transport.post(f.input)).rejects.toThrow();expect(f.request).toHaveBeenCalledTimes(1);
  });
  it.each([{'content-length':'999999999'},{'content-encoding':'gzip'}])('rejects oversized/compressed responses',async headers=>{
    const f=fixture(200,headers);await expect(f.transport.post(f.input)).rejects.toThrow();
  });
  it('requires an exact NCP OCR endpoint and sends X-OCR-SECRET without bearer credentials',async()=>{
    const f=fixture();const t=createNodeClovaTransport({resolveAddresses:f.resolve,request:f.request as never,secret:f.secret,
      ocrEndpoint:'https://synthetic.apigw.ntruss.com/custom/v1/1/opaque/general'});
    await t.post({...f.input,operation:'OCR_GENERAL'});
    expect(f.sent[0].config.headers['x-ocr-secret']).toBe('SYNTHETIC-KEY');expect(f.sent[0].config.headers).not.toHaveProperty('authorization');
    for(const url of ['http://synthetic.apigw.ntruss.com/general','https://evil.test/general','https://synthetic.apigw.ntruss.com/general?key=x'])
      expect(()=>createNodeClovaTransport({secret:f.secret,ocrEndpoint:url})).toThrow();
  });
});
