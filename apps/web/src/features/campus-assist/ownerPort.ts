import type {HufsOwnerApiClient} from '../../integrations/owner-api-client.js';
export interface CampusAssistPort {
  capabilities:HufsOwnerApiClient['getCampusAssistCapabilities'];
  activities:HufsOwnerApiClient['listCampusActivities'];
  forecast:HufsOwnerApiClient['getCampusActivityForecast'];
  partners:HufsOwnerApiClient['listExchangePartners'];
  evaluate:HufsOwnerApiClient['checkExchangeEligibility'];
  ask:HufsOwnerApiClient['askCampusFaq'];
}
/** Install only after the server verified BETA owner identity. */
export function ownerCampusAssistPort(owner:HufsOwnerApiClient):CampusAssistPort{
  return {
    capabilities:s=>owner.getCampusAssistCapabilities(s),
    activities:(q,s)=>owner.listCampusActivities(q,s),
    forecast:(q,s)=>owner.getCampusActivityForecast(q,s),
    partners:(q,s)=>owner.listExchangePartners(q,s),
    evaluate:(q,s)=>owner.checkExchangeEligibility(q,s),
    ask:(q,s)=>owner.askCampusFaq(q,s),
  };
}
