import {
  ExperiencePortfolioSchema,TOPIC_CODES,
  type ExperiencePortfolio,type SelfConsent,type SelfProfile,type TopicCode,
} from '@hufs-one/contracts';
import {buildCareerTimeline} from '../../../../../packages/core/src/career/roadmap.js';
import {assertCareerConsentCurrent,requireCareerConsent} from './careerConsent.js';

const PAGE_SIZE=20;
/** The owner store caps each kind at 200 records; do not silently call a truncated scan complete. */
const MAX_PAGES=10;
type Query={limit:number;afterId?:string};
export interface InventoryPort {
  getPortfolio(query:Query,signal?:AbortSignal):Promise<ExperiencePortfolio>;
  getConsents(signal?:AbortSignal):Promise<{consents:SelfConsent|null}>;
  getProfile(signal?:AbortSignal):Promise<{profile:SelfProfile|null}>;
}
export interface CareerInventory {
  /** This is a verified double traversal, never a transaction snapshot or a credential assessment. */
  readonly coverage:'DOUBLE_SCANNED_PAGES';
  readonly asOf:string;
  readonly consentVersion:number;
  readonly profileVersion:number;
  readonly pages:number;
  readonly scannedRecords:number;
  readonly excludedSynthetic:number;
  readonly evidenceCount:number;
  readonly strengths:readonly {topicCode:TopicCode;experienceIds:readonly string[]}[];
  readonly explorationTopics:readonly TopicCode[];
  readonly timeline:ReturnType<typeof buildCareerTimeline>;
}
function stopped(signal:AbortSignal):void{
  if(signal.aborted)throw new Error('Career inventory read cancelled');
}
function consistentProfile(before:SelfProfile,after:SelfProfile|null):void{
  if(!after||after.version!==before.version
    ||JSON.stringify(after.value)!==JSON.stringify(before.value))
    throw new Error('Career profile changed during inventory scan');
}
/** Across pages, cursor and evidence identity must remain strictly ordered. */
async function traverse(read:InventoryPort['getPortfolio'],consentVersion:number,signal:AbortSignal){
  const pages:ExperiencePortfolio[]=[];
  const visited=new Set<string>();
  let afterId:string|undefined;
  for(let index=0;index<MAX_PAGES;index++){
    stopped(signal);
    const page=ExperiencePortfolioSchema.parse(await read(
      afterId?{limit:PAGE_SIZE,afterId}:{limit:PAGE_SIZE},signal));
    stopped(signal);
    if(page.portfolio.consentVersion!==consentVersion)
      throw new Error('Consent version changed within portfolio scan');
    if(page.items.some((record,i)=>visited.has(record.itemId)||(
      afterId!==undefined&&record.itemId<=afterId)||(i>0&&page.items[i-1]!.itemId>=record.itemId)))
      throw new Error('Repeated, reordered or stale portfolio cursor');
    for(const record of page.items)visited.add(record.itemId);
    if(page.nextCursor!==null&&(page.items.length!==PAGE_SIZE
      ||page.nextCursor!==page.items.at(-1)?.itemId
      ||page.nextCursor===afterId))
      throw new Error('Inconsistent portfolio pagination');
    pages.push(page);
    if(page.nextCursor===null)return pages;
    afterId=page.nextCursor;
  }
  throw new Error('Portfolio exceeds the bounded owner-store inventory capacity');
}
/** asOf is a fresh server read timestamp (may differ per page), so compare
 * records, approvals and cursor order, not a made-up equal-asOf snapshot token. */
function fingerprint(pages:readonly ExperiencePortfolio[]):string{
  return JSON.stringify(pages.map(page=>({
    items:page.items,evidence:page.portfolio.evidence,topics:page.portfolio.topics,
    cursor:page.nextCursor,consent:page.portfolio.consentVersion,
  })));
}
export async function scanCareerInventory(port:InventoryPort,profile:SelfProfile,signal:AbortSignal):Promise<CareerInventory>{
  const before=requireCareerConsent((await port.getConsents(signal)).consents);
  consistentProfile(profile,(await port.getProfile(signal)).profile);
  stopped(signal);
  const first=await traverse((q,s)=>port.getPortfolio(q,s),before.version,signal);
  assertCareerConsentCurrent(before,(await port.getConsents(signal)).consents,before.version);
  const second=await traverse((q,s)=>port.getPortfolio(q,s),before.version,signal);
  const finalConsent=requireCareerConsent((await port.getConsents(signal)).consents);
  assertCareerConsentCurrent(before,finalConsent,before.version);
  consistentProfile(profile,(await port.getProfile(signal)).profile);
  stopped(signal);
  if(fingerprint(first)!==fingerprint(second))
    throw new Error('Portfolio changed during double scan; refresh before using results');
  const strengths=new Map<TopicCode,Set<string>>();
  let total=0,excludedSynthetic=0,evidenceCount=0;
  for(const page of second){
    total+=page.items.length;
    for(const [index,record] of page.items.entries()){
      if(record.value.dataMode!=='OWNER_CONSENTED'){excludedSynthetic++;continue;}
      const approval=page.portfolio.evidence[index]!.approval;
      if(approval.state!=='ACTIVE')continue;
      evidenceCount++;
      for(const code of approval.topics){
        const refs=strengths.get(code)??new Set<string>();
        refs.add(record.itemId);strengths.set(code,refs);
      }
    }
  }
  const wanted=new Set([...profile.value.interestTopics,...profile.value.desiredJobTopics]);
  const last=second.at(-1)!;
  return {
    coverage:'DOUBLE_SCANNED_PAGES',asOf:last.portfolio.asOf,
    consentVersion:before.version,profileVersion:profile.version,pages:second.length,
    scannedRecords:total,excludedSynthetic,evidenceCount,
    strengths:TOPIC_CODES.filter(code=>strengths.has(code)).map(topicCode=>({
      topicCode,experienceIds:[...strengths.get(topicCode)!],
    })),
    explorationTopics:TOPIC_CODES.filter(code=>wanted.has(code)&&!strengths.has(code)),
    timeline:second.flatMap(page=>buildCareerTimeline(page)).sort((a,b)=>(
      (b.endedOn??b.startedOn??b.updatedAt).localeCompare(a.endedOn??a.startedOn??a.updatedAt)
      ||a.itemId.localeCompare(b.itemId))),
  };
}
