import type {PageRenderer} from '../App.js';
import {OwnerCareerPanel} from '../features/career/OwnerCareerPanel.js';
import {OwnerOpportunityPanel} from '../features/career/OwnerOpportunityPanel.js';
import {InAppLink} from '../shell/AppShell.js';

/** Never render another student's demo subject as an authenticated owner. */
export const careerPage:PageRenderer=({path,services,navigate})=>{
  const m=/^\/owner-opportunities\/([A-Za-z0-9_-]{1,90})$/.exec(path);
  if(m)return {title:'본인용 기회 원문·기관 정보',body:services.ownerCareer
    ? <OwnerOpportunityPanel key={m[1]} port={services.ownerCareer} id={m[1]!} navigate={navigate}/>
    : <p role="alert">현재 본인 BETA 계정의 출처 확인 기능을 사용할 수 없습니다.</p>};
  if(path!=='/career')return null;
  if(!services.ownerCareer)return {title:'커리어 포트폴리오',body:<section>
    <p role="note">이 기능은 본인 BETA 세션의 비공개 경험·관심·승인 주제로만 작동합니다.
      현재 가상 학생 S01~S05와 별개이며 실제 학생·학교 공식 인증 기능이 아닙니다.</p>
    <p><InAppLink to="/experience" navigate={navigate}>현재 이용 가능한 합성 경험 시연 확인</InAppLink></p>
  </section>};
  return {title:'비공개 포트폴리오 · 진로 로드맵',body:<OwnerCareerPanel port={services.ownerCareer}
    navigate={navigate} {...(services.ownerExperience?{experienceReview:services.ownerExperience}:{})}/>};
};
