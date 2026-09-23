import {toDwg} from './dwg.mjs?v=20260923';
import {drawingPairFor} from './cad-pair.mjs?v=20260921-compact';
import {sectionDrawingFor} from './cad-section.mjs?v=20260921-compact';
import {planGeometry,geometryLabels} from './cad-geometry.mjs?v=20260921-compact';
import {drawingFor,toDxf,toSvg} from './cad.mjs?v=20260921-compact';
import {models,Workbook,labels,display,unit,evaluate,validateRequest} from './chooser.mjs?v=20260921-compact';
const $=s=>document.querySelector(s),esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
$('#more-info').onclick=()=>$('#info-dialog').showModal();
$('#close-info').onclick=()=>$('#info-dialog').close();
let worker,serial=0,lastResult=null,technical=null,pending=null;
try{$('#apply-en81').checked=localStorage.getItem('viet-chao.en81')!=='false'}catch{}
function saveEn81(){try{localStorage.setItem('viet-chao.en81',String($('#apply-en81').checked))}catch{}}
const format=v=>typeof v==='number'?v.toLocaleString('vi-VN',{maximumFractionDigits:2}):display(v);
const areaFormat=v=>v.toLocaleString('vi-VN',{maximumFractionDigits:4});
function areaPanel(a){if(!a)return '';return `<div class="area-band ${a.enforced!==false&&(a.below||a.above)?'area-fail':''}"><strong>${areaFormat(a.area)} m²</strong><span>${a.enforced===false?'':a.minimum===null?`≤ ${areaFormat(a.maximum)} m²`:`${a.persons} người · ${areaFormat(a.minimum)}–${areaFormat(a.maximum)} m²`}</span><details><summary>Diện tích</summary><p>Sàn AA × BB: ${areaFormat(a.floorArea)} m². Diện tích sử dụng tính theo công thức nguồn, gồm phần lối vào khi áp dụng. ${a.minimum===null?'Bảng 6: giới hạn trên.':`Bảng 6 / 8: ${areaFormat(a.minimum)}–${areaFormat(a.maximum)} m².`}</p></details></div>`;}

