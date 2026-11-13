import {createClient} from './vendor.js';
const db=createClient('https://porzljqjsqlqutwtwyqb.supabase.co','sb_publishable_kWFdwByvv4QhBF-5gCJwMQ_FreCFM3W',{auth:{flowType:'pkce'}});
const $=s=>document.querySelector(s),message=$('#message');
const requested=new URL(location.href).searchParams.get('authorization_id');
if(requested)sessionStorage.setItem('mele-va-consent',requested);
const id=requested||sessionStorage.getItem('mele-va-consent');
try{
 if(!id)throw Error('Solicitação ausente. Inicie a conexão pelo ChatGPT.');
 const {data:{session},error}=await db.auth.getSession();if(error)throw error;
 if(!session){message.textContent='Entre para revisar a solicitação.';$('#login').hidden=false;$('#login').onclick=async()=>{const {error}=await db.auth.signInWithOAuth({provider:'google',options:{redirectTo:new URL('consent.html',location.href).href}});if(error)message.textContent=error.message;};}
 else{const {data,error}=await db.auth.oauth.getAuthorizationDetails(id);if(error)throw error;if('redirect_url' in data){sessionStorage.removeItem('mele-va-consent');location.assign(data.redirect_url);}else{
 $('#details').hidden=false;message.textContent='Revise o aplicativo antes de autorizar.';$('#client-name').textContent=data.client.name;$('#account').textContent='Conta: '+data.user.email;$('#scopes').textContent='Permissões solicitadas: '+data.scope;
 for(const decision of ['allow','deny'])$('#'+decision).onclick=async()=>{$('#allow').disabled=$('#deny').disabled=true;const result=await db.auth.oauth[decision==='allow'?'approveAuthorization':'denyAuthorization'](id,{skipBrowserRedirect:true});if(result.error){message.textContent=result.error.message;$('#allow').disabled=$('#deny').disabled=false;}else{sessionStorage.removeItem('mele-va-consent');location.assign(result.data.redirect_url);}};
 }}
}catch(e){message.textContent=e.message;}
