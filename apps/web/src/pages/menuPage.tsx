import type {PageRenderer} from '../App.js';
import {InAppLink} from '../shell/AppShell.js';
import {AREAS, areaPath} from '../shell/areas.js';
import {MenuTree} from '../shell/MenuTree.js';

/**
 * /menu (Essential mockup "전체 메뉴"): HUFS One AI's menus as cards — working screens as links, the
 * mockup's other entries as 미지원 text — then the HUFSAbility original menu list (#124 manifest).
 */
export const menuPage: PageRenderer = ({path, navigate}) => {
  if (path !== '/menu') return null;
  return {
    title: '전체 메뉴',
    body: (
      <>
        <section className="section" aria-label="HUFS One AI 메뉴">
          <div className="section__head"><h2>HUFS One AI 메뉴</h2></div>
          <ul className="mcards">
            {AREAS.map(a => (
              <li key={a.id} className="mcard">
                <h3 className="mcard__title"><InAppLink to={areaPath(a.id)} navigate={navigate}>{a.label}</InAppLink></h3>
                <p className="mcard__sum">{a.summary}</p>
                <ul className="mcard__items">
                  {a.ours.map(o => <li key={o.route}><InAppLink to={o.route} navigate={navigate}>{o.label}</InAppLink><span aria-hidden="true">›</span></li>)}
                  {a.planned.map(o => <li key={o} className="is-off"><span>{o}</span><span className="lnb__off">미지원</span></li>)}
                </ul>
              </li>
            ))}
          </ul>
        </section>
        <section className="section" aria-label="HUFSAbility 원래 메뉴">
          <div className="section__head"><h2>HUFSAbility 원래 메뉴</h2></div>
          <p className="muted">학교 HUFSAbility의 원래 메뉴는 이름과 순서만 보여 드리며 이번 시연에서 제공하지 않아요(🚫). HUFS One AI는 학교 공식 서비스가 아닙니다.</p>
          <MenuTree path={path} navigate={navigate} variant="page" />
        </section>
      </>
    ),
  };
};
