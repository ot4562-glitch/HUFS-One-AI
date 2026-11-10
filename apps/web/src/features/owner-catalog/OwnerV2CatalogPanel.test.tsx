import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import {OwnerV2CatalogListItem,buildCatalogSearchQuery,formatKstDate} from './OwnerV2CatalogPanel.js';

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
  it('displays deadlines, source verification, and snapshot date in Korea time',()=>{
    expect(formatKstDate('2026-11-30T15:00:00Z')).toBe('2026-12-01');
    expect(formatKstDate('2026-11-30T23:59:59+09:00')).toBe('2026-11-30');
    expect(formatKstDate()).toBe('미확인');
    const html=show({...item,deadlineAt:'2026-11-30T15:00:00Z',
      source:{...item.source,verifiedAt:'2026-11-01T15:01:00Z'}});
    expect(html).toContain('마감 2026-12-01');
    expect(html).toContain('검증 2026-11-02');
  });
  it('never shows the original source link for a non-permitted catalog item',()=>{
    const html=show({...item,permitted:false});
    expect(html).not.toContain('href=');
    expect(html).not.toContain('검증 2026-11-01');
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
    ]) {
      const html=show({...item,source});
      expect(html).not.toContain('href=');
      expect(html).not.toContain('검증 2026-11-01');
    }
  });
});

describe('#447 full approved catalog filter continuity',()=>{
  const f={q:'장학',sort:'DEADLINE_ASC' as const,category:'SCHOLARSHIP',
    campus:'SEOUL',eligibility:'UNKNOWN' as const,deadlineDate:'2026-12-31',
    includeClosed:true};
  it('submits all server-supported filters with the correct KST deadline',()=>{
    expect(buildCatalogSearchQuery(f)).toEqual({
      q:'장학',sort:'DEADLINE_ASC',pageSize:10,category:'SCHOLARSHIP',
      campus:'SEOUL',eligibility:'UNKNOWN',
      deadlineBefore:'2026-12-31T23:59:59.999+09:00',includeClosed:true,
    });
  });
  it('preserves every filter and binds the same asOf to the cursor',()=>{
    const base=buildCatalogSearchQuery(f);
    expect(buildCatalogSearchQuery(f,'SYN-CURSOR','2026-11-10T00:00:00Z'))
      .toEqual({...base,cursor:'SYN-CURSOR',asOf:'2026-11-10T00:00:00Z'});
  });
  it('omits blank optional filters and never forges a continuation without an asOf',()=>{
    expect(buildCatalogSearchQuery({...f,q:'',category:'',campus:'',
      eligibility:'',deadlineDate:'',includeClosed:false},'SYN-CURSOR'))
      .toEqual({q:'',sort:'DEADLINE_ASC',pageSize:10,includeClosed:false});
  });
});
