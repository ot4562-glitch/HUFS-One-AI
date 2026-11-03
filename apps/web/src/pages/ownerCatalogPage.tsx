import type {PageRenderer} from '../App.js';
import {OwnerCatalogPanel} from '../features/owner-catalog/OwnerCatalogPanel.js';
/** Current BETA authorized catalog, independent of every public demo alias. */
export const ownerCatalogPage:PageRenderer=({path,services})=>{
  if(path!=='/owner-catalog')return null;
  return {title:'본인 승인 자료 · 교과목과 공고',
    body:services.ownerCatalog?<OwnerCatalogPanel port={services.ownerCatalog}/>
      :<p role="alert">BETA 본인 인증과 독립 승인 자료가 필요합니다. 공개 합성자료나 REVIEWER 자료로 대체하지 않습니다.</p>};
};
