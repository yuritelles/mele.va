import './imports.js';
import {activeTrip,canEdit} from './trips.js';
import {client,loadTrip,saveTrip,watchTrip} from './cloud.js';
import {prepareImport} from './migration.js';
import { associateWaits, schedule, occupied, dayNumber, transferOwners, connectActivities, normalizeMode } from './schedule.js';
const categories = { transport: 'Transporte', tour: 'Passeio', meal: 'Refeição', hotel: 'Hotel' };
const kinds = { main: 'Atividade principal', prep: 'Preparação / espera', transfer: 'Deslocamento' };
const weekdays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const currencyFormat = new Map();
const storageKey = 'asia-2027-timeline-edits-v1';
const root = document.querySelector('#content');
const dialog = document.querySelector('#edit-dialog');
const editor = document.querySelector('#edit-form');
const toast = document.querySelector('#toast');
let dataset;
let waitLinks;
let travelOwners;
let cities;
let state = {};
let selected = '2027-03-26';
let cityFilter = '';
let reserveCategory = '';
let showDetails = false;
let editing;
let returnFocus;
let toastTimer;
let restaurantCity = '';
let restaurants = [];
let restaurantEditing;
const restaurantKey = 'asia-2027-restaurants-v1';

function safe(value = '') {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, character => entities[character]);
}

function clock(minutes) {
  return [Math.floor(minutes / 60), minutes % 60].map(value => String(value).padStart(2, '0')).join(':');
}

function range(item) {
  return item.start === item.end ? waitClock(item.start) : `${waitClock(item.start)}–${waitClock(item.end)}`;
}

function shortDate(date, verbose = false) {
  const [, month, day] = date.split('-');
  return verbose ? `${day} ${months[Number(month) - 1]}` : `${day}/${month}`;
}

function money(currency, amount) {
  if (!currencyFormat.has(currency)) {
    currencyFormat.set(currency, new Intl.NumberFormat('pt-BR', { style: 'currency', currency }));
  }
  return currencyFormat.get(currency).format(amount);
}

