import type {Opportunity} from '@hufs-one/contracts';
export const OWNER_FEED_AT='2026-11-04T00:00:00.000Z';
export function ownerOpportunity(id:string,topics:Opportunity['topicCodes']):Opportunity{
  return {id,version:'SYN-V1',sourceSnapshotId:'SYN-REV-'+id,title:'Synthetic '+id,organization:id,
    kind:'EXTRACURRICULAR',topicCodes:topics,languageCodes:[],eventSessions:[],actualApplicationRoute:'DEMO_DISABLED',
    conditions:[],roleSteps:[],prioritySelection:[],completionRules:[],dataMode:'SYNTHETIC',dataQuality:'COMPLETE',
    applyClosesAt:'2026-12-01T00:00:00.000Z'};
}
