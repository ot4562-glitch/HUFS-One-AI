import {describe,it,expect,vi} from 'vitest';
import {createOperatorSmtpMailSender} from '../../apps/api/src/operator-smtp-mail.js';

const now='2026-11-04T00:00:00Z';
const address='synthetic@hufs.ac.kr';
function setup(){
  const sendMail=vi.fn(async(_message:Record<string,unknown>)=>({accepted:[address],rejected:[]}));
  const sender=createOperatorSmtpMailSender({
    host:'smtp.example.test',user:'operator@team.test',
    password:'[REDACTED_SECRET]',from:'no-reply@team.test',
    transport:{sendMail} as never,now:()=>new Date(now),
  });
  return {sender,sendMail};
}

describe('operator-only secure SMTP submission',()=>{
  it('never contacts the provider until a valid school-mail proof is issued',async()=>{
    const f=setup();
    expect(f.sendMail).not.toHaveBeenCalled();
    await f.sender.send({schoolEmail:address,code:'12345678',
      expiresAt:'2026-11-04T00:10:00Z'});
    expect(f.sendMail).toHaveBeenCalledTimes(1);
    const mail=f.sendMail.mock.calls[0]?.[0] as Record<string,unknown>;
    expect(mail.to).toBe(address);
    expect(mail.from).toBe('no-reply@team.test');
    expect(mail.attachments).toEqual([]);
    expect(mail.text).toContain('12345678');
  });

  it('refuses other domains, malformed codes or expired/long-lived challenges',async()=>{
    const f=setup();
    for(const input of [
      {schoolEmail:'other@example.org',code:'12345678',expiresAt:'2026-11-04T00:10:00Z'},
      {schoolEmail:address,code:'bad',expiresAt:'2026-11-04T00:10:00Z'},
      {schoolEmail:address,code:'12345678',expiresAt:'2026-11-04T00:00:00Z'},
      {schoolEmail:address,code:'12345678',expiresAt:'2026-11-05T00:00:00Z'},
    ])await expect(f.sender.send(input)).rejects.toThrow();
    expect(f.sendMail).not.toHaveBeenCalled();
  });
});
