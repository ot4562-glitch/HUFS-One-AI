/** Independent collaboration gate; only known team human APPROVED on the
 * *exact latest head* counts. No repository mutation, tokens or review bodies
 * are printed. Required-check enforcement is still a GitHub admin setting.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const HUFS_COLLABORATOR_REVIEWERS=Object.freeze([
  'taewangim-alt','uisang2004-maker','lhh42001','qamarrchae',
]);
const allow=new Set(HUFS_COLLABORATOR_REVIEWERS);
const stateOf=review=>String(review?.state??'').toUpperCase();
const loginOf=review=>String(review?.user?.login??'').toLowerCase();
export function evaluateIndependentReviewGate({author,headSha,reviews}){
  if(typeof author!=='string'||!author.trim()
    ||typeof headSha!=='string'||!/^[a-f0-9]{40}$/.test(headSha)
    ||!Array.isArray(reviews))return {approved:false,approvedBy:[],reason:'INVALID_CONTEXT'};
  const latest=new Map();
  const sorted=[...reviews].sort((a,b)=>
    Date.parse(a?.submitted_at??'')-Date.parse(b?.submitted_at??'')
      ||Number(a?.id??0)-Number(b?.id??0));
  for(const review of sorted){
    const user=loginOf(review);
    if(!allow.has(user)||user===author.toLowerCase()||review?.user?.type==='Bot')
      continue;
    if(['APPROVED','CHANGES_REQUESTED','DISMISSED'].includes(stateOf(review)))
      latest.set(user,review);
  }
  const approvedBy=[...latest].filter(([,review])=>
    stateOf(review)==='APPROVED'&&review.commit_id===headSha)
    .map(([user])=>user).sort();
  const blocking=[...latest].some(([,review])=>stateOf(review)==='CHANGES_REQUESTED');
  return {approved:approvedBy.length>0&&!blocking,approvedBy,
    reason:blocking?'OUTSTANDING_CHANGES_REQUESTED'
      :approvedBy.length===0?'LATEST_HEAD_NEEDS_INDEPENDENT_APPROVAL':'APPROVED'};
}
async function getJson(url,token){
  const response=await fetch(url,{headers:{
    Authorization:'Bearer '+token,
    Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
  },signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('REVIEW_API_UNAVAILABLE');
  return response.json();
}
export async function verifyGitHubPrReview(env=process.env){
  const repo=env.GITHUB_REPOSITORY??'',number=Number(env.PR_NUMBER);
  const token=env.GITHUB_TOKEN??'',head=env.PR_HEAD_SHA??'';
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)
    ||!Number.isSafeInteger(number)||number<1||number>1_000_000
    ||!/^[a-f0-9]{40}$/.test(head)||!token)
    throw new Error('REVIEW_CONFIGURATION_UNAVAILABLE');
  const endpoint='https://api.github.com/repos/'+repo+'/pulls/'+number;
  const pr=await getJson(endpoint,token);
  if(pr?.head?.sha!==head||pr?.base?.ref!=='main'||!pr?.user?.login
    ||pr?.state!=='open')throw new Error('STALE_OR_INVALID_PR_CONTEXT');
  const reviews=[];
  for(let page=1;page<=10;page++){
    const chunk=await getJson(endpoint+'/reviews?per_page=100&page='+page,token);
    if(!Array.isArray(chunk))throw new Error('REVIEW_API_INVALID_RESPONSE');
    reviews.push(...chunk);
    if(chunk.length<100)break;
    if(page===10)throw new Error('REVIEW_HISTORY_TOO_LARGE');
  }
  return evaluateIndependentReviewGate({
    author:pr.user.login,headSha:head,reviews,
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  verifyGitHubPrReview().then(result=>{
    // Reviewer names/status only; never include bodies or auth tokens.
    process.stdout.write(JSON.stringify(result)+'\n');
    if(!result.approved)process.exitCode=1;
  }).catch(()=>{
    process.stdout.write('INDEPENDENT_REVIEW_UNAVAILABLE\n');
    process.exitCode=1;
  });
}
