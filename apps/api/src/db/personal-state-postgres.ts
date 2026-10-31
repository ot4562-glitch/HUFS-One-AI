import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {
  DesiredJobTopicsSchema,InterestTopicsSchema,SubjectAliasSchema,
} from '@hufs-one/contracts';
import type {SubjectAlias} from '@hufs-one/contracts';
import type {
  ReviewerSqlConnection,ReviewerSqlPool,
} from '../modules/auth/reviewer-postgres.js';

const Key=z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:@-]+$/);
const Ref=z.string().min(1).max(90).regex(/^[A-Za-z0-9_-]+$/);
const GrantVersion=z.string().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/);
const Mode=z.enum(['SYNTHETIC','OWNER_CONSENTED']);
const PersonalValueSchema=z.discriminatedUnion('kind',[
  z.strictObject({
    kind:z.literal('EXPERIENCE'),dataMode:Mode,
    title:z.string().trim().min(1).max(120),
    summary:z.string().trim().max(500),
    role:z.string().trim().max(80).optional(),
    startedOn:z.iso.date().optional(),endedOn:z.iso.date().optional(),
    evidenceUrl:z.url().max(800).optional(),
  }),
  z.strictObject({
    kind:z.literal('BOOKMARK'),dataMode:Mode,
    itemId:Ref,saved:z.boolean(),
  }),
  z.strictObject({
    kind:z.literal('READ_RECEIPT'),dataMode:Mode,
    itemId:Ref,read:z.boolean(),
  }),
  z.strictObject({
    kind:z.literal('PREFERENCES'),dataMode:Mode,
    interests:InterestTopicsSchema,desiredJobs:DesiredJobTopicsSchema,
    notificationsEnabled:z.boolean(),search:z.string().trim().max(100),
  }),
  z.strictObject({
    kind:z.literal('COURSE_PLAN'),dataMode:Mode,
    courseId:Ref,planned:z.boolean(),
  }),
  z.strictObject({
    kind:z.literal('APPLICATION_DRAFT'),dataMode:Mode,
    opportunityId:Ref,text:z.string().max(1200),
  }),
]);
export const PersonalRecordValueSchema=PersonalValueSchema;
export type PersonalRecordValue=z.infer<typeof PersonalValueSchema>;
export type PersonalKind=PersonalRecordValue['kind'];
export interface TrustedPersonalScope {
  /** This is ONLY the server-verified OIDC sub; never accept an HTTP header. */
  actorId:string;
  /** Selected S01–S05 demo workspace, not the person whose data can be edited. */
  subjectId:SubjectAlias;
  /** A live, specific grant must still have this version in PostgreSQL. */
  grantVersion:string;
}
export interface StoredPersonalRecord {
  actorId:string;subjectId:SubjectAlias;itemId:string;
  kind:PersonalKind;version:number;value:PersonalRecordValue;updatedAt:string;
}
/** A separate owner-consent verifier, not a client checkbox or a sharing grant. */
export interface PersonalDataConsentVerifier {
  mayProcess(input:{
    actorId:string;subjectId:SubjectAlias;kind:PersonalKind;
    operation:'READ'|'WRITE';
  }):Promise<boolean>;
}
export class PersonalStateDenied extends Error {
  constructor(){super('Personal state access denied');}
}
export class PersonalStateConflict extends Error {
  constructor(){super('Personal state version conflict');}
}

const Section:Record<PersonalKind,string>={
  EXPERIENCE:'EXPERIENCE',BOOKMARK:'FEED',READ_RECEIPT:'NOTICES',
  PREFERENCES:'FEED',COURSE_PLAN:'ACADEMICS',APPLICATION_DRAFT:'FEED',
};
const Kind=z.enum([
  'EXPERIENCE','BOOKMARK','READ_RECEIPT','PREFERENCES',
  'COURSE_PLAN','APPLICATION_DRAFT',
]);
function iso(value:unknown):string{
  if(value instanceof Date&&!Number.isNaN(value.valueOf()))return value.toISOString();
  if(typeof value==='string'&&Number.isFinite(Date.parse(value)))
    return new Date(value).toISOString();
  throw new Error('Invalid personal state timestamp');
}
function parseRow(
  row:Record<string,unknown>,scope:TrustedPersonalScope,kind:PersonalKind,
):StoredPersonalRecord{
  const value=PersonalValueSchema.parse(row.value_json);
  if(value.kind!==kind||row.kind!==kind
    ||row.actor_id!==scope.actorId||row.subject_id!==scope.subjectId
    ||row.data_mode!==value.dataMode
    ||typeof row.item_id!=='string'||!Ref.safeParse(row.item_id).success)
    throw new PersonalStateDenied();
  const version=Number(row.version);
  if(!Number.isSafeInteger(version)||version<1)throw new Error('Invalid version');
  return {
    actorId:scope.actorId,subjectId:scope.subjectId,
    kind,itemId:row.item_id,version,value,updatedAt:iso(row.updated_at),
  };
}
function validateValue(value:unknown):PersonalRecordValue {
  const parsed=PersonalValueSchema.parse(value);
  if(Buffer.byteLength(JSON.stringify(parsed),'utf8')>8192)
    throw new Error('Personal record too large');
  if(parsed.kind==='EXPERIENCE'&&parsed.startedOn&&parsed.endedOn
    &&parsed.endedOn<parsed.startedOn)
    throw new Error('Invalid experience dates');
  return parsed;
}

