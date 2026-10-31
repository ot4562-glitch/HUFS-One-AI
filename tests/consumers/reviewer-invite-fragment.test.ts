import {describe,expect,it} from 'vitest';
import {
  consumeReviewerInviteFragment,
} from '../../apps/web/src/integrations/reviewer-invite-fragment.js';
import type {
  InviteBrowserPort,
} from '../../apps/web/src/integrations/reviewer-invite-fragment.js';

const code='A'.repeat(43);
const origin='https://synthetic.invalid';

function browser(config:Partial<InviteBrowserPort['location']>={}) {
  const calls:unknown[][]=[];
  const port:InviteBrowserPort={
    location:{
      origin,pathName:'/reviewer/invite',
      pathname:'/reviewer/invite',search:'',hash:'#code='+code,...config,
    } as InviteBrowserPort['location'],
    history:{replaceState:(...args:unknown[])=>{calls.push(args);}},
  };
  return {port,calls};
}

describe('REVIEWER invite URL fragment (never a session or standalone permission)',()=>{
  it('returns exactly the approved 43-char code after synchronous URL removal',()=>{
    const {port,calls}=browser();
    expect(consumeReviewerInviteFragment(port,origin)).toBe(code);
    expect(calls).toEqual([[null,'','/reviewer/invite']]);
  });

  it('clears query plus hash before handing out a fragment credential',()=>{
    const {port,calls}=browser({search:'?next=https%3A%2F%2Fevil.invalid'});
    expect(consumeReviewerInviteFragment(port,origin)).toBe(code);
    expect(calls).toEqual([[null,'','/reviewer/invite']]);
    expect(JSON.stringify(calls)).not.toContain(code);
  });

  it('rejects all malformed/duplicate tokens and still scrubs the address',()=>{
    for(const hash of [
      '#code=short','#code='+code+'&code='+code,'#invite='+code,
      '#code='+code+'?next=evil','#code='+code+'%2F',
      '#code='+code.replace('A','!'), '#code='+code+'#other',
    ]){
      const {port,calls}=browser({hash});
      expect(consumeReviewerInviteFragment(port,origin)).toBeNull();
      expect(calls).toEqual([[null,'','/reviewer/invite']]);
    }
  });

  it('never treats URL query parameters as enrollment codes',()=>{
    const {port,calls}=browser({search:'?code='+code,hash:''});
    expect(consumeReviewerInviteFragment(port,origin)).toBeNull();
    expect(calls).toEqual([[null,'','/reviewer/invite']]);
    expect(JSON.stringify(calls)).not.toContain(code);
  });

  it('refuses attacker-controlled origin or an unrelated React router path',()=>{
    for(const config of [
      {location:{origin:'https://evil.invalid'}},
      {location:{pathname:'/reviewer/not-invite'}},
    ]){
      const {port,calls}=browser(config.location);
      expect(consumeReviewerInviteFragment(port,origin)).toBeNull();
      expect(calls).toEqual([]);
    }
    const {port,calls}=browser();
    expect(consumeReviewerInviteFragment(port,'http://synthetic.invalid')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('fails closed if browser history redaction is denied',()=>{
    const {port}=browser();
    port.history.replaceState=()=>{throw new Error('history unavailable');};
    expect(consumeReviewerInviteFragment(port,origin)).toBeNull();
  });

  it('does not create permissions or persist credentials by itself',()=>{
    const {port}=browser({hash:''});
    let touched=false;
    port.history.replaceState=()=>{touched=true;};
    expect(consumeReviewerInviteFragment(port,origin)).toBeNull();
    expect(touched).toBe(false);
  });
});
