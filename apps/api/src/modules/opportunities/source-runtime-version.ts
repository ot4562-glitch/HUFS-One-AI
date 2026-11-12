import {NcpIngestionDraft as D} from '@hufs-one/contracts';

/** Private operator deployment manifest. Never supplied by HTTP or source bytes. */
export interface TrustedSourceRuntimeVersion {
  expected:D.VersionHandshakeDraft;
  reader:{minSchemaVersion:number;maxSchemaVersion:number};
  loadCurrent(input:{sourceId:string;permissionRef:string;now:string}):Promise<unknown>;
}

/** Conservative initial compatibility: exact pinned versions, not a guessed skew.
 * Re-run immediately before egress and persistence. This only checks deployment
 * compatibility; rights, budgets, independent review and RLS remain separate. */
export async function requireSourceRuntimeVersion(
  port:TrustedSourceRuntimeVersion,
  input:{sourceId:string;permissionRef:string;now:string},
):Promise<void>{
  try{
    const expected=D.VersionHandshakeDraftSchema.parse(port.expected);
    const active=D.VersionHandshakeDraftSchema.parse(await port.loadCurrent(input));
    if(!D.isReaderCompatible(active,port.reader)
      ||(Object.keys(expected) as (keyof typeof expected)[]).some(key=>active[key]!==expected[key]))
      throw new Error();
  }catch{throw new Error('Source runtime version blocked');}
}