function duration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} h` : '', rest ? `${rest} min` : ''].filter(Boolean).join(' ');
}

function sortBlocks(a, b) {
  return a.start - b.start || a.end - b.end || a.title.localeCompare(b.title, 'pt-BR');
}

function validEdit(item, id) {
  return item && item.id === id && typeof item.title === 'string' && item.title.trim().length > 0 &&
    item.title.length <= 120 && typeof item.note === 'string' && item.note.length <= 600 &&
    (item.kind === 'transfer' || Object.hasOwn(categories, item.category)) && Object.hasOwn(kinds, item.kind) &&
    Number.isInteger(item.start) && Number.isInteger(item.end) &&
    item.start >= 0 && (item.kind==='transfer' ? Number.isInteger(item.travelMinutes) && item.travelMinutes>=0 && item.travelMinutes<=1440 : item.end<=43200) && item.start <= item.end &&
    ['waitBefore','waitAfter'].every(key=>item[key]===undefined || Number.isInteger(item[key]) && item[key]>=0 && item[key]<=1440);
}

function rawBlocksFor(day) {
  const patches = state?.[day.date] || {};
  const originalIds = new Set(day.blocks.map(block => block.id));
  const blocks = day.blocks.flatMap(block => {
    const edit = patches[block.id];
    if (edit === null) return [];
    return validEdit(edit, block.id) ? [{ ...block, ...edit }] : [block];
  });
  for (const [id, edit] of Object.entries(patches)) {
    if (!(id.startsWith('user-link-') && edit?.kind==='transfer') && !originalIds.has(id) && /^(?:user|import)-[a-zA-Z0-9-]+$/.test(id) && validEdit(edit, id)) blocks.push(edit);
  }
  return blocks.sort(sortBlocks);
}

function baseActivities() {
  const items=schedule(dataset.days, rawBlocksFor, waitLinks);
  const removed=new Set();
  for(let i=0;i<dataset.days.length-1;i++){
    const day=dataset.days[i],next=dataset.days[i+1];
    const first=day.blocks.find(b=>b.kind==='main'&&b.category==='hotel'&&b.end===1440&&b.title==='Descanso no hotel');
    const second=next.blocks.find(b=>b.kind==='main'&&b.category==='hotel'&&b.start===0&&b.title==='Descanso no hotel');
    if(!first||!second||state[day.date]?.[first.id]!==undefined||state[next.date]?.[second.id]!==undefined)continue;
    const x=items.find(b=>b.id===first.id),y=items.find(b=>b.id===second.id);
    if(x&&y){x.end=1440+y.end;x.waitAfter=y.waitAfter;x.mergedIds=[{id:y.id,date:y.date}];removed.add(y.id);}
  }
  const owners=new Map(travelOwners);
  for(const item of items)for(const part of item.mergedIds||[])for(const [id,owner] of owners)if(owner===part.id)owners.set(id,item.id);
  return connectActivities(items.filter(b=>!removed.has(b.id)),owners,state);
}
function dayPlan(day, base=baseActivities()) {
  const occ=occupied(base,day.date);
  const gaps=gapsFor(occ);const extras=[];
  for(const gap of gaps){
    const next=occ.find(b=>b.kind!=='transfer'&&b.start>=gap.end);
    gap.id='gap-'+day.date+'-'+(next?.id||'end');gap.date=day.date;
    const id='user-link-'+gap.id;
    const saved=state[day.date]?.[id];
    const minutes=saved?.kind==='transfer'&&Number.isInteger(saved.travelMinutes)?Math.max(0,Math.min(1440,saved.travelMinutes)):0;
    const end=gap.end;gap.end=Math.max(gap.start,end-minutes);
    extras.push({id,date:day.date,afterId:gap.id,kind:'transfer',category:'',title:'Deslocamento',start:gap.end,end:gap.end+minutes,travelMinutes:minutes,mode:saved?.mode||'',note:saved?.note||'',waitBefore:0,waitAfter:0});
    const prev=occ.filter(b=>b.kind!=='transfer'&&b.end<=gap.start).at(-1);
    if(prev&&!base.some(b=>b.afterId===prev.id)){
      const inboundId='user-link-'+prev.id,inbound=state[day.date]?.[inboundId];
      const duration=inbound?.kind==='transfer'?Math.max(0,Math.min(1440,inbound.travelMinutes||0)):0;
      extras.push({id:inboundId,date:day.date,afterId:prev.id,kind:'transfer',category:'',title:'Deslocamento',start:gap.start,end:gap.start+duration,travelMinutes:duration,mode:inbound?.mode||'',note:inbound?.note||'',waitBefore:0,waitAfter:0});
      gap.start=Math.min(gap.end,gap.start+duration);
    }
  }
  return {gaps:gaps.filter(gap=>gap.end>gap.start),extras};
}
function allActivities(){const base=baseActivities();return [...base,...dataset.days.flatMap(day=>dayPlan(day,base).extras)];}
function blocksFor(day) {
  return allActivities().flatMap(b=>{
    const offset=(dayNumber(b.date)-dayNumber(day.date))*1440;
    if(offset+b.end+(b.waitAfter||0)<=0 || offset+b.start-(b.waitBefore||0)>=1440)return [];
    return [{...b,start:b.start+offset,end:b.end+offset,sourceDate:b.date}];
  });
}
function occupiedFor(day){return occupied(allActivities(),day.date);}
function waitClock(value) {
  const delta=Math.floor(value/1440);
  return clock((value%1440+1440)%1440)+(delta<0?' D'+delta:delta>0?' D+'+delta:'');
}

function conflictsFor(blocks) {
  blocks=blocks.filter(b=>b.kind!=='transfer'||b.end>b.start);
  const hits = new Map();
  for (let index = 0; index < blocks.length; index++) {
    const first = blocks[index];
    for (const second of blocks.slice(index + 1)) {
      if(first.afterId===second.id || second.afterId===first.id)continue;
      if (second.start >= first.end && first.start !== first.end) break;
      if (first.start === first.end && second.start > first.start) break;
      const point = first.start === first.end ? first : second.start === second.end ? second : null;
      if (point) {
        const other = point === first ? second : first;
        if (point.start < other.start || point.start >= other.end) continue;
      }
      for (const [block, overlap] of [[first, second], [second, first]]) {
        if (!hits.has(block.id)) hits.set(block.id, []);
        hits.get(block.id).push(overlap);
      }
    }
  }
  return hits;
}

function gapsFor(blocks) {
  const gaps = [];
  let occupiedUntil = 0;
  for (const block of blocks) {
    if (block.start > occupiedUntil) {
      gaps.push({ id: `gap-${occupiedUntil}`, start: occupiedUntil, end: block.start, gap: true, title: 'Sem planejamento' });
    }
    occupiedUntil = Math.max(occupiedUntil, block.end);
  }
  if (occupiedUntil < 1440) gaps.push({ id: `gap-${occupiedUntil}`, start: occupiedUntil, end: 1440, gap: true, title: 'Sem planejamento' });
  return gaps;
}

function matchesDay(day) {
  return !cityFilter || day.cities.includes(cityFilter);
}

function cityOptions() {
  return '<option value="">Todas as cidades</option>' + cities.map(city =>
    `<option value="${safe(city)}" ${city === cityFilter ? 'selected' : ''}>${safe(city)}</option>`
  ).join('');
}

function tag(block) {
  if (block.status === 'reference') return '<span class="badge reference">▣ Referência</span>';
  if (block.locked) return '<span class="badge confirmed">▣ Reservado</span>';
  if (block.kind === 'main') return '<span class="edithint">Editar</span>';
  return '';
}

function blockMarkup(block, conflicts) {
  if(block.carry) return `<div class="entry wait-row" id="item-${block.id}"><span class="time subtle">${range(block)}</span><button class="side-link" data-day="${block.date}">Espera · ${safe(block.title)} ↗${conflicts.has(block.id)?' · Conflito':''}</button></div>`;
  if(block.kind==='transfer' && !block.gap) return `<div class="entry transfer-row" id="item-${block.id}"><span class="time subtle" aria-hidden="true"></span><button type="button" class="transfer-link" data-edit="${block.id}">${duration(block.end-block.start)||'0 min'}${block.mode?' · '+safe(modeNames[block.mode] || block.mode):''}${conflicts.has(block.id)?' <span class="badge conflict">Conflito</span>':''}<span class="sr-only"> · Editar deslocamento</span></button></div>`;
  const classes = block.gap ? 'is-gap' : `${block.category} main`;
  const secondary = block.gap ? duration(block.end - block.start) : [block.code,block.note].filter(Boolean).join(' · ');
  const wait=(side,minutes)=>minutes?`<div class="entry wait-row wait-${side}"><span class="time subtle">${side==='before'?waitClock(block.start-minutes)+'–'+waitClock(block.start):waitClock(block.end)+'–'+waitClock(block.end+minutes)}</span><button type="button" class="wait-link ${block.category} prep" data-edit="${block.id}">${duration(minutes)} · ${safe(block[side==='before'?'waitBeforeLabel':'waitAfterLabel'] || (side==='before'?'Preparação / espera':'Espera / saída'))}</button></div>`:'';
  return `<div class="activity-group ${block.gap ? 'gap-group' : block.category} ${block.waitBefore ? 'has-before' : ''} ${block.waitAfter ? 'has-after' : ''}" id="item-${block.id}">${wait('before',block.waitBefore)}<div class="entry main-entry"><span class="time main-time">${range(block)}</span><button type="button" class="activity ${classes}" data-edit="${block.id}"><span><span class="activity-title">${safe(block.title)}</span>${secondary?`<small>${safe(secondary)}</small>`:''}</span><span>${conflicts.has(block.id)?'<span class="badge conflict">Conflito</span>':''}${block.gap?'<span class="edithint">+ Planejar</span>':tag(block)}</span></button></div>${wait('after',block.waitAfter)}</div>`;
}

function timelineView() {
  const visibleDays = dataset.days;
  const index = visibleDays.findIndex(day => day.date === selected);
  const day = visibleDays[index];
  if (!day.cities.includes(restaurantCity) && !restaurantCity) restaurantCity = (cities.includes(day.overnight) ? day.overnight : day.cities[0]);
  const blocks = blocksFor(day);
  const occupiedBlocks = occupiedFor(day);
  const conflicts = conflictsFor(occupiedBlocks);
  const gaps = dayPlan(day).gaps;
  const carry = [];
  const mainEntries=[...blocks.filter(b=>b.kind!=='transfer'),...gaps].sort((a,b)=>(a.start-(a.waitBefore||0))-(b.start-(b.waitBefore||0))||a.end-b.end);
  const entries=mainEntries.flatMap(b=>[b,...blocks.filter(t=>t.kind==='transfer'&&t.afterId===b.id)]);
  for(const transfer of blocks.filter(t=>t.kind==='transfer'&&!mainEntries.some(b=>b.id===t.afterId)))entries.unshift(transfer);
  const barEntries=allActivities().flatMap(b=>{
    const offset=(dayNumber(b.date)-dayNumber(selected))*1440;
    return [{...b,start:offset+b.start,end:offset+b.end},{...b,start:offset+b.start-b.waitBefore,end:offset+b.start,kind:'prep'},{...b,start:offset+b.end,end:offset+b.end+b.waitAfter,kind:'prep'}].filter(p=>(p.end>p.start || p.kind==='main') && p.end>=0 && p.start<1440).map(p=>({...p,start:Math.max(0,p.start),end:Math.min(1440,p.end)}));
  });
  const conflictText = occupiedBlocks.flatMap(block => (conflicts.get(block.id) || [])
    .filter(other => block.id < other.id)
    .map(other => `<p class="note warning">${safe(block.title)} e ${safe(other.title)} se sobrepõem, incluindo esperas (${range(block)} / ${range(other)}).</p>`));
  const stay = dataset.reservations.find(item => item.category === 'hotel' && item.date <= selected && item.end > selected);
  const checkout = !stay && dataset.reservations.find(item => item.category === 'hotel' && item.end === selected);
  const hotel = stay || checkout;
  const dayNo = dataset.days.findIndex(item => item.date === selected) + 1;
  const weekday = weekdays[new Date(`${selected}T00:00:00Z`).getUTCDay()];
  root.innerHTML = `<div class="layout">
    <aside class="card nav-card" aria-label="Dias da viagem">
      ${calendarMarkup()}
    </aside>
    <section class="card day-card" aria-labelledby="day-heading">
      <div class="day-header">
        <div><p class="eyebrow">DIA ${String(dayNo).padStart(2,'0')} / ${dataset.days.length}</p><h2 id="day-heading" tabindex="-1">${safe(day.cities.join(' · '))}</h2></div>
        <div class="day-nav">${canEdit()?'<button type="button" class="text-btn" data-day-cities>Cidades do dia</button>':''}
          <button type="button" class="icon-btn" data-day="${visibleDays[index - 1]?.date || ''}" aria-label="Dia anterior" ${index === 0 ? 'disabled' : ''}>‹</button>
          <button type="button" class="icon-btn" data-day="${visibleDays[index + 1]?.date || ''}" aria-label="Próximo dia" ${index === visibleDays.length - 1 ? 'disabled' : ''}>›</button>
        </div>
      </div>
      <p class="day-meta">${weekday} <span>·</span> ${shortDate(day.date)}/${day.date.slice(0,4)} ${day.overnight ? `<span>·</span> Pernoite em ${safe(day.overnight)}` : ''}</p>
      <div class="day-scale" aria-hidden="true"><span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>24h</span></div>
      <div class="timeline-bar" aria-label="Mapa de horários">
        ${[...barEntries,...gaps].map(item => `<button type="button" class="bar-segment ${item.gap ? 'is-gap' : `${item.category} ${item.kind}`} ${item.start === item.end ? 'point' : ''}" style="left:${item.start / 14.4}%;width:${(item.end - item.start) / 14.4}%" data-jump="${item.id}" tabindex="-1" title="${range(item)} · ${safe(item.title)}" aria-label="${range(item)} · ${safe(item.title)}"></button>`).join('')}
      </div>
      <div class="legend">${Object.entries(categories).map(([key, label]) => `<span class="${key}"><i></i>${label}</span>`).join('')}<span class="travel-legend"><i></i>Deslocamento</span><span class="pale"><i></i>Preparação / espera</span><span class="is-gap"><i></i>Lacuna</span></div>
