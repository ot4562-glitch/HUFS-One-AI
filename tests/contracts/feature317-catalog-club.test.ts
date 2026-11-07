import {describe,it,expect} from 'vitest';
import {FeedCardSchema,OpportunitySchema} from '../../packages/contracts/src/corpus/index.js';
import {SyntheticClubPostSchema} from '../../packages/contracts/src/self/synthetic-clubs.js';
import {DEMO_OPPORTUNITIES} from '../../packages/core/src/opportunities/demo-corpus.js';
import {DEMO_CLUB_POSTS} from '../../packages/core/src/opportunities/demo-clubs.js';

const website={url:'https://www.naver.com/',verifiedAt:'2026-11-20T00:00:00.000Z',evidenceRef:'EV-ORG-01'};
describe('#317 verified organization website and synthetic club scope',()=>{
 it('validates homepage separately from a posting source or application route',()=>{
   const original=DEMO_OPPORTUNITIES[0]!;
   const result=OpportunitySchema.parse({...original,organizationWebsite:website});
   expect(result.organizationWebsite?.url).toBe(website.url);
   expect(result.actualApplicationRoute).toBe(original.actualApplicationRoute);
 });
 it.each(['javascript:alert(1)','http://www.naver.com/','https://127.0.0.1/',
   'https://localhost/','https://private.test/','https://user:secret@www.naver.com/',
   'https://www.naver.com/?token=private',
 ])('rejects non-public or ambiguous homepage URLs: %s',bad=>{
   const original=DEMO_OPPORTUNITIES[0]!;
   expect(OpportunitySchema.safeParse({...original,organizationWebsite:{...website,url:bad}}).success).toBe(false);
 });
 it('never allows a synthetic feed card to present an official institution website',()=>{
   const card={opportunityId:'SYN-OPP-001',displayMode:'COMPACT_LIST',
     title:'가상 공고',eligibility:'UNKNOWN',lifecycle:'OPEN',topics:[],evidenceRefs:[],
     dataMode:'SYNTHETIC',organizationWebsite:website};
   expect(FeedCardSchema.safeParse(card).success).toBe(false);
   expect(FeedCardSchema.safeParse({...card,dataMode:'REAL'}).success).toBe(true);
 });
 it('keeps existing club posts compatible and allows only explicit synthetic affiliations',()=>{
   const original=DEMO_CLUB_POSTS[0]!;
   expect(SyntheticClubPostSchema.safeParse(original).success).toBe(true);
   expect(SyntheticClubPostSchema.parse({...original,affiliation:'INTER_UNIVERSITY'}).affiliation).toBe('INTER_UNIVERSITY');
   expect(SyntheticClubPostSchema.parse({...original,affiliation:'EXTERNAL'}).affiliation).toBe('EXTERNAL');
   expect(SyntheticClubPostSchema.safeParse({...original,affiliation:'VERIFIED_SCHOOL'}).success).toBe(false);
 });
});
