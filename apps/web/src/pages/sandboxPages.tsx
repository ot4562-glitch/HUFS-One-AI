import type {PageRenderer} from '../App.js';
import {ExperienceEditor, NOT_REVIEWER_TEXT, SandboxNote, SandboxSettings} from '../features/sandbox/SandboxControls.js';
import {InAppLink} from '../shell/AppShell.js';
import {OverlaySettings} from '../features/settings/OverlaySettings.js';
import {NoSnapshot, Section, screenViewOf} from './parts.js';

/** 보관함: bookmarked cards, practice applications and drafts for the current subject. */
export const savedPage: PageRenderer = ({path, state, sandbox, navigate, services}) => {
  if (path !== '/saved') return null;
  if (!sandbox) return {title: '보관함', body: (
    <>
      <div className="saved__empty">
        <p>{NOT_REVIEWER_TEXT}</p>
        <InAppLink to="/opportunities" navigate={navigate}>맞춤 기회 살펴보기</InAppLink>
        {services.applications && <InAppLink to="/applications" navigate={navigate}>내 지원 현황 확인하기</InAppLink>}
      </div>
    </>
  )};
  const view = screenViewOf(state);
  if (!view) return {title: '보관함', body: <NoSnapshot state={state} />};
  if (!sandbox.ready) return {title: '보관함', body: <p className="muted" aria-busy="true">시연 기록을 불러오는 중</p>};
  const cards = view.feed.kind === 'SHOW' ? [...view.feed.data.featured, ...view.feed.data.compact] : [];
  // Titles only from the current subject's snapshot; an id outside it is listed without guessing a title.
  const title = (id: string) => cards.find(c => c.opportunityId === id)?.title ?? '공고 정보가 현재 목록에 없습니다';
  const list = (ids: readonly string[]) => (
    <ul className="rows">{ids.map(id => (
      <li key={id} className="row">
        <InAppLink to={`/opportunities/${encodeURIComponent(id)}`} navigate={navigate} className="row__link">
          <span className="row__title">{title(id)}</span>
        </InAppLink>
      </li>
    ))}</ul>
  );
  const saved = [...sandbox.state.bookmarks], applied = [...sandbox.state.simulated], drafts = [...sandbox.state.drafts.keys()];
  return {
    title: '보관함',
    body: (
      <>
        <SandboxNote />
        <div className="saved__grid">
          <Section title="저장한 공고">{saved.length ? list(saved) : <div className="saved__empty"><p>아직 저장한 공고가 없어요.</p><InAppLink to="/opportunities" navigate={navigate}>맞춤 기회 둘러보기</InAppLink></div>}</Section>
          <Section title="모의 지원">{applied.length ? list(applied) : <div className="saved__empty"><p>모의 지원한 공고가 없어요.</p><InAppLink to="/opportunities" navigate={navigate}>참여할 공고 찾기</InAppLink></div>}</Section>
          <Section title="지원서 초안">{drafts.length ? list(drafts) : <div className="saved__empty"><p>작성한 초안이 없어요.</p><InAppLink to="/opportunities" navigate={navigate}>공고에서 초안 작성하기</InAppLink></div>}</Section>
        </div>
      </>
    ),
  };
};

export const experiencePage: PageRenderer = ({path, state, sandbox}) => {
  if (path !== '/experience') return null;
  if (!sandbox) return {title: '경험', body: <p className="muted">{NOT_REVIEWER_TEXT}</p>};
  if (state.status !== 'READY') return {title: '경험', body: <NoSnapshot state={state} />};
  return {title: '경험', body: <ExperienceEditor sandbox={sandbox} />};
};

export const settingsPage: PageRenderer = ({path, state, sandbox, services, controller, navigate}) => {
  if (path !== '/settings') return null;
  const providerLink = services.ownerProvider && <p>
    <InAppLink to="/owner-ai" navigate={navigate} className="button button--quiet">
      승인된 AI 후보 실행·재조회 (BETA)
    </InAppLink>
  </p>;
  const ownerDemoLink = services.ownerDemoProfile && <p>
    <InAppLink to="/demo-profile" navigate={navigate} className="button button--quiet">
      독립 빈 시연 계정 설정 (BETA)
    </InAppLink>
  </p>;
  const ownerAcademicsLink = services.ownerAcademics && <p>
    <InAppLink to="/owner-academics" navigate={navigate} className="button button--quiet">
      내 이중전공·수강계획·가정 분석 (BETA)
    </InAppLink>
  </p>;
  if (!sandbox && !services.overlay && !ownerDemoLink && !ownerAcademicsLink && !providerLink)
    return {title: '설정', body: <p className="muted">{NOT_REVIEWER_TEXT}</p>};
  // The independent BETA account must be reachable WITHOUT selecting S01–S05.
  if (state.status !== 'READY') return {title: '설정', body:
    <>{ownerDemoLink}{ownerAcademicsLink}{providerLink}{!ownerDemoLink&&!ownerAcademicsLink&&!providerLink&&<NoSnapshot state={state} />}</>};
  // Keyed by subject/context so unsaved topic picks never carry to another student.
  const scope = `${state.epoch}:${state.context?.contextId ?? ''}`;
  return {title: '설정', body: (
    <>
      {ownerDemoLink}
      {ownerAcademicsLink}
      {providerLink}
      {services.overlay && <OverlaySettings key={scope} controller={controller} state={state} port={services.overlay} />}
      {sandbox && <SandboxSettings sandbox={sandbox} />}
    </>
  )};
};
