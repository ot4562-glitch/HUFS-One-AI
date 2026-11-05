import type {PageRenderer} from '../App.js';
import {RevisionComparison} from '../features/revisions/RevisionComparison.js';
import {buildNoticeList} from '../features/notices/noticeView.js';
import {InAppLink} from '../shell/AppShell.js';
import {MiniCalendar} from '../features/today/MiniCalendar.js';
import {NoticeReadToggle, OpportunityActions} from '../features/sandbox/SandboxControls.js';
import {DDayText} from '../features/demo/DDayText.js';
import {Badges, CompactRow, FeaturedCard, NOT_SHARED_TEXT, NoSnapshot, NoticeRow, Section, screenViewOf} from './parts.js';

/** 오늘: large matched cards (≤3), compact general list (≤6), pinned notices (A11.1). */
export const todayPage: PageRenderer = ({path, state, navigate, controller, services}) => {
  if (path !== '/') return null;
  const view = screenViewOf(state);
  if (!view) return {title: '오늘', body: <NoSnapshot state={state} />};
  const notices = view.notices.kind === 'SHOW' ? buildNoticeList(view.notices.data).filter(n => n.pinned) : [];
  return {
    title: '오늘',
    body: (
      <>
        <Badges items={view.snapshotBadges} label="이 화면의 자료" />
        {view.feed.kind === 'SHOW' ? (
          <>
            <Section title="나에게 맞춘 공고">
              {view.feed.data.featured.length
                ? <div className="cards">{view.feed.data.featured.map(c => <FeaturedCard key={c.opportunityId} card={c} navigate={navigate} />)}</div>
                : <p className="muted">지금 관심과 맞는 공고가 없어요.</p>}
            </Section>
            <Section
              title="다른 공고"
              action={view.feed.data.hasMore ? <InAppLink to="/opportunities" navigate={navigate}>전체 보기</InAppLink> : undefined}
            >
              {view.feed.data.compact.length
                ? <ul className="rows">{view.feed.data.compact.map(c => <CompactRow key={c.opportunityId} card={c} navigate={navigate} />)}</ul>
                : <p className="muted">다른 공고가 없어요.</p>}
            </Section>
            {(view.feed.data.ineligible??[]).length>0&&<Section title="조건 미충족">
              <p className="muted">현재 확인된 지원 조건에 맞지 않는 공고입니다. 최대 20개를 표시합니다.</p>
              <ul className="rows">{view.feed.data.ineligible!.map(c=>
                <CompactRow key={c.opportunityId} card={c} navigate={navigate}/>)}</ul>
            </Section>}
          </>
        ) : <Section title="공고"><p className="muted">{NOT_SHARED_TEXT}</p></Section>}
        {view.notices.kind === 'SHOW' && notices.length > 0 && (
          <Section title="고정 알림" action={<InAppLink to="/notices" navigate={navigate}>공지 전체</InAppLink>}>
            <ul className="rows">{notices.map(n => <NoticeRow key={n.noticeId} item={n} navigate={navigate} />)}</ul>
          </Section>
        )}
        <MiniCalendar state={state} controller={controller} loadCalendar={services.loadCalendar} navigate={navigate} />
      </>
    ),
  };
};

export const opportunitiesPage: PageRenderer = ({path, state, navigate}) => {
  if (path !== '/opportunities') return null;
  const view = screenViewOf(state);
  if (!view) return {title: '기회', body: <NoSnapshot state={state} />};
  if (view.feed.kind !== 'SHOW') return {title: '기회', body: <p className="muted">{NOT_SHARED_TEXT}</p>};
  const all = [...view.feed.data.featured, ...view.feed.data.compact];
  return {
    title: '기회',
    body: (
      <>
        <Badges items={view.snapshotBadges} label="이 화면의 자료" />
        {all.length ? <ul className="rows">{all.map(c => <CompactRow key={c.opportunityId} card={c} navigate={navigate} />)}</ul>
          : <p className="muted">표시할 공고가 없어요.</p>}
        {view.feed.data.hasMore && <p className="muted">더 많은 공고는 검색·필터 기능과 함께 제공될 예정입니다.</p>}
        {(view.feed.data.ineligible??[]).length>0&&<Section title="조건 미충족">
          <p className="muted">현재 확인된 지원 조건에 맞지 않는 공고입니다. 최대 20개를 표시합니다.</p>
          <ul className="rows">{view.feed.data.ineligible!.map(c=>
            <CompactRow key={c.opportunityId} card={c} navigate={navigate}/>)}</ul>
        </Section>}
      </>
    ),
  };
};

