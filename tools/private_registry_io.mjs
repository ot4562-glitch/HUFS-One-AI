import {execFileSync} from 'node:child_process';
import {lstat,readFile,open,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const restrictedRoot=path.join(projectRoot,'local_only','private-owner-registry');
export function git(args){return execFileSync('git',args,{cwd:projectRoot,maxBuffer:2_000_000,stdio:['ignore','pipe','ignore']});}
export async function noLinks(target){
  let current=path.resolve(target);
  while(true){const info=await lstat(current);if(info.isSymbolicLink())throw new Error('STORAGE_NOT_VERIFIED');
    const parent=path.dirname(current);if(parent===current)break;current=parent;}
}
/** chmod on a Windows mount does not establish NTFS privacy. Query the real ACL
 * with Windows PowerShell and require protected current-user/SYSTEM-only rules. */
export async function verifyPrivateTarget(target,{directory=false}={}){
  try{
    await noLinks(target);
    if(await realpath(target)!==path.resolve(target))return false;
    const info=await lstat(target);
    if(directory?!info.isDirectory():!info.isFile()||info.nlink!==1)return false;
    const win=process.platform==='win32'?target:target.match(/^\/mnt\/([a-z])\//)
      ?target[5].toUpperCase()+':\\'+target.slice(7).replaceAll('/','\\'):null;
    if(win){
      const literal=win.replaceAll("'","''");
      const script=`$ErrorActionPreference='Stop'; Import-Module ($PSHOME+'\\Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1'); $p='${literal}'; $u=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $a=Get-Acl -LiteralPath $p; $owner=($a.Owner | ForEach-Object { (New-Object Security.Principal.NTAccount($_)).Translate([Security.Principal.SecurityIdentifier]).Value }); $bad=@($a.Access | Where-Object { $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($u,'S-1-5-18') }); if(${directory?'(-not $a.AreAccessRulesProtected) -or ':''}$owner -ne $u -or $bad.Count -gt 0){exit 2}; $item=Get-Item -LiteralPath $p; if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.PSIsContainer -ne $${directory?'true':'false'}){exit 3}; Write-Output 'ACL_VERIFIED'`;
      const exe=process.platform==='win32'?'powershell.exe':'/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
      const result=execFileSync(exe,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{stdio:['ignore','pipe','ignore'],timeout:10_000}).toString();
      return result.trim()==='ACL_VERIFIED';
    }
    return typeof process.getuid==='function'&&info.uid===process.getuid()&&(info.mode&0o077)===0;
  }catch{return false;}
}
export async function verifyRestrictedStorage(){
  try{
    git(['check-ignore','-q','--',path.relative(projectRoot,path.join(restrictedRoot,'registry.json'))]);
    return await verifyPrivateTarget(restrictedRoot,{directory:true});
  }catch{return false;}
}
export async function readRestrictedJson(filename){
  if(!await verifyRestrictedStorage())throw new Error('STORAGE_NOT_VERIFIED');
  if(!/^[a-z][a-z0-9-]*\.json$/.test(filename))throw new Error('INVALID_FILENAME');
  const target=path.join(restrictedRoot,filename);await noLinks(target);
  if(!await verifyPrivateTarget(target))throw new Error('STORAGE_NOT_VERIFIED');
  const info=await lstat(target);if(!info.isFile()||info.size>1_000_000)throw new Error('INVALID_FILE');
  return JSON.parse(await readFile(target,'utf8'));
}
export async function writeRestrictedJson(filename,value){
  if(!await verifyRestrictedStorage())throw new Error('STORAGE_NOT_VERIFIED');
  if(!/^[a-z][a-z0-9-]*\.json$/.test(filename))throw new Error('INVALID_FILENAME');
  // Exclusive creation avoids overwriting user records or silently replaying a
  // stale registry. Revisions are prepared as separately named files.
  const target=path.join(restrictedRoot,filename);
  const handle=await open(target,'wx',0o600);
  try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');}finally{await handle.close();}
  if(!await verifyRestrictedStorage()||!await verifyPrivateTarget(target))throw new Error('STORAGE_NOT_VERIFIED');
}
export function loadGitIntake(revision){
  if(!/^[A-Za-z0-9/_-]{1,100}$/.test(revision))throw new Error('INVALID_REVISION');
  const entries=git(['ls-tree','-rz','--name-only',revision,'csv']).toString('utf8').split('\0').filter(p=>p.endsWith('.csv'));
  if(entries.length!==5||entries.some(p=>!/^csv\/[^/]+\.csv$/.test(p)))throw new Error('SOURCE_BINDING');
  const coursePaths=entries.filter(p=>path.basename(p).startsWith('이수과목_'));
  const formPaths=entries.filter(p=>!coursePaths.includes(p));
  if(coursePaths.length!==4||formPaths.length!==1)throw new Error('SOURCE_BINDING');
  const read=p=>git(['show',`${revision}:${p}`]).toString('utf8');
  return {formsCsv:read(formPaths[0]),courseFiles:coursePaths.map(p=>({filename:path.basename(p),content:read(p)}))};
}
