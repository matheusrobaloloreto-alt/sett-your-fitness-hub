import {chromium,expect as baseExpect} from '@playwright/test';
const expect=baseExpect.configure({timeout:30000});
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {unzipSync,strFromU8} from 'fflate';
import assert from 'node:assert/strict';

const origin='http://127.0.0.1:57632';
const credentialsPath=path.resolve(process.argv[2]||'');
assert.equal(path.basename(credentialsPath),'preview-access.private.json','Pass the owned synthetic access file as the first CLI argument');
const privateRoot=path.dirname(credentialsPath);
assert.ok(privateRoot.startsWith(path.resolve('output/self-service-local-20261026')+path.sep)&&/^sett-complete-[a-f0-9]{16}\.private$/.test(path.basename(privateRoot)),'Owned synthetic evidence directory required');
const access=JSON.parse(readFileSync(credentialsPath,'utf8'));
assert.equal(access.api,'http://127.0.0.1:57621');
assert.equal(access.syntheticOnly,true);
const output=path.join(privateRoot,'ui-review-'+Date.now());mkdirSync(output,{mode:0o700});
const results:any[]=[];const blocked=new Set<string>();const telemetry:any[]=[];let debugPage:any;let phase='start';
const onlyMobileCms=process.argv.includes('--mobile-cms-only');
if(onlyMobileCms){const metadata=JSON.parse(readFileSync(path.join(privateRoot,'compiled-preview.json'),'utf8'));assert.equal(metadata.ready,true);assert.equal(typeof metadata.sourceSha256,'string','Await rebuilt preview metadata with source fingerprint');}
const browser=await chromium.launch({headless:true});
async function step(name:string,run:()=>Promise<unknown>){if(process.env.AUTONOMY_UI_ONLY_FAILED==='1'&&(name==='desktop settings methodology save reload and restore'||name.includes('governance')||name==='desktop route /master/content'))return true;phase=name;try{const details=await run();results.push({name,passed:true,details});console.log('PASS '+name);return true;}catch(error){results.push({name,passed:false,errorType:error instanceof Error?error.name:'unknown',reason:sanitize(error instanceof Error?error.message:'unknown')});if(debugPage&&!debugPage.isClosed()&&new URL(debugPage.url()).pathname!=='/auth'){writeFileSync(path.join(output,'failure-'+results.length+'.private.json'),JSON.stringify({phase:name,path:new URL(debugPage.url()).pathname,headings:await debugPage.getByRole('heading').allTextContents(),body:(await debugPage.locator('body').innerText()).slice(0,10000)}),{mode:0o600});await debugPage.screenshot({path:path.join(output,'failure-'+results.length+'.png'),fullPage:true}).catch(()=>{});}console.log('FAIL '+name);return false;}}
function sanitize(value:string){let s=value;for(const account of Object.values(access.accounts) as any[])for(const field of ['email','password'])if(account[field])s=s.split(account[field]).join('[redacted]');return s.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted-jwt]').slice(0,2500);}
async function session(who:string,mobile=false){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block',acceptDownloads:true,reducedMotion:'reduce'});
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(['data:','blob:'].includes(url.protocol)||[origin,'http://127.0.0.1:57621'].includes(url.origin))await route.continue();else{blocked.add(url.hostname);await route.abort('blockedbyclient');}});
 const page=await context.newPage();debugPage=page;page.setDefaultTimeout(30000);page.on('pageerror',error=>telemetry.push({type:'pageerror',message:sanitize(error.message)}));page.on('response',response=>{const url=new URL(response.url());if(url.pathname.startsWith('/__api'))telemetry.push({type:'response',path:url.pathname,status:response.status()});});page.on('requestfailed',request=>{const url=new URL(request.url());if(url.hostname==='127.0.0.1')telemetry.push({type:'requestfailed',path:url.pathname});});
 await page.goto(origin+'/auth');
 await page.getByLabel('Email',{exact:true}).fill(access.accounts[who].email);
 await page.getByLabel('Senha',{exact:true}).fill(access.accounts[who].password);
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.waitForURL(url=>url.pathname!=='/auth',{timeout:35000});
 return {page,context};
}
function dimensions(bytes:Uint8Array){const b=Buffer.from(bytes);assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');return {width:b.readUInt32BE(16),height:b.readUInt32BE(20),bytes:b.length};}
try{
 if(onlyMobileCms){
  await step('mobile route /master/content',async()=>{
   const current=await session('master',true);
   try{
    await current.page.goto(origin+'/master/content');
    await expect(current.page.getByRole('heading',{name:'Conteúdo da plataforma',exact:true})).toBeVisible();
    await expect(current.page.getByLabel('xp_workout',{exact:true})).toBeEnabled();
    const layout=await current.page.evaluate(()=>{const viewport=document.documentElement.clientWidth;return {viewport,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].map(el=>{const rect=el.getBoundingClientRect();return {tag:el.tagName,left:rect.left,width:rect.width,right:rect.right};}).filter(rect=>rect.right>viewport+1||rect.left< -1).slice(0,15)};});
    await current.page.screenshot({path:path.join(output,'mobile-master-content.png'),fullPage:true});
    writeFileSync(path.join(output,'mobile-cms-layout.json'),JSON.stringify(layout,null,2),{mode:0o600});
    assert.equal(layout.viewport,390);assert.ok(layout.scroll<=layout.viewport+1,'horizontal overflow');return layout;
   }finally{await current.context.close();}
  });
 }else{
 const admin=await session('admin');const page=admin.page;
 await step('desktop settings methodology save reload and restore',async()=>{
  await page.goto(origin+'/admin/settings');await page.getByRole('button',{name:'Prescrição',exact:true}).click();
  const select=page.getByLabel('Progressão entre ciclos',{exact:true});const original=await select.inputValue();const next=original==='maintain'?'reps_only':'maintain';
  await select.selectOption(next);await page.getByRole('button',{name:'Salvar',exact:true}).click();
  await expect(page.getByText('Configurações salvas.',{exact:true})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:'Prescrição',exact:true}).click();await expect(select).toHaveValue(next);
  await select.selectOption(original);await page.getByRole('button',{name:'Salvar',exact:true}).click();await expect(page.getByText('Configurações salvas.',{exact:true})).toBeVisible();
  await page.screenshot({path:path.join(output,'desktop-settings.png'),fullPage:true});return {restored:true};
 });
 await step('Studio actual save reload PNG and ZIP downloads',async()=>{
  await page.goto(origin+'/admin/content-studio');await page.waitForTimeout(1200);writeFileSync(path.join(output,'studio-dom.private.json'),JSON.stringify({path:new URL(page.url()).pathname,headings:await page.getByRole('heading').allTextContents(),body:(await page.locator('body').innerText()).slice(0,9000)}),{mode:0o600});await page.screenshot({path:path.join(output,'studio-initial.png'),fullPage:true});await expect(page.getByRole('heading',{name:'Studio editorial da empresa',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Nova publicação',exact:true})).toBeEnabled();
  const brand=await page.getByLabel('name',{exact:true}).inputValue();
  await page.getByRole('button',{name:'Nova publicação',exact:true}).click();
  const title='QA exportação local '+Date.now();await page.getByLabel('Título interno',{exact:true}).fill(title);
  await page.getByLabel('title',{exact:true}).fill('Treino com clareza');await page.getByLabel('subtitle',{exact:true}).fill('Evidência local');await page.getByLabel('body',{exact:true}).fill('Uma ideia por página, com identidade da empresa.');
  await page.getByRole('button',{name:'Slide 2',exact:true}).click();await page.getByLabel('title',{exact:true}).fill('Continue no seu ritmo');
  await page.getByLabel('Legenda',{exact:true}).fill('Evidência sintética de exportação manual.');
  await page.getByRole('button',{name:'Salvar Studio',exact:true}).click();await expect(page.getByText('Conteúdo salvo e confirmado pelo servidor.',{exact:true})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:new RegExp(title)}).click();await expect(page.getByLabel('Título interno',{exact:true})).toHaveValue(title);await expect(page.getByLabel('name',{exact:true})).toHaveValue(brand);
  const evidence:any={brand,formats:[]};
  for(const [format,height] of [['carrossel',1350],['story',1920]] as const){
   await page.getByLabel('Formato',{exact:true}).selectOption(format);await page.getByRole('button',{name:'Slide 1',exact:true}).click();
   await expect(page.getByRole('img',{name:'Prévia do slide 1',exact:true})).toBeVisible();
   const pngWait=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar PNG',exact:true}).click();const png=await pngWait;const pngPath=path.join(output,'studio-'+format+'.png');await png.saveAs(pngPath);assert.equal(await png.failure(),null);
   const size=dimensions(readFileSync(pngPath));assert.equal(size.width,1080);assert.equal(size.height,height);
   const zipWait=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar ZIP com legenda',exact:true}).click();const zip=await zipWait;const zipPath=path.join(output,'studio-'+format+'.zip');await zip.saveAs(zipPath);assert.equal(await zip.failure(),null);
   const files=unzipSync(new Uint8Array(readFileSync(zipPath)));const pngNames=Object.keys(files).filter(n=>n.endsWith('.png'));assert.equal(pngNames.length,2);
   for(const name of pngNames){assert.equal(dimensions(files[name]).height,height);assert.equal(dimensions(files[name]).width,1080);assert.ok(!name.includes('..')&&!name.includes('/'));}
   const caption=Object.keys(files).find(n=>n.endsWith('.txt'))!;assert.ok(strFromU8(files[caption]).includes('Evidência sintética de exportação manual.'));
   const jsonName=Object.keys(files).find(n=>n.endsWith('.json'))!;const document=JSON.parse(strFromU8(files[jsonName]));assert.equal(document.title,title);assert.equal(document.format,format);assert.equal(document.slides.length,2);
   evidence.formats.push({format,...size,zipEntries:Object.keys(files).length});
  }
  await page.getByLabel('Formato',{exact:true}).selectOption('carrossel');
  await page.screenshot({path:path.join(output,'desktop-studio.png'),fullPage:true});return evidence;
 });
 const routes=[['/admin/settings','Configurações da empresa'],['/admin/governance','Governança da empresa'],['/admin/operations','Operação'],['/admin/content-studio','Studio editorial da empresa']];
 for(const mobile of [false,true]){
  const current=mobile?await session('admin',true):admin;
  for(const [route,heading] of routes)await step((mobile?'mobile':'desktop')+' route '+route,async()=>{
   await current.page.goto(origin+route);await current.page.waitForTimeout(800);writeFileSync(path.join(output,(mobile?'mobile':'desktop')+'-'+route.split('/').at(-1)+'-dom.private.json'),JSON.stringify({path:new URL(current.page.url()).pathname,headings:await current.page.getByRole('heading').allTextContents(),body:(await current.page.locator('body').innerText()).slice(0,7000)}),{mode:0o600});await expect(current.page.getByRole('heading',{name:new RegExp(heading)}).first()).toBeVisible();
   assert.equal(new URL(current.page.url()).pathname,route);
   const width=await current.page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
   await current.page.screenshot({path:path.join(output,(mobile?'mobile':'desktop')+'-'+route.split('/').at(-1)+'.png'),fullPage:true});
   assert.ok(width.scroll<=width.viewport+1,'horizontal overflow');return width;
  });
  if(mobile)await current.context.close();
 }
 await admin.context.close();
 for(const mobile of [false,true])await step((mobile?'mobile':'desktop')+' route /master/content',async()=>{
  const current=await session('master',mobile);try{await current.page.goto(origin+'/master/content');await expect(current.page.getByRole('heading',{name:'Conteúdo da plataforma',exact:true})).toBeVisible();await expect(current.page.getByLabel('XP por treino',{exact:true})).toHaveCount(0);const width=await current.page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));await current.page.screenshot({path:path.join(output,(mobile?'mobile':'desktop')+'-master-content.png'),fullPage:true});assert.ok(width.scroll<=width.viewport+1,'horizontal overflow');return width;}finally{await current.context.close();}
 });
}}catch(error){results.push({name:phase,passed:false,errorType:error instanceof Error?error.name:'unknown',setupFailure:true});}
finally{await browser.close();const result={syntheticOnly:true,origin,results,passed:results.filter(r=>r.passed).length,total:results.length,blockedExternalHosts:[...blocked],telemetry,noDeploy:true};writeFileSync(path.join(output,'browser-result.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify({passed:result.passed,total:result.total,evidence:path.join(output,'browser-result.json')}));if(results.some(r=>!r.passed))process.exitCode=1;}
