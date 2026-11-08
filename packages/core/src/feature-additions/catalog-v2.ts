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
  const filtered=items.filter(item=>{
    // Unstable duplicated IDs are rejected rather than returning an arbitrary row.
    if(ids.get(item.id)!==1 || !item.permitted
      || !verifySource(item.source,query.asOf,input.mode).usable) return false;
    if(item.publishedAt && parseAsOf(item.publishedAt)>at) return false;
    // Default catalog is actionable; expired entries are an explicit archive opt-in.
    if(!query.includeClosed && item.deadlineAt && parseAsOf(item.deadlineAt)<=at) return false;
    if(query.category && query.category!==item.category) return false;
    if(query.campus && item.campus!==query.campus) return false;
    if(query.eligibility && item.eligibility!==query.eligibility) return false;
    if(deadlineBefore!==undefined
      && (!item.deadlineAt||parseAsOf(item.deadlineAt)>deadlineBefore)) return false;
    if(tokens.length){
      const haystack=normalize([item.title,item.summary,...item.topicCodes].join(' '));
      if(!tokens.every(token=>haystack.includes(token))) return false;
    }
    return true;
  }).sort((a,b)=>compareItems(a,b,query.sort));
  let start=0;
  if(input.cursor){
    const index=filtered.findIndex(item=>item.id===input.cursor!.lastId
      &&cursorFingerprint(item,query.sort)===input.cursor!.lastSortValue);
    if(index<0) throw new RangeError('STALE_CURSOR');
    start=index+1;
  }
  const page=filtered.slice(start,start+query.pageSize);
  const hasMore=start+page.length<filtered.length;
  const last=page.at(-1);
  return {items:page,hasMore,totalInAuthorizedScope:filtered.length,
    nextCursor:hasMore&&last?{scopeKey:input.scopeKey,catalogRevision:input.catalogRevision,
      filterKey:key,lastId:last.id,lastSortValue:cursorFingerprint(last,query.sort)}:null,
    scope:'PERMITTED_APPROVED_SNAPSHOT',at:query.asOf};
}
