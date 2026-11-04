"""Actual rollback script in an isolated filesystem; no host services/network."""
from __future__ import annotations
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'infra/ncp/rollback-preview.sh'
OLD, TARGET = 'a' * 64, 'b' * 64

@unittest.skipUnless(os.name == 'posix' and shutil.which('bash') and shutil.which('flock'),
                     'Linux filesystem and flock required; mandatory Ubuntu CI exercises this suite')
class ExplicitRollbackTests(unittest.TestCase):
    def run_case(self, mode='success', apply=True):
        with tempfile.TemporaryDirectory(prefix='hufs-explicit-rollback-') as temporary:
            root=Path(temporary); base=root/'preview'; (base/'releases').mkdir(parents=True)
            for release in [OLD,TARGET]:
                folder=base/'releases'/release; folder.mkdir()
                for name in ['package-lock.json','apps/web/src/main.tsx','apps/web/vite.config.ts','node_modules/vite/bin/vite.js']:
                    path=folder/name; path.parent.mkdir(parents=True,exist_ok=True); path.write_text('synthetic')
            (base/'current').symlink_to(base/'releases'/OLD)
            source=SCRIPT.read_text()
            self.assertEqual(source.count('base=/opt/hufs-one/preview'),1)
            source=source.replace('base=/opt/hufs-one/preview','base='+str(base))
            # Only the fixture ownership number changes; path/mode/link checks stay real.
            source=source.replace('expected_uid = 0','expected_uid = '+str(os.getuid()))
            script=root/'rollback.sh'; script.write_text(source)
            bin_dir=root/'bin'; bin_dir.mkdir()
            shim=bin_dir/'shim'
            shim.write_text('''#!/bin/sh
name=${0##*/}
printf '%s\\n' "$name $*" >> "$SYN_ROOT/commands"
case "$name" in
id) printf '0\\n';;
systemctl)
  [ "$1" = restart ] && [ "$2" = hufs-preview.service ] || exit 99
  count=0; [ ! -f "$SYN_ROOT/count" ] || read -r count < "$SYN_ROOT/count"
  count=$((count+1)); printf '%s\\n' "$count" > "$SYN_ROOT/count"
  [ "$SYN_MODE" != restore-failure ] || exit 1
  [ "$SYN_MODE" != restart-failure ] || [ "$count" -gt 1 ] || exit 1;;
curl)
  current=$(readlink "$SYN_BASE/current")
  if [ "$SYN_MODE" = delayed-start ] || [ "$SYN_MODE" = delayed-recovery ]; then
    key=${current##*/}; count=0
    [ ! -f "$SYN_ROOT/probes-$key" ] || read -r count < "$SYN_ROOT/probes-$key"
    count=$((count+1)); printf '%s\\n' "$count" > "$SYN_ROOT/probes-$key"
    [ "$count" -gt 2 ] || exit 1
  fi
  if [ "$SYN_MODE" = delayed-recovery ] && [ "$current" = "$SYN_BASE/releases/$SYN_TARGET" ]; then exit 1; fi
  [ "$SYN_MODE" != health-failure ] || [ "$current" != "$SYN_BASE/releases/$SYN_TARGET" ] || exit 1;;
sleep|journalctl) :;;
*) exit 99;;
esac
'''); shim.chmod(0o755)
            for command in ['id','systemctl','curl','sleep','journalctl']:(bin_dir/command).symlink_to(shim)
            expected=OLD
            if mode=='stale':expected='c'*64
            if mode=='foreign':(base/'releases'/TARGET).rename(root/'foreign'); (base/'releases'/TARGET).symlink_to(root/'foreign')
            if mode=='missing':(base/'releases'/TARGET/'package-lock.json').unlink()
            if mode=='writable':base.chmod(0o777)
            lock=None
            if mode=='busy':
                import fcntl
                lock=(base/'.preview-operation.lock').open('w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            args=['bash',str(script),'--target',TARGET,'--expected-current',expected]
            if apply:args+=['--apply','--ack-owner-approved']
            env={'PATH':str(bin_dir)+os.pathsep+os.environ['PATH'],'SUDO_USER':'hufs-admin',
                 'SYN_ROOT':str(root),'SYN_BASE':str(base),'SYN_MODE':mode,'SYN_TARGET':TARGET}
            result=subprocess.run(args,env=env,capture_output=True,text=True,timeout=15)
            if lock:lock.close()
            pointer=(base/'current').resolve().name
            commands=(root/'commands').read_text() if (root/'commands').exists() else ''
            self.assertTrue((base/'releases'/OLD/'package-lock.json').exists())
            return result,pointer,commands

    def test_default_plan_never_inspects_host_or_invokes_commands(self):
        result,pointer,commands=self.run_case(apply=False)
        self.assertEqual(result.returncode,0,result.stderr); self.assertIn('PLAN ONLY',result.stdout)
        self.assertEqual(pointer,OLD);self.assertEqual(commands,'')

    def test_success_switches_existing_release_and_checks_health(self):
        result,pointer,commands=self.run_case()
        self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(pointer,TARGET)
        self.assertIn('OK:',result.stdout);self.assertIn('curl ',commands)

    def test_waits_for_type_simple_startup_and_for_original_service_recovery(self):
        result,pointer,_=self.run_case('delayed-start')
        self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(pointer,TARGET)
        result,pointer,_=self.run_case('delayed-recovery')
        self.assertEqual(result.returncode,1,result.stderr);self.assertEqual(pointer,OLD)

    def test_activation_or_health_failure_restores_original_preview(self):
        for mode in ['restart-failure','health-failure']:
            with self.subTest(mode=mode):
                result,pointer,_=self.run_case(mode)
                self.assertEqual(result.returncode,1,result.stderr);self.assertEqual(pointer,OLD)
                self.assertNotIn('OK:',result.stdout)

    def test_failed_restore_reports_operator_recovery(self):
        result,pointer,_=self.run_case('restore-failure')
        self.assertEqual(result.returncode,3,result.stderr);self.assertEqual(pointer,OLD)
        self.assertIn('manual recovery',result.stderr);self.assertNotIn('OK:',result.stdout)

    def test_stale_foreign_missing_writable_or_busy_host_preserves_current(self):
        for mode in ['stale','foreign','missing','writable','busy']:
            with self.subTest(mode=mode):
                result,pointer,commands=self.run_case(mode)
                self.assertNotEqual(result.returncode,0);self.assertEqual(pointer,OLD)
                self.assertNotIn('systemctl ',commands);self.assertNotIn('curl ',commands)
