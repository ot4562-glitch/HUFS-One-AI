"""Exercise the real Windows/PowerShell exporter against synthetic Git commits."""
from __future__ import annotations
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[2]
POWERSHELL=shutil.which('pwsh') or shutil.which('powershell')

@unittest.skipUnless(POWERSHELL and shutil.which('git'),'PowerShell and Git required for actual source exporter')
class ArchiveShellBytesTests(unittest.TestCase):
    def test_old_crlf_git_blobs_export_as_lf_without_requiring_new_helper(self):
        with tempfile.TemporaryDirectory(prefix='hufs-archive-shell-') as temporary:
            root=Path(temporary)
            shell_env=os.environ.copy()
            # PowerShell 7's module path cannot be inherited by Windows 5.1;
            # let the selected shell initialize its own standard modules.
            shell_env.pop('PSModulePath',None)
            if Path(POWERSHELL).name.lower() == 'powershell.exe':
                shell_env['PSModulePath']=str(Path(POWERSHELL).parent/'Modules')
            files={name:'synthetic' for name in [
                'package.json','package-lock.json','tsconfig.json','packages/contracts/package.json',
                'packages/contracts/tsconfig.build.json','apps/web/index.html','apps/web/vite.config.ts',
                'infra/ncp/hufs-preview.service','packages/ui/src/index.ts','packages/core/src/index.ts',
                'packages/fixtures/synthetic/item.json']}
            files['.gitattributes']='*.sh -text\n'
            for name in ['bootstrap-ubuntu.sh','deploy-preview.sh','harden-ssh.sh']:
                files['infra/ncp/'+name]='#!/bin/bash\r\nprintf "synthetic\\n"\r\n'
            for i in range(8):files[f'apps/web/src/source-{i}.ts']='export {}'
            files['apps/web/src/main.tsx']='export {}'
            files['packages/contracts/src/index.ts']='export {}'
            for name,content in files.items():
                path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(content.encode())
            exporter=root/'infra/ncp/Prepare-NcpPreview.ps1'
            shutil.copyfile(ROOT/'infra/ncp/Prepare-NcpPreview.ps1',exporter)
            def git(*args):
                result=subprocess.run(['git','-c','commit.gpgsign=false','-c','core.hooksPath='+str(root/'no-hooks'),
                    '-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid',*args],
                    cwd=root,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=15)
                self.assertEqual(result.returncode,0,result.stderr);return result.stdout.strip()
            git('init','-q');git('add','.');git('commit','-qm','synthetic legacy CRLF')
            legacy=git('rev-parse','HEAD')
            helper=root/'infra/ncp/rollback-preview.sh';helper.write_bytes(b'#!/bin/bash\r\nexit 0\r\n')
            git('add','.');git('commit','-qm','synthetic current helper')
            for ref,has_helper in [(legacy,False),('HEAD',True)]:
                output='local_only/'+('old' if not has_helper else 'current')+'.zip'
                result=subprocess.run([POWERSHELL,'-NoProfile','-ExecutionPolicy','Bypass','-File',str(exporter),
                    '-Ref',ref,'-Output',output],cwd=root,env=shell_env,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=30)
                self.assertEqual(result.returncode,0,result.stderr)
                with zipfile.ZipFile(root/output) as archive:
                    self.assertEqual('infra/ncp/rollback-preview.sh' in archive.namelist(),has_helper)
                    for name in archive.namelist():
                        if name.endswith('.sh'):
                            self.assertFalse(b'\r' in archive.read(name),'Exported shell must be executable LF regardless of historic blob EOL')
            for i,content in enumerate([b'\xff',b'#!/bin/bash\rbroken\r',b'#!'+b'a'*262145]):
                helper.write_bytes(content);git('add','.');git('commit','-qm','synthetic invalid shell bytes')
                output=f'local_only/invalid-{i}.zip'
                result=subprocess.run([POWERSHELL,'-NoProfile','-ExecutionPolicy','Bypass','-File',str(exporter),
                    '-Ref','HEAD','-Output',output],cwd=root,env=shell_env,capture_output=True,text=True,
                    encoding='utf-8',errors='replace',timeout=30)
                self.assertNotEqual(result.returncode,0)
                self.assertFalse((root/output).exists())
                self.assertFalse((root/(output+'.partial')).exists())