<div class="day-toolbar"><span class="placeholder">Atividade em destaque · preparação e espera no mesmo cartão</span>
        <button type="button" class="button primary" data-add>+ Atividade</button>
      </div>
      <div class="entries">${entries.map(item => blockMarkup(item, conflicts)).join('')}</div>
    </section>
    <aside class="side" aria-label="Acompanhamento do dia">
      <div class="card side-card">
        <div class="aside-title"><h3>Hospedagem</h3></div>
        ${hotel ? `<p class="hotel-title">${safe(hotel.title)}</p><p class="cost-line">${shortDate(hotel.date)}–${shortDate(hotel.end)} · <span class="badge confirmed">Confirmada</span></p>${hotelDetails(hotel)}${checkout ? '<p class="placeholder">Saída do hotel neste dia.</p>' : ''}` : '<p class="placeholder">Dia de trânsito, sem pernoite reservado no roteiro.</p>'}

      </div>
      ${restaurantPanel(day)}

    </aside>
  </div>`;
}

function reservationDetails(item) {
  if (!item || ![item.address, item.bookingReference, item.plate, item.confirmationUrl].some(Boolean)) return '';
  return `<div class="reservation-details">
    ${item.address ? `<div class="reservation-address"><span>${safe(item.address)}</span><button type="button" class="side-link copy-address" data-copy-address="${safe(item.address)}">Copiar endereço</button></div>` : ''}
    ${item.bookingReference ? `<div><span class="detail-label">${item.category === 'hotel' ? 'Confirmação / reserva' : 'Localizador / reserva'}</span> <strong>${safe(item.bookingReference)}</strong></div>` : ''}
    ${item.plate ? `<div><span class="detail-label">Placa</span> <strong>${safe(item.plate)}</strong><br>${safe(item.vehicle)}<p>${safe(item.meeting)}</p></div>` : ''}
    ${item.confirmationUrl && item.confirmationUrl.startsWith('https://mail.google.com/') ? `<a class="confirmation-link" href="${safe(item.confirmationUrl)}" target="_blank" rel="noopener noreferrer">Abrir e-mail de confirmação ↗</a>` : ''}
  </div>`;
}

function reservationsView() {
  const totals = new Map();
  let miles = 0;
  for (const item of dataset.reservations) {
    if (typeof item.amount === 'number') totals.set(item.currency, (totals.get(item.currency) || 0) + item.amount);
    miles += item.miles || 0;
  }
  const reservations = dataset.reservations.map(item => {
    if (item.category !== 'transport') return item;
    const day = dataset.days.find(day => day.date === item.date);
    const original = day?.blocks.find(block => block.locked && (block.code && block.code === item.code || block.title === item.title || block.start === item.start));
    const edited = original && blocksFor(day).find(block => block.id === original.id);
    return edited ? { ...item, title: edited.title, start: edited.start, end: edited.end, code: edited.code, note: edited.note } : item;
  }).filter(item =>
    (!cityFilter || item.city.split(' / ').includes(cityFilter)) &&
    (!reserveCategory || item.category === reserveCategory));
  root.innerHTML = `<section class="card reserve-card" aria-labelledby="reserve-title">
    <div class="reserve-head"><div><p class="eyebrow">VIAGEM INTEIRA</p><h2 id="reserve-title" tabindex="-1">Reservas e custos</h2></div><p class="placeholder">Valores conhecidos para duas pessoas</p></div>
    <div class="total-grid">${Array.from(totals, ([currency, amount]) => `<div class="total"><span>${currency}</span><strong>${money(currency, amount)}</strong></div>`).join('')}
    <div class="total"><span>Smiles</span><strong>${miles.toLocaleString('pt-BR')} milhas</strong></div></div>
    <p class="placeholder">Totais parciais por moeda original, sem conversão. ${activeTrip.id==='asia-2027'?'A referência da planilha original aparece separada dos valores das reservas.':''}</p>
    <div class="reserve-controls">
      <label>Cidade <select id="city-filter">${cityOptions()}</select></label>
      <label>Categoria <select id="reserve-category"><option value="">Todas as categorias</option><option value="hotel" ${reserveCategory === 'hotel' ? 'selected' : ''}>Hospedagem</option><option value="transport" ${reserveCategory === 'transport' ? 'selected' : ''}>Transporte</option></select></label>
    </div>
    <p class="section-label">${reservations.length} REGISTROS NO FILTRO</p>
    <div class="reserve-list">${reservations.map(item => `<article class="reserve-item">
      <div class="reserve-date"><button type="button" class="side-link" data-day="${item.date}">${shortDate(item.date)}${item.category === 'hotel' ? `–${shortDate(item.end)}` : ''}</button>
      ${item.category === 'transport' ? `<div>${range(item)}</div>` : ''}</div>
      <div><h3><i class="dot ${item.category}"></i>${safe(item.title)}</h3><p>${safe([item.city,item.code,item.note].filter(Boolean).join(' · '))}</p>
      <span class="badge ${item.status === 'reference' ? 'reference' : 'confirmed'}">${item.status === 'reference' ? 'Horário de referência · a reservar' : 'Reserva confirmada'}</span>${reservationDetails(item)}</div>
      <div class="reserve-amount">${typeof item.amount === 'number' ? money(item.currency,item.amount) : 'Valor indisponível'}${item.miles ? `<small>+ ${item.miles.toLocaleString('pt-BR')} milhas</small>` : ''}${item.plan ? `<small>Planilha · ${money('BRL',item.plan)}</small>` : ''}</div>
    </article>`).join('') || '<p class="empty">Nenhum registro para estes filtros.</p>'}</div>
  </section>`;
}

function dateOffset(date,days){return new Date((dayNumber(date)+days)*86400000).toISOString().slice(0,10);}
function updateCategories(){editor.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===editor.elements.category.value)));}
function calendarMarkup(){
  const palette=['#dceeea','#e8e2f1','#e5edce','#f9e9b8','#dce8f3','#f5ded3'];
  const cityNames=[...new Set(dataset.days.flatMap(d=>d.cities))];
  function calendarBars(week){
    const segments=[];
      week.forEach((day,col)=>{
        if(!day)return;
        const roundTrip=day.cities.length>1&&day.overnight===day.cities[0];
        day.cities.forEach((city,n)=>{
          const lane=roundTrip?n+1:1;
          const start=col*6+(roundTrip?0:n*6/day.cities.length);
          const end=col*6+(roundTrip?6:(n+1)*6/day.cities.length);
          const prior=segments.findLast(s=>s.city===city&&s.lane===lane&&s.end===start);
          if(prior){prior.end=end;prior.last=day.date;}
          else segments.push({city,lane,start,end,date:day.date,last:day.date});
        });
      });
      return segments.map(run=>`<button type="button" class="city-band" style="grid-row:${run.lane};grid-column:${run.start+1}/${run.end+1};background:${palette[cityNames.indexOf(run.city)%palette.length]}" data-day="${run.date}" aria-label="${safe(run.city)} · ${shortDate(run.date)}–${shortDate(run.last)}" title="${safe(run.city)} · ${shortDate(run.date)}–${shortDate(run.last)}"><span>${safe(run.city)}</span></button>`).join('');
  }
  const strip=`<div class="mobile-days" aria-label="Dias da viagem"><div class="mobile-calendar-track" style="--days:${dataset.days.length}"><div class="mobile-date-row">${dataset.days.map(day=>`<button class="mobile-date" type="button" data-day="${day.date}" aria-label="${shortDate(day.date)}, ${safe(day.cities.join(' e '))}" ${day.date===selected?'aria-current="date"':''}><small>${weekdays[new Date(day.date+'T00:00:00Z').getUTCDay()].slice(0,3)}</small><b>${Number(day.date.slice(-2))}</b><small>${months[Number(day.date.slice(5,7))-1]}</small></button>`).join('')}</div><div class="city-bands" style="grid-template-columns:repeat(${dataset.days.length*6},minmax(0,1fr))">${calendarBars(dataset.days)}</div></div></div>`;
  return strip+'<div class="desktop-calendar"><p class="section-label">CALENDÁRIO DA VIAGEM</p><div class="calendar-grid"><span class="weekday">D</span><span class="weekday">S</span><span class="weekday">T</span><span class="weekday">Q</span><span class="weekday">Q</span><span class="weekday">S</span><span class="weekday">S</span></div>'+ [...new Set(dataset.days.map(d=>d.date.slice(0,7)))].map(month=>{
    const days=dataset.days.filter(d=>d.date.startsWith(month));
    const cells=Array(new Date(days[0].date+'T00:00:00Z').getUTCDay()).fill(null).concat(days);
    while(cells.length%7)cells.push(null);
    let weeks='';
    for(let i=0;i<cells.length;i+=7){
      const week=cells.slice(i,i+7),bars=calendarBars(week);
      weeks+=`<div class="calendar-week"><div class="calendar-grid">${week.map(d=>d?`<button type="button" class="calendar-day" data-day="${d.date}" aria-label="${shortDate(d.date)}, ${safe(d.cities.join(' e '))}" ${d.date===selected?'aria-current="date"':''}><b>${Number(d.date.slice(-2))}</b></button>`:'<span></span>').join('')}</div><div class="city-bands">${bars}</div></div>`;
    }
    return `<section class="calendar-month"><h3>${new Date(month+'-01T12:00:00Z').toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'})}</h3>${weeks}</section>`;
  }).join('')+`</div><p class="calendar-caption">${shortDate(selected)} · ${safe(currentDay().cities.join(' → '))}</p>`;
}
function hotelDetails(hotel){return `<div class="reservation-details">${hotel.address?`<button type="button" class="address-button" data-copy-address="${safe(hotel.address)}" title="Copiar endereço" aria-label="Copiar endereço: ${safe(hotel.address)}">${safe(hotel.address)} <span aria-hidden="true">⧉</span></button>`:''}${hotel.bookingReference?`<span>Confirmação: ${hotel.confirmationUrl?`<a href="${safe(hotel.confirmationUrl)}" target="_blank" rel="noopener noreferrer" title="Abrir e-mail de confirmação">${safe(hotel.bookingReference)}</a>`:safe(hotel.bookingReference)}</span>`:hotel.confirmationUrl?`<a href="${safe(hotel.confirmationUrl)}" target="_blank" rel="noopener noreferrer">Confirmação por e-mail ↗</a>`:''}</div>`;}
let alertType='conflicts';
const alertTitles={conflicts:'Conflitos',gaps:'Lacunas',notices:'Avisos'};
function renderAlerts(){
  const all=allActivities(),counts={conflicts:0,gaps:0,notices:0};
  const html=dataset.days.map(day=>{
    const blocks=occupied(all,day.date),conflicts=conflictsFor(blocks),gaps=dayPlan(day).gaps;
    const groups={conflicts:[],gaps:[],notices:[...(day.notes||[])]};
    for(const b of blocks)for(const other of conflicts.get(b.id)||[])if(b.id<other.id)groups.conflicts.push(`${b.title} e ${other.title}: sobreposição (${range(b)} / ${range(other)}).`);
    for(const gap of gaps)groups.gaps.push(`${range(gap)} · ${duration(gap.end-gap.start)} sem planejamento.`);
    for(const key of Object.keys(counts))counts[key]+=groups[key].length;
    const lines=groups[alertType];
    return lines.length?`<section><button type="button" class="side-link" data-alert-day="${day.date}">${shortDate(day.date)} · ${safe(day.cities.join(' · '))}</button><ul>${lines.map(l=>`<li>${safe(l)}</li>`).join('')}</ul></section>`:'';
  }).join('');
  document.querySelector('#trip-alerts-content').innerHTML=html||'<p>Nenhum item nesta categoria.</p>';
  document.querySelector('#trip-alerts h2').textContent=alertTitles[alertType];
  for(const type of Object.keys(counts)){
    const button=document.querySelector(`[data-alert-type="${type}"]`);
    button.querySelector('small').textContent=counts[type];
    button.setAttribute('aria-label',`${alertTitles[type]}: ${counts[type]}`);
  }
}
document.querySelectorAll('[data-alert-type]').forEach(button=>button.addEventListener('click',()=>{alertType=button.dataset.alertType;renderAlerts();}));
function render(focusHeading = false) {
  const reservations = location.hash === '#reservas';
  document.querySelectorAll('[data-view]').forEach(link => {
    if (link.dataset.view === (reservations ? 'reservas' : 'timeline')) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (reservations) reservationsView();
  else {
    if (!dataset.days.some(day => day.date === selected && matchesDay(day))) {
      selected = dataset.days.find(matchesDay).date;
    }
    timelineView();
    const strip=root.querySelector('.mobile-days'),active=strip?.querySelector('.mobile-date[aria-current]');
    if(strip&&active&&strip.clientWidth)strip.scrollLeft=active.offsetLeft-(strip.clientWidth-active.offsetWidth)/2;
  }
  renderAlerts();
  if (focusHeading) root.querySelector('h2')?.focus({ preventScroll: true });
}

function notify(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3800);
}

function readClock(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function editingValue() {
  const form = new FormData(editor);
  return {
    ...editing.original,
    id: editing.id,
    title: form.get('kind')==='transfer' ? 'Deslocamento' : form.get('title').trim(),
    start: form.get('kind')==='transfer' ? editing.original.start : readClock(form.get('start')),
    end: form.get('kind')==='transfer' ? editing.original.start+Number(form.get('travelMinutes')) : readClock(form.get('end'))+(dayNumber(form.get('endDate'))-dayNumber(editing.date))*1440,
    waitBefore: form.get('kind')==='transfer'?0:Number(form.get('waitBefore')),
    waitAfter: form.get('kind')==='transfer'?0:Number(form.get('waitAfter')),
    mode: form.get('mode')||'',
    travelMinutes: Number(form.get('travelMinutes')),
    waitBeforeLabel: (form.get('waitBeforeLabel')||'').trim(),
    waitAfterLabel: (form.get('waitAfterLabel')||'').trim(),
    category: form.get('kind')==='transfer' ? '' : form.get('category'),
    kind: form.get('kind'),
    note: form.get('note').trim(),
    code: ''
  };
}

function currentDay() {
  return dataset.days.find(day => day.date === selected);
}

function editorFeedback() {
  const message = document.querySelector('#editor-message');
  const transfer=editor.elements.kind.value==='transfer';
  document.querySelector('#wait-fields').hidden=transfer;
  document.querySelector('#wait-description-fields').hidden=transfer;
  document.querySelector('#transfer-fields').hidden=!transfer;
  editor.elements.travelMinutes.disabled=!transfer;
  for(const name of ['waitBefore','waitAfter','waitBeforeLabel','waitAfterLabel'])editor.elements[name].disabled=transfer;
  editor.elements.title.required=!transfer;
  editor.elements.title.closest('label').hidden=transfer;
  editor.elements.end.closest('label').hidden=transfer;
  editor.elements.start.closest('label').hidden=transfer;
  editor.elements.start.disabled=transfer;editor.elements.end.disabled=transfer;
  document.querySelector('#category-picker').hidden=transfer;
  document.querySelector('#activity-dates').hidden=transfer;
  editor.elements.endDate.disabled=transfer;

  document.querySelector('#convert-activity').hidden=!transfer;
  document.querySelector('#delete-block').hidden=transfer || editing.isNew;
  editor.querySelector('[type=submit]').textContent=transfer?'Salvar deslocamento':'Salvar atividade';
  document.querySelector('#editor-title').textContent=transfer?'Editar deslocamento':editing.isNew?'Adicionar atividade':'Editar atividade';
  const value = editingValue();
  let warning = '';
  if (Number.isFinite(value.start) && Number.isFinite(value.end)) {
    if (value.end < value.start) warning = 'O fim não pode ser anterior ao início.';
    else {
      const all=allActivities().filter(block=>block.id!==editing.id && block.id!==editing.convertedFrom?.id);
      const hits=conflictsFor(occupied([...all,{...value,date:editing.date}],editing.date)).get(value.id);
      if (hits?.length) warning = 'Conflito com ' + hits.map(item => `${item.title} (${range(item)})`).join(' e ') + '.';
    }
  }
  message.textContent = warning;
  message.hidden = !warning;
}

function openEditor(block, trigger) {
  const isNew = !block || block.gap;
  const proposedStart = block?.start ?? 540;
  const proposedEnd = block?.end ?? 600;
  editing = { isNew, date: isNew?selected:block.date, id: isNew ? 'user-' + crypto.randomUUID() : block.id, original: isNew ? {} : block };
  returnFocus = trigger;
  document.querySelector('#editor-title').textContent = isNew ? 'Adicionar atividade' : 'Editar atividade';
  document.querySelector('#delete-block').hidden = isNew;
  editor.elements.title.value = isNew ? '' : block.title;
  editor.elements.start.value = clock(proposedStart);
  editor.elements.startDate.value=editing.date;
  editor.elements.endDate.min=editing.date;
  editor.elements.endDate.value=dateOffset(editing.date,Math.floor(proposedEnd/1440));
  editor.elements.end.value = clock(proposedEnd%1440);
  editor.elements.category.value = isNew ? 'tour' : block.category || 'transport';
  editor.elements.kind.value = isNew ? 'main' : block.kind;
  editor.elements.note.value = isNew ? '' : [block.code,block.note].filter(Boolean).join(' · ');
  editor.elements.waitBeforeLabel.value=block?.waitBeforeLabel||'';
  editor.elements.waitAfterLabel.value=block?.waitAfterLabel||'';
  editor.elements.waitBefore.value=block?.waitBefore||0;
  editor.elements.waitAfter.value=block?.waitAfter||0;
  editor.elements.travelMinutes.value=Math.max(0,proposedEnd-proposedStart);
  editor.elements.mode.value=normalizeMode(block?.mode);
  updateModes();
  updateCategories();
  const reservation = !isNew && block.kind!=='transfer' && block.locked && dataset.reservations.find(item => item.category === 'transport' && item.date === editing.date && (item.code && item.code === block.code || item.title === block.title || item.start === block.start));
  document.querySelector('#editor-reservation').innerHTML = reservationDetails(reservation);
  editorFeedback();
  dialog.showModal();
  (block?.kind==='transfer'?editor.elements.travelMinutes:editor.elements.title).focus();
}

async function storeEdit(value) {
  const date=editing.date;
  const next = { ...state, [date]: { ...state?.[date], [editing.id]: value } };
  for(const part of editing.original.mergedIds||[])next[part.date]={...next[part.date],[part.id]:null};
  if(editing.convertedFrom && value)next[date][editing.convertedFrom.id]=editing.convertedFrom;
  // Suppress imported waits when deleting their owner, including across midnight.
  const suppressed=[...(editing.original.mergedIds||[]).map(b=>b.id),...(value===null?[editing.id]:[])];
  for(const day of dataset.days)for(const block of day.blocks)if(suppressed.includes(waitLinks.get(block.id)?.id))next[day.date]={...next[day.date],[block.id]:null};
  try {
    await saveTrip(next,restaurants);
  } catch (error) {
    const message = document.querySelector('#editor-message');
    message.textContent = error.message;
    message.hidden = false;
    return false;
  }
  state = next;
  return true;
}

function jump(id) {
  if (!document.getElementById(`item-${id}`)) {
    showDetails = true;
    render();
  }
  const row = document.getElementById(`item-${id}`);
  row?.scrollIntoView({ block: 'nearest' });
  row?.querySelector('.activity')?.focus({ preventScroll: true });
}

function showDay(date, trigger) {
  const day = dataset.days.find(item => item.date === date);
  if (!day) return;
  selected = date;
  restaurantCity = (cities.includes(day.overnight) ? day.overnight : day.cities[0]);
  cityFilter = '';
  if (location.hash === '#reservas') {
    location.hash = 'timeline';
    return;
  }
  const navLabel = trigger.getAttribute('aria-label');
  render();
  const button = root.querySelector(trigger.closest('.mobile-days') ? '.mobile-days [aria-current]' : trigger.classList.contains('date-btn')
    ? '.date-btn[aria-current]'
    : `.day-nav button[aria-label="${safe(navLabel)}"]:not(:disabled)`);
  (button || root.querySelector('h2'))?.focus({ preventScroll: true });
}

root.addEventListener('click', async event => {
  const control = event.target.closest('button');
  if (!control) return;
  if(control.hasAttribute('data-day-cities')){const value=prompt('Cidades deste dia, separadas por vírgula:',currentDay().cities.join(', '));if(value===null)return;const cities=[...new Set(value.split(',').map(s=>s.trim()).filter(Boolean))];const snapshot=await client.from('trip_state').select('revision').eq('id',activeTrip.id).single();if(snapshot.error){notify('Não foi possível carregar a versão atual.');return;}const result=await client.rpc('set_day_cities',{trip_id:activeTrip.id,day:selected,cities,expected_revision:snapshot.data.revision});if(result.error){notify(result.error.message);return;}location.reload();return;}
  if (control.dataset.copyAddress) {
    try { await navigator.clipboard.writeText(control.dataset.copyAddress); notify('Endereço copiado.'); }
    catch { notify('Não foi possível copiar. Selecione o endereço e copie manualmente.'); }
    return;
  }
  if(!canEdit()&&(control.hasAttribute('data-restaurant-add')||control.dataset.restaurantEdit||control.dataset.add!==undefined||control.dataset.edit))return;
  if (control.hasAttribute('data-restaurant-add')) {restaurantCity=control.dataset.restaurantAdd||currentDay().cities[0];openRestaurant();}
  if (control.dataset.restaurantEdit) openRestaurant(control.dataset.restaurantEdit);
  if (control.dataset.day) showDay(control.dataset.day, control);
  if (control.dataset.reserve !== undefined) {
    cityFilter = '';
    reserveCategory = '';
    location.hash = 'reservas';
  }
  if (control.dataset.add !== undefined) openEditor(null, control);

  if (control.dataset.jump) jump(control.dataset.jump);
  if (control.dataset.edit) {
    const block = [...allActivities(), ...dayPlan(currentDay()).gaps].find(item => item.id === control.dataset.edit);
    if (block) openEditor(block, control);
  }
});

root.addEventListener('change', event => {
  if (event.target.id === 'restaurant-city') restaurantCity = event.target.value;
  if (event.target.id === 'city-filter') { cityFilter = event.target.value; restaurantCity = cityFilter || ''; }
  if (event.target.id === 'reserve-category') reserveCategory = event.target.value;
  if (event.target.id === 'show-details') showDetails = event.target.checked;
  render();
  document.getElementById(event.target.id)?.focus({ preventScroll: true });
});

const modeNames = {walk:'A pé',car:'Carro',rail:'Trem/metrô',ferry:'Balsa',bike:'Bicicleta'};
function updateModes(){editor.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===editor.elements.mode.value)));}
editor.addEventListener('click',event=>{const button=event.target.closest('[data-mode]');if(button){editor.elements.mode.value=editor.elements.mode.value===button.dataset.mode?'':button.dataset.mode;updateModes();}});
document.querySelector('#convert-activity').addEventListener('click',()=>{
  const value=editingValue();
  editing.convertedFrom={...editing.original,travelMinutes:0,end:editing.original.start,mode:'',note:''};
  editing.id='user-'+crypto.randomUUID();editing.isNew=true;editing.original={};
  editor.elements.kind.value='main';editor.elements.title.value='Deslocamento';editor.elements.category.value='transport';
  const shift=Math.floor(value.start/1440);editing.date=dateOffset(editing.date,shift);editor.elements.startDate.value=editing.date;editor.elements.endDate.min=editing.date;editor.elements.start.value=clock(value.start%1440);editor.elements.end.value=clock(value.end%1440);editor.elements.endDate.value=dateOffset(editing.date,Math.floor(value.end/1440)-shift);updateCategories();editorFeedback();
});
editor.addEventListener('input', editorFeedback);
editor.addEventListener('submit', async event => {
  event.preventDefault();
  const value = editingValue();
  if (!validEdit(value, editing.id)) {
    const message = document.querySelector('#editor-message');
    message.textContent = 'Preencha o nome e verifique os horários da atividade.';
    message.hidden = false;
    return;
  }
  if (!await storeEdit(value)) return;
  dialog.close();
  if (value.kind !== 'main') showDetails = true;
  render();
  jump(value.id);
  notify('Atividade salva na nuvem.');
});
document.querySelector('#delete-block').addEventListener('click', async () => {
  if (!confirm('Excluir este bloco da timeline compartilhada?')) return;
  if (!await storeEdit(null)) return;
  dialog.close();
  render();
  root.querySelector('[data-add]')?.focus({ preventScroll: true });
  notify('Atividade excluída.');
});
document.querySelector('#cancel-editor').addEventListener('click', () => dialog.close());
document.querySelector('#close-editor').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => returnFocus?.isConnected && returnFocus.focus({ preventScroll: true }));
window.addEventListener('hashchange', () => dataset && render(true));
editor.addEventListener('click',event=>{const b=event.target.closest('[data-category]');if(b){editor.elements.category.value=b.dataset.category;updateCategories();editorFeedback();}});
document.querySelector('#trip-alerts-content').addEventListener('click',event=>{const b=event.target.closest('[data-alert-day]');if(b){selected=b.dataset.alertDay;cityFilter='';document.querySelector('#trip-alerts').hidePopover();location.hash='timeline';render(true);}});
try {
  const cloud=await loadTrip();dataset=cloud.dataset;state=cloud.state;restaurants=cloud.restaurants;selected=dataset.days[0].date;
  document.title=cloud.trip.name+' · mele.va';document.querySelector('.hero h1').textContent=cloud.trip.name;document.querySelector('.hero .eyebrow').textContent=cloud.trip.start_date+' — '+cloud.trip.end_date;document.querySelector('.brand span').textContent='mele.va';document.querySelector('.count-with-alert>strong').textContent=dataset.days.length;if(cloud.trip.id!=='asia-2027'){document.querySelector('.route-caption').textContent=cloud.trip.destinations.join(' · ');document.querySelector('.route-caption').removeAttribute('aria-label');}
  waitLinks=associateWaits(dataset.days);travelOwners=transferOwners(schedule(dataset.days,day=>day.blocks,waitLinks));
  cities=[...new Set(dataset.days.flatMap(day=>day.cities))];
  watchTrip((doc,base)=>{state=doc.state;restaurants=doc.restaurants;if(base){dataset=base;waitLinks=associateWaits(dataset.days);cities=[...new Set(dataset.days.flatMap(day=>day.cities))];}render();});
  document.querySelector('#import-cloud').onclick=()=>document.querySelector('#import-file').click();
  document.querySelector('#import-file').onchange=async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    try{if(file.size>2000000)throw Error('Arquivo muito grande.');
      const input=JSON.parse(await file.text());if(input.tripId?input.tripId!==activeTrip.id:activeTrip.id!=='asia-2027')throw Error('Este backup pertence a outra viagem.');
      prepareImport(input,{state,restaurants},dataset,validEdit,async merged=>{
        await saveTrip(merged.state,merged.restaurants,{importing:true});state=merged.state;restaurants=merged.restaurants;render();notify('Importação salva na nuvem.');
      });
    }catch(error){alert('Não foi possível importar: '+error.message);}
  };
  render();
} catch(error) {
  document.querySelector('#login-panel').hidden=false;document.querySelector('#login-message').textContent=error.message||'Não foi possível carregar. Atualize a página.';
} finally {
  root.removeAttribute('aria-busy');
}

