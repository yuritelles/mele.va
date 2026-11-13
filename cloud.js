import {chooseTrip,activeTrip,activeRole,canEdit} from './trips.js';
import {createClient} from './vendor.js';
const url='https://porzljqjsqlqutwtwyqb.supabase.co';
const key='sb_publishable_kWFdwByvv4QhBF-5gCJwMQ_FreCFM3W';
export const client=createClient(url,key,{auth:{flowType:'pkce'}});
let revision, current, listener, userId, busy=false, conflict=false;
const $=s=>document.querySelector(s), status=$('#sync-status');
export function download(data){const url=URL.createObjectURL(new Blob([JSON.stringify({format:'asia-2027-backup-v1',exportedAt:new Date().toISOString(),tripId:activeTrip?.id,...data},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mele-va-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function pendingKey(){return 'mele-va-unsent:'+userId+':'+activeTrip?.id;}
function pending(){try{return JSON.parse(localStorage.getItem(pendingKey()));}catch{return null;}}
function showStatus(){status.textContent=pending()?'Há uma edição pendente. Exporte o backup e importe para revisar.':canEdit()?'Sincronizado':'Somente leitura';}
export async function loadTrip(){
 const {data:{session},error}=await client.auth.getSession();if(error)throw error;
 if(!session){$('#login-panel').hidden=false;await new Promise(()=>{});}
 const destination=sessionStorage.getItem('mele-va-return-trip');if(destination&&!new URL(location.href).searchParams.has('trip')){sessionStorage.removeItem('mele-va-return-trip');location.replace('?trip='+encodeURIComponent(destination));await new Promise(()=>{});}
 userId=session.user.id;document.body.classList.remove('signed-out');await chooseTrip();
 if(activeTrip.id==='asia-2027'){try{const old=localStorage.getItem('asia-2027-unsent');if(old&&!localStorage.getItem(pendingKey())){localStorage.setItem(pendingKey(),old);localStorage.removeItem('asia-2027-unsent');}}catch{}}
 const [base,saved]=await Promise.all([client.from('trip_baseline').select('data').eq('id',activeTrip.id).single(),client.from('trip_state').select('*').eq('id',activeTrip.id).single()]);
 if(base.error||saved.error){$('#switch-account').hidden=false;throw Error('Não foi possível acessar a viagem. Verifique sua conexão e use uma das contas autorizadas.');}
 revision=saved.data.revision;current=saved.data.document;conflict=!!pending();
 document.body.classList.remove('signed-out');$('#login-panel').hidden=true;$('#cloud-tools').hidden=false;showStatus();
 document.body.classList.toggle('read-only',!canEdit());$('#trip-sharing').hidden=activeRole!=='owner';$('#trip-edit').hidden=activeRole!=='owner';
 showStatus();
 return {dataset:base.data.data,...current,trip:activeTrip};
}
export async function saveTrip(state,restaurants,{importing=false}={}){
 if(!canEdit())throw Error('Você tem acesso somente de leitura.');
 if(busy)throw Error('Aguarde o salvamento em andamento.');
 if(conflict&&!importing)throw Error('Exporte a edição pendente e importe o arquivo para revisar as diferenças antes de salvar novamente.');
 busy=true;document.body.classList.add('syncing');document.querySelectorAll('dialog[open],main').forEach(el=>el.inert=true);status.textContent='Salvando…';
 const doc={state,restaurants};
 try{
  try{localStorage.setItem(pendingKey(),JSON.stringify(doc));}catch{}
  const {data,error}=await client.rpc('save_trip_v2',{trip_id:activeTrip.id,expected_revision:revision,new_document:doc});
  if(error)throw Error('Não foi possível salvar na nuvem. Verifique a conexão e tente novamente. A edição continua aberta.');
  if(!data?.length){conflict=true;throw Error('Outra pessoa ou aparelho alterou a viagem. Exporte sua edição pendente, atualize a página e importe o arquivo para revisar as diferenças.');}
  revision=data[0].revision;current=data[0].document;conflict=false;
  try{localStorage.removeItem(pendingKey());}catch{}showStatus();
 }catch(error){status.textContent='Alteração não salva';throw error;}
 finally{busy=false;document.body.classList.remove('syncing');document.querySelectorAll('[inert]').forEach(el=>el.inert=false);}
}
export function watchTrip(callback){listener=callback;}
async function refresh(){
 if(busy||revision===undefined||document.hidden||document.querySelector('dialog[open]'))return;
 const role=await client.rpc('my_trip_role',{trip_id:activeTrip.id});if(role.error){status.textContent='Sem conexão. Tentando sincronizar novamente…';return;}if(!role.data){location.href='?';return;}if(role.data!==activeRole){location.reload();return;}
 const {data,error}=await client.from('trip_state').select('*').eq('id',activeTrip.id).single();
 if(error){document.body.classList.add('read-only');status.textContent='Acesso indisponível. Atualize a página para verificar suas permissões.';return;}
 if(busy||document.querySelector('dialog[open]'))return;
 document.body.classList.toggle('read-only',!canEdit());
 if(data.revision!==revision){const meta=await client.from('trips').select('*').eq('id',activeTrip.id).single();if(meta.error)return;if(['name','start_date','end_date','destinations'].some(k=>JSON.stringify(meta.data[k])!==JSON.stringify(activeTrip[k]))){location.reload();return;}const base=await client.from('trip_baseline').select('data').eq('id',activeTrip.id).single();if(base.error||busy||document.querySelector('dialog[open]'))return;revision=data.revision;current=data.document;listener?.(current,base.data.data);}showStatus();
}
setInterval(refresh,15000);window.addEventListener('focus',refresh);
client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')location.reload();});
$('#google-login').onclick=async()=>{
 const message=$('#login-message');message.textContent='Conectando…';
 try{const response=await fetch(url+'/auth/v1/settings',{headers:{apikey:key}});if(!response.ok)throw Error();const settings=await response.json();if(!settings.external?.google){message.textContent='O login Google está em configuração. Continue usando o planejador anterior até a ativação.';return;}
 const trip=new URL(location.href).searchParams.get('trip');if(trip)sessionStorage.setItem('mele-va-return-trip',trip);
 const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});if(error)throw error;
 }catch{message.textContent='Não foi possível iniciar o login. Verifique a conexão e tente novamente.';}
};
$('#switch-account').onclick=()=>client.auth.signOut();$('#sign-out').onclick=()=>client.auth.signOut();
$('#export-backup').onclick=()=>download(pending()||current);
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('cancel',e=>{if(busy)e.preventDefault();}));
