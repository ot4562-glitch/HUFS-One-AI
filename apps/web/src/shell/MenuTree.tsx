import {useState} from 'react';
import {InAppLink} from './AppShell.js';
import {MENU_SOURCE, MENU_GROUPS, OFFICIAL_HUFSABILITY_URL, STATUS_TEXT, type MenuItem} from './menuCatalog.js';

function Item({item, path, navigate}: {item: MenuItem; path: string; navigate: (p: string) => void}) {
  if (item.status === 'DEMO_AVAILABLE' && item.route) {
    return (
      <li>
        <InAppLink to={item.route} navigate={navigate} className="menu__item" current={path === item.route}>
          <span>{item.label}</span>
          {item.requiresApprovedSource&&<span className="menu__tag">
            본인 인증·승인 자료 필요
          </span>}
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
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'ours' | 'school'>('all');
  const needle = variant === 'page' ? search.trim().toLocaleLowerCase('ko-KR') : '';
  const groups = MENU_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(item =>
      (variant !== 'page' || filter === 'all' || (filter === 'ours' ? g.origin === 'HUFS_ONE_AI' : g.origin !== 'HUFS_ONE_AI'))
      && (!needle || (item.label + ' ' + g.label).toLocaleLowerCase('ko-KR').includes(needle))),
  })).filter(g => g.items.length > 0);
  const reset = () => { setSearch(''); setFilter('all'); };
  return (
    <div className={'menu menu--' + variant}>
      {variant === 'page' && <div className="menu__tools" role="search" aria-label="전체 메뉴 탐색">
        <label><span>메뉴 검색</span>
          <input type="search" value={search} placeholder="찾고 싶은 기능을 입력하세요" onChange={event => setSearch(event.currentTarget.value)} />
        </label>
        <div className="menu__tabs" role="group" aria-label="메뉴 유형 필터">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>전체</button>
          <button type="button" aria-pressed={filter === 'ours'} onClick={() => setFilter('ours')}>HUFS One AI</button>
          <button type="button" aria-pressed={filter === 'school'} onClick={() => setFilter('school')}>학교 참고 메뉴</button>
        </div>
        <p role="status" aria-live="polite">{groups.reduce((count, group) => count + group.items.length, 0)}개 메뉴 · {groups.length}개 분류</p>
        {(search || filter !== 'all') && <button type="button" className="menu__reset" onClick={reset}>전체 다시 보기</button>}
      </div>}
      {groups.map(g => (
        <section key={g.id} className="menu__group" aria-labelledby={'menu-' + variant + '-' + g.id}>
          <h2 id={'menu-' + variant + '-' + g.id} className="menu__group-title">
            {g.label}
            {g.origin !== 'HUFS_ONE_AI' && <span className="visually-hidden"> (HUFSAbility 메뉴)</span>}
          </h2>
          <ul className="menu__items">{g.items.map(i => <Item key={i.id} item={i} path={path} navigate={navigate} />)}</ul>
        </section>
      ))}
      {groups.length === 0 && <div className="menu__empty">
        <p>일치하는 메뉴가 없습니다.</p>
        <button type="button" onClick={reset}>전체 다시 보기</button>
      </div>}
      <p className="menu__foot">
        <a href={OFFICIAL_HUFSABILITY_URL} target="_blank" rel="noopener noreferrer" className="menu__official">
          공식 HUFSAbility에서 열기<span className="visually-hidden"> (새 창, 학교 공식 사이트)</span> <span aria-hidden="true">↗</span>
        </a>
        <span className="menu__source">HUFSAbility 메뉴 명칭·순서: {MENU_SOURCE.title}({MENU_SOURCE.observedOn} 관찰, {MENU_SOURCE.version}) 기준. HUFS One AI는 학교 공식 시스템이 아니며, 🚫 표시 기능은 이번 시연에서 제공하지 않습니다.</span>
      </p>
    </div>
  );
}
