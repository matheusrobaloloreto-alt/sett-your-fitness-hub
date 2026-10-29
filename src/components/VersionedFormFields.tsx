import { type FormDefinition, isFieldVisible } from '@/lib/formDefinitions';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function VersionedFormFields({definition,answers,onChange}:{definition:FormDefinition;answers:Record<string,unknown>;onChange:(key:string,value:unknown)=>void}) {
  return <div className="space-y-5">{definition.fields.filter(field=>isFieldVisible(field,answers)).map(field=>{
    const id=`question-${field.key}`;
    const value=answers[field.key];
    return <div key={field.key} className="min-w-0 space-y-2">
      <Label htmlFor={id} className="break-words">{field.label}{field.required?' *':''}</Label>
      {field.help && <p id={`${id}-help`} className="text-xs text-muted-foreground break-words">{field.help}</p>}
      {field.type==='boolean' ? <select id={id} aria-describedby={`${id}-help`} required={field.required} className="w-full rounded-md border bg-background p-2 text-sm" value={typeof value==='boolean'?String(value):''} onChange={e=>onChange(field.key,e.target.value===''?undefined:e.target.value==='true')}><option value="">Selecione</option><option value="true">Sim</option><option value="false">Nao</option></select>
      : field.type==='consent' ? <input id={id} type="checkbox" required={field.required} checked={value===true} onChange={e=>onChange(field.key,e.target.checked)} />
      : field.type==='select' ? <select id={id} required={field.required} className="w-full rounded-md border bg-background p-2 text-sm" value={value===undefined?'':String(value)} onChange={e=>onChange(field.key,e.target.value)}><option value="">Selecione</option>{field.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
      : field.type==='multiselect' ? <fieldset id={id} aria-label={field.label} className="flex flex-wrap gap-3">{field.options.map(o=>{const values=Array.isArray(value)?value:[];return <label key={o.value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={values.includes(o.value)} onChange={e=>onChange(field.key,e.target.checked?[...values,o.value]:values.filter(v=>v!==o.value))} />{o.label}</label>;})}</fieldset>
      : field.type==='textarea' ? <Textarea id={id} required={field.required} maxLength={definition.kind==='workout_feedback'&&field.key==='reflection'?1000:2000} value={String(value??'')} onChange={e=>onChange(field.key,e.target.value)} />
      : <Input id={id} type={field.type==='number'?'number':field.type==='date'?'date':'text'} min={field.min} max={field.max} step={field.type==='number'?'any':undefined} required={field.required} maxLength={2000} value={String(value??'')} onChange={e=>onChange(field.key,e.target.value)} />}
    </div>;
  })}</div>;
}
