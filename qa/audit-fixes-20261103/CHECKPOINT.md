# SETT — implementação em andamento, 03/11/2026

- Base: d85e551. Autorizado implementar, validar antes de deploy; nenhum deploy até aqui.
- Plano: docs/superpowers/plans/2026-11-03-sett-correcoes-auditoria-e-seletor.md.
- Executores ativos: Bacon seletor/player; Ptolemy escopo/listas; Sagan financeiro e QA Governance; Popper aluno/planos/análise; Rawls UX/copy; Aristotle Governance e QA listas/feedback.
- Owner raiz: PendingFeedbackCard/test, integração, baseline/candidato, staging nativo, browser e release.
- DDL nova Governance aplicada SOMENTE staging ifymocggowdlqqcxugko via helper; SHA 7cc71bb7d67c9f8705b99f68234a2a13997ac5365918ff4f09bff2267782b4da. Não aplicada produção. Backup funções/ACL no output privado.
- Baseline inicial inválido/interrompido: duas execuções, uma resolveu package pai antes do archive. Ambas encerradas. Não usar log misto como evidência verde; repetir sequencialmente depois dos workers.
- Test raiz PendingFeedback 4/4 após RED4fail; nova trava/ref/cleanup ainda requer rerun.
- Browser: user pediu navegador INTERNO; CUA createBrowserTab iab retornou indisponível. Chrome disponível intermitente mas user prefere interno; buscar open_in_codex após candidato local pronto.
- Próxima ação: native Auth/REST Governance, fim dos workers, QA independente, freeze e testes serializados. Só promover candidato com gates.
- Evidências privadas: output/sett-audit-fixes-20261103.private/.

- Native Governance em staging: 13 verificações com GoTrue/REST PASS; ACL/owner de funções intactos. Evidência native-governance-result.json. Nenhuma DDL produção.
- Preview seguro preparado para porta 57833: backend staging direto e CSP bloqueando todas as Edge/provider calls. Só executar build após freeze de fontes.

- PendingFeedback reforçado: 8/8 testes PASS (read/enrichment errors, ausência de tenant, read-only, ACK tardio após troca e leitura antiga).
- Fixture seleção pronta: 2 ciclos sinteticos, exercícios local/global e MP4 gerado no staging; assinatura Storage real confirmada. Staging não tinha política SELECT autenticada de mídia; foi criada permissão somente para o único objeto demo (nenhuma mudança produção).
- QA independente encontrou StudentsManager stale loads e Coordinator pós-ACK stale reload; owners corrigindo. Gov2 findings (homônimos e pedidos vencidos) em correção com DDL adicional.

- Native seleção/persistência: três treinos A/B/C gravados e relidos com Auth/REST reais em fixture staging, catálogo empresa/global e métricas idênticas; stale/foreign writes rejeitados e estado preservado. HTTP legado400 com código workout_revision_changed/forbidden foi validado semanticamente (não tratado artificialmente como409). Evidência native-selection-result.json.

## Atualização de gate
- Usuário autorizou explicitamente publicar antes da validação visual, seguida de testes no ambiente publicado (resposta de 03/11). Não dispensa QA independente nem testes automatizados; apenas altera a ordem da validação visual bloqueada por IAB.
- Preview abortou corretamente porque houve alterações de fonte durante build. Não houve servidor disponível na porta 57833; URL não é evidência de preview funcional.
- Root tsc integração exit0; lint integral em execução.
- Host local observou load average >700; baseline imutável também tem timeouts. Estes resultados não são verdes e não devem ser atribuídos automaticamente ao candidato. CI remoto com ambiente sintético no step de testes e até2workers foi preparado, ainda sem push.
- QA adicional Finance encontrou preflight posterior à perda de contexto e busy lock A->B; corrigidos com6probes passando. ACK estrito e exclusão de preflight concorrente em correção.
- QA adicional Analytics comprovou semana3 com5séries sendo apresentada como2base; Popper ajustando resolução semanal preservando legado.
- Gov2 revisada independentemente por Sagan:14/14, zero skips, SHA6b6d21ec4509d159244110bc7f7ee495b06cb7a7dc03de3d4462b7a5fd7dc8fc. Aplicação/probes staging delegadas a Aristotle, exclusivamente fixturecompanyA.
- Player: preservar YoutubeID/role invalidation e iframe load/error sem afirmar reprodução. QAestático aprovado;rerun integrado ainda pendente.

## Integração lateral concluída localmente
- Source commit anterior449f3e1, runtime em revisão final antes de novoCI.
- Regressão de taxonomia do primeiroCI revertida: canon bytebase preservado, acentos sóna UI. DefaultsemanalTS/SQL preservado. AdaptersVM/contratos antigos atualizados sem enfraquecer auth/tenant/replay.
- TypecheckREAL tsc-b exit0 (o --noEmit na raiz comfiles[] não comprovava referências). Três diagnósticos resolvidos: typedcatalogkeys, annotationsnotes e discriminantebooleano.
- Sidepatch: sete arquivos integrados,150/150 tests e99 QAindependente.50 perfis27→41, zero perdas/trocas nos27 originais,100barreiras e50tenantprobes.
- Productionowner read: três workouts legados acessíveis por roleauthenticated/claimsdoowner emtransação rollback. Não foi loginGoTrue ouUI. BNexpirydefaultkeep confirmado porleitura.
- RotaStudentWorkout alinhada à política poratorreal:103 testesowner,33/33 último rerun; sourcefrozen paraQAindependente. Histórico sóconsulta, semexecução.
- Nenhum deployouDDLprodução nesta rodadaainda. Guardserverstartpreexistente foi documentadoseparadamente e nãoalterado.
