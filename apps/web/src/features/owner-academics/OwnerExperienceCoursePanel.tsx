import {useEffect,useState,useSyncExternalStore} from 'react';
import type {HufsOwnerApiClient} from '../../integrations/owner-api-client.js';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';
import {OwnerSessionFailure} from '../../app/OwnerSessionFailure.js';

export interface OwnerCourseEvidencePort {
  session:OwnerSessionController;
  read:HufsOwnerApiClient['getExperienceCourseEvidence'];
}
type Result=Awaited<ReturnType<OwnerCourseEvidencePort['read']>>;

/** Show a current owner-only academic purpose grant, never school-certified skill or grades. */
export function OwnerExperienceCoursePanel({port}:{port:OwnerCourseEvidencePort}){
  const scope=useSyncExternalStore(port.session.subscribe,port.session.getState,port.session.getState);
  const [result,setResult]=useState<Result|null>(null);
  useEffect(()=>{void port.session.initialize();},[port.session]);
  useEffect(()=>{
    setResult(null);
    if(scope.status!=='READY')return;
    let active=true;
    void port.session.runLatest('owner-academic-course-evidence',signal=>port.read(signal))
      .then(value=>{if(active&&value)setResult(value);});
    return ()=>{active=false;};
  },[port,scope.epoch,scope.status]);
  if(scope.status==='IDLE'||scope.status==='CHECKING')
    return <p role="status" aria-busy="true">현재 학업 정보 사용 권한을 확인 중입니다.</p>;
  if(scope.status!=='READY')return <OwnerSessionFailure controller={port.session}>
    인증·학업 기록 공유 권한이 바뀌어 결과를 삭제했습니다. 기존 경험↔교과 링크는 현재 유효하다고 가정하지 않습니다.
  </OwnerSessionFailure>;
  if(!result)return <p role="status" aria-busy="true">현재 허가된 학업·경험 연결을 조회 중입니다.</p>;
  return <section className="local-account__panel" aria-label="학업·경험 연결">
    <p role="note">이 화면은 학생이 제출한 이수 기록과 본인이 직접 확인한 링크만 보여 줍니다. 학교 공식 이수/학점 판정, 역량 등급 또는 졸업 자격 증명이 아닙니다.</p>
    {result.state==='NOT_CONNECTED'&&<p role="status">NOT_CONNECTED — 운영자의 과목 정본·학업 자료 목적별 공유 및 경험 링크 원장이 연결되지 않았습니다. 학수번호를 임의로 정본 과목에 매핑하지 않습니다.</p>}
    {result.state==='NOT_SHARED'&&<p role="status">NOT_SHARED — 현재 학업 기록을 경험 목적으로 사용할 권한이 없습니다. 데이터가 비어 있다는 뜻은 아닙니다.</p>}
    {result.state==='NEEDS_REVIEW'&&<p role="status">NEEDS_REVIEW — 학업 기록·교과 식별/동의 검토가 필요하며 학업 경험 링크를 확인할 수 없습니다.</p>}
    {result.state==='SHARED'&&<>
      <p className="muted">현재 제출·검토 기록 · 기준 {result.asOf.slice(0,10)} · 판본 {result.transcriptVersion}</p>
      <h3>학생 제출 교과 기록</h3>
      {result.courses.length===0?<p>공유된 원장에 확인 가능한 교과 기록이 없습니다.</p>
        :<ul>{result.courses.map(course=><li key={course.canonicalCourseId}>
          <strong>{course.canonicalCourseId}</strong> — {course.state}
          {'term' in course ?' · '+course.term:''}
        </li>)}</ul>}
      <h3>경험과 교과의 연결</h3>
      {result.links.length===0?<p>현재 확인된 경험·교과 연결 기록이 없습니다. 자동 추천이나 임의 링크를 추가하지 않습니다.</p>
        :<ul>{result.links.map(link=><li key={link.experienceId+'::'+link.canonicalCourseId}>
          {link.experienceId} ↔ {link.canonicalCourseId} — {link.state==='LINKED'
            ?`본인 확인 연결 (${link.course}, ${link.term})`
            :`연결 보류 (${link.reason})`}
        </li>)}</ul>}
    </>}
  </section>;
}
