# SETT/BN - MVP da Consultoria Online

Data: 2026-09-14
Prioridade do negocio: BN Performance Training online.
Workspace: `/Users/macbookpro/.codex/worktrees/bn-app-20260826/release-rc`
Branch: `codex/sett-release-rc-20260826`

## Veredito

O SETT App ja tem nucleo suficiente para operar a consultoria online. O erro agora seria tentar "terminar o produto inteiro" antes de vender e operar. O foco correto e fechar o minimo operacional vendavel: captar, cobrar, avaliar, prescrever, acompanhar treino e comunicar pelo WhatsApp com seguranca.

O bloqueio real nao e funcionalidade nova grande. E controle de release: a branch atual esta em `4e0377652c7eae690c5b7be0f90b89a9faef26d5`, enquanto o gate de producao aprovado em `RELEASE-GATE-2026-09-10.md` referencia o SHA tecnico `18d1b184`. Portanto, qualquer promocao agora exige revalidar o HEAD atual ou congelar explicitamente um artefato antigo aprovado. Nao usar um gate antigo como se cobrisse commits posteriores.

## Plano antes de executar

- Objetivo: deixar o SETT pronto para operar a consultoria online BN com alunos reais.
- Fora de escopo: terminar Garmin/Oura/WHOOP, gravar todos os 872 videos, limpar historico Git antigo, hospedar BN Content Studio multiusuario e resolver todos os ciclos historicos dependentes.
- Fonte canonica: branch release `codex/sett-release-rc-20260826`; relatorio acumulado `RELATORIO-2026-08-27-FILA-ACUMULADA-SETT-BN.md`; gate `RELEASE-GATE-2026-09-10.md`.
- Estado atual: producao ja opera parte critica; staging tem releases aprovadas; `main` e producao da release continuam sem promocao final.
- Executor: ATENA raiz coordena; worktree release executa; QA independente revisa mudancas materiais.
- Criterio de pronto: aluno entra, paga, preenche anamnese, recebe treino, registra treino, conserva dados ao sair, conversa pelo WhatsApp; treinador gerencia alunos, prescreve, revisa e acompanha sem workaround critico.
- Validacao obrigatoria: CI/testes/build, smoke autenticado de treinador e aluno, smoke mobile de aluno, checkout real ou canario autorizado, WhatsApp no-send ou destinatario autorizado, tenant isolation.
- Limite remoto: local/branch/staging podem ser preparados; producao so apos gate atualizado e janela controlada.
- Rollback: usar backups e plano do release gate; parar no primeiro delta fora do esperado.

## Matriz MVP

| Area | Essencial para vender agora | Bloqueador tecnico real | Pode ficar para depois |
|---|---|---|---|
| Captacao | Link publico BN, pre-cadastro, anamnese global e convite privado separados. | Nenhum bloqueador funcional registrado; manter tenant explicito e canario publico. | Refinar copy e funil visual. |
| Pagamento | Pix/cartao/renovacao com lifecycle idempotente e ambiente Asaas isolado. | Sandbox/taxas nao bloqueiam venda real, mas nao prometer "sem custo/sem juros" sem validar contrato. | Conta Sandbox exclusiva, compra sintentica aprovada/recusada e simulacoes fiscais avancadas. |
| Onboarding do aluno | Criacao/ativacao de aluno, matricula operacional, treinador e datas sem duplicar matricula. | Quatro contatos sem numero confiavel seguem bloqueados por confirmacao humana. | Onboarding guiado no primeiro login. |
| Anamnese e avaliacao | Anamnese privada/global, avaliacao funcional, historico e contexto para prescricao. | Smoke visual autenticado ainda deve ser refeito onde navegador falhou. | Batch de frames e otimizacao de custo da IA de visao. |
| Prescricao | Prescricao integrada, ciclo atual correto, publicacao atomica, exclusao/restauracao auditavel, biblioteca protegida contra imports incompletos. | Reparar 10 referencias quebradas em treinos atuais depende de decisao profissional de variante/ID canonico. | Revisao profunda do motor e refinamento completo dos bundles. |
| Portal do aluno | Treino, marcacao semanal, autosave/localStorage, retomada ao sair/voltar. | QA movel real ainda pendente para marcador semanal e restauracao no mesmo dispositivo. | Modo offline completo com fila de cargas. |
| WhatsApp/CRM | Conversas globais, envio, video recebido para avaliacao, destinatario canonico, internacional preservado. | Quatro cadastros sem destinatario confiavel exigem confirmacao humana; contato internacional precisa confirmacao de entrega real. | Automacoes avancadas e templates comerciais mais refinados. |
| Conteudo/videos | 52 videos proprios existentes e artefato de gravacao dos 926 exercicios pronto. | 872 videos nao bloqueiam MVP se houver alternativa demonstrativa/instrucao textual segura. | Gravacao completa, ingestao e publicacao da biblioteca propria. |
| Wearables | Strava e Polar conectados/sincronizados. | Garmin direto, Oura e WHOOP dependem de aprovacao/credenciais oficiais. | Produto premium com wearables multiplataforma. |
| Consentimento semanal | Ledger/RPC/dispatcher/UI em staging, rehearsal PROD aprovado. | Producao ainda sem rollout; HEAD atual precisa revalidacao porque passou de `18d1b18` para `4e03776`. | Ajustes finos de cadencia e segmentacao. |
| Conteudo BN | BN Content Studio local e arquivo privado no Master. | Nao bloqueia operacao da consultoria. | Hospedagem remota/multiusuario quando houver equipe editando. |
| Historico/privacidade | Evidencias sensiveis atuais ficam privadas/RLS; relatorios publicos pseudonimizados. | PII em historico antigo do Git so com reescrita destrutiva e autorizacao separada. | Politica formal de retencao e sanitizacao historica. |

