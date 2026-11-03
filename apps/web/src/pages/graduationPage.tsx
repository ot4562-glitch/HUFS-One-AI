import type {PageRenderer} from '../App.js';
import {NOT_OFFICIAL_GRADUATION_TEXT, buildGraduationView, buildOutlookView} from '../features/graduation/graduationView.js';
import {InAppLink} from '../shell/AppShell.js';
import {Badges, NOT_SHARED_TEXT, NoSnapshot, Section, screenViewOf} from './parts.js';

/** 졸업: graduation support + 개설 전망 (A11.1: outlook lives inside the 졸업 tab). */
export const graduationPage: PageRenderer = ({path, state, services, navigate}) => {
  if (path !== '/graduation') return null;
  const view = screenViewOf(state);
  if (!view) return {title: '졸업', body: <NoSnapshot state={state} />};
  const a = view.academics, f = view.forecast;
  return {
    title: '졸업',
    body: (
      <>
        <Badges items={view.snapshotBadges} label="이 화면의 자료" />
        <Section title="졸업 요건 현황">
          <p className="notice-box" role="note">{NOT_OFFICIAL_GRADUATION_TEXT}</p>
          {a.kind === 'HIDDEN' && <p className="muted">{NOT_SHARED_TEXT}</p>}
          {a.kind === 'PLACEHOLDER' && <p className="muted">{a.text}</p>}
          {a.kind === 'SHOW' && (() => {
            const g = buildGraduationView(a.data);
            return (
              <>
                <p><strong>{g.stateText}</strong> <span className="muted">· {g.rulePackText}</span></p>
                <dl className="credits">
                  {g.credits.map(c => <div key={c.label}><dt>{c.label}</dt><dd>{c.credits}</dd></div>)}
                </dl>
                {g.deficits.length > 0 && (
                  <>
                    <h3>확인이 필요한 요건</h3>
                    <ul>{g.deficits.map(d => <li key={d.id}>{d.text}</li>)}</ul>
                  </>
                )}
                {g.caveats.length > 0 && <ul className="muted">{g.caveats.map(c => <li key={c}>{c}</li>)}</ul>}
                {services.whatIf && <p><InAppLink to="/graduation/what-if" navigate={navigate}>전공을 바꾸면? 가정 분석해 보기</InAppLink></p>}
              </>
            );
          })()}
        </Section>
        <Section title="개설 전망">
          {f.kind === 'HIDDEN' && <p className="muted">{NOT_SHARED_TEXT}</p>}
          {f.kind === 'PLACEHOLDER' && <p className="muted">{f.text}</p>}
          {f.kind === 'SHOW' && (
            f.data.items.length
              ? <ul className="rows">{buildOutlookView(f.data).map(o => (
                <li key={o.courseId + o.targetTerm} className="row">
                  <div className="row__link">
                    <span className="row__title">{o.courseId} · {o.targetTerm}</span>
                    <span className="row__meta">{o.signalText} · {o.basisText}</span>
                    <span className="row__meta">{o.caveat}</span>
                  </div>
                </li>
              ))}</ul>
              : <p className="muted">전망을 낼 자료가 없습니다.</p>
          )}
        </Section>
      </>
    ),
  };
};
