import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import {OwnerV2CatalogListItem} from './OwnerV2CatalogPanel.js';

const item:C.OpportunityCatalogItem={
  id:'SYN-OPPORTUNITY-1',title:'가상 장학 안내',summary:'합성 검증 데이터',
  category:'SCHOLARSHIP',topicCodes:[],eligibility:'UNKNOWN',permitted:true,
  sourceUrl:'https://example.org/notices/synthetic-1',
  source:{sourceId:'SYN-SOURCE',revisionId:'SYN-REVISION-1',status:'VERIFIED',
    rights:'CLEARED',verifiedAt:'2026-11-01T00:00:00Z',
    effectiveFrom:'2026-01-01T00:00:00Z',evidenceSpanIds:['SYN-SPAN']},
};

function show(entry:C.OpportunityCatalogItem){
  return renderToStaticMarkup(<ul><OwnerV2CatalogListItem item={entry}/></ul>);
}

describe('#447 approved source traceability in the v2 catalog',()=>{
  it('shows a verified public source link, verification date, and missing-campus truth',()=>{
    const html=show(item);
    expect(html).toContain('href="https://example.org/notices/synthetic-1"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('가상 장학 안내 원문 보기 (새 탭)');
    expect(html).toContain('2026-11-01');
    expect(html).toContain('캠퍼스 미확인');
    expect(html).not.toContain('href="javascript:');
  });
  it('does not fabricate a source link when none is provided',()=>{
    const html=show({...item,sourceUrl:undefined});
    expect(html).not.toContain('href=');
    expect(html).not.toContain('원문 확인');
  });
  it('does not link an unverified, blocked, or synthetic source',()=>{
    for(const source of [
      {...item.source,status:'NEEDS_REVIEW' as const},
      {...item.source,status:'REVOKED' as const},
      {...item.source,status:'SYNTHETIC' as const},
      {...item.source,rights:'BLOCKED' as const},
    ]) expect(show({...item,source})).not.toContain('href=');
  });
});
