"""Offline pre-publication audit. No git add, commit, remote or push operations."""
from __future__ import annotations
import hashlib, json, re, subprocess, sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlsplit, unquote
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'local_only/reports';OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def check(name,passed,detail=None): checks.append({'name':name,'passed':bool(passed),'detail':detail})
def git(*args):
    return subprocess.run(['git','-C',str(ROOT),*args],capture_output=True,check=False)
def entries(result):return [x.decode('utf-8','surrogateescape') for x in result.stdout.split(b'\0') if x]
def forbidden(name):
    parts=Path(name).parts;lower=name.replace('\\','/').lower()
    return (any(x in lower.split('/') for x in ['local_only','retire','private','secrets','student_records','real5']) or
            (lower.startswith('reference/') and any(x in lower.split('/') for x in ['raw','text','data','links','screenshots'])) or
            lower.endswith(('hufs_ui.pdf','.key','.pem','.pfx','.p12','.db','.sqlite','.sqlite3','.dump','.log','.zip','.7z')) or
            any(x.startswith('.env') for x in lower.split('/')))
tracked_result=git('ls-files','-z');check('git_index_readable',tracked_result.returncode==0)
tracked=entries(tracked_result)
candidate_result=git('ls-files','--cached','--others','--exclude-standard','-z');check('git_candidates_readable',candidate_result.returncode==0)
candidates=sorted(set(entries(candidate_result)))
check('no_protected_tracked_files',not [x for x in tracked if forbidden(x)],[x for x in tracked if forbidden(x)])
check('no_protected_publication_candidates',not [x for x in candidates if forbidden(x)],[x for x in candidates if forbidden(x)])
probe=['HUFS_UI.pdf','local_only/real5/intake_status.json','reference/hufsability/screenshots/index.png','reference/hufsability/snapshots/2026-10-29/raw/academic/2026_2_seoul_handbook.pdf','reference/hufsability/snapshots/2026-10-29-followup/raw/BRAND-01-6.html','retire/README.md','.env','secrets/a.key','packages/fixtures/real5/student.json']
for name in probe:
    result=git('check-ignore','--no-index','--quiet',name)
    check('ignored:'+name,result.returncode==0)
docker=(ROOT/'.dockerignore').read_text(encoding='utf-8')
for value in ['local_only','reference/hufsability','HUFS_UI.pdf','retire','secrets','data/real5','packages/fixtures/real5']:
    check('docker_excludes:'+value,value in docker.splitlines())
# Scan only Git publication candidates, never private or historical raw folders.
secret_patterns=[r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',r'gh[pousr]_[A-Za-z0-9]{30,}',r'github_pat_[A-Za-z0-9_]{35,}',r'AKIA[0-9A-Z]{16}',r'sk-(?:proj-)?[A-Za-z0-9_-]{35,}']
findings=[];text_count=0
for name in candidates:
    p=ROOT/name
    if not p.is_file() or p.is_symlink():continue
    if p.suffix.lower() not in ('.md','.json','.py','.ps1','.txt','.yaml','.yml','.toml','.ini','.html') and not p.name.startswith('.'):continue
    if p.stat().st_size>2_000_000:continue
    try:text=p.read_text(encoding='utf-8-sig')
    except UnicodeError:continue
    text_count+=1
    for i,pattern in enumerate(secret_patterns):
        if re.search(pattern,text):findings.append({'file':name,'pattern_index':i})
check('no_common_secret_signatures_in_candidates',not findings,findings)
p=(ROOT/'Architecture.md').read_text(encoding='utf-8-sig')
team=(ROOT/'Proposal.md').read_text(encoding='utf-8-sig')
# Current Architecture is A00~A19 and contains TASK-00..TASK-17 as table rows.
task_rows=[line.split('|') for line in p.splitlines() if re.match(r'^\| TASK-\d\d\b',line)]
task_ids={re.search(r'TASK-(\d\d)',r[1]).group(1) for r in task_rows}
check('all_18_agent_task_cards',len(task_rows)==18 and task_ids=={f'{i:02d}' for i in range(18)})
check('all_18_agent_owner_review_read_contracts',len(task_rows)==18 and all(len(r)>=5 and r[2].strip() and 'A' in r[2] and r[3].strip() for r in task_rows))
check('joint_decision_heading','## A18. 일정·완료 게이트·공동 결정' in p and '공동 승인 대상:' in p)
check('real_five_primary_demo',all(x in p for x in ['S01','S02','S03','S04','S05','SharingGrant','REAL_CONSENTED']))
check('no_old_palette_or_fixed_success',all(x not in p for x in ['#3558F0','#7C5CF0','실제114','예상128','UNKNOWN 노출 없이']))
check('official_rgb_hex_palette',all(x in p for x in ['#146E7A','#DADAD3','#002D56','#8D7150','#9D9FA2']))
check('team_first_and_dev_spec_split', '팀원용 제안' in team and '## A01.' in p and '## A17.' in p)
check('screenshot_bounded_observation','로그인 첫 화면 한 장' in team and '전체 시스템에 추천 기능이 없다는 뜻은 아니다' in team)
# Private intake is a separate four-person, consent-gated workflow. The publication
# audit must never require or parse local personal status/raw records.
check('no_private_intake_in_git_candidates',not any(x.startswith(('local_only/','templates/real5-intake/')) for x in candidates))
# Existing relative links must work locally, including ignored research material.
active_docs=['Proposal.md','Architecture.md','README.md','AGENTS.md','PROJECT.md','REPORT.md','CLOUD.md','TEAM_SURVEY.md','APPLICATION.md','STATUS.md','reference/hufsability/DATA_PERMISSION_GATE.md']
for name in active_docs:
    doc=ROOT/name;text=doc.read_text(encoding='utf-8-sig')
    check('utf8:'+name,'\ufffd' not in text)
    for target in re.findall(r'\]\(([^)]+)\)',text):
        if urlsplit(target).scheme or target.startswith('#'):continue
        check('link:'+name+':'+target,(doc.parent/unquote(target.split('#')[0])).exists())
failures=[x for x in checks if not x['passed']]
report={'checked_at':datetime.now(timezone(timedelta(hours=9))).isoformat(),'result':'PASS' if not failures else 'FAIL','checks':len(checks),'passed':len(checks)-len(failures),'failures':failures,'tracked_file_count':len(tracked),'candidate_file_count':len(candidates),'text_files_scanned':text_count,'candidate_files':candidates,'source_sha256':hashlib.sha256((ROOT/'Proposal.md').read_bytes()).hexdigest(),'scope':'Static local document/ignore/candidate checks before an approved private GitHub upload; not legal clearance or proof of full secret absence; audit itself does not upload.','results':checks}
(OUT/'publication_boundary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:report[k] for k in ['result','checks','passed','failures','tracked_file_count','candidate_file_count','text_files_scanned']},ensure_ascii=True))
sys.exit(1 if failures else 0)
