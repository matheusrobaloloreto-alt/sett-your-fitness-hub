export const FORM_KINDS = ['pre_registration', 'initial', 'intercycle', 'checkin', 'cycle_feedback', 'workout_feedback'] as const;
export type FormKind = typeof FORM_KINDS[number];
export type QuestionType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean' | 'consent';
export type FormField = {
  key: string; label: string; type: QuestionType; required: boolean; hidden: boolean; help: string;
  options: { value: string; label: string }[]; min?: number; max?: number;
  when?: { key: string; values: (string | boolean)[] };
};
export type FormDefinition = { kind: FormKind; title: string; fields: FormField[]; policy: { intercycle_day: number; invite_expiry_days: number; cycle_feedback_days: number } };
export type PublishedForm = { id: string; version: number; definition: FormDefinition };
const CHOICE_LABELS:Record<string,string>={M:'Masculino',F:'Feminino',strength:'Musculacao / Funcional',running:'Corrida',swimming:'Natacao',cycling:'Ciclismo',triathlon:'Triathlon',nutrition:'Orientacao nutricional',better:'Ajudou e encaixou bem',same:'Ficou parecido com o esperado',worse:'Algo piorou ou nao encaixou',not_completed:'Nao consegui completar',sim:'Sim',nao:'Nao',na:'Nao se aplica',gravida:'Gestante',posparto:'Pos-parto',morning:'Manha',afternoon:'Tarde',evening:'Noite',whatsapp_message:'Mensagem no WhatsApp',whatsapp_call:'Ligacao no WhatsApp','200_300':'R$ 200 a 300','300_400':'R$ 300 a 400','400_500':'R$ 400 a 500'};
const choices = (values: string[]) => values.map(value => ({ value, label: CHOICE_LABELS[value]??value }));
const q = (key: string, label: string, type: QuestionType = 'text', required = false, values: string[] = [], extra: Partial<FormField> = {}): FormField => ({ key, label, type, required, hidden: false, help: '', options: choices(values), ...extra });
const service = (values: string[]) => ({ key: 'requested_services', values });
const initial = (): FormField[] => [
  q('objective','Objetivo principal','text',true), q('gender','Sexo','select',true,['M','F']),
  q('age','Idade','number',false,[],{min:5,max:100}), q('weight_kg','Peso (kg)','number',false,[],{min:20,max:350}), q('height_cm','Altura (cm)','number',false,[],{min:80,max:250}),
  q('body_fat_percent','Gordura corporal (%)','number',false,[],{min:1,max:75}), q('experience_months','Experiencia (meses)','number',false,[],{min:0,max:1200}),
  q('modalities','Modalidades atuais','multiselect',true,['Nenhum','Musculação / Funcional','Corrida','Natação','Bike','Triathlon']),
  q('requested_services','Modalidades para prescricao ou orientacao','multiselect',true,['strength','running','swimming','cycling','triathlon','nutrition']),
  q('training_days','Semana de treinos (dias e modalidades)','textarea',true), q('available_days','Dias disponiveis por semana','number',true,[],{min:1,max:7}),
  q('session_duration','Tempo da sessao de musculacao','select',true,['até 30 minutos','de 30 a 45 minutos','de 45 a 60 minutos','60 minutos ou +'],{when:service(['strength'])}),
  q('training_location','Local da musculacao','select',true,['Academia de Rede','Academia do Prédio','Em casa','Box de Crossfit/Studio'],{when:service(['strength'])}),
  q('available_equipment','Equipamentos disponiveis','textarea'),
  q('sport_goal','Meta esportiva','text',true,[],{when:service(['running','swimming','cycling','triathlon'])}),
  q('endurance_session_duration','Tempo da sessao esportiva','select',true,['até 30 minutos','de 30 a 45 minutos','de 45 a 60 minutos','60 minutos ou +'],{when:service(['running','swimming','cycling','triathlon'])}),
  q('run_where','Local da corrida','select',true,['rua','esteira','trilha','pista'],{when:service(['running','triathlon'])}),
  q('swim_pool','Piscina da natacao','text',true,[],{when:service(['swimming','triathlon'])}), q('swim_level','Nivel da natacao','select',true,['iniciante','intermediario','avancado'],{when:service(['swimming','triathlon'])}),
  q('bike_type','Tipo de bicicleta','select',true,['speed','gravel','mtb','indoor'],{when:service(['cycling','triathlon'])}),
  ...['diseases','medications','injuries','current_pain'].map((key,i)=>q(key,['Condicoes medicas relevantes','Medicamentos de uso continuo','Historico de lesoes','Dor atual'][i],'textarea',true)),
  ...['clin_cardiac','clin_chest_pain','clin_surgery','clin_smoke','clin_acute'].map((key,i)=>q(key,['Problema cardiaco ou pressao alta?','Dor no peito ou tontura ao esforco?','Cirurgia recente?','Tabagismo?','Febre ou doenca aguda?'][i],'select',true,['sim','nao'])),
  q('clin_surgery_detail','Detalhes da cirurgia recente','textarea',true,[],{when:{key:'clin_surgery',values:['sim']}}),
  q('clin_pregnant','Gestacao ou pos-parto','select',true,['na','gravida','posparto'],{when:{key:'gender',values:['F']}}),
  q('clin_pregnant_detail','Tempo de gestacao ou pos-parto','text',true,[],{when:{key:'clin_pregnant',values:['gravida','posparto']}}),
  ...['tornozelo','joelho','quadril','lombar','ombro'].map(key=>q(`eva_${key}`,`Dor: ${key} (0 a 10)`,'number',true,[],{min:0,max:10})),
  q('nutrition','Alimentacao atual','textarea',true,[],{when:service(['nutrition'])}), q('has_nutritionist','Acompanhamento com nutricionista?','boolean',true,[],{when:service(['nutrition'])}),
  q('profession','Profissao e rotina','textarea',true), q('sleep_hours','Horas de sono','select',true,['4h','4h - 6h','6h - 8h','8h +']),
  q('restorative_sleep','Sono reparador?','boolean',true), q('perceived_recovery','Recuperacao percebida (0 a 10)','number',true,[],{min:0,max:10}),
  q('aware_of_trilogy','Consciencia sobre alimentacao, treino e sono?','boolean',true), q('feel_in_3_months','Como quer se sentir em 3 meses?','textarea',true),
  q('biggest_obstacle','Principal obstaculo','textarea',true), q('commits_communication','Compromisso de comunicacao?','boolean',true),
  q('preferred_contact_channel','Forma preferida de contato','select',true,['whatsapp_message','whatsapp_call']), q('preferred_contact_period','Melhor horario para contato','select',true,['morning','afternoon','evening']),
  q('extra_comments','Comentarios adicionais','textarea'),
  q('modality_other','Outra modalidade'),q('training_history','Historico de treino','textarea'),
  q('activity_level','Nivel de atividade','select',false,['sedentario','leve','moderado','muito_ativo','extremo']),
  q('race_name','Nome da prova'),q('race_date','Data da prova','date'),
  q('current_volume_weekly','Volume esportivo semanal','number',false,[],{min:0,max:10000}),q('current_volume_unit','Unidade do volume','select',false,['km_week','hours_week']),
  q('fcmax','Frequencia cardiaca maxima','number',false,[],{min:30,max:250}),q('fcrep','Frequencia cardiaca de repouso','number',false,[],{min:20,max:200}),
  q('run_best_time','Melhor tempo na corrida'),q('swim_volume','Volume na natacao'),q('swim_best','Melhor tempo na natacao'),q('bike_volume','Volume no ciclismo'),q('bike_ftp','Potencia no ciclismo'),q('bike_power','Tem medidor de potencia?','boolean'),
  q('clin_other','Outra condicao clinica','textarea'),q('food_restrictions','Restricoes alimentares','textarea'),q('food_likes','Alimentos preferidos','textarea'),q('food_dislikes','Alimentos evitados','textarea'),
  q('meals_per_day','Refeicoes por dia','number',false,[],{min:1,max:7}),...Array.from({length:7},(_,i)=>q(`meal_t${i+1}`,`Horario da refeicao ${i+1}`)),
  q('meal_routine','Rotina de refeicoes','select',false,['fixa','varia','muda']),q('train_time','Horario de treino'),q('train_fasted','Treino em jejum','select',false,['nunca','asvezes','sempre']),q('appetite_wake','Apetite ao acordar','select',false,['faminto','normal','sem_fome','enjoo']),
  q('budget_food','Orcamento alimentar','select',false,['economico','moderado','premium']),q('has_kitchen','Tem acesso a cozinha?','boolean'),q('supplements','Suplementos','textarea'),q('hydration','Hidratacao'),q('gi_sensitivities','Sensibilidades digestivas','textarea'),q('fueling_strategy','Alimentacao em treinos longos','textarea'),
];
export function defaultFormDefinition(kind: FormKind): FormDefinition {
  const fields = kind === 'initial' || kind === 'pre_registration' ? initial() : kind === 'intercycle' ? [
    q('prescription_evaluation','Avaliacao da ultima prescricao','select',true,['better','same','worse','not_completed']),
    q('goals_continue','Objetivos e metas continuam os mesmos?','boolean',true), q('new_goals','Novas metas','textarea',true,[],{when:{key:'goals_continue',values:[false]}}),
    q('availability_changed','Seu tempo, espaco ou equipamentos mudaram?','boolean',true),
    q('available_days','Dias disponiveis','multiselect',false,['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'],{when:{key:'availability_changed',values:[true]}}),
    q('session_duration_minutes','Duracao por sessao (minutos)','number',false,[],{min:5,max:360,when:{key:'availability_changed',values:[true]}}),
    q('training_location','Local disponivel'), q('available_equipment','Equipamentos disponiveis','textarea'),
    q('pain_present','Teve dor ou desconforto recente?','boolean',true),
    q('pain_location','Local da dor','text',true,[],{when:{key:'pain_present',values:[true]}}), q('pain_eva','EVA (0 a 10)','number',true,[],{min:0,max:10,when:{key:'pain_present',values:[true]}}),
    q('pain_started_at','Quando comecou?'), q('pain_movement','Em qual movimento aparece?','textarea'), q('additional_information','Informacao adicional','textarea'),
    q('sensitive_consent','Autorizo o uso destas respostas e dados sensiveis de saude exclusivamente para revisar meu treino. Nao substitui avaliacao profissional.','consent',true),
  ] : kind === 'checkin' ? [
    q('sleep_quality','Como foi seu sono?','select',true,['1','2','3','4','5'],{options:['Pessimo','Ruim','Regular','Bom','Otimo'].map((label,i)=>({label,value:String(i+1)}))}), q('stress','Como esta seu estresse?','select',true,['1','2','3','4','5'],{options:['Muito baixo','Baixo','Moderado','Alto','Muito alto'].map((label,i)=>({label,value:String(i+1)}))}), q('pain','Dor percebida agora','select',true,['0','2','4','6','8']),
  ] : kind==='workout_feedback' ? [q('perception','Qual foi sua percepcao geral?','select',false,['Difícil','Bom','Ótimo']),q('reflection','O que voce quer que seu treinador saiba?','textarea')] : [q('nps','De 0 a 10, o quanto voce recomendaria seu treinador?','number',true,[],{min:0,max:10}),q('goals_aligned','Seus objetivos seguem os mesmos?','boolean',true),q('wants_adjustment','Quer algum ajuste na proxima fase?','boolean',true),q('adjustment_notes','Qual ajuste?','textarea',true,[],{when:{key:'wants_adjustment',values:[true]}})];
  if(kind === 'pre_registration') fields.unshift(q('full_name','Nome completo','text',true),q('whatsapp','WhatsApp','text',true),q('budget_range','Investimento mensal em saude','select',true,['200_300','300_400','400_500']));
  return {kind,title:{initial:'Anamnese inicial',pre_registration:'Pre-cadastro',intercycle:'Anamnese interciclos',checkin:'Como voce esta hoje?',cycle_feedback:'Feedback do ciclo',workout_feedback:'Como foi o treino?'}[kind],fields,policy:{intercycle_day:29,invite_expiry_days:14,cycle_feedback_days:7}};
}

