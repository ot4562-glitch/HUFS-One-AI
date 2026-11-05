/** Process-local, bounded receipt admission. An abusive owner can exhaust its
 * own allocation but cannot evict another owner's live in-flight proof.
 * Adapters retain their expiry, current-rights and consume-once checks. This is
 * not a cross-process quota or an authorization cache. */
export class OwnerReceipts<T> implements Iterable<[string,T]> {
  private readonly entries=new Map<string,{owner:string;value:T}>();
  private readonly counts=new Map<string,number>();
  constructor(private readonly ownerOf:(value:T)=>string,
    private readonly perOwner=128,private readonly total=2048){
    if(!Number.isSafeInteger(perOwner)||!Number.isSafeInteger(total)
      ||perOwner<1||total<perOwner||total>2048)
      throw new TypeError('Invalid receipt allocation bound');
  }
  get size():number{return this.entries.size;}
  get(key:string):T|undefined{return this.entries.get(key)?.value;}
  set(key:string,value:T):this{
    const owner=this.ownerOf(value);
    if(typeof key!=='string'||key.length<1||key.length>512
      ||typeof owner!=='string'||! /^[A-Za-z0-9_.:@-]{1,200}$/.test(owner))
      throw new TypeError('Invalid receipt identity');
    // Synchronous admission prevents an await race; never replace an existing
    // receipt, silently evict a live entry, or reveal another owner's counts.
    const used=this.counts.get(owner)??0;
    if(this.entries.has(key)||used>=this.perOwner||this.entries.size>=this.total)
      throw new Error('Receipt admission unavailable');
    this.entries.set(key,{owner,value});
    this.counts.set(owner,used+1);
    return this;
  }
  delete(key:string):boolean{
    const entry=this.entries.get(key);
    if(!entry)return false;
    this.entries.delete(key);
    // Use the captured owner even if a server-side value was later modified.
    const remaining=(this.counts.get(entry.owner)??1)-1;
    if(remaining===0)this.counts.delete(entry.owner);
    else this.counts.set(entry.owner,remaining);
    return true;
  }
  *[Symbol.iterator]():IterableIterator<[string,T]>{
    for(const [key,entry] of this.entries)yield [key,entry.value];
  }
}
