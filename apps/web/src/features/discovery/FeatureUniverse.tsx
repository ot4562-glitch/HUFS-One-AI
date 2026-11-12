import {useMemo, useState} from 'react';
import {InAppLink} from '../../shell/AppShell.js';
import {AREAS} from '../../shell/areas.js';
import {MENU_GROUPS, type MenuItem} from '../../shell/menuCatalog.js';

/**
 * A complete, UI-only feature index assembled from the actual application menu and
 * all eleven area definitions. Unsupported HUFSAbility entries are never made into
 * working links; role-gated pages only expose their existing route, not their data.
 */
export type FeatureAccess = 'app' | 'owner' | 'official' | 'unavailable' | 'restricted' | 'local';
export interface FeatureEntry {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly access: FeatureAccess;
  readonly route?: string;
  readonly officialUrl?: string;
  readonly description?: string;
}

const ACCESS_LABEL: Readonly<Record<FeatureAccess, string>> = {
  app: '화면 제공 · 자료 상태 확인',
  owner: '본인 인증·승인 자료 필요',
  official: '학교 공식 사이트로 이동',
  unavailable: '시연 미지원·검증 전',
  restricted: '별도 초대·운영 권한 필요',
  local: '로컬 합성 개발 모드 전용',
};

function classify(item: MenuItem): FeatureAccess {
  if (item.kind === 'EXTENSION') return item.requiresApprovedSource ? 'owner' : 'app';
  if (item.status === 'DEMO_AVAILABLE' && item.route) return 'app';
  return item.status === 'OFFICIAL_LINK_ONLY' && item.officialUrl ? 'official' : 'unavailable';
}

const SUPPLEMENTAL: readonly FeatureEntry[] = [
  {id: 'extra-what-if', label: '전공 변경·복수전공 가정 분석', group: '학업 도구', access: 'app', route: '/graduation/what-if'},
  {id: 'extra-career', label: '진로 로드맵·포트폴리오', group: '진로·취업 도구', access: 'owner', route: '/career'},
  {id: 'extra-settings', label: '관심 분야·시연 설정', group: '계정·운영 도구', access: 'app', route: '/settings'},
  {id: 'extra-profile', label: '본인 데이터 프로필', group: '계정·운영 도구', access: 'owner', route: '/demo-profile'},
  {id: 'extra-intake', label: '수강 CSV·본인 자료 검토', group: '계정·운영 도구', access: 'owner', route: '/owner-intake'},
  {id: 'extra-ai', label: 'AI 공급자·OCR 상태 확인', group: '계정·운영 도구', access: 'owner', route: '/owner-ai'},
  {id: 'extra-moderation', label: '동아리 공고 검수·관리', group: '계정·운영 도구', access: 'restricted', route: '/clubs/admin'},
  {id: 'extra-reviewer', label: '독립 검증자 초대 등록', group: '계정·운영 도구', access: 'restricted', route: '/reviewer/invite'},
  {id: 'extra-local', label: '로컬 합성 계정 실험실', group: '계정·운영 도구', access: 'local'},
];

/** Deterministic and testable; changes in either canonical catalog appear automatically. */
export function buildFeatureInventory(): readonly FeatureEntry[] {
  const all: FeatureEntry[] = [];
  const routeSet = new Set<string>();
  const schoolNames = new Set<string>();
  for (const group of MENU_GROUPS) {
    for (const item of group.items) {
      const access = classify(item);
      all.push({
        id: 'catalog-' + group.id + '-' + item.id,
        label: item.label,
        group: group.label,
        access,
        ...(item.route ? {route: item.route} : {}),
        ...(access === 'official' && item.officialUrl ? {officialUrl: item.officialUrl} : {}),
        ...(item.disabledText ? {description: item.disabledText.replace(/^🚫\s*/, '')} : {}),
      });
      if (item.route) routeSet.add(item.route);
      if (item.kind === 'ORIGINAL') schoolNames.add(item.label.trim());
    }
  }
  // Area-only real screens are also first-class; do not lose them when new pages ship.
  for (const area of AREAS) {
    for (const screen of area.ours) {
      if (routeSet.has(screen.route)) continue;
      all.push({
        id: 'area-route-' + area.id + '-' + screen.route,
        label: screen.label,
        group: area.label,
        access: screen.route.startsWith('/owner-') || screen.route === '/career' ? 'owner' : 'app',
        route: screen.route,
      });
      routeSet.add(screen.route);
    }
  }
  for (const extra of SUPPLEMENTAL) {
    if (extra.route && routeSet.has(extra.route)) continue;
    all.push(extra);
    if (extra.route) routeSet.add(extra.route);
  }
  // Preserve the complete observed HUFSAbility menu names even when the public
  // manifest uses a different category/wording. Names are information, not links.
  for (const area of AREAS) {
    for (const label of area.observed) {
      if (schoolNames.has(label.trim())) continue;
      all.push({
        id: 'legacy-' + area.id + '-' + label,
        label,
        group: 'HUFSAbility 참고 · ' + area.label,
        access: 'unavailable',
      });
      schoolNames.add(label.trim());
    }
  }
  return all;
}

