import {ARTWORK, type ArtworkId} from './artwork.js';
import {SyntheticArtwork} from './SyntheticArtwork.js';

interface Example {title: string; art: ArtworkId; kind: string; audience: string; campus: string; timing: string}
/** Display-only examples, deliberately outside the fixed evaluation corpus and recommendation feed. */
export const SYNTHETIC_EXAMPLES: Readonly<Record<'clubs' | 'opportunities', readonly Example[]>> = {
  clubs: [
    {title:'가상 데이터로 읽는 캠퍼스', art:'technology', kind:'데이터·AI 프로젝트', audience:'1–2학년 입문', campus:'서울', timing:'모집 중'},
    {title:'가상 한 문장 번역 공방', art:'language', kind:'언어·번역', audience:'전 학년', campus:'글로벌', timing:'상시 모집'},
    {title:'가상 월드 카페', art:'international', kind:'국제교류', audience:'전 학년', campus:'두 캠퍼스', timing:'모집 예정'},
    {title:'가상 청년 정책 원탁', art:'policy', kind:'정책·경제 토론', audience:'3–4학년', campus:'서울', timing:'모집 중'},
    {title:'가상 초록 한 걸음', art:'volunteer', kind:'환경 봉사', audience:'전 학년', campus:'두 캠퍼스', timing:'모집 마감'},
    {title:'가상 작은 무대', art:'music', kind:'음악·공연', audience:'신입·재학생', campus:'글로벌', timing:'마감 미정'},
  ],
  opportunities: [
    {title:'가상 공공데이터 아이디어 공모전', art:'technology', kind:'공모전', audience:'전 학년·팀 참가', campus:'두 캠퍼스', timing:'모집 중'},
    {title:'가상 청년 숏폼 창작 워크숍', art:'media', kind:'대외활동', audience:'1–2학년 입문', campus:'서울', timing:'모집 예정'},
    {title:'가상 국제교류 활동 장학', art:'international', kind:'장학', audience:'자격 추가 확인', campus:'글로벌', timing:'모집 중'},
    {title:'가상 프로젝트 포트폴리오 인턴', art:'career', kind:'인턴', audience:'3–4학년', campus:'두 캠퍼스', timing:'모집 마감'},
    {title:'가상 번역·콘텐츠 신입 채용', art:'language', kind:'채용', audience:'졸업예정자', campus:'두 캠퍼스', timing:'상시 모집'},
    {title:'가상 지역사회 정책 리서치', art:'policy', kind:'연구·탐색', audience:'전 학년', campus:'서울', timing:'마감 미정'},
  ],
};

export function SyntheticExampleGallery({kind}: {kind: 'clubs' | 'opportunities'}) {
  return <details className="synthetic-gallery">
    <summary>더 많은 합성 {kind === 'clubs' ? '동아리' : '기회'} 예시 보기</summary>
    <p>유형과 모집 상태를 살펴보는 가상 예시입니다. 실제 모집·지원 대상이 아니며 신청할 수 없어요.</p>
    <ul className="synthetic-gallery__grid">{SYNTHETIC_EXAMPLES[kind].map(e => <li key={e.title}>
      <SyntheticArtwork art={ARTWORK[e.art]} />
      <div className="synthetic-gallery__body"><h3>{e.title}</h3><p>{e.kind} · {e.campus}</p><p>{e.audience} · {e.timing}</p></div>
    </li>)}</ul>
  </details>;
}
