import * as loginCredentials from '../../supabase/functions/_shared/student-login-credentials';
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { requireCompanyFeature } from "../../supabase/functions/_shared/company-feature-entitlements";
import { HttpError } from "../../supabase/functions/_shared/tenant-auth";
import { sendFunnelWhatsAppMessage, sendPreRegistrationConfirmation } from "../../supabase/functions/_shared/sales-funnel";

const company="10000000-0000-4000-8000-000000000001";
function handlerFrom(path: string, decision: unknown, error: unknown = null) {
  let handler!: (request: Request)=>Promise<Response>;
  const network=vi.fn(()=>{throw new Error("External network forbidden");});
  const calls: string[]=[];
  const client={auth:{getClaims:async()=>({data:{claims:{sub:"synthetic-admin"}},error:null})},rpc:async(name:string,args:Record<string,unknown>)=>{
    calls.push(name);
    if(name==="has_role")return {data:args._role==="admin",error:null};
    if(name==="get_user_company_id")return {data:company,error:null};
    if(name==="service_company_feature_allowed")return {data:decision,error};
    throw new Error(`Unexpected RPC ${name}`);
  }};
  const source=readFileSync(new NodeURL(path,import.meta.url),"utf8");
  const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const stripped=ts.factory.updateSourceFile(ast,ast.statements.filter(statement=>!ts.isImportDeclaration(statement)));
  const js=ts.transpileModule(ts.createPrinter().printFile(stripped),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(js,{exports:{},Request,Response,URL,console:{error:()=>{}},fetch:network,
    Deno:{env:{get:()=>"synthetic"},serve:(callback:typeof handler)=>{handler=callback;}},
    ...loginCredentials, createClient:()=>client,requireCompanyFeature,HttpError,FeatureHttpError:HttpError});
  return {handler,network,calls};
}
it.each([false,null])("actual WhatsApp handler denies entitlement %j before any provider call",async decision=>{
  const {handler,network,calls}=handlerFrom("../../supabase/functions/whatsapp-manager/index.ts",decision);
  const result=await handler(new Request("http://localhost/synthetic",{method:"POST",headers:{Authorization:"Bearer synthetic"},body:JSON.stringify({action:"send-message",companyId:company})}));
  expect(result.status).toBe(403);expect(network).not.toHaveBeenCalled();
  expect(calls).toContain("service_company_feature_allowed");
});
it("actual WhatsApp handler resolves caller tenant before asking commercial permission",async()=>{
  const {handler,network,calls}=handlerFrom("../../supabase/functions/whatsapp-manager/index.ts",true);
  const result=await handler(new Request("http://localhost/synthetic",{method:"POST",headers:{Authorization:"Bearer synthetic"},body:JSON.stringify({action:"send-message",companyId:"10000000-0000-4000-8000-000000000002"})}));
  expect(result.status).toBe(403);expect(calls).not.toContain("service_company_feature_allowed");expect(network).not.toHaveBeenCalled();
});
it("actual Asaas administrative handler fails closed on feature lookup failure",async()=>{
  const {handler,network}=handlerFrom("../../supabase/functions/asaas-integration/index.ts",true,{code:"PGRST202"});
  const result=await handler(new Request("http://localhost/synthetic",{method:"POST",headers:{Authorization:"Bearer synthetic"},body:JSON.stringify({action:"check-connection",companyId:company})}));
  expect(result.status).toBe(503);expect(network).not.toHaveBeenCalled();
});
it("both direct funnel senders stop on denial without provider traffic",async()=>{
  const previous=globalThis.fetch;
  const network=vi.fn(()=>{throw new Error("Network forbidden");});globalThis.fetch=network;
  try {
    const q={eq:()=>q};
    const admin={rpc:vi.fn().mockResolvedValue({data:false,error:null}),from:()=>({insert:async()=>({error:null}),update:()=>q})};
    const args={admin,studentId:"synthetic-student",leadId:"synthetic-lead",companyId:company,fullName:"Synthetic",phone:"5548999999999",text:"Synthetic",eventType:"payment_link_sent",eventKey:"synthetic"};
    expect((await sendFunnelWhatsAppMessage(args)).sent).toBe(false);
    expect((await sendPreRegistrationConfirmation(args)).sent).toBe(false);
    expect(network).not.toHaveBeenCalled();expect(admin.rpc).toHaveBeenCalledTimes(2);
  } finally {globalThis.fetch=previous;}
});
