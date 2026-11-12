import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCapturedBrowserRoutes} from './approved-browser-routes.mjs';
const canonicalUrl='https://synthetic.example.edu/notice',content=Buffer.from('<main><p>SYNTHETIC</p></main>');
const frame={},bytes=Buffer.from('window.synthetic=true;');
const resource={bytes,contentType:'text/javascript; charset=utf-8',manifest:{sourceId:'SYN-SCRIPT',revisionId:'SYN-REV',
  permissionRef:'SYN-PERM',rightsReceiptId:'SYN-RIGHT',canonicalUrl:'https://synthetic.example.edu/app.js',
  kind:'SCRIPT',byteLength:bytes.length,originalSha256:createHash('sha256').update(bytes).digest('hex')}};
const make=()=>createCapturedBrowserRoutes({canonicalUrl,content,contentType:'text/html',resources:[resource],mainFrame:frame});
async function send(routes,{url=canonicalUrl,method='GET',type='document',navigation=true,currentFrame=frame,headers={}}={}){
  let fulfilled,aborted=false;
  await routes.handle({request:()=>({url:()=>url,method:()=>method,resourceType:()=>type,
    frame:()=>currentFrame,headers:()=>headers,isNavigationRequest:()=>navigation}),
    fulfill:async response=>{fulfilled=response;},abort:async()=>{aborted=true;}});
  return {fulfilled,aborted};
}
test('replays exact original and approved resource bytes with no fetch or fallback path',async()=>{
  const routes=make(),original=await send(routes);
  assert.deepEqual(original.fulfilled.body,content);assert.equal(original.aborted,false);
  const script=await send(routes,{url:resource.manifest.canonicalUrl,navigation:false,type:'script'});
  assert.deepEqual(script.fulfilled.body,bytes);assert.equal(script.fulfilled.headers['x-content-type-options'],'nosniff');
  assert.equal(script.fulfilled.headers['cache-control'],'no-store');routes.assertComplete();
  assert.deepEqual(routes.manifests(),[resource.manifest]);
});
for(const [name,request] of Object.entries({foreignURL:{url:'http://169.254.169.254/metadata'},
  unknownResource:{url:'https://synthetic.example.edu/unapproved.js',navigation:false,type:'script'},
  post:{method:'POST'},frame:{currentFrame:{}},cookie:{headers:{cookie:'SYNTHETIC'}},
  auth:{headers:{authorization:'SYNTHETIC'}},kind:{url:resource.manifest.canonicalUrl,navigation:false,type:'fetch'},
  wrongDocumentKind:{type:'script'},popup:{currentFrame:{},navigation:true}})){
  test(`aborts ${name} and invalidates the whole capture`,async()=>{
    const routes=make();assert.equal((await send(routes,request)).aborted,true);
    assert.throws(()=>routes.assertComplete());assert.equal((await send(routes)).aborted,true);
  });
}
test('refuses repeated document navigation and missing main document',async()=>{
  const routes=make();assert.throws(()=>routes.assertComplete());await send(routes);await send(routes);
  assert.throws(()=>routes.assertComplete());
});
test('bounds request count and invalidates websocket/download violations',async()=>{
  const routes=make();await send(routes);
  for(let i=0;i<64;i++)await send(routes,{url:resource.manifest.canonicalUrl,navigation:false,type:'script'});
  assert.throws(()=>routes.assertComplete());
  const blocked=make();await send(blocked);blocked.fail();assert.throws(()=>blocked.assertComplete());
});
test('snapshots replay bytes, rejects altered resource bytes and duplicate resource URLs',async()=>{
  const copied=Buffer.from(bytes),routes=createCapturedBrowserRoutes({canonicalUrl,content,contentType:'text/html',
    resources:[{...resource,bytes:copied}],mainFrame:frame});copied.fill(0);await send(routes);
  assert.deepEqual((await send(routes,{url:resource.manifest.canonicalUrl,navigation:false,type:'script'})).fulfilled.body,bytes);
  assert.throws(()=>createCapturedBrowserRoutes({canonicalUrl,content,contentType:'text/html',resources:[resource,resource],mainFrame:frame}));
  assert.throws(()=>createCapturedBrowserRoutes({canonicalUrl,content,contentType:'text/html',resources:[{...resource,bytes:copied}],mainFrame:frame}));
});
