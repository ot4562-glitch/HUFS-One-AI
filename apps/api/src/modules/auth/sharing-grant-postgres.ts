import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {SharingGrantSchema,SubjectAliasSchema} from '@hufs-one/contracts';
import type {SharingGrant,SubjectAlias} from '@hufs-one/contracts';
import type {ReviewerSqlPool} from './reviewer-postgres.js';

const Iso=z.iso.datetime({offset:true});
const Token=z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_.:@-]+$/);
const Version=z.string().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/);
export interface SharingGrantAdminAuthority {
  /** Separate from login. Confirm explicit section, display/recording consent. */
  mayIssue(input:{
    operatorId:string;grant:SharingGrant;consentRef:string;
    displayNameConsentRef?:string;recordingConsentRef?:string;
  }):Promise<boolean>;
  /** Operator must have revocation rights. No fresh owner consent needed. */
  mayRevoke(input:{
    operatorId:string;actorId:string;subjectId:SubjectAlias;reason:string;
  }):Promise<boolean>;
}
export class SharingGrantWriteError extends Error {
  constructor(){super('Sharing grant operation unavailable or not authorized');}
}
/**
 * Privileged, offline/admin-only writer. NOT exposed through public Fastify.
 * All owner consent is separately verified by an injected authority, not a
 * caller-controlled checkbox, and each mutation records an audit event.
 */
export class PostgresSharingGrantAdmin {
  constructor(
    private readonly pool:ReviewerSqlPool,
    private readonly authority:SharingGrantAdminAuthority,
    private readonly now:()=>string=()=>new Date().toISOString(),
  ){}

  async issue(input:{
    grant:unknown;operatorId:string;consentRef:string;
    displayNameConsentRef?:string;recordingConsentRef?:string;
  }):Promise<void>{
    const g=SharingGrantSchema.parse(input.grant);
    const operator=Token.parse(input.operatorId),consent=Token.parse(input.consentRef);
    const displayNameRef=input.displayNameConsentRef
      ?Token.parse(input.displayNameConsentRef):null;
    const recordingRef=input.recordingConsentRef
      ?Token.parse(input.recordingConsentRef):null;
    const at=Iso.parse(this.now());
    if(g.revokedAt||!g.allowedSections.length
      ||new Set(g.allowedSections).size!==g.allowedSections.length
      ||Date.parse(g.expiresAt)<=Date.parse(at)
      ||(g.displayNameAllowed&&!displayNameRef)
      ||(g.recordingAllowed&&!recordingRef))
      throw new SharingGrantWriteError();
    // Always reject unavailable/negative independent operator authorization.
    let approved=false;
    try{approved=await this.authority.mayIssue({
      operatorId:operator,grant:g,consentRef:consent,
      ...(displayNameRef?{displayNameConsentRef:displayNameRef}:{}),
      ...(recordingRef?{recordingConsentRef:recordingRef}:{}),
    });}catch{/* deny closed */}
    if(!approved)throw new SharingGrantWriteError();

    const c=await this.pool.connect();
    let active=false;
    try{
      await c.query('BEGIN');active=true;
      await c.query("SET LOCAL statement_timeout = '5s'");
      const added=await c.query(`INSERT INTO api_sharing_grants(
        grant_id,actor_id,subject_id,allowed_sections,
        display_name_allowed,recording_allowed,version,
        consent_ref,display_name_consent_ref,recording_consent_ref,
        approved_by,approved_at,expires_at,revoked_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL)
        ON CONFLICT(actor_id,subject_id) DO NOTHING RETURNING grant_id`,[
        g.grantId,g.actorId,g.demoSubjectId,g.allowedSections,
        g.displayNameAllowed,g.recordingAllowed,g.version,
        consent,displayNameRef,recordingRef,operator,at,g.expiresAt,
      ]);
      if(added.rows.length!==1)throw new SharingGrantWriteError();
      await c.query(`INSERT INTO api_grant_events(
        event_id,grant_id,actor_id,subject_id,
        action,previous_version,next_version,operator_id,consent_ref,event_at)
        VALUES($1,$2,$3,$4,'ISSUED',NULL,$5,$6,$7,$8)`,[
        randomUUID(),g.grantId,g.actorId,g.demoSubjectId,
        g.version,operator,consent,at,
      ]);
      await c.query('COMMIT');active=false;
    }catch{
      if(active)try{await c.query('ROLLBACK');}catch{/* deny closed */}
      throw new SharingGrantWriteError();
    }finally{c.release();}
  }

  async revoke(input:{
    operatorId:string;actorId:string;subjectId:SubjectAlias;
    expectedVersion:string;newVersion:string;reason:'OWNER_REVOKED'|'OPERATOR_REVOKED';
  }):Promise<void>{
    const operator=Token.parse(input.operatorId),actor=Token.parse(input.actorId);
    const subject=SubjectAliasSchema.parse(input.subjectId);
    const expected=Version.parse(input.expectedVersion),next=Version.parse(input.newVersion);
    if(next===expected)throw new SharingGrantWriteError();
    let approved=false;
    try{approved=await this.authority.mayRevoke({
      operatorId:operator,actorId:actor,subjectId:subject,reason:input.reason,
    });}catch{/* deny closed */}
    if(!approved)throw new SharingGrantWriteError();
    const at=Iso.parse(this.now());
    const c=await this.pool.connect();
    let active=false;
    try{
      await c.query('BEGIN');active=true;
      await c.query("SET LOCAL statement_timeout = '5s'");
      const updated=await c.query(`UPDATE api_sharing_grants
        SET revoked_at=$4,version=$5
        WHERE actor_id=$1 AND subject_id=$2 AND version=$3
          AND revoked_at IS NULL RETURNING grant_id`,[
        actor,subject,expected,at,next,
      ]);
      if(updated.rows.length!==1||typeof updated.rows[0]?.grant_id!=='string')
        throw new SharingGrantWriteError();
      await c.query(`INSERT INTO api_grant_events(
        event_id,grant_id,actor_id,subject_id,
        action,previous_version,next_version,operator_id,consent_ref,event_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9)`,[
        randomUUID(),updated.rows[0].grant_id,actor,subject,
        input.reason,expected,next,operator,at,
      ]);
      await c.query('COMMIT');active=false;
    }catch{
      if(active)try{await c.query('ROLLBACK');}catch{/* deny closed */}
      throw new SharingGrantWriteError();
    }finally{c.release();}
  }
}
