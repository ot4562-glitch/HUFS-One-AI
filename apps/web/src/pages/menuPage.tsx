import type {PageRenderer} from '../App.js';
import {MenuTree} from '../shell/MenuTree.js';

/** #124 /menu: the full menu as a page (phones have no sidebar). */
export const menuPage: PageRenderer = ({path, navigate}) => {
  if (path !== '/menu') return null;
  return {
    title: '전체 메뉴',
    body: (
      <>
        <p className="muted">학교 HUFSAbility 원래 메뉴는 명칭·순서만 보존하며 🚫는 미지원입니다. HUFS One AI의 자체 기능 화면은 별도로 연결되어 있습니다. ‘본인 인증·승인 자료 필요’ 항목은 메뉴에서 열 수 있어도 실제 권한·자료가 없으면 이용할 수 없고, 합성 자료를 공식 정보로 대신 표시하지 않습니다.</p>
        <MenuTree path={path} navigate={navigate} variant="page" />
      </>
    ),
  };
};