function specRows(values){return Object.entries(values).map(([k,v])=>`<tr><th>${esc(labels[k]??k)} <small>${esc(k)}</small></th><td>${esc(format(v))} ${unit(k)}</td></tr>`).join('')}
function card(r,index,technicalView=false){const i=r.inputs,o=r.outputs;return `<article class="card"><div class="card-head"><div><h3>${esc(r.model.replace(' LEHY-',' / LEHY-'))}</h3><p>${format(i.CAP)} kg · ${format(i.SPD)} m/s · ${display(i.ENTR)}</p></div></div><div class="dimensions">${[['AH','Rộng giếng'],['BH','Sâu giếng'],['OH','Tầng trên cùng'],['PD','Hố pit']].map(([k,label])=>`<div class="dimension"><span>${label} · ${k}</span><strong>${format(o[k])}</strong><small>mm</small></div>`).join('')}</div>${areaPanel(r.area)}<div class="card-bottom"><span>Cabin ${format(i.AA)} × ${format(i.BB)} · Cửa ${format(i.JJ)} mm · ${esc(display(i.DRKI))}</span><button class="text-button" data-cad="${technicalView?'technical':index}">Xuất CAD ↗</button>${technicalView?'':`<button class="text-button" data-inspect="${index}">Chỉnh sửa →</button>`}</div><details><summary>Thông số & nguồn</summary><table class="spec-table"><tbody>${specRows(i)}${specRows(Object.fromEntries(Object.entries(o).filter(([k])=>!['AH','BH','OH','PD'].includes(k))))}</tbody></table><p class="source">Nguồn: ${esc(r.file)}<br>Kết quả: ${Object.entries(models.find(m=>m.id===r.model).outputs).filter(([k])=>['AH','BH','OH','PD'].includes(k)).map(([k,v])=>k+' → '+v).join('; ')}<br>SHA-256: ${r.sha256}</p></details></article>`}
function requestFromForm(){const data=new FormData($('#search-form')),q={en81:$('#apply-en81').checked};for(const [k,v] of data){if(v==='')continue;q[k]=['application','entrance','fire','safety','doorType'].includes(k)?v:Number(v)}return validateRequest(q)}
function renderResults(result){lastResult=result;$('#result-title').textContent=result.results.length?'Phương án':'Chưa có phương án';$('#result-count').textContent=String(result.results.length).padStart(2,'0');const q=result.request;$('#status').textContent=q.travel==null?'Hành trình giả định: 30 m':'';$('#cards').innerHTML=(result.results.length?result.results.map((r,i)=>card(r,i)).join(''):'<div class="empty"><h3>Chưa có cấu hình phù hợp.</h3><p>Thử tải trọng khác hoặc nới kích thước giếng.</p></div>');$('#excluded').innerHTML=result.excluded.length?`<details><summary>${result.excluded.length} dòng chưa có phương án</summary><ul>${result.excluded.map(e=>`<li><strong>${esc(e.model)}</strong>: ${esc(e.reason)}</li>`).join('')}</ul></details>`:'';}
function runSearch(q){validateRequest(q);if(pending){pending.reject(new Error('Đã thay bằng yêu cầu mới.'));pending=null}worker?.terminate();worker=new Worker('./worker.mjs?v=20260921-compact',{type:'module'});const id=++serial;$('#search-button').disabled=true;$('#form-error').textContent='';$('#status').textContent='Đang đối chiếu công thức và kích thước…';$('#cards').innerHTML='';$('#excluded').innerHTML='';$('#result-title').textContent='Đang tính…';$('#result-count').textContent='';lastResult=null;return new Promise((resolve,reject)=>{pending={resolve,reject};const fail=message=>{$('#search-button').disabled=false;$('#form-error').textContent=message;$('#status').textContent='Chưa có kết quả cho yêu cầu này.';pending=null;reject(new Error(message))};worker.onerror=e=>fail('Không thể chạy bộ tính. Vui lòng tải lại trang.');worker.onmessage=({data})=>{if(data.id!==serial)return;if(data.progress){$('#status').textContent='Đã kiểm tra '+data.progress.model+'…';return}$('#search-button').disabled=false;if(data.error){fail(data.error);return}renderResults(data.result);pending=null;resolve(data.result)};worker.postMessage({id,request:q})})}
$('#search-form').addEventListener('submit',event=>{event.preventDefault();try{runSearch(requestFromForm()).catch(()=>{})}catch(error){$('#form-error').textContent=error.message}});
document.querySelectorAll('[data-cap]').forEach(button=>button.addEventListener('click',()=>{$('#capacity').value=button.dataset.cap;$('#search-form').requestSubmit()}));
$('#reset').addEventListener('click',()=>{HTMLFormElement.prototype.reset.call($('#search-form'));$('#search-form').requestSubmit()});
function mode(which){const check=which==='check';$('#choose-view').hidden=check;$('#check-view').hidden=!check;$('#choose-tab').classList.toggle('active',!check);$('#check-tab').classList.toggle('active',check);$('#choose-tab').setAttribute('aria-selected',!check);$('#check-tab').setAttribute('aria-selected',check);if(check&&!technical)loadTechnical(models[3].id)}
$('#choose-tab').onclick=()=>mode('choose');$('#check-tab').onclick=()=>mode('check');
$('#model-select').innerHTML=models.map(m=>`<option value="${esc(m.id)}">${esc(m.id)}</option>`).join('');
function technicalFields(r){$('#technical-fields').innerHTML=Object.entries(r.inputs).map(([k,v])=>{const opts=r.options[k],numeric=typeof v==='number'&&k!=='DRE';return `<label for="tech-${k}">${esc(labels[k]??k)} <span>${k} · ${unit(k)}</span></label>${opts?`<select id="tech-${k}" name="${k}">${[...new Set([v,...opts])].map(o=>`<option value="${esc(o)}" ${o===v?'selected':''}>${esc(display(o))}${!opts.includes(o)?' — ngoài danh sách':''}</option>`).join('')}</select>`:`<input id="tech-${k}" name="${k}" type="${numeric?'number':'text'}" ${numeric?'step="any"':''} value="${esc(v)}" required>`}`}).join('');}
function loadTechnical(modelId,inputs={}){$('#model-select').value=modelId;technical=evaluate(modelId,inputs,{en81:$('#apply-en81').checked});technicalFields(technical);renderTechnical()}
function renderTechnical(){$('#technical-results').innerHTML=technical.errors.length?`<h2>Cần điều chỉnh cấu hình</h2>${areaPanel(technical.area)}<p>Chưa xuất kích thước vì có điều kiện không hợp lệ.</p>${technical.errors.map(e=>`<div class="technical-error">${esc(e.text)}<br><code>${esc(e.cell)}</code></div>`).join('')}`:card(technical,0,true);}
$('#model-select').onchange=()=>loadTechnical($('#model-select').value);
$('#technical-form').onsubmit=event=>{event.preventDefault();const inputs={};for(const [k,v] of new FormData(event.currentTarget)){const original=technical.inputs[k];inputs[k]=k==='DRE'?(v==='Default'?v:Number(v)):typeof original==='number'?Number(v):v}try{loadTechnical(technical.model,inputs)}catch(error){$('#technical-results').innerHTML=`<p class="error">${esc(error.message)}</p>`}};
$('#cards').addEventListener('click',event=>{const button=event.target.closest('[data-inspect]');if(!button||!lastResult)return;const r=lastResult.results[Number(button.dataset.inspect)];loadTechnical(r.model,r.inputs);mode('check');$('#check-tab').focus()});
if(new Date()>new Date('2026-12-31T23:59:59+07:00')){$('#validity').textContent='Bộ quy tắc đã hết hiệu lực ngày 31/12/2026. Cần cập nhật từ Shanghai Mitsubishi.';$('#validity').classList.add('error')}
$('#apply-en81').onchange=()=>{saveEn81();if(technical)$('#technical-form').requestSubmit();$('#search-form').requestSubmit()};
$('#search-form').requestSubmit();
if(document.modelContext?.registerTool){
 const lifetime=new AbortController();
 const properties={en81:{type:'boolean',description:'Bật bộ lọc diện tích EN 81-20; mặc định bật.'},doorType:{type:'string',enum:['auto','CO','SO','2CO']},capacity:{type:'number',exclusiveMinimum:0,maximum:10000},application:{type:'string',enum:['all','passenger','goods','forklift','car']},entrance:{type:'string',enum:['1D1G','1D/2D-2G']},fire:{type:'string',enum:['NO','YES']},safety:{type:'string',enum:['NO','YES']},decoration:{type:'number',enum:[0,100,200,300,400]},margin:{type:'number',minimum:0}};
 for(const k of ['width','depth','overhead','pit','travel','speed','doorWidth','carWidth','carDepth'])properties[k]={type:'number',exclusiveMinimum:0};
 try{Promise.resolve(document.modelContext.registerTool({name:'find_elevator_configurations',title:'Tìm cấu hình thang máy',description:'Đặt điều kiện trong giao diện và tìm cấu hình sơ bộ từ sáu bảng tính Shanghai Mitsubishi. Chỉ đánh giá bố trí hình học, không xác nhận đặt hàng.',inputSchema:{type:'object',properties,required:['capacity'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async input=>{
  if(Object.keys(input).some(k=>!Object.hasOwn(properties,k)))throw new Error('Có trường không được hỗ trợ.');
  validateRequest(input);for(const [k,v] of Object.entries(input)){if(k==='en81')continue;const field=$('#search-form').elements.namedItem(k);if(field.tagName==='SELECT'&&![...field.options].some(o=>o.value===String(v)))throw new Error('Giá trị không được hỗ trợ: '+k)}HTMLFormElement.prototype.reset.call($('#search-form'));for(const [k,v] of Object.entries(input)){if(k==='en81'){$('#apply-en81').checked=v;saveEn81();if(technical)$('#technical-form').requestSubmit()}else $('#search-form').elements.namedItem(k).value=v}mode('choose');const r=await runSearch({...input,en81:$('#apply-en81').checked});return {results:r.results.map(x=>({model:x.model,en81:x.en81,inputs:x.inputs,dimensions:x.outputs,area:x.area})),excluded:r.excluded,assumptions:'Tìm nhanh theo giả định hiển thị; cần xác nhận phi tiêu chuẩn và kích thước chưa cung cấp.'};
 }},{signal:lifetime.signal})).catch(()=>{});}catch{}
 window.addEventListener('pagehide',()=>lifetime.abort(),{once:true});
}

const cadDialog=document.createElement('dialog');cadDialog.className='cad-dialog';
cadDialog.innerHTML='<div class="cad-toolbar"><h2>Bản vẽ CAD dự thảo</h2><button type="button" data-close>Đóng</button></div><label class="cad-kind">Loại bản vẽ <select data-cad-kind><option value="pair">Mặt bằng + mặt cắt · chung một file</option><option value="plan">Mặt bằng cabin</option><option value="section">Mặt cắt theo số điểm dừng</option></select></label><details class="cad-help"><summary>Thông tin thêm</summary><p data-cad-description></p><p class="cad-details"></p><p>DWG mở bằng AutoCAD, đơn vị mm. Bản vẽ dự thảo; kiểm tra thiết bị và thông số công trình trước khi sử dụng.</p></details><form class="cad-geometry-form"></form><p class="cad-error" role="alert"></p><p class="cad-summary" role="status"></p><div class="cad-toolbar cad-zoom"><span>Xem bản vẽ</span><div><button type="button" data-zoom="1">Vừa khung</button> <button type="button" data-zoom="2">Phóng to 2×</button> <button type="button" data-zoom="3">3×</button></div></div><div class="cad-preview"></div><div class="cad-toolbar"><button type="button" data-download>Tải CAD (.dwg)</button><span role="status" class="cad-status"></span></div>';
document.body.append(cadDialog);let cadDrawing=null,cadResult=null,cadExportBusy=false;
let cadPreferences={};try{cadPreferences=JSON.parse(localStorage.getItem('viet-chao.cad-project')??'{}')??{}}catch{}
if(typeof cadPreferences!=='object'||Array.isArray(cadPreferences))cadPreferences={};
const cadForm=cadDialog.querySelector('form'),cadKind=()=>cadDialog.querySelector('[data-cad-kind]').value;
cadDialog.querySelector('[data-close]').onclick=()=>cadDialog.close();
cadDialog.querySelectorAll('[data-zoom]').forEach(button=>button.onclick=()=>{const svg=cadDialog.querySelector('.cad-preview svg');if(svg)svg.style.width=(Number(button.dataset.zoom)*100)+'%'});
function cadOptions(){return Object.fromEntries([...new FormData(cadForm)].map(([k,v])=>[k,['floorHeights','machineRoomHeight','orientation'].includes(k)?v:Number(v)]))}
function renderCad(manual={}){
 cadDrawing=null;cadDialog.querySelector('[data-download]').disabled=true;cadDialog.querySelector('.cad-preview').innerHTML='';cadDialog.querySelector('.cad-error').textContent='';cadDialog.querySelector('.cad-status').textContent='';cadDialog.querySelector('.cad-summary').textContent='';cadDialog.querySelector('.cad-details').textContent='';
 try{
  cadDrawing=cadKind()==='pair'?drawingPairFor(cadResult,manual):cadKind()==='section'?sectionDrawingFor(cadResult,manual):drawingFor(cadResult,manual);
  cadResult=cadDrawing.result;
  for(const key of ['stops','floorHeight','floorHeights','wallThickness','openingAllowance'])if(manual[key]!=null)cadPreferences[key]=manual[key];
  try{localStorage.setItem('viet-chao.cad-project',JSON.stringify(cadPreferences))}catch{}
  cadDialog.querySelector('.cad-preview').innerHTML=toSvg(cadDrawing);
  cadDialog.querySelector('[data-download]').disabled=cadExportBusy;
  const o=cadResult.outputs,sg=cadDrawing.sheets?.section.geometry??cadDrawing.geometry;
  cadDialog.querySelector('.cad-summary').textContent=(cadKind()!=='plan'?`${sg.stops} điểm dừng · ${format(sg.travel/1000)} m · `:'')+`Giếng ${format(o.AH)} × ${format(o.BH)} · OH ${format(o.OH)} · PIT ${format(o.PD)} mm`;
  cadDialog.querySelector('.cad-details').textContent=(cadKind()!=='plan'?sg.warnings.join(' '):'')+' ';
 const refs=cadDrawing.sheets?[cadDrawing.sheets.plan.reference,cadDrawing.sheets.section.reference]:[cadDrawing.reference];
  cadDialog.querySelector('.cad-details').textContent+=' '+refs.map((ref,n)=>(cadDrawing.sheets?(n?'Mặt cắt: ':'Mặt bằng: '):'Mẫu: ')+(ref.file??ref.basis)+(ref.issues.length?' '+ref.issues.join(' '):'')).join(' · ');
 }catch(error){cadDialog.querySelector('.cad-error').textContent=error.message}
}
function selectCadKind(){
 const section=cadKind()!=='plan';
 for(const fieldset of cadForm.querySelectorAll('fieldset')){const active=cadKind()==='pair'||fieldset.dataset.kind===cadKind();fieldset.hidden=!active;fieldset.disabled=!active}
 cadForm.elements.wallThickness.min=section?'1':'0';
 cadForm.querySelector('[type="submit"]').textContent=cadKind()==='pair'?'Dựng cả hai bản vẽ':section?'Dựng mặt cắt':'Dựng mặt bằng';
 cadDialog.querySelector('[data-cad-description]').textContent=section?'Mặt cắt đứng theo mẫu SMEC: tầng cao phía trên, PIT phía dưới. Nhập số điểm dừng và chiều cao tầng; hai bản vẽ dùng chung cấu hình đã tính lại.':'Mặt bằng cabin trong giếng, có tim cửa, tim cabin, tim ray và tim đối trọng. Đơn vị mm; hình học 1:1.';
 renderCad(cadOptions());
}
cadDialog.querySelector('[data-cad-kind]').onchange=selectCadKind;
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-cad]');if(!button)return;
 cadDrawing=null;cadResult=button.dataset.cad==='technical'?technical:lastResult.results[Number(button.dataset.cad)];
 let required=[];try{required=planGeometry(cadResult).required}catch{}
 const mrl=cadResult.model.startsWith('LEHY-L-');
 cadForm.innerHTML='<label>Dày vách / sàn dự thảo · mm<input name="wallThickness" type="number" min="0" max="1000" value="200" required></label><fieldset data-kind="plan"><label>Chừa cửa: cộng thêm vào JJ · mm<input name="openingAllowance" type="number" min="0" max="1000" value="200" required></label>'+ (required.length?'<p>Nhập các tọa độ thiếu theo bản kỹ thuật: gốc tại góc trong trái, phía cửa trước.</p>':'')+required.map(k=>`<label>${esc(geometryLabels[k])} · mm<input name="${k}" type="number" min="0.001" step="any" required></label>`).join('')+'</fieldset><fieldset data-kind="section"><label>Số điểm dừng<input name="stops" type="number" min="2" max="60" step="1" value="5" required></label><label>Chiều cao tầng mặc định · mm<input name="floorHeight" type="number" min="1" step="any" value="3300" required></label><details class="cad-floor-options"><summary>Tầng cao khác nhau / phòng máy</summary><label>Chiều cao từng khoảng tầng, từ dưới lên · mm<input name="floorHeights" type="text" placeholder="Ví dụ 4200; 3300; 3300; 3600"></label><small>Để trống dùng chiều cao mặc định. Với 5 điểm dừng, nhập 4 số cách nhau bằng dấu ; hoặc dấu cách.</small><label data-machine-room>Cao phòng máy · mm<input name="machineRoomHeight" type="number" min="0" max="10000" step="any" placeholder="Theo HM nguồn nếu có; còn lại chưa bố trí"></label></details></fieldset><button type="submit">Dựng bản vẽ</button>';
 for(const key of ['stops','floorHeight','floorHeights','wallThickness','openingAllowance'])if(cadPreferences[key]!=null)cadForm.elements[key].value=cadPreferences[key];
 const roomLabel=cadForm.querySelector('[data-machine-room]');roomLabel.hidden=mrl;roomLabel.querySelector('input').disabled=mrl;
 selectCadKind();cadDialog.showModal();
});
cadForm.onsubmit=event=>{event.preventDefault();renderCad(cadOptions())};
cadForm.oninput=()=>{cadDrawing=null;cadDialog.querySelector('[data-download]').disabled=true;cadDialog.querySelector('.cad-summary').textContent='';cadDialog.querySelector('.cad-status').textContent='Cần dựng lại bản vẽ.'};
cadDialog.querySelector('[data-download]').onclick=async()=>{
 if(!cadDrawing||cadExportBusy)return;
 const drawing=cadDrawing,button=cadDialog.querySelector('[data-download]'),status=cadDialog.querySelector('.cad-status');
 cadExportBusy=true;button.disabled=true;status.textContent='Đang tạo DWG…';
 try{
  const bytes=await toDwg(toDxf(drawing));
  if(cadDrawing!==drawing||!cadDialog.open)return;
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/acad'})),a=document.createElement('a');
  a.href=url;a.download=drawing.filename+'.dwg';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);status.textContent='Đã tạo DWG.';
 }catch(error){if(cadDrawing===drawing&&cadDialog.open)status.textContent=error.message}
 finally{cadExportBusy=false;button.disabled=!cadDrawing}
};
