import {PUBLIC_CAREER_REFERENCE_SOURCES} from '@hufs-one/contracts';

/** Safe immediately-available navigation, never a direct provider API request.
 * No personal interests, academic values, actor, cookies or query string leave. */
export function OfficialCareerReferences(){
  return <section aria-labelledby="official-career-links-heading">
    <h2 id="official-career-links-heading">외부 공식 진로·채용 참고처</h2>
    <p role="note">참고 사이트만 새 창으로 엽니다. 학생 기록·관심·지원 단계는 외부에 전송하지 않습니다. 공식 학업 인증, 개인정보 연동, 채용 공고 수집·게시 또는 실시간 추천 기능은 아닙니다.</p>
    <ul>{PUBLIC_CAREER_REFERENCE_SOURCES.map(source=><li key={source.id}>
      <a href={source.url} target="_blank" rel="noopener noreferrer external">
        {source.name} · {source.label}
      </a>
      {' · '}
      {source.api==='KEY_AND_BUSINESS_REVIEW'||source.api==='KEY_AND_SERVICE_REVIEW'
        ?'공식 데이터 API 연동에는 별도 이용 신청·심사/인증키 필요'
        :'공식 데이터 API 연동에는 인증키/자료별 권리 확인 필요'}
    </li>)}</ul>
    <p role="note">실제 채용·직업 정보를 HUFS One AI에 표시하려면 별도의 검증된 서버 API, 출처별 이용권, 관리자 검토 및 출처 판본이 선행되어야 합니다.</p>
  </section>;
}
