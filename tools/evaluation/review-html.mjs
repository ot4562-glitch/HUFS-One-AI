const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
/** Offline unsigned-draft editor. Browser input never establishes authority. */
export function renderReviewHtml(packet,template,images={}){
 const data=JSON.stringify({packet,template,images}).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
 return '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; base-uri \'none\'; form-action \'none\'">'+
 '<title>독립 검토 입력 — '+escape(packet.datasetId)+'</title><style>'+
 'body{font:16px system-ui,sans-serif;line-height:1.5;max-width:1200px;margin:24px auto;padding:0 16px;background:#f7f9fc;color:#15243c}'+
 'label{display:block;margin:12px 0}input,select,textarea,button{font:inherit;padding:8px;border:1px solid #71809a;border-radius:4px;max-width:100%;box-sizing:border-box}'+
 'input,textarea{width:100%}textarea{min-height:380px;font:14px monospace}button{margin:4px;background:white;cursor:pointer}button:focus-visible{outline:3px solid #165dce}'+
 'pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#fff;padding:12px;border:1px solid #ccd4df}section{background:white;padding:16px;margin:16px 0;border-radius:8px}'+
 '.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}img{max-width:100%;height:auto}#message{color:#a41919;min-height:24px}'+
 '@media(max-width:700px){.grid{display:block}body{margin:8px auto}}'+
 '</style><h1>독립 검토 입력</h1><p>전체 '+packet.cases.length+'건 · '+escape(packet.datasetKind)+
 ' · 실제 독립 인적 검토는 별도 서명 원장에서 확인합니다. 이 파일은 입력 초안이며 승인 기록이 아닙니다.</p>'+
 '<p><strong>서명은 실제 읽음·정확성·최종 인수를 자동 증명하지 않습니다.</strong> 시험 키 및 SYNTHETIC_TEST는 인적 완료 건수에 포함되지 않습니다. 미작성 값은 자동 채우지 않습니다.</p>'+
 '<details><summary>고정 대상과 검토 절차</summary><pre>commit '+escape(packet.targetCommit)+'\npackage '+escape(packet.packageSha256)+
 '\ndemoAsOf '+escape(packet.demoAsOf)+'</pre><p>원본·프로필·조건을 직접 읽고 판단과 근거를 입력하세요. 관련성 0/1/2와 신청 가능 여부를 구분합니다. 초안과 다르면 수정 이유를 남깁니다. UNKNOWN에는 이유가 필요합니다. 완료 후보 JSON은 CLI prepare로 검증하고 본인의 외부 Ed25519 키로 서명한 다음 통합자에게 전달합니다.</p></details>'+
 '<section><h2>제출 묶음 식별자</h2><label>저장한 같은 패키지 초안 다시 열기<input id="load" type="file" accept="application/json"></label><label>검토자 ID<input id="reviewer" autocomplete="off"></label>'+
 '<label>Submission ID<input id="submission"></label><label>Signature ID<input id="signature"></label>'+
 '<label>서명 시각 ISO 8601<input id="signedAt" placeholder="실제 외부 서명 직전에 입력"></label>'+
 '<label>현재 원장 head SHA-256<input id="head" value="'+escape(template.expectedLedgerHead)+'"></label>'+
 '<p>서명 시각을 바꾸면 반드시 새 canonical payload에 다시 서명해야 합니다.</p></section>'+
 '<section><label>검토할 사례<select id="case"></select></label><button id="previous">이전</button><button id="next">다음</button>'+
 '<span id="count" aria-live="polite"></span><div class="grid"><div><h2>고정 원본과 초안 참조</h2><div id="source"></div></div>'+
 '<div><h2>직접 입력할 판정</h2><p>LABELLED: 판정 완료, HOLD: 보류. evidence는 실제 확인한 원문 범위입니다. 아래 버튼은 식별자·근거 참조를 복사할 뿐 판정·시간·서명을 채우지 않습니다.</p>'+
 '<button id="bindings">식별자·입력 틀·근거 참조 복사</button><label>사례 JSON<textarea id="editor" spellcheck="false"></textarea></label></div></div></section>'+
 '<p id="message" role="status"></p><button id="draft">모든 초안 저장</button><button id="candidate">판정한 사례만 제출 후보 저장</button>'+
 '<script type="application/json" id="data">'+data+'</script><script>'+
 String.raw`'use strict';
 const {packet,template,images}=JSON.parse(document.getElementById('data').textContent),rows=template.reviews;
 const $=id=>document.getElementById(id);let index=0;
 packet.cases.forEach((c,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=c.caseId+' / '+c.kind;$('case').append(option);});
 function remember(){try{const row=JSON.parse($('editor').value);if(row.caseId!==packet.cases[index].caseId||row.caseSha256!==packet.cases[index].caseSha256)throw Error('고정 사례 ID/hash를 수정할 수 없습니다.');rows[index]=row;$('message').textContent='';return true;}catch(e){$('message').textContent='JSON 입력을 확인하세요: '+e.message;return false;}}
 function pre(value){const p=document.createElement('pre');p.textContent=typeof value==='string'?value:JSON.stringify(value,null,2);return p;}
 function show(){const c=packet.cases[index],box=$('source');box.replaceChildren();$('case').value=String(index);
  if(c.kind==='RECOMMENDATION'){box.append(pre(packet.profiles.find(p=>p.profileId===c.profileId)),pre(packet.sources.find(s=>s.sourceId===c.sourceId)),pre({draft:c.draft,conditions:c.conditions,evidence:c.evidence}));}
  else{if(c.kind==='POSTER'&&images[c.caseId]){const image=document.createElement('img');image.src=images[c.caseId];image.alt='코드로 직접 만든 합성 포스터 '+c.caseId;box.append(image);}box.append(pre(c.reference),pre(c.evidence));}
  $('editor').value=JSON.stringify(rows[index],null,2);$('count').textContent=(index+1)+' / '+rows.length;
 }
 function move(to){if(remember()){index=Math.max(0,Math.min(rows.length-1,to));show();}}
 $('case').addEventListener('change',()=>move(Number($('case').value)));$('previous').onclick=()=>move(index-1);$('next').onclick=()=>move(index+1);
 $('bindings').onclick=()=>{if(!remember())return;const c=packet.cases[index],row=rows[index];
  row.reviewId=row.reviewId||'REVIEW-'+crypto.randomUUID();row.reviewEvidenceId=row.reviewEvidenceId||'EVIDENCE-'+crypto.randomUUID();
  row.evidence=structuredClone(c.evidence);
  if(!row.assessment){row.assessment=c.kind==='RECOMMENDATION'?{kind:'RECOMMENDATION',relevance:null,eligibility:null,
    conditions:c.conditions.map(x=>({evidenceId:x.evidenceId,outcome:null}))}:c.kind==='POSTER'?{kind:'POSTER',eligibility:null,
    fields:c.reference.fields.map(f=>({evidenceId:f.evidenceId,value:null,bboxNorm:null}))}:{kind:'TEMPORAL',currentRevisionIds:null,quarantined:null};}
  show();};
 function save(candidate){if(!remember())return;const payload={...template,reviewerId:$('reviewer').value||null,submissionId:$('submission').value||null,
   signatureId:$('signature').value||null,signedAt:$('signedAt').value||null,expectedLedgerHead:$('head').value,
   reviews:candidate?rows.filter(r=>r.decision==='LABELLED'||r.decision==='HOLD'):rows};
  if(candidate&&!payload.reviews.length){$('message').textContent='직접 판정한 사례가 없습니다.';return;}
  const blob=new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=candidate?'review-candidate.json':'review-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('message').textContent='초안을 저장했습니다. CLI 검증과 외부 개인 서명 전에는 인적 검토 승인으로 집계되지 않습니다.';}
 $('load').onchange=async()=>{
  try{
   const file=$('load').files[0];if(!file||file.size>10*1024*1024)throw Error();
   const draft=JSON.parse(await file.text());
   if(draft.schemaVersion!==template.schemaVersion||draft.packageSha256!==packet.packageSha256||draft.targetCommit!==packet.targetCommit
     ||!Array.isArray(draft.reviews)||draft.reviews.length>rows.length||!draft.reviews.length)throw Error();
   const seen=new Set(),updates=[];
   for(const row of draft.reviews){const position=packet.cases.findIndex(c=>c.caseId===row?.caseId);
    if(position<0||seen.has(row.caseId)||row.caseSha256!==packet.cases[position].caseSha256)throw Error();
    seen.add(row.caseId);updates.push([position,row]);}
   for(const [position,row]of updates)rows[position]=row;
   for(const [field,key]of [['reviewer','reviewerId'],['submission','submissionId'],['signature','signatureId'],['signedAt','signedAt']])
    $(field).value=typeof draft[key]==='string'?draft[key]:'';
   if(typeof draft.expectedLedgerHead==='string'&&/^[a-f0-9]{64}$/.test(draft.expectedLedgerHead))$('head').value=draft.expectedLedgerHead;
   show();$('message').textContent='같은 패키지의 미서명 초안을 불러왔습니다. 인적 승인으로 집계하지 않습니다.';
  }catch{$('message').textContent='초안을 불러오지 않았습니다. 패키지·사례 hash와 JSON 크기를 확인하세요.';}
 };
 $('draft').onclick=()=>save(false);$('candidate').onclick=()=>save(true);show();
 `+'</script></html>\n';
}
