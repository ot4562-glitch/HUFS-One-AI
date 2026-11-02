/** Visible tabs recover changes even when a writing tab closes before its final broadcast. */
export function observePeerFreshness(check:()=>void, windowTarget:Window, documentTarget:Document):()=>void {
  const visibleCheck=()=>{if(documentTarget.visibilityState==='visible')check();};
  windowTarget.addEventListener('focus',visibleCheck);
  documentTarget.addEventListener('visibilitychange',visibleCheck);
  const interval=setInterval(visibleCheck,15_000);
  return ()=>{clearInterval(interval);windowTarget.removeEventListener('focus',visibleCheck);documentTarget.removeEventListener('visibilitychange',visibleCheck);};
}
