import {afterEach,describe,expect,it,vi} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {closedRepository} from '../../apps/api/src/repository.js';
import type {ActivityRecord} from '@hufs-one/contracts';

const NOW='2027-01-03T00:00:00Z',ORIGIN='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'SYN-ACTIVITY-OWNER',
  sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2027-12-01T00:00:00Z',
  schoolMailProofExpiresAt:'2027-12-01T00:00:00Z'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
function row(i:number,extra:Partial<ActivityRecord>={}):ActivityRecord{
  const id='SYN-ARCH-'+String(i).padStart(3,'0');
  return {entryId:id,sourceId:id,revisionId:id+'-REV',organizationId:'SYN-ECON',
    seriesId:id,title:'가상 행사 '+String(i).padStart(3,'0'),
    kind:i>=203?'ACADEMIC':'ORIENTATION',
    campus:i>=203?'GLOBAL':'SEOUL',
    publishedAt:'2026-01-03T00:00:00Z',verifiedAt:'2026-01-03T00:01:00Z',
    eventDate:'2026-05-01',sourceUrl:'https://example.org/synthetic/'+id,
    status:'CONFIRMED',rights:'APPROVED',provenance:'SYNTHETIC',...extra};
}
function fixture(rows:readonly ActivityRecord[]){
  let entitled=true;
  const activities={read:vi.fn(async()=>({items:rows,receipt:{
    actorId:actor.actorId,sourceVersion:'SYN-REV-1',expiresAt:'2027-06-01T00:00:00Z'}})),
    revalidate:vi.fn(async()=>entitled)};
  const app=createIntegratedApi({allowedOrigin:ORIGIN,repository:closedRepository,
    now:()=>NOW,auth:{verifySession:async()=>actor,revokeSession:async()=>{}},
    campusAssist:{activities}});
  apps.push(app);
  return {app,activities,revoke:()=>{entitled=false;}};
}
const url=(args:string)=>'/api/owner/activities?asOf='+encodeURIComponent(NOW)+args;
describe('#339 offline approved activity archive HTTP filters and coverage',()=>{
  it('does not misrepresent 205 authorized events as the complete first 200',async()=>{
    const h=fixture(Array.from({length:205},(_,i)=>row(i)));
    const all=await h.app.inject({url:url('')});
    expect(all.statusCode).toBe(200);
    expect(all.json().items).toHaveLength(200);
    expect(all.json().hasMore).toBe(true);
    expect(all.json().sourceVersion).toBe('SYN-REV-1');
    expect(all.headers['cache-control']).toBe('no-store');
    expect(h.activities.revalidate).toHaveBeenCalledOnce();
  });
  it('applies campus/kind/year/search filters before the 200-row limit',async()=>{
    const h=fixture(Array.from({length:205},(_,i)=>row(i)));
    const u=url('&kind=ACADEMIC&campus=GLOBAL&year=2026&query=SYN-ARCH-204');
    // Event source/series can be used as an official matching reference.
    const filtered=await h.app.inject({url:u});
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json()).toMatchObject({hasMore:false,sourceVersion:'SYN-REV-1'});
    expect(filtered.json().items.map((r:ActivityRecord)=>r.entryId)).toEqual(['SYN-ARCH-204']);
    expect((await h.app.inject({url:url('&kind=LECTURE')})).json()).toMatchObject({
      items:[],hasMore:false,
    });
    expect((await h.app.inject({url:url('&campus=SEOUL&kind=ACADEMIC')})).json().items)
      .toHaveLength(0);
  });
  it('rejects unrecognized filter values before using a source snapshot',async()=>{
    const h=fixture([row(0)]);
    const bad=await h.app.inject({url:url('&kind=FAKE')});
    expect(bad.statusCode).toBe(422);
    expect(h.activities.read).not.toHaveBeenCalled();
  });
  it('groups undated New-Year notices by their KST year without inventing eventDate',async()=>{
    const h=fixture([row(1,{publishedAt:'2026-12-31T15:00:00Z',
      verifiedAt:'2026-12-31T15:00:00Z',eventDate:undefined})]);
    const old=await h.app.inject({url:url('&year=2026')});
    const current=await h.app.inject({url:url('&year=2027')});
    expect(old.json().items).toHaveLength(0);
    expect(current.json().items).toHaveLength(1);
    expect(current.json().items[0]?.eventDate).toBeUndefined();
  });
  it('never returns a filtered result if current rights are revoked after read',async()=>{
    const h=fixture([row(0)]);h.revoke();
    const result=await h.app.inject({url:url('&kind=ORIENTATION')});
    expect(result.statusCode).toBe(403);
    expect(result.body).not.toContain('가상 행사');
  });
});
