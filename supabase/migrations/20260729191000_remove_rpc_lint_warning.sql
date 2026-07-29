-- Remove an unused declaration from the already-deployed template RPC without
-- duplicating its long, otherwise unchanged function body in another migration.
do $cleanup$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.apply_template_to_student(uuid,uuid,text)'::regprocedure
  ) into v_definition;

  v_definition := replace(
    v_definition,
    E'  v_student_user_id uuid;\n',
    ''
  );
  v_definition := replace(
    v_definition,
    'select s.company_id, s.user_id into v_company_id, v_student_user_id',
    'select s.company_id into v_company_id'
  );

  if position('v_student_user_id' in v_definition) > 0 then
    raise exception 'Could not safely remove the unused template RPC variable';
  end if;

  execute v_definition;
end;
$cleanup$;
