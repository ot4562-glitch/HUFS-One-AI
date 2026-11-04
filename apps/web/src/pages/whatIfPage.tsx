import type {PageRenderer} from '../App.js';
import {InAppLink} from '../shell/AppShell.js';
import {WhatIfPanel} from '../features/what-if/WhatIfPanel.js';
import {NOT_SHARED_TEXT, NoSnapshot, screenViewOf} from './parts.js';

/** #82 /graduation/what-if: a hypothetical major change, apart from the 졸업 screen's current figures. */
export const whatIfPage: PageRenderer = ({path, state, services, controller, navigate}) => {
  if (path !== '/graduation/what-if') return null;
  const view = screenViewOf(state);
  if (!view) return {title: '전공 가정 분석', body: <NoSnapshot state={state} />};
  const a = view.academics;
  return {
    title: '전공 가정 분석',
    body: (
      <>
        <p><InAppLink to="/graduation" navigate={navigate}>← 졸업 요건 현황으로</InAppLink></p>
        {/* Only once the academics section itself is shared, so consent never leaks through a hypothesis. */}
        {a.kind === 'HIDDEN' && <p className="muted">{NOT_SHARED_TEXT}</p>}
        {a.kind === 'PLACEHOLDER' && <p className="muted">{a.text}</p>}
        {a.kind === 'SHOW' && (services.whatIf
          ? <WhatIfPanel state={state} controller={controller} port={services.whatIf} />
          : <p className="muted">가정 분석은 아직 연결되지 않았습니다.</p>)}
      </>
    ),
  };
};
