import type {PageRenderer} from '../App.js';
import {OwnerPreparationPanel} from '../features/owner-preparation/OwnerPreparationPanel.js';

export const ownerPreparationPage:PageRenderer=({path,services})=>{
  const kind=path==='/owner-scholarships'?'SCHOLARSHIP'
    :path==='/owner-badges'?'BADGE':null;
  if(!kind)return null;
  return {title:kind==='SCHOLARSHIP'?'장학금 요건 준비':'오픈배지 취득 준비',
    body:services.ownerPreparation
      ?<OwnerPreparationPanel key={kind} port={services.ownerPreparation} kind={kind}/>
      :<p role="alert">본인 BETA 인증·공식 자료 권한이 없어서 확인할 수 없습니다. 공개 합성 데이터는 학교 규정을 대신하지 않습니다.</p>};
};
