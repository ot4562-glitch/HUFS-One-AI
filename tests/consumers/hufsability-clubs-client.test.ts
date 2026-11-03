import {describe,expect,it,vi} from 'vitest';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {OwnerSessionController} from '../../apps/web/src/app/owner-session-controller.js';
import {getHufsAbilityManifest} from '@hufs-one/contracts';
import {composeClubBoard} from '../../packages/core/src/opportunities/clubs.js';
import {DEMO_CLUB_POSTS,DEMO_CLUB_PROFILES} from '../../packages/core/src/opportunities/demo-clubs.js';
import {DEMO_AS_OF} from '../../packages/core/src/opportunities/demo-corpus.js';

const json=(body:unknown)=>new Response(JSON.stringify(body),
  {headers:{'content-type':'application/json'}});
const rank=composeClubBoard(DEMO_CLUB_PROFILES[0]!.profile,DEMO_CLUB_POSTS,{asOf:DEMO_AS_OF});
const club=rank.all[0]!;
const item={post:club.post,lifecycle:club.lifecycle,eligibility:club.eligibility,
  reasons:club.reasons,evidenceRefs:club.evidenceRefs};
const detail={mode:'SYNTHETIC_DEMO',approvalNotice:'가상 관리자 승인(시연)',
  applicationNotice:'실제 지원 불가',asOf:DEMO_AS_OF,item};
const board={mode:detail.mode,approvalNotice:detail.approvalNotice,
  applicationNotice:detail.applicationNotice,asOf:detail.asOf,
  configVersion:rank.configVersion,items:[item],recommendedIds:[]};
function harness(response:unknown){
  const urls:string[]=[],fetcher=vi.fn(async(url:string)=>{
    urls.push(url);return json(response);
  });
  return {owner:new HufsApiClient(fetcher).owner,urls,fetcher};
}
describe('#123/#124 owner-side read-only browser DTO consumer',()=>{
  it('retains the official disabled menu without inventing active university routes',async()=>{
    const original=getHufsAbilityManifest(),h=harness(original);
    expect(await h.owner.getHufsAbilityCapabilities()).toEqual(original);
    expect(h.urls).toEqual(['/api/hufsability/capabilities']);
    const altered=structuredClone(original);
    altered.categories[0]!.items[0]!.state='DEMO_AVAILABLE';
    await expect(harness(altered).owner.getHufsAbilityCapabilities()).rejects.toBeDefined();
    expect(h.fetcher).toHaveBeenCalledOnce();
  });
  it('accepts only approved fictional club cards and does not transmit student selectors',async()=>{
    const h=harness(board),signal=new AbortController().signal;
    expect(await h.owner.listSyntheticClubs(signal)).toEqual(board);
    expect(h.urls).toEqual(['/api/synthetic/clubs']);
    const bad={...board,items:[{...item,post:{...item.post,state:'REVOKED'}}]};
    await expect(harness(bad).owner.listSyntheticClubs()).rejects.toBeDefined();
  });
  it('rechecks direct club identity and rejects future or revoked details',async()=>{
    const h=harness(detail);
    expect(await h.owner.getSyntheticClub(item.post.id)).toEqual(detail);
    expect(h.urls).toEqual(['/api/synthetic/clubs/'+item.post.id]);
    await expect(harness(detail).owner.getSyntheticClub('../private')).rejects
      .toMatchObject({code:'INVALID_INPUT'});
    await expect(harness({...detail,item:{...item,post:{...item.post,id:'SYN-CLUB-099'}}})
      .owner.getSyntheticClub(item.post.id)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
    await expect(harness({...detail,item:{...item,post:{...item.post,
      approvedAt:'2026-11-22T00:00:00Z'}}}).owner.getSyntheticClub(item.post.id))
      .rejects.toBeDefined();
  });
  it('does not let a late result repopulate the UI after logout',async()=>{
    let release!:(value:Response)=>void;
    const client=new HufsApiClient(async()=>new Promise(r=>{release=r;}));
    const guard=new OwnerSessionController({getSession:async()=>({
      actorId:'synthetic',role:'BETA',schoolMailProofValid:true,betaAllowed:true})});
    await guard.initialize();
    const job=guard.runLatest('synthetic-clubs',signal=>client.owner.listSyntheticClubs(signal));
    await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
    guard.invalidateLocalSession();release(json(board));
    expect(await job).toBeNull();
    guard.dispose();
  });
});
