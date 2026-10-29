import { useEffect, useRef, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
type Member = { user_id: string; full_name: string | null };
type SupportAccess = { user_id: string; expires_at: string };
type Status = { company_active: boolean; settings_version: number; settings_updated_at: string | null };
export default function CompanyOperatorConsole({ companyId, canManage, members = [] }: { companyId: string; canManage: boolean; members?: Member[] }) {
  const [access, setAccess] = useState<SupportAccess[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accessLoaded,setAccessLoaded]=useState(false);
  const request=useRef({companyId,canManage,generation:0,alive:true,pending:false});
  if(request.current.companyId!==companyId || request.current.canManage!==canManage){request.current.alive=false;request.current={companyId,canManage,generation:request.current.generation+1,alive:true,pending:false};}
  const isCurrent=(scope:typeof request.current,generation:number)=>request.current===scope && scope.alive && scope.generation===generation;
  useEffect(() => {
    const scope=request.current;scope.alive=true;const generation=++scope.generation;
    setAccess([]); setStatus(null); setError("");setBusy(false);setAccessLoaded(false);
    if (canManage) void supabase.from("company_support_access" as never).select("user_id,expires_at").eq("company_id",companyId).then(({ data, error }) => {
      if (!isCurrent(scope,generation)) return;
      if (error) setError("Não foi possível carregar os acessos de suporte.");
      else {setAccess((data || []) as unknown as SupportAccess[]);setAccessLoaded(true);}
    },()=>{if(isCurrent(scope,generation))setError("Não foi possível carregar os acessos de suporte.");});
    return () => {scope.alive=false;scope.generation++;};
  }, [companyId,canManage]);
  const load = async () => {
    const scope=request.current,generation=scope.generation;if(scope.pending || !scope.alive)return;scope.pending=true;
    setBusy(true); setError("");
    try {
      const { data,error } = await supabase.rpc("company_operator_status" as never,{ _company_id:companyId } as never);
      if(!isCurrent(scope,generation))return;
      if (error || !data) throw new Error();
      setStatus(data as unknown as Status);
    } catch { if(isCurrent(scope,generation)){setStatus(null); setError("Diagnóstico indisponível ou acesso não autorizado. Tente novamente.");} }
    finally {if(isCurrent(scope,generation)){scope.pending=false;setBusy(false);}}
  };
  const grant = async (userId: string, enabled: boolean) => {
    const scope=request.current,generation=scope.generation;if(!canManage || !accessLoaded || !members.some(member=>member.user_id===userId) || scope.pending || !scope.alive)return;scope.pending=true;
    setBusy(true); setError("");
    try {
      const { error } = await supabase.rpc("set_company_support_access" as never,{ _company_id:companyId,_user_id:userId,_enabled:enabled } as never);
      if(!isCurrent(scope,generation))return;
      if (error) throw error;
      const result = await supabase.from("company_support_access" as never).select("user_id,expires_at").eq("company_id",companyId);
      if(!isCurrent(scope,generation))return;
      if (result.error) throw result.error;
      setAccess((result.data || []) as unknown as SupportAccess[]);
    } catch {if(isCurrent(scope,generation))setError("Não foi possível alterar o acesso de diagnóstico.");}
    finally {if(isCurrent(scope,generation)){scope.pending=false;setBusy(false);}}
  };
  return <section className="border-t pt-5 mt-5 space-y-4">
    <div className="flex flex-wrap justify-between gap-3 items-center"><h2 className="text-lg font-medium inline-flex items-center gap-2"><Activity className="h-5 w-5" />Diagnóstico operacional</h2><Button variant="outline" onClick={load} disabled={busy}><RefreshCw className="h-4 w-4 mr-2" />Consultar status</Button></div>
    {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    {status && <dl className="grid sm:grid-cols-3 gap-3 text-sm"><div><dt>Empresa</dt><dd>{status.company_active ? "Ativa" : "Inativa"}</dd></div><div><dt>Versão da configuração</dt><dd>{status.settings_version}</dd></div><div><dt>Última alteração</dt><dd>{status.settings_updated_at ? new Date(status.settings_updated_at).toLocaleString("pt-BR") : "Sem configuração salva"}</dd></div></dl>}
    {canManage && <><h3 className="font-medium text-sm">Suporte por empresa · validade de 24 horas</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left p-2">Colaborador</th><th className="text-left p-2">Escopo</th><th className="text-right p-2">Acesso</th></tr></thead><tbody>{members.map(member => <tr key={member.user_id} className="border-b"><td className="p-2">{member.full_name || "Colaborador"}</td><td className="p-2">Status agregado da empresa e da configuração</td><td className="p-2 text-right"><Switch aria-label={`Diagnóstico para ${member.full_name || "colaborador"}`} disabled={busy || !accessLoaded} checked={access.some(item => item.user_id===member.user_id && new Date(item.expires_at).getTime()>Date.now())} onCheckedChange={enabled => void grant(member.user_id,enabled)} /></td></tr>)}</tbody></table></div></>}
  </section>;
}
