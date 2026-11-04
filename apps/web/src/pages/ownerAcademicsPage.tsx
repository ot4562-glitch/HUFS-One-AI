import type {PageRenderer} from '../App.js';
import {OwnerAcademicsPanel} from '../features/owner-academics/OwnerAcademicsPanel.js';

/** No REVIEWER or S01–S05 session can read a BETA owner academic ledger. */
export const ownerAcademicsPage:PageRenderer=({path,services})=>{
  if(path!=='/owner-academics')return null;
  return {title:'내 학업·이중전공 사전 검토',
    body:services.ownerAcademics
      ?<OwnerAcademicsPanel port={services.ownerAcademics}/>
      :<p role="alert">BETA 본인 인증·독립 승인 학업 자료가 필요합니다. 공개 시연·REVIEWER 계정에서는 사용할 수 없습니다.</p>};
};
