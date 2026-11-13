import {handle} from './mcp.js';
Deno.serve((req: Request)=>handle(req,(name: string)=>Deno.env.get(name)).catch(()=>Response.json({error:'Falha temporária.'},{status:500})));
