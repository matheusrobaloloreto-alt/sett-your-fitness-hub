import {test,expect,type BrowserContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {api,login} from '../scripts/qa/self-service-api.mjs';
import {sql,privateFile} from '../scripts/qa/self-service-local.mjs';

const storageKey=process.env.SELF_SERVICE_AUTH_STORAGE_KEY??'sb-sett-current-auth-token';
if(!['sb-127-auth-token','sb-sett-current-auth-token'].includes(storageKey))throw new Error('Observed local storage key required');
async function fixture(){
 const company=randomUUID(),name=`Synthetic recovery UI ${company.slice(0,8)}`,people:Record<string,{id:string;email:string}>={};
 sql(`insert into companies(id,name,slug,tier) values('${company}','${name}','ui-${company}','basic');`);
 for(const role of ['admin','master']){
  const email=`ui-${role}-${company}@self-service.invalid`;
  const u=await api('/auth/v1/admin/users',{method:'POST',admin:true,body:{email,email_confirm:true}});expect(u.ok,`Synthetic Auth create HTTP${u.status} code=${u.data?.code??''}`).toBe(true);
  people[role]={id:u.data.id,email};
  sql(`insert into user_roles(user_id,role) values('${u.data.id}','${role}');${role==='admin'?`insert into company_members(company_id,user_id) values('${company}','${u.data.id}');`:''}`);
 }
 privateFile(`recovery-ui-${company}.private.json`,JSON.stringify({company,name,people}));return {company,name,people};
}
async function authenticate(context:BrowserContext,person:{id:string;email:string}){
 const session=await login(person);
 await context.route('**/*',route=>['http://127.0.0.1:57431','http://127.0.0.1:57432','http://127.0.0.1:57421'].includes(new URL(route.request().url()).origin)?route.continue():route.abort('blockedbyclient'));
 await context.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key:storageKey,value:session});
}

test('compiled automation queue reads real tenant status, survives reload and cannot resend',async({page,context})=>{
 const f=await fixture(),flow=randomUUID(),chat=randomUUID(),instance=randomUUID(),node=randomUUID(),session=randomUUID(),label=`Synthetic uncertain ${flow.slice(0,8)}`;
 sql(`insert into whatsapp_instances(id,company_id,instance_name,status) values('${instance}','${f.company}','ui-${instance}','disconnected');
 insert into whatsapp_chats(id,company_id,instance_id,remote_jid) values('${chat}','${f.company}','${instance}','synthetic-${chat}@lid');
 insert into automation_flows(id,company_id,name,trigger_type,is_active) values('${flow}','${f.company}','${label}','manual',false);
 insert into automation_flow_nodes(id,flow_id,node_type,data) values('${node}','${flow}','content','{"message":"Synthetic never sent"}');
 insert into flow_sessions(id,flow_id,chat_id,current_node_id,status,context) values('${session}','${flow}','${chat}','${node}','failed','{"dispatch_error":"dispatch_uncertain"}');`);
 await authenticate(context,f.people.admin);await page.goto('/admin/whatsapp-automation');
 const status=page.getByRole('region',{name:'Confirmações de envio'});
 await expect(status.getByText(label,{exact:true})).toBeVisible();
 await expect(status.getByText(/Reenvio automático suspenso/)).toBeVisible();
 await expect(status.getByRole('button')).toHaveCount(1);
 await status.getByRole('button',{name:'Atualizar confirmações'}).click();
 await expect(status.getByText(label,{exact:true})).toBeVisible();
 await page.reload();await expect(status.getByText(label,{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:test.info().outputPath('uncertain-queue.png'),fullPage:true});
});

test('compiled Master confirms commercial snapshot, reloads it and restores legacy',async({page,context})=>{
 const f=await fixture();await authenticate(context,f.people.master);await page.goto('/master/companies');
 const card=page.locator('[class*="rounded"]').filter({has:page.getByText(f.name,{exact:true})}).filter({has:page.getByRole('button',{name:'Revisar recursos do tier',exact:true})}).last();
 await card.getByRole('button',{name:'Revisar recursos do tier',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:`Recursos de ${f.name}`});
 await expect(dialog.getByText(/Esta confirmacao pode remover acessos/)).toBeVisible();
 const ack=page.waitForResponse(r=>r.url().endsWith('/rpc/set_company_feature_policy'));
 await dialog.getByRole('button',{name:`Confirmar recursos de ${f.name}`,exact:true}).click();expect((await ack).ok()).toBe(true);
 await expect(card.getByText(/Recursos: contrato v1/)).toBeVisible();
 await page.reload();await expect(card.getByText(/Recursos: contrato v1/)).toBeVisible();
 const session=await login(f.people.master);
 const policy=await api('/rest/v1/rpc/get_company_feature_entitlements',{method:'POST',token:session.access_token,body:{_company_id:f.company}});
 expect(policy.ok).toBe(true);expect(policy.data.source).toBe('catalog');expect(policy.data.version).toBe(1);
 const catalog=await api('/rest/v1/platform_product_settings?id=eq.default&select=settings,version',{admin:true});
 expect(policy.data.features).toEqual(catalog.data[0].settings.tiers.basic.features);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await card.scrollIntoViewIfNeeded();
 await card.screenshot({path:test.info().outputPath('master-adopted-policy.png')});
 await card.getByRole('button',{name:'Restaurar legado',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:`Confirmar recursos de ${f.name}`,exact:true}).click();
 await expect(card.getByText('Recursos: legado preservado',{exact:true})).toBeVisible();
 const restored=await api('/rest/v1/rpc/get_company_feature_entitlements',{method:'POST',token:session.access_token,body:{_company_id:f.company}});expect(restored.data.source).toBe('legacy');expect(restored.data.version).toBe(2);
});
