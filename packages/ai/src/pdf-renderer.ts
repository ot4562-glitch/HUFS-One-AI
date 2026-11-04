/** Private, default-OFF PDF raster boundary. No provider call or approval is created here. */
export type PdfBox=readonly [number,number,number,number];
export interface PdfRendererIdentity {
  id:'poppler-pdf-v1';
  version:string;
  artifactSha256:string;
  policyVersion:string;
}
export interface PdfRenderedPage {
  pageIndex:number;
  bytes:Uint8Array;
  format:'png';
  rasterSha256:string;
  mediaBox:PdfBox;
  cropBox:PdfBox;
  rotation:0;
  userUnit:1;
}
export interface PdfRenderedDocument {
  originalSha256:string;
  renderer:PdfRendererIdentity;
  pageCount:number;
  pages:PdfRenderedPage[];
}
export interface PdfRenderer {
  /** Caller supplies only bounded bytes and current authority; file paths/commands are private configuration. */
  render(input:{
    bytes:Uint8Array;
    originalSha256:string;
    signal:AbortSignal;
    revalidate:()=>Promise<void>;
  }):Promise<PdfRenderedDocument>;
}
export const PDF_RENDER_LIMITS=Object.freeze({
  originalBytes:256*1024,
  pages:4,
  pageBytes:256*1024,
  totalBytes:1024*1024,
  timeoutMs:10_000,
});
