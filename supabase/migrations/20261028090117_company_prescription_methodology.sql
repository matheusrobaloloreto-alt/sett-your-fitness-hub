-- A20/A21: forward-only contract extension. Existing settings/history/plans are not rewritten.
-- Keep the save RPC, authorization, RLS, audit and OCC unchanged.
create function public.validate_prescription_methodology_field(_key text, _value jsonb)
returns void language plpgsql immutable set search_path = public, pg_temp as $$
declare
  item jsonb;
  k text;
  allowed jsonb := '{"objective":["forca","hipertrofia","emagrecimento","recomposicao","performance","saude"],"daysPerWeek":["2","3","4","5","6"],"sessionDurationMinutes":["15","20","30","40","45","60","75","90","120","180"],"equipment":["academia completa","halteres","peso corporal","elasticos"]}';
begin
  if _key = 'progression_mode' then
    if jsonb_typeof(_value) is distinct from 'string' or (_value #>> '{}') not in ('wave','maintain','reps_only') then
      raise exception 'Invalid prescription progression' using errcode='22023';
    end if;
    return;
  end if;
  if jsonb_typeof(_value) is distinct from 'array' then raise exception 'Invalid prescription array' using errcode='22023'; end if;
  if _key = 'allowed_methods' then
    if jsonb_array_length(_value)>11 or (select count(distinct v) from jsonb_array_elements(_value) v)<>jsonb_array_length(_value)
      or exists(select 1 from jsonb_array_elements(_value) v where jsonb_typeof(v)<>'string' or (v #>> '{}') not in ('biset','triset','superset','giantset','circuito','dropset','restpause','cluster','isometria','pico_contracao','pico_alongamento')) then
      raise exception 'Invalid prescription methods' using errcode='22023';
    end if;
  elsif _key = 'weekly_rules' then
    if jsonb_array_length(_value)>6 then raise exception 'Too many weeks' using errcode='22023'; end if;
    for item in select * from jsonb_array_elements(_value) loop
      if jsonb_typeof(item)<>'object' then raise exception 'Invalid week' using errcode='22023'; end if;
      if (select array_agg(v order by v) from jsonb_object_keys(item) v) is distinct from array['phase','rir_max','rir_min','volume_percent','week'] then raise exception 'Invalid week keys' using errcode='22023'; end if;
      foreach k in array array['week','rir_min','rir_max','volume_percent'] loop
        if jsonb_typeof(item->k)<>'number' then raise exception 'Invalid week number' using errcode='22023'; end if;
        if (item->>k)::numeric<>trunc((item->>k)::numeric) then raise exception 'Invalid week integer' using errcode='22023'; end if;
      end loop;
      if jsonb_typeof(item->'phase')<>'string' or item->>'phase' not in ('base','acumulacao','intensificacao')
        or (item->>'week')::numeric not between 1 and 6 or (item->>'rir_min')::numeric<2 or (item->>'rir_max')::numeric>5
        or (item->>'rir_min')::numeric>(item->>'rir_max')::numeric or (item->>'volume_percent')::numeric not between 50 and 105 then
        raise exception 'Invalid week bounds' using errcode='22023';
      end if;
    end loop;
    if (select count(distinct v->'week') from jsonb_array_elements(_value) v)<>jsonb_array_length(_value) then raise exception 'Duplicate week' using errcode='22023'; end if;
  elsif _key = 'answer_mappings' then
    if jsonb_array_length(_value)>24 then raise exception 'Too many mappings' using errcode='22023'; end if;
    for item in select * from jsonb_array_elements(_value) loop
      if jsonb_typeof(item)<>'object' then raise exception 'Invalid mapping' using errcode='22023'; end if;
      if (select array_agg(v order by v) from jsonb_object_keys(item) v) is distinct from array['answer','source_key','target','value'] then raise exception 'Invalid mapping keys' using errcode='22023'; end if;
      if exists(select 1 from jsonb_each(item) v where jsonb_typeof(v.value)<>'string') then raise exception 'Invalid mapping type' using errcode='22023'; end if;
      if item->>'source_key' !~ '^extra_[a-z0-9_]{1,50}$' or btrim(item->>'answer')='' or length(item->>'answer')>100
        or item->>'answer' ~* '(\mBearer\s+\S+|\m(sk|sb_secret|service_role)[_-][A-Za-z0-9_-]{8,}|\meyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(api[_ -]?key|secret|password|senha|token)\s*[:=]\s*\S+)'
        or not (allowed ? (item->>'target')) or not ((allowed->(item->>'target')) ? (item->>'value')) then
        raise exception 'Invalid canonical mapping' using errcode='22023';
      end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(_value) v group by v->>'source_key',v->>'answer' having count(*)>1)
      or exists(select 1 from jsonb_array_elements(_value) v group by v->>'source_key' having count(distinct v->>'target')>1)
      or exists(select 1 from jsonb_array_elements(_value) v group by v->>'target' having count(distinct v->>'source_key')>1) then
      raise exception 'Ambiguous mapping' using errcode='22023';
    end if;
  else raise exception 'Unknown prescription field' using errcode='22023';
  end if;
end;
$$;
revoke all on function public.validate_prescription_methodology_field(text,jsonb) from public, anon, authenticated;

create or replace function public.company_product_settings_defaults()
returns jsonb language sql immutable set search_path = public, pg_temp as $$
select '{"messages":{"weekly_contact":"Oi, {{primeiro_nome}}! Como estao os treinos? Conte com a equipe para continuar evoluindo.","pre_registration_confirmation":"Oi, {{primeiro_nome}}! Recebemos seu pre-cadastro na {{empresa}}. Nossa equipe entrara em contato.","fiscal_invite":"Oi, {{primeiro_nome}}! Complete seus dados fiscais e escolha seu plano: {{link}}","payment_link":"Oi, {{primeiro_nome}}! Seu cadastro foi concluido. Escolha seu plano e faca o pagamento com seguranca: {{link}}","assessment_onboarding":"Oi, {{primeiro_nome}}! Pagamento confirmado. A equipe vai enviar as instrucoes da avaliacao de movimento. Prazo: {{prazo}} dias uteis, com previsao ate {{data}}.","anamnesis_invite":"Oi, {{primeiro_nome}}! Preencha sua anamnese para prepararmos seu treino: {{link}}","renewal_due":"Oi, {{primeiro_nome}}! Seu plano esta proximo da renovacao. Vamos continuar? {{link}}","renewal_overdue":"Oi, {{primeiro_nome}}! Sua renovacao esta pendente. Fale com a equipe: {{link}}","intercycle_invite":"Oi, {{primeiro_nome}}! Responda ao questionario para o proximo ciclo: {{link}}","first_contact":"Oi, {{primeiro_nome}}! Aqui e {{profissional}}, da {{empresa}}. Como posso ajudar?","daily_reminder_title":"Seu treino de hoje te espera","daily_reminder_body":"Bora manter a sequencia? Abra o app e registre seu treino.","new_workout_push_title":"Novo treino disponivel","new_workout_push_body":"{{primeiro_nome}}, seu novo treino ja esta disponivel no app."},"contact_policy":{"max_weekly_contacts":2,"minimum_interval_hours":72,"no_workout_days":7,"no_workout_repeat_days":6,"cart_abandonment_hours":2,"payment_repeat_hours":24,"weekdays":[1,2,3,4,5,6,7],"start_hour":8,"end_hour":20,"timezone":"America/Sao_Paulo"},"brand":{"company_name":"","professional_name":"","professional_registration":"","support_email":"","support_whatsapp":"","terms_url":"","privacy_url":""},"business":{"assessment_sla_business_days":5,"installments_short":1,"installments_medium":6,"installments_long":12},"notifications":{"daily_reminder_enabled":true,"daily_reminder_hour":8,"new_workout_enabled":true},"experience":{"cadence_warning_hours":24,"cadence_critical_hours":72,"risk_no_workout_days":10,"renewal_notice_days":7,"xp_workout":50,"xp_external_activity":30,"weekly_consistency_xp":100,"gamification_enabled":true},"prescription":{"default_cadence":"2020","beginner_max_weekly_sets":21,"first_week_volume_multiplier":0.8,"endurance_strength_multiplier":0.8,"preferred_split":"auto","methodology_notes":"","periodization_notes":"","weekly_rules":[],"allowed_methods":["biset","triset","superset","giantset","circuito","dropset","restpause","cluster","isometria","pico_contracao","pico_alongamento"],"progression_mode":"wave","answer_mappings":[]}}'::jsonb;
$$;

create or replace function public.validate_company_product_settings(_settings jsonb)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_defaults jsonb := public.company_product_settings_defaults();
  v_result jsonb := v_defaults;
  v_section text;
  v_key text;
  v_value jsonb;
  v_text text;
  v_clean text;
  v_match text[];
  v_message_variables jsonb := '{
    "weekly_contact":["primeiro_nome","nome","empresa"],
    "pre_registration_confirmation":["primeiro_nome","nome","empresa"],
    "fiscal_invite":["primeiro_nome","nome","empresa","link"],
    "payment_link":["primeiro_nome","nome","empresa","link"],
    "assessment_onboarding":["primeiro_nome","nome","empresa","prazo","data"],
    "anamnesis_invite":["primeiro_nome","nome","empresa","link"],
    "renewal_due":["primeiro_nome","nome","empresa","link"],
    "renewal_overdue":["primeiro_nome","nome","empresa","link"],
    "intercycle_invite":["primeiro_nome","nome","empresa","link"],
    "first_contact":["primeiro_nome","nome","empresa","profissional"],
    "daily_reminder_title":["primeiro_nome","nome","empresa","link","data"],
    "daily_reminder_body":["primeiro_nome","nome","empresa","link","data"],
    "new_workout_push_title":["primeiro_nome","nome","empresa"],
    "new_workout_push_body":["primeiro_nome","nome","empresa"]
  }'::jsonb;
  v_number numeric;
  v_range jsonb;
  v_ranges jsonb := '{"max_weekly_contacts":[1,2],"minimum_interval_hours":[72,168],"no_workout_days":[7,90],"no_workout_repeat_days":[6,90],"cart_abandonment_hours":[2,720],"payment_repeat_hours":[24,720],"start_hour":[0,23],"end_hour":[1,24],"assessment_sla_business_days":[1,30],"installments_short":[1,12],"installments_medium":[1,12],"installments_long":[1,12],"daily_reminder_hour":[0,23],"cadence_warning_hours":[1,720],"cadence_critical_hours":[1,720],"risk_no_workout_days":[1,90],"renewal_notice_days":[1,90],"xp_workout":[0,10000],"xp_external_activity":[0,10000],"weekly_consistency_xp":[0,10000],"beginner_max_weekly_sets":[1,21],"first_week_volume_multiplier":[0.5,1],"endurance_strength_multiplier":[0.5,1]}'::jsonb;
begin
  if _settings is null or jsonb_typeof(_settings) <> 'object' then
    raise exception 'Invalid settings object' using errcode = '22023';
  end if;
  for v_section in select jsonb_object_keys(_settings) loop
    if not (v_defaults ? v_section) or jsonb_typeof(_settings -> v_section) <> 'object' then
      raise exception 'Invalid settings section: %', v_section using errcode = '22023';
    end if;
    for v_key, v_value in select * from jsonb_each(_settings -> v_section) loop
      if not ((v_defaults -> v_section) ? v_key)
        or jsonb_typeof(v_value) <> jsonb_typeof(v_defaults #> array[v_section,v_key]) then
        raise exception 'Invalid settings field: %.%', v_section, v_key using errcode = '22023';
      end if;
      if v_section = 'prescription' and v_key in ('weekly_rules','allowed_methods','progression_mode','answer_mappings') then
        perform public.validate_prescription_methodology_field(v_key, v_value);
      elsif v_key = 'weekdays' then
        if jsonb_array_length(v_value) < 1 or jsonb_array_length(v_value) > 7 then
          raise exception 'Invalid weekdays' using errcode = '22023';
        end if;
        if exists (select 1 from jsonb_array_elements(v_value) d where jsonb_typeof(d) <> 'number') then
          raise exception 'Invalid weekdays type' using errcode = '22023';
        end if;
        if exists (select 1 from jsonb_array_elements_text(v_value) d where d::numeric <> trunc(d::numeric) or d::numeric < 1 or d::numeric > 7)
          or (select count(distinct d) from jsonb_array_elements(v_value) d) <> jsonb_array_length(v_value) then
          raise exception 'Invalid weekdays values' using errcode = '22023';
        end if;
      elsif jsonb_typeof(v_value) = 'number' then
        v_number := v_value::text::numeric;
        v_range := v_ranges -> v_key;
        if v_range is null or v_number < (v_range ->> 0)::numeric or v_number > (v_range ->> 1)::numeric
          or (v_key not in ('first_week_volume_multiplier','endurance_strength_multiplier') and v_number <> trunc(v_number)) then
          raise exception 'Invalid numeric setting: %.%', v_section, v_key using errcode = '22023';
        end if;
      elsif jsonb_typeof(v_value) = 'string' then
        v_text := v_value #>> '{}';
        if char_length(v_text) > 6000 or v_text ~* '(\mBearer\s+\S+|\m(sk|sb_secret|service_role)[_-][A-Za-z0-9_-]{8,}|\meyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(api[_ -]?key|secret|password|senha|token)\s*[:=]\s*\S+)' then
          raise exception 'Invalid text or credential-like value: %.%', v_section, v_key using errcode = '22023';
        end if;
        if v_section = 'messages' then
          if v_text !~ '[^[:space:]]' then
            raise exception 'messages.%.required', v_key using errcode = '22023';
          end if;
          for v_match in select regexp_matches(v_text, '\{\{\s*([a-z_]+)\s*\}\}', 'g') loop
            if not coalesce((v_message_variables -> v_key) ? v_match[1], false) then
              raise exception 'messages.%.variable.%', v_key, v_match[1] using errcode = '22023';
            end if;
          end loop;
          v_clean := regexp_replace(v_text, '\{\{\s*([a-z_]+)\s*\}\}', '', 'g');
          if v_clean ~ '[{}]' then
            raise exception 'Malformed message variable' using errcode = '22023';
          end if;
        elsif position('{{' in v_text) > 0 or position('}}' in v_text) > 0 then
          raise exception 'Variables only allowed in messages' using errcode = '22023';
        end if;
        if v_key = 'timezone' and not exists (select 1 from pg_timezone_names where name = v_text) then
          raise exception 'Invalid timezone' using errcode = '22023';
        end if;
        if v_key = 'default_cadence' and v_text !~ '^[0-9]{4}$' then
          raise exception 'Invalid cadence' using errcode = '22023';
        end if;
        if v_key = 'preferred_split' and v_text not in ('auto','full_body','upper_lower','push_pull_legs') then
          raise exception 'Invalid split' using errcode = '22023';
        end if;
        if v_key = 'support_email' and v_text <> '' and v_text !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
          raise exception 'Invalid email' using errcode = '22023';
        end if;
        if v_key = 'support_whatsapp' and v_text <> '' and v_text !~ '^\+?[0-9 ()-]{7,30}$' then
          raise exception 'Invalid support number' using errcode = '22023';
        end if;
        if v_key in ('terms_url','privacy_url') and v_text <> '' and v_text !~ '^https://[^\s/?#]+([/?#][^\s]*)?$' then
          raise exception 'Invalid HTTPS URL' using errcode = '22023';
        end if;
      end if;
    end loop;
    v_result := jsonb_set(v_result, array[v_section], (v_defaults -> v_section) || (_settings -> v_section));
  end loop;
  if (v_result #>> '{contact_policy,start_hour}')::int >= (v_result #>> '{contact_policy,end_hour}')::int then
    raise exception 'Contact end hour must follow start hour' using errcode = '22023';
  end if;
  if (v_result #>> '{experience,cadence_warning_hours}')::int >= (v_result #>> '{experience,cadence_critical_hours}')::int then
    raise exception 'Critical threshold must exceed warning' using errcode = '22023';
  end if;
  return v_result;
end;
$$;
