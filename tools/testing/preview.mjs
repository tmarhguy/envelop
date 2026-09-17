// Local UI fixture: no production requests, accounts, hardware jobs or messages.
// node tools/testing/preview.mjs, then http://127.0.0.1:8765/chat/
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
const root = resolve('website');
const profile = {id:'local-user',display_name:'Local Test',avatar:'T'};
const tomato = {id:'00000000-0000-0000-0000-000000000001',display_name:'Tomato',is_device:true,verified:true,pinned:true};
const messages=[];
const jobs=new Map();
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.bin':'application/octet-stream','.webp':'image/webp','.mp4':'video/mp4'};
http.createServer(async (req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1:8765');
    if(url.pathname.startsWith('/__fixture/')) {
      let raw=''; for await (const chunk of req) raw+=chunk;
      const body=raw?JSON.parse(raw):{};
      const path=url.pathname.slice('/__fixture/'.length);
      let data=[];
      if(path==='auth/v1/signup' || path==='auth/v1/token') data={access_token:'local-only',refresh_token:'local-only',expires_in:3600,user:{id:profile.id}};
      else if(path==='rest/v1/rpc/create_profile') data={...profile,display_name:body.p_name};
      else if(path==='rest/v1/rpc/am_i_admin') data=false;
      else if(path==='rest/v1/rpc/get_or_create_dm') data='local-conversation';
      else if(path==='rest/v1/profiles') data=url.searchParams.get('id')===`eq.${profile.id}`?[profile]:[tomato];
      else if(path==='rest/v1/rpc/enqueue_compute_job') {
        data={id:crypto.randomUUID(),status:'queued',result_text:null};jobs.set(data.id,data);
      }
      else if(path==='rest/v1/rpc/my_compute_job' || path==='rest/v1/rpc/cancel_compute_job') {
        data=jobs.get(body.p_job);
        if(!data) {res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Unknown local job'}));return;}
        if(path.endsWith('/cancel_compute_job') && data.status==='queued')data.status='cancelled';
      }
      else if(path==='rest/v1/messages') data=[...messages].reverse();
      else if(path==='rest/v1/rpc/send_message') {
        data={id:crypto.randomUUID(),conversation_id:'local-conversation',sender_id:profile.id,body:body.p_body,created_at:new Date().toISOString()};
        messages.push(data);
      } else if(!['rest/v1/device_bridges','rest/v1/conversations','rest/v1/rpc/heartbeat'].includes(path)) {
        res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Unimplemented local fixture: '+path}));return;
      }
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));return;
    }
    const file=resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
    if(!file.startsWith(root+'/')) {res.writeHead(403);res.end();return;}
    let content=await readFile(file);
    if(file===resolve(root,'chat/chat.js'))content=content.toString().replace(/const SUPABASE_URL = '[^']+';/,"const SUPABASE_URL = 'http://127.0.0.1:8765/__fixture';");
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(content);
  }catch(error){res.writeHead(404);res.end('Local fixture: '+error.message);}
}).listen(8765,'127.0.0.1',()=>console.log('Local fixture: http://127.0.0.1:8765/chat/ (hardware offline, real browser CPU)'));
