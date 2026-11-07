import {Fragment, useState} from 'react';
import type {PageContext, PageRenderer} from '../App.js';
import {OwnerClubBoard,type OwnerClubPort} from '../features/clubs/OwnerClubBoard.js';
import {ClubModerationPanel,type ClubModerationPort} from '../features/clubs/ClubModerationPanel.js';
import {ClubPoster} from '../features/clubs/ClubPoster.js';
import {APPROVAL_TEXT, CATEGORY_TEXT, CLUB_DEMO_NOTE, filterClubs, NO_FILTER, type ClubCardView, type ClubFilter} from '../features/clubs/clubView.js';
import {useClubBoard} from '../features/clubs/useClubBoard.js';
import {DDayText} from '../features/demo/DDayText.js';
import {InAppLink} from '../shell/AppShell.js';
import {NoSnapshot} from './parts.js';
import {SyntheticExampleGallery} from '../features/illustrations/SyntheticExampleGallery.js';

const NOT_CONNECTED = '동아리 모집 데모는 합성 시연 모드에서 제공돼요. 현재 계정의 승인된 서버 연결을 확인해 주세요.';

function Note() {
  return <p className="board__note" role="note">{CLUB_DEMO_NOTE}</p>;
}

function ClubCard({club, navigate, large}: {club: ClubCardView; navigate: (p: string) => void; large?: boolean}) {
  return (
    <li className={`club${large ? ' club--large' : ''}`}>
      <ClubPoster club={club} />
      <div className="club__body">
        <h3 className="club__title"><InAppLink to={`/clubs/${encodeURIComponent(club.id)}`} navigate={navigate}>{club.name}</InAppLink></h3>
        <p className="club__summary">{club.summary}</p>
        <ul className="board__pills" aria-label="동아리 정보">
          <li className="pill">{club.categoryText}</li>
          <li className="pill">{club.campusText}</li>
          <li className="pill">{club.scopeText}</li>
          <li className="pill pill--outline">{APPROVAL_TEXT}</li>
        </ul>
        <p className="board__small">{club.lifecycleText}{club.deadlineText ? ` · ${club.deadlineText}` : ''}{club.dday && <> · <DDayText dday={club.dday} /></>}</p>
        {large && club.reasons.length > 0 && <ul className="card__reasons">{club.reasons.slice(0, 3).map(r => <li key={r}>{r}</li>)}</ul>}
      </div>
    </li>
  );
}

function Filters({filter, onChange}: {filter: ClubFilter; onChange: (f: ClubFilter) => void}) {
  return (
    <form className="club__filters" role="search" aria-label="동아리 찾기" onSubmit={e => e.preventDefault()}>
      <label htmlFor="club-q">검색</label>
      <input id="club-q" type="search" value={filter.query} placeholder="동아리 이름·소개·분야" onChange={e => onChange({...filter, query: e.target.value})} />
      <label htmlFor="club-campus">캠퍼스</label>
      <select id="club-campus" value={filter.campus} onChange={e => onChange({...filter, campus: e.target.value as ClubFilter['campus']})}>
        <option value="ALL">전체</option><option value="SEOUL">서울캠퍼스</option><option value="GLOBAL">글로벌캠퍼스</option>
      </select>
      <label htmlFor="club-category">분야</label>
      <select id="club-category" value={filter.category} onChange={e => onChange({...filter, category: e.target.value as ClubFilter['category']})}>
        <option value="ALL">전체</option>
        {(Object.keys(CATEGORY_TEXT) as (keyof typeof CATEGORY_TEXT)[]).map(c => <option key={c} value={c}>{CATEGORY_TEXT[c]}</option>)}
      </select>
      <label htmlFor="club-scope">모집 범위</label>
      <select id="club-scope" value={filter.scope??'ALL'} onChange={e=>onChange({...filter,scope:e.target.value as ClubFilter['scope']})}>
        <option value="ALL">모든 가상 동아리</option><option value="CAMPUS">교내 가상</option>
        <option value="INTERUNIVERSITY">연합 가상</option><option value="EXTERNAL">교외 소모임 가상</option>
      </select>
      <label className="club__check"><input type="checkbox" checked={filter.includeClosed} onChange={e => onChange({...filter, includeClosed: e.target.checked})} /> 마감된 모집도 보기</label>
    </form>
  );
}

function ClubBoardScreen({ctx}: {ctx: PageContext}) {
  const board = useClubBoard(ctx.controller, ctx.state, ctx.services.clubs);
  // Filters reset with the subject/context: one student's search never carries to another.
  const scope = `${ctx.state.epoch}:${ctx.state.status === 'READY' ? ctx.state.context?.contextId ?? '' : ''}`;
  return <ClubBoardBody key={scope} board={board} ctx={ctx} />;
}

