import {z} from 'zod';
import {RetrievalEnvelopeVNextSchema,SourceSpanVNextSchema} from '@hufs-one/contracts';
import type {RetrievalEnvelopeVNext} from '@hufs-one/contracts';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import type {TemporalPolicy,TemporalResult} from './revision-ledger.js';
import {temporalPermissionPolicyVersion} from './revision-ledger.js';
const Iso=z.iso.datetime({offset:true});
const Ref=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const Row=z.object({
  source_id:Ref,
  revision_id:Ref,
  paragraph_id:Ref,
  paragraph_text:z.string().min(1).max(20_000),
  score:z.coerce.number().int().min(1).max(20),
});
type EmptyReason='NO_EVIDENCE'|'STALE'|'CONFLICT'|'BLOCKED_RIGHTS'|'UNKNOWN';
const ConflictResult=z.object({confirmed_conflict:z.boolean()});
const EmptyFlags=z.object({
  blocked_rights:z.boolean(),unknown:z.boolean(),stale:z.boolean(),
});
function empty(policy:TemporalPolicy,state:EmptyReason='NO_EVIDENCE'):TemporalResult{
  return {envelope:RetrievalEnvelopeVNextSchema.parse({
    queryVersion:'query-1',asOf:policy.asOf,
    sourceRevisionIds:[],permissionPolicyVersion:temporalPermissionPolicyVersion(policy),
    retrievalConfigVersion:'pg-lexical-v1',
    retrievalState:state,evidence:[],
  }),hits:[]};
}
function terms(query:string):string[]{
  return [...new Set(query.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[])];
}
/** SQL only: no connections, DDL or network are opened until an operator supplies a pool. */
export class PostgresTemporalEvidenceReader{
  constructor(private readonly pool:ReviewerSqlPool){}
  async retrieve(input:TemporalPolicy):Promise<TemporalResult>{
    const asOf=Iso.parse(input.asOf);
    const permissionPolicyVersion=temporalPermissionPolicyVersion(input);
    const limit=input.topK??12;
    if(!Number.isInteger(limit)||limit<1||limit>12)
      throw new Error('topK outside 1..12');
    if(input.query.length>250||!input.permissionRefs.size)return empty(input);
    const keywords=terms(input.query);
    if(!keywords.length||keywords.length>20)return empty(input);
    const grants=[...input.permissionRefs].map(x=>Ref.parse(x));
    if(grants.length>100)throw new Error('Permission scope too broad');
    const sources=input.sourceIds?[...input.sourceIds].map(x=>Ref.parse(x)):null;
    if(sources&&sources.length>100)throw new Error('Source scope too broad');
    const cohort=input.cohort;
    if(cohort!==undefined&&(!Number.isInteger(cohort)||cohort<1950||cohort>2200))
      throw new Error('Invalid authorized cohort');
    const majors=input.majors??(input.majorCode?[{code:input.majorCode,role:'' as const}]:[]);
    if(majors.length>16||majors.some(m=>!Ref.safeParse(m.code).success
      ||!['PRIMARY','DOUBLE','MINOR',''].includes(m.role)))
      throw new Error('Invalid trusted major/role scope');
    const college=input.college===undefined?null:Ref.parse(input.college);
    const enrollment=input.enrollmentState===undefined?null:Ref.parse(input.enrollmentState);
    const admission=input.admissionType===undefined?null:Ref.parse(input.admissionType);
    const gradTerm=input.graduationTerm===undefined?null:
      z.string().regex(/^(19|20|21|22)\d{2}-[12]$/).parse(input.graduationTerm);
    // CRITICAL: latest revision PER SOURCE is selected at asOf BEFORE
    // state, rights or textual filters. An unreviewed/cancelled new revision
    // must shadow the previous ACTIVE one. Never use WHERE status='ACTIVE'
    // in the latest-version CTE.
    const sql=`WITH latest AS (
      SELECT DISTINCT ON (r.source_id)
        r.source_id,r.revision_id,r.permission_ref,r.source_class,
        r.provenance,r.status,r.change_kind,r.last_verified_at,r.valid_from,r.valid_until,
        r.scope_campuses,r.scope_majors,r.scope_colleges,
        r.scope_major_roles,r.scope_admission_types,r.scope_enrollment_states,
        r.scope_graduation_terms,r.cohort_min,r.cohort_max
      FROM source_effective_revisions_vnext r
      WHERE r.fetched_at <= $1::timestamptz
        AND (r.published_at IS NULL OR r.published_at <= $1::timestamptz)
      ORDER BY r.source_id,r.fetched_at DESC,r.revision_id DESC
    )
    SELECT l.source_id,l.revision_id,p.paragraph_id,
      p.paragraph_text,score.score
    FROM latest l
    INNER JOIN source_paragraphs_vnext p ON p.revision_id=l.revision_id
    CROSS JOIN LATERAL (
      SELECT count(*)::integer AS score
      FROM unnest($13::text[]) AS token(term)
      WHERE position(token.term IN lower(normalize(p.paragraph_text,NFKC)))>0
    ) AS score
    WHERE l.permission_ref=ANY($2::text[])
      AND ($3::text[] IS NULL OR l.source_id=ANY($3::text[]))
      AND l.source_class!='RESEARCH_REFERENCE_ONLY'
      AND l.provenance!='RESEARCH_ONLY'
      AND l.status='ACTIVE' AND l.change_kind!='UNKNOWN'
      AND l.last_verified_at<=$1::timestamptz
      AND (l.valid_from IS NULL OR l.valid_from<=$1::timestamptz)
      AND (l.valid_until IS NULL OR l.valid_until>$1::timestamptz)
      AND (l.scope_campuses IS NULL OR $4::text=ANY(l.scope_campuses))
      AND (
        (l.scope_majors IS NULL AND l.scope_major_roles IS NULL)
        OR EXISTS (
          SELECT 1 FROM jsonb_to_recordset($12::jsonb) AS academic_major(code text,role text)
          WHERE (l.scope_majors IS NULL OR academic_major.code=ANY(l.scope_majors))
            AND (l.scope_major_roles IS NULL OR academic_major.role=ANY(l.scope_major_roles))
        )
        OR (l.scope_major_roles IS NULL AND l.scope_majors IS NOT NULL
          AND $5::text=ANY(l.scope_majors))
      )
      AND (l.scope_colleges IS NULL OR $7::text=ANY(l.scope_colleges))
      AND (l.scope_enrollment_states IS NULL OR $8::text=ANY(l.scope_enrollment_states))
      AND (l.scope_admission_types IS NULL OR $9::text=ANY(l.scope_admission_types))
      AND (l.scope_graduation_terms IS NULL OR (
        $11::boolean IS TRUE AND $10::text=ANY(l.scope_graduation_terms)))
      AND (l.cohort_min IS NULL OR $6::integer>=l.cohort_min)
      AND (l.cohort_max IS NULL OR $6::integer<=l.cohort_max)
      AND score.score>0
    ORDER BY score.score DESC,l.source_id,l.revision_id,p.paragraph_id
    LIMIT $14::integer`;
    // No untrusted SQL/error details may be returned in an empty envelope.
    // State detection repeats ALL actor-grant and applicability predicates.
    // Matching a historical text phrase is used solely to classify its latest
    // revision; no historical quote is ever selected into the response.
    // CONFLICT is never inferred from mere keyword overlap: a separate,
    // immutable, independently human-reviewed decision must prove it.
    const classifySql=`WITH latest AS (
      SELECT DISTINCT ON (r.source_id)
        r.source_id,r.revision_id,r.permission_ref,r.source_class,
        r.provenance,r.status,r.change_kind,r.fetched_at,r.last_verified_at,
        r.valid_from,r.valid_until,r.scope_campuses,r.scope_majors,r.scope_colleges,
        r.scope_major_roles,r.scope_admission_types,r.scope_enrollment_states,
        r.scope_graduation_terms,r.cohort_min,r.cohort_max
      FROM source_effective_revisions_vnext r
      WHERE r.fetched_at<=$1::timestamptz
        AND (r.published_at IS NULL OR r.published_at<=$1::timestamptz)
      ORDER BY r.source_id,r.fetched_at DESC,r.revision_id DESC
    ), scoped AS (
      SELECT l.status,l.change_kind,l.last_verified_at,l.valid_from,l.valid_until
      FROM latest l
      WHERE l.permission_ref=ANY($2::text[])
        AND ($3::text[] IS NULL OR l.source_id=ANY($3::text[]))
        AND l.source_class!='RESEARCH_REFERENCE_ONLY'
        AND l.provenance!='RESEARCH_ONLY'
        AND (l.scope_campuses IS NULL OR $4::text=ANY(l.scope_campuses))
        AND (
          (l.scope_majors IS NULL AND l.scope_major_roles IS NULL)
          OR EXISTS (
            SELECT 1 FROM jsonb_to_recordset($12::jsonb) AS academic_major(code text,role text)
            WHERE (l.scope_majors IS NULL OR academic_major.code=ANY(l.scope_majors))
              AND (l.scope_major_roles IS NULL OR academic_major.role=ANY(l.scope_major_roles))
          )
          OR (l.scope_major_roles IS NULL AND l.scope_majors IS NOT NULL
            AND $5::text=ANY(l.scope_majors))
        )
        AND (l.scope_colleges IS NULL OR $7::text=ANY(l.scope_colleges))
        AND (l.scope_enrollment_states IS NULL OR $8::text=ANY(l.scope_enrollment_states))
        AND (l.scope_admission_types IS NULL OR $9::text=ANY(l.scope_admission_types))
        AND (l.scope_graduation_terms IS NULL OR (
          $11::boolean IS TRUE AND $10::text=ANY(l.scope_graduation_terms)))
        AND (l.cohort_min IS NULL OR $6::integer>=l.cohort_min)
        AND (l.cohort_max IS NULL OR $6::integer<=l.cohort_max)
        AND EXISTS (
          SELECT 1 FROM source_effective_revisions_vnext h
          JOIN source_paragraphs_vnext p ON p.revision_id=h.revision_id
          WHERE h.source_id=l.source_id
            AND h.fetched_at<=$1::timestamptz
            AND (h.published_at IS NULL OR h.published_at<=$1::timestamptz)
            AND EXISTS (
              SELECT 1 FROM unnest($13::text[]) AS token(term)
              WHERE position(token.term IN lower(normalize(p.paragraph_text,NFKC)))>0
            )
        )
    )
    SELECT COALESCE(bool_or(status='BLOCKED_RIGHTS'),false) AS blocked_rights,
      COALESCE(bool_or(change_kind='UNKNOWN'),false) AS unknown,
      COALESCE(bool_or(status!='ACTIVE'
        OR last_verified_at IS NULL OR last_verified_at>$1::timestamptz
        OR (valid_from IS NOT NULL AND valid_from>$1::timestamptz)
        OR (valid_until IS NOT NULL AND valid_until<=$1::timestamptz)),false)
        AS stale
    FROM scoped`;
    // A confirmed dispute must override READY even when topK selects only
    // one side. Both revisions must be the newest verified, currently
    // authorized, query-matching evidence at the requested historical asOf.
    // Human-reviewed RESOLVED decisions supersede earlier disputes.
    const conflictSql=`WITH latest AS (
      SELECT DISTINCT ON (r.source_id)
        r.source_id,r.revision_id,r.permission_ref,r.source_class,
        r.provenance,r.status,r.change_kind,r.last_verified_at,
        r.valid_from,r.valid_until,r.scope_campuses,r.scope_majors,r.scope_colleges,
        r.scope_major_roles,r.scope_admission_types,r.scope_enrollment_states,
        r.scope_graduation_terms,r.cohort_min,r.cohort_max
      FROM source_effective_revisions_vnext r
      WHERE r.fetched_at<=$1::timestamptz
        AND (r.published_at IS NULL OR r.published_at<=$1::timestamptz)
      ORDER BY r.source_id,r.fetched_at DESC,r.revision_id DESC
    ), candidates AS (
      SELECT l.revision_id
      FROM latest l
      WHERE l.permission_ref=ANY($2::text[])
        AND ($3::text[] IS NULL OR l.source_id=ANY($3::text[]))
        AND l.source_class!='RESEARCH_REFERENCE_ONLY'
        AND l.provenance!='RESEARCH_ONLY'
        AND l.status='ACTIVE' AND l.change_kind!='UNKNOWN'
        AND l.last_verified_at<=$1::timestamptz
        AND (l.valid_from IS NULL OR l.valid_from<=$1::timestamptz)
        AND (l.valid_until IS NULL OR l.valid_until>$1::timestamptz)
        AND (l.scope_campuses IS NULL OR $4::text=ANY(l.scope_campuses))
        AND (
          (l.scope_majors IS NULL AND l.scope_major_roles IS NULL)
          OR EXISTS (
            SELECT 1 FROM jsonb_to_recordset($12::jsonb) AS academic_major(code text,role text)
            WHERE (l.scope_majors IS NULL OR academic_major.code=ANY(l.scope_majors))
              AND (l.scope_major_roles IS NULL OR academic_major.role=ANY(l.scope_major_roles))
          )
          OR (l.scope_major_roles IS NULL AND l.scope_majors IS NOT NULL
            AND $5::text=ANY(l.scope_majors))
        )
        AND (l.scope_colleges IS NULL OR $7::text=ANY(l.scope_colleges))
        AND (l.scope_enrollment_states IS NULL OR $8::text=ANY(l.scope_enrollment_states))
        AND (l.scope_admission_types IS NULL OR $9::text=ANY(l.scope_admission_types))
        AND (l.scope_graduation_terms IS NULL OR (
          $11::boolean IS TRUE AND $10::text=ANY(l.scope_graduation_terms)))
        AND (l.cohort_min IS NULL OR $6::integer>=l.cohort_min)
        AND (l.cohort_max IS NULL OR $6::integer<=l.cohort_max)
        AND EXISTS (
          SELECT 1 FROM source_paragraphs_vnext p
          WHERE p.revision_id=l.revision_id AND EXISTS (
            SELECT 1 FROM unnest($13::text[]) AS token(term)
            WHERE position(token.term IN lower(normalize(p.paragraph_text,NFKC)))>0
          )
        )
    ), decisions AS (
      SELECT DISTINCT ON (d.left_revision_id,d.right_revision_id)
        d.left_revision_id,d.right_revision_id,d.disposition
      FROM source_conflict_decisions_vnext d
      WHERE d.reviewed_at<=$1::timestamptz
      ORDER BY d.left_revision_id,d.right_revision_id,
        d.reviewed_at DESC,d.decision_id DESC
    )
    SELECT EXISTS (
      SELECT 1 FROM decisions d
      WHERE d.disposition='CONFLICT'
        AND d.left_revision_id IN (SELECT revision_id FROM candidates)
        AND d.right_revision_id IN (SELECT revision_id FROM candidates)
    ) AS confirmed_conflict`;
    // Each evidence read, negative-state classification and human-reviewed
    // conflict decision MUST see the same database snapshot. Under the
    // default READ COMMITTED isolation, a revision/cancellation may appear
    // between statements and cause a stale quote or incorrect conflict.
    const connection=await this.pool.connect();
    let transactionOpen=false;
    try {
      await connection.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      transactionOpen=true;
      const retrieval:TemporalResult=await (async()=>{
      const params=[
        asOf,grants,sources,input.campus??null,input.majorCode??null,
        cohort??null,college,enrollment,admission,gradTerm,
        input.graduationTermVerified===true,JSON.stringify(majors),keywords,limit,
      ] as const;
      const result=await connection.query(sql,params);
      if(result.rows.length>limit)throw new Error('Provider violated retrieval topK');
      const matches=result.rows.map(x=>Row.parse(x));
      if(!matches.length){
        const stateRows=await connection.query(classifySql,params.slice(0,13));
        if(stateRows.rows.length>1)throw new Error('Invalid retrieval state provider');
        if(!stateRows.rows.length)return empty(input);
        const flags=EmptyFlags.parse(stateRows.rows[0]);
        return empty(input,flags.blocked_rights?'BLOCKED_RIGHTS'
          :flags.unknown?'UNKNOWN':flags.stale?'STALE':'NO_EVIDENCE');
      }
      const checkedConflicts=await connection.query(conflictSql,params.slice(0,13));
      if(checkedConflicts.rows.length!==1)
        throw new Error('Invalid reviewed conflict provider');
      const dispute=ConflictResult.parse(checkedConflicts.rows[0]);
      if(dispute.confirmed_conflict)return empty(input,'CONFLICT');
      const evidence=matches.map(x=>SourceSpanVNextSchema.parse({
        kind:'TEXT',sourceRevisionId:x.revision_id,
        paragraphId:x.paragraph_id,startCodePoint:0,
        endCodePoint:Array.from(x.paragraph_text).length,quote:x.paragraph_text,
      }));
      const revisionIds=[...new Set(matches.map(x=>x.revision_id))];
      const envelope:RetrievalEnvelopeVNext=RetrievalEnvelopeVNextSchema.parse({
        queryVersion:'query-1',asOf,
        sourceRevisionIds:revisionIds,
        permissionPolicyVersion,
        retrievalConfigVersion:'pg-lexical-v1',
        retrievalState:'READY',evidence,
      });
      return {envelope,hits:matches.map(x=>({
        sourceId:x.source_id,revisionId:x.revision_id,
        paragraphId:x.paragraph_id,quote:x.paragraph_text,score:x.score,
      }))};
      })();
      // Do not return a READY envelope until the snapshot safely commits.
      await connection.query('COMMIT');
      transactionOpen=false;
      return retrieval;
    }catch{
      if(transactionOpen){
        try{await connection.query('ROLLBACK');}
        catch{/* Preserve the retrieval error without leaking SQL details. */}
      }
      // Fail closed on malformed database rows, stale permissions and SQL errors.
      // The HTTP layer maps this to PROVIDER_UNAVAILABLE, never public raw SQL.
      throw new Error('Temporal retrieval unavailable');
    }finally{connection.release();}
  }
}
