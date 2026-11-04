import {describe,expect,it} from 'vitest';
import {createSyntheticEmptyDemoApi} from '../../apps/api/src/dev/empty-demo-fixture.js';
describe('#132 explicit local EMPTY_DEMO harness',()=>{
 it('requires synthetic loopback mode, denies anonymous API and cross-site bootstrap, then isolates invented actors',async()=>{
   expect(()=>createSyntheticEmptyDemoApi({mode:'REAL' as never,allowedOrigin:'http://127.0.0.1:5173'})).toThrow();
   expect(()=>createSyntheticEmptyDemoApi({mode:'SYNTHETIC',allowedOrigin:'https://example.invalid'})).toThrow();
   const app=createSyntheticEmptyDemoApi({mode:'SYNTHETIC',allowedOrigin:'http://127.0.0.1:5173'});
   try{
     expect((await app.inject('/api/demo-profile')).statusCode).toBe(401);
     expect((await app.inject({url:'/api/dev/empty-demo/bootstrap',headers:{'sec-fetch-site':'cross-site'}})).statusCode).toBe(401);
     const a=await app.inject('/api/dev/empty-demo/bootstrap'),cookie=String(a.headers['set-cookie']).split(';')[0]!;
     expect(a.statusCode).toBe(302);
     const session=await app.inject({url:'/api/auth/session',headers:{cookie}});
     expect(session.json()).toMatchObject({role:'BETA',actorId:'SYN-EMPTY-DEMO-A'});
     const read=await app.inject({url:'/api/demo-profile',headers:{cookie}});
     expect(read.statusCode).toBe(200);expect(read.json().snapshot.namespace).toBe('EMPTY_DEMO');
     const b=await app.inject('/api/dev/empty-demo/bootstrap?slot=B'),other=String(b.headers['set-cookie']).split(';')[0]!;
     expect((await app.inject({url:'/api/auth/session',headers:{cookie:other}})).json().actorId).toBe('SYN-EMPTY-DEMO-B');
     expect((await app.inject({url:'/api/profile',headers:{cookie}})).statusCode).toBe(403);
   }finally{await app.close();}
 });
});
