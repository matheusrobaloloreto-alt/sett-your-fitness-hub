import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {Runtime,repo,checked,command} from './commercial-complete-runtime.mjs';
const dir=path.resolve(process.argv[2]||'');
if(!dir.startsWith(path.join(repo,'output/self-service-local-20261026/sett-complete-'))||!dir.endsWith('.private'))throw Error('Owned synthetic preview required');
const s=JSON.parse(readFileSync(path.join(dir,'preview-state.private.json')));
const rt=Object.assign(new Runtime(),{token:s.token,name:s.name,network:s.network,imageId:s.imageId,dir});rt.inspect();
const storage=JSON.parse(checked(['inspect',`${s.name}-storage`]))[0];
rt.inspectService({name:`${s.name}-storage`,imageId:storage.Image});
const probe=`let raw='';process.stdin.on('data',c=>raw+=c);process.stdin.on('end',async()=>{try{const q=JSON.parse(raw);const r=await fetch('http://127.0.0.1:5000'+q.path,{method:q.method,headers:q.headers,body:['GET','HEAD'].includes(q.method)?undefined:Buffer.from(q.body,'base64'),signal:AbortSignal.timeout(15000)});const b=Buffer.from(await r.arrayBuffer());console.log(JSON.stringify({status:r.status,headers:Object.fromEntries([...r.headers].filter(([k])=>['content-type','cache-control','content-range','etag'].includes(k))),body:b.toString('base64')}));}catch{console.log(JSON.stringify({status:502,headers:{},body:''}));}});`;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:57645');
  if(!/^\/object\/(?:sign\/|authenticated\/|list\/)?company-content-images(?:\/|$)/.test(url.pathname)) {res.writeHead(404);res.end();return;}
  const chunks=[];let length=0;
  for await(const chunk of req){length+=chunk.length;if(length>6*1024*1024){res.writeHead(413);res.end();return;}chunks.push(chunk);}
  const headers={};for(const key of ['authorization','apikey','content-type','cache-control','x-upsert','x-client-info','range'])if(typeof req.headers[key]==='string')headers[key]=req.headers[key];
  const r=command(['exec','-i',storage.Name.slice(1),'node','-e',probe],JSON.stringify({path:url.pathname+url.search,method:req.method,headers,body:Buffer.concat(chunks).toString('base64')}),20000);
  if(r.status!==0)throw Error('Owned Storage transport unavailable');
  const result=JSON.parse(r.stdout);res.writeHead(result.status,{...result.headers,'Cache-Control':'no-store'});res.end(Buffer.from(result.body,'base64'));
 }catch{res.writeHead(502);res.end();}
});
await new Promise(resolve=>server.listen(57645,'127.0.0.1',resolve));
console.log(JSON.stringify({ready:true,storageProxy:'http://127.0.0.1:57645',syntheticOnly:true,noDeploy:true}));
await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve);});
await new Promise(resolve=>server.close(resolve));