/**
 * Durable, actor-owned personal records under one selected demo subject.
 * A SharingGrant authorizes browsing a demo subject, never editing its owner's
 * records: ALL mutations target only the verified actor's private namespace.
 * Grant access is rechecked under a row lock for every operation; revoke's
 * UPDATE cannot race a transaction into committing after a revoked grant.
 */
export class PostgresPersonalStateStore {
  constructor(
    private readonly pool:ReviewerSqlPool,
    private readonly consent?:PersonalDataConsentVerifier,
  ){}

  private async withGrant<T>(
    scope:TrustedPersonalScope,kind:PersonalKind,
    work:(c:ReviewerSqlConnection)=>Promise<T>,
  ):Promise<T>{
    const actor=Key.parse(scope.actorId);
    const subject=SubjectAliasSchema.parse(scope.subjectId);
    const version=GrantVersion.parse(scope.grantVersion);
    const k=Kind.parse(kind);
    const c=await this.pool.connect();
    let started=false;
    try{
      await c.query('BEGIN');started=true;
      await c.query("SET LOCAL statement_timeout = '5s'");
      const grant=await c.query(`
        SELECT actor_id,subject_id,version FROM api_sharing_grants
        WHERE actor_id=$1 AND subject_id=$2 AND version=$3
          AND revoked_at IS NULL AND expires_at>clock_timestamp()
          AND $4=ANY(allowed_sections)
        FOR SHARE`,[actor,subject,version,Section[k]]);
      if(grant.rows.length!==1||grant.rows[0]?.actor_id!==actor
        ||grant.rows[0]?.subject_id!==subject||grant.rows[0]?.version!==version)
        throw new PersonalStateDenied();
      const result=await work(c);
      await c.query('COMMIT');started=false;
      return result;
    }catch(error){
      if(started)try{await c.query('ROLLBACK');}catch{/* fail closed */}
      throw error;
    }finally{c.release();}
  }

  private async verifyPrivate(
    scope:TrustedPersonalScope,value:PersonalRecordValue,
    operation:'READ'|'WRITE',
  ):Promise<void>{
    if(value.dataMode==='SYNTHETIC')return;
    let permitted=false;
    try{permitted=await this.consent?.mayProcess({
      actorId:scope.actorId,subjectId:scope.subjectId,
      kind:value.kind,operation,
    })??false;}catch{/* deny on consent ledger outage */}
    if(!permitted)throw new PersonalStateDenied();
  }

  async create(input:{
    scope:TrustedPersonalScope;itemId:string;value:unknown;
  }):Promise<StoredPersonalRecord>{
    const id=Ref.parse(input.itemId),value=validateValue(input.value);
    await this.verifyPrivate(input.scope,value,'WRITE');
    return this.withGrant(input.scope,value.kind,async c=>{
      const at=new Date().toISOString();
      const inserted=await c.query(`
        INSERT INTO api_personal_records
          (actor_id,subject_id,kind,item_id,value_json,data_mode,version,updated_at)
        VALUES($1,$2,$3,$4,$5::jsonb,$6,1,$7)
        ON CONFLICT(actor_id,subject_id,kind,item_id) DO NOTHING
        RETURNING actor_id,subject_id,kind,item_id,value_json,data_mode,version,updated_at`,[
        input.scope.actorId,input.scope.subjectId,value.kind,id,
        JSON.stringify(value),value.dataMode,at,
      ]);
      if(inserted.rows.length!==1)throw new PersonalStateConflict();
      const rec=parseRow(inserted.rows[0]!,input.scope,value.kind);
      await this.audit(c,rec,'CREATED');
      return rec;
    });
  }

  async read(input:{
    scope:TrustedPersonalScope;kind:PersonalKind;itemId:string;
  }):Promise<StoredPersonalRecord|null>{
    const kind=Kind.parse(input.kind),id=Ref.parse(input.itemId);
    return this.withGrant(input.scope,kind,async c=>{
      const found=await c.query(`
        SELECT actor_id,subject_id,kind,item_id,value_json,data_mode,version,updated_at
        FROM api_personal_records WHERE actor_id=$1 AND subject_id=$2
          AND kind=$3 AND item_id=$4 AND deleted_at IS NULL
        LIMIT 2`,[input.scope.actorId,input.scope.subjectId,kind,id]);
      if(found.rows.length>1)throw new PersonalStateDenied();
      if(!found.rows.length)return null;
      const rec=parseRow(found.rows[0]!,input.scope,kind);
      await this.verifyPrivate(input.scope,rec.value,'READ');
      return rec;
    });
  }