const types = new Set(['text','textarea','number','date','select','multiselect','boolean','consent']);
export function normalizeFormDefinition(input: unknown): FormDefinition {
  const form = structuredClone(input) as FormDefinition;
  if(!form || !FORM_KINDS.includes(form.kind) || typeof form.title !== 'string' || !form.title.trim() || form.title.length > 160 || !Array.isArray(form.fields) || form.fields.length > 150) throw new Error('Definicao invalida');
  if(Object.keys(form).some(key=>!['kind','title','fields','policy'].includes(key)) || !form.policy || Object.keys(form.policy).some(key=>!['intercycle_day','invite_expiry_days','cycle_feedback_days'].includes(key))) throw new Error('Definicao invalida');
  const base = defaultFormDefinition(form.kind);
  const keys = new Set<string>();
  for(const field of form.fields) {
    if(!field || !/^[a-z][a-z0-9_]{1,79}$/.test(field.key) || keys.has(field.key) || !types.has(field.type) || typeof field.label !== 'string' || !field.label.trim() || field.label.length > 200 || typeof field.help !== 'string' || field.help.length > 1000 || typeof field.required !== 'boolean' || typeof field.hidden !== 'boolean' || !Array.isArray(field.options) || field.options.length > 50) throw new Error('Pergunta invalida');
    keys.add(field.key);
    if(Object.keys(field).some(k=>!['key','label','type','required','hidden','help','options','min','max','when'].includes(k))) throw new Error('Mapeamento nao permitido');
    const core = base.fields.find(f=>f.key===field.key);
    if(!core && (!field.key.startsWith('extra_') || field.when || field.min !== undefined || field.max !== undefined)) throw new Error('Chave extra invalida');
    if(core && (field.type !== core.type || JSON.stringify(field.when) !== JSON.stringify(core.when) || field.min !== core.min || field.max !== core.max || (core.required && (!field.required || field.hidden)))) throw new Error('Campo canonico protegido');
    const values = field.options.map(o=>o.value);
    if(new Set(values).size !== values.length || field.options.some(o=> typeof o.value !== 'string' || !o.value.trim() || o.value.length>200 || typeof o.label !== 'string' || !o.label.trim() || o.label.length>200)) throw new Error('Alternativas invalidas');
    if(['select','multiselect'].includes(field.type) && !values.length) throw new Error('Alternativas obrigatorias');
    if(core && JSON.stringify([...values].sort())!==JSON.stringify(core.options.map(o=>o.value).sort())) throw new Error('Valores canonicos protegidos');
  }
  if(base.fields.some(f=>!keys.has(f.key))) throw new Error('Campos canonicos ausentes');
  if(form.kind==='workout_feedback' && !form.fields.some(field=>['perception','reflection'].includes(field.key)&&!field.hidden))throw new Error('Mantenha uma pergunta canonica de feedback visivel');
  for(const [key,min,max] of [['intercycle_day',1,90],['invite_expiry_days',1,30],['cycle_feedback_days',1,30]] as const) if(!Number.isInteger(form.policy?.[key]) || form.policy[key]<min || form.policy[key]>max) throw new Error('Politica invalida');
  return form;
}
export function isFieldVisible(field: FormField, answers: Record<string, unknown>) {
  if(field.hidden) return false;
  if(!field.when) return true;
  const value = answers[field.when.key];
  return field.when.values.some(v=>Array.isArray(value) ? value.includes(v) : value===v);
}
export function validateFormAnswers(form: FormDefinition, answers: Record<string, unknown>): string[] {
  const invalid: string[] = [];
  for(const field of form.fields) {
    if(!isFieldVisible(field,answers)) continue;
    const value=answers[field.key];
    const empty=value===undefined || value===null || value==='' || (typeof value==='string' && !value.trim()) || (Array.isArray(value) && !value.length);
    if(empty) {if(field.required) invalid.push(field.label); continue;}
    const options=field.options.map(o=>o.value);
    let valid=false;
    switch(field.type) {
      case 'boolean': valid=typeof value==='boolean'; break;
      case 'consent': valid=typeof value==='boolean' && (!field.required || value===true); break;
      case 'number': valid=(typeof value==='number' || (typeof value==='string' && /^[-+]?\d+(?:\.\d+)?$/.test(value.trim()))) && Number.isFinite(Number(value)) && Number(value)>=(field.min??-1000000) && Number(value)<=(field.max??1000000) && (!['age','experience_months','available_days','pain_eva','nps','session_duration_minutes'].includes(field.key) || Number.isInteger(Number(value))); break;
      case 'select': valid=(typeof value==='string' || typeof value==='number') && options.includes(String(value)); break;
      case 'multiselect': valid=Array.isArray(value) && new Set(value).size===value.length && value.every(v=>typeof v==='string' && options.includes(v)); break;
      case 'date': { const date=typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value+'T00:00:00Z') : null; valid=!!date && Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value; break; }
      default: valid=typeof value==='string' && value.length<=2000;
    }
    if(!valid) invalid.push(field.label);
  }
  return invalid;
}
export function projectFormAnswers(form: FormDefinition, answers: Record<string, unknown>): Record<string, unknown> {
  const core = new Set(defaultFormDefinition(form.kind).fields.map(f=>f.key));
  const result: Record<string,unknown>={custom_answers:{}};
  for(const field of form.fields) {
    if(!isFieldVisible(field,answers) || answers[field.key]===undefined || answers[field.key]==='') continue;
    const value=answers[field.key];
    if(core.has(field.key)) result[field.key]=field.type==='number' ? Number(value) : value;
    else (result.custom_answers as Record<string,unknown>)[field.key]={label:field.label,value};
  }
  if(form.kind==='initial' || form.kind==='pre_registration') {
    result.available_equipment=typeof result.available_equipment==='string' ? result.available_equipment.split(',').map(s=>s.trim()).filter(Boolean) : [];
    const services=(result.requested_services??[]) as string[];
    for(const name of ['strength','running','swimming','cycling','nutrition']) result[`interest_${name}`]=services.includes(name) || (name!=='strength' && name!=='nutrition' && services.includes('triathlon'));
    result.shown_blocks=['dados','objetivo','treino','saude','clinica',...(result.interest_strength?['musculacao']:[]),...(result.interest_running?['corrida']:[]),...(result.interest_swimming?['natacao']:[]),...(result.interest_cycling?['ciclismo']:[]),...(result.interest_nutrition?['nutricao']:[])];
    result.days_available=result.available_days; result.goals=result.sport_goal || result.objective;
  }
  return result;
}
