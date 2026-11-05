import {afterEach, describe, expect, it} from 'vitest';
import {DemoSnapshotSchema, NoticeResultSchema, SharingGrantSchema} from '@hufs-one/contracts';
import {createApi} from '../../apps/api/src/server.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {ScopedApiRepository} from '../../apps/api/src/scoped-repository.js';
import type {CalendarInputSource} from '../../apps/api/src/modules/calendar.js';
import {composeNotices, type Notice, type NoticeStudent} from '../../packages/core/src/notices/notice.js';
import {buildNoticeList} from '../../apps/web/src/features/notices/noticeView.js';
import snapshotRaw from '../../packages/fixtures/synthetic/demo-snapshot.json';

const NOW = '2026-10-31T00:00:00.000Z';
const ORIGIN = 'https://synthetic.invalid';
const revision = 'SYN-REV';
const receipt = 'SYN-RECEIPT';
const actor = {
  actorId:'SYN-NOTICE-OWNER', role:'BETA' as const, betaAllowed:true,
  sessionIdHash:'S'.repeat(32), csrfToken:'C'.repeat(32),
  sessionExpiresAt:'2026-11-05T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-11-05T00:00:00.000Z',
};
const opened:Array<ReturnType<typeof createApi>> = [];
afterEach(async () => { await Promise.all(opened.splice(0).map(app => app.close())); });

function student(overrides:Partial<NoticeStudent> = {}):NoticeStudent {
  return {
    campus:'SEOUL', majors:[{major:'SYN-MAJOR', role:'PRIMARY'}],
    targetGraduationTerm:'2026-2', graduationTermVerified:true,
    openRequirementIds:['SYN-REQ'], courseIds:[], interestTopics:[],
    ...overrides,
  };
}

function notice(id:string, overrides:Partial<Notice> = {}):Notice {
  return {
    id, sourceSnapshotId:revision, title:id, issuer:'SYNTHETIC', category:'ACADEMIC',
    requirementRefs:['SYN-REQ'], verificationState:'VERIFIED', evidenceRefs:['SYN-EV'],
    ...overrides,
  };
}

// Synthetic trusted source only: this tests the real scoped HTTP producer and UI
// consumer, not PostgreSQL source approval or a real student's academic status.
async function throughHttp(scope:NoticeStudent, notices:Notice[]) {
  const sections = ['FEED', 'NOTICES', 'ACADEMICS'] as const;
  const grant = SharingGrantSchema.parse({
    grantId:'SYN-GRANT', actorId:actor.actorId, demoSubjectId:'S01',
    allowedSections:sections, displayNameAllowed:false, recordingAllowed:false,
    version:'SYN-G1', expiresAt:actor.sessionExpiresAt,
  });
  const stored = DemoSnapshotSchema.parse(snapshotRaw);
  const profiles = (['S01', 'S02', 'S03', 'S04', 'S05'] as const).map(demoSubjectId => ({
    demoSubjectId, displayLabel:demoSubjectId, dataMode:'SYNTHETIC' as const,
    readiness:'READY' as const, allowedSections:[...sections],
  }));
  const base = new MemoryApiRepository({profiles, grants:[grant], projections:[stored]});
  const source:CalendarInputSource = {
    readAuthorizedInputs:async input => ({
      actorId:actor.actorId, context:input.context, grant, asOf:NOW,
      datasetMode:'SYNTHETIC', sourceVersion:'SYN-S1', authorizationToken:receipt,
      scopeKey:'ACADEMICS,FEED,NOTICES', provenance:{},
      profile:{
        interestTopics:[], desiredJobTopics:[], approvedExperienceTopics:[],
        approvedLanguageCodes:[], officialMajorTopics:[], facts:{},
      },
      noticeStudent:scope, opportunities:[], notices,
      revisions:[{
        revisionId:revision, sourceId:'SYN-SOURCE', status:'ACTIVE', changeKind:'NEW',
        provenance:'SYNTHETIC', permissionRef:'SYN-PERM',
        publishedAt:'2026-10-30T00:00:00.000Z', fetchedAt:'2026-10-30T00:00:00.000Z',
        lastVerifiedAt:'2026-10-30T00:00:00.000Z',
      }],
      authorizedRevisionIds:[revision],
    }),
    revalidateAuthorization:async () => true,
  };
  const repository = new ScopedApiRepository(base, source, () => NOW);
  const app = createApi({
    allowedOrigin:ORIGIN, now:() => NOW, verifySession:async () => actor,
    repository, calendarSource:source,
  });
  opened.push(app);
  const selected = await app.inject({
    method:'POST', url:'/api/demo/contexts',
    headers:{origin:ORIGIN, 'x-csrf-token':actor.csrfToken},
    payload:{demoSubjectId:'S01', demoRunId:'SYN-NOTICE-RUN'},
  });
  expect(selected.statusCode).toBe(201);
  const path = '/api/demo/contexts/' + (selected.json().contextId as string);
  const response = await app.inject({url:path + '/notices'});
  const snapshot = await app.inject({url:path + '/snapshot'});
  expect([response.statusCode, snapshot.statusCode]).toEqual([200, 200]);
  const wire = NoticeResultSchema.parse(response.json());
  expect(snapshot.json().notices).toEqual(wire);
  return {wire, view:buildNoticeList(wire)};
}

