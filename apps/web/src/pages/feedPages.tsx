import type {PageRenderer} from '../App.js';
import {opportunityArtwork} from '../features/illustrations/artwork.js';
import {SyntheticArtwork} from '../features/illustrations/SyntheticArtwork.js';
import {SyntheticExampleGallery} from '../features/illustrations/SyntheticExampleGallery.js';
import {RevisionComparison} from '../features/revisions/RevisionComparison.js';
import {buildNoticeList} from '../features/notices/noticeView.js';
import {InAppLink} from '../shell/AppShell.js';
import {MiniCalendar} from '../features/today/MiniCalendar.js';
import {TodaySummary} from '../features/today/TodaySummary.js';
import {HomeJourney} from './HomeJourney.js';
import {OpportunityExplorer} from './OpportunityExplorer.js';
import {DeadlineRow, HomeNoticeRow, HomeOppRow, Module, OppCard, upcomingDeadlines} from './homeParts.js';
import {NOT_OFFICIAL_GRADUATION_TEXT, creditsText} from '../features/graduation/graduationView.js';
import {NoticeReadToggle, OpportunityActions} from '../features/sandbox/SandboxControls.js';
import {DDayText} from '../features/demo/DDayText.js';
import {Badges, CompactRow, FeaturedCard, NOT_SHARED_TEXT, NoSnapshot, NoticeRow, Section, screenViewOf} from './parts.js';

/**
 * 오늘 (#9 redesign, UIUX master spec P001): three summary cards, then dashboard modules — schedule,
 * notices, upcoming confirmed deadlines, recommendations, study summary, shortcuts — and the full lists
 * below. Every value is the screen's own snapshot view; nothing is estimated.
 */
