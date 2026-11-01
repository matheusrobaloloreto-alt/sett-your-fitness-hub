# Continuidade C8 — revisão backend somente leitura, 2026-11-01

Base: 60fba11ca05df66adf4e16bb6472fcb0cbd0ceab. Fontes de portal/helpers em edição por Bernoulli não foram alteradas por este executor. Escritas próprias restritas a qa/continuity-20261101.

## Veredito

Nenhum gate backend identificado que impeça iniciar, registrar cargas ou concluir uma sessão em 01/11 usando treino de C8 completed com fim em 25/10, dentro da matrícula ativa até 2027. Não precisa reabrir ciclo, estender datas nem alterar matrícula. O fluxo usa uma NOVA workout_session in_progress que pode tornar-se completed; o training_cycle continua completed.

Isso confirma compatibilidade das regras atuais, não execução de uma sessão real: produção recebeu somente SELECT de metadados e contagens agregadas. Não houve RPC mutante, INSERT/UPDATE/DELETE, envio ou deploy.

## Rotas efetivas e gates

1. Início: src/hooks/useWorkoutSession.ts:127 chama public.start_workout_session. Implementação local em supabase/migrations/20261029180000_session_transitions_idempotency.sql:48 e definição viva consultada. Exige auth.uid dono do aluno/empresa e treino pertencente ao ciclo/aluno/empresa; nenhuma condição de ciclo active, end_date ou matrícula. Reutiliza recibo de request_id; conflitos session_already_in_progress/session_legacy_ambiguous permanecem. Grant authenticated confirmado vivo.
2. Cargas: StudentPortal chama public.save_workout_logs_if_current; wrapper em supabase/migrations/20260928074406_workout_log_batch_receipts.sql:45 delega ao core preservado da migration 20260928065519_workout_logs_fractional_rpe_idempotency.sql. Wrapper :111-119 e core :349-377 exigem dono/tenant coerente, data de execução dentro de CURRENT_DATE-3650 a CURRENT_DATE+1, índices/séries válidos e CAS de revisão. Não comparam session_date com fim do ciclo nem exigem ciclo active. Salvar 01/11 em ciclo terminado em 25/10 é permitido. Grant do wrapper confirmado; core não exposto a authenticated.
3. Conclusão: src/hooks/useWorkoutSession.ts:184-208 faz UPDATE nativo em workout_sessions, filtrando id/student/company/status=in_progress, retorna id e confirma terminal em caso de ACK perdido. Sem RPC específico de conclusão. RLS viva Student updates own sessions, Assigned staff update guard e SELECTs associados validam identidade/tenant/vínculo workout-cycle, sem vigência. public.guard_workout_session_transition (:21 da migration de sessões) preserva identidade e permite in_progress->completed/abandoned; sessão já terminal é imutável.
4. Leitura RLS viva: students_read_own_cycles e students_read_own_workouts exigem dono e início <= current_business_date, sem limite superior de fim. Student reads own data usa user_id=auth.uid. Ciclo completed expirado não fica invisível por end_date no banco.
5. Triggers vivos de sessões: session_transition_guard, zz_enforce_student_company_integrity, zz_enforce_workout_session_reference_integrity; AFTER triggers update_active_challenges_on_workout, queue_post_session_message, update_streak_on_workout. Definições AFTER consultadas em SELECT: nenhum gate de vencimento do ciclo; conclusão pode atualizar streak/desafio e enfileirar pós-sessão conforme configuração. Não executei esses efeitos remotamente nem no fixture sintético.

## Evidência viva agregada

Consultas no projeto autorizado zshrcgbyhzxpnlccssyz encontraram exatamente um ciclo compatível com C8 completed/end_date=2026-10-25 e matrícula active/end_date>=2027-01-01. Não foi feita identificação por nome.

- 37 linhas de workouts vinculadas: 34 retiradas (superseded_at não nulo), três não retiradas.
- Os três treinos atuais possuem exercises array não vazio.
- Zero company_id nulo/divergente entre as 37 linhas.
- Aluno com user_id vinculado; zero sessões in_progress no momento da consulta.
- authenticated: EXECUTE start=true, EXECUTE save wrapper=true, EXECUTE core=false, SELECT/UPDATE sessions=true.

## Prova local

Comando, a partir da raiz do repo:

    node qa/continuity-20261101/backend-continuity.mjs

Resultado: 11 checks PASS. Carrega definições de funções e policies capturadas por SELECT vivo em backend-schema-snapshot.json, executa em PGlite existente no cache npm; sem instalação.

Checks: leitura RLS do treino completed expirado; início; replay idempotente; carga/sets com session_date=2026-11-01; atualização CAS; conflito stale revision; UPDATE nativo de conclusão sob authenticated com RLS e triggers de integridade/transição; terminal imutável; início em outro tenant negado; gravação em outro tenant negada; datas/status de ciclo e matrícula preservados.

Limites do fixture: schema mínimo sintético; helpers de STAFF retornam false, apenas o caminho STUDENT é exercitado. Grant/ACL completo não é restaurado no fixture, mas permissões efetivas foram consultadas separadamente no banco vivo. Triggers AFTER de streak/desafios/mensagens foram inspecionados, não executados. current_business_date sintética fixada em 01/11; o core usa CURRENT_DATE real da execução para validar a data do log. Não prova browser/auth hospedado/ACK de rede nem avaliação física de que a prescrição permanece adequada.

Primeira execução alcançou o último check e falhou somente porque PGlite retornou date como JS Date e a assertion comparou string. A consulta de verificação local foi ajustada para ::text; nenhuma fonte/definição backend foi modificada. Reexecução 11/11 PASS; isso não foi um RED de produto.

## Riscos e orientação concreta

- Não há bloqueador backend de vencimento neste caso e nenhuma migration corretiva é necessária para habilitar continuidade.
- Manter workout_id/cycle_id originais e gravar nova data real de sessão; não reabrir sessão terminal nem retrodatá-la ao fim do ciclo.
- Se aparecer PT409, tratar sessão aberta/request replay/ambiguidade; não contornar identidade/locks nem criar fallback INSERT.
- Company_id NULL é aceito em parte do início/integração, mas save wrapper/core exigem igualdade exata. Seria bloqueador de dados caso existisse; consulta viva encontrou zero no caso.
- O backend de gravação não decide sozinho "último treino publicado até o próximo". O seletor do portal deve continuar excluindo treino superseded/arquivado, futuro e outro tenant, e distinguir programação vazia de publicação utilizável. Não ampliar esses RPCs como parte deste ajuste.
- A comprovação nativa end-to-end no novo portal e a chegada do próximo treino publicado ficam com Bernoulli/root. Não declarar execução em produção: não realizada.

## Artefatos próprios

- backend-schema-snapshot.json: código de funções/policies, sem dados pessoais/credenciais.
- backend-continuity.mjs: teste SQL sintético.
- backend-continuity-results.txt: resultado 11/11.
- BACKEND-REVIEW.md: este handoff.