describe('#224 notice scope through core, scoped HTTP, wire schema and UI', () => {
  it.each([
    ['PRIMARY_MAJOR', 'PRIMARY'],
    ['DOUBLE_MAJOR', 'DOUBLE'],
    ['MINOR', 'MINOR'],
  ] as const)('preserves an applicable required notice for %s', async (role, noticeRole) => {
    const {wire, view} = await throughHttp(
      student({majors:[{major:'SYN-MAJOR', role}]}),
      [notice('SYN-ROLE', {majors:['SYN-MAJOR'], majorRoles:[noticeRole]})],
    );
    expect(wire.items[0]).toMatchObject({priority:'ACADEMIC_REQUIRED', appliesTo:'YES'});
    expect(wire.pinnedIds).toEqual(['SYN-ROLE']);
    expect(view[0]).toMatchObject({
      noticeId:'SYN-ROLE', priorityText:'학사 필수', appliesText:'나에게 해당', pinned:true,
    });
  });

  it.each(['2026-02', '2026-2학기', '2026-3'])(
    'keeps a required notice visible with UNKNOWN for malformed student term %s', async term => {
      const scope = student({targetGraduationTerm:term});
      const notices = [notice('SYN-TERM', {graduationTermScope:['2026-2']})];
      expect(composeNotices(scope, notices, {asOf:NOW}).evaluations[0])
        .toMatchObject({unknownScope:['graduationTerm']});
      const {wire, view} = await throughHttp(scope, notices);
      expect(wire.items[0]).toMatchObject({priority:'ACADEMIC_REQUIRED', appliesTo:'UNKNOWN'});
      expect(wire.pinnedIds).toEqual([]);
      expect(view[0]).toMatchObject({
        priorityText:'학사 필수', appliesText:'해당 여부 확인 필요', pinned:false,
      });
    },
  );

  it('does not guess an unknown student role into a known mismatch', async () => {
    const {wire, view} = await throughHttp(
      student({majors:[{major:'SYN-MAJOR', role:'PRIMARY_GUESSED' as never}]}),
      [notice('SYN-UNKNOWN', {majors:['SYN-MAJOR'], majorRoles:['PRIMARY']})],
    );
    expect(wire.items[0]).toMatchObject({priority:'ACADEMIC_REQUIRED', appliesTo:'UNKNOWN'});
    expect(view[0]?.appliesText).toBe('해당 여부 확인 필요');
  });

  it('keeps a definite scope mismatch even when a different student field is malformed', async () => {
    const {wire, view} = await throughHttp(student({targetGraduationTerm:'2026-02'}), [
      notice('SYN-OTHER', {campus:'GLOBAL', graduationTermScope:['2026-2']}),
    ]);
    expect(wire.items[0]).toMatchObject({priority:'GENERAL', appliesTo:'NO'});
    expect(view[0]).toMatchObject({priorityText:'일반', appliesText:'해당 없음', pinned:false});
  });

  it('quarantines malformed notice terms and roles without hiding valid notices', async () => {
    const notices = [
      notice('SYN-VALID', {graduationTermScope:['2026-2']}),
      notice('SYN-BAD-TERM', {graduationTermScope:['2026-02']}),
      notice('SYN-BAD-ROLE', {majorRoles:['PRIMARY_GUESSED' as never]}),
    ];
    expect(composeNotices(student(), notices, {asOf:NOW}).excluded).toEqual([
      {noticeId:'SYN-BAD-ROLE', reason:'INVALID_MAJOR_ROLE'},
      {noticeId:'SYN-BAD-TERM', reason:'INVALID_TERM'},
    ]);
    const {wire, view} = await throughHttp(student(), notices);
    expect(wire.items.map(item => item.noticeId)).toEqual(['SYN-VALID']);
    expect(view.map(item => item.noticeId)).toEqual(['SYN-VALID']);
  });

  it.each([
    ['CANDIDATE', '확인 전 초안'],
    ['NEEDS_REVIEW', '검토 필요'],
  ] as const)('preserves the %s review badge without promoting priority', async (verificationState, badge) => {
    const {wire, view} = await throughHttp(
      student({majors:[{major:'SYN-MAJOR', role:'PRIMARY_MAJOR'}]}),
      [notice('SYN-PENDING', {majorRoles:['PRIMARY'], verificationState})],
    );
    expect(wire.items[0]).toMatchObject({priority:'GENERAL', appliesTo:'YES', verificationState});
    expect(wire.pinnedIds).toEqual([]);
    expect(view[0]).toMatchObject({priorityText:'일반', verificationText:badge, pinned:false});
  });
});
