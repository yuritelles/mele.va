import {createClient} from './vendor.js';
const url='https://porzljqjsqlqutwtwyqb.supabase.co';
const key='sb_publishable_kWFdwByvv4QhBF-5gCJwMQ_FreCFM3W';
const client=createClient(url,key,{auth:{flowType:'pkce'}});
let revision, current, listener, busy=false, conflict=false;
const $=s=>document.querySelector(s), status=$('#sync-status');
export function download(data){const url=URL.createObjectURL(new Blob([JSON.stringify({format:'asia-2027-backup-v1',exportedAt:new Date().toISOString(),...data},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='asia-2027-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function pending(){try{return JSON.parse(localStorage.getItem('asia-2027-unsent'));}catch{return null;}}
function showStatus(){status.textContent=pending()?'Há uma edição pendente. Exporte o backup e importe para revisar.':'Sincronizado';}
export async function loadTrip(){
 const {data:{session},error}=await client.auth.getSession();if(error)throw error;
 if(!session){$('#login-panel').hidden=false;await new Promise(()=>{});}
 const [base,saved]=await Promise.all([client.from('trip_baseline').select('data').eq('id','asia-2027').single(),client.from('trip_state').select('*').eq('id','asia-2027').single()]);
 if(base.error||saved.error){$('#switch-account').hidden=false;throw Error('Não foi possível acessar a viagem. Verifique sua conexão e use uma das contas autorizadas.');}
 revision=saved.data.revision;current=saved.data.document;conflict=!!pending();
 document.body.classList.remove('signed-out');$('#login-panel').hidden=true;$('#cloud-tools').hidden=false;showStatus();
 return {dataset:base.data.data,...current};
}
export async function saveTrip(state,restaurants,{importing=false}={}){
 if(busy)throw Error('Aguarde o salvamento em andamento.');
 if(conflict&&!importing)throw Error('Exporte a edição pendente e importe o arquivo para revisar as diferenças antes de salvar novamente.');
 busy=true;document.body.classList.add('syncing');document.querySelectorAll('dialog[open],main').forEach(el=>el.inert=true);status.textContent='Salvando…';
 const doc={state,restaurants};
 try{
  try{localStorage.setItem('asia-2027-unsent',JSON.stringify(doc));}catch{}
  const {data,error}=await client.rpc('save_trip',{expected_revision:revision,new_document:doc});
  if(error)throw Error('Não foi possível salvar na nuvem. Verifique a conexão e tente novamente. A edição continua aberta.');
  if(!data?.length){conflict=true;throw Error('Outra pessoa ou aparelho alterou a viagem. Exporte sua edição pendente, atualize a página e importe o arquivo para revisar as diferenças.');}
  revision=data[0].revision;current=data[0].document;conflict=false;
  try{localStorage.removeItem('asia-2027-unsent');}catch{}showStatus();
 }catch(error){status.textContent='Alteração não salva';throw error;}
 finally{busy=false;document.body.classList.remove('syncing');document.querySelectorAll('[inert]').forEach(el=>el.inert=false);}
}
export function watchTrip(callback){listener=callback;}
async function refresh(){
 if(busy||revision===undefined||document.hidden||document.querySelector('dialog[open]'))return;
 const {data,error}=await client.from('trip_state').select('*').eq('id','asia-2027').single();
 if(error){status.textContent='Não foi possível sincronizar. Verifique a conexão.';return;}
 if(busy||document.querySelector('dialog[open]'))return;
 if(data.revision!==revision){revision=data.revision;current=data.document;listener?.(current);}showStatus();
}
setInterval(refresh,15000);window.addEventListener('focus',refresh);
client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')location.reload();});
$('#google-login').onclick=async()=>{
 const message=$('#login-message');message.textContent='Conectando…';
 try{const response=await fetch(url+'/auth/v1/settings',{headers:{apikey:key}});if(!response.ok)throw Error();const settings=await response.json();if(!settings.external?.google){message.textContent='O login Google está em configuração. Continue usando o planejador anterior até a ativação.';return;}
 const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});if(error)throw error;
 }catch{message.textContent='Não foi possível iniciar o login. Verifique a conexão e tente novamente.';}
};
$('#switch-account').onclick=()=>client.auth.signOut();$('#sign-out').onclick=()=>client.auth.signOut();
$('#export-backup').onclick=()=>download(pending()||current);
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('cancel',e=>{if(busy)e.preventDefault();}));
