import {useEffect,useState,useSyncExternalStore} from 'react';
import type {PrivateOwnerIntakeResponse} from '@hufs-one/contracts';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';

/** BETA-only read port. Caller cannot select an actor, subject, CSV filename or version. */
export interface OwnerPrivateIntakePort {
  readonly session:OwnerSessionController;
  read(signal?:AbortSignal):Promise<PrivateOwnerIntakeResponse>;
}
const credit=(units:number)=>`${units/2}학점`;
const value=(raw:string|null)=>raw?.trim()||'미확인';

/** A signed-in owner's source-backed preview; not an approved official transcript. */
export function OwnerPrivateIntakePanel({port}:{port:OwnerPrivateIntakePort}){
  const scope=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState);
  const [data,setData]=useState<PrivateOwnerIntakeResponse|null>(null);
  useEffect(()=>{void port.session.initialize();},[port]);
  useEffect(()=>{
    let active=true;
    setData(null);
    if(scope.status==='READY'){
      void port.session.runLatest('private-csv-intake',signal=>port.read(signal))
        .then(result=>{if(active&&result)setData(result);});
    }
    return ()=>{active=false;};
  },[port,scope.epoch,scope.status]);
  if(scope.status==='IDLE'||scope.status==='CHECKING')
    return <p aria-busy="true">본인 계정 인증을 확인하고 있습니다.</p>;
  if(scope.status!=='READY')
    return <p role="alert">본인 자료를 조회할 수 없습니다. 인증·동의·CSV 소유자 연결 또는 서버 설정을 확인해 주세요. 다른 학생이나 예시 계정의 자료로 대체하지 않습니다.</p>;
  if(!data)return <p aria-busy="true">본인 수강자료의 원본·권한·버전을 확인하고 있습니다.</p>;
  return <section aria-label="본인 CSV 학업 자료" className="local-account__panel">
    <p role="note">현재 로그인한 BETA 계정에 연결된 본인 CSV 자료입니다. 제공자 확인 전에는 공식 성적표나 졸업요건 판정이 아니며, 가상 S01–S05 계정과 별개입니다.</p>
    <h2>제공한 기본 정보</h2>
    <dl>
      <dt>캠퍼스</dt><dd>{value(data.profile.campus)}</dd>
      <dt>입학연도</dt><dd>{value(data.profile.cohort)}</dd>
      <dt>주전공</dt><dd>{value(data.profile.primaryMajor)}</dd>
      <dt>이중전공 유형</dt><dd>{value(data.profile.secondaryType)}</dd>
      <dt>이중전공</dt><dd>{value(data.profile.secondaryMajor)}</dd>
      <dt>본인 기입 취득학점</dt><dd>{value(data.profile.earnedCreditsSelfReported)}</dd>
      <dt>본인 기입 수강중 학점</dt><dd>{value(data.profile.inProgressCreditsSelfReported)}</dd>
      <dt>관심 분야</dt><dd>{value(data.profile.interestsSelfReported)}</dd>
    </dl>
    <h2>이수과목 CSV</h2>
    <p>자료 버전 {data.transcript.version} · {data.transcript.state==='NEEDS_REVIEW'?'CSV 검토 필요':'학생 확인 대기'} · {data.transcript.records.length}개 과목</p>
    {data.transcript.issueCodes.length>0&&<p role="alert">원본 형식·중복 확인 필요: {data.transcript.issueCodes.join(', ')}</p>}
    {data.transcript.records.length===0
      ?<p>검토 가능한 과목이 없습니다. 임의 학점이나 과목으로 채우지 않습니다.</p>
      :<div style={{overflowX:'auto'}}><table>
        <caption>본인에게만 표시되는 이수·수강중 내역 (공식 확인 전)</caption>
        <thead><tr><th scope="col">학기</th><th scope="col">과목명</th><th scope="col">학수번호</th><th scope="col">학점</th><th scope="col">이수구분</th><th scope="col">상태</th></tr></thead>
        <tbody>{data.transcript.records.map((row,i)=><tr key={i}>
          <td>{row.term}</td><td>{row.courseName}</td><td>{row.courseCode||'미확인'}</td><td>{credit(row.creditUnits)}</td><td>{row.category||'미확인'}</td>
          <td>{row.ledger==='EARNED'?'이수완료':'수강중'}</td>
        </tr>)}</tbody>
      </table></div>}
    <p role="note">개설 여부 {data.offeringStatus} · 학칙 근거 {data.rulesStatus}. 개인별 동의 철회·원본 수정 시 이전 결과는 재검증해야 합니다.</p>
  </section>;
}
