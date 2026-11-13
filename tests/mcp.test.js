import {test} from 'node:test';import assert from 'node:assert/strict';
import {handle,createServer,validClaims} from '../server/mcp.js';
const endpoint='https://porzljqjsqlqutwtwyqb.supabase.co/functions/v1/mele-mcp';
test('MCP configured public client still requires authentication',async()=>{assert.equal((await handle(new Request(endpoint),()=>undefined)).status,401);});
test('MCP requires token and advertises protected resource',async()=>{const r=await handle(new Request(endpoint),()=> 'client-test');assert.equal(r.status,401);assert.match(r.headers.get('www-authenticate'),/resource_metadata/);const meta=await handle(new Request(endpoint+'/.well-known/oauth-protected-resource'),()=>undefined);assert.equal((await meta.json()).resource,endpoint);});

import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
test('MCP exposes read and resumable staging tools, without direct apply tool',async()=>{
 const server=createServer({}),transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
 await server.connect(transport);
 const response=await transport.handleRequest(new Request(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})}));
 const body=await response.json();assert.equal(response.status,200);assert.equal(body.result.tools.length,7);assert.ok(body.result.tools.some(t=>t.name==='stage_import'));assert.ok(body.result.tools.some(t=>t.name==='create_trip'));assert.ok(!body.result.tools.some(t=>t.name==='commit_import'));await server.close();
});

test('MCP accepts only live dedicated OAuth claims',()=>{const c={iss:'https://porzljqjsqlqutwtwyqb.supabase.co/auth/v1',client_id:'expected',aud:endpoint,role:'authenticated',sub:'user',exp:Date.now()/1000+3600};assert.equal(validClaims(c,'expected'),true);for(const change of [{client_id:undefined},{client_id:'other'},{aud:'authenticated'},{iss:'https://attacker.test'},{role:'service_role'},{exp:0},{sub:null}])assert.equal(validClaims({...c,...change},'expected'),false);});
