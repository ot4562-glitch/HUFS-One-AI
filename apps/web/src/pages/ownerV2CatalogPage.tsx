import type {PageRenderer} from '../App.js';
import {OwnerV2CatalogPanel} from '../features/owner-catalog/OwnerV2CatalogPanel.js';

export const ownerV2CatalogPage:PageRenderer=({path,services})=>{
  if(path!=='/owner-opportunities/v2-catalog')return null;
  return {title:'검증된 공고 전체 검색',
    body:services.ownerV2Catalog
      ?<OwnerV2CatalogPanel port={services.ownerV2Catalog}/>
      :<p role="alert">현재 BETA 본인 권한/운영 공고 출처가 연결되지 않았습니다. 공개 합성 시연은 실제 학교 자료를 대신하지 않습니다.</p>};
};
