import {readFile,writeFile} from 'node:fs/promises';
const [clientId,method='client_secret_basic']=process.argv.slice(2);
if(!clientId||!/^[a-zA-Z0-9._:-]{3,200}$/.test(clientId)||!['client_secret_basic','client_secret_post','none'].includes(method))throw Error('Uso: node scripts/configure-plugin.js CLIENT_ID [client_secret_basic|client_secret_post|none]. Informe apenas o ID público, nunca o segredo.');
const path=new URL('../plugin/mcp.json',import.meta.url),manifest=JSON.parse(await readFile(path,'utf8'));
manifest.mcpServers['mele-va'].extensions['com.openai'].auth.client={mode:'provided',clientId,tokenEndpointAuthMethod:method};
await writeFile(path,JSON.stringify(manifest,null,2)+'\n');
console.log('Cliente público registrado no manifesto. Ainda é necessário configurar o servidor e validar OAuth.');