  async list(input:{
    scope:TrustedPersonalScope;kind:PersonalKind;afterId?:string;limit?:number;
  }):Promise<StoredPersonalRecord[]>{
    const kind=Kind.parse(input.kind);
    const after=input.afterId?Ref.parse(input.afterId):'';
    const limit=input.limit??50;
    if(!Number.isInteger(limit)||limit<1||limit>100)
      throw new Error('Invalid pagination limit');
    return this.withGrant(input.scope,kind,async c=>{
      const found=await c.query(`
        SELECT actor_id,subject_id,kind,item_id,value_json,data_mode,version,updated_at
        FROM api_personal_records WHERE actor_id=$1 AND subject_id=$2
          AND kind=$3 AND deleted_at IS NULL AND item_id>$4
        ORDER BY item_id ASC LIMIT $5`,[
        input.scope.actorId,input.scope.subjectId,kind,after,limit,
      ]);
      if(found.rows.length>limit)throw new PersonalStateDenied();
      const records=found.rows.map(row=>parseRow(row,input.scope,kind));
      for(const record of records)
        await this.verifyPrivate(input.scope,record.value,'READ');
      return records;
    });
  }

  async update(input:{
    scope:TrustedPersonalScope;itemId:string;
    expectedVersion:number;value:unknown;
  }):Promise<StoredPersonalRecord>{
    const id=Ref.parse(input.itemId),value=validateValue(input.value);
    const expected=this.expected(input.expectedVersion);
    await this.verifyPrivate(input.scope,value,'WRITE');
    return this.withGrant(input.scope,value.kind,async c=>{
      const at=new Date().toISOString();
      const updated=await c.query(`
        UPDATE api_personal_records
        SET value_json=$5::jsonb,data_mode=$6,version=version+1,updated_at=$7
        WHERE actor_id=$1 AND subject_id=$2 AND kind=$3 AND item_id=$4
          AND version=$8 AND deleted_at IS NULL
        RETURNING actor_id,subject_id,kind,item_id,value_json,data_mode,version,updated_at`,[
        input.scope.actorId,input.scope.subjectId,value.kind,id,
        JSON.stringify(value),value.dataMode,at,expected,
      ]);
      if(updated.rows.length!==1)throw new PersonalStateConflict();
      const rec=parseRow(updated.rows[0]!,input.scope,value.kind);
      if(rec.version!==expected+1)throw new PersonalStateConflict();
      await this.audit(c,rec,'UPDATED');
      return rec;
    });
  }

  async delete(input:{
    scope:TrustedPersonalScope;kind:PersonalKind;itemId:string;
    expectedVersion:number;
  }):Promise<{version:number}>{
    const kind=Kind.parse(input.kind),id=Ref.parse(input.itemId);
    const expected=this.expected(input.expectedVersion);
    // No direct deletion of another actor's or selected student's originals.
    return this.withGrant(input.scope,kind,async c=>{
      const existing=await c.query(`
        SELECT actor_id,subject_id,kind,item_id,value_json,data_mode,version,updated_at
        FROM api_personal_records WHERE actor_id=$1 AND subject_id=$2
          AND kind=$3 AND item_id=$4 AND version=$5 AND deleted_at IS NULL
        FOR UPDATE`,[input.scope.actorId,input.scope.subjectId,kind,id,expected]);
      if(existing.rows.length!==1)throw new PersonalStateConflict();
      const old=parseRow(existing.rows[0]!,input.scope,kind);
      await this.verifyPrivate(input.scope,old.value,'WRITE');
      const at=new Date().toISOString();
      const changed=await c.query(`
        UPDATE api_personal_records
        SET value_json='{}'::jsonb,version=version+1,
          deleted_at=$5,updated_at=$5
        WHERE actor_id=$1 AND subject_id=$2 AND kind=$3 AND item_id=$4
          AND version=$6 AND deleted_at IS NULL RETURNING version`,[
        input.scope.actorId,input.scope.subjectId,kind,id,at,expected,
      ]);
      const next=Number(changed.rows[0]?.version);
      if(changed.rows.length!==1||next!==expected+1)
        throw new PersonalStateConflict();
      await this.audit(c,{...old,version:next,updatedAt:at},'DELETED');
      return {version:next};
    });
  }

  private expected(v:number):number{
    if(!Number.isSafeInteger(v)||v<1)throw new Error('Invalid expectedVersion');
    return v;
  }
  private async audit(
    c:ReviewerSqlConnection,record:StoredPersonalRecord,
    action:'CREATED'|'UPDATED'|'DELETED',
  ):Promise<void>{
    await c.query(`
      INSERT INTO api_personal_events(
        event_id,actor_id,subject_id,kind,item_id,action,version,event_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[
      randomUUID(),record.actorId,record.subjectId,record.kind,
      record.itemId,action,record.version,record.updatedAt,
    ]);
  }
}
