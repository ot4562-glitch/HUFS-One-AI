import type {RevisionParagraph} from './revision-ledger.js';
import type {SourceBrowserEvidence,SourceBrowserRenderer} from './source-browser-evidence.js';

/** Explicit private rendering port. SourceContentExtractor remains non-executing.
 * Implementations must run the verified isolated runtime, use only captured
 * approved resource bytes, and recheck their current immutable dependencies.
 * Returned DOM is retained independently from the fetched original. */
export interface SourceBrowserExtractor {
  readonly renderer:SourceBrowserRenderer;
  extract(input:{content:Uint8Array;contentType:string;canonicalUrl:string;
    sourceId:string;sourceRevisionId:string;permissionRef:string;actorRef:string;
    originalSha256:string;assertSourceRights:()=>Promise<void>;
  }):Promise<{evidence:SourceBrowserEvidence;domBytes:Uint8Array;
    paragraphs:RevisionParagraph[];revalidate:()=>Promise<void>}>;
}