export const opportunityDetailPage: PageRenderer = ({path, state, navigate, sandbox, services, controller}) => {
  const m = /^\/opportunities\/([^/]+)$/.exec(path);
  if (!m) return null;
  const view = screenViewOf(state);
  if (!view) return {title: '공고', body: <NoSnapshot state={state} />};
  const id = decodeURIComponent(m[1]!);
  const card = view.feed.kind === 'SHOW' ? [...view.feed.data.featured, ...view.feed.data.compact, ...(view.feed.data.ineligible??[])].find(c => c.opportunityId === id) : undefined;
  // A card from a different subject/snapshot is never looked up elsewhere.
  if (!card) return {title: '공고를 찾을 수 없습니다', body: <p className="muted">지금 시연 대상의 화면에 없는 공고입니다.</p>};
  return {
    title: card.title,
    body: (
      <>
        <Badges items={[...view.snapshotBadges, ...card.badges]} />
        <dl className="facts">
          <dt>모집 상태</dt><dd>{card.lifecycleText}</dd>
          <dt>지원 조건</dt><dd>{card.eligibilityText}</dd>
          {card.deadlineText && <><dt>마감</dt><dd>{card.deadlineText}{card.dday && <> · <DDayText dday={card.dday} /></>}</dd></>}
          {card.topicTexts.length > 0 && <><dt>분야</dt><dd>{card.topicTexts.join(' · ')}</dd></>}
          <dt>근거</dt><dd>{card.evidenceRefs.length}개 확인 자료</dd>
        </dl>
        {card.relevance && <p className="card__relevance">{card.relevance.text}<span className="card__disclaimer">{card.relevance.disclaimer}</span></p>}
        {card.reasons.length > 0 && <Section title="이 공고를 보여 준 이유"><ul>{card.reasons.map(r => <li key={r}>{r}</li>)}</ul></Section>}
        {services.revisions && <RevisionComparison opportunityId={card.opportunityId} state={state} controller={controller} port={services.revisions} />}
        {sandbox && <OpportunityActions key={card.opportunityId} sandbox={sandbox} id={card.opportunityId} />}
        <p><InAppLink to="/" navigate={navigate}>오늘로 돌아가기</InAppLink></p>
      </>
    ),
  };
};

export const noticesPage: PageRenderer = ({path, state, navigate}) => {
  if (path !== '/notices') return null;
  const view = screenViewOf(state);
  if (!view) return {title: '공지', body: <NoSnapshot state={state} />};
  if (view.notices.kind !== 'SHOW') return {title: '공지', body: <p className="muted">{NOT_SHARED_TEXT}</p>};
  const items = buildNoticeList(view.notices.data);
  return {
    title: '공지',
    body: items.length ? <ul className="rows">{items.map(n => <NoticeRow key={n.noticeId} item={n} navigate={navigate} />)}</ul>
      : <p className="muted">표시할 공지가 없어요.</p>,
  };
};

export const noticeDetailPage: PageRenderer = ({path, state, navigate, sandbox}) => {
  const m = /^\/notices\/([^/]+)$/.exec(path);
  if (!m) return null;
  const view = screenViewOf(state);
  if (!view) return {title: '공지', body: <NoSnapshot state={state} />};
  const id = decodeURIComponent(m[1]!);
  const item = view.notices.kind === 'SHOW' ? buildNoticeList(view.notices.data).find(n => n.noticeId === id) : undefined;
  if (!item) return {title: '공지를 찾을 수 없습니다', body: <p className="muted">지금 시연 대상의 화면에 없는 공지입니다.</p>};
  return {
    title: item.title,
    body: (
      <>
        <Badges items={[...view.snapshotBadges, ...(item.verificationText ? [item.verificationText] : [])]} />
        <dl className="facts">
          <dt>중요도</dt><dd>{item.priorityText}</dd>
          <dt>해당 여부</dt><dd>{item.appliesText}</dd>
          {item.deadlineText && <><dt>학생 마감</dt><dd>{item.deadlineText}{item.dday && <> · <DDayText dday={item.dday} /></>}{item.overdueText ? ` (${item.overdueText})` : ''}</dd></>}
          <dt>근거</dt><dd>{item.evidenceCount}개 확인 자료</dd>
        </dl>
        {sandbox && <NoticeReadToggle sandbox={sandbox} id={item.noticeId} />}
        <p><InAppLink to="/notices" navigate={navigate}>공지 목록으로</InAppLink></p>
      </>
    ),
  };
};
