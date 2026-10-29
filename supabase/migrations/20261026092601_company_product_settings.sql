-- Company-scoped configuration. No existing data or clinical history is rewritten.
create function public.company_product_settings_defaults()
returns jsonb language sql immutable set search_path = public, pg_temp as $$
select '{
 "messages": {
  "weekly_contact":"Oi, {{primeiro_nome}}! Como estao os treinos? Conte com a equipe para continuar evoluindo.",
  "pre_registration_confirmation":"Oi, {{primeiro_nome}}! Recebemos seu pre-cadastro na {{empresa}}. Nossa equipe entrara em contato.",
  "fiscal_invite":"Oi, {{primeiro_nome}}! Complete seus dados fiscais e escolha seu plano: {{link}}",
  "payment_link":"Oi, {{primeiro_nome}}! Seu cadastro foi concluido. Escolha seu plano e faca o pagamento com seguranca: {{link}}",
  "assessment_onboarding":"Oi, {{primeiro_nome}}! Pagamento confirmado. A equipe vai enviar as instrucoes da avaliacao de movimento. Prazo: {{prazo}} dias uteis, com previsao ate {{data}}.",
  "anamnesis_invite":"Oi, {{primeiro_nome}}! Preencha sua anamnese para prepararmos seu treino: {{link}}",
  "renewal_due":"Oi, {{primeiro_nome}}! Seu plano esta proximo da renovacao. Vamos continuar? {{link}}",
  "renewal_overdue":"Oi, {{primeiro_nome}}! Sua renovacao esta pendente. Fale com a equipe: {{link}}",
  "intercycle_invite":"Oi, {{primeiro_nome}}! Responda ao questionario para o proximo ciclo: {{link}}",
  "first_contact":"Oi, {{primeiro_nome}}! Aqui e {{profissional}}, da {{empresa}}. Como posso ajudar?",
  "daily_reminder_title":"Seu treino de hoje te espera",
  "daily_reminder_body":"Bora manter a sequencia? Abra o app e registre seu treino.",
  "new_workout_push_title":"Novo treino disponivel",
  "new_workout_push_body":"{{primeiro_nome}}, seu novo treino ja esta disponivel no app."
 },
 "contact_policy":{"max_weekly_contacts":2,"minimum_interval_hours":72,"no_workout_days":7,"no_workout_repeat_days":6,"cart_abandonment_hours":2,"payment_repeat_hours":24,"weekdays":[1,2,3,4,5,6,7],"start_hour":8,"end_hour":20,"timezone":"America/Sao_Paulo"},
 "brand":{"company_name":"","professional_name":"","professional_registration":"","support_email":"","support_whatsapp":"","terms_url":"","privacy_url":""},
 "business":{"assessment_sla_business_days":5,"installments_short":1,"installments_medium":6,"installments_long":12},
 "notifications":{"daily_reminder_enabled":true,"daily_reminder_hour":8,"new_workout_enabled":true},
 "experience":{"cadence_warning_hours":24,"cadence_critical_hours":72,"risk_no_workout_days":10,"renewal_notice_days":7,"xp_workout":50,"xp_external_activity":30,"weekly_consistency_xp":100,"gamification_enabled":true},
 "prescription":{"default_cadence":"2020","beginner_max_weekly_sets":21,"first_week_volume_multiplier":0.8,"endurance_strength_multiplier":0.8,"preferred_split":"auto","methodology_notes":"","periodization_notes":""}
}'::jsonb;
$$;

create function public.validate_company_product_settings(_settings jsonb)
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
      if v_key = 'weekdays' then
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

create table public.company_product_settings (
  company_id uuid primary key references public.companies(id),
  settings jsonb not null,
  version integer not null check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid not null
);
create table public.company_product_settings_history (
  company_id uuid not null references public.companies(id),
  version integer not null check (version > 0),
  settings jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid not null,
  primary key (company_id, version)
);
alter table public.company_product_settings enable row level security;
alter table public.company_product_settings_history enable row level security;
revoke all on table public.company_product_settings, public.company_product_settings_history from public, anon, authenticated, service_role;
grant select on table public.company_product_settings to authenticated, service_role;
grant select on table public.company_product_settings_history to authenticated;

create policy company_product_settings_read on public.company_product_settings
for select to authenticated using (
  public.has_role(auth.uid(), 'master'::public.app_role)
  or exists (select 1 from public.company_members cm where cm.user_id = auth.uid() and cm.company_id = company_product_settings.company_id)
);
create policy company_product_settings_history_read on public.company_product_settings_history
for select to authenticated using (
  public.has_role(auth.uid(), 'master'::public.app_role)
  or (public.has_role(auth.uid(), 'admin'::public.app_role) and exists (
    select 1 from public.company_members cm where cm.user_id = auth.uid() and cm.company_id = company_product_settings_history.company_id
  ))
);

-- The only write API: SECURITY DEFINER is needed because direct table writes are revoked.
-- Authorize from database roles/membership, never caller-controlled user_metadata.
create function public.save_company_product_settings(_company_id uuid, _settings jsonb, _expected_version integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_current integer;
  v_normalized jsonb;
begin
  if v_actor is null or _company_id is null or not (
    public.has_role(v_actor, 'master'::public.app_role)
    or (public.has_role(v_actor, 'admin'::public.app_role) and exists (
      select 1 from public.company_members cm where cm.user_id = v_actor and cm.company_id = _company_id
    ))
  ) then
    raise exception 'Not authorized for company product settings' using errcode = '42501';
  end if;
  if _expected_version is null or _expected_version < 0 then
    raise exception 'Expected version required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.companies where id = _company_id) then
    raise exception 'Company not found' using errcode = '42501';
  end if;
  v_normalized := public.validate_company_product_settings(_settings);
  -- Serialize initial insert as well as updates; a row lock alone cannot lock an absent row.
  perform pg_advisory_xact_lock(hashtextextended('company_product_settings:' || _company_id::text, 0));
  select version into v_current from public.company_product_settings where company_id = _company_id for update;
  v_current := coalesce(v_current, 0);
  if v_current <> _expected_version then
    raise exception 'Settings version conflict; reload before saving' using errcode = 'PT409';
  end if;
  insert into public.company_product_settings(company_id, settings, version, updated_by)
  values (_company_id, v_normalized, v_current + 1, v_actor)
  on conflict (company_id) do update set settings = excluded.settings, version = excluded.version,
    updated_by = excluded.updated_by, updated_at = now();
  insert into public.company_product_settings_history(company_id, version, settings, changed_by)
  values (_company_id, v_current + 1, v_normalized, v_actor);
  return jsonb_build_object('settings', v_normalized, 'version', v_current + 1);
end;
$$;
revoke all on function public.company_product_settings_defaults() from public, anon, authenticated;
revoke all on function public.validate_company_product_settings(jsonb) from public, anon, authenticated;
revoke all on function public.save_company_product_settings(uuid, jsonb, integer) from public, anon, authenticated, service_role;
grant execute on function public.save_company_product_settings(uuid, jsonb, integer) to authenticated;
