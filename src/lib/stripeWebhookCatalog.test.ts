import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {URL as NodeURL} from "node:url";
import ts from "typescript";
import {expect,it,vi} from "vitest";
import {normalizePlatformProductSettings} from "../../supabase/functions/_shared/platform-product-settings";
import {getSubscriptionTier} from "../../supabase/functions/_shared/stripe-catalog-policy";

it.each(["current","historical","intermediate","expanded","unknown","ambiguous","invalid-signature","deleted-known","deleted-unknown","checkout","checkout-incomplete","checkout-mismatch","checkout-unknown","duplicate"])("actual signed handler: %s price policy without provider network",async mode=>{
 const catalog=normalizePlatformProductSettings({tiers:{advanced:{stripe_price_id:"price_customAdvanced"},intermediate:{stripe_price_id:"price_customIntermediate"}}});
 const historical=normalizePlatformProductSettings({tiers:{advanced:{stripe_price_id:"price_historicalAdvanced"}}});
 const subscription={
  metadata:{company_id:"00000000-0000-4000-8000-000000000001",tier:"basic"},status:"active",
  items:{data:[{price:{id:mode==="historical"?"price_historicalAdvanced":mode.includes("unknown")?"price_unknown":mode==="intermediate"?"price_customIntermediate":"price_customAdvanced",product:mode==="expanded"?{id:"prod_custom"}:"prod_custom"}}]},
 };
 if(mode==="checkout-incomplete")subscription.status="incomplete";
 const session={metadata:{...subscription.metadata},subscription:"sub_synthetic"};
 if(mode==="checkout-mismatch")subscription.metadata.company_id="00000000-0000-4000-8000-000000000002";
 const event={id:"evt_synthetic_policy",type:mode.startsWith("deleted")?"customer.subscription.deleted":mode.startsWith("checkout")?"checkout.session.completed":"customer.subscription.updated",data:{object:mode.startsWith("checkout")?session:subscription}};
 if(mode==="ambiguous")historical.tiers.basic.stripe_price_id="price_customAdvanced";
 const updates:Array<{table:string;value:unknown}>=[];
 const client={from:(table:string)=>({
  insert:async()=>({error:mode==="duplicate"?{code:"23505"}:null}),
  upsert:async()=>({error:null}),
  select:()=>{
   if(table==="integration_webhook_events"){const query={eq:()=>query,maybeSingle:async()=>({data:{status:"completed"},error:null})};return query;}
   if(table==="platform_product_settings_history")return Promise.resolve({data:[{settings:historical}],error:null});
   return {eq:()=>({maybeSingle:async()=>({data:{settings:catalog,version:2},error:null})})};
  },
  update:(value:unknown)=>{updates.push({table,value});const query={eq:()=>query,then:(resolve:(value:unknown)=>void)=>Promise.resolve({error:null}).then(resolve)};return query;},
 })};
 let handler!:(request:Request)=>Promise<Response>;
 const network=vi.fn(()=>{throw new Error("Provider network forbidden");});
 const source=readFileSync(new NodeURL("../../supabase/functions/stripe-webhook/index.ts",import.meta.url),"utf8");
 const parsed=ts.createSourceFile("webhook.ts",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const isolated=ts.factory.updateSourceFile(parsed,parsed.statements.filter(statement=>!ts.isImportDeclaration(statement)));
 const javascript=ts.transpileModule(ts.createPrinter().printFile(isolated),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 runInNewContext(javascript,{exports:{},Response,Request,console:{log:()=>{}},fetch:network,getSubscriptionTier,
  Deno:{env:{get:()=>"synthetic-only"}},serve:(callback:typeof handler)=>{handler=callback;},createClient:()=>client,
  Stripe:class{webhooks={constructEventAsync:async()=>{if(mode==="invalid-signature")throw new Error("Invalid signature");return event;}};subscriptions={retrieve:async()=>subscription};},
 });
 const response=await handler(new Request("http://localhost/synthetic-webhook",{method:"POST",headers:{"stripe-signature":"synthetic"},body:"synthetic"}));
 if(["current","historical","intermediate","expanded","checkout","checkout-incomplete","deleted-known"].includes(mode)){
  expect(response.status).toBe(200);
  expect(updates.find(row=>row.table==="companies")?.value).toEqual(mode==="deleted-known"?{subscription_status:"canceled",tier:"basic"}:{subscription_status:mode==="checkout-incomplete"?"incomplete":"active",tier:mode==="intermediate"?"intermediate":"advanced"});
 }else if(mode==="duplicate"){
  expect(response.status).toBe(200);expect(updates.some(row=>row.table==="companies")).toBe(false);
 }else{
  expect(response.status).toBe(mode==="invalid-signature"?400:500);
  expect(updates.some(row=>row.table==="companies")).toBe(false);
 }
 expect(network).not.toHaveBeenCalled();
});
