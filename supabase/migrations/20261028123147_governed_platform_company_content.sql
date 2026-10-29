-- A30/A31/A32. Forward only; no historical XP/award rewrite and no provider calls.
begin;
create schema if not exists content_private;
revoke all on schema content_private from public,anon,authenticated;

create function content_private.keys_exact(d jsonb, keys text[]) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(d)='object' and d ?& keys and
   not exists(select 1 from jsonb_object_keys(d) k where not k=any(keys)),false);
$$;
create function content_private.text_valid(d jsonb,k text,lo integer,hi integer) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(d->k)='string' and length(btrim(d->>k)) between lo and hi,false);
$$;
create function content_private.integer_valid(d jsonb,k text,lo integer,hi integer) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(d->k) is distinct from 'number' then return false; end if;
 return (d->>k)::numeric=trunc((d->>k)::numeric) and (d->>k)::numeric between lo and hi;
end $$;

create table public.platform_content_state (
 singleton boolean primary key default true check(singleton), version integer not null default 0 check(version>=0),
 document jsonb not null, published_document jsonb, published_version integer not null default 0,
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create table public.platform_content_history (
 version integer primary key, document jsonb not null, was_published boolean not null,
 changed_by uuid not null references auth.users(id), changed_at timestamptz not null default now()
);
create table public.company_content_studios (
 company_id uuid primary key references public.companies(id), version integer not null check(version>0),
 document jsonb not null, updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now()
);
create table public.company_content_history (
 company_id uuid not null references public.companies(id), version integer not null, document jsonb not null,
 changed_by uuid not null references auth.users(id), changed_at timestamptz not null default now(), primary key(company_id,version)
);
create table public.company_content_experience_adoptions (
 company_id uuid not null references public.companies(id), platform_version integer not null references public.platform_content_history(version),
 settings_version integer not null, adopted_by uuid not null references auth.users(id), adopted_at timestamptz not null default now(),
 primary key(company_id,platform_version)
);
create table public.company_content_achievement_baselines (
 company_id uuid not null references public.companies(id), platform_version integer not null, student_id uuid not null references public.students(id),
 workouts integer not null, external_activities integer not null, cycles integer not null,
 primary key(company_id,platform_version,student_id), foreign key(company_id,platform_version) references public.company_content_experience_adoptions(company_id,platform_version)
);
alter table public.achievements add column platform_content_version integer;
alter table public.platform_content_state enable row level security;
alter table public.platform_content_history enable row level security;
alter table public.company_content_studios enable row level security;
alter table public.company_content_history enable row level security;
alter table public.company_content_experience_adoptions enable row level security;
alter table public.company_content_achievement_baselines enable row level security;
revoke all on public.platform_content_state,public.platform_content_history,public.company_content_studios,public.company_content_history,
 public.company_content_experience_adoptions,public.company_content_achievement_baselines from public,anon,authenticated;
-- No direct table grants. RPCs are the only interface; draft/history data never goes to anon.

create function content_private.company_admin(_company_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and
   (public.has_role(auth.uid(),'admin'::public.app_role) or public.has_role(auth.uid(),'master'::public.app_role))
   and exists(select 1 from public.company_members cm join public.companies c on c.id=cm.company_id
      where cm.user_id=auth.uid() and cm.company_id=_company_id and c.is_active is true)
   and public.company_feature_allowed(_company_id,'hasAppearance');
$$;

create function content_private.validate_platform(d jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare c jsonb:=d->'cms'; e jsonb:=d->'experience'; a jsonb; k text; hi integer;
begin
 if not content_private.keys_exact(d,array['cms','experience','achievements']) or
   not content_private.keys_exact(c,array['hero_title','hero_body','trainer_cta','student_cta','footer_manifesto','footer_description','footer_edition','support_url','support_label','layout','show_differentials']) or
   not content_private.keys_exact(e,array['xp_workout','xp_external_activity','weekly_consistency_xp','gamification_enabled']) then
   raise exception 'Invalid platform content fields' using errcode='22023'; end if;
 for k,hi in select * from (values ('hero_title',180),('hero_body',1200),('trainer_cta',60),('student_cta',60),('footer_manifesto',500),('footer_description',500),('footer_edition',100),('support_label',60)) v(k,hi) loop
   if not content_private.text_valid(c,k,1,hi) then raise exception 'Invalid CMS text' using errcode='22023'; end if;
 end loop;
 if not content_private.text_valid(c,'support_url',0,500) or
   (c->>'support_url'<>'' and c->>'support_url' !~ '^https://[^[:space:]/?#]+([/?#][^[:space:]]*)?$') or
   jsonb_typeof(c->'layout') is distinct from 'string' or c->>'layout' not in ('editorial','compact') or
   jsonb_typeof(c->'show_differentials') is distinct from 'boolean' or jsonb_typeof(e->'gamification_enabled') is distinct from 'boolean' then
   raise exception 'Invalid CMS layout/link' using errcode='22023'; end if;
 foreach k in array array['xp_workout','xp_external_activity','weekly_consistency_xp'] loop
   if not content_private.integer_valid(e,k,0,10000) then raise exception 'Invalid XP defaults' using errcode='22023'; end if;
 end loop;
 if jsonb_typeof(d->'achievements') is distinct from 'array' then raise exception 'Invalid achievement catalog' using errcode='22023'; end if;
 if jsonb_array_length(d->'achievements')>20 then raise exception 'Achievement limit' using errcode='22023'; end if;
 for a in select value from jsonb_array_elements(d->'achievements') loop
   if not content_private.keys_exact(a,array['code','title','description','criteria_type','criteria_value','xp_reward','is_active']) or
     not content_private.text_valid(a,'code',2,31) or a->>'code' !~ '^[a-z][a-z0-9_]{1,30}$' or
     not content_private.text_valid(a,'title',1,120) or not content_private.text_valid(a,'description',0,1000) or
     jsonb_typeof(a->'criteria_type') is distinct from 'string' or a->>'criteria_type' not in ('workouts_total','external_total','cycles_completed') or
     not content_private.integer_valid(a,'criteria_value',1,10000) or not content_private.integer_valid(a,'xp_reward',0,10000) or jsonb_typeof(a->'is_active') is distinct from 'boolean' then
     raise exception 'Invalid achievement default' using errcode='22023'; end if;
 end loop;
 if (select count(*)<>count(distinct value->>'code') from jsonb_array_elements(d->'achievements')) then raise exception 'Duplicate achievement code' using errcode='22023'; end if;
end $$;

create function content_private.validate_studio(d jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare b jsonb:=d->'brand'; p jsonb; s jsonb; k text; hi integer; h jsonb;
begin
 if not content_private.keys_exact(d,array['brand','posts']) or not content_private.keys_exact(b,array['name','handle','navy','ink','paper','sand','audience','voice','pillars']) then raise exception 'Invalid studio fields' using errcode='22023'; end if;
 for k,hi in select * from (values ('name',80),('handle',80),('audience',500),('voice',500),('pillars',1000)) v(k,hi) loop
   if not content_private.text_valid(b,k,case when k='name' then 1 else 0 end,hi) then raise exception 'Invalid brand text' using errcode='22023'; end if;
 end loop;
 foreach k in array array['navy','ink','paper','sand'] loop
   if not content_private.text_valid(b,k,7,7) or b->>k !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Invalid brand color' using errcode='22023'; end if;
 end loop;
 if jsonb_typeof(d->'posts') is distinct from 'array' then raise exception 'Invalid posts' using errcode='22023'; end if;
 if jsonb_array_length(d->'posts')>100 then raise exception 'Post limit' using errcode='22023'; end if;
 for p in select value from jsonb_array_elements(d->'posts') loop
   if not content_private.keys_exact(p,array['id','title','scheduled_for','status','format','aesthetic','slides','caption','hashtags']) or
     not content_private.text_valid(p,'id',36,36) or p->>'id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or
     not content_private.text_valid(p,'title',1,120) or not content_private.text_valid(p,'caption',0,5000) or
     not content_private.text_valid(p,'scheduled_for',0,10) or (p->>'scheduled_for'<>'' and p->>'scheduled_for' !~ '^\d{4}-\d{2}-\d{2}$') or
     jsonb_typeof(p->'status') is distinct from 'string' or p->>'status' not in ('draft','approved','archived') or
     jsonb_typeof(p->'format') is distinct from 'string' or p->>'format' not in ('carrossel','story') or
     jsonb_typeof(p->'aesthetic') is distinct from 'string' or p->>'aesthetic' not in ('l1_educativo','l2_feedback','l3_aviso','l4_evento_teaser') or
     jsonb_typeof(p->'slides') is distinct from 'array' or jsonb_typeof(p->'hashtags') is distinct from 'array' then raise exception 'Invalid editorial post' using errcode='22023'; end if;
   if jsonb_array_length(p->'slides') not between 1 and 20 or jsonb_array_length(p->'hashtags')>30 then raise exception 'Slide/hashtag limit' using errcode='22023'; end if;
   for s in select value from jsonb_array_elements(p->'slides') loop
     if not content_private.keys_exact(s,array['role','title','subtitle','body']) or jsonb_typeof(s->'role') is distinct from 'string' or s->>'role' not in ('capa','conteudo','cta') or
       not content_private.text_valid(s,'title',1,180) or not content_private.text_valid(s,'subtitle',0,300) or not content_private.text_valid(s,'body',0,1400) then raise exception 'Invalid slide' using errcode='22023'; end if;
   end loop;
   for h in select value from jsonb_array_elements(p->'hashtags') loop
     if jsonb_typeof(h)<>'string' or length(h#>>'{}')>60 then raise exception 'Invalid hashtag' using errcode='22023'; end if;
   end loop;
   if p->>'status'='approved' and (length(btrim(p->>'caption'))=0 or p->'slides'->0->>'role'<>'capa' or p->'slides'->(jsonb_array_length(p->'slides')-1)->>'role'<>'cta') then raise exception 'Approval requires cover, CTA and caption' using errcode='22023'; end if;
 end loop;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(d->'posts')) then raise exception 'Duplicate post' using errcode='22023'; end if;
end $$;

insert into public.platform_content_state(singleton,document) values(true,'{
 "cms":{"hero_title":"Treino é ciência. O resto é planilha.","hero_body":"O Set existe para devolver ao treinador o que sempre foi dele: o controle exato do estresse mecânico aplicado em cada grupamento muscular. Onde a maioria oferece app de treino, entregamos sistema de prescrição.","trainer_cta":"Sou Treinador","student_cta":"Sou Aluno","footer_manifesto":"Volume é verdade.\nCarga é compromisso.\nProgressão é prova.","footer_description":"A plataforma onde o treino vira dado. Construído para o treinador sério.","footer_edition":"Edição Primeira / v1.0","support_url":"","support_label":"Suporte","layout":"editorial","show_differentials":true},
 "experience":{"xp_workout":50,"xp_external_activity":30,"weekly_consistency_xp":100,"gamification_enabled":true},
 "achievements":[{"code":"primeiro_treino","title":"Primeiro treino","description":"Conclua um treino após a adoção destes padrões.","criteria_type":"workouts_total","criteria_value":1,"xp_reward":50,"is_active":true}]
}');

create function public.get_platform_content_editor() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_role(auth.uid(),'master'::public.app_role) then raise exception 'Master required' using errcode='42501'; end if;
 return (select jsonb_build_object('document',document,'version',version,'published_version',published_version) from public.platform_content_state where singleton);
end $$;
create function public.save_platform_content(_document jsonb,_expected_version integer,_publish boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v integer;
begin
 if auth.uid() is null or not public.has_role(auth.uid(),'master'::public.app_role) then raise exception 'Master required' using errcode='42501'; end if;
 if _expected_version is null or _expected_version<0 or _publish is null then raise exception 'Version and publication choice required' using errcode='22023'; end if;
 perform content_private.validate_platform(_document);
 select version into v from public.platform_content_state where singleton for update;
 if v is distinct from _expected_version then raise exception 'Content version conflict' using errcode='PT409'; end if;
 insert into public.platform_content_history(version,document,was_published,changed_by) values(v+1,_document,_publish,auth.uid());
 update public.platform_content_state set version=v+1,document=_document,updated_by=auth.uid(),updated_at=clock_timestamp(),
   published_document=case when _publish then _document else published_document end,
   published_version=case when _publish then v+1 else published_version end where singleton;
 return public.get_platform_content_editor();
end $$;
create function public.get_public_platform_content() returns jsonb
language sql stable security definer set search_path='' as $$
 select published_document->'cms' from public.platform_content_state where singleton;
$$;

create function public.get_company_content(_company_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not content_private.company_admin(_company_id) then raise exception 'Company administrator and appearance module required' using errcode='42501'; end if;
 return coalesce((select jsonb_build_object('company_id',company_id,'document',document,'version',version) from public.company_content_studios where company_id=_company_id),
   jsonb_build_object('company_id',_company_id,'version',0,'document',jsonb_build_object('brand',jsonb_build_object('name','Minha empresa','handle','','navy','#0D1B3E','ink','#111214','paper','#F4F2ED','sand','#C8A876','audience','','voice','','pillars',''),'posts','[]'::jsonb)));
end $$;
create function public.save_company_content(_company_id uuid,_document jsonb,_expected_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v integer;
begin
 if not content_private.company_admin(_company_id) then raise exception 'Company administrator and appearance module required' using errcode='42501'; end if;
 if _expected_version is null or _expected_version<0 then raise exception 'Version required' using errcode='22023'; end if;
 perform content_private.validate_studio(_document);
 perform pg_advisory_xact_lock(hashtextextended('company_content:'||_company_id::text,0));
 select version into v from public.company_content_studios where company_id=_company_id for update;
 v:=coalesce(v,0);
 if v<>_expected_version then raise exception 'Studio version conflict' using errcode='PT409'; end if;
 insert into public.company_content_studios(company_id,version,document,updated_by) values(_company_id,v+1,_document,auth.uid())
   on conflict(company_id) do update set version=excluded.version,document=excluded.document,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 insert into public.company_content_history(company_id,version,document,changed_by) values(_company_id,v+1,_document,auth.uid());
 return public.get_company_content(_company_id);
end $$;

create function public.get_platform_experience_defaults(_company_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not content_private.company_admin(_company_id) then raise exception 'Company administrator and appearance module required' using errcode='42501'; end if;
 return (select jsonb_build_object('version',published_version,'document',published_document) from public.platform_content_state where singleton and published_version>0);
end $$;
create function public.adopt_platform_experience_defaults(_company_id uuid,_platform_version integer,_expected_settings_version integer,_confirm boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d jsonb; settings jsonb; saved jsonb; saved_settings jsonb; a jsonb; aid uuid; old_a record;
begin
 if not content_private.company_admin(_company_id) then raise exception 'Company administrator and appearance module required' using errcode='42501'; end if;
 if _confirm is distinct from true then raise exception 'Explicit prospective adoption required' using errcode='22023'; end if;
 -- Lock published version against a concurrent Master publication for this adoption.
 select published_document into d from public.platform_content_state where singleton and published_version=_platform_version for share;
 if d is null then raise exception 'Published defaults changed' using errcode='PT409'; end if;
 -- Same lock as the existing settings RPC: read the current complete settings only after serialization.
 perform pg_advisory_xact_lock(hashtextextended('company_product_settings:'||_company_id::text,0));
 if exists(select 1 from public.company_content_experience_adoptions where company_id=_company_id and platform_version=_platform_version) then raise exception 'Version already adopted' using errcode='PT409'; end if;
 select s.settings into settings from public.company_product_settings s where company_id=_company_id for update;
 settings:=coalesce(settings,public.company_product_settings_defaults());
 settings:=jsonb_set(settings,'{experience}',coalesce(settings->'experience','{}'::jsonb)||(d->'experience'));
 saved_settings:=public.save_company_product_settings(_company_id,settings,_expected_settings_version);
 insert into public.company_content_experience_adoptions(company_id,platform_version,settings_version,adopted_by)
 values(_company_id,_platform_version,(saved_settings->>'version')::integer,auth.uid());
 -- Snapshot counts only. No XP or earned award is updated or recalculated.
 insert into public.company_content_achievement_baselines(company_id,platform_version,student_id,workouts,external_activities,cycles)
 select _company_id,_platform_version,s.id,
   (select count(*) from public.workout_sessions w where w.company_id=_company_id and w.student_id=s.id and w.status='completed'),
   (select count(*) from public.external_activities x where x.company_id=_company_id and x.student_id=s.id),
   (select count(*) from public.training_cycles tc join public.enrollments e on e.id=tc.enrollment_id and e.company_id=tc.company_id where e.student_id=s.id and tc.company_id=_company_id and tc.status='completed')
 from public.students s where s.company_id=_company_id;
 for old_a in select * from public.achievements where company_id=_company_id and platform_content_version is not null and is_active for update loop
   perform public.save_company_achievement(_company_id,jsonb_build_object('code',old_a.code,'title',old_a.title,'description',coalesce(old_a.description,''),'criteria_type',old_a.criteria_type,'criteria_value',old_a.criteria_value,'xp_reward',old_a.xp_reward,'is_active',false),old_a.id,old_a.updated_at);
 end loop;
 for a in select value from jsonb_array_elements(d->'achievements') loop
   a:=jsonb_set(a,'{code}',to_jsonb('pv'||_platform_version::text||'_'||(a->>'code')));
   saved:=public.save_company_achievement(_company_id,a,null,null);
   aid:=(saved->>'id')::uuid;
   update public.achievements set platform_content_version=_platform_version where id=aid and company_id=_company_id;
 end loop;
 return jsonb_build_object('platform_version',_platform_version,'settings',saved_settings,'adopted',true);
end $$;

-- Preserve the existing source checks; subtract only an explicitly adopted baseline.
create or replace function public.check_and_unlock_achievements(_student_id uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_company uuid; v_user uuid; v_workouts int; v_external int; v_cycles int; b public.company_content_achievement_baselines;
 v_id uuid; v_count int:=0; a record;
 v_internal boolean:=coalesce(auth.jwt()->>'role','')='service_role' or (session_user in ('postgres','supabase_admin') and current_setting('role',true) in ('none','postgres','supabase_admin'));
begin
 select company_id,user_id into v_company,v_user from public.students where id=_student_id;
 if v_company is null or (not v_internal and (auth.uid() is null or (auth.uid() is distinct from v_user and not public.is_company_staff(auth.uid(),v_company)))) then raise exception 'Student access denied' using errcode='42501'; end if;
 if not (public.company_experience_settings(v_company)->>'gamification_enabled')::boolean then return 0; end if;
 select count(*) into v_workouts from public.workout_sessions where student_id=_student_id and company_id=v_company and status='completed';
 select count(*) into v_external from public.external_activities where student_id=_student_id and company_id=v_company;
 select count(*) into v_cycles from public.training_cycles tc join public.enrollments e on e.id=tc.enrollment_id and e.company_id=tc.company_id where e.student_id=_student_id and tc.company_id=v_company and tc.status='completed';
 for a in select * from public.achievements where is_active and (company_id is null or company_id=v_company) and criteria_type in ('workouts_total','external_total','cycles_completed') loop
   select * into b from public.company_content_achievement_baselines where company_id=v_company and student_id=_student_id and platform_version=a.platform_content_version;
   if (a.criteria_type='workouts_total' and v_workouts-coalesce(b.workouts,0)>=a.criteria_value)
    or (a.criteria_type='external_total' and v_external-coalesce(b.external_activities,0)>=a.criteria_value)
    or (a.criteria_type='cycles_completed' and v_cycles-coalesce(b.cycles,0)>=a.criteria_value) then
     v_id:=null;
     insert into public.student_achievements(student_id,company_id,achievement_id) values(_student_id,v_company,a.id) on conflict do nothing returning id into v_id;
     if v_id is not null then perform public.award_xp(_student_id,'achievement',0,a.id,a.title); v_count:=v_count+1; end if;
   end if;
 end loop;
 return v_count;
end $$;

revoke all on all functions in schema content_private from public,anon,authenticated;
revoke all on function public.get_platform_content_editor(),public.save_platform_content(jsonb,integer,boolean),public.get_public_platform_content(),
 public.get_company_content(uuid),public.save_company_content(uuid,jsonb,integer),public.get_platform_experience_defaults(uuid),
 public.adopt_platform_experience_defaults(uuid,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.get_public_platform_content() to anon,authenticated;
grant execute on function public.get_platform_content_editor(),public.save_platform_content(jsonb,integer,boolean),
 public.get_company_content(uuid),public.save_company_content(uuid,jsonb,integer),public.get_platform_experience_defaults(uuid),
 public.adopt_platform_experience_defaults(uuid,integer,integer,boolean) to authenticated;
commit;
