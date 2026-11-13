/**
 * One-to-one implementation audit for the user's 25 design references.
 * This is not a claim that we copied proprietary template/shader assets.
 * The cited visual/interaction practice is implemented using original TSX/CSS.
 *
 * The anti-slop rules in apps/web/AGENTS.md override decorative patterns:
 * no fabricated figures, inaccessible motion, fake controls or official branding.
 */
export interface AppliedReference {
  readonly site: string;
  readonly scope: string;
  readonly appliedPattern: string;
  readonly cssEvidence: string;
}

export const DESIGN_REFERENCES: readonly AppliedReference[] = [
  {site: 'modulify.ai/templates', scope: '도구 탐색', appliedPattern: '업무 목적별 반응형 템플릿 그리드', cssEvidence: '.product-rail__grid'},
  {site: 'modulify.ai', scope: '시스템 전체', appliedPattern: '실제 업무 페이지 간 일관된 구성요소', cssEvidence: '.module'},
  {site: 'landdding.com', scope: '홈', appliedPattern: '기업·채용 랜딩의 분할 정보 구도', cssEvidence: '.work-brief'},
  {site: 'motionin.design', scope: 'CTA', appliedPattern: '입력·선택에 반응하는 짧은 상태 전환', cssEvidence: '.work-brief__actions a'},
  {site: 'wonderlist.design', scope: '서체', appliedPattern: 'Figma 레이아웃의 텍스트 위계와 여백 규칙', cssEvidence: '.page-head__kicker'},
  {site: 'iconly.design', scope: '아이콘', appliedPattern: '20–24px 단일 두께 아이콘 체계(자체 SVG)', cssEvidence: '.product-rail__icon'},
  {site: 'logotouse.com', scope: '브랜드', appliedPattern: '자체 제작 기하학 로고 마크와 아이덴티티 비율', cssEvidence: '.app__logo-mark::before'},
  {site: 'fontinlogo.com', scope: '브랜드', appliedPattern: '워드마크 웨이트·자간의 일관성', cssEvidence: '.topbar .app__logo'},
  {site: 'wedoflow.com', scope: '홈·대시보드', appliedPattern: '비즈니스 SaaS 스타일 분할 작업 표면', cssEvidence: '.work-brief__upcoming'},
  {site: 'land-book.com', scope: '기능 메뉴', appliedPattern: '콘텐츠 중심 랜딩 카드와 비례 그리드', cssEvidence: '.product-rail__tile'},
  {site: 'refero.design', scope: '공고 탐색', appliedPattern: '실제 필터·정렬·검색 결과의 상태 연결', cssEvidence: '.explorer__tools'},
  {site: 'theinternetdesigns.com', scope: '홈 요약', appliedPattern: '상태와 우선순위가 다른 데이터 표면', cssEvidence: '.summary__card--matched'},
  {site: '60fps.design', scope: '인터랙션', appliedPattern: '짧은 버튼 피드백과 모션 감소 대응', cssEvidence: '.product-rail__tile-link .product-rail__tile-action span'},
  {site: 'footer.design', scope: '푸터', appliedPattern: '기업형 링크 구조와 브랜드 고지 영역', cssEvidence: '.app__foot-links'},
  {site: 'cta.gallery', scope: '작업 시작', appliedPattern: '실제 가능한 작업을 명시한 CTA', cssEvidence: '.work-brief__action-primary'},
  {site: 'supahero.io', scope: '홈', appliedPattern: '복잡한 제품을 설명하는 짧은 실행형 히어로', cssEvidence: '.work-brief__content'},
  {site: '3dicons.co', scope: '홈 보조 그래픽', appliedPattern: '자체 CSS로 구현한 절제된 종이 스택 입체감', cssEvidence: '.work-brief__art'},
  {site: 'grainient.supply', scope: '색채', appliedPattern: '브랜드 색 범위 안의 단일 저채도 그라디언트', cssEvidence: '.work-brief__content::before'},
  {site: 'inspora.design', scope: '시각 구성', appliedPattern: '텍스트를 방해하지 않는 작은 물체 기반 장식', cssEvidence: '.work-brief__art span'},
  {site: 'motionsites.ai', scope: '동작 명세', appliedPattern: '모션 의도가 명시된 네이티브 섹션 이동', cssEvidence: '.work-jumpnav a'},
  {site: 'recent.design', scope: '편집형 구성', appliedPattern: '명료한 제목 계층과 최신 SaaS 편집형 비례', cssEvidence: '.page-head__lede'},
  {site: 'godly.website', scope: '선별', appliedPattern: '현재 recent.design으로 이전된 큐레이션의 절제 원칙', cssEvidence: '.product-rail__lead'},
  {site: 'scrolltide.co', scope: '스크롤 UX', appliedPattern: '스크롤 가로채기 없는 위치 이동과 앵커', cssEvidence: '.work-jumpnav'},
  {site: 'scrollshaders.com', scope: '배경 표현', appliedPattern: '유료 GPU 셰이더 대신 정적 CSS 메쉬 질감', cssEvidence: '.work-brief__content::before'},
  {site: 'styles.refero.design', scope: '디자인 토큰', appliedPattern: '재사용 가능한 계층/상태/컨트롤 의미 규칙', cssEvidence: '--ref-ink'},
] as const;
