DO $$
DECLARE
  wa_id uuid := gen_random_uuid();
  wb_id uuid := gen_random_uuid();
  wc_id uuid := gen_random_uuid();
  wd_id uuid := gen_random_uuid();
  we_id uuid := gen_random_uuid();
  sid uuid := '3cb1cfae-4eec-4b2c-957b-b26eaa906dbe';
  cid uuid := '6fe83096-69d8-4460-b516-1bd2209ef303';
  comp uuid := 'c051e80e-c10c-4522-a88a-e5da26a74d82';
BEGIN
  -- Treino A
  INSERT INTO public.workouts (id, cycle_id, company_id, name, title, sort_order, exercises) VALUES
  (wa_id, cid, comp, 'A', 'Peito + Tríceps', 0,
  '[{"exercise_id":"5c3558f8-01c1-43a4-bf9b-0d6993c80b80","exercise_name":"Supino Inclinado Halteres","muscle_group":"Peito","video_url":null,"video_path":null,"sets":"4","reps":"8-12","rest":"90s","notes":""},{"exercise_id":"af9f3a0e-3260-4842-a0ac-da874cdda030","exercise_name":"Supino Reto Barra","muscle_group":"Peito","video_url":null,"video_path":null,"sets":"4","reps":"8-12","rest":"90s","notes":""},{"exercise_id":"b551a0d4-326f-4b4c-b909-8af4929130b2","exercise_name":"Cross Over Polia Alta","muscle_group":"Peito","video_url":null,"video_path":null,"sets":"3","reps":"12-15","rest":"60s","notes":""},{"exercise_id":"c2df4c00-a3c7-4ed2-9310-a58b1971fa6f","exercise_name":"Crucifixo Inclinado Halteres","muscle_group":"Peito","video_url":null,"video_path":null,"sets":"3","reps":"12-15","rest":"60s","notes":""},{"exercise_id":"3cc40978-bc88-4d1c-88b4-670d761db741","exercise_name":"Tríceps Polia Corda","muscle_group":"Tríceps","video_url":null,"video_path":null,"sets":"3","reps":"12-15","rest":"60s","notes":""},{"exercise_id":"d06f7cc9-380d-4fb1-9b60-5bd92a25dc22","exercise_name":"Tríceps Polia Barra","muscle_group":"Tríceps","video_url":null,"video_path":null,"sets":"3","reps":"12-15","rest":"60s","notes":""}]'::jsonb);

  -- Treino B
  INSERT INTO public.workouts (id, cycle_id, company_id, name, title, sort_order, exercises) VALUES
  (wb_id, cid, comp, 'B', 'Costas + Bíceps', 1,
  '[{"exercise_id":"f0d967d8-ff18-4881-8c28-aca104bf5ac6","exercise_name":"Puxada Pronada Polia","muscle_group":"Costas","video_url":null,"video_path":null,"sets":"4","reps":"8-12","rest":"90s","notes":""},{"exercise_id":"264a644f-ca52-4837-9112-472a4be128e8","exercise_name":"Remada Curvada Pronada Barra","muscle_group":"Costas","video_url":null,"video_path":null,"sets":"4","reps":"8-12","rest":"90s","notes":""},{"exercise_id":"0db0d50d-5d72-4ade-97f2-3ec1c64218d8","exercise_name":"Remada Baixa Neutra","muscle_group":"Costas","video_url":null,"video_path":null,"sets":"3","reps":"10-12","rest":"60s","notes":""},{"exercise_id":"2b544004-7438-4adf-8d5f-de505cb8d404","exercise_name":"Pulldown Unilateral","muscle_group":"Costas","video_url":null,"video_path":null,"sets":"3","reps":"12-15","rest":"60s","notes":""},{"exercise_id":"10491624-ea5f-41e7-b3ce-15013e899b8d","exercise_name":"Rosca Direta Barra W","muscle_group":"Bíceps","video_url":null,"video_path":null,"sets":"3","reps":"10-12","rest":"60s","notes":""},{"exercise_id":"f42f4b07-35f7-4deb-872e-3f1987a3dc89","exercise_name":"Rosca Martelo Halteres","muscle_group":"Bíceps","video_url":null,"video_path":null,"sets":"3","reps":"12-15","rest":"60s","notes":""}]'::jsonb);

  -- Treino C
  INSERT INTO public.workouts (id, cycle_id, company_id, name, title, sort_order, exercises) VALUES
  (wc_id, cid, comp, 'C', 'Quadríceps + Panturrilha', 2,
  '[{"exercise_id":"e1000001-0000-0000-0000-000000000010","exercise_name":"Agachamento Livre","muscle_group":"Quadríceps","video_url":null,"video_path":null,"sets":"4","reps":"8-10","rest":"120s","notes":""},{"exercise_id":"afcab7c3-ba4f-4178-946f-eea2e6969e93","exercise_name":"Leg Press 45","muscle_group":"Quadríceps","video_url":null,"video_path":null,"sets":"4","reps":"10-12","rest":"90s","notes":""},{"exercise_id":"619df5e8-b0fc-4229-ad64-b185e41903ee","exercise_name":"Cadeira Extensora","muscle_group":"Quadríceps","video_url":null,"video_path":null,"sets":"3","reps":"12-15","rest":"60s","notes":""},{"exercise_id":"75be10d2-4087-4b4d-9a88-c04f9bdb1a30","exercise_name":"Afundo Halteres","muscle_group":"Quadríceps","video_url":null,"video_path":null,"sets":"3","reps":"10-12","rest":"60s","notes":""},{"exercise_id":"1d8626a7-58e1-40d3-8ca8-396b57c233eb","exercise_name":"Panturrilha em Pé Máquina","muscle_group":"Panturrilha","video_url":null,"video_path":null,"sets":"4","reps":"12-15","rest":"45s","notes":""}]'::jsonb);

  -- Treino D
  INSERT INTO public.workouts (id, cycle_id, company_id, name, title, sort_order, exercises) VALUES
  (wd_id, cid, comp, 'D', 'Ombros + Tríceps', 3,
  '[{"exercise_id":"f65e178d-2fb9-467d-8ec7-153df01be7bb","exercise_name":"Desenvolvimento Halteres Sentado","muscle_group":"Ombros","video_url":null,"video_path":null,"sets":"4","reps":"8-12","rest":"90s","notes":""},{"exercise_id":"15968ffd-1b58-4859-b181-a8b9485a853c","exercise_name":"Elevação Lateral Halteres","muscle_group":"Ombros","video_url":null,"video_path":null,"sets":"4","reps":"12-15","rest":"60s","notes":""},{"exercise_id":"cad889ac-c8da-4654-b27a-41555e10f212","exercise_name":"Crucifixo Invertido Curvado","muscle_group":"Ombros","video_url":null,"video_path":null,"sets":"3","reps":"12-15","rest":"60s","notes":""},{"exercise_id":"713da3c2-14c9-4d74-8f7e-8a35d7ca21dd","exercise_name":"Elevação Frontal Halteres Neutra","muscle_group":"Ombros","video_url":null,"video_path":null,"sets":"3","reps":"12-15","rest":"60s","notes":""},{"exercise_id":"1173e1a7-fa43-4cd2-a1fd-811419b9e7d2","exercise_name":"Supino Fechado Barra","muscle_group":"Tríceps","video_url":null,"video_path":null,"sets":"3","reps":"8-12","rest":"60s","notes":""}]'::jsonb);

  -- Treino E
  INSERT INTO public.workouts (id, cycle_id, company_id, name, title, sort_order, exercises) VALUES
  (we_id, cid, comp, 'E', 'Posterior de Coxa + Glúteo', 4,
  '[{"exercise_id":"e07a88c2-da55-42e7-935a-1b53261381c6","exercise_name":"Stiff Barra","muscle_group":"Posterior","video_url":null,"video_path":null,"sets":"4","reps":"8-10","rest":"120s","notes":""},{"exercise_id":"9a07c179-37e8-4d8f-9ae9-0f399b1624b2","exercise_name":"Mesa Flexora","muscle_group":"Posterior","video_url":null,"video_path":null,"sets":"4","reps":"10-12","rest":"60s","notes":""},{"exercise_id":"961f2121-1053-4f1f-9376-86f21cb9e68b","exercise_name":"Cadeira Flexora","muscle_group":"Posterior","video_url":null,"video_path":null,"sets":"3","reps":"12-15","rest":"60s","notes":""},{"exercise_id":"c452607e-7dff-463d-adb2-a712059a8d26","exercise_name":"Agachamento Búlgaro","muscle_group":"Glúteo","video_url":null,"video_path":null,"sets":"3","reps":"10-12","rest":"90s","notes":""},{"exercise_id":"7bc7e3ba-a138-4a2b-b069-e6eb642ebe90","exercise_name":"Panturrilha Sentado Máquina","muscle_group":"Panturrilha","video_url":null,"video_path":null,"sets":"4","reps":"12-15","rest":"45s","notes":""}]'::jsonb);

  -- WORKOUT LOGS - Semana 24-28/mar/2025
  -- Dia 1 - Seg - Treino A
  INSERT INTO public.workout_logs (student_id, workout_id, exercise_index, set_number, weight, reps_done, session_date) VALUES
  (sid,wa_id,0,1,22,12,'2025-03-24'),(sid,wa_id,0,2,24,10,'2025-03-24'),(sid,wa_id,0,3,26,10,'2025-03-24'),(sid,wa_id,0,4,26,8,'2025-03-24'),
  (sid,wa_id,1,1,50,12,'2025-03-24'),(sid,wa_id,1,2,55,10,'2025-03-24'),(sid,wa_id,1,3,60,9,'2025-03-24'),(sid,wa_id,1,4,60,8,'2025-03-24'),
  (sid,wa_id,2,1,15,15,'2025-03-24'),(sid,wa_id,2,2,17.5,13,'2025-03-24'),(sid,wa_id,2,3,17.5,12,'2025-03-24'),
  (sid,wa_id,3,1,14,15,'2025-03-24'),(sid,wa_id,3,2,16,12,'2025-03-24'),(sid,wa_id,3,3,16,12,'2025-03-24'),
  (sid,wa_id,4,1,20,15,'2025-03-24'),(sid,wa_id,4,2,22.5,13,'2025-03-24'),(sid,wa_id,4,3,22.5,12,'2025-03-24'),
  (sid,wa_id,5,1,25,15,'2025-03-24'),(sid,wa_id,5,2,27.5,12,'2025-03-24'),(sid,wa_id,5,3,27.5,12,'2025-03-24');

  -- Dia 2 - Ter - Treino B
  INSERT INTO public.workout_logs (student_id, workout_id, exercise_index, set_number, weight, reps_done, session_date) VALUES
  (sid,wb_id,0,1,55,12,'2025-03-25'),(sid,wb_id,0,2,60,10,'2025-03-25'),(sid,wb_id,0,3,65,9,'2025-03-25'),(sid,wb_id,0,4,65,8,'2025-03-25'),
  (sid,wb_id,1,1,40,12,'2025-03-25'),(sid,wb_id,1,2,45,10,'2025-03-25'),(sid,wb_id,1,3,50,9,'2025-03-25'),(sid,wb_id,1,4,50,8,'2025-03-25'),
  (sid,wb_id,2,1,45,12,'2025-03-25'),(sid,wb_id,2,2,50,10,'2025-03-25'),(sid,wb_id,2,3,50,10,'2025-03-25'),
  (sid,wb_id,3,1,20,15,'2025-03-25'),(sid,wb_id,3,2,22.5,12,'2025-03-25'),(sid,wb_id,3,3,22.5,12,'2025-03-25'),
  (sid,wb_id,4,1,20,12,'2025-03-25'),(sid,wb_id,4,2,22.5,10,'2025-03-25'),(sid,wb_id,4,3,22.5,10,'2025-03-25'),
  (sid,wb_id,5,1,12,15,'2025-03-25'),(sid,wb_id,5,2,14,12,'2025-03-25'),(sid,wb_id,5,3,14,12,'2025-03-25');

  -- Dia 3 - Qua - Treino C
  INSERT INTO public.workout_logs (student_id, workout_id, exercise_index, set_number, weight, reps_done, session_date) VALUES
  (sid,wc_id,0,1,60,10,'2025-03-26'),(sid,wc_id,0,2,70,8,'2025-03-26'),(sid,wc_id,0,3,80,8,'2025-03-26'),(sid,wc_id,0,4,80,7,'2025-03-26'),
  (sid,wc_id,1,1,120,12,'2025-03-26'),(sid,wc_id,1,2,140,10,'2025-03-26'),(sid,wc_id,1,3,160,10,'2025-03-26'),(sid,wc_id,1,4,160,9,'2025-03-26'),
  (sid,wc_id,2,1,40,15,'2025-03-26'),(sid,wc_id,2,2,45,12,'2025-03-26'),(sid,wc_id,2,3,45,12,'2025-03-26'),
  (sid,wc_id,3,1,14,12,'2025-03-26'),(sid,wc_id,3,2,16,10,'2025-03-26'),(sid,wc_id,3,3,16,10,'2025-03-26'),
  (sid,wc_id,4,1,60,15,'2025-03-26'),(sid,wc_id,4,2,70,13,'2025-03-26'),(sid,wc_id,4,3,70,12,'2025-03-26'),(sid,wc_id,4,4,70,12,'2025-03-26');

  -- Dia 4 - Qui - Treino D
  INSERT INTO public.workout_logs (student_id, workout_id, exercise_index, set_number, weight, reps_done, session_date) VALUES
  (sid,wd_id,0,1,16,12,'2025-03-27'),(sid,wd_id,0,2,18,10,'2025-03-27'),(sid,wd_id,0,3,20,9,'2025-03-27'),(sid,wd_id,0,4,20,8,'2025-03-27'),
  (sid,wd_id,1,1,8,15,'2025-03-27'),(sid,wd_id,1,2,10,13,'2025-03-27'),(sid,wd_id,1,3,10,12,'2025-03-27'),(sid,wd_id,1,4,10,12,'2025-03-27'),
  (sid,wd_id,2,1,10,15,'2025-03-27'),(sid,wd_id,2,2,12,12,'2025-03-27'),(sid,wd_id,2,3,12,12,'2025-03-27'),
  (sid,wd_id,3,1,8,15,'2025-03-27'),(sid,wd_id,3,2,10,12,'2025-03-27'),(sid,wd_id,3,3,10,12,'2025-03-27'),
  (sid,wd_id,4,1,40,12,'2025-03-27'),(sid,wd_id,4,2,45,10,'2025-03-27'),(sid,wd_id,4,3,45,9,'2025-03-27');

  -- Dia 5 - Sex - Treino E
  INSERT INTO public.workout_logs (student_id, workout_id, exercise_index, set_number, weight, reps_done, session_date) VALUES
  (sid,we_id,0,1,40,10,'2025-03-28'),(sid,we_id,0,2,50,8,'2025-03-28'),(sid,we_id,0,3,55,8,'2025-03-28'),(sid,we_id,0,4,55,7,'2025-03-28'),
  (sid,we_id,1,1,30,12,'2025-03-28'),(sid,we_id,1,2,35,10,'2025-03-28'),(sid,we_id,1,3,35,10,'2025-03-28'),(sid,we_id,1,4,35,10,'2025-03-28'),
  (sid,we_id,2,1,30,15,'2025-03-28'),(sid,we_id,2,2,35,12,'2025-03-28'),(sid,we_id,2,3,35,12,'2025-03-28'),
  (sid,we_id,3,1,12,12,'2025-03-28'),(sid,we_id,3,2,14,10,'2025-03-28'),(sid,we_id,3,3,14,10,'2025-03-28'),
  (sid,we_id,4,1,40,15,'2025-03-28'),(sid,we_id,4,2,45,13,'2025-03-28'),(sid,we_id,4,3,45,12,'2025-03-28'),(sid,we_id,4,4,45,12,'2025-03-28');
END $$;