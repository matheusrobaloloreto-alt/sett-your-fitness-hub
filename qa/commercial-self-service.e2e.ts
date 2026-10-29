import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {api,login} from '../scripts/qa/self-service-api.mjs';
import {sql} from '../scripts/qa/self-service-local.mjs';

test('isolated company CMS save/reload/publish and actual public context',async({page,context})=>{
 const id=randomUUID(),slug=`qa-commercial-${id}`,email=`${slug}@self-service.invalid`,password=`QA-${randomUUID()}`;
 const created=await api('/auth/v1/admin/users',{method:'POST',admin:true,body:{email,password,email_confirm:true,user_metadata:{full_name:'Synthetic commercial admin'}}});
 expect(created.ok).toBe(true);const userId=created.data.id;
 try{
  sql(`insert into public.companies(id,name,slug,tier) values('${id}','Synthetic commercial QA','${slug}','basic');
    insert into public.user_roles(user_id,role) values('${userId}','admin') on conflict do nothing;
    insert into public.company_members(user_id,company_id) values('${userId}','${id}');`);
  await context.route('**/*',async route=>{
   const origin=new URL(route.request().url()).origin;
   if(['http://127.0.0.1:57431','http://127.0.0.1:57421'].includes(origin))await route.continue();else await route.abort('blockedbyclient');
  });
  const session=await login({id:userId,email,password});
  expect(session.user.id).toBe(userId);
  const role=await api('/rest/v1/rpc/get_user_role',{method:'POST',token:session.access_token,body:{_user_id:userId}});
  expect(role.ok).toBe(true);expect(role.data).toBe('admin');
  await context.addInitScript(value=>{if(!localStorage.getItem('sb-127-auth-token'))localStorage.setItem('sb-127-auth-token',JSON.stringify(value));},session);
  const roleResponse=page.waitForResponse(response=>response.url().includes('/rpc/get_user_role'),{timeout:15000});
  await page.goto('/admin/settings');
  const browserRole=await roleResponse;
  expect(browserRole.status()).toBe(200);expect(await browserRole.json()).toBe('admin');
  await page.getByRole('button',{name:'Operação',exact:true}).click();
  await page.getByLabel('Novos cadastros',{exact:true}).fill('Entrada synthetic');
  await page.getByLabel('Convite universal de pré-cadastro').fill('Conheça {{empresa}}: {{link}}');
  await page.getByLabel('Título do documento').fill('Apresentação fornecida');
  await page.getByRole('button',{name:'Adicionar seção'}).click();
  await page.getByLabel('Título da seção 1').fill('Equipe');
  await page.getByLabel('Texto da seção 1').fill('Conteúdo synthetic aprovado pela empresa de teste.');
  await page.getByRole('button',{name:'Salvar comercial',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Configuração comercial salva'})).toBeVisible();
  const before=await api('/rest/v1/rpc/get_public_company_information',{method:'POST',body:{_slug:slug}});
  expect(before.data.documents.sobre).toBeUndefined();
  await page.reload();await page.getByRole('button',{name:'Operação',exact:true}).click();
  await expect(page.getByLabel('Novos cadastros',{exact:true})).toHaveValue('Entrada synthetic');
  await expect(page.getByLabel('Título do documento')).toHaveValue('Apresentação fornecida');
  await page.getByRole('button',{name:'Aprovar e publicar documento'}).click();
  await expect(page.getByRole('status').filter({hasText:'Documento aprovado e publicado'})).toBeVisible();
  await page.goto(`/empresa/${slug}/sobre`);
  await expect(page.getByRole('heading',{name:'Apresentação fornecida'})).toBeVisible();
  await expect(page.getByText('Conteúdo synthetic aprovado pela empresa de teste.')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  await page.screenshot({path:test.info().outputPath('approved-company-page.png'),fullPage:true});
 }finally{
  sql(`delete from public.company_commercial_settings_history where company_id='${id}';
    delete from public.company_public_documents where company_id='${id}';
    delete from public.company_commercial_settings where company_id='${id}';
    delete from public.company_product_settings_history where company_id='${id}';
    delete from public.company_product_settings where company_id='${id}';
    delete from public.company_members where company_id='${id}';delete from public.companies where id='${id}';
    delete from public.user_roles where user_id='${userId}';delete from public.profiles where user_id='${userId}';`);
  await api(`/auth/v1/admin/users/${userId}`,{method:'DELETE',admin:true});
 }
});

test('actual local RPC: support scope TTL revoke and master profile/public lookup with company opt-in',async({page,context})=>{
 const id=randomUUID(),other=randomUUID(),slug=`qa-commercial-${id}`,oldName=`Synthetic commercial ${id.slice(0,8)}`;
 const people:Array<{id:string;email:string;password:string;role:string}>=[];
 try{
  for(const role of ['admin','trainer','master']){
   const email=`qa-${role}-${id}@self-service.invalid`,password=`QA-${randomUUID()}`;
   const result=await api('/auth/v1/admin/users',{method:'POST',admin:true,body:{email,password,email_confirm:true,user_metadata:{full_name:`Synthetic ${role}`}}});
   expect(result.ok).toBe(true);people.push({id:result.data.id,email,password,role});
  }
  sql(`insert into public.companies(id,name,slug,tier) values('${id}','${oldName}','${slug}','basic'),('${other}','Synthetic other ${id.slice(0,8)}','other-${slug}','basic');
   ${people.map(person=>`insert into public.user_roles(user_id,role) values('${person.id}','${person.role}') on conflict do nothing;`).join('\n')}
   ${people.filter(person=>person.role!=='master').map(person=>`insert into public.company_members(user_id,company_id) values('${person.id}','${id}');`).join('\n')}`);
  const sessions=await Promise.all(people.map(person=>login(person)));
  const admin=sessions[0].access_token,trainer=sessions[1].access_token;
  const rpc=(name:string,body:unknown,token?:string)=>api(`/rest/v1/rpc/${name}`,{method:'POST',body,token});
  expect((await rpc('company_operator_status',{_company_id:id},trainer)).status).toBe(403);
  expect((await rpc('set_company_support_access',{_company_id:other,_user_id:people[1].id,_enabled:true},admin)).status).toBe(403);
  expect((await rpc('set_company_support_access',{_company_id:id,_user_id:people[1].id,_enabled:true},admin)).ok).toBe(true);
  const status=await rpc('company_operator_status',{_company_id:id},trainer);
  expect(status.ok).toBe(true);expect(Object.keys(status.data).sort()).toEqual(['company_active','settings_updated_at','settings_version']);
  const access=await api(`/rest/v1/company_support_access?company_id=eq.${id}&select=expires_at`,{token:trainer});
  expect(access.ok).toBe(true);expect(Date.parse(access.data[0].expires_at)).toBeGreaterThan(Date.now());
  expect(Date.parse(access.data[0].expires_at)).toBeLessThanOrEqual(Date.now()+24*60*60*1000+30000);
  expect((await rpc('company_operator_status',{_company_id:other},trainer)).status).toBe(403);
  sql(`update public.company_support_access set expires_at=now()-interval '1 second' where company_id='${id}' and user_id='${people[1].id}';`);
  expect((await rpc('company_operator_status',{_company_id:id},trainer)).status).toBe(403);
  expect((await rpc('set_company_support_access',{_company_id:id,_user_id:people[1].id,_enabled:true},admin)).ok).toBe(true);
  expect((await rpc('set_company_support_access',{_company_id:id,_user_id:people[1].id,_enabled:false},admin)).ok).toBe(true);
  expect((await rpc('company_operator_status',{_company_id:id},trainer)).status).toBe(403);
  await context.route('**/*',async route=>['http://127.0.0.1:57431','http://127.0.0.1:57421'].includes(new URL(route.request().url()).origin)?route.continue():route.abort('blockedbyclient'));
  await context.addInitScript(value=>{if(!localStorage.getItem('sb-127-auth-token'))localStorage.setItem('sb-127-auth-token',JSON.stringify(value));},sessions[2]);
  await page.goto('/master/companies');
  await page.getByRole('button',{name:`Editar ${oldName}`,exact:true}).click();
  const dialog=page.getByRole('dialog'),newName=`Updated commercial ${id.slice(0,8)}`,newSlug=`updated-${slug}`;
  await dialog.getByLabel('Nome',{exact:true}).fill(newName);await dialog.getByLabel('Slug',{exact:true}).fill(newSlug);
  const profileAck=page.waitForResponse(response=>response.url().endsWith('/rpc/update_company_public_profile'));
  await dialog.getByRole('button',{name:'Salvar identidade'}).click();const profileResponse=await profileAck;
  const profileResult=await profileResponse.json();expect(profileResponse.ok(),JSON.stringify({status:profileResponse.status(),code:profileResult?.code,message:profileResult?.message})).toBe(true);
  await expect(page.getByRole('button',{name:`Editar ${newName}`,exact:true})).toBeVisible();
  expect((await rpc('get_public_company_information',{_slug:slug})).data).toBeNull();
  const publicInfo=await rpc('get_public_company_information',{_slug:newSlug});expect(publicInfo.ok).toBe(true);expect(publicInfo.data.name).toBe(newName);
  const control=page.getByRole('switch',{name:`Aplicar limite do tier a futuras admissões de ${newName}`,exact:true});
  await expect(control).not.toBeChecked();await control.click();
  const optInAck=page.waitForResponse(response=>response.url().endsWith('/rpc/set_company_limit_source'));
  await page.getByRole('button',{name:'Confirmar política de admissão'}).click();const optInResponse=await optInAck;
  const optInResult=await optInResponse.json();expect(optInResponse.ok(),JSON.stringify({status:optInResponse.status(),code:optInResult?.code,message:optInResult?.message})).toBe(true);
  await expect(control).toBeChecked();await page.reload();await expect(control).toBeChecked();
  const saved=await api(`/rest/v1/companies?id=eq.${id}&select=company_limit_source,company_limit_policy_version`,{token:sessions[2].access_token});
  expect(saved.data).toEqual([{company_limit_source:'tier',company_limit_policy_version:1}]);
  await control.click();const optOutAck=page.waitForResponse(response=>response.url().endsWith('/rpc/set_company_limit_source'));
  await page.getByRole('button',{name:'Confirmar política de admissão'}).click();expect((await optOutAck).ok()).toBe(true);await expect(control).not.toBeChecked();
  await page.goto(`/empresa/${newSlug}/suporte`);await expect(page.getByText(newName,{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Suporte',exact:true})).toBeVisible();
  await page.screenshot({path:test.info().outputPath('company-context-support.png'),fullPage:true});
 }finally{
  sql(`delete from public.company_support_access where company_id in('${id}','${other}');delete from public.company_members where company_id in('${id}','${other}');delete from public.companies where id in('${id}','${other}');${people.map(person=>`delete from public.user_roles where user_id='${person.id}';delete from public.profiles where user_id='${person.id}';`).join('\n')}`);
  for(const person of people)await api(`/auth/v1/admin/users/${person.id}`,{method:'DELETE',admin:true});
 }
});

test('actual canvas exports a nonblank custom-brand PNG without provider calls',async({page,context})=>{
 await context.route('**/*',async route=>['http://127.0.0.1:57431','http://127.0.0.1:57421'].includes(new URL(route.request().url()).origin)?route.continue():route.abort('blockedbyclient'));
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const modulePath='/src/lib/bnContentRenderer.ts';const {renderBnContentSlide}=await import(modulePath);
  const blob=await renderBnContentSlide({format:'post',aesthetic:'l1_educativo',slides:[{role:'capa',title:'Treino synthetic',body:'Conteúdo aprovado de teste'}]},0,{brand:{name:'Synthetic Studio',handle:'@synthetic',navy:'#123456',ink:'#111111',paper:'#ffffff',sand:'#445566'},logoUrl:null});
  const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);
  return {width:canvas.width,height:canvas.height,pixel:Array.from(ctx.getImageData(10,10,1,1).data),png:Array.from(new Uint8Array(await blob.arrayBuffer())),type:blob.type};
 });
 expect(result.width).toBe(1080);expect(result.height).toBe(1350);expect(result.pixel).toEqual([18,52,86,255]);expect(result.type).toBe('image/png');expect(result.png.length).toBeGreaterThan(10000);
 await test.info().attach('custom-brand.png',{body:Buffer.from(result.png),contentType:'image/png'});
});
