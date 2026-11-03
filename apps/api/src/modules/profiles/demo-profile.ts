import {DemoProfileRecordSchema,DemoProfileSaveSchema,DemoProfileResetSchema,DemoProfileResponseSchema,
  DEMO_PROFILE_NAMESPACE,type DemoProfileRecord,type DemoProfileSave,type DemoProfileReset,
  type DemoProfileResponse} from '@hufs-one/contracts';
import {blankLocalAccountProfile,blankLocalAccountWorkspace,recomputeLocalAccount} from '../local-accounts/store.js';

export class DemoProfileConflict extends Error{constructor(){super('Demo profile version conflict');}}
/** Persistence has a single server-verified actor key. No browser subject/account identifier. */
export interface DemoProfileStore {
  read(actorId:string):Promise<DemoProfileRecord>;
  save(actorId:string,input:DemoProfileSave):Promise<DemoProfileRecord>;
  reset(actorId:string,input:DemoProfileReset):Promise<DemoProfileRecord>;
}
export interface DemoProfilePort {
  read(actorId:string):Promise<DemoProfileResponse>;
  save(actorId:string,input:DemoProfileSave):Promise<DemoProfileResponse>;
  reset(actorId:string,input:DemoProfileReset):Promise<DemoProfileResponse>;
}
/** Only the maintained invented corpus and pure recommendation/notice/club cores are used.
 * Self-reported credits/majors never create official academic records or eligibility facts. */
export function recomputeDemoProfile(raw:DemoProfileRecord):DemoProfileResponse {
  const profile=DemoProfileRecordSchema.parse(raw),p=profile.value;
  const local=recomputeLocalAccount({sessionId:'SYNTHETIC_EMPTY_PROFILE',accountId:'BLANK_DEMO',
    revision:profile.version,profile:{...blankLocalAccountProfile(),primaryMajor:p.primaryMajor,
      earnedCredits:p.earnedCreditUnits===null?null:p.earnedCreditUnits/2,interestTopics:p.interestTopics,
      doubleMajorStatus:p.doubleMajor===null?'UNSET':p.doubleMajor.kind==='NONE'?'NONE':'SELECTED',
      doubleMajor:p.doubleMajor?.kind==='DOUBLE'?p.doubleMajor.major:null},workspace:blankLocalAccountWorkspace()});
  return DemoProfileResponseSchema.parse({profile,snapshot:{namespace:DEMO_PROFILE_NAMESPACE,
    dataMode:'SYNTHETIC',verification:'UNVERIFIED_SELF_REPORT',version:profile.version,asOf:local.asOf,
    feed:local.feed,notices:local.notices,clubs:local.clubs,academics:local.academics,forecast:local.forecast}});
}
export class DemoProfileService implements DemoProfilePort {
  constructor(private readonly store:DemoProfileStore){}
  private async result(actorId:string,record:DemoProfileRecord):Promise<DemoProfileResponse>{
    const response=recomputeDemoProfile(record);
    const current=DemoProfileRecordSchema.parse(await this.store.read(actorId));
    // A slower tab may not return results derived from a superseded profile/reset.
    if(JSON.stringify(current)!==JSON.stringify(response.profile))throw new DemoProfileConflict();
    return response;
  }
  async read(actorId:string){return this.result(actorId,await this.store.read(actorId));}
  async save(actorId:string,raw:DemoProfileSave){
    const input=DemoProfileSaveSchema.parse(raw);
    return this.result(actorId,await this.store.save(actorId,input));
  }
  async reset(actorId:string,raw:DemoProfileReset){
    const input=DemoProfileResetSchema.parse(raw);
    return this.result(actorId,await this.store.reset(actorId,input));
  }
}
