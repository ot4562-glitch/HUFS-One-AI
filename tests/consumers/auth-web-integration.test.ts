import {describe,expect,it} from 'vitest';
import {googleSignInPath,HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import type {ApiFetch} from '../../apps/web/src/integrations/api-client.js';

const csrfToken='C'.repeat(32);
const respond=(data:unknown,status=200):Response=>new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json'},
});

describe('Google OIDC + school-mail browser consumer contract (synthetic-only)',()=>{
  it('builds fixed same-origin OAuth routes, not user-supplied redirect targets',()=>{
    expect(googleSignInPath('BETA')).toBe('/api/auth/google/start?intent=BETA');
    expect(googleSignInPath('REVIEWER')).toBe('/api/auth/google/start?intent=REVIEWER');
    expect(()=>googleSignInPath('https://evil.invalid' as never)).toThrow('INVALID_INPUT');
  });

  it('reads only the server-authenticated team or synthetic REVIEWER identity shape',async()=>{
    for(const session of [
      {actorId:'google:SYN-USER',role:'BETA',schoolMailProofValid:true,betaAllowed:true},
      {role:'REVIEWER',accessEndsAt:'2026-11-05T00:00:00.000Z',
        dataMode:'SYNTHETIC',readOnly:false,sandboxOnly:true},
    ]){
      const client=new HufsApiClient(async(url,init)=>{
        expect(url).toBe('/api/auth/session');
        expect(init.credentials).toBe('same-origin');
        expect(init.cache).toBe('no-store');
        return respond(session);
      });
      const verified=await client.getSession();
      expect(verified.role).toBe(session.role);
    }
  });

  it('refuses forged reviewer grants and private fields in session responses',async()=>{
    for(const session of [
      {actorId:'SYN-USER',role:'ADMIN',schoolMailProofValid:false,betaAllowed:true},
      {role:'REVIEWER',accessEndsAt:'2026-11-05T00:00:00.000Z',
        dataMode:'REAL_CONSENTED',readOnly:false,sandboxOnly:true},
      {role:'REVIEWER',accessEndsAt:'2026-11-05T00:00:00.000Z',
        dataMode:'SYNTHETIC',readOnly:false,sandboxOnly:true,sourceOriginal:'private'},
    ]){
      const client=new HufsApiClient(async()=>respond(session));
      await expect(client.getSession()).rejects.toMatchObject({
        code:'PROVIDER_UNAVAILABLE',status:503,
      });
    }
  });

  it('requests a school mailbox challenge only with server CSRF and POST body',async()=>{
    const calls:Array<{url:string;init:RequestInit}>=[];
    const client=new HufsApiClient(async(url,init)=>{
      calls.push({url,init});
      if(url==='/api/auth/csrf')return respond({csrfToken});
      if(url==='/api/auth/school-mail/request')return respond({
        challengeId:'A'.repeat(22),expiresAt:'2026-11-01T00:00:00.000Z',
      },202);
      throw new Error('Unexpected URL');
    });
    const result=await client.requestSchoolMailProof('synthetic@hufs.ac.kr');
    expect(result.challengeId).toBe('A'.repeat(22));
    expect(calls.map(x=>x.url)).toEqual(['/api/auth/csrf','/api/auth/school-mail/request']);
    expect(calls[1]!.init.method).toBe('POST');
    expect(calls[1]!.init.credentials).toBe('same-origin');
    expect(calls[1]!.init.cache).toBe('no-store');
    expect((calls[1]!.init.headers as Record<string,string>)['x-csrf-token']).toBe(csrfToken);
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual({
      schoolEmail:'synthetic@hufs.ac.kr',
    });
    expect(calls.every(x=>!x.url.includes('synthetic@'))).toBe(true);
  });

  it('blocks external address/uppercase and malformed email before any request',async()=>{
    let count=0;
    const client=new HufsApiClient(async()=>{
      count++;
      throw new Error('No call expected');
    });
    for(const email of [
      'somebody@gmail.com','SYNTHETIC@hufs.ac.kr','user@hufs.ac.kr.evil.test',
      ' user@hufs.ac.kr','user@hufs.ac.kr?redirect=evil',
      'https://evil.invalid',
    ])await expect(client.requestSchoolMailProof(email)).rejects.toMatchObject({
      code:'INVALID_INPUT',status:422,
    });
    expect(count).toBe(0);
  });

  it('confirms a bounded eight-digit code and treats false verification as denial',async()=>{
    const calls:Array<{url:string;init:RequestInit}>=[];
    let accepted=true;
    const transport:ApiFetch=async(url,init)=>{
      calls.push({url,init});
      if(url==='/api/auth/csrf')return respond({csrfToken});
      if(url==='/api/auth/school-mail/confirm')return respond({verified:accepted});
      throw new Error('Unexpected URL');
    };
    const client=new HufsApiClient(transport);
    const input={schoolEmail:'synthetic@hufs.ac.kr',challengeId:'A'.repeat(22),
      code:'01234567'};
    expect((await client.confirmSchoolMailProof(input)).verified).toBe(true);
    expect(calls.map(x=>x.url)).toEqual(['/api/auth/csrf','/api/auth/school-mail/confirm']);
    expect(calls[1]!.init.method).toBe('POST');
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual(input);
    expect(calls.every(x=>!x.url.includes(input.code))).toBe(true);
    accepted=false;
    await expect(client.confirmSchoolMailProof(input)).rejects.toMatchObject({
      code:'FORBIDDEN',status:403,
    });
  });

  it('rejects bad OTP before sending a single request',async()=>{
    let calls=0;
    const client=new HufsApiClient(async()=>{calls++;return respond({csrfToken});});
    const valid={schoolEmail:'synthetic@hufs.ac.kr',challengeId:'A'.repeat(22),
      code:'01234567'};
    for(const bad of [
      {...valid,code:'0123456'},{...valid,code:'abcdefgh'},
      {...valid,challengeId:'wrong'},
      {...valid,schoolEmail:'random@gmail.com'},
    ])await expect(client.confirmSchoolMailProof(bad)).rejects.toMatchObject({
      code:'INVALID_INPUT',
    });
    expect(calls).toBe(0);
  });

  it('refuses HTML, invalid length metadata and oversized streamed JSON without buffering it all',async()=>{
    const badHtml=new HufsApiClient(async()=>new Response('<html>private</html>',{
      status:200,headers:{'content-type':'text/html'},
    }));
    await expect(badHtml.getSession()).rejects.toMatchObject({
      code:'PROVIDER_UNAVAILABLE',status:503,
    });
    const badLength=new HufsApiClient(async()=>new Response('{}',{
      status:200,headers:{'content-type':'application/json',
        'content-length':'not-a-number'},
    }));
    await expect(badLength.getSession()).rejects.toMatchObject({status:503});
    let cancelled=false;
    const stream=new ReadableStream<Uint8Array>({
      start(controller){
        controller.enqueue(new Uint8Array(131072));
        controller.enqueue(new Uint8Array(131073));
        controller.close();
      },
      cancel(){cancelled=true;},
    });
    const client=new HufsApiClient(async()=>new Response(stream,{
      status:200,headers:{'content-type':'application/json'},
    }));
    await expect(client.getSession()).rejects.toMatchObject({
      code:'PROVIDER_UNAVAILABLE',status:503,
    });
    expect(cancelled).toBe(true);
  });

  it('maps absent sessions and untrusted transport errors without leaking server detail',async()=>{
    const unauthorized=new HufsApiClient(async()=>respond({
      code:'UNAUTHENTICATED',message:'로그인이 필요합니다.',
      requestId:'SYN-REQ',retryable:false,
    },401));
    await expect(unauthorized.getSession()).rejects.toMatchObject({
      code:'UNAUTHENTICATED',status:401,
    });
    const down=new HufsApiClient(async()=>{
      throw new Error('raw student row, SQL connection string');
    });
    try{await down.getSession();throw Error('Must fail');}
    catch(error){expect(String(error)).toBe('HufsApiError: PROVIDER_UNAVAILABLE');}
  });
});
