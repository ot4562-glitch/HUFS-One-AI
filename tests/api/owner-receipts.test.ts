import {describe,expect,it} from 'vitest';
import {OwnerReceipts} from '../../apps/api/src/modules/auth/owner-receipts.js';
type Proof={actorId:string;expires:number};
const proof=(actorId:string,expires=100):Proof=>({actorId,expires});
const make=()=>new OwnerReceipts<Proof>(p=>p.actorId,2,4);

describe('bounded non-evicting owner receipts (#227)',()=>{
  it('reserves each owner a bounded allocation without deleting another live proof',()=>{
    const receipts=make();
    receipts.set('B1',proof('SYN-B')).set('A1',proof('SYN-A')).set('A2',proof('SYN-A'));
    expect(()=>receipts.set('A3',proof('SYN-A'))).toThrow('Receipt admission unavailable');
    expect(receipts.get('B1')).toEqual(proof('SYN-B'));
    expect(receipts.size).toBe(3);
    receipts.set('B2',proof('SYN-B'));
    expect(receipts.size).toBe(4);
  });
  it('rejects global exhaustion without evicting any receipt and recovers capacity after deletion',()=>{
    const receipts=make();
    for(let i=1;i<=4;i++)receipts.set('T'+i,proof('SYN-'+i));
    expect(()=>receipts.set('T5',proof('SYN-5'))).toThrow('Receipt admission unavailable');
    expect([...receipts].map(([key])=>key)).toEqual(['T1','T2','T3','T4']);
    expect(receipts.delete('T2')).toBe(true);
    expect(receipts.delete('T2')).toBe(false);
    receipts.set('T5',proof('SYN-5'));
    expect(receipts.size).toBe(4);
    expect(receipts.get('T1')).toEqual(proof('SYN-1'));
  });
  it('prevents key overwrite and cross-owner reassignment without damaging counts',()=>{
    const receipts=make();receipts.set('T1',proof('SYN-A'));
    expect(()=>receipts.set('T1',proof('SYN-B'))).toThrow();
    expect(()=>receipts.set('T1',proof('SYN-A'))).toThrow();
    expect(receipts.get('T1')?.actorId).toBe('SYN-A');
    receipts.set('T2',proof('SYN-A'));
    expect(()=>receipts.set('T3',proof('SYN-A'))).toThrow();
  });
  it('supports adapter TTL cleanup and accounts deletion against the captured owner',()=>{
    const receipts=make(),value=proof('SYN-A',1);
    receipts.set('old',value).set('A2',proof('SYN-A')).set('B1',proof('SYN-B'));
    value.actorId='SYN-B';
    for(const [key,p] of receipts)if(p.expires<=2)receipts.delete(key);
    receipts.set('A3',proof('SYN-A')).set('B2',proof('SYN-B'));
    expect(receipts.size).toBe(4);
    expect(receipts.get('old')).toBeUndefined();
  });
  it('keeps independent adapter/process instances independent, not a distributed authorization cache',()=>{
    const a=make(),b=make();a.set('T1',proof('SYN-A'));
    expect(b.get('T1')).toBeUndefined();
    b.set('T1',proof('SYN-B'));
    expect(a.get('T1')?.actorId).toBe('SYN-A');
  });
  it.each([0,-1,1.5,NaN,Infinity])('rejects an invalid actor allocation: %s',limit=>{
    expect(()=>new OwnerReceipts<Proof>(p=>p.actorId,limit,4)).toThrow();
  });
  it.each([0,1,1.5,2049,NaN,Infinity])('rejects an invalid global allocation: %s',limit=>{
    expect(()=>new OwnerReceipts<Proof>(p=>p.actorId,2,limit)).toThrow();
  });
  it.each(['','space owner','x'.repeat(201)])('rejects malformed owner identities: %s',actor=>{
    const receipts=make();expect(()=>receipts.set('T1',proof(actor))).toThrow();
    expect(receipts.size).toBe(0);
  });
});
