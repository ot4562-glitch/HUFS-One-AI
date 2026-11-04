import type {PageRenderer} from '../App.js';
import {MenuTree} from '../shell/MenuTree.js';

/** #124 /menu: the full menu as a page (phones have no sidebar). */
export const menuPage: PageRenderer = ({path, navigate}) => {
  if (path !== '/menu') return null;
  return {
    title: '전체 메뉴',
    body: (
      <>
        <p className="muted">HUFSAbility 원래 메뉴는 이름과 순서만 보존하고 모두 🚫로 표시했어요. 이번 시연에서 동작하는 화면은 ‘HUFS One AI 확장’에 있으며, 가상 데이터로 보여 주는 데모입니다.</p>
        <MenuTree path={path} navigate={navigate} variant="page" />
      </>
    ),
  };
};