function restaurantPanel(day) {
  return `<section class="card side-card" aria-label="Restaurantes por cidade"><h3>Restaurantes</h3>${day.cities.map(city=>`<div class="restaurant-city-group"><h4>${safe(city)}</h4><div class="restaurant-list">${restaurants.filter(item=>item.city===city).map(item=>`<button type="button" class="restaurant-item" data-restaurant-edit="${safe(item.id)}"><strong>${safe(item.name)}</strong>${item.note?`<small>${safe(item.note)}</small>`:''}</button>`).join('')||'<p class="placeholder">Nenhum restaurante cadastrado.</p>'}</div><button type="button" class="side-link" data-restaurant-add="${safe(city)}">+ Adicionar restaurante</button></div>`).join('')}</section>`;
}
function openRestaurant(id) {
  const item = restaurants.find(item => item.id === id);
  restaurantEditing = item?.id || crypto.randomUUID();
  const form = document.querySelector('#restaurant-form');
  form.elements.name.value = item?.name || '';
  form.elements.city.innerHTML = cities.map(city => `<option value="${safe(city)}">${safe(city)}</option>`).join('');
  form.elements.city.value = item?.city || restaurantCity;
  form.elements.note.value = item?.note || '';
  document.querySelector('#restaurant-delete').hidden = !item;
  document.querySelector('#restaurant-message').textContent = '';
  document.querySelector('#restaurant-dialog').showModal();
  form.elements.name.focus();
}
async function saveRestaurants(next) {
  try { await saveTrip(state,next); }
  catch(error) { document.querySelector('#restaurant-message').textContent = error.message; return; }
  restaurants = next;
  document.querySelector('#restaurant-dialog').close();
  render();
  notify('Lista de restaurantes salva na nuvem.');
}
document.querySelector('#restaurant-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.elements.name.value.trim();
  if (!name) return;
  restaurantCity = form.elements.city.value;
  const item = { id: restaurantEditing, city: restaurantCity, name, note: form.elements.note.value.trim() };
  saveRestaurants([...restaurants.filter(item => item.id !== restaurantEditing), item]);
});
document.querySelector('#restaurant-cancel').addEventListener('click', () => document.querySelector('#restaurant-dialog').close());
document.querySelector('#restaurant-delete').addEventListener('click', () => {
  if (confirm('Excluir este restaurante da lista da cidade?')) saveRestaurants(restaurants.filter(item => item.id !== restaurantEditing));
});

let daySwipe=null;
root.addEventListener('touchstart',event=>{
  daySwipe=null;
  if(!matchMedia('(max-width:700px)').matches||event.touches.length!==1||!event.target.closest('.day-card')||event.target.closest('input,textarea,select'))return;
  const t=event.touches[0];daySwipe={x:t.clientX,y:t.clientY,time:Date.now()};
},{passive:true});
root.addEventListener('touchmove',event=>{
  if(daySwipe&&(event.touches.length!==1||Math.abs(event.touches[0].clientY-daySwipe.y)>40))daySwipe=null;
},{passive:true});
root.addEventListener('touchcancel',()=>{daySwipe=null;},{passive:true});
root.addEventListener('touchend',event=>{
  const start=daySwipe;daySwipe=null;if(!start||!event.changedTouches.length)return;
  const t=event.changedTouches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;
  if(Math.abs(dx)<90||Math.abs(dx)<Math.abs(dy)*2.5||Date.now()-start.time>900)return;
  const next=dataset.days[dataset.days.findIndex(d=>d.date===selected)+(dx<0?1:-1)];
  if(next){selected=next.date;render();}
},{passive:true});

