import {describe,expect,it} from 'vitest';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {OwnerSessionController} from '../../apps/web/src/app/owner-session-controller.js';
describe('#123 ADMIN browser session remains distinct from BETA owner',()=>{
  it('accepts an authenticated ADMIN wire but never grants BETA owner scope',async()=>{
    const client=new HufsApiClient(async()=>new Response(JSON.stringify({actorId:'SYN-ADMIN',role:'ADMIN',
      schoolMailProofValid:true,betaAllowed:true}),{status:200,headers:{'content-type':'application/json'}}));
    expect((await client.getSession()).role).toBe('ADMIN');
    const owner=new OwnerSessionController(client);await owner.initialize();
    expect(owner.getState().status).toBe('FORBIDDEN');
  });
});
