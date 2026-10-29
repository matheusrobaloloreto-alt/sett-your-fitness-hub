import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  PRESCRIPTION_METHODS, PRESCRIPTION_PHASES, PRESCRIPTION_MAPPING_VALUES,
  normalizeCompanyProductSettings, type CompanyProductSettings, type PrescriptionAnswerMapping,
  type PrescriptionWeekRule,
} from '@/lib/prescriptionMethodology';

type Policy = CompanyProductSettings['prescription'];
export interface PrescriptionMethodologyEditorProps {
  settings: Policy;
  onChange: (settings: Policy) => void;
  disabled?: boolean;
}
const initialMapping: PrescriptionAnswerMapping = { source_key: 'extra_', answer: '', target: 'objective', value: 'forca' };
const targetLabels = { objective: 'Objetivo', daysPerWeek: 'Dias por semana', sessionDurationMinutes: 'Duração em minutos', equipment: 'Equipamento' };

export function PrescriptionMethodologyEditor({ settings, onChange, disabled = false }: PrescriptionMethodologyEditorProps) {
  const [error, setError] = useState('');
  const [mapping, setMapping] = useState<PrescriptionAnswerMapping>(initialMapping);
  const commit = (next: Policy) => {
    try { onChange(normalizeCompanyProductSettings({ prescription: next }).prescription); setError(''); return true; }
    catch { setError('Configuração inválida. Confira os limites, intervalos e mapeamentos duplicados.'); return false; }
  };
  const week = (item: PrescriptionWeekRule, patch: Partial<PrescriptionWeekRule>) => commit({ ...settings, weekly_rules: settings.weekly_rules.map(rule => rule.week === item.week ? { ...rule, ...patch } : rule) });
  return <section aria-label="Metodologia de prescrição" className="space-y-4 border-t pt-4">
    <h3 className="font-semibold">Metodologia de novas prescrições</h3>
    <p className="text-sm text-muted-foreground">Regras aplicadas às novas gerações. O histórico permanece preservado. Dor, restrições, deload e limites de volume prevalecem. A primeira semana respeita também o multiplicador de volume configurado acima.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <fieldset disabled={disabled} className="space-y-4">
      <label className="block">Progressão entre ciclos
        <select aria-label="Progressão entre ciclos" className="block border rounded p-2 bg-background" value={settings.progression_mode} onChange={e => commit({ ...settings, progression_mode: e.target.value as Policy['progression_mode'] })}>
          <option value="wave">Onda: base, acúmulo, intensidade, consolidação</option><option value="maintain">Manter dose anterior</option><option value="reps_only">Progredir somente repetições</option>
        </select>
      </label>
      <div className="space-y-2"><h4>Métodos permitidos</h4><p className="text-sm text-muted-foreground">A seleção permite o método quando o motor o considerar elegível; nível, equipamento e segurança continuam obrigatórios. Desmarcar todos gera séries sem métodos.</p>
        <div className="flex flex-wrap gap-3">{PRESCRIPTION_METHODS.map(method => <label key={method} className="flex gap-2"><input type="checkbox" checked={settings.allowed_methods.includes(method)} onChange={e => commit({ ...settings, allowed_methods: e.target.checked ? [...settings.allowed_methods, method] : settings.allowed_methods.filter(item => item !== method) })}/>{method}</label>)}</div>
      </div>
      <div className="space-y-3"><h4>Regras por semana</h4><p className="text-sm text-muted-foreground">Sem regra específica, vale o padrão do motor. RIR de 2 a 5; volume de 50% a 105%, sempre limitado pelo teto seguro. Em ciclos de quatro semanas, regras 5 e 6 ficam reservadas para ciclos futuros de seis semanas.</p>
        {[...settings.weekly_rules].sort((a, b) => a.week - b.week).map(item => <div key={item.week} className="flex flex-wrap items-end gap-3 border rounded p-3">
          <span>Semana {item.week}</span>
          <label>Fase<select aria-label={`Fase semana ${item.week}`} className="block border rounded p-2 bg-background" value={item.phase} onChange={e => week(item, { phase: e.target.value as PrescriptionWeekRule['phase'] })}>{PRESCRIPTION_PHASES.map(phase => <option key={phase} value={phase}>{phase}</option>)}</select></label>
          {(['rir_min', 'rir_max', 'volume_percent'] as const).map(key => <label key={key}>{key === 'rir_min' ? 'RIR mínimo' : key === 'rir_max' ? 'RIR máximo' : 'Volume %'}<Input className="w-24" aria-label={`${key} semana ${item.week}`} type="number" min={key === 'volume_percent' ? 50 : 2} max={key === 'volume_percent' ? 105 : 5} step={1} value={item[key]} onChange={e => week(item, { [key]: Number(e.target.value) })}/></label>)}
          <Button type="button" variant="outline" onClick={() => commit({ ...settings, weekly_rules: settings.weekly_rules.filter(rule => rule.week !== item.week) })}>Remover semana {item.week}</Button>
        </div>)}
        <Button type="button" variant="outline" disabled={settings.weekly_rules.length >= 6} onClick={() => {
          const available = [1, 2, 3, 4, 5, 6].find(value => !settings.weekly_rules.some(rule => rule.week === value));
          if (available) commit({ ...settings, weekly_rules: [...settings.weekly_rules, { week: available, phase: 'base', rir_min: 3, rir_max: 4, volume_percent: available === 1 ? 80 : 100 }] });
        }}>Adicionar regra semanal</Button>
      </div>
      <div className="space-y-3"><h4>Respostas adicionais → parâmetros canônicos</h4>
        <p className="text-sm text-muted-foreground">Somente extras da anamnese inicial salva. Uma pergunta por destino; respostas devem coincidir exatamente. Respostas desconhecidas exigem revisão. A atualização interciclos prevalece. Sem scripts ou substituição de dados clínicos.</p>
        {settings.answer_mappings.map((item, index) => <div key={`${item.source_key}:${item.answer}`} className="flex flex-wrap gap-2 items-center border rounded p-2"><span>{item.source_key}: {item.answer} → {targetLabels[item.target]}: {item.value}</span><Button type="button" variant="outline" aria-label={`Remover mapeamento ${index + 1}`} onClick={() => commit({ ...settings, answer_mappings: settings.answer_mappings.filter((_, at) => at !== index) })}>Remover</Button></div>)}
        <div className="grid sm:grid-cols-2 gap-3">
          <label>Chave da pergunta extra<Input aria-label="Chave da pergunta extra" maxLength={56} value={mapping.source_key} onChange={e => setMapping({ ...mapping, source_key: e.target.value })}/></label>
          <label>Resposta exata<Input aria-label="Resposta exata" maxLength={100} value={mapping.answer} onChange={e => setMapping({ ...mapping, answer: e.target.value })}/></label>
          <label>Destino<select aria-label="Destino canônico" className="block border rounded p-2 bg-background" value={mapping.target} onChange={e => { const target = e.target.value as PrescriptionAnswerMapping['target']; setMapping({ ...mapping, target, value: PRESCRIPTION_MAPPING_VALUES[target][0] }); }}>{Object.entries(targetLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Valor canônico<select aria-label="Valor canônico" className="block border rounded p-2 bg-background" value={mapping.value} onChange={e => setMapping({ ...mapping, value: e.target.value })}>{PRESCRIPTION_MAPPING_VALUES[mapping.target].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        </div>
        <Button type="button" variant="outline" disabled={settings.answer_mappings.length >= 24} onClick={() => { if (commit({ ...settings, answer_mappings: [...settings.answer_mappings, mapping] })) setMapping(initialMapping); }}>Adicionar mapeamento</Button>
        <p className="text-xs text-muted-foreground">Após adicionar as regras e os mapeamentos, use Salvar configurações na página.</p>
      </div>
    </fieldset>
  </section>;
}