export const FEATURE_INVENTORY = buildFeatureInventory();

const SPOTLIGHTS = [
  {route: '/opportunities', eyebrow: '기회', title: '맞춤 기회', detail: '자격·마감·근거를 함께 살펴보기', tone: 'navy'},
  {route: '/graduation', eyebrow: '학업', title: '졸업지원', detail: '이수 현황과 계획 검사', tone: 'blue'},
  {route: '/faq', eyebrow: '질문', title: 'FAQ·학사 안내', detail: '연결된 공식 근거가 있는지 확인', tone: 'pearl'},
  {route: '/experience', eyebrow: '활동', title: '나의 경험', detail: '경험과 진로 자료 확인', tone: 'mint'},
] as const;

/** Apple's deliberate product-grid rhythm, not Apple's brand, imagery or copy. */
export function ProductRail({navigate}: {navigate: (path: string) => void}) {
  return <section className="product-rail" aria-labelledby="product-rail-title">
    <div className="product-rail__lead">
      <div>
        <p className="product-rail__eyebrow">HUFS ONE AI / 학생 기능</p>
        <h2 id="product-rail-title">학업부터 기회까지.<br/>필요한 화면으로 바로.</h2>
        <p className="product-rail__description">각 화면은 현재 연결된 자료와 접근 권한에 따라 이용 범위가 달라집니다.</p>
      </div>
      <a href="#feature-directory" className="product-rail__jump">모든 기능 찾아보기 <span aria-hidden="true">↓</span></a>
    </div>
    <div className="product-rail__grid">
      {SPOTLIGHTS.map(feature => <article className={'product-rail__tile product-rail__tile--' + feature.tone} key={feature.route}>
        <InAppLink to={feature.route} navigate={navigate} className="product-rail__tile-link">
          <span className="product-rail__tile-eyebrow">{feature.eyebrow}</span>
          <h3>{feature.title}</h3>
          <p>{feature.detail}</p>
          <span className="product-rail__tile-action">화면 열기 <span aria-hidden="true">↗</span></span>
          <span className="product-rail__tile-art" aria-hidden="true"><i/><i/><i/></span>
        </InAppLink>
      </article>)}
    </div>
  </section>;
}

type ViewScope = 'all' | 'app' | 'owner' | 'school';
const SCOPES: readonly {id: ViewScope; label: string}[] = [
  {id: 'all', label: '전체'},
  {id: 'app', label: '시연 화면'},
  {id: 'owner', label: '인증·운영'},
  {id: 'school', label: '학교 원본·미지원'},
];

function matchesScope(access: FeatureAccess, scope: ViewScope): boolean {
  if (scope === 'all') return true;
  if (scope === 'app') return access === 'app';
  if (scope === 'owner') return access === 'owner' || access === 'restricted' || access === 'local';
  return access === 'official' || access === 'unavailable';
}

function FeatureTile({feature, navigate}: {feature: FeatureEntry; navigate: (path: string) => void}) {
  const body = <><span className="feature-universe__item-name">{feature.label}</span>
    {feature.route || feature.officialUrl ? <span className="feature-universe__arrow" aria-hidden="true">↗</span> : null}</>;
  return <li className={'feature-universe__item feature-universe__item--' + feature.access}>
    <div className="feature-universe__item-head">
      {feature.route
        ? <InAppLink to={feature.route} navigate={navigate} className="feature-universe__item-link">{body}<span className="visually-hidden"> 화면 열기</span></InAppLink>
        : feature.officialUrl
          ? <a href={feature.officialUrl} target="_blank" rel="noopener noreferrer" className="feature-universe__item-link">{body}<span className="visually-hidden"> 새 창에서 열기</span></a>
          : <span className="feature-universe__item-label">{body}</span>}
    </div>
    <p className="feature-universe__item-state">{ACCESS_LABEL[feature.access]}</p>
    {feature.description && <p className="feature-universe__item-desc">{feature.description}</p>}
  </li>;
}

