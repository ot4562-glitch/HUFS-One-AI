import {describe,expect,it} from 'vitest';
import {routeCounselingV2} from './counseling-v2.js';
import {agency,source,FIXED_NOW} from './v2.fixtures.js';

/** Entirely fictional institutional catalog: no actual counseling locations,
 * phone numbers, operating hours or booking claims. */
const codes=['CAREER','ACADEMIC','STUDY','INTERNATIONAL','WELLBEING','MAJOR',
  'JOB_SEARCH','WRITING','OTHER'] as const;
const synthetic=codes.map((purpose,i)=>agency('SYN-SERVICE-'+String(i).padStart(2,'0'),{
  purposeCodes:[purpose],relatedPurposeCodes:[],
  campuses:[i%2?'GLOBAL':'SEOUL'],languages:[i%2?'en':'ko'],
  audienceCodes:['STUDENT'],officialUrl:'https://example.org/synthetic/counseling/'+i,
}));
const route=(purposes:readonly string[],services=synthetic,extras:{
  campus?:string;language?:string;audienceCodes?:readonly string[];
}={})=>routeCounselingV2({purposes,services,asOf:FIXED_NOW,...extras});
describe('#345 synthetic counseling purpose/rights decision matrix',()=>{
  it.each(codes)('selecting only %s never invents an unrelated institution',code=>{
    const result=route([code]);
    expect(result.status).toBe('MATCHES');
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.exactPurposes).toEqual([code]);
    expect(result.matches[0]?.officialApplicationUrl?.startsWith('https://example.org/')).toBe(true);
  });
  it('a complex three-purpose query respects score and service ID ordering',()=>{
    const r=route(['CAREER','WRITING','ACADEMIC'],[
      agency('B',{purposeCodes:['CAREER'],relatedPurposeCodes:['WRITING']}),
      agency('A',{purposeCodes:['CAREER'],relatedPurposeCodes:['WRITING']}),
      agency('C',{purposeCodes:['ACADEMIC']}),
      agency('D',{purposeCodes:['STUDY']}),
    ],{campus:'SEOUL',language:'ko',audienceCodes:['STUDENT']});
    expect(r.matches.map(x=>x.serviceId)).toEqual(['A','B','C']);
    expect(r.matches[0]?.score).toBe(6);
    expect(r.matches[0]?.exactPurposes).toEqual(['CAREER']);
    expect(r.matches[0]?.relatedPurposes).toEqual(['WRITING']);
    expect(r.matches[2]?.score).toBe(5);
  });
  it('quarantines each copy of conflicting service IDs regardless of array order',()=>{
    const a=agency('A',{purposeCodes:['CAREER']});
    const conflict=agency('A',{purposeCodes:['WRITING']});
    for(const services of [[a,conflict],[conflict,a]]){
      expect(route(['CAREER','WRITING'],services)).toMatchObject({
        status:'NO_MATCH',excluded:2,matches:[],
      });
    }
  });
  it.each([
    ['inactive',{active:false}],
    ['revoked source',{source:{...source(),status:'REVOKED'}}],
    ['blocked source',{source:{...source(),rights:'BLOCKED'}}],
    ['later published source',{source:{...source(),verifiedAt:'2029-01-01T00:00:00Z'}}],
  ] as const)('never recommends %s',(_label,overrides)=>{
    const r=route(['CAREER'],[agency('SYN-OFFICE',overrides)]);
    expect(r.matches).toEqual([]);
    expect(r.excluded).toBe(1);
  });
  it('excludes explicit campus mismatch rather than treating it as universal',()=>{
    const r=route(['CAREER'],[agency('SYN-SEOUL')],{campus:'GLOBAL'});
    expect(r).toMatchObject({status:'NO_MATCH',excluded:1});
  });
  it('excludes explicit language mismatch rather than inventing translation',()=>{
    const r=route(['CAREER'],[agency('SYN-KOREAN')],{language:'zh'});
    expect(r.matches).toHaveLength(0);
  });
  it('does not infer audience eligibility from a missing audience list',()=>{
    const r=route(['CAREER'],[agency('SYN-UNKNOWN',{audienceCodes:[]})],
      {audienceCodes:['INTERNATIONAL_STUDENT']});
    expect(r.matches[0]?.audienceState).toBe('UNKNOWN');
  });
  it('never labels a bad URL as an official booking endpoint',()=>{
    for(const url of ['http://example.org/unsafe','javascript:alert(1)','https://user:pass@example.org/a']){
      const r=route(['CAREER'],[agency('SYN-BAD',{officialUrl:url})]);
      expect(r.matches[0]?.officialApplicationUrl).toBeNull();
    }
  });
  it('never diagnoses mental health or pretends that a query is a booking',()=>{
    const r=route(['WELLBEING']);
    expect(r.matches).toHaveLength(1);
    expect(Object.keys(r.matches[0]!)).not.toContain('diagnosis');
    expect(Object.keys(r.matches[0]!)).not.toContain('bookingConfirmed');
  });
  it('no selected purpose is visibly different from missing approved services',()=>{
    expect(route([]).status).toBe('NO_PURPOSE');
    expect(route(['CAREER'],[]).status).toBe('NO_MATCH');
  });
});
