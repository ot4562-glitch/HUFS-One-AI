import {InAppLink} from './AppShell.js';
import {MENU_SOURCE, MENU_GROUPS, OFFICIAL_HUFSABILITY_URL, STATUS_TEXT, type MenuItem} from './menuCatalog.js';

function Item({item, path, navigate}: {item: MenuItem; path: string; navigate: (p: string) => void}) {
  if (item.status === 'DEMO_AVAILABLE' && item.route) {
    return (
      <li>
        <InAppLink to={item.route} navigate={navigate} className="menu__item" current={path === item.route}>
          <span>{item.label}</span>
        </InAppLink>
      </li>
    );
  }
  const tag = (item.disabledText ?? '🚫 미지원').replace(/^🚫\s*/, '');
  if (item.status === 'OFFICIAL_LINK_ONLY' && item.officialUrl) {
    // Leaves our service for the school's own home page; it is not a feature of this demo.
    return (
      <li>
        <a href={item.officialUrl} target="_blank" rel="noopener noreferrer" className="menu__item menu__item--external">
          <span aria-hidden="true">🚫</span>
          <span>{item.label}</span>
          <span className="menu__tag menu__tag--off">{tag}</span>
          <span aria-hidden="true">↗</span>
          <span className="visually-hidden"> — {STATUS_TEXT[item.status]} (새 창)</span>
        </a>
      </li>
    );
  }
  // No URL and not focusable: a dead link would look like a working feature (issue #124 rule 3).
  return (
    <li>
      <span className="menu__item is-off" aria-disabled="true">
        <span aria-hidden="true">🚫</span>
        <span>{item.label}</span>
        <span className="menu__tag menu__tag--off">{tag}</span>
        <span className="visually-hidden"> — {STATUS_TEXT[item.status]}</span>
      </span>
    </li>
  );
}

/**
 * The whole menu: HUFS One AI extensions, then HUFSAbility's official menus in their official order.
 * `variant` only changes styling (navy sidebar vs. page list).
 */
export function MenuTree({path, navigate, variant}: {path: string; navigate: (p: string) => void; variant: 'sidebar' | 'page'}) {
  return (
    <div className={`menu menu--${variant}`}>
      {MENU_GROUPS.map(g => (
        <section key={g.id} className="menu__group" aria-labelledby={`menu-${variant}-${g.id}`}>
          <h2 id={`menu-${variant}-${g.id}`} className="menu__group-title">
            {g.label}
            {g.origin !== 'HUFS_ONE_AI' && <span className="visually-hidden"> (HUFSAbility 메뉴)</span>}
          </h2>
          <ul className="menu__items">{g.items.map(i => <Item key={i.id} item={i} path={path} navigate={navigate} />)}</ul>
        </section>
      ))}
      <p className="menu__foot">
        <a href={OFFICIAL_HUFSABILITY_URL} target="_blank" rel="noopener noreferrer" className="menu__official">
          공식 HUFSAbility에서 열기<span className="visually-hidden"> (새 창, 학교 공식 사이트)</span> <span aria-hidden="true">↗</span>
        </a>
        <span className="menu__source">HUFSAbility 메뉴 명칭·순서: {MENU_SOURCE.title}({MENU_SOURCE.observedOn} 관찰, {MENU_SOURCE.version}) 기준. HUFS One AI는 학교 공식 시스템이 아니며, 🚫 표시 기능은 이번 시연에서 제공하지 않습니다.</span>
      </p>
    </div>
  );
}
