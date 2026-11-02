import type {PageRenderer} from '../App.js';
import {MenuTree} from '../shell/MenuTree.js';

/** #124 /menu: the full menu as a page (phones have no sidebar). */
export const menuPage: PageRenderer = ({path, navigate}) => {
  if (path !== '/menu') return null;
  return {
    title: '전체 메뉴',
    body: (
      <>
        <p className="muted">HUFSAbility의 원래 메뉴를 그대로 두고, 이번 시연에서 동작하는 기능만 열었어요. 가상 데이터로 보여 주는 데모입니다.</p>
        <MenuTree path={path} navigate={navigate} variant="page" />
      </>
    ),
  };
};
