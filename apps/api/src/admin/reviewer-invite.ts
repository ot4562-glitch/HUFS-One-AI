import pg from 'pg';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {issueReviewerInvitation} from '../modules/auth/reviewer.js';
import {PostgresReviewerAccessStore} from '../modules/auth/reviewer-postgres.js';

const value=(name:string):string=>{
  const v=process.env[name];
  if(!v?.trim())throw new Error('Required operator setting missing: '+name);
  return v.trim();
};

async function run():Promise<void>{
  const operation=process.argv[2];
  if(operation!=='issue'&&operation!=='revoke')
    throw new Error('Usage: npm run admin:reviewer -- issue|revoke (operator-only)');
  if(process.env.REVIEWER_OPERATOR_APPROVED!=='yes')
    throw new Error('Production invitation operation needs explicit operator approval');
  const dbUrl=value('REVIEWER_DATABASE_URL');
  const dbParsed=new URL(dbUrl);
  if(!['localhost','127.0.0.1','::1'].includes(dbParsed.hostname)
    &&!['verify-ca','verify-full'].includes(dbParsed.searchParams.get('sslmode')??''))
    throw new Error('Remote PostgreSQL requires verified TLS');
  const pool=new pg.Pool({connectionString:dbUrl,max:2,connectionTimeoutMillis:5000,
    idleTimeoutMillis:3000});
  try{
    const access=new PostgresReviewerAccessStore(pool);
    if(operation==='revoke') {
      const invitationId=value('REVIEWER_INVITE_ID');
      if(!/^[a-zA-Z0-9_-]{8,100}$/.test(invitationId))throw new Error('Invalid invite id');
      const done=await access.revoke(invitationId,new Date().toISOString());
      if(!done)throw new Error('No matching invitation');
      process.stdout.write('REVIEWER_INVITATION_REVOKED\n');
      return;
    }
    const origin=value('REVIEWER_ORIGIN');
    const parsed=new URL(origin);
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search
      ||parsed.hash||parsed.origin!==origin)
      throw new Error('REVIEWER_ORIGIN must be an exact HTTPS origin');
    const issued=await issueReviewerInvitation(access,{
      recipientEmail:value('REVIEWER_RECIPIENT_EMAIL'),
      startsAt:value('REVIEWER_START_UTC'),
      endsAt:value('REVIEWER_END_UTC'),
      label:value('REVIEWER_LABEL'),
    },{now:new Date().toISOString()});
    // Protected by the repository's local_only gitignore, but files must
    // ALSO be excluded from cloud sync/backups and protected with OS ACLs.
    const root=resolve(process.cwd());
    const privateDir=join(root,'local_only','reviewer_invitations');
    const output=join(privateDir,issued.invitationId+'.json');
    const payload={
      invitationId:issued.invitationId,
      recipientEmail:issued.recipientEmail,
      startsAt:issued.startsAt,
      endsAt:issued.endsAt,
      accessUrl:origin+'/reviewer/invite#code='+issued.enrollmentCode,
      label:value('REVIEWER_LABEL'),
    };
    try{
      await mkdir(privateDir,{recursive:true,mode:0o700});
      await writeFile(output,JSON.stringify(payload,null,2)+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
    }catch{
      // Never leave a live invite if private delivery preparation failed.
      await access.revoke(issued.invitationId,new Date().toISOString());
      throw new Error('Invitation delivery preparation failed');
    }
    process.stdout.write('REVIEWER_INVITATION_PRIVATE_FILE_CREATED\n');
  }finally{await pool.end();}
}

await run().catch(()=>{
  // No raw tokens, personal recipient addresses or database URLs in stderr.
  process.stderr.write('Reviewer operator command failed; check secure local operator diagnostics.\n');
  process.exitCode=1;
});
