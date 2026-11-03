import type {PageRenderer} from '../App.js';
import {OwnerProviderPanel} from '../features/owner-provider/OwnerProviderPanel.js';

/** Isolated BETA page; no S01–S05 / REVIEWER sandbox fallback. */
export const ownerProviderPage:PageRenderer=({path,services})=>{
  if(path!=='/owner-ai')return null;
  return {title:'승인된 AI 후보 (BETA)',body:services.ownerProvider
    ?<OwnerProviderPanel port={services.ownerProvider}/>
    :<p role="alert">승인된 BETA 소유자에게만 제공되는 화면입니다. 실행이나 후보 데이터는 표시하지 않습니다.</p>};
};
