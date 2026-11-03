import {useEffect,useRef,useState} from "react";
import {Switch} from "@/components/ui/switch";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {saveCompanyLimitSource,type CompanyLimitSource} from "@/lib/companyAdmissionPolicy";

export default function CompanyAdmissionPolicy({companyId,name,source,version,onSaved}:{companyId:string;name:string;source:CompanyLimitSource;version:number;onSaved:(value:{company_limit_source:CompanyLimitSource;company_limit_policy_version:number})=>void}){
 const scope=useRef({companyId,alive:true});
 if(scope.current.companyId!==companyId){scope.current.alive=false;scope.current={companyId,alive:true};}
 const [target,setTarget]=useState<CompanyLimitSource|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const pending=useRef(false);
 useEffect(()=>{const current=scope.current;current.alive=true;setTarget(null);setError("");setBusy(false);pending.current=false;return()=>{current.alive=false;};},[companyId]);
 const confirm=async()=>{
  if(!target||pending.current)return;const current=scope.current;pending.current=true;setBusy(true);setError("");
  try{const result=await saveCompanyLimitSource(companyId,target,version,target==="tier");if(scope.current===current&&current.alive){setTarget(null);onSaved(result);}}
  catch(cause){if(scope.current===current&&current.alive)setError(cause instanceof Error?cause.message:"Não foi possível salvar.");}
  finally{if(scope.current===current&&current.alive){pending.current=false;setBusy(false);}}
 };
 return <div className="mt-3 border-t pt-3 space-y-2">
  <label className="flex items-center gap-2 text-sm"><Switch checked={source==="tier"} disabled={busy} onCheckedChange={enabled=>{setError("");setTarget(enabled?"tier":"legacy");}}/>Aplicar limite do plano a futuras admissões de {name}</label>
  <p className="text-xs text-muted-foreground">{source==="tier"?"Origem: política do plano, quando ativada no catálogo.":"Origem: legado preservado; teto do catálogo não aplicado."}</p>
  <Dialog open={target!==null} onOpenChange={open=>{if(!open&&!busy)setTarget(null);}}><DialogContent><DialogHeader><DialogTitle>Política de admissão: {name}</DialogTitle><DialogDescription>{target==="tier"?"Confirmo aplicar a política quantitativa do plano às futuras admissões desta empresa, quando ativada no catálogo. Alunos existentes e capacidade legada não serão alterados.":"Retornar ao legado preservado, sem aplicar o teto quantitativo do catálogo a esta empresa. Alunos existentes não serão alterados."}</DialogDescription></DialogHeader>
   {error&&<p role="alert" className="text-destructive">{error}</p>}
   <Button disabled={busy} onClick={confirm}>Confirmar política de admissão</Button>
  </DialogContent></Dialog>
 </div>;
}
