"""Bounded, one-time collection of public references named in Proposal.md.

Explicit --collect required. No login, no form submission, no recursive links,
no executable downloads, no retry, and no robots disallow bypass. Raw copies
are local research evidence, not licensed product data or GitHub content.
"""
from __future__ import annotations
import argparse, hashlib, json, re, time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'reference/hufsability/snapshots/2026-10-29-followup'
UA = 'HUFS-One-AI-ReferenceAudit/1.0'
MAX_BYTES = 25 * 1024 * 1024

def now(): return datetime.now(timezone(timedelta(hours=9))).isoformat()
def norm(url):
    p=urlsplit(url); return urlunsplit((p.scheme.lower(),p.netloc.lower(),p.path,p.query,''))
def save_json(path, obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

class Plain(HTMLParser):
    def __init__(self): super().__init__(convert_charrefs=True); self.parts=[]; self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style','noscript'): self.skip+=1
        if tag in ('p','div','tr','br','li','h1','h2','h3','h4'): self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style','noscript'): self.skip=max(0,self.skip-1)
        if tag in ('p','div','tr','li','h1','h2','h3','h4'): self.parts.append('\n')
    def handle_data(self,text):
        if not self.skip:self.parts.append(text)
    def text(self): return '\n'.join(x.strip() for x in ''.join(self.parts).splitlines() if x.strip())

def existing_sources():
    known={}
    for p in (ROOT/'reference').rglob('*.json'):
        if OUT in p.parents or p.stat().st_size>3_000_000:continue
        try:data=json.loads(p.read_text(encoding='utf-8-sig'))
        except (ValueError,UnicodeError):continue
        def walk(v):
            if isinstance(v,dict):
                url=next((v[k] for k in ('url','source_url') if isinstance(v.get(k),str) and v[k].startswith('https://')),None)
                f=next((v[k] for k in ('file','path','output_file','local_path') if isinstance(v.get(k),str)),None)
                if url and f:
                    for base in (p.parent,ROOT/'reference/hufsability',ROOT):
                        q=base/f
                        if q.is_file() and q.suffix.lower() in ('.html','.pdf','.txt','.json'):
                            known[norm(url)]=str(q.relative_to(ROOT));break
                for child in v.values():walk(child)
            elif isinstance(v,list):
                for child in v:walk(child)
        walk(data)
    return known

def targets():
    b=(ROOT/'Proposal.md').read_text(encoding='utf-8-sig').split('## 참고자료',1)[1]
    records=[];seen=set()
    for line in b.splitlines():
        label=re.search(r'\*\*\[([^\]]+)\]',line)
        for url in re.findall(r'https://[^\s<>\)\]`]+',line):
            url=norm(url.rstrip('.,;'))
            if url not in seen:
                seen.add(url);records.append({'id':(label.group(1) if label else 'REFERENCE')+'-'+str(len(records)+1),'url':url})
    for ident,url in [('BRAND-SYMBOL','https://www.hufs.ac.kr/hufs/11128/subview.do'),('BRAND-SIGNATURE','https://www.hufs.ac.kr/hufs/11131/subview.do')]:
        if url not in seen:records.append({'id':ident,'url':url})
    return records

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
opener=build_opener(NoRedirect())
robots_cache={}
allowed_hosts=set()

def fetch_raw(url, cap=MAX_BYTES):
    response=opener.open(Request(url,headers={'User-Agent':UA}),timeout=14)
    data=response.read(cap+1)
    if len(data)>cap:raise ValueError('response exceeds byte limit')
    return data,dict(response.headers),response.status

def robots_for(url):
    p=urlsplit(url);origin=p.scheme+'://'+p.netloc
    if origin in robots_cache:return robots_cache[origin]
    ru=origin+'/robots.txt';r={'url':ru,'checked_at':now(),'status':None,'body':None}
    try:
        data,headers,status=fetch_raw(ru,500_000);text=data.decode('utf-8-sig','replace')
        r.update(status=status,body=text)
        if '<html' in text.lower():r['body']=None;r['reason']='robots returned HTML; review required'
        else:
            f=OUT/'robots'/(p.netloc+'.txt');f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(data)
            r['file']=str(f.relative_to(OUT));r['sha256']=hashlib.sha256(data).hexdigest()
    except HTTPError as e:
        r['status']=e.code;r['reason']='robots absent' if e.code==404 else 'robots not readable'
    except Exception as e:r['reason']=type(e).__name__
    robots_cache[origin]=r;time.sleep(0.5);return r

def robot_allowed(url):
    r=robots_for(url)
    if r['status']==404:return True,'robots absent (not reuse permission)'
    if r.get('body') is None:return False,'ROBOTS_REVIEW'
    groups=[];agents=[];rules=[]
    for line in r['body'].splitlines()+['user-agent: __end__']:
        line=line.split('#',1)[0].strip()
        if ':' not in line:continue
        k,v=[x.strip() for x in line.split(':',1)];k=k.lower()
        if k=='user-agent':
            if rules:groups.append((agents,rules));agents=[];rules=[]
            agents.append(v.lower())
        elif k in ('allow','disallow') and agents:rules.append((k,v))
    applicable=[];specific=-1
    for agents,rules in groups:
        score=max([0 if a=='*' else len(a) for a in agents if a=='*' or a in UA.lower()]+[-1])
        if score>specific:applicable=[];specific=score
        if score==specific and score>=0:applicable+=rules
    path=urlsplit(url).path+('?' + urlsplit(url).query if urlsplit(url).query else '')
    matches=[]
    for k,v in applicable:
        if not v:continue
        expr='^'+re.escape(v).replace(r'\*','.*')
        if expr.endswith(r'\$'):expr=expr[:-2]+'$'
        if re.search(expr,path):matches.append((len(v.replace('*','')),k=='allow'))
    if not matches:return True,'robots allowed'
    best=max(x[0] for x in matches)
    return any(a for n,a in matches if n==best),'ROBOTS_DISALLOW'

def fetch_checked(url):
    current=url
    for _ in range(5):
        parts=urlsplit(current)
        if parts.scheme!='https' or parts.hostname not in allowed_hosts:raise ValueError('redirect host requires review')
        ok,reason=robot_allowed(current)
        if not ok:raise PermissionError(reason)
        try:return (*fetch_raw(current),current)
        except HTTPError as e:
            if e.code in (301,302,303,307,308):
                from urllib.parse import urljoin
                current=urljoin(current,e.headers.get('Location',''));continue
            raise
    raise ValueError('redirect limit')

def run():
    ap=argparse.ArgumentParser();ap.add_argument('--collect',action='store_true');ap.add_argument('--limit',type=int,default=18);args=ap.parse_args()
    rows=targets();known=existing_sources();allowed_hosts.update(urlsplit(x['url']).hostname for x in rows)
    OUT.mkdir(parents=True,exist_ok=True)
    mp=OUT/'manifest.json'
    old=json.loads(mp.read_text(encoding='utf-8')) if mp.exists() else {'sources':[]}
    previous={x['url']:x for x in old['sources']}
    results=[];attempts=0
    for row in rows:
        url=row['url']
        if url in previous and previous[url]['result'] != 'PENDING':results.append(previous[url]);continue
        if url in known:results.append(dict(row,result='ALREADY_LOCAL',file=known[url]));continue
        if url.endswith('/HUFS_UI.pdf') and (ROOT/'HUFS_UI.pdf').is_file():
            p=ROOT/'HUFS_UI.pdf';results.append(dict(row,result='USER_SUPPLIED_LOCAL',file='HUFS_UI.pdf',sha256=hashlib.sha256(p.read_bytes()).hexdigest()));continue
        if not args.collect or attempts>=args.limit:results.append(dict(row,result='PENDING'));continue
        attempts+=1;r=dict(row,checked_at=now(),access='public_unauthenticated',reuse='RESEARCH_REFERENCE_ONLY')
        try:
            data,headers,status,final=fetch_checked(url)
            content_type=headers.get('Content-Type',headers.get('content-type',''))
            suffix='.pdf' if data.startswith(b'%PDF-') else '.html'
            if not data.startswith(b'%PDF-') and '<html' not in data[:6000].decode('ascii','ignore').lower() and '<!doctype' not in data[:6000].decode('ascii','ignore').lower():raise ValueError('unsupported or unexpected content')
            f=OUT/'raw'/(re.sub('[^A-Za-z0-9_-]','_',r['id'])+suffix);f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(data)
            r.update(result='SAVED',file=str(f.relative_to(OUT)),final_url=final,http_status=status,content_type=content_type,bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
            if suffix=='.html':
                charset=re.search(r'charset\s*=\s*[\"\x27]?([a-zA-Z0-9_-]+)',content_type+' '+data[:3000].decode('ascii','ignore'))
                encoding=charset.group(1) if charset else 'utf-8'
                try:text=data.decode(encoding)
                except (LookupError,UnicodeError):text=data.decode('utf-8','replace')
                parser=Plain();parser.feed(text)
                tf=OUT/'text'/(f.stem+'.txt');tf.parent.mkdir(parents=True,exist_ok=True);tf.write_text(parser.text(),encoding='utf-8')
                r['text_file']=str(tf.relative_to(OUT))
                if 'login' in urlsplit(final).path.lower():r['result']='LOGIN_PAGE_NOT_CONTENT'
        except PermissionError as e:r.update(result=str(e))
        except HTTPError as e:r.update(result='HTTP_ERROR',http_status=e.code)
        except Exception as e:r.update(result='FAILED_REVIEW',error=type(e).__name__+': '+str(e)[:180])
        results.append(r);print(r['id'],r['result'],flush=True);time.sleep(1.0)
    report={'created_at':now(),'purpose':'owner-requested missing public references audit','sources':results,'robots':[{k:v for k,v in r.items() if k!='body'} for r in robots_cache.values()],'no_login':True,'no_recursive_links':True,'no_student_records':True,'no_product_feed':True}
    save_json(mp,report)
    counts={k:sum(x['result']==k for x in results) for k in sorted({x['result'] for x in results})}
    print(json.dumps({'total':len(results),'attempted_this_run':attempts,'counts':counts}))
if __name__=='__main__':run()
