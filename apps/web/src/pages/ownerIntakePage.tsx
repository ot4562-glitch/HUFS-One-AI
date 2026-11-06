import type {PageRenderer} from '../App.js';
import {OwnerPrivateIntakePanel} from '../features/owner-intake/OwnerPrivateIntakePanel.js';

/** Verified BETA home uses the current actor instead of S01–S05 demo choices. */
export const ownerIntakePage:PageRenderer=({path,services})=>{
  if(path!=='/'&&path!=='/owner-intake')return null;
  if(path==='/'&&!services.ownerIntake)return null;
  return {title:'내 실제 학업 자료',
    body:services.ownerIntake?<OwnerPrivateIntakePanel port={services.ownerIntake}/>
      :<p role="alert">본인 확인된 BETA 계정에서만 실제 CSV 기반 학업 자료를 확인할 수 있습니다.</p>};
};
