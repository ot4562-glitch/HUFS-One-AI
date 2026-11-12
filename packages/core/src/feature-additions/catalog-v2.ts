/**
 * #348 — deterministic full *permitted* catalog search reference engine.
 *
 * Caller supplies a trusted, already-authorized snapshot. For a large real
 * database the API/DB team must implement SQL keyset pagination equivalent
 * to this ordering, then sign/verify the opaque HTTP cursor. Cursor state
 * returned by this pure function is NOT a safe public bearer token.
 */
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import {parseAsOf,verifySource,type FeatureMode} from './source-policy.js';

export type CatalogInternalCursor={
  scopeKey:string;catalogRevision:string;
  filterKey:string;lastId:string;lastSortValue:string;
};
export type CatalogSearchResult={
  items:readonly C.OpportunityCatalogItem[];
  nextCursor:CatalogInternalCursor|null;
  hasMore:boolean;totalInAuthorizedScope:number;
  /** Count is based on supplied approved snapshot, NOT the entire internet. */
  scope:'PERMITTED_APPROVED_SNAPSHOT';
  at:string;
};
function normalize(value:string):string{
  return value.normalize('NFKC').trim().toLocaleLowerCase('ko');
}
export function catalogFilterKey(query:C.OpportunityQuery):string {
  return JSON.stringify([
    normalize(query.q??''),query.category??null,query.campus??null,
    query.eligibility??null,query.deadlineBefore??null,query.includeClosed??false,
    query.sort,query.asOf,
  ]);
}
function sortValue(row:C.OpportunityCatalogItem,sort:C.OpportunityQuery['sort']):string {
  if(sort==='TITLE') return normalize(row.title);
  if(sort==='DEADLINE_ASC') return row.deadlineAt??'9999-12-31T23:59:59Z';
  return row.publishedAt??'0001-01-01T00:00:00Z';
}
function compareItems(
  a:C.OpportunityCatalogItem,b:C.OpportunityCatalogItem,sort:C.OpportunityQuery['sort'],
):number {
  if(sort==='TITLE') return normalize(a.title).localeCompare(normalize(b.title),'ko')
    ||a.id.localeCompare(b.id,'en');
  if(sort==='DEADLINE_ASC') {
    const ta=a.deadlineAt?Date.parse(a.deadlineAt):Infinity;
    const tb=b.deadlineAt?Date.parse(b.deadlineAt):Infinity;
    return ta-tb||a.id.localeCompare(b.id,'en');
  }
  const ta=a.publishedAt?Date.parse(a.publishedAt):-Infinity;
  const tb=b.publishedAt?Date.parse(b.publishedAt):-Infinity;
  return tb-ta||a.id.localeCompare(b.id,'en');
}
function cursorFingerprint(row:C.OpportunityCatalogItem,sort:C.OpportunityQuery['sort']):string {
  return sortValue(row,sort);
}
export function searchApprovedCatalogV2(input:{
  items:readonly C.OpportunityCatalogItem[];
  query:C.OpportunityQuery;
  scopeKey:string;catalogRevision:string;
  cursor?:CatalogInternalCursor;
  mode?:FeatureMode;
}):CatalogSearchResult {
  const {items,query}=input;
  const at=parseAsOf(query.asOf);
  if (!input.scopeKey || !input.catalogRevision
    || !Number.isSafeInteger(query.pageSize)||query.pageSize<1||query.pageSize>50)
    throw new RangeError('INVALID_SEARCH_CONTEXT');
  const key=catalogFilterKey(query);
  if(input.cursor && (input.cursor.scopeKey!==input.scopeKey
    ||input.cursor.catalogRevision!==input.catalogRevision||input.cursor.filterKey!==key))
    throw new RangeError('STALE_CURSOR');
  const tokens=normalize(query.q??'').split(/\s+/u).filter(Boolean);
  if(query.q && (tokens.length>8||normalize(query.q).length>100))
    throw new RangeError('UNBOUNDED_QUERY');
  const deadlineBefore=query.deadlineBefore?parseAsOf(query.deadlineBefore):undefined;
  const ids=new Map<string,number>();
  for(const item of items) ids.set(item.id,(ids.get(item.id)??0)+1);
  const accept=(item:C.OpportunityCatalogItem):boolean=>{
    // Same filter as the reference implementation: unauthorized/duplicated IDs
    // never become cursor anchors or user-visible search results.
    if(ids.get(item.id)!==1||!item.permitted
      ||!verifySource(item.source,query.asOf,input.mode).usable)return false;
    if(item.publishedAt && parseAsOf(item.publishedAt)>at)return false;
    if(!query.includeClosed&&item.deadlineAt&&parseAsOf(item.deadlineAt)<=at)return false;
    if(query.category&&query.category!==item.category)return false;
    if(query.campus&&item.campus!==query.campus)return false;
    if(query.eligibility&&item.eligibility!==query.eligibility)return false;
    if(deadlineBefore!==undefined
      &&(!item.deadlineAt||parseAsOf(item.deadlineAt)>deadlineBefore))return false;
    if(tokens.length){
      const haystack=normalize([item.title,item.summary,...item.topicCodes].join(' '));
      if(!tokens.every(token=>haystack.includes(token)))return false;
    }
    return true;
  };
  // Validate the exact already-authorized cursor row before advancing.
  // We cannot trust a bare lastSortValue to represent the full comparator.
  const anchor=input.cursor?items.find(item=>accept(item)
    &&item.id===input.cursor!.lastId
    &&cursorFingerprint(item,query.sort)===input.cursor!.lastSortValue):undefined;
  if(input.cursor&&!anchor)throw new RangeError('STALE_CURSOR');

  // Max heap of at most pageSize items: O(n log k) comparison work and O(k)
  // search memory, vs sorting every permitted row O(n log n) / O(n).
  // The IDs map above still costs O(n) to fail closed on duplicates.
  const heap:C.OpportunityCatalogItem[]=[];
  const worse=(a:C.OpportunityCatalogItem,b:C.OpportunityCatalogItem)=>
    compareItems(a,b,query.sort)>0;
  const push=(item:C.OpportunityCatalogItem)=>{
    heap.push(item);
    let i=heap.length-1;
    while(i>0){
      const parent=(i-1)>>1;
      if(!worse(heap[i]!,heap[parent]!))break;
      [heap[i],heap[parent]]=[heap[parent]!,heap[i]!];
      i=parent;
    }
  };
  const replaceWorst=(item:C.OpportunityCatalogItem)=>{
    heap[0]=item;
    let i=0;
    while(true){
      const left=i*2+1,right=left+1;
      let worst=i;
      if(left<heap.length&&worse(heap[left]!,heap[worst]!))worst=left;
      if(right<heap.length&&worse(heap[right]!,heap[worst]!))worst=right;
      if(worst===i)break;
      [heap[i],heap[worst]]=[heap[worst]!,heap[i]!];
      i=worst;
    }
  };
  let totalInAuthorizedScope=0,afterAnchor=0;
  for(const item of items){
    if(!accept(item))continue;
    totalInAuthorizedScope++;
    if(anchor&&compareItems(item,anchor,query.sort)<=0)continue;
    afterAnchor++;
    if(heap.length<query.pageSize)push(item);
    else if(compareItems(item,heap[0]!,query.sort)<0)replaceWorst(item);
  }
  const page=heap.sort((a,b)=>compareItems(a,b,query.sort));
  const hasMore=afterAnchor>page.length,last=page.at(-1);
  return {items:page,hasMore,totalInAuthorizedScope,
    nextCursor:hasMore&&last?{scopeKey:input.scopeKey,catalogRevision:input.catalogRevision,
      filterKey:key,lastId:last.id,lastSortValue:cursorFingerprint(last,query.sort)}:null,
    scope:'PERMITTED_APPROVED_SNAPSHOT',at:query.asOf};
}
