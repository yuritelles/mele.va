import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const src=(await readFile(new URL('../trips.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
test('trip editor loads saved values and submits the reviewed revision',async()=>{
 const dom=new JSDOM(html,{url:'https://example.test/?trip=test',runScripts:'outside-only'}),w=dom.window;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const trip={id:'test',name:'Viagem original',start_date:'2028-12-30',end_date:'2029-01-02',destinations:['Lisboa'],context:''};let submitted;
 w.client={from:table=>({select:()=>({order:async()=>({data:[trip]}),eq:()=>({single:async()=>({data:table==='trips'?trip:{revision:7}})})})}),rpc:async(name,args)=>{if(name==='my_trip_role')return {data:'owner'};submitted=args;return {error:{message:'A viagem mudou.'}};}};
 await w.eval('(async()=>{'+src+';await chooseTrip();})()');
 await w.document.querySelector('#trip-edit').onclick();const f=w.document.querySelector('#trip-edit-form');assert.equal(f.elements.name.value,trip.name);assert.equal(f.elements.end.value,'2029-01-02');
 f.elements.name.value='Outro nome';f.elements.end.value='2029-01-05';await f.onsubmit({preventDefault(){},currentTarget:f});
 assert.equal(submitted.expected_revision,7);assert.equal(submitted.trip_name,'Outro nome');assert.equal(submitted.last_day,'2029-01-05');assert.match(w.document.querySelector('#trip-edit-message').textContent,/mudou/);assert.equal(w.document.querySelector('#trip-edit-dialog').open,true);dom.window.close();
});
