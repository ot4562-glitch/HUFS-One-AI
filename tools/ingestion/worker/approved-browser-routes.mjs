/** Memory-only response replay. No continue/fetch/fallback capability exists.
 * Namespace isolation remains mandatory independently of Playwright routing. */
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
function refused(){throw new Error('Approved browser rendering unavailable');}
const types={SCRIPT:['script'],STYLE:['stylesheet'],JSON:['fetch','xhr'],IMAGE:['image']};
export function createCapturedBrowserRoutes({canonicalUrl,content,contentType,resources,mainFrame}){
  if(!(content instanceof Uint8Array)||!content.length||content.length>262144||resources.length>16)refused();
  const document=Buffer.from(content),byUrl=new Map();let size=0,calls=0,served=0,navigations=0,failed=false;
  for(const r of resources){
    const bytes=Buffer.from(r.bytes),m={...r.manifest};size+=bytes.length;
    if(!types[m.kind]||!bytes.length||bytes.length>262144||sha(bytes)!==m.originalSha256
      ||bytes.length!==m.byteLength||byUrl.has(m.canonicalUrl)||m.canonicalUrl===canonicalUrl||size>1048576)refused();
    byUrl.set(m.canonicalUrl,{bytes,manifest:m,contentType:r.contentType});
  }
  return {
    fail(){failed=true;},
    assertComplete(){if(failed||navigations!==1)refused();},
    manifests:()=>[...byUrl.values()].map(r=>({...r.manifest})),
    async handle(route){
      try{
        const request=route.request(),headers=request.headers();
        if(failed||++calls>64||request.method()!=='GET'||request.frame()!==mainFrame
          ||['authorization','cookie','proxy-authorization'].some(key=>headers[key]))refused();
        const url=request.url();let body,type;
        if(request.isNavigationRequest()){
          if(++navigations!==1||url!==canonicalUrl||request.resourceType()!=='document')refused();
          body=document;type=contentType;
        }else{
          const r=byUrl.get(url);if(!r||!types[r.manifest.kind].includes(request.resourceType()))refused();
          body=r.bytes;type=r.contentType;
        }
        served+=body.length;if(served>2*1048576)refused();
        await route.fulfill({status:200,body,headers:{'content-type':type,'cache-control':'no-store',
          'x-content-type-options':'nosniff',
          // Inline/data content is already bound to the original. Frame,
          // worker, form and base navigation have no approved capability.
          'content-security-policy':"default-src 'none'; script-src https: 'unsafe-inline'; style-src https: 'unsafe-inline'; connect-src https:; img-src https: data:; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"}});
      }catch{
        failed=true;try{await route.abort('blockedbyclient');}catch{}
      }
    },
  };
}
