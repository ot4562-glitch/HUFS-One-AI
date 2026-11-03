import {LocalAccountSessionSchema, LocalAccountSnapshotSchema, type LocalAccountId, type LocalAccountProfile, type LocalAccountSession, type LocalAccountWorkspace} from '@hufs-one/contracts';
import type {LocalAccountPort} from './controller.js';

export class LocalAccountHttpError extends Error {
  constructor(readonly status:number) {super(`Local account HTTP ${status}`);}
}
export class LocalAccountHttpClient implements LocalAccountPort {
  constructor(private readonly fetcher:typeof fetch=fetch) {}
  private async request(path:string, signal:AbortSignal, method='GET', body?:unknown, session?:LocalAccountSession) {
    let response:Response;
    // Browser fetch is a host function. Calling it as this.fetcher changes its receiver.
    const fetcher=this.fetcher;
    try {response=await fetcher(`/api/local-accounts${path}`,{method,signal,credentials:'same-origin',cache:'no-store',
      headers:{Accept:'application/json',...(body===undefined?{}:{'content-type':'application/json'}),...(session?{'x-csrf-token':session.csrfToken}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});}
    catch(error) {if(signal.aborted) throw error;throw new LocalAccountHttpError(503);}
    if(!response.ok) throw new LocalAccountHttpError(response.status);
    return response.json() as Promise<unknown>;
  }
  async bootstrap(signal:AbortSignal) {return LocalAccountSessionSchema.parse(await this.request('/session',signal));}
  async select(accountId:LocalAccountId,session:LocalAccountSession|null,signal:AbortSignal) {
    const active=session ?? await this.bootstrap(signal);
    return LocalAccountSessionSchema.parse(await this.request('/session',signal,'POST',{accountId},active));
  }
  async read(signal:AbortSignal) {return LocalAccountSnapshotSchema.parse(await this.request('/snapshot',signal));}
  async saveProfile(profile:LocalAccountProfile,expectedRevision:number,session:LocalAccountSession,signal:AbortSignal) {
    return LocalAccountSnapshotSchema.parse(await this.request('/profile',signal,'PATCH',{expectedRevision,profile},session));
  }
  async saveWorkspace(workspace:LocalAccountWorkspace,expectedRevision:number,session:LocalAccountSession,signal:AbortSignal) {
    return LocalAccountSnapshotSchema.parse(await this.request('/workspace',signal,'PUT',{expectedRevision,workspace},session));
  }
  async reset(expectedRevision:number,session:LocalAccountSession,signal:AbortSignal) {
    return LocalAccountSnapshotSchema.parse(await this.request('/reset',signal,'POST',{expectedRevision},session));
  }
}
