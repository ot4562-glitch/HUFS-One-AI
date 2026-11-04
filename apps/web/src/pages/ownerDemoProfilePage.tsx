import type {PageRenderer} from '../App.js';
import {OwnerDemoProfile} from '../features/owner-demo/OwnerDemoProfile.js';

/** Separate BETA owner account; no public demo subject or local-only account alias. */
export const ownerDemoProfilePage: PageRenderer = ({path, services}) => {
  if (path !== '/demo-profile') return null;
  return {
    title: '독립 빈 시연 계정',
    body: services.ownerDemoProfile
      ? <OwnerDemoProfile port={services.ownerDemoProfile} />
      : <p role="alert">이 화면은 권한이 확인된 BETA 계정에서만 열 수 있어요. 공개 시연 대상 또는 REVIEWER로는 접근할 수 없습니다.</p>,
  };
};
