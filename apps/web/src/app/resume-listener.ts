import type {DemoController} from './demo-controller.js';

/**
 * React UI owner calls this from useEffect while the tab is mounted:
 *
 *   return attachDemoResumeRevalidation(controller,{page:document,view:window});
 *
 * On returning to a tab, DemoController.revalidate() hides old data and checks
 * the server's current session/SharingGrant/reviewer-invite and snapshot versions.
 * No interval, background polling, cookies, storage or analytics is introduced.
 */
export interface BrowserResumePorts {
  page:Pick<Document,'visibilityState'|'addEventListener'|'removeEventListener'>;
  view:Pick<Window,'addEventListener'|'removeEventListener'>;
}
export function attachDemoResumeRevalidation(
  controller:Pick<DemoController,'revalidate'>,ports:BrowserResumePorts,
):()=>void {
  if(!controller||typeof controller.revalidate!=='function'
    ||!ports?.page||!ports.view
    ||typeof ports.page.addEventListener!=='function'
    ||typeof ports.page.removeEventListener!=='function'
    ||typeof ports.view.addEventListener!=='function'
    ||typeof ports.view.removeEventListener!=='function')
    throw new Error('Live demo visibility integration needs trusted browser events');
  const onResume=()=>{
    if(ports.page.visibilityState==='visible')void controller.revalidate();
  };
  ports.view.addEventListener('focus',onResume);
  ports.page.addEventListener('visibilitychange',onResume);
  let detached=false;
  return ()=>{
    if(detached)return;
    detached=true;
    ports.view.removeEventListener('focus',onResume);
    ports.page.removeEventListener('visibilitychange',onResume);
  };
}
