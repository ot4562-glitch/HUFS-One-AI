import {describe,expect,it} from 'vitest';
import {createCatalogCursorSigner,CatalogCursorError} from
  '../../packages/core/src/feature-additions/server-cursor.js';
import {catalogFilterKey,searchApprovedCatalogV2} from
  '../../packages/core/src/feature-additions/catalog-v2.js';
import {FIXED_NOW,opportunity,query} from
  '../../packages/core/src/feature-additions/v2.fixtures.js';

const now=Date.parse(FIXED_NOW);
const request=query({q:'economics',sort:'DEADLINE_ASC',pageSize:1});
const context={actorId:'owner-S01',consentVersion:'consent-v3',
  catalogRevision:'catalog-r7',scopeKey:'scope-owner-S01',query:request,nowMs:now};
const key=new Uint8Array(Array.from({length:32},(_,i)=>i+1)); // synthetic fixture, NEVER a deployment secret
const rotated=new Uint8Array(Array.from({length:32},(_,i)=>i+33));
const signer=createCatalogCursorSigner({activeKeyId:'key1',keys:new Map([['key1',key]]),ttlMs:60_000});
const cursor={scopeKey:context.scopeKey,catalogRevision:context.catalogRevision,
  filterKey:catalogFilterKey(context.query),lastId:'item-1',lastSortValue:'2026-11-20T00:00:00+09:00'};
const sign=()=>signer.sign(cursor,context);
const fail=(token:string,ctx=context,code:CatalogCursorError['code']='INVALID_CURSOR')=>{
  try{signer.verify(token,ctx);throw Error('unexpected successful verification');}
  catch(error){expect(error).toBeInstanceOf(CatalogCursorError);
    expect((error as CatalogCursorError).code).toBe(code);}
};
describe('#348 server-only opaque cursor signer and verifier',()=>{
  it('round-trips only the authorized internal search cursor',()=>{
    const token=sign();
    expect(token).not.toContain('owner-S01');
    expect(token).not.toContain('catalog-r7');
    expect(signer.verify(token,context)).toEqual(cursor);
  });
  it('rejects every tampered base64 token',()=>{
    const original=sign();
    const [body,mac]=original.split('.');
    fail(body+'A.'+mac);
    fail(body+'.'+mac!.slice(0,-1)+(mac!.endsWith('A')?'B':'A'));
  });
  it('rejects missing signature, JSON, object or super-long token',()=>{
    fail('bad');
    fail('{"lastId":"item-1"}');
    fail('a'.repeat(2050));
  });
  it('binds cursor to actor, verified current consent and scope',()=>{
    const token=sign();
    fail(token,{...context,actorId:'owner-S02'},'STALE_CURSOR');
    fail(token,{...context,consentVersion:'consent-v4'},'STALE_CURSOR');
    fail(token,{...context,scopeKey:'scope-owner-S02'},'STALE_CURSOR');
  });
  it('binds cursor to catalog source revision',()=>{
    fail(sign(),{...context,catalogRevision:'catalog-r8'},'STALE_CURSOR');
  });
  it('binds cursor to filter changes and reference time',()=>{
    fail(sign(),{...context,query:query({...request,q:'finance'})},'STALE_CURSOR');
    fail(sign(),{...context,query:query({...request,asOf:'2026-11-07T12:00:00+09:00'})},
      'STALE_CURSOR');
  });
  it('expires deterministically and does not trust the browser clock',()=>{
    fail(sign(),{...context,nowMs:now+60_000},'EXPIRED_CURSOR');
    fail(sign(),{...context,nowMs:now-1},'INVALID_CURSOR');
  });
  it('rejects a stale inner keyset if the active key has rotated away',()=>{
    const token=sign();
    const other=createCatalogCursorSigner({activeKeyId:'key2',
      keys:new Map([['key2',rotated]]),ttlMs:60_000});
    expect(()=>other.verify(token,context)).toThrow('INVALID_CURSOR');
  });
  it('can verify a previous valid key during supervised rotation',()=>{
    const old=sign();
    const successor=createCatalogCursorSigner({activeKeyId:'key2',
      keys:new Map([['key1',key],['key2',rotated]]),ttlMs:60_000});
    expect(successor.verify(old,context)).toEqual(cursor);
    expect(successor.sign(cursor,context)).not.toEqual(old);
  });
  it('rejects missing, short, oversized, or unreasonable signing configurations',()=>{
    expect(()=>createCatalogCursorSigner({activeKeyId:'none',keys:new Map()}))
      .toThrow('MISCONFIGURED_CURSOR');
    expect(()=>createCatalogCursorSigner({activeKeyId:'key1',
      keys:new Map([['key1',new Uint8Array(16)]])})).toThrow();
    expect(()=>createCatalogCursorSigner({activeKeyId:'key1',keys:new Map([['key1',key]]),
      ttlMs:60*60*1000})).toThrow();
  });
  it('refuses signing arbitrary scope or unmatched filter keys',()=>{
    expect(()=>signer.sign({...cursor,filterKey:'other'},context)).toThrow('STALE_CURSOR');
    expect(()=>signer.sign({...cursor,scopeKey:'another-actor'},context)).toThrow('STALE_CURSOR');
  });
  it('does not accept client-defined future or broken query context',()=>{
    expect(()=>signer.sign(cursor,{...context,nowMs:NaN})).toThrow('MISCONFIGURED_CURSOR');
    expect(()=>signer.sign(cursor,{...context,query:query({...request,pageSize:1000})}))
      .toThrow('MISCONFIGURED_CURSOR');
  });
  it('connects a core nextCursor to a verified authenticated second page',()=>{
    const catalog=[opportunity('item-1',{title:'Economics internship 1',
      deadlineAt:'2026-11-20T00:00:00+09:00'}),
      opportunity('item-2',{title:'Economics internship 2',
        deadlineAt:'2026-11-21T00:00:00+09:00'})];
    const first=searchApprovedCatalogV2({items:catalog,query:context.query,
      scopeKey:context.scopeKey,catalogRevision:context.catalogRevision});
    expect(first.items.map(x=>x.id)).toEqual(['item-1']);
    const opaque=signer.sign(first.nextCursor!,context);
    const second=searchApprovedCatalogV2({items:catalog,query:context.query,
      scopeKey:context.scopeKey,catalogRevision:context.catalogRevision,
      cursor:signer.verify(opaque,context)});
    expect(second.items.map(x=>x.id)).toEqual(['item-2']);
    expect(second.nextCursor).toBeNull();
  });
});
describe('#348 cursor confidentiality at the transport boundary',()=>{
  it('does not expose actor identity, consent revision, scope or search text in decoded payload',()=>{
    const token=sign();
    const decoded=Buffer.from(token.split('.')[0]!,'base64url').toString('utf8');
    expect(decoded).not.toContain(context.actorId);
    expect(decoded).not.toContain(context.consentVersion);
    expect(decoded).not.toContain(context.scopeKey);
    expect(decoded).not.toContain('economics');
    expect(JSON.parse(decoded)).toHaveProperty('actorBinding');
  });
});
