import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {deflateSync} from 'node:zlib';
const dir=path.resolve(process.argv[2]||'');if(!dir.includes('/output/self-service-local-20261026/sett-complete-')||!dir.endsWith('.private'))throw Error('Owned synthetic directory required');
const access=JSON.parse(readFileSync(path.join(dir,'preview-access.private.json')));assert.equal(access.syntheticOnly,true);assert.equal(access.api,'http://127.0.0.1:57621');
const api=access.api,storage='http://127.0.0.1:57645';const tokens={};
for(const who of ['admin','foreign','assigned','student','master']){const r=await fetch(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(access.accounts[who])});const d=await r.json();assert.equal(r.status,200);tokens[who]=d.access_token;}
function crc(b){let c=0xffffffff;for(const x of b){c^=x;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type),h=Buffer.alloc(4),c=Buffer.alloc(4);h.writeUInt32BE(data.length);c.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([h,t,data,c]);}
function png(w,h,logo=false){const hdr=Buffer.alloc(13);hdr.writeUInt32BE(w);hdr.writeUInt32BE(h,4);hdr[8]=8;hdr[9]=6;const rows=Buffer.alloc(h*(w*4+1));for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*(w*4+1)+1+x*4;rows[i]=logo?240:(x<w/2?240:20);rows[i+1]=logo?180:(y<h/2?40:200);rows[i+2]=logo?40:130;rows[i+3]=logo&&(x<4||y<4)?0:255;}return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',hdr),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}
const slideBytes=png(128,128),logoBytes=png(128,64,true),company=access.companyId;
const headers=who=>({'authorization':'Bearer '+tokens[who]});
async function request(who,url,options={}){const r=await fetch(url,{...options,headers:{...headers(who),...options.headers}});let d=null;try{d=await r.json();}catch{}return {status:r.status,data:d};}
const imagePath=`${company}/slides/${randomUUID()}.png`,logoPath=`${company}/logos/${randomUUID()}.png`;
for(const [who,p] of [['foreign',imagePath],['assigned',imagePath],['student',imagePath],['master',imagePath]]){
 const r=await request(who,storage+'/object/company-content-images/'+p,{method:'POST',headers:{'content-type':'image/png'},body:slideBytes});assert.ok(r.status>=400,who+' upload must deny');
}
for(const [p,bytes] of [[imagePath,slideBytes],[logoPath,logoBytes]]){
 const r=await request('admin',storage+'/object/company-content-images/'+p,{method:'POST',headers:{'content-type':'image/png','x-upsert':'false'},body:bytes});if(r.status!==200){writeFileSync(path.join(dir,'storage-upload-failure.private.json'),JSON.stringify(r),{mode:0o600});throw Error('Actual upload refused; private evidence saved');}
}
const r=await request('admin',storage+'/object/sign/company-content-images/'+imagePath,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({expiresIn:60})});assert.equal(r.status,200);assert.equal(typeof r.data.signedURL,'string');
const asset=await fetch(storage+r.data.signedURL);assert.equal(asset.status,200);assert.deepEqual(Buffer.from(await asset.arrayBuffer()),slideBytes);
for(const who of ['foreign','assigned','student','master']){
 const denial=await request(who,storage+'/object/sign/company-content-images/'+imagePath,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({expiresIn:60})});assert.ok(denial.status>=400,who+' sign must deny');
}
const update=await request('admin',storage+'/object/company-content-images/'+imagePath,{method:'PUT',headers:{'content-type':'image/png'},body:slideBytes});assert.ok(update.status>=400);
async function rpc(name,body,expected=200){const r=await request('admin',api+'/rest/v1/rpc/'+name,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,expected,name);return r.data;}
const current=await rpc('get_company_content',{_company_id:company});
const document=structuredClone(current.document),id=randomUUID();document.brand.logo={path:logoPath,mime:'image/png',bytes:logoBytes.length,width:128,height:64};
const ref={path:imagePath,mime:'image/png',bytes:slideBytes.length,width:128,height:128};
document.posts.push({id,title:'Synthetic image evidence',scheduled_for:'',status:'draft',format:'carrossel',aesthetic:'l1_educativo',slides:[{role:'capa',title:'Imagem real do Storage',subtitle:'',body:'',image:ref},{role:'cta',title:'Mesmo arquivo na exportação',subtitle:'',body:'',image:ref}],caption:'Synthetic local validation',hashtags:[]});
const saved=await rpc('save_company_content',{_company_id:company,_document:document,_expected_version:current.version});assert.equal(saved.version,current.version+1);
const reread=await rpc('get_company_content',{_company_id:company});assert.deepEqual(reread.document.posts.find(p=>p.id===id).slides[0].image,ref);
await rpc('save_company_content',{_company_id:company,_document:document,_expected_version:current.version},409);
const bad=structuredClone(document);bad.posts.at(-1).slides[0].image.bytes++;
await rpc('save_company_content',{_company_id:company,_document:bad,_expected_version:saved.version},400);
writeFileSync(path.join(dir,'storage-media-fixture.private.json'),JSON.stringify({postId:id,imagePath,logoPath,slideBytes:slideBytes.length,logoBytes:logoBytes.length}),{mode:0o600});
writeFileSync(path.join(dir,'synthetic-upload.png'),slideBytes,{mode:0o600});writeFileSync(path.join(dir,'synthetic-logo.png'),logoBytes,{mode:0o600});
console.log(JSON.stringify({syntheticOnly:true,actualStorage:true,uploadAndSignedBytes:true,tenantAndRoleDenials:true,immutable:true,saveReloadAndStaleVersion:true,metadataForgeryDenied:true,noDeploy:true}));
