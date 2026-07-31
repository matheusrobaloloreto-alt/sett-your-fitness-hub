alter table public.student_anamneses
  add column if not exists current_volume_unit text not null default 'km_week';

alter table public.student_anamneses
  drop constraint if exists student_anamneses_current_volume_unit_check;

alter table public.student_anamneses
  add constraint student_anamneses_current_volume_unit_check
  check (current_volume_unit in ('km_week', 'hours_week'));

comment on column public.student_anamneses.current_volume_unit is
  'Unidade de current_volume_weekly: km_week ou hours_week.';
