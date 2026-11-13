const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const norm=x=>String(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function mergeBackup(input,current,dataset,valid){
 if(input.format!=='asia-2027-backup-v1'||!object(input.state)||!Array.isArray(input.restaurants))throw Error('Use o arquivo de backup exportado pelo mele.va.');
 const merged=structuredClone(current),conflicts=[];let additions=0;
 for(const [date,patches] of Object.entries(input.state)){
  if(!dataset.days.some(d=>d.date===date)||!object(patches))throw Error('Data inválida.');
  for(const [id,item] of Object.entries(patches)){
   if(['__proto__','prototype','constructor'].includes(id)||item!==null&&!valid(item,id))throw Error('Atividade inválida.');
   const existing=current.state[date]?.[id];const apply=()=>{merged.state[date]??={};merged.state[date][id]=item;};
   if(existing!==undefined&&!equal(existing,item))conflicts.push({title:date+' · '+(item?.title||existing?.title||'Atividade excluída'),existing,incoming:item,apply});
   else if(existing===undefined){apply();additions++;}
  }
 }
 const ids=new Set();
 for(const item of input.restaurants){
  if(!object(item)||typeof item.id!=='string'||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>120||typeof item.note!=='string'||item.note.length>600||!dataset.days.some(d=>d.cities.includes(item.city)))throw Error('Restaurante inválido.');ids.add(item.id);
  const index=merged.restaurants.findIndex(r=>r.id===item.id||norm(r.city+'|'+r.name)===norm(item.city+'|'+item.name));
  if(index<0){merged.restaurants.push(item);additions++;}else if(!equal(merged.restaurants[index],item))conflicts.push({title:item.city+' · '+item.name,existing:merged.restaurants[index],incoming:item,apply:()=>{merged.restaurants[index]=item;}});
 }
 return {merged,conflicts,additions};
}
function describe(item){if(item===null)return 'Excluída';if(item.name)return item.name+'\n'+(item.note||'');const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');return `${item.title}\n${clock(item.start)} – ${clock(item.end)}\nEspera antes: ${item.waitBefore||0} min · depois: ${item.waitAfter||0} min\n${item.waitBeforeLabel||''} · ${item.waitAfterLabel||''}\n${item.note||''}`+(item.kind==='transfer'?`\n${item.travelMinutes} min · ${item.mode||''}`:'');}
export function prepareImport(input,current,dataset,valid,save){
 const result=mergeBackup(input,current,dataset,valid),dialog=document.querySelector('#import-dialog'),root=document.querySelector('#import-comparison'),message=document.querySelector('#import-message'),button=document.querySelector('#import-save'),radios=[];
 root.replaceChildren();message.textContent=`${result.additions} inclusões e ${result.conflicts.length} diferenças para revisar.`;
 result.conflicts.forEach((c,i)=>{const section=document.createElement('section');section.className='import-row';const h=document.createElement('strong');h.textContent=c.title;section.append(h);
 for(const [value,label,item] of [['cloud','Manter na nuvem',c.existing],['file','Usar arquivo',c.incoming]]){const line=document.createElement('label'),radio=document.createElement('input'),detail=document.createElement('pre');radio.type='radio';radio.name='conflict-'+i;radio.value=value;radio.checked=value==='cloud';if(value==='file')radios[i]=radio;line.append(radio,document.createTextNode(' '+label));detail.textContent=describe(item);line.append(detail);section.append(line);}root.append(section);});
 document.querySelector('#import-cancel').onclick=()=>dialog.close();button.disabled=false;
 button.onclick=async()=>{button.disabled=true;try{const fresh=mergeBackup(input,current,dataset,valid);fresh.conflicts.forEach((c,i)=>{if(radios[i].checked)c.apply();});await save(fresh.merged);dialog.close();}catch(e){message.textContent=e.message;}finally{button.disabled=false;}};dialog.showModal();
}
