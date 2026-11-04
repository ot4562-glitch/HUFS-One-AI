/** Deterministic, original code-native fallbacks. No external images or AI attribution. */
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../apps/web/src/features/owner-demo/assets/',import.meta.url);
const shapes=[
 ['technology','기술·데이터',['#e7f6f3','#125b66'],'<path d="M230 225v-60h40v60m30 0V115h40v110m30 0v-85h40v85" fill="none" stroke-width="16"/><path d="m225 140 72-40 65 18 60-45" fill="none"/>'],
 ['business','경제·경영',['#f9f0df','#7b5925'],'<rect x="216" y="130" width="208" height="132" rx="18" fill="none"/><path d="M280 130v-35h80v35m-144 50h208m-104-14v35" fill="none"/>'],
 ['global','국제·언어',['#eaf0fc','#2c548a'],'<circle cx="320" cy="180" r="89" fill="none"/><ellipse cx="320" cy="180" rx="42" ry="89" fill="none"/><path d="M231 180h178m-158-48h138m-138 96h138" fill="none"/>'],
 ['culture','문화·콘텐츠',['#fbe9e6','#9a4f59'],'<rect x="220" y="112" width="200" height="136" rx="12" fill="none"/><path d="m303 150 55 30-55 30z" stroke="none"/><path d="M245 112v136m150-136v136" fill="none" stroke-dasharray="12 18"/>'],
 ['policy','공공·정책',['#eceff5','#4a5979'],'<path d="m212 135 108-60 108 60H212zm18 130h180m-155-105v80m65-80v80m65-80v80" fill="none"/>'],
 ['environment','환경·지속가능',['#edf5e5','#4d7345'],'<path d="M267 238c-85-104 25-156 132-153 6 100-13 185-132 153z" fill="none"/><path d="m249 263 124-145m-73 87-4-50m36 13 36 2" fill="none"/>'],
 ['education','교육·멘토링',['#fff0dc','#9a6534'],'<path d="M320 128c-33-34-73-26-109-19v142c36-7 76-15 109 19 33-34 73-26 109-19V109c-36-7-76-15-109 19zm0 0v142" fill="none"/>'],
 ['innovation','창업·디자인',['#f1eafb','#685088'],'<path d="M283 226c0-28-41-46-41-87 0-97 156-97 156 0 0 41-41 59-41 87zm0 28h74m-57 23h40" fill="none"/><path d="M320 225v-77m-24 0 24 24 24-24" fill="none"/>'],
 ['empty','빈 보관함',['#f0f3f4','#526971'],'<path d="m225 215 28-112h134l28 112v48H225zm0 0h61l16 21h36l16-21h61" fill="none"/>'],
 ['initials','EMPTY_DEMO 이니셜',['#eef5f4','#256a65'],'<circle cx="320" cy="180" r="103" fill="none"/><text x="320" y="207" font-family="sans-serif" font-size="76" text-anchor="middle" stroke="none">ED</text>'],
];
const write=process.argv.includes('--write'),check=process.argv.length===2||process.argv.includes('--check');
if(!write&&!check||process.argv.some(a=>a.startsWith('--')&&!['--write','--check'].includes(a)))throw Error('Use --write or --check');
const assets=[];
if(write)await mkdir(root,{recursive:true});
for(let i=0;i<shapes.length;i++){
 const [slug,alt,[bg,fg],shape]=shapes[i],assetId='ASSET-'+String(i+1).padStart(2,'0'),fileName=assetId.toLowerCase()+'-'+slug+'.svg';
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" rx="24" fill="'+bg+'"/><circle cx="548" cy="58" r="112" fill="'+fg+'" opacity=".06"/><circle cx="65" cy="330" r="100" fill="'+fg+'" opacity=".06"/><g stroke="'+fg+'" fill="'+fg+'" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">'+shape+'</g></svg>\n';
 const bytes=Buffer.from(svg),sha256=createHash('sha256').update(bytes).digest('hex');
 if(bytes.length>4096)throw Error('Per-asset budget exceeded');
 if(write)await writeFile(new URL(fileName,root),bytes,{flag:'w'});
 else if(!(await readFile(new URL(fileName,root))).equals(bytes))throw Error('Asset differs: '+assetId);
 assets.push({assetId,fileName,alt,kind:i<8?'TOPIC_COVER':i===8?'EMPTY_STATE':'INITIALS',
   width:640,height:360,aspectRatio:'16:9',byteLength:bytes.length,sha256,status:'FALLBACK_READY',
   origin:'ORIGINAL_CODE',aiGenerated:false,copyright:'Original project-authored SVG; no third-party source assets',
   independentHumanReview:'PENDING',crop:'CENTER_SAFE_80_PERCENT',display:'decorative; adjacent HTML carries the content'});
}
const manifest={version:1,namespace:'EMPTY_DEMO',authoredDate:'2026-11-05',maxSingleBytes:4096,
 totalByteLength:assets.reduce((n,a)=>n+a.byteLength,0),assets};
const text=JSON.stringify(manifest,null,2)+'\n';
if(write)await writeFile(new URL('manifest.json',root),text);
else if(await readFile(new URL('manifest.json',root),'utf8')!==text)throw Error('Asset manifest differs');
process.stdout.write(JSON.stringify({status:'PASS',mode:write?'WRITE':'CHECK',assets:assets.length,
 bytes:manifest.totalByteLength,root:fileURLToPath(root),aiGenerated:false})+'\n');
