import { Activity, ArrowRight, Building2, CalendarDays } from 'lucide-react';

const destinations = [
 {to:'/admin/governance',title:'Administração da empresa',description:'Titularidade e perfis de acesso. Para retornar, abra Configurações no menu.',icon:Building2},
 {to:'/admin/operations',title:'Operação e relatórios',description:'Funil, indicadores e disponibilidade. Para retornar, abra Configurações no menu.',icon:CalendarDays},
 {to:'/suporte',title:'Diagnóstico',description:'Verificações e suporte da empresa.',icon:Activity},
];
export default function SettingsWorkspaceLinks(){
 return <nav aria-label="Outras configurações da empresa" className="grid grid-cols-1 gap-1.5 md:grid-cols-3 md:gap-3">
  {destinations.map(({to,title,description,icon:Icon})=><a key={to} href={to} className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 md:items-start md:rounded-xl md:p-4 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
   <Icon aria-hidden="true" className="h-5 md:mt-1 w-5 shrink-0 text-primary" />
   <span className="min-w-0 flex-1"><span className="block font-medium">{`Abrir ${title}`}</span><span className="hidden text-sm text-muted-foreground md:block">{description}</span></span>
   <ArrowRight aria-hidden="true" className="h-4 md:mt-1 w-4 shrink-0" />
  </a>)}
 </nav>;
}
