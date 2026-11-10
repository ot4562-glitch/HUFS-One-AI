import {expect,it} from 'vitest';
import {ApprovedPlainTextExtractor} from '../../apps/api/src/modules/opportunities/approved-text-extractor.js';
it('accepts the ordinary HTML5 doctype without enabling XML entities or external DTDs',async()=>{
  const parser=new ApprovedPlainTextExtractor();
  const parse=(text:string,contentType='text/html')=>parser.extract({
    content:new TextEncoder().encode(text),contentType,canonicalUrl:'https://synthetic.example/source',
  });
  expect(await parse('<!DOCTYPE html><html><body><p>synthetic</p></body></html>'))
    .toEqual([{id:'p1',text:'synthetic'}]);
  await expect(parse('<!DOCTYPE html SYSTEM "https://example.test/a.dtd"><p>text</p>')).rejects.toThrow('forbidden');
  await expect(parse('<!ENTITY x SYSTEM "file:///private"><p>&x;</p>')).rejects.toThrow('forbidden');
  await expect(parse('<!DOCTYPE html><rss/>','application/rss+xml')).rejects.toThrow('forbidden');
  expect(await parse('<urlset><url><loc>https://synthetic.example/notices/1</loc></url></urlset>',
    'application/xml')).toEqual([{id:'p1',text:'https://synthetic.example/notices/1'}]);
  expect(await parse('<urlset><url><loc>https://synthetic.example/notices/2</loc></url></urlset>',
    'text/xml')).toEqual([{id:'p1',text:'https://synthetic.example/notices/2'}]);
  await expect(parse('<!DOCTYPE urlset SYSTEM "file:///etc/passwd"><urlset/>',
    'application/xml')).rejects.toThrow('forbidden');

});
