-- Local-only versioned instruments. Published rows and response snapshots are append-only.
create table public.company_form_definitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  kind text not null check (kind in ('pre_registration','initial','intercycle','checkin','cycle_feedback')),
  version integer not null check (version > 0),
  definition jsonb not null,
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now(),
  unique(company_id,kind,version), unique(id,company_id)
);
alter table public.company_form_definitions enable row level security;
revoke all on public.company_form_definitions from public,anon,authenticated;
grant select on public.company_form_definitions to authenticated;
grant all on public.company_form_definitions to service_role;
create policy company_form_read on public.company_form_definitions for select to authenticated using (
  public.has_role(auth.uid(),'master'::public.app_role) or exists (
    select 1 from public.company_members cm where cm.user_id=auth.uid() and cm.company_id=company_form_definitions.company_id
  ) or exists(select 1 from public.students s where s.user_id=auth.uid() and s.company_id=company_form_definitions.company_id)
);

create function public.company_form_core(_kind text) returns jsonb language sql immutable set search_path=public,pg_temp as $core$
  select '{"pre_registration":{"kind":"pre_registration","title":"Pre-cadastro","fields":[{"key":"full_name","label":"Nome completo","type":"text","required":true,"hidden":false,"help":"","options":[]},{"key":"whatsapp","label":"WhatsApp","type":"text","required":true,"hidden":false,"help":"","options":[]},{"key":"budget_range","label":"Investimento mensal em saude","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"200_300","label":"R$ 200 a 300"},{"value":"300_400","label":"R$ 300 a 400"},{"value":"400_500","label":"R$ 400 a 500"}]},{"key":"objective","label":"Objetivo principal","type":"text","required":true,"hidden":false,"help":"","options":[]},{"key":"gender","label":"Sexo","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"M","label":"Masculino"},{"value":"F","label":"Feminino"}]},{"key":"age","label":"Idade","type":"number","required":false,"hidden":false,"help":"","options":[],"min":5,"max":100},{"key":"weight_kg","label":"Peso (kg)","type":"number","required":false,"hidden":false,"help":"","options":[],"min":20,"max":350},{"key":"height_cm","label":"Altura (cm)","type":"number","required":false,"hidden":false,"help":"","options":[],"min":80,"max":250},{"key":"body_fat_percent","label":"Gordura corporal (%)","type":"number","required":false,"hidden":false,"help":"","options":[],"min":1,"max":75},{"key":"experience_months","label":"Experiencia (meses)","type":"number","required":false,"hidden":false,"help":"","options":[],"min":0,"max":1200},{"key":"modalities","label":"Modalidades atuais","type":"multiselect","required":true,"hidden":false,"help":"","options":[{"value":"Nenhum","label":"Nenhum"},{"value":"Musculação / Funcional","label":"Musculação / Funcional"},{"value":"Corrida","label":"Corrida"},{"value":"Natação","label":"Natação"},{"value":"Bike","label":"Bike"},{"value":"Triathlon","label":"Triathlon"}]},{"key":"requested_services","label":"Modalidades para prescricao ou orientacao","type":"multiselect","required":true,"hidden":false,"help":"","options":[{"value":"strength","label":"Musculacao / Funcional"},{"value":"running","label":"Corrida"},{"value":"swimming","label":"Natacao"},{"value":"cycling","label":"Ciclismo"},{"value":"triathlon","label":"Triathlon"},{"value":"nutrition","label":"Orientacao nutricional"}]},{"key":"training_days","label":"Semana de treinos (dias e modalidades)","type":"textarea","required":true,"hidden":false,"help":"","options":[]},{"key":"available_days","label":"Dias disponiveis por semana","type":"number","required":true,"hidden":false,"help":"","options":[],"min":1,"max":7},{"key":"session_duration","label":"Tempo da sessao de musculacao","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"até 30 minutos","label":"até 30 minutos"},{"value":"de 30 a 45 minutos","label":"de 30 a 45 minutos"},{"value":"de 45 a 60 minutos","label":"de 45 a 60 minutos"},{"value":"60 minutos ou +","label":"60 minutos ou +"}],"when":{"key":"requested_services","values":["strength"]}},{"key":"training_location","label":"Local da musculacao","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"Academia de Rede","label":"Academia de Rede"},{"value":"Academia do Prédio","label":"Academia do Prédio"},{"value":"Em casa","label":"Em casa"},{"value":"Box de Crossfit/Studio","label":"Box de Crossfit/Studio"}],"when":{"key":"requested_services","values":["strength"]}},{"key":"available_equipment","label":"Equipamentos disponiveis","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"sport_goal","label":"Meta esportiva","type":"text","required":true,"hidden":false,"help":"","options":[],"when":{"key":"requested_services","values":["running","swimming","cycling","triathlon"]}},{"key":"endurance_session_duration","label":"Tempo da sessao esportiva","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"até 30 minutos","label":"até 30 minutos"},{"value":"de 30 a 45 minutos","label":"de 30 a 45 minutos"},{"value":"de 45 a 60 minutos","label":"de 45 a 60 minutos"},{"value":"60 minutos ou +","label":"60 minutos ou +"}],"when":{"key":"requested_services","values":["running","swimming","cycling","triathlon"]}},{"key":"run_where","label":"Local da corrida","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"rua","label":"rua"},{"value":"esteira","label":"esteira"},{"value":"trilha","label":"trilha"},{"value":"pista","label":"pista"}],"when":{"key":"requested_services","values":["running","triathlon"]}},{"key":"swim_pool","label":"Piscina da natacao","type":"text","required":true,"hidden":false,"help":"","options":[],"when":{"key":"requested_services","values":["swimming","triathlon"]}},{"key":"swim_level","label":"Nivel da natacao","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"iniciante","label":"iniciante"},{"value":"intermediario","label":"intermediario"},{"value":"avancado","label":"avancado"}],"when":{"key":"requested_services","values":["swimming","triathlon"]}},{"key":"bike_type","label":"Tipo de bicicleta","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"speed","label":"speed"},{"value":"gravel","label":"gravel"},{"value":"mtb","label":"mtb"},{"value":"indoor","label":"indoor"}],"when":{"key":"requested_services","values":["cycling","triathlon"]}},{"key":"diseases","label":"Condicoes medicas relevantes","type":"textarea","required":true,"hidden":false,"help":"","options":[]},{"key":"medications","label":"Medicamentos de uso continuo","type":"textarea","required":true,"hidden":false,"help":"","options":[]},{"key":"injuries","label":"Historico de lesoes","type":"textarea","required":true,"hidden":false,"help":"","options":[]},{"key":"current_pain","label":"Dor atual","type":"textarea","required":true,"hidden":false,"help":"","options":[]},{"key":"clin_cardiac","label":"Problema cardiaco ou pressao alta?","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"sim","label":"Sim"},{"value":"nao","label":"Nao"}]},{"key":"clin_chest_pain","label":"Dor no peito ou tontura ao esforco?","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"sim","label":"Sim"},{"value":"nao","label":"Nao"}]},{"key":"clin_surgery","label":"Cirurgia recente?","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"sim","label":"Sim"},{"value":"nao","label":"Nao"}]},{"key":"clin_smoke","label":"Tabagismo?","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"sim","label":"Sim"},{"value":"nao","label":"Nao"}]},{"key":"clin_acute","label":"Febre ou doenca aguda?","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"sim","label":"Sim"},{"value":"nao","label":"Nao"}]},{"key":"clin_surgery_detail","label":"Detalhes da cirurgia recente","type":"textarea","required":true,"hidden":false,"help":"","options":[],"when":{"key":"clin_surgery","values":["sim"]}},{"key":"clin_pregnant","label":"Gestacao ou pos-parto","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"na","label":"Nao se aplica"},{"value":"gravida","label":"Gestante"},{"value":"posparto","label":"Pos-parto"}],"when":{"key":"gender","values":["F"]}},{"key":"clin_pregnant_detail","label":"Tempo de gestacao ou pos-parto","type":"text","required":true,"hidden":false,"help":"","options":[],"when":{"key":"clin_pregnant","values":["gravida","posparto"]}},{"key":"eva_tornozelo","label":"Dor: tornozelo (0 a 10)","type":"number","required":true,"hidden":false,"help":"","options":[],"min":0,"max":10},{"key":"eva_joelho","label":"Dor: joelho (0 a 10)","type":"number","required":true,"hidden":false,"help":"","options":[],"min":0,"max":10},{"key":"eva_quadril","label":"Dor: quadril (0 a 10)","type":"number","required":true,"hidden":false,"help":"","options":[],"min":0,"max":10},{"key":"eva_lombar","label":"Dor: lombar (0 a 10)","type":"number","required":true,"hidden":false,"help":"","options":[],"min":0,"max":10},{"key":"eva_ombro","label":"Dor: ombro (0 a 10)","type":"number","required":true,"hidden":false,"help":"","options":[],"min":0,"max":10},{"key":"nutrition","label":"Alimentacao atual","type":"textarea","required":true,"hidden":false,"help":"","options":[],"when":{"key":"requested_services","values":["nutrition"]}},{"key":"has_nutritionist","label":"Acompanhamento com nutricionista?","type":"boolean","required":true,"hidden":false,"help":"","options":[],"when":{"key":"requested_services","values":["nutrition"]}},{"key":"profession","label":"Profissao e rotina","type":"textarea","required":true,"hidden":false,"help":"","options":[]},{"key":"sleep_hours","label":"Horas de sono","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"4h","label":"4h"},{"value":"4h - 6h","label":"4h - 6h"},{"value":"6h - 8h","label":"6h - 8h"},{"value":"8h +","label":"8h +"}]},{"key":"restorative_sleep","label":"Sono reparador?","type":"boolean","required":true,"hidden":false,"help":"","options":[]},{"key":"perceived_recovery","label":"Recuperacao percebida (0 a 10)","type":"number","required":true,"hidden":false,"help":"","options":[],"min":0,"max":10},{"key":"aware_of_trilogy","label":"Consciencia sobre alimentacao, treino e sono?","type":"boolean","required":true,"hidden":false,"help":"","options":[]},{"key":"feel_in_3_months","label":"Como quer se sentir em 3 meses?","type":"textarea","required":true,"hidden":false,"help":"","options":[]},{"key":"biggest_obstacle","label":"Principal obstaculo","type":"textarea","required":true,"hidden":false,"help":"","options":[]},{"key":"commits_communication","label":"Compromisso de comunicacao?","type":"boolean","required":true,"hidden":false,"help":"","options":[]},{"key":"preferred_contact_channel","label":"Forma preferida de contato","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"whatsapp_message","label":"Mensagem no WhatsApp"},{"value":"whatsapp_call","label":"Ligacao no WhatsApp"}]},{"key":"preferred_contact_period","label":"Melhor horario para contato","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"morning","label":"Manha"},{"value":"afternoon","label":"Tarde"},{"value":"evening","label":"Noite"}]},{"key":"extra_comments","label":"Comentarios adicionais","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"modality_other","label":"Outra modalidade","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"training_history","label":"Historico de treino","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"activity_level","label":"Nivel de atividade","type":"select","required":false,"hidden":false,"help":"","options":[{"value":"sedentario","label":"sedentario"},{"value":"leve","label":"leve"},{"value":"moderado","label":"moderado"},{"value":"muito_ativo","label":"muito_ativo"},{"value":"extremo","label":"extremo"}]},{"key":"race_name","label":"Nome da prova","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"race_date","label":"Data da prova","type":"date","required":false,"hidden":false,"help":"","options":[]},{"key":"current_volume_weekly","label":"Volume esportivo semanal","type":"number","required":false,"hidden":false,"help":"","options":[],"min":0,"max":10000},{"key":"current_volume_unit","label":"Unidade do volume","type":"select","required":false,"hidden":false,"help":"","options":[{"value":"km_week","label":"km_week"},{"value":"hours_week","label":"hours_week"}]},{"key":"fcmax","label":"Frequencia cardiaca maxima","type":"number","required":false,"hidden":false,"help":"","options":[],"min":30,"max":250},{"key":"fcrep","label":"Frequencia cardiaca de repouso","type":"number","required":false,"hidden":false,"help":"","options":[],"min":20,"max":200},{"key":"run_best_time","label":"Melhor tempo na corrida","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"swim_volume","label":"Volume na natacao","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"swim_best","label":"Melhor tempo na natacao","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"bike_volume","label":"Volume no ciclismo","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"bike_ftp","label":"Potencia no ciclismo","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"bike_power","label":"Tem medidor de potencia?","type":"boolean","required":false,"hidden":false,"help":"","options":[]},{"key":"clin_other","label":"Outra condicao clinica","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"food_restrictions","label":"Restricoes alimentares","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"food_likes","label":"Alimentos preferidos","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"food_dislikes","label":"Alimentos evitados","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"meals_per_day","label":"Refeicoes por dia","type":"number","required":false,"hidden":false,"help":"","options":[],"min":1,"max":7},{"key":"meal_t1","label":"Horario da refeicao 1","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"meal_t2","label":"Horario da refeicao 2","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"meal_t3","label":"Horario da refeicao 3","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"meal_t4","label":"Horario da refeicao 4","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"meal_t5","label":"Horario da refeicao 5","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"meal_t6","label":"Horario da refeicao 6","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"meal_t7","label":"Horario da refeicao 7","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"meal_routine","label":"Rotina de refeicoes","type":"select","required":false,"hidden":false,"help":"","options":[{"value":"fixa","label":"fixa"},{"value":"varia","label":"varia"},{"value":"muda","label":"muda"}]},{"key":"train_time","label":"Horario de treino","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"train_fasted","label":"Treino em jejum","type":"select","required":false,"hidden":false,"help":"","options":[{"value":"nunca","label":"nunca"},{"value":"asvezes","label":"asvezes"},{"value":"sempre","label":"sempre"}]},{"key":"appetite_wake","label":"Apetite ao acordar","type":"select","required":false,"hidden":false,"help":"","options":[{"value":"faminto","label":"faminto"},{"value":"normal","label":"normal"},{"value":"sem_fome","label":"sem_fome"},{"value":"enjoo","label":"enjoo"}]},{"key":"budget_food","label":"Orcamento alimentar","type":"select","required":false,"hidden":false,"help":"","options":[{"value":"economico","label":"economico"},{"value":"moderado","label":"moderado"},{"value":"premium","label":"premium"}]},{"key":"has_kitchen","label":"Tem acesso a cozinha?","type":"boolean","required":false,"hidden":false,"help":"","options":[]},{"key":"supplements","label":"Suplementos","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"hydration","label":"Hidratacao","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"gi_sensitivities","label":"Sensibilidades digestivas","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"fueling_strategy","label":"Alimentacao em treinos longos","type":"textarea","required":false,"hidden":false,"help":"","options":[]}],"policy":{"intercycle_day":29,"invite_expiry_days":14,"cycle_feedback_days":7}},"initial":{"kind":"initial","title":"Anamnese inicial","fields":[{"key":"objective","label":"Objetivo principal","type":"text","required":true,"hidden":false,"help":"","options":[]},{"key":"gender","label":"Sexo","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"M","label":"Masculino"},{"value":"F","label":"Feminino"}]},{"key":"age","label":"Idade","type":"number","required":false,"hidden":false,"help":"","options":[],"min":5,"max":100},{"key":"weight_kg","label":"Peso (kg)","type":"number","required":false,"hidden":false,"help":"","options":[],"min":20,"max":350},{"key":"height_cm","label":"Altura (cm)","type":"number","required":false,"hidden":false,"help":"","options":[],"min":80,"max":250},{"key":"body_fat_percent","label":"Gordura corporal (%)","type":"number","required":false,"hidden":false,"help":"","options":[],"min":1,"max":75},{"key":"experience_months","label":"Experiencia (meses)","type":"number","required":false,"hidden":false,"help":"","options":[],"min":0,"max":1200},{"key":"modalities","label":"Modalidades atuais","type":"multiselect","required":true,"hidden":false,"help":"","options":[{"value":"Nenhum","label":"Nenhum"},{"value":"Musculação / Funcional","label":"Musculação / Funcional"},{"value":"Corrida","label":"Corrida"},{"value":"Natação","label":"Natação"},{"value":"Bike","label":"Bike"},{"value":"Triathlon","label":"Triathlon"}]},{"key":"requested_services","label":"Modalidades para prescricao ou orientacao","type":"multiselect","required":true,"hidden":false,"help":"","options":[{"value":"strength","label":"Musculacao / Funcional"},{"value":"running","label":"Corrida"},{"value":"swimming","label":"Natacao"},{"value":"cycling","label":"Ciclismo"},{"value":"triathlon","label":"Triathlon"},{"value":"nutrition","label":"Orientacao nutricional"}]},{"key":"training_days","label":"Semana de treinos (dias e modalidades)","type":"textarea","required":true,"hidden":false,"help":"","options":[]},{"key":"available_days","label":"Dias disponiveis por semana","type":"number","required":true,"hidden":false,"help":"","options":[],"min":1,"max":7},{"key":"session_duration","label":"Tempo da sessao de musculacao","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"até 30 minutos","label":"até 30 minutos"},{"value":"de 30 a 45 minutos","label":"de 30 a 45 minutos"},{"value":"de 45 a 60 minutos","label":"de 45 a 60 minutos"},{"value":"60 minutos ou +","label":"60 minutos ou +"}],"when":{"key":"requested_services","values":["strength"]}},{"key":"training_location","label":"Local da musculacao","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"Academia de Rede","label":"Academia de Rede"},{"value":"Academia do Prédio","label":"Academia do Prédio"},{"value":"Em casa","label":"Em casa"},{"value":"Box de Crossfit/Studio","label":"Box de Crossfit/Studio"}],"when":{"key":"requested_services","values":["strength"]}},{"key":"available_equipment","label":"Equipamentos disponiveis","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"sport_goal","label":"Meta esportiva","type":"text","required":true,"hidden":false,"help":"","options":[],"when":{"key":"requested_services","values":["running","swimming","cycling","triathlon"]}},{"key":"endurance_session_duration","label":"Tempo da sessao esportiva","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"até 30 minutos","label":"até 30 minutos"},{"value":"de 30 a 45 minutos","label":"de 30 a 45 minutos"},{"value":"de 45 a 60 minutos","label":"de 45 a 60 minutos"},{"value":"60 minutos ou +","label":"60 minutos ou +"}],"when":{"key":"requested_services","values":["running","swimming","cycling","triathlon"]}},{"key":"run_where","label":"Local da corrida","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"rua","label":"rua"},{"value":"esteira","label":"esteira"},{"value":"trilha","label":"trilha"},{"value":"pista","label":"pista"}],"when":{"key":"requested_services","values":["running","triathlon"]}},{"key":"swim_pool","label":"Piscina da natacao","type":"text","required":true,"hidden":false,"help":"","options":[],"when":{"key":"requested_services","values":["swimming","triathlon"]}},{"key":"swim_level","label":"Nivel da natacao","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"iniciante","label":"iniciante"},{"value":"intermediario","label":"intermediario"},{"value":"avancado","label":"avancado"}],"when":{"key":"requested_services","values":["swimming","triathlon"]}},{"key":"bike_type","label":"Tipo de bicicleta","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"speed","label":"speed"},{"value":"gravel","label":"gravel"},{"value":"mtb","label":"mtb"},{"value":"indoor","label":"indoor"}],"when":{"key":"requested_services","values":["cycling","triathlon"]}},{"key":"diseases","label":"Condicoes medicas relevantes","type":"textarea","required":true,"hidden":false,"help":"","options":[]},{"key":"medications","label":"Medicamentos de uso continuo","type":"textarea","required":true,"hidden":false,"help":"","options":[]},{"key":"injuries","label":"Historico de lesoes","type":"textarea","required":true,"hidden":false,"help":"","options":[]},{"key":"current_pain","label":"Dor atual","type":"textarea","required":true,"hidden":false,"help":"","options":[]},{"key":"clin_cardiac","label":"Problema cardiaco ou pressao alta?","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"sim","label":"Sim"},{"value":"nao","label":"Nao"}]},{"key":"clin_chest_pain","label":"Dor no peito ou tontura ao esforco?","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"sim","label":"Sim"},{"value":"nao","label":"Nao"}]},{"key":"clin_surgery","label":"Cirurgia recente?","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"sim","label":"Sim"},{"value":"nao","label":"Nao"}]},{"key":"clin_smoke","label":"Tabagismo?","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"sim","label":"Sim"},{"value":"nao","label":"Nao"}]},{"key":"clin_acute","label":"Febre ou doenca aguda?","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"sim","label":"Sim"},{"value":"nao","label":"Nao"}]},{"key":"clin_surgery_detail","label":"Detalhes da cirurgia recente","type":"textarea","required":true,"hidden":false,"help":"","options":[],"when":{"key":"clin_surgery","values":["sim"]}},{"key":"clin_pregnant","label":"Gestacao ou pos-parto","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"na","label":"Nao se aplica"},{"value":"gravida","label":"Gestante"},{"value":"posparto","label":"Pos-parto"}],"when":{"key":"gender","values":["F"]}},{"key":"clin_pregnant_detail","label":"Tempo de gestacao ou pos-parto","type":"text","required":true,"hidden":false,"help":"","options":[],"when":{"key":"clin_pregnant","values":["gravida","posparto"]}},{"key":"eva_tornozelo","label":"Dor: tornozelo (0 a 10)","type":"number","required":true,"hidden":false,"help":"","options":[],"min":0,"max":10},{"key":"eva_joelho","label":"Dor: joelho (0 a 10)","type":"number","required":true,"hidden":false,"help":"","options":[],"min":0,"max":10},{"key":"eva_quadril","label":"Dor: quadril (0 a 10)","type":"number","required":true,"hidden":false,"help":"","options":[],"min":0,"max":10},{"key":"eva_lombar","label":"Dor: lombar (0 a 10)","type":"number","required":true,"hidden":false,"help":"","options":[],"min":0,"max":10},{"key":"eva_ombro","label":"Dor: ombro (0 a 10)","type":"number","required":true,"hidden":false,"help":"","options":[],"min":0,"max":10},{"key":"nutrition","label":"Alimentacao atual","type":"textarea","required":true,"hidden":false,"help":"","options":[],"when":{"key":"requested_services","values":["nutrition"]}},{"key":"has_nutritionist","label":"Acompanhamento com nutricionista?","type":"boolean","required":true,"hidden":false,"help":"","options":[],"when":{"key":"requested_services","values":["nutrition"]}},{"key":"profession","label":"Profissao e rotina","type":"textarea","required":true,"hidden":false,"help":"","options":[]},{"key":"sleep_hours","label":"Horas de sono","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"4h","label":"4h"},{"value":"4h - 6h","label":"4h - 6h"},{"value":"6h - 8h","label":"6h - 8h"},{"value":"8h +","label":"8h +"}]},{"key":"restorative_sleep","label":"Sono reparador?","type":"boolean","required":true,"hidden":false,"help":"","options":[]},{"key":"perceived_recovery","label":"Recuperacao percebida (0 a 10)","type":"number","required":true,"hidden":false,"help":"","options":[],"min":0,"max":10},{"key":"aware_of_trilogy","label":"Consciencia sobre alimentacao, treino e sono?","type":"boolean","required":true,"hidden":false,"help":"","options":[]},{"key":"feel_in_3_months","label":"Como quer se sentir em 3 meses?","type":"textarea","required":true,"hidden":false,"help":"","options":[]},{"key":"biggest_obstacle","label":"Principal obstaculo","type":"textarea","required":true,"hidden":false,"help":"","options":[]},{"key":"commits_communication","label":"Compromisso de comunicacao?","type":"boolean","required":true,"hidden":false,"help":"","options":[]},{"key":"preferred_contact_channel","label":"Forma preferida de contato","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"whatsapp_message","label":"Mensagem no WhatsApp"},{"value":"whatsapp_call","label":"Ligacao no WhatsApp"}]},{"key":"preferred_contact_period","label":"Melhor horario para contato","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"morning","label":"Manha"},{"value":"afternoon","label":"Tarde"},{"value":"evening","label":"Noite"}]},{"key":"extra_comments","label":"Comentarios adicionais","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"modality_other","label":"Outra modalidade","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"training_history","label":"Historico de treino","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"activity_level","label":"Nivel de atividade","type":"select","required":false,"hidden":false,"help":"","options":[{"value":"sedentario","label":"sedentario"},{"value":"leve","label":"leve"},{"value":"moderado","label":"moderado"},{"value":"muito_ativo","label":"muito_ativo"},{"value":"extremo","label":"extremo"}]},{"key":"race_name","label":"Nome da prova","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"race_date","label":"Data da prova","type":"date","required":false,"hidden":false,"help":"","options":[]},{"key":"current_volume_weekly","label":"Volume esportivo semanal","type":"number","required":false,"hidden":false,"help":"","options":[],"min":0,"max":10000},{"key":"current_volume_unit","label":"Unidade do volume","type":"select","required":false,"hidden":false,"help":"","options":[{"value":"km_week","label":"km_week"},{"value":"hours_week","label":"hours_week"}]},{"key":"fcmax","label":"Frequencia cardiaca maxima","type":"number","required":false,"hidden":false,"help":"","options":[],"min":30,"max":250},{"key":"fcrep","label":"Frequencia cardiaca de repouso","type":"number","required":false,"hidden":false,"help":"","options":[],"min":20,"max":200},{"key":"run_best_time","label":"Melhor tempo na corrida","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"swim_volume","label":"Volume na natacao","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"swim_best","label":"Melhor tempo na natacao","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"bike_volume","label":"Volume no ciclismo","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"bike_ftp","label":"Potencia no ciclismo","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"bike_power","label":"Tem medidor de potencia?","type":"boolean","required":false,"hidden":false,"help":"","options":[]},{"key":"clin_other","label":"Outra condicao clinica","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"food_restrictions","label":"Restricoes alimentares","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"food_likes","label":"Alimentos preferidos","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"food_dislikes","label":"Alimentos evitados","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"meals_per_day","label":"Refeicoes por dia","type":"number","required":false,"hidden":false,"help":"","options":[],"min":1,"max":7},{"key":"meal_t1","label":"Horario da refeicao 1","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"meal_t2","label":"Horario da refeicao 2","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"meal_t3","label":"Horario da refeicao 3","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"meal_t4","label":"Horario da refeicao 4","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"meal_t5","label":"Horario da refeicao 5","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"meal_t6","label":"Horario da refeicao 6","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"meal_t7","label":"Horario da refeicao 7","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"meal_routine","label":"Rotina de refeicoes","type":"select","required":false,"hidden":false,"help":"","options":[{"value":"fixa","label":"fixa"},{"value":"varia","label":"varia"},{"value":"muda","label":"muda"}]},{"key":"train_time","label":"Horario de treino","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"train_fasted","label":"Treino em jejum","type":"select","required":false,"hidden":false,"help":"","options":[{"value":"nunca","label":"nunca"},{"value":"asvezes","label":"asvezes"},{"value":"sempre","label":"sempre"}]},{"key":"appetite_wake","label":"Apetite ao acordar","type":"select","required":false,"hidden":false,"help":"","options":[{"value":"faminto","label":"faminto"},{"value":"normal","label":"normal"},{"value":"sem_fome","label":"sem_fome"},{"value":"enjoo","label":"enjoo"}]},{"key":"budget_food","label":"Orcamento alimentar","type":"select","required":false,"hidden":false,"help":"","options":[{"value":"economico","label":"economico"},{"value":"moderado","label":"moderado"},{"value":"premium","label":"premium"}]},{"key":"has_kitchen","label":"Tem acesso a cozinha?","type":"boolean","required":false,"hidden":false,"help":"","options":[]},{"key":"supplements","label":"Suplementos","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"hydration","label":"Hidratacao","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"gi_sensitivities","label":"Sensibilidades digestivas","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"fueling_strategy","label":"Alimentacao em treinos longos","type":"textarea","required":false,"hidden":false,"help":"","options":[]}],"policy":{"intercycle_day":29,"invite_expiry_days":14,"cycle_feedback_days":7}},"intercycle":{"kind":"intercycle","title":"Anamnese interciclos","fields":[{"key":"prescription_evaluation","label":"Avaliacao da ultima prescricao","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"better","label":"Ajudou e encaixou bem"},{"value":"same","label":"Ficou parecido com o esperado"},{"value":"worse","label":"Algo piorou ou nao encaixou"},{"value":"not_completed","label":"Nao consegui completar"}]},{"key":"goals_continue","label":"Objetivos e metas continuam os mesmos?","type":"boolean","required":true,"hidden":false,"help":"","options":[]},{"key":"new_goals","label":"Novas metas","type":"textarea","required":true,"hidden":false,"help":"","options":[],"when":{"key":"goals_continue","values":[false]}},{"key":"availability_changed","label":"Seu tempo, espaco ou equipamentos mudaram?","type":"boolean","required":true,"hidden":false,"help":"","options":[]},{"key":"available_days","label":"Dias disponiveis","type":"multiselect","required":false,"hidden":false,"help":"","options":[{"value":"Seg","label":"Seg"},{"value":"Ter","label":"Ter"},{"value":"Qua","label":"Qua"},{"value":"Qui","label":"Qui"},{"value":"Sex","label":"Sex"},{"value":"Sáb","label":"Sáb"},{"value":"Dom","label":"Dom"}],"when":{"key":"availability_changed","values":[true]}},{"key":"session_duration_minutes","label":"Duracao por sessao (minutos)","type":"number","required":false,"hidden":false,"help":"","options":[],"min":5,"max":360,"when":{"key":"availability_changed","values":[true]}},{"key":"training_location","label":"Local disponivel","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"available_equipment","label":"Equipamentos disponiveis","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"pain_present","label":"Teve dor ou desconforto recente?","type":"boolean","required":true,"hidden":false,"help":"","options":[]},{"key":"pain_location","label":"Local da dor","type":"text","required":true,"hidden":false,"help":"","options":[],"when":{"key":"pain_present","values":[true]}},{"key":"pain_eva","label":"EVA (0 a 10)","type":"number","required":true,"hidden":false,"help":"","options":[],"min":0,"max":10,"when":{"key":"pain_present","values":[true]}},{"key":"pain_started_at","label":"Quando comecou?","type":"text","required":false,"hidden":false,"help":"","options":[]},{"key":"pain_movement","label":"Em qual movimento aparece?","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"additional_information","label":"Informacao adicional","type":"textarea","required":false,"hidden":false,"help":"","options":[]},{"key":"sensitive_consent","label":"Autorizo o uso destas respostas e dados sensiveis de saude exclusivamente para revisar meu treino. Nao substitui avaliacao profissional.","type":"consent","required":true,"hidden":false,"help":"","options":[]}],"policy":{"intercycle_day":29,"invite_expiry_days":14,"cycle_feedback_days":7}},"checkin":{"kind":"checkin","title":"Como voce esta hoje?","fields":[{"key":"sleep_quality","label":"Como foi seu sono?","type":"select","required":true,"hidden":false,"help":"","options":[{"label":"Pessimo","value":"1"},{"label":"Ruim","value":"2"},{"label":"Regular","value":"3"},{"label":"Bom","value":"4"},{"label":"Otimo","value":"5"}]},{"key":"stress","label":"Como esta seu estresse?","type":"select","required":true,"hidden":false,"help":"","options":[{"label":"Muito baixo","value":"1"},{"label":"Baixo","value":"2"},{"label":"Moderado","value":"3"},{"label":"Alto","value":"4"},{"label":"Muito alto","value":"5"}]},{"key":"pain","label":"Dor percebida agora","type":"select","required":true,"hidden":false,"help":"","options":[{"value":"0","label":"0"},{"value":"2","label":"2"},{"value":"4","label":"4"},{"value":"6","label":"6"},{"value":"8","label":"8"}]}],"policy":{"intercycle_day":29,"invite_expiry_days":14,"cycle_feedback_days":7}},"cycle_feedback":{"kind":"cycle_feedback","title":"Feedback do ciclo","fields":[{"key":"nps","label":"De 0 a 10, o quanto voce recomendaria seu treinador?","type":"number","required":true,"hidden":false,"help":"","options":[],"min":0,"max":10},{"key":"goals_aligned","label":"Seus objetivos seguem os mesmos?","type":"boolean","required":true,"hidden":false,"help":"","options":[]},{"key":"wants_adjustment","label":"Quer algum ajuste na proxima fase?","type":"boolean","required":true,"hidden":false,"help":"","options":[]},{"key":"adjustment_notes","label":"Qual ajuste?","type":"textarea","required":true,"hidden":false,"help":"","options":[],"when":{"key":"wants_adjustment","values":[true]}}],"policy":{"intercycle_day":29,"invite_expiry_days":14,"cycle_feedback_days":7}}}'::jsonb -> _kind;
