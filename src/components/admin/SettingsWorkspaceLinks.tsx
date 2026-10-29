import { ArrowRight, Building2, CalendarDays } from 'lucide-react';

const destinations = [
 {to:'/admin/governance',title:'Administração da empresa',description:'Titularidade e perfis de acesso.',icon:Building2},
 {to:'/admin/operations',title:'Operação e relatórios',description:'Funil, indicadores e disponibilidade.',icon:CalendarDays},
];
export default function SettingsWorkspaceLinks(){
 return <nav aria-label="Outras configurações da empresa" className="grid gap-3 md:grid-cols-2">
  {destinations.map(({to,title,description,icon:Icon})=><a key={to} href={to} className="flex min-w-0 items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
   <Icon aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-primary" />
   <span className="min-w-0 flex-1"><span className="block font-medium">{title}</span><span className="block text-sm text-muted-foreground">{description}</span></span>
   <ArrowRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
  </a>)}
 </nav>;
}
