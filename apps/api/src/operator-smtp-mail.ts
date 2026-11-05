/** Optional real SMTP-over-TLS school mailbox delivery.
 * Constructed only by the private operator; never loaded by public web code.
 * Requires an approved SMTP submission server and explicitly provisioned
 * credentials. No IO occurs at construction and errors reveal no email/code.
 */
import nodemailer from 'nodemailer';
import type {Transporter} from 'nodemailer';
import type {SchoolMailSender} from './modules/auth/school-mail-proof.js';

const Host=/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const Email=/^[a-z0-9._%+-]{1,64}@[a-z0-9.-]+\.[a-z]{2,63}$/;
const School=/^[a-z0-9._%+-]{1,64}@hufs\.ac\.kr$/;
const Code=/^[0-9]{8}$/;

export interface OperatorSmtpSettings {
  host:string;
  user:string;
  password:string;
  from:string;
  /** Inert offline seam. Real deployments omit this. */
  transport?:Pick<Transporter,'sendMail'>;
  now?:()=>Date;
}

export function createOperatorSmtpMailSender(settings:OperatorSmtpSettings):SchoolMailSender{
  if(!settings||!Host.test(settings.host)||!Email.test(settings.from)
    ||settings.from.endsWith('@hufs.ac.kr')
    ||typeof settings.user!=='string'||settings.user.length<3||settings.user.length>256
    ||typeof settings.password!=='string'||settings.password.length<8
    ||settings.password.length>1024||/[\r\n]/.test(settings.password))
    throw new Error('Operator SMTP configuration refused');
  const client=settings.transport??nodemailer.createTransport({
    host:settings.host,port:465,secure:true,requireTLS:true,
    auth:{user:settings.user,pass:settings.password},
    connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000,
    tls:{servername:settings.host,rejectUnauthorized:true,minVersion:'TLSv1.2'},
    logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true,
  });
  const clock=settings.now??(()=>new Date());
  return {
    async send(input){
      const now=clock().getTime(),expiry=Date.parse(input.expiresAt);
      if(!School.test(input.schoolEmail)||!Code.test(input.code)
        ||!Number.isFinite(now)||!Number.isFinite(expiry)
        ||expiry<=now||expiry>now+10*60_000)
        throw new Error('School mail delivery refused');
      try{
        const result=await client.sendMail({
          to:input.schoolEmail,from:settings.from,
          subject:'HUFS One AI - 이메일 소유 확인',
          text:'HUFS One AI 독립 팀 프로젝트 이메일 확인 코드: '+
            input.code+'\n10분 이내에 입력해 주세요. 요청하지 않았다면 무시하세요.',
          envelope:{from:settings.from,to:input.schoolEmail},
          attachments:[],
        });
        const accepted=(result as {accepted?:unknown;rejected?:unknown});
        if(!Array.isArray(accepted.accepted)||accepted.accepted.length!==1
          ||accepted.accepted[0]!==input.schoolEmail
          ||!Array.isArray(accepted.rejected)||accepted.rejected.length!==0)
          throw new Error('Delivery not accepted');
      }catch{
        throw new Error('School mail delivery refused');
      }
    }
  };
}