$core$;
revoke all on function public.company_form_core(text) from public,anon,authenticated;
grant execute on function public.company_form_core(text) to service_role;

create function public.validate_company_form_definition(_definition jsonb) returns void
language plpgsql set search_path=public,pg_temp as $$
declare
  base jsonb; f jsonb; core jsonb; k text; value_count integer; distinct_count integer;
begin
  base:=public.company_form_core(_definition->>'kind');
  if base is null or jsonb_typeof(_definition) is distinct from 'object'
    or jsonb_typeof(_definition->'title') is distinct from 'string' or length(btrim(_definition->>'title')) not between 1 and 160
    or jsonb_typeof(_definition->'fields') is distinct from 'array' or jsonb_array_length(_definition->'fields')>150
    or jsonb_typeof(_definition->'policy') is distinct from 'object'
    or (_definition->'policy'->>'intercycle_day')::numeric not between 1 and 90
    or (_definition->'policy'->>'invite_expiry_days')::numeric not between 1 and 30
    or (_definition->'policy'->>'cycle_feedback_days')::numeric not between 1 and 30 then
    raise exception 'form_definition_invalid' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(_definition) as keys(schema_key) where schema_key not in ('kind','title','fields','policy'))
    or exists(select 1 from jsonb_object_keys(_definition->'policy') as keys(schema_key) where schema_key not in ('intercycle_day','invite_expiry_days','cycle_feedback_days')) then raise exception 'form_schema_unknown_key'; end if;
  foreach k in array array['intercycle_day','invite_expiry_days','cycle_feedback_days'] loop
    if jsonb_typeof(_definition->'policy'->k) is distinct from 'number'
      or (_definition->'policy'->>k)::numeric<>trunc((_definition->'policy'->>k)::numeric) then raise exception 'form_policy_invalid'; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(_definition->'fields')) <>
    (select count(distinct x->>'key') from jsonb_array_elements(_definition->'fields') x) then raise exception 'form_duplicate_key'; end if;
  for core in select * from jsonb_array_elements(base->'fields') loop
    if not exists(select 1 from jsonb_array_elements(_definition->'fields') x where x->>'key'=core->>'key') then raise exception 'form_core_missing'; end if;
  end loop;
  for f in select * from jsonb_array_elements(_definition->'fields') loop
    if jsonb_typeof(f)<>'object' or coalesce(f->>'key','') !~ '^[a-z][a-z0-9_]{1,79}$'
      or jsonb_typeof(f->'label') is distinct from 'string' or length(btrim(f->>'label')) not between 1 and 200
      or jsonb_typeof(f->'help') is distinct from 'string' or length(f->>'help')>1000
      or jsonb_typeof(f->'required') is distinct from 'boolean' or jsonb_typeof(f->'hidden') is distinct from 'boolean'
      or coalesce(f->>'type','') not in ('text','textarea','number','date','select','multiselect','boolean','consent')
      or jsonb_typeof(f->'options') is distinct from 'array' then raise exception 'form_field_invalid'; end if;
    if exists(select 1 from jsonb_object_keys(f) x where x not in ('key','label','type','required','hidden','help','options','min','max','when')) then raise exception 'form_mapping_invalid'; end if;
    select x into core from jsonb_array_elements(base->'fields') x where x->>'key'=f->>'key';
    if core is not null then
      if f->'type' is distinct from core->'type' or f->'when' is distinct from core->'when'
        or f->'min' is distinct from core->'min' or f->'max' is distinct from core->'max'
        or ((core->>'required')::boolean and (f->>'required'<>'true' or f->>'hidden'='true'))
        or (select jsonb_agg(x->'value' order by x->>'value') from jsonb_array_elements(f->'options') x)
          is distinct from (select jsonb_agg(x->'value' order by x->>'value') from jsonb_array_elements(core->'options') x)
        then raise exception 'form_core_protected'; end if;
    elsif left(f->>'key',6)<>'extra_' or f ? 'when' or f ? 'min' or f ? 'max' then raise exception 'form_mapping_invalid';
    end if;
    select count(*),count(distinct x->>'value') into value_count,distinct_count from jsonb_array_elements(f->'options') x;
    if value_count>50 or value_count<>distinct_count or (f->>'type' in ('select','multiselect') and value_count=0)
      or exists(select 1 from jsonb_array_elements(f->'options') x where jsonb_typeof(x->'value') is distinct from 'string'
        or length(btrim(x->>'value')) not between 1 and 200 or jsonb_typeof(x->'label') is distinct from 'string'
        or length(btrim(x->>'label')) not between 1 and 200) then raise exception 'form_options_invalid'; end if;
  end loop;
