import type {PageRenderer} from '../App.js';
import {ApplicationBoard} from '../features/applications/ApplicationBoard.js';
import type {BoardPort} from '../features/applications/boardPort.js';
import {useApplicationBoard} from '../features/applications/useApplicationBoard.js';

function BoardScreen({port}: {port: BoardPort}) {
  return <ApplicationBoard board={useApplicationBoard(port)} />;
}

/** #80 /applications: the signed-in BETA owner's own records; independent of the demo subject selector. */
export const applicationsPage: PageRenderer = ({path, services}) => {
  if (path !== '/applications') return null;
  if (!services.applications) return {title: '지원 현황', body: <p className="muted">지원 현황 연결을 준비하고 있습니다.</p>};
  return {title: '지원 현황', body: <BoardScreen port={services.applications} />};
};
