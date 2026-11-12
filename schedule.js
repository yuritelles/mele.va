export const dayNumber = date => Date.parse(date + 'T00:00:00Z') / 86400000;
// Associations come from the original timeline, so editing a time never reassigns a wait.
export function associateWaits(days) {
  const all = days.flatMap(day => day.blocks.map(b => ({...b, date:day.date, a:dayNumber(day.date)*1440+b.start, z:dayNumber(day.date)*1440+b.end}))).sort((a,b)=>a.a-b.a);
  const links = new Map();
  const preps = all.filter(b=>b.kind==='prep');
  const mains = all.filter(b=>b.kind==='main');
  for (const prep of preps) {
    let a=prep.a,z=prep.z,changed=true;
    while(changed){changed=false;for(const p of preps){if(p.category!==prep.category)continue;if(p.z===a && p.a<a){a=p.a;changed=true;}if(p.a===z && p.z>z){z=p.z;changed=true;}}}
    const before=mains.find(b=>b.category===prep.category && b.a===z);
    const after=mains.find(b=>b.category===prep.category && b.z===a);
    const owner=before || after;
    if(owner) links.set(prep.id,{id:owner.id,date:owner.date,side:before?'before':'after'});
  }
  return links;
}
export function schedule(days, rawFor, links) {
  const raw=days.flatMap(day=>rawFor(day).map(b=>({...b,date:day.date})));
  const waits=new Map();
  for(const b of raw){const link=links.get(b.id);if(!link)continue;const w=waits.get(link.id)||{before:0,after:0};w[link.side]+=b.end-b.start;waits.set(link.id,w);}
  return raw.filter(b=>!links.has(b.id)).map(b=>({...b,kind:b.kind==='prep'?'main':b.kind,waitBefore:b.waitBefore??waits.get(b.id)?.before??0,waitAfter:b.waitAfter??waits.get(b.id)?.after??0}));
}
export function occupied(items, date) {
  const base=dayNumber(date)*1440;
  return items.flatMap(b=>{
    const offset=dayNumber(b.date)*1440-base;
    const start=offset+b.start-(b.waitBefore||0),end=offset+b.end+(b.waitAfter||0);
    if(end<=0 || start>=1440)return [];
    return [{...b,start:Math.max(0,start),end:Math.min(1440,end)}];
  }).sort((a,b)=>a.start-b.start||a.end-b.end);
}

export function transferOwners(items) {
  const sorted=[...items].sort((a,b)=>dayNumber(a.date)*1440+a.start-dayNumber(b.date)*1440-b.start);
  const owners=new Map();let previous;
  for(const item of sorted){if(item.kind==='transfer'){if(previous)owners.set(item.id,previous.id);}else previous=item;}
  return owners;
}
export function normalizeMode(value='') {
  if(['walk','car','rail','ferry','bike'].includes(value))return value;
  if(/pé|walk|caminh/i.test(value))return 'walk';
  if(/car|táxi|taxi|uber|didi/i.test(value))return 'car';
  if(/trem|metr|train|rail/i.test(value))return 'rail';
  if(/balsa|ferry|barco/i.test(value))return 'ferry';
  if(/bici|bike/i.test(value))return 'bike';
  return '';
}
export function connectActivities(items, owners, patches={}) {
  const ordered=[...items].sort((a,b)=>dayNumber(a.date)*1440+a.start-dayNumber(b.date)*1440-b.start);
  const first=ordered.findIndex(b=>b.kind!=='transfer');
  const last=ordered.findLastIndex(b=>b.kind!=='transfer');
  items=ordered.map((b,i)=>b.kind==='transfer'&&(i<first||i>last)?{...b,kind:'main',title:i<first?'Deslocamento inicial':'Deslocamento final',category:'transport'}:b);
  const mains=items.filter(b=>b.kind!=='transfer').sort((a,b)=>dayNumber(a.date)*1440+a.start-dayNumber(b.date)*1440-b.start||a.end-b.end);
  const result=[];
  for(let i=0;i<mains.length;i++){
    const main=mains[i];result.push(main);
    if(i===mains.length-1)continue;
    const id='user-link-'+main.id;
    const legacy=items.filter(b=>b.kind==='transfer'&&owners.get(b.id)===main.id);
    const candidate=Object.values(patches).map(day=>day[id]).find(Boolean);
    const saved=candidate?.kind==='transfer' && Number.isInteger(candidate.travelMinutes) && candidate.travelMinutes>=0 && candidate.travelMinutes<=1440 ? candidate : null;
    const minutes=saved ? saved.travelMinutes : legacy.reduce((sum,b)=>sum+b.end-b.start,0);
    const start=main.end+(main.waitAfter||0);
    result.push({id,date:main.date,afterId:main.id,nextId:mains[i+1].id,kind:'transfer',category:'',title:'Deslocamento',start,end:start+minutes,travelMinutes:minutes,mode:normalizeMode(saved?saved.mode:legacy.find(b=>b.mode)?.mode),note:saved?.note||legacy.map(b=>b.note).filter(Boolean).join(' · ').slice(0,400),waitBefore:0,waitAfter:0});
  }
  return result;
}