end $$;
revoke all on function public.validate_company_form_definition(jsonb) from public,anon,authenticated;
grant execute on function public.validate_company_form_definition(jsonb) to service_role;

create function public.reject_form_mutation() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'form_snapshot_immutable'; end $$;
create trigger immutable_company_form before update or delete on public.company_form_definitions for each row execute function public.reject_form_mutation();

create function public.publish_company_form_definition(_company_id uuid,_definition jsonb,_expected_version integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v integer; row public.company_form_definitions%rowtype;
begin
  if auth.uid() is null or not(public.has_role(auth.uid(),'master'::public.app_role) or
    (public.has_role(auth.uid(),'admin'::public.app_role) and exists(select 1 from public.company_members cm where cm.user_id=auth.uid() and cm.company_id=_company_id))) then
    raise exception 'form_forbidden' using errcode='42501';
  end if;
  perform public.validate_company_form_definition(_definition);
  perform pg_advisory_xact_lock(hashtextextended('company_form:'||_company_id::text||':'||(_definition->>'kind'),0));
  select coalesce(max(version),0) into v from public.company_form_definitions where company_id=_company_id and kind=_definition->>'kind';
  if _expected_version is distinct from v then raise exception 'form_version_conflict' using errcode='PT409'; end if;
  insert into public.company_form_definitions(company_id,kind,version,definition,published_by)
  values(_company_id,_definition->>'kind',v+1,_definition,auth.uid()) returning * into row;
  return jsonb_build_object('id',row.id,'version',row.version,'definition',row.definition);
end $$;
revoke all on function public.publish_company_form_definition(uuid,jsonb,integer) from public,anon;
grant execute on function public.publish_company_form_definition(uuid,jsonb,integer) to authenticated;

create function public.get_company_form_definition(_company_id uuid,_kind text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not(public.has_role(auth.uid(),'master'::public.app_role)
    or exists(select 1 from public.company_members cm where cm.user_id=auth.uid() and cm.company_id=_company_id)
    or exists(select 1 from public.students s where s.user_id=auth.uid() and s.company_id=_company_id)) then raise exception 'form_forbidden' using errcode='42501'; end if;
  return (select jsonb_build_object('id',id,'version',version,'definition',definition) from public.company_form_definitions where company_id=_company_id and kind=_kind order by version desc limit 1);
end $$;
revoke all on function public.get_company_form_definition(uuid,text) from public,anon;
grant execute on function public.get_company_form_definition(uuid,text) to authenticated;

create function public.get_public_pre_registration_form(_slug text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',f.id,'version',f.version,'definition',f.definition)
  from public.company_form_definitions f join public.companies c on c.id=f.company_id
  where c.slug=_slug and c.is_active=true and f.kind='pre_registration' order by f.version desc limit 1;
$$;
revoke all on function public.get_public_pre_registration_form(text) from public;
grant execute on function public.get_public_pre_registration_form(text) to anon,authenticated,service_role;

alter table public.anamnese_invites add column form_definition_id uuid references public.company_form_definitions(id);
alter table public.intercycle_anamnesis_invites add column form_definition_id uuid references public.company_form_definitions(id);
create function public.pin_invite_form_definition() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_kind text:=case when tg_table_name='anamnese_invites' then 'initial' else 'intercycle' end;
begin
  if tg_op='UPDATE' then
    if new.form_definition_id is distinct from old.form_definition_id then raise exception 'form_invite_version_immutable'; end if;
  else
    select id into new.form_definition_id from public.company_form_definitions where company_id=new.company_id and company_form_definitions.kind=v_kind order by version desc limit 1;
    if v_kind='intercycle' and new.form_definition_id is not null then
      new.expires_at:=now()+make_interval(days=>(select (definition->'policy'->>'invite_expiry_days')::integer from public.company_form_definitions where id=new.form_definition_id));
    end if;
  end if;
  return new;
end $$;
create trigger pin_initial_form before insert or update on public.anamnese_invites for each row execute function public.pin_invite_form_definition();
create trigger pin_intercycle_form before insert or update on public.intercycle_anamnesis_invites for each row execute function public.pin_invite_form_definition();

create table public.company_form_responses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  form_definition_id uuid not null,
  source_kind text not null,
  source_id uuid not null,
  source_record_id uuid,
  student_id uuid references public.students(id),
  answers jsonb not null,
  created_at timestamptz not null default now(),
  foreign key(form_definition_id,company_id) references public.company_form_definitions(id,company_id),
  unique(source_kind,source_id)
);
alter table public.company_form_responses enable row level security;
revoke all on public.company_form_responses from public,anon,authenticated;
grant select on public.company_form_responses to authenticated;
grant all on public.company_form_responses to service_role;
create policy form_response_staff_read on public.company_form_responses for select to authenticated using(
  public.has_role(auth.uid(),'master'::public.app_role) or
  (student_id is not null and public.can_manage_staff_student(company_id,student_id)) or
  (student_id is null and public.has_role(auth.uid(),'admin'::public.app_role) and exists(select 1 from public.company_members cm where cm.user_id=auth.uid() and cm.company_id=company_form_responses.company_id))
);
create trigger immutable_form_response before update or delete on public.company_form_responses for each row execute function public.reject_form_mutation();

alter table public.student_checkins add column form_definition_id uuid references public.company_form_definitions(id);
alter table public.student_checkins add column instrument_answers jsonb;
alter table public.cycle_feedback add column form_definition_id uuid references public.company_form_definitions(id);
create function public.validate_company_form_answers(_definition jsonb,_answers jsonb) returns void
language plpgsql set search_path=public,pg_temp as $$
declare f jsonb; v jsonb; visible boolean; is_empty boolean; v_num numeric; option_value jsonb;
begin
  if jsonb_typeof(_answers) is distinct from 'object' or octet_length(_answers::text)>64000 then raise exception 'form_answers_invalid'; end if;
  if exists(select 1 from jsonb_object_keys(_answers) k where not exists(select 1 from jsonb_array_elements(_definition->'fields') x where x->>'key'=k)) then raise exception 'form_unknown_question'; end if;
  for f in select * from jsonb_array_elements(_definition->'fields') loop
    visible:=f->>'hidden'='false';
    if f ? 'when' then
      visible:=visible and exists(select 1 from jsonb_array_elements(f->'when'->'values') x where
        x=_answers->(f->'when'->>'key') or (jsonb_typeof(_answers->(f->'when'->>'key'))='array' and (_answers->(f->'when'->>'key')) @> jsonb_build_array(x)));
    end if;
    if not visible then continue; end if;
    v:=_answers->(f->>'key');
    is_empty:=v is null or v='null'::jsonb or v='""'::jsonb or v='[]'::jsonb or (jsonb_typeof(v)='string' and length(btrim(v#>>'{}'))=0);
    if is_empty then
      if f->>'required'='true' then raise exception 'form_required_answer: %',f->>'key'; end if;
      continue;
    end if;
    case f->>'type'
      when 'boolean' then if jsonb_typeof(v)<>'boolean' then raise exception 'form_answer_type'; end if;
      when 'consent' then if jsonb_typeof(v)<>'boolean' or (f->>'required'='true' and v<>'true'::jsonb) then raise exception 'form_consent_required'; end if;
      when 'number' then
        if jsonb_typeof(v) not in ('string','number') or (v#>>'{}') !~ '^[-+]?[0-9]+([.][0-9]+)?$' then raise exception 'form_answer_number'; end if;
        v_num:=(v#>>'{}')::numeric;
        if v_num<coalesce((f->>'min')::numeric,-1000000) or v_num>coalesce((f->>'max')::numeric,1000000) then raise exception 'form_answer_range'; end if;
        if f->>'key' in ('age','experience_months','available_days','pain_eva','nps','session_duration_minutes') and v_num<>trunc(v_num) then raise exception 'form_answer_integer'; end if;
      when 'select' then
        if jsonb_typeof(v) not in ('string','number') or not exists(select 1 from jsonb_array_elements(f->'options') o where o->>'value'=v#>>'{}') then raise exception 'form_answer_option'; end if;
      when 'multiselect' then
        if jsonb_typeof(v)<>'array' then raise exception 'form_answer_type'; end if;
        if (select count(*) from jsonb_array_elements(v))<>(select count(distinct x) from jsonb_array_elements(v) x) then raise exception 'form_answer_duplicate'; end if;
        for option_value in select * from jsonb_array_elements(v) loop
          if jsonb_typeof(option_value)<>'string' or not exists(select 1 from jsonb_array_elements(f->'options') o where o->'value'=option_value) then raise exception 'form_answer_option'; end if;
        end loop;
      when 'date' then
        if jsonb_typeof(v)<>'string' or (v#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'form_answer_date'; end if;
        perform (v#>>'{}')::date;
      else if jsonb_typeof(v)<>'string' or length(v#>>'{}')>2000 then raise exception 'form_answer_text'; end if;
    end case;
  end loop;
end $$;
revoke all on function public.validate_company_form_answers(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.validate_company_form_answers(jsonb,jsonb) to service_role;

create function public.snapshot_versioned_pre_registration() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare meta jsonb:=new.pre_registration_answers->'__form'; v_definition jsonb; v_id uuid;
begin
  if meta is null then return new; end if;
  if tg_op='UPDATE' and meta is not distinct from old.pre_registration_answers->'__form' then return new; end if;
  v_id:=(meta->>'definition_id')::uuid;
  select definition into v_definition from public.company_form_definitions where id=v_id and company_id=new.company_id and kind='pre_registration';
  if v_definition is null then raise exception 'form_pre_registration_tenant_mismatch'; end if;
  perform public.validate_company_form_answers(v_definition,meta->'answers');
  insert into public.company_form_responses(company_id,form_definition_id,source_kind,source_id,source_record_id,answers)
  values(new.company_id,v_id,'pre_registration',(meta->>'submission_id')::uuid,new.id,meta->'answers');
  return new;
end $$;
create trigger snapshot_pre_registration after insert or update of pre_registration_answers on public.leads for each row execute function public.snapshot_versioned_pre_registration();

create function public.assert_instrument_definition_scope() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_kind text:=case when tg_table_name='student_checkins' then 'checkin' else 'cycle_feedback' end; v_definition jsonb; v_answers jsonb;
begin
  if new.form_definition_id is null then return new; end if;
  select definition into v_definition from public.company_form_definitions f where f.id=new.form_definition_id and f.company_id=new.company_id and f.kind=v_kind;
  if v_definition is null then raise exception 'form_instrument_tenant_mismatch'; end if;
  v_answers:=case when v_kind='checkin' then to_jsonb(new)->'instrument_answers' else (to_jsonb(new)->'answers')-'adjustment' end;
  perform public.validate_company_form_answers(v_definition,v_answers);
  if v_kind='checkin' then
    if (v_answers->>'sleep_quality')::numeric is distinct from new.sleep_quality::numeric or (v_answers->>'stress')::numeric is distinct from new.stress::numeric or (v_answers->>'pain')::numeric is distinct from new.pain::numeric then raise exception 'form_canonical_answer_mismatch'; end if;
  else
    if (v_answers->>'nps')::numeric is distinct from new.nps::numeric or (v_answers->>'goals_aligned')::boolean is distinct from new.goals_aligned or (v_answers->>'wants_adjustment')::boolean is distinct from new.wants_adjustment then raise exception 'form_canonical_answer_mismatch'; end if;
  end if;
  return new;
end $$;
create trigger checkin_definition_scope before insert or update on public.student_checkins for each row execute function public.assert_instrument_definition_scope();
create trigger cycle_feedback_definition_scope before insert or update on public.cycle_feedback for each row execute function public.assert_instrument_definition_scope();

create function public.submit_versioned_initial_form(_token text,_definition_id uuid,_answers jsonb,_student_patch jsonb,_anamnese jsonb,_effects jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare invite public.anamnese_invites%rowtype; result jsonb;
begin
  select * into invite from public.anamnese_invites where token=_token for update;
  if invite.id is null or invite.form_definition_id is distinct from _definition_id or _definition_id is null then raise exception 'form_invite_version_mismatch'; end if;
  perform public.validate_company_form_answers((select definition from public.company_form_definitions where id=_definition_id),_answers);
  result:=public.submit_anamnesis_invite_atomic(_token,_student_patch,_anamnese,_effects);
  insert into public.company_form_responses(company_id,form_definition_id,source_kind,source_id,student_id,answers)
  values(invite.company_id,_definition_id,'initial',invite.id,invite.student_id,_answers);
  return result;
end $$;
revoke all on function public.submit_versioned_initial_form(text,uuid,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_versioned_initial_form(text,uuid,jsonb,jsonb,jsonb,jsonb) to service_role;

create function public.submit_versioned_intercycle_form(_token_sha256 text,_definition_id uuid,_answers jsonb,_payload jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare invite public.intercycle_anamnesis_invites%rowtype; answer_id uuid;
begin
  select * into invite from public.intercycle_anamnesis_invites where token_sha256=_token_sha256 for update;
  if invite.id is null or invite.form_definition_id is distinct from _definition_id or _definition_id is null then raise exception 'form_invite_version_mismatch'; end if;
  perform public.validate_company_form_answers((select definition from public.company_form_definitions where id=_definition_id),_answers);
  answer_id:=public.submit_intercycle_anamnesis(
    _token_sha256,_payload->>'prescription_evaluation',(_payload->>'goals_continue')::boolean,_payload->>'new_goals',
    (_payload->>'availability_changed')::boolean,array(select jsonb_array_elements_text(coalesce(_payload->'available_days','[]'::jsonb))),
    nullif(_payload->>'session_duration_minutes','')::integer,_payload->>'training_location',_payload->>'available_equipment',
    (_payload->>'pain_present')::boolean,_payload->>'pain_location',nullif(_payload->>'pain_eva','')::integer,
    _payload->>'pain_started_at',_payload->>'pain_movement',_payload->>'additional_information',(_payload->>'sensitive_consent')::boolean,'intercycle-v1');
  insert into public.company_form_responses(company_id,form_definition_id,source_kind,source_id,student_id,answers)
  values(invite.company_id,_definition_id,'intercycle',answer_id,invite.student_id,_answers);
  return answer_id;
end $$;
revoke all on function public.submit_versioned_intercycle_form(text,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_versioned_intercycle_form(text,uuid,jsonb,jsonb) to service_role;

-- Policy is prospective: existing deliveries and issued links retain their dates.
create or replace function public.process_intercycle_anamnesis_schedule()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare inserted_count integer:=0; v_today date:=public.current_business_date();
begin
  with due as (
    select s.company_id,s.id student_id,e.id enrollment_id,c.id training_cycle_id,
      (c.start_date::timestamptz+make_interval(days=>coalesce((f.definition->'policy'->>'intercycle_day')::integer,29)-1)) scheduled_for
    from public.students s
    join public.enrollments e on e.student_id=s.id and e.company_id=s.company_id and e.status in ('active','awaiting_training','awaiting_renewal')
    join public.training_cycles c on c.enrollment_id=e.id and c.company_id=s.company_id and c.student_id=s.id
    left join lateral(select definition from public.company_form_definitions where company_id=s.company_id and kind='intercycle' order by version desc limit 1) f on true
    where s.intercycle_anamnesis_enabled=true and coalesce(s.status,'') in ('active','awaiting_training','awaiting_renewal')
      and coalesce(c.status,'') not in ('cancelled','superseded') and c.superseded_at is null
      and v_today>=c.start_date+coalesce((f.definition->'policy'->>'intercycle_day')::integer,29)-1
      and v_today<=coalesce(c.end_date,c.start_date+41)
  ), inserted as (
    insert into public.intercycle_anamnesis_deliveries(company_id,student_id,enrollment_id,training_cycle_id,idempotency_key,scheduled_for)
    select company_id,student_id,enrollment_id,training_cycle_id,'intercycle:'||training_cycle_id::text,greatest(scheduled_for,now()) from due
    on conflict(company_id,training_cycle_id) do nothing returning 1
  ) select count(*) into inserted_count from inserted;
  return inserted_count;
end $$;
