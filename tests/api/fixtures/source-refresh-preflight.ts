/** Synthetic operator-only preflight evidence. Never use in a live factory. */
export function syntheticPreflightDraft(input:{
  sourceId:string;permissionRef:string;canonicalUrl:string;now:string;
}){
  const origin=new URL(input.canonicalUrl).origin+'/';
  return {
    registration:{
      sourceId:input.sourceId,permissionRef:input.permissionRef,
      canonicalUrl:input.canonicalUrl,publisher:'Synthetic test publisher',
      sourceClass:'PUBLIC_WEB',observedAt:'2026-11-01T00:00:00Z',
      rights:{collect:true,store:true,search:false,externalTransfer:false},
    },
    scope:{
      sourceId:input.sourceId,approvedOrigin:origin,
      pathPrefixes:[new URL(input.canonicalUrl).pathname],
      robotsStatus:'REVIEWED_PERMITTED',termsStatus:'REVIEWED_PERMITTED',
      policyRef:'SYN-REVIEWED-POLICY',observedAt:'2026-11-01T00:00:00Z',
    },
    pageUrl:input.canonicalUrl,now:input.now,
    remainingRequests:2,remainingBytes:262144,
    attemptsForUrl:0,maxAttempts:1,
  };
}
