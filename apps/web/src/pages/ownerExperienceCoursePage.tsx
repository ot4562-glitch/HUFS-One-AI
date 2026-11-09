import type {PageRenderer} from '../App.js';
import {OwnerExperienceCoursePanel} from '../features/owner-academics/OwnerExperienceCoursePanel.js';

export const ownerExperienceCoursePage:PageRenderer=({path,services})=>{
  if(path!=='/owner-academics/experience-courses')return null;
  return {title:'나의 교과·경험 연결 근거',
    body:services.ownerCourseEvidence
      ?<OwnerExperienceCoursePanel port={services.ownerCourseEvidence}/>
      :<p role="alert">인증된 본인 학업 공유 권한이 필요합니다. 가상 계정/REVIEWER에게는 제공하지 않습니다.</p>};
};