function ClubBoardBody({board, ctx}: {board: ReturnType<typeof useClubBoard>; ctx: PageContext}) {
  const [filter, setFilter] = useState<ClubFilter>(NO_FILTER);
  if (board.status === 'NONE') return <NoSnapshot state={ctx.state} />;
  if (board.status === 'LOADING') return <div className="skeleton" aria-busy="true" aria-label="동아리 모집 글을 불러오는 중"><div /><div /><div /></div>;
  if (board.status === 'ERROR') return <p role="alert">동아리 모집 자료를 확인할 수 없어 표시하지 않았어요.</p>;
  const shown = filterClubs(board.view.all, filter);
  return (
    <>
      <Note />
      <section className="section" aria-labelledby="club-rec">
        <h2 id="club-rec" className="section__title">나에게 맞는 동아리</h2>
        {board.view.recommended.length
          ? <ul className="club__grid club__grid--rec">{board.view.recommended.map(c => <ClubCard key={c.id} club={c} navigate={ctx.navigate} large />)}</ul>
          : <p className="muted">관심 분야·희망 활동과 겹치는 모집 중인 동아리가 아직 없어요. 아래 전체 목록에서 찾아보세요.</p>}
      </section>
      <section className="section" aria-labelledby="club-all">
        <h2 id="club-all" className="section__title">전체 모집 글</h2>
        <Filters filter={filter} onChange={setFilter} />
        <p className="muted board__small" role="status">{board.view.all.length}개 중 {shown.length}개</p>
        {shown.length
          ? <ul className="club__grid">{shown.map(c => <ClubCard key={c.id} club={c} navigate={ctx.navigate} />)}</ul>
          : <p className="muted">조건에 맞는 모집 글이 없어요.</p>}
      </section>
      <SyntheticExampleGallery kind="clubs" />
    </>
  );
}

function ClubDetailScreen({ctx, id}: {ctx: PageContext; id: string}) {
  const board = useClubBoard(ctx.controller, ctx.state, ctx.services.clubs);
  if (board.status === 'NONE') return <NoSnapshot state={ctx.state} />;
  if (board.status === 'LOADING') return <div className="skeleton" aria-busy="true" aria-label="동아리 모집 글을 불러오는 중"><div /><div /><div /></div>;
  if (board.status === 'ERROR') return <p role="alert">동아리 모집 자료를 확인할 수 없어 표시하지 않았어요.</p>;
  // Only posts the board already let through (가상 승인·시점 확인) can open; anything else is "없음".
  const club = board.view.all.find(c => c.id === id);
  if (!club) return <p className="muted">지금 볼 수 있는 모집 글이 아니에요. 승인되지 않았거나 내려간 글일 수 있어요.</p>;
  return (
    <>
      <Note />
      <article className="club-detail">
        <ClubPoster club={club} size="detail" />
        <div>
          <h2 className="section__title">{club.name}</h2>
          <p>{club.summary}</p>
          <ul className="board__pills" aria-label="동아리 정보">
            <li className="pill">{club.categoryText}</li><li className="pill">{club.campusText}</li>
            <li className="pill pill--outline">{APPROVAL_TEXT}</li><li className="pill pill--outline">출처: 합성 데이터</li>
          </ul>
          <dl className="facts">
            <dt>모집 상태</dt><dd>{club.lifecycleText}{club.dday && <> · <DDayText dday={club.dday} /></>}</dd>
            <dt>모집 조건</dt><dd>{club.eligibilityText}</dd>
            {club.topicTexts.length > 0 && <><dt>분야</dt><dd>{club.topicTexts.join(' · ')}</dd></>}
            <dt>활동</dt><dd>{club.activityTexts.join(' · ')}</dd>
            {club.times.map(t => <Fragment key={t.label}><dt>{t.label}</dt><dd>{t.text}</dd></Fragment>)}
          </dl>
          {club.reasons.length > 0 && <section className="section" aria-labelledby="club-why"><h3 id="club-why">이 동아리를 보여 준 이유</h3><ul>{club.reasons.map(r => <li key={r}>{r}</li>)}</ul></section>}
          <p className="muted">시연 전용 화면이라 가입 신청·연락·결제는 할 수 없어요.</p>
        </div>
      </article>
      <p><InAppLink to="/clubs" navigate={ctx.navigate}>동아리 모집 목록으로</InAppLink></p>
    </>
  );
}

type ClubServices=PageContext['services']&{ownerClubs?:OwnerClubPort;clubModeration?:ClubModerationPort};
/** #123 동아리 모집 (HUFS One AI 확장, SYNTHETIC). */
export const clubsPage: PageRenderer = ctx => {
  if (ctx.path !== '/clubs') return null;
  const owner=(ctx.services as ClubServices).ownerClubs;
  if(owner)return {title:'동아리 모집',body:<OwnerClubBoard port={owner} navigate={ctx.navigate}/>};
  if (!ctx.services.clubs) return {title: '동아리 모집', body: <p className="muted">{NOT_CONNECTED}</p>};
  return {title: '동아리 모집', body: <ClubBoardScreen ctx={ctx} />};
};

export const clubDetailPage: PageRenderer = ctx => {
  if(ctx.path==='/clubs/admin'){
    const moderation=(ctx.services as ClubServices).clubModeration;
    return {title:'가상 관리자 동아리 검수',body:moderation?<ClubModerationPanel port={moderation}/>:
      <p role="alert">독립적으로 승인된 가상 관리자만 이 화면을 사용할 수 있어요.</p>};
  }
  const m = /^\/clubs\/([^/]+)$/.exec(ctx.path);
  if (!m) return null;
  const owner=(ctx.services as ClubServices).ownerClubs;
  if(owner)return {title:'동아리 모집 글',body:<OwnerClubBoard port={owner} id={decodeURIComponent(m[1]!)} navigate={ctx.navigate}/>};
  if (!ctx.services.clubs) return {title: '동아리 모집', body: <p className="muted">{NOT_CONNECTED}</p>};
  return {title: '동아리 모집 글', body: <ClubDetailScreen ctx={ctx} id={decodeURIComponent(m[1]!)} />};
};
