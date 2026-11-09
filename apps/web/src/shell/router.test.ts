import {describe,expect,it} from 'vitest';
import {activeTab,decodeDetailId,validPath} from './router.js';

describe('#369 canonical detail links with encoded IDs',()=>{
  it.each([
    ['/opportunities/opp%3A2026','opp:2026'],
    ['/notices/item.1','item.1'],
    ['/notices/'+encodeURIComponent('공지:2026.가을'),'공지:2026.가을'],
    ['/opportunities/'+encodeURIComponent('a_42-z.1'),'a_42-z.1'],
  ])('accepts %s and decodes exactly once',(path,id)=>{
    expect(validPath(path)).toBe(true);
    expect(decodeDetailId(path.split('/')[2]!)).toBe(id);
  });
  it('does not lose the parent tab when an ID is encoded',()=>{
    expect(activeTab('/opportunities/opp%3A2026')).toBe('/opportunities');
    expect(activeTab('/notices/item.1')).toBe('/');
    expect(validPath('/')).toBe(true);
    expect(validPath('/owner-academics')).toBe(true);
  });
  it.each([
    '/opportunities/opp%2F2026',
    '/opportunities/opp%5C2026',
    '/opportunities/%2e%2e',
    '/opportunities/..',
    '/opportunities/%00',
    '/opportunities/opp%252F2026',
    '/opportunities/%ED%A0%80',
    '/opportunities/%',
    '/opportunities/%GG',
    '/notices/%E0%A4',
    '/opportunities/opp%3A2026/extra',
    '/opportunities/plain/extra',
    '/opportunities//plain',
    '/opportunities/../plain',
    '/notices/./item',
    '/notices/'+('a'.repeat(121)),
    '//opportunities/opp%3A2026',
    '/opportunities/a\\b',
    '/settings/%3A',
    '/opportunities/x?redirect=%2F',
    '/notices/x#fragment',
  ])('rejects ambiguous or unsafe pathname %s',(path)=>{
    expect(validPath(path)).toBe(false);
  });
  it('returns null rather than throwing for malformed URI detail segments',()=>{
    for(const raw of ['bad%','%GG','%E0%A4','x%2Fy','x%00y','..','%252F']){
      expect(()=>decodeDetailId(raw)).not.toThrow();
      expect(decodeDetailId(raw)).toBeNull();
    }
  });
});
