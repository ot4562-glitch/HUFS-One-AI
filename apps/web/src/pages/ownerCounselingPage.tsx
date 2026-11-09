import type {PageRenderer} from '../App.js';
import {OwnerCounselingPanel} from '../features/counseling/OwnerCounselingPanel.js';

export const ownerCounselingPage:PageRenderer=({path,services})=>{
  if(path!=='/counseling')return null;
  return {title:'공식 상담기관 길찾기',
    body:services.ownerCounseling
      ?<OwnerCounselingPanel port={services.ownerCounseling}/>
      :<p role="alert">인증된 BETA 본인 세션이 필요합니다. 가상 상담처나 예약 링크를 공식 안내로 표시하지 않습니다.</p>};
};
