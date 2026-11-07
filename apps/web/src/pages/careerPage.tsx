import type {PageRenderer} from '../App.js';
import {OwnerCareerPanel} from '../features/career/OwnerCareerPanel.js';

/** #317: no S01–S05 synthetic preview of an owner-private career history. */
export const careerPage:PageRenderer=({path,services,navigate})=>{
  if(path!=='/career')return null;
  return {title:'나의 커리어 · 비공개',body:services.ownerCareer
    ?<OwnerCareerPanel port={services.ownerCareer} navigate={navigate}/>
    :<p role="alert">이 페이지는 로그인·동의가 확인된 BETA 본인 계정 전용입니다.
      공개 시연·REVIEWER·미인증 계정에는 프로필, 경험, AI 이력을 표시하지 않습니다.</p>};
};
