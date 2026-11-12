import {NcpIngestionDraft as D} from '@hufs-one/contracts';

/** Private operator deployment manifest. Never supplied by HTTP or source bytes. */
export interface TrustedSourceRuntimeVersion {
  expected:D.VersionHandshakeDraft;
  reader:{minSchemaVersion:number;maxSchemaVersion:number};
  loadCurrent(input:{sourceId:string;permissionRef:string;now:string}):Promise<unknown>;
}

/** Snapshot the deployment target once per executor/factory. The live loader
 * remains live; mutating its caller-owned target cannot authorize new code or
 * schema during a job. A new deployment must construct a new executor. */
export function pinSourceRuntimeVersion(port:TrustedSourceRuntimeVersion):TrustedSourceRuntimeVersion{
  try{
    const expected=D.VersionHandshakeDraftSchema.parse(port.expected);
    const reader={minSchemaVersion:port.reader.minSchemaVersion,maxSchemaVersion:port.reader.maxSchemaVersion};
    if(typeof port.loadCurrent!=='function'||!D.isReaderCompatible(expected,reader))throw new Error();
    return Object.freeze({expected:Object.freeze(expected),reader:Object.freeze(reader),loadCurrent:port.loadCurrent.bind(port)});
  }catch{throw new Error('Source runtime version blocked');}
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
    // Read and validate compatibility before awaiting an externally owned
    // loader: widening the mutable reader object during IO grants nothing.
    const reader={minSchemaVersion:port.reader.minSchemaVersion,maxSchemaVersion:port.reader.maxSchemaVersion};
    if(!D.isReaderCompatible(expected,reader))throw new Error();
    const active=D.VersionHandshakeDraftSchema.parse(await port.loadCurrent(input));
    if(!D.isReaderCompatible(active,reader)
      ||(Object.keys(expected) as (keyof typeof expected)[]).some(key=>active[key]!==expected[key]))
      throw new Error();
  }catch{throw new Error('Source runtime version blocked');}
}
