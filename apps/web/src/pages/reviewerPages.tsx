import type {PageRenderer} from '../App.js';
import {ReviewerInvite} from '../features/reviewer/ReviewerInvite.js';

export const reviewerInvitePage: PageRenderer = ({path, services}) => {
  if (path !== '/reviewer/invite') return null;
  const invite = services.reviewerInvite;
  return {
    title: '심사 초대 등록',
    body: invite
      ? <ReviewerInvite port={invite.port} holder={invite.holder} />
      : <p className="muted">이 환경에서는 초대 등록을 사용할 수 없습니다.</p>,
  };
};