export function FeatureUniverse({navigate}: {navigate: (path: string) => void}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<ViewScope>('all');
  const [category, setCategory] = useState('all');
  const categories = useMemo(() => [...new Set(FEATURE_INVENTORY.map(feature => feature.group))], []);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ko-KR');
    return FEATURE_INVENTORY.filter(feature =>
      matchesScope(feature.access, scope)
      && (category === 'all' || feature.group === category)
      && (!needle || (feature.label + ' ' + feature.group + ' ' + (feature.description ?? ''))
        .toLocaleLowerCase('ko-KR').includes(needle)));
  }, [query, scope, category]);
  const groups = useMemo(() => {
    const result = new Map<string, FeatureEntry[]>();
    for (const feature of filtered) {
      const list = result.get(feature.group) ?? [];
      list.push(feature);
      result.set(feature.group, list);
    }
    return [...result];
  }, [filtered]);
  const clear = () => { setQuery(''); setScope('all'); setCategory('all'); };
  return <section className="feature-universe" id="feature-directory" aria-labelledby="feature-universe-title">
    <header className="feature-universe__head">
      <div>
        <p className="feature-universe__eyebrow">ALL FEATURES · 기능 전체 보기</p>
        <h2 id="feature-universe-title">한 화면에서 모든 기능 찾기.</h2>
        <p>HUFS One AI의 독립 화면과 HUFSAbility의 참고 메뉴를 모두 표시합니다. 미지원 메뉴는 연결된 기능처럼 보이지 않게 구분합니다.</p>
      </div>
      <span className="feature-universe__total">{FEATURE_INVENTORY.length}<small>전체 항목</small></span>
    </header>
    <div className="feature-universe__controls" role="search">
      <label className="feature-universe__search">
        <span>기능 검색</span>
        <input type="search" autoComplete="off" placeholder="예: 장학, 취업, 상담, 학점" value={query}
          onChange={event => setQuery(event.currentTarget.value)} />
      </label>
      <label className="feature-universe__select">
        <span>분류</span>
        <select value={category} onChange={event => setCategory(event.currentTarget.value)}>
          <option value="all">전체 분류</option>
          {categories.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <fieldset className="feature-universe__scopes">
        <legend>기능 상태</legend>
        {SCOPES.map(option => <button type="button" key={option.id} aria-pressed={scope === option.id}
          onClick={() => setScope(option.id)}>{option.label}</button>)}
      </fieldset>
    </div>
    <div className="feature-universe__results">
      <p aria-live="polite">{filtered.length}개 항목 · {groups.length}개 분류</p>
      {(query || scope !== 'all' || category !== 'all') && <button type="button" onClick={clear}>검색 조건 초기화</button>}
    </div>
    {filtered.length === 0 && <div className="feature-universe__empty">
      <p>일치하는 기능이 없습니다. 검색어 또는 상태 필터를 바꿔 보세요.</p>
      <button type="button" onClick={clear}>전체 기능 보기</button>
    </div>}
    <div className="feature-universe__groups">
      {groups.map(([label, entries], index) => <section className="feature-universe__group" key={label} aria-labelledby={'feature-group-' + index}>
        <div className="feature-universe__group-head">
          <h3 id={'feature-group-' + index}>{label}</h3>
          <span>{entries.length}개</span>
        </div>
        <ul>{entries.map(entry => <FeatureTile key={entry.id} feature={entry} navigate={navigate}/>)}</ul>
      </section>)}
    </div>
    <p className="feature-universe__disclaimer">HUFS One AI는 학교 공식 서비스가 아닙니다. 실제 학생 정보·승인된 공식 자료·AI 서비스 연결은 별도 인증 및 검증이 필요합니다.</p>
  </section>;
}
