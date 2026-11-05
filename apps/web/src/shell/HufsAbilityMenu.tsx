import {useEffect, useId, useRef, useState} from 'react';
import {InAppLink} from './AppShell.js';
import {MENU_GROUPS, OFFICIAL_HUFSABILITY_URL} from './menuCatalog.js';

/**
 * #9 v5: the one place where HUFSAbility's original menus appear in the top bar. A disclosure button
 * (not hover-only) opens a panel whose first line always says why the items are listed but not offered;
 * the 24 originals are plain text, the 4 public areas only link to the official home in a new tab.
 * Escape and a click outside close it; focus returns to the button.
 */
export function HufsAbilityMenu({navigate}: {navigate: (path: string) => void}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const originals = MENU_GROUPS.filter(g => g.origin === 'HUFSABILITY');
  const publicAreas = MENU_GROUPS.find(g => g.origin === 'HUFSABILITY_PUBLIC')?.items ?? [];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  return (
    <div className="hm" ref={root}>
      <button ref={button} type="button" className="hm__button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(o => !o)}>
        HUFSAbility 메뉴 <span aria-hidden="true">ⓘ {open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div id={panelId} className="hm__panel" role="region" aria-label="HUFSAbility 원래 메뉴">
          <p className="hm__note"><strong>HUFSAbility 원래 메뉴 목록</strong>
            HUFS One AI는 학교 공식 서비스가 아니어서, 원래 메뉴는 이름과 순서만 보여 드려요. 아래 기능은 이번 시연에서 제공하지 않습니다.</p>
          <div className="hm__cols">
            {originals.map(g => (
              <div key={g.id}>
                <h3 className="hm__group">{g.label}</h3>
                <ul className="hm__items">
                  {g.items.map(i => <li key={i.id}><span>{i.label}</span><span className="hm__off">미지원</span></li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="hm__public">
            <p><strong>공개 안내</strong> · 학교 공식 첫 화면으로 이동 (새 창)</p>
            <ul>
              {publicAreas.map(i => (
                <li key={i.id}>
                  <a href={i.officialUrl ?? OFFICIAL_HUFSABILITY_URL} target="_blank" rel="noopener noreferrer">
                    {i.label} <span aria-hidden="true">↗</span><span className="visually-hidden"> (새 창, 학교 공식 사이트)</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <p className="hm__all"><InAppLink to="/menu" navigate={p => { setOpen(false); navigate(p); }}>전체 메뉴 페이지에서 모두 보기</InAppLink></p>
        </div>
      )}
    </div>
  );
}
