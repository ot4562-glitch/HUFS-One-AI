import {DEMO_AS_OF,DEMO_OPPORTUNITIES} from '../opportunities/demo-corpus.js';
import {DEMO_STUDENTS} from '../opportunities/demo-profiles.js';
import {composeFeed} from '../opportunities/feed.js';
import {RANK_CONFIG_V1} from '../opportunities/rank.js';
import {canonicalJson,hashCanonical} from './canonical.js';
import {distribution} from './recommendation-report.js';
/** In-process synthetic protocol benchmark. It never calls a provider and cannot
 * establish browser, API, NCP, production-cache or Laya-on latency. */
export function runCoreBenchmark(samples=50){
  if(!Number.isInteger(samples)||samples<50||samples>1000)throw new Error('Use 50..1000 benchmark samples');
  const options={asOf:DEMO_AS_OF,config:structuredClone(RANK_CONFIG_V1)},profile=DEMO_STUDENTS[0]!.profile;
  const cold:number[]=[],warm:number[]=[],switches:number[]=[];
  const cache=new Map<string,ReturnType<typeof composeFeed>>(),baseKey=hashCanonical({profile,options});
  for(let i=0;i<samples;i++){
    const start=performance.now();const feed=composeFeed(profile,DEMO_OPPORTUNITIES,options);cold.push(performance.now()-start);
    cache.set(baseKey,feed);
    const warmStart=performance.now();const cached=cache.get(baseKey);warm.push(performance.now()-warmStart);
    if(canonicalJson(cached)!==canonicalJson(feed))throw new Error('Cache result changed');
  }
  const topics=[...new Set(DEMO_OPPORTUNITIES.flatMap(o=>o.topicCodes))].sort();
  if(topics.length<5)throw new Error('Need canonical topics for twenty directions');
  const directions=Array.from({length:20},(_,i)=>({...structuredClone(profile),
    desiredJobTopics:[topics[i%5]!],interestTopics:[topics[5+Math.floor(i/5)]??topics[Math.floor(i/5)]!]}));
  const directionKeys=directions.map(p=>hashCanonical(p));
  if(new Set(directionKeys).size!==20)throw new Error('Directions must be distinct');
  for(let i=0;i<100;i++){
    const p=directions[i%20]!,start=performance.now();
    composeFeed(p,DEMO_OPPORTUNITIES,options);switches.push(performance.now()-start);
  }
  return {schemaVersion:'core-benchmark-v1',status:'SYNTHETIC_LOCAL_CORE_EXECUTED',demoAsOf:DEMO_AS_OF,
    opportunities:40,profiles:5,samples,rankConfigSha256:hashCanonical(RANK_CONFIG_V1),
    uncached:distribution(cold),localMapHit:distribution(warm),
    directionSwitches:{distinctDirections:20,count:100,latency:distribution(switches),externalModelCalls:0},
    modes:{layaOff:'CORE_ONLY',layaOn:'NOT_RUN'},browser:'NOT_RUN',api:'NOT_RUN',ncp:'NOT_RUN',
    localCoreP95Under50ms:distribution(cold).p95!<50,
    limitations:'Local Map hits and pure core loops do not establish application cache, browser/device or production performance.'};
}