export const todayPage: PageRenderer = ({path, state, navigate, controller, services}) => {
  if (path !== '/') return null;
  const view = screenViewOf(state);
  if (!view) return {title: '오늘', body: <NoSnapshot state={state} />};
  const allNotices = view.notices.kind === 'SHOW' ? buildNoticeList(view.notices.data) : [];
  const notices = [...allNotices.filter(n => n.pinned), ...allNotices.filter(n => !n.pinned)].slice(0, 4);
  const feed = view.feed.kind === 'SHOW' ? view.feed.data : null;
  const deadlines = upcomingDeadlines(feed ? [...feed.featured, ...feed.compact] : [], allNotices);
  const a = view.academics;
  return {
    title: '오늘',
    body: (
      <>
        <Badges items={view.snapshotBadges} label="이 화면의 자료" />
        <TodaySummary view={view} navigate={navigate} />
        <HomeJourney key={state.selected ?? 'none'} view={view} navigate={navigate} />
        <div className="modules">
          <div className="module module--cal">
            <MiniCalendar state={state} controller={controller} loadCalendar={services.loadCalendar} navigate={navigate} />
          </div>
          <Module title="공지사항" action={<InAppLink to="/notices" navigate={navigate}>전체보기</InAppLink>}>
            {view.notices.kind === 'SHOW'
              ? notices.length ? <ul className="mlist">{notices.map(n => <HomeNoticeRow key={n.noticeId} item={n} navigate={navigate} />)}</ul>
                : <p className="muted">표시할 공지가 없어요.</p>
              : <p className="muted">{view.notices.kind === 'HIDDEN' ? NOT_SHARED_TEXT : view.notices.text}</p>}
          </Module>
          <Module title="다가오는 확정 마감">
            {deadlines.length ? <ul className="mlist">{deadlines.map(d => <DeadlineRow key={d.key} item={d} navigate={navigate} />)}</ul>
              : <p className="muted">확정된 마감이 없어요.</p>}
          </Module>
          {feed ? (
            <Module title="나에게 맞춘 공고" wide action={<InAppLink to="/opportunities" navigate={navigate}>더보기</InAppLink>}>
              {feed.featured.length ? <ul className="mlist">{feed.featured.map(c => <HomeOppRow key={c.opportunityId} card={c} navigate={navigate} />)}</ul>
                : <p className="muted">지금 관심과 맞는 공고가 없어요.</p>}
            </Module>
          ) : <Module title="공고" wide><p className="muted">{NOT_SHARED_TEXT}</p></Module>}
          <Module title="학업 요약" action={<InAppLink to="/graduation" navigate={navigate}>졸업지원</InAppLink>}>
            {a.kind === 'SHOW' ? (
              <>
                <dl className="mstats">
                  <div><dt>취득</dt><dd>{creditsText(a.data.earnedCreditUnits)}</dd></div>
                  <div><dt>수강 중</dt><dd>{creditsText(a.data.inProgressCreditUnits)}</dd></div>
                  <div><dt>계획</dt><dd>{creditsText(a.data.plannedCreditUnits)}</dd></div>
                </dl>
                <p className="muted mnote">{NOT_OFFICIAL_GRADUATION_TEXT}</p>
              </>
            ) : <p className="muted">{a.kind === 'HIDDEN' ? NOT_SHARED_TEXT : a.text}</p>}
          </Module>
          <Module title="바로가기" wide>
            <ul className="quick">
              {[['/opportunities', '맞춤 기회'], ['/graduation', '졸업지원'], ['/experience', '나의 경험'], ['/applications', '지원 현황']].map(([to, label]) => (
                <li key={to}><InAppLink to={to!} navigate={navigate}>{label}</InAppLink></li>
              ))}
            </ul>
          </Module>
        </div>
        {feed && (
          <>
            <Section
              title="다른 공고"
              action={feed.hasMore ? <InAppLink to="/opportunities" navigate={navigate}>전체 보기</InAppLink> : undefined}
            >
              {feed.compact.length
                ? <ul className="rows">{feed.compact.map(c => <CompactRow key={c.opportunityId} card={c} navigate={navigate} />)}</ul>
                : <p className="muted">다른 공고가 없어요.</p>}
            </Section>
            {(feed.ineligible??[]).length>0&&<Section title="조건 미충족">
              <p className="muted">현재 확인된 지원 조건에 맞지 않는 공고입니다. 최대 20개를 표시합니다.</p>
              <ul className="rows">{feed.ineligible!.map(c=>
                <CompactRow key={c.opportunityId} card={c} navigate={navigate}/>)}</ul>
            </Section>}
          </>
        )}
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
        <p className="notice-box" role="note">추천은 시연 대상의 전공·학년·관심 분야와 공고 원문 근거로 정리했습니다. 신청 직전에는 공식 공고에서 자격과 마감을 다시 확인해 주세요.</p>
        <dl className="ostats" aria-label="공고 요약">
          <div><dt>표시한 공고</dt><dd>{all.length}건</dd></div>
          <div><dt>나에게 맞춘 공고</dt><dd>{view.feed.data.featured.length}건</dd></div>
          <div><dt>확정 7일 내 마감</dt><dd>{all.filter(c => c.dday && c.dday.days <= 7).length}건</dd></div>
          <div><dt>지원 조건 확인 필요</dt><dd>{all.filter(c => c.eligibility === 'UNKNOWN').length}건</dd></div>
        </dl>
        <h2 className="list__title">공고 목록 <span className="muted">(총 {all.length}건)</span></h2>
        <OpportunityExplorer key={state.selected ?? 'none'} cards={all} navigate={navigate} hasMore={view.feed.data.hasMore} />
        {(view.feed.data.ineligible??[]).length>0&&<Section title="조건 미충족">
          <p className="muted">현재 확인된 지원 조건에 맞지 않는 공고입니다. 최대 20개를 표시합니다.</p>
          <ul className="opps">{view.feed.data.ineligible!.map(c=>
            <OppCard key={c.opportunityId} card={c} navigate={navigate}/>)}</ul>
        </Section>}
        {view.snapshotBadges.includes('합성 자료') && <SyntheticExampleGallery kind="opportunities" />}
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
  const art = opportunityArtwork(card);
  return {
    title: card.title,
    body: (
      <>
        <Badges items={[...view.snapshotBadges, ...card.badges]} />
        {art && <SyntheticArtwork key={art.id} art={art} className="opportunity-detail-art" />}
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
