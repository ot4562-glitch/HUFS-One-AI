import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,symlink,link,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {verifyPrivateTarget,projectRoot} from '../../tools/private_registry_io.mjs';

test('private target gate rejects a broad existing file even inside a restrictive POSIX directory',async t=>{
  if(process.platform==='win32'||tmpdir().startsWith('/mnt/'))return t.skip('POSIX fixture only; real NTFS tested independently');
  const directory=await mkdtemp(path.join(tmpdir(),'hufs-private-io-'));
  const filename=path.join(directory,'synthetic.json');
  try{
    await chmod(directory,0o700);await writeFile(filename,'{"synthetic":true}',{mode:0o600});
    assert.equal(await verifyPrivateTarget(directory,{directory:true}),true);
    assert.equal(await verifyPrivateTarget(filename),true);
    await chmod(filename,0o644);
    assert.equal(await verifyPrivateTarget(filename),false);
    assert.equal(await verifyPrivateTarget(directory,{directory:true}),true);
    await chmod(filename,0o600);
    const alias=path.join(directory,'synthetic-link.json');await symlink(filename,alias);
    assert.equal(await verifyPrivateTarget(alias),false);await unlink(alias);
    const hard=path.join(directory,'synthetic-hard.json');await link(filename,hard);
    assert.equal(await verifyPrivateTarget(filename),false);await unlink(hard);
    assert.equal(await verifyPrivateTarget(filename),true);
  }finally{await unlink(filename);await rmdir(directory);}
});

test('NTFS file-specific broad Allow is denied while its restrictive parent remains valid',async t=>{
  if(process.platform!=='win32'&&!projectRoot.startsWith('/mnt/c/'))return t.skip('Requires Windows NTFS or WSL Windows mount');
  const directory=await mkdtemp(path.join(projectRoot,'local_only','acl-synthetic-'));
  const filename=path.join(directory,'synthetic.json');
  const win=value=>process.platform==='win32'?value:value[5].toUpperCase()+':\\'+value.slice(7).replaceAll('/','\\');
  const literal=value=>"'"+win(value).replaceAll("'","''")+"'";
  const run=script=>execFileSync(process.platform==='win32'?'powershell.exe':'/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from("$ErrorActionPreference='Stop'; Import-Module ($PSHOME+'\\Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1'); "+script,'utf16le').toString('base64')],
    {stdio:'ignore',timeout:10000});
  let created=false;
  try{
    run(`$p=${literal(directory)}; $u=[Security.Principal.WindowsIdentity]::GetCurrent().User; $a=New-Object Security.AccessControl.DirectorySecurity; $a.SetOwner($u); $a.SetAccessRuleProtection($true,$false); foreach($s in @($u,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))){ $r=New-Object Security.AccessControl.FileSystemAccessRule($s,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $a.AddAccessRule($r) }; Set-Acl -LiteralPath $p -AclObject $a`);
    await writeFile(filename,'{"synthetic":true}',{flag:'wx'});created=true;
    assert.equal(await verifyPrivateTarget(directory,{directory:true}),true);
    assert.equal(await verifyPrivateTarget(filename),true);
    run(`$p=${literal(filename)}; $a=Get-Acl -LiteralPath $p; $s=New-Object Security.Principal.SecurityIdentifier('S-1-1-0'); $r=New-Object Security.AccessControl.FileSystemAccessRule($s,'Read','Allow'); $a.AddAccessRule($r); Set-Acl -LiteralPath $p -AclObject $a`);
    assert.equal(await verifyPrivateTarget(directory,{directory:true}),true);
    assert.equal(await verifyPrivateTarget(filename),false);
  }finally{
    // These exact synthetic files were created by this test, are not linked or
    // tracked, and contain no source records. The actual registry is untouched.
    if(created)await unlink(filename);await rmdir(directory);
  }
});
