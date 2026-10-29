import {useCallback,useEffect,useRef,useState} from 'react';
import {AlertTriangle,RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {supabase} from '@/integrations/supabase/client';

type Row={id:string;source:'flow'|'intercycle';name:string;updated_at:string|null};
const client=supabase as unknown as {rpc:(name:string,args:Record<string,string>)=>PromiseLike<{data:Row[]|null;error:unknown}>};

export function AutomationRecoveryStatus({companyId}:{companyId:string}){
  const [rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false);
  const request=useRef(0);
  const invalidate=useCallback(()=>{request.current++;},[]);
  const load=useCallback(async()=>{
    const version=++request.current;setLoading(true);setFailed(false);
    try{
      const result=await client.rpc('get_company_dispatch_uncertainties',{_company_id:companyId});
      if(version!==request.current)return;
      if(result.error)throw result.error;
      setRows(result.data??[]);
    }catch{if(version===request.current){setFailed(true);setRows([]);}}
    finally{if(version===request.current)setLoading(false);}
  },[companyId]);
  useEffect(()=>{setRows([]);void load();return invalidate;},[load,invalidate]);
  if(!loading&&!failed&&!rows.length)return null;
  return <section aria-label="Confirmações de envio" className="mx-4 mb-3 border border-border rounded-md p-3 text-sm">
    <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0"/><h2 className="font-medium flex-1">Confirmações de envio {rows.length>0?`(${rows.length}${rows.length===50?'+':''})`:''}</h2>
      <Button variant="ghost" size="icon" title="Atualizar confirmações" aria-label="Atualizar confirmações" disabled={loading} onClick={()=>void load()}><RefreshCw className="h-4 w-4"/></Button></div>
    {loading?<p role="status">Consultando envios...</p>:failed?<p role="alert">Não foi possível consultar as confirmações.</p>:<>
      <p className="text-muted-foreground">Entrega não confirmada. Reenvio automático suspenso; revisão técnica necessária.</p>
      <ul className="mt-2 max-h-36 overflow-y-auto space-y-1">{rows.map(row=><li key={`${row.source}:${row.id}`} className="flex flex-wrap justify-between gap-x-3"><span className="break-words min-w-0">{row.name}</span>{row.updated_at&&<time dateTime={row.updated_at} className="text-muted-foreground">{new Date(row.updated_at).toLocaleString('pt-BR')}</time>}</li>)}</ul>
    </>}
  </section>;
}
