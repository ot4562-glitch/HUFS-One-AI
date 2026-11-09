import {FeatureAdditions as V} from '@hufs-one/contracts';
import type {PageRenderer} from '../App.js';
import {OwnerInsightsPanel,OWNER_INSIGHT_TITLES} from '../features/owner-insights/OwnerInsightsPanel.js';

export const ownerInsightsPage:PageRenderer=({path,services})=>{
  if(!path.startsWith('/owner-insights/'))return null;
  const name=path.slice('/owner-insights/'.length);
  const parsed=V.OwnerInsightsKindSchema.safeParse(name);
  if(!parsed.success)return null;
  const kind=parsed.data;
  return {title:OWNER_INSIGHT_TITLES[kind],
    body:services.ownerInsights
      ?<OwnerInsightsPanel key={kind} port={services.ownerInsights} kind={kind}/>
      :<p role="alert">현재 인증된 BETA 본인/출처 공급자가 없습니다. 가상 자료를 공식 정보로 제공하지 않습니다.</p>};
};
