import {activeTrip} from './trips.js';
import {tripPrompt} from './ai-handoff.js';
const panel=document.querySelector('#ai-panel'),open=document.querySelector('#ai-open'),task=document.querySelector('#ai-task'),prompt=document.querySelector('#ai-prompt'),status=document.querySelector('#ai-copy-status');
function update(){prompt.value=tripPrompt(activeTrip,task.value);status.textContent='';}
open.onclick=()=>{document.querySelector('#ai-trip').textContent=activeTrip?.name||'Selecione uma viagem';update();panel.showModal();};
task.onchange=update;
document.querySelector('#ai-close').onclick=()=>panel.close();
panel.addEventListener('close',()=>open.focus());
document.querySelector('#ai-copy').onclick=async()=>{
 if(!activeTrip){status.textContent='Abra uma viagem primeiro.';return;}
 try{await navigator.clipboard.writeText(prompt.value);status.textContent='Pedido copiado. Abra o ChatGPT e cole na conversa.';}
 catch{prompt.focus();prompt.select();status.textContent='Selecione e copie o texto acima. Depois, abra o ChatGPT.';}
};
