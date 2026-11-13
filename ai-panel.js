import {activeTrip} from './trips.js';
const panel=document.querySelector('#ai-panel'),open=document.querySelector('#ai-open');
open.onclick=()=>{document.querySelector('#ai-trip').textContent=activeTrip?.name||'Selecione uma viagem';panel.showModal();};
document.querySelector('#ai-close').onclick=()=>panel.close();
panel.addEventListener('close',()=>open.focus());
document.querySelector('#ai-copy').onclick=async()=>{
 const status=document.querySelector('#ai-copy-status');
 if(!activeTrip){status.textContent='Abra uma viagem primeiro.';return;}
 const prompt=`Use o plugin mele.va para consultar a viagem ${JSON.stringify(activeTrip.name)} (ID: ${activeTrip.id}). Confira minhas permissões e as preferências salvas. Quero revisar o roteiro e preparar sugestões para minha avaliação. Antes de importar, confira os itens existentes para evitar duplicações.`;
 try{await navigator.clipboard.writeText(prompt);status.textContent='Pedido copiado. Use-o no ChatGPT quando o plugin estiver conectado.';}catch{status.textContent='Não foi possível copiar. Tente novamente.';}
};