## Sequencia de fechamento

### Fase 1 - Gate tecnico atual

Objetivo: saber se `4e03776` esta apto para virar release ou se devemos voltar ao SHA tecnico `18d1b18`.

Checklist:

- Reconfirmar `origin/main`, branch, HEAD e diff.
- Rodar gates locais do HEAD atual: `npm run verify:backend`, `npm test`, `npm run build`.
- Comparar CI da branch release no HEAD atual.
- Se qualquer gate falhar, corrigir ou congelar explicitamente o artefato aprovado antigo.
- Atualizar o release gate para apontar o SHA realmente candidato.

Saida esperada: `GO HEAD atual` ou `usar artefato antigo`, sem ambiguidade.

### Fase 2 - Smokes MVP de campo

Objetivo: provar o caminho comercial minimo com dados reais/controlados.

Smokes obrigatorios:

- Pre-cadastro BN sem sessao.
- Anamnese privada de aluno existente.
- Checkout com caminho real permitido ou canario autorizado.
- Prescricao integrada: abrir, editar rascunho, publicar/visualizar sem trocar ciclo.
- Portal aluno mobile: concluir treino, sair/voltar e confirmar persistencia.
- WhatsApp: abrir conversa, preservar destinatario, no-send ou destinatario autorizado.
- Master/treinador: localizar aluno, historico, pagamento, treino e conversa sem travar.

Saida esperada: lista curta de P0/P1/P2. Se zero P0/P1, app e operavel.

### Fase 3 - Producao controlada

Objetivo: promover somente o que melhora operacao sem introduzir risco desnecessario.

Ordem:

1. Rehash/preflight de producao.
2. Reconfirmar backup e rollback.
3. Revalidar monitores zero-delta.
4. Fazer rollout curto F1 -> F2 -> F3 quando aplicavel.
5. Baixar/varrer bundle servido.
6. Rodar smokes MVP.
7. Congelar registro em documento e commit.

Regra: se o HEAD atual nao tiver gate proprio, nao usar o gate antigo como justificativa.

### Fase 4 - Operacao comercial

Objetivo: com app estavel, vender e operar.

Entregaveis:

- Link oficial de entrada do aluno.
- Mensagem padrao de convite/pre-cadastro.
- Roteiro operacional de primeiro aluno.
- Checklist de atendimento semanal.
- SLA simples: resposta, ajuste de treino, renovacao, suporte.
- Calendario de conteudo BN alinhado com funil.

## O que parar de fazer

- Parar de tratar 872 videos como pre-requisito para vender.
- Parar de abrir novas integracoes wearable antes do fluxo aluno/treinador estar validado em campo.
- Parar de chamar staging aprovado de producao pronta.
- Parar de misturar "melhoria de produto" com "bloqueio de MVP".
- Parar de usar gate de SHA antigo para branch que ja recebeu commits posteriores.
- Parar de adiar venda por perfeccionismo tecnico quando o risco real esta em poucos gates objetivos.

## Checklist acumulado

- ✅ Pre-cadastro/anamnese BN em producao.
- ✅ Pagamento real e renovacao em producao.
- ✅ Prescricao integrada e editor atomico em producao.
- ✅ WhatsApp/CRM global em producao.
- ✅ MFIT aplicado para os 35 aptos e fila ativa encerrada.
- ✅ Staging do consentimento semanal aprovado.
- ❌ Promocao final da release para producao `(bloqueado)`: precisa gate do HEAD atual ou artefato antigo explicitamente congelado.
- ❌ Fast-forward para `main` `(bloqueado)`: precisa validar `origin/main`, ancestralidade e CI no SHA candidato.
- ❌ QA movel do portal aluno `(aguardando)`: falta campo real de sair/voltar e marcador semanal.
- ❌ Quatro contatos sem numero confiavel `(bloqueado)`: depende de confirmacao humana.
- ❌ 10 referencias quebradas em treinos atuais `(bloqueado)`: depende de decisao profissional.
- ❌ 39 ciclos historicos dependentes `(aguardando)`: nao bloqueia MVP, exige revisao individual.
- ❌ 872 videos proprios `(aguardando)`: backlog de qualidade, nao bloqueio comercial.
- ❌ Garmin/Oura/WHOOP `(bloqueado)`: depende de credenciais/aprovacoes.

## Proxima acao recomendada

Executar a Fase 1 imediatamente. Se `4e03776` passar, ele vira candidato unico de release. Se nao passar, separar o que e documentacao/melhoria posterior do pacote tecnico aprovado em `18d1b18` e decidir qual caminho vai para producao.
