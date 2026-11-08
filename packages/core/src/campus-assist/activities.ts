import {ActivityForecastSchema,ActivityRecordSchema,type ActivityRecord,type ActivityForecast} from '@hufs-one/contracts';

function epoch(iso:string):number{
  const ms=Date.parse(iso);
  if(!Number.isFinite(ms))throw new RangeError('Invalid asOf');
  return ms;
}
function year(day:string):number{return Number(day.slice(0,4));}
function dayOfYear(day:string):number{
  const m=Number(day.slice(5,7)), d=Number(day.slice(8,10));
  // A leap-day occurrence is folded into February 28 for a coarse seasonal window.
  return Math.floor((Date.UTC(2001,m-1,m===2&&d===29?28:d)-Date.UTC(2001,0,1))/86400000);
}
/**
 * `day` is an offset in the common (non-leap) reference year 2001. Rebuild its
 * month/day inside the *target* year's own calendar before applying the margin,
 * so a leap target year does not shift dates after February by one day (#370),
 * then clamp to that target year's January 1 – December 31.
 */
function windowDate(targetYear:number,day:number,marginDays:number):string{
  const common=new Date(Date.UTC(2001,0,1)+Math.max(0,Math.min(364,day))*86400000);
  const ms=Date.UTC(targetYear,common.getUTCMonth(),common.getUTCDate())+marginDays*86400000;
  const clamped=Math.min(Date.UTC(targetYear,11,31),Math.max(Date.UTC(targetYear,0,1),ms));
  return new Date(clamped).toISOString().slice(0,10);
}
export interface ActivityFilter{
  organizationId?:string; year?:number; campus?:ActivityRecord['campus']; query?:string;
}
/** Newest revision per sourceId that was both published and verified by asOf. */
function sourceHeadsAt(parsed:readonly ActivityRecord[],time:number):Map<string,ActivityRecord>{
  const heads=new Map<string,ActivityRecord>();
  for(const item of parsed){
    if(epoch(item.publishedAt)>time||epoch(item.verifiedAt)>time)continue;
    const prev=heads.get(item.sourceId);
    if(!prev||epoch(prev.publishedAt)<epoch(item.publishedAt)||
      (prev.publishedAt===item.publishedAt&&prev.revisionId<item.revisionId))
      heads.set(item.sourceId,item);
  }
  return heads;
}
/** Fail closed on newer revoked/blocked heads, never resurrect an older approved revision. */
export function currentActivityRecords(raw:readonly ActivityRecord[],asOf:string):ActivityRecord[]{
  const time=epoch(asOf);
  const parsed=ActivityRecordSchema.array().max(10000).parse(raw);
  const heads=sourceHeadsAt(parsed,time);
  const latest=[...heads.values()].filter(item=>item.rights==='APPROVED'&&item.status!=='DELETED');
  const events=new Map<string,ActivityRecord>();
  for(const item of latest){
    const y=item.eventDate?year(item.eventDate):year(item.publishedAt.slice(0,10));
    const key=item.organizationId+':'+item.seriesId+':'+y;
    const prev=events.get(key);
    if(!prev||epoch(item.publishedAt)>epoch(prev.publishedAt)||
      (item.publishedAt===prev.publishedAt&&item.revisionId>prev.revisionId))
      events.set(key,item);
  }
  return [...events.values()].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)||a.entryId.localeCompare(b.entryId));
}
export function archiveActivities(raw:readonly ActivityRecord[],asOf:string,filter:ActivityFilter={}):ActivityRecord[]{
  const query=(filter.query||'').trim().toLocaleLowerCase('ko');
  return currentActivityRecords(raw,asOf).filter(row=>
    (!filter.organizationId||row.organizationId===filter.organizationId)
    &&(!filter.year||year((row.eventDate||row.publishedAt.slice(0,10)))===filter.year)
    &&(!filter.campus||row.campus===filter.campus||row.campus==='BOTH')
    &&(!query||(row.title+' '+row.organizationId).toLocaleLowerCase('ko').includes(query)));
}
export function forecastActivity(raw:readonly ActivityRecord[],asOf:string,targetYear:number,
  organizationId:string,seriesId:string):ActivityForecast{
  epoch(asOf);
  if(!Number.isInteger(targetYear)||targetYear<2000||targetYear>2200)throw new RangeError('targetYear');
  const records=currentActivityRecords(raw,asOf).filter(row=>
    row.organizationId===organizationId&&row.seriesId===seriesId);
  const selected=records.find(row=>row.eventDate&&year(row.eventDate)===targetYear
    &&(row.status==='CONFIRMED'||row.status==='CANCELLED'));
  const prior=records.filter(row=>row.status==='CONFIRMED'&&row.eventDate&&year(row.eventDate)<targetYear
    &&Date.parse(row.eventDate+'T00:00:00Z')<=epoch(asOf)).sort((a,b)=>a.eventDate!.localeCompare(b.eventDate!));
  const byYear=new Map<number,ActivityRecord>();
  for(const row of prior)byYear.set(year(row.eventDate!),row);
  const history=[...byYear.values()].sort((a,b)=>a.eventDate!.localeCompare(b.eventDate!));
  const evidence=history.map(x=>x.revisionId);
  const observedYears=history.map(x=>year(x.eventDate!));
  const result=(state:ActivityForecast['state'],confidence:ActivityForecast['confidence'],reason:string,
    from?:string,to?:string,leading?:ActivityRecord):ActivityForecast=>ActivityForecastSchema.parse({
    organizationId,seriesId,targetYear,asOf,state,confidence,observedYears,
    evidenceRefs:leading?[leading.revisionId,...evidence]:evidence,reason,
    ...(from?{from}:{}),...(to?{to}:{}),
  });
  // #371: a verified cancellation may omit the exact event date. It is checked
  // *before* a dated target-year record is returned, because the two can sit
  // under different archive years (e.g. confirmation posted 2026-10 for a 2027
  // event, cancellation posted 2026-12). A `supersedes` link is trusted only
  // when it points at a current, verified, approved head at asOf; otherwise the
  // link is treated as unresolved. Only a newer dated record overrides it.
  const time=epoch(asOf);
  const heads=sourceHeadsAt(ActivityRecordSchema.array().max(10000).parse(raw),time);
  const trustedTarget=(ref:string)=>[...heads.values()].find(row=>
    (row.revisionId===ref||row.entryId===ref)&&row.organizationId===organizationId
    &&row.seriesId===seriesId&&row.rights==='APPROVED'&&row.status!=='DELETED'&&row.eventDate);
  const lastHeld=records.filter(row=>row.status==='CONFIRMED'&&row.eventDate
    &&Date.parse(row.eventDate+'T00:00:00Z')<=time).map(row=>row.eventDate!).sort().at(-1);
  const supersededBySelected=(cancel:ActivityRecord)=>!!selected&&epoch(selected.publishedAt)>epoch(cancel.publishedAt);
  for(const cancel of records.filter(row=>row.status==='CANCELLED'&&!row.eventDate)){
    if(supersededBySelected(cancel))continue;
    const target=cancel.supersedes===undefined?undefined:trustedTarget(cancel.supersedes);
    if(target){
      if(year(target.eventDate!)===targetYear)return result('CANCELLED','NONE',
        '해당 연도 행사를 대상으로 한 확인된 취소 공지가 있습니다(정확한 날짜 미기재).',
        undefined,undefined,cancel);
      continue;
    }
    const published=cancel.publishedAt.slice(0,10);
    if((lastHeld===undefined||published>lastHeld)&&targetYear>=year(published))
      return result('UNKNOWN','NONE',
        '날짜가 없는 취소 공지가 있어 어느 회차의 취소인지 확인될 때까지 예측을 보류합니다.',
        undefined,undefined,cancel);
  }
  if(selected)return result(selected.status==='CANCELLED'?'CANCELLED':'CONFIRMED','NONE',
    '해당 연도의 확인된 출처가 과거 패턴보다 우선합니다.',selected.eventDate,selected.eventDate,selected);
  if(history.length<2)return result('INSUFFICIENT_DATA','NONE','서로 다른 연도의 개최 근거가 2개 미만입니다.');
  const dates=history.map(r=>dayOfYear(r.eventDate!));
  const spread=Math.max(...dates)-Math.min(...dates);
  if(spread>45)return result('UNKNOWN','NONE','과거 개최 시기 분산이 커서 예측을 보류합니다.');
  const confidence=history.length>=3&&spread<=21?'MEDIUM':'LOW';
  const from=windowDate(targetYear,Math.min(...dates),-7);
  const to=windowDate(targetYear,Math.max(...dates),7);
  return result('PREDICTED',confidence,'과거 반복 행사로 추정한 대략적 기간입니다. 공식 확정 일정이 아닙니다.',from,to);
}
