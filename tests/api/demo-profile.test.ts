import {describe,expect,it} from 'vitest';
import {blankDemoProfileValue,DemoProfileResponseSchema,type DemoProfileRecord,type DemoProfileValue} from '@hufs-one/contracts';
import {DemoProfileService,DemoProfileConflict,type DemoProfileStore} from '../../apps/api/src/modules/profiles/demo-profile.js';
const NOW='2026-11-03T00:00:00.000Z';
const A:DemoProfileValue={primaryMajor:'가상 정보학',earnedCreditUnits:0,interestTopics:['AI_ML','DATA_ANALYTICS'],doubleMajor:{kind:'NONE'}};
const B:DemoProfileValue={primaryMajor:'가상 문화학',earnedCreditUnits:1,interestTopics:['CULTURE_TOURISM','LANGUAGE_TRANSLATION'],doubleMajor:{kind:'DOUBLE',major:'가상 환경학'}};
function fixture(){
  const rows=new Map<string,DemoProfileRecord>();
  const store:DemoProfileStore={read:async id=>structuredClone(rows.get(id)??{version:0,value:blankDemoProfileValue(),updatedAt:null}),
    save:async(id,raw)=>{const before=await store.read(id);if(before.version!==raw.expectedVersion)throw new DemoProfileConflict();
      const next={version:before.version+1,value:raw.value,updatedAt:NOW};rows.set(id,next);return next;},
    reset:async(id,raw)=>{const before=await store.read(id);if(before.version!==raw.expectedVersion)throw new DemoProfileConflict();
      const next={version:before.version+1,value:blankDemoProfileValue(),updatedAt:NOW};rows.set(id,next);return next;}};
  return {service:new DemoProfileService(store),store,rows};
}
describe('standard product demo-profile recomputation bridge',()=>{
  it('starts empty and recomputes feed, notices and clubs for A/B/reset using maintained synthetic cores',async()=>{
    const h=fixture(),blank=await h.service.read('synthetic:owner-a');
    expect(DemoProfileResponseSchema.parse(blank).snapshot.namespace).toBe('EMPTY_DEMO');
    expect(blank.snapshot.feed.featured).toEqual([]);expect(blank.snapshot.clubs.recommended).toEqual([]);
    const a=await h.service.save('synthetic:owner-a',{expectedVersion:0,value:A});
    const b=await h.service.save('synthetic:owner-a',{expectedVersion:1,value:B});
    expect(a.profile.value.earnedCreditUnits).toBe(0);expect(b.profile.value.earnedCreditUnits).toBe(1);
    expect(a.snapshot.feed).not.toEqual(b.snapshot.feed);expect(a.snapshot.notices).not.toEqual(b.snapshot.notices);
    expect(a.snapshot.clubs).not.toEqual(b.snapshot.clubs);
    for(const response of [blank,a,b]){
      expect(response.snapshot.verification).toBe('UNVERIFIED_SELF_REPORT');
      expect(response.snapshot.academics.state).toBe('UNKNOWN');expect(response.snapshot.forecast.state).toBe('UNKNOWN');
      expect([...response.snapshot.feed.featured,...response.snapshot.feed.compact].every(c=>c.dataMode==='SYNTHETIC')).toBe(true);
    }
    const reset=await h.service.reset('synthetic:owner-a',{expectedVersion:2});
    expect(reset.profile.value).toEqual(blank.profile.value);
    expect({...reset.snapshot,version:0}).toEqual(blank.snapshot);
    expect((await h.service.read('synthetic:owner-b')).profile.value).toEqual(blank.profile.value);
  });
  it('fails closed when a concurrent save overtakes derived computation',async()=>{
    const h=fixture();let reads=0;
    const actual=h.store.read;
    h.store.read=async id=>{reads++;if(reads===2)return {version:1,value:A,updatedAt:NOW};return actual(id);};
    await expect(h.service.read('synthetic:owner-a')).rejects.toBeInstanceOf(DemoProfileConflict);
  });
});
