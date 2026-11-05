import {OwnerReceipts} from '../../apps/api/src/modules/auth/owner-receipts.js';

export const receiptFailureCases=[
  {failure:'capacity',status:429,code:'RATE_LIMITED'},
  {failure:'provider',status:503,code:'PROVIDER_UNAVAILABLE'},
] as const;

/** Exercise real quota admission at a trusted port, without a database or raw data. */
export function receiptFailure(failure:'capacity'|'provider',actorId:string):()=>Promise<never>{
  const receipts=new OwnerReceipts<{actorId:string}>(value=>value.actorId,1,2);
  receipts.set('SYN-LIVE-RECEIPT',{actorId});
  return async()=>{
    if(failure==='capacity')receipts.set('SYN-NEW-RECEIPT',{actorId});
    // A provider may use the same error name; only the actual admission class is trusted.
    const error=new Error('SYNTHETIC-PRIVATE-PROVIDER-DETAIL');
    error.name='ReceiptAdmissionError';
    throw error;
  };
}
