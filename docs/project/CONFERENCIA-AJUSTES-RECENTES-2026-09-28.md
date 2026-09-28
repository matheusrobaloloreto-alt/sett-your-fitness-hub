# Conferencia dos ajustes recentes SETT/BN - 2026-09-28

## Veredito e limites

Nem todos os pedidos recentes estao concluidos. A assinatura foi publicada;
templates multimidia continuam locais. A revisao encontrou duas falhas P2 no
editor semanal, uma falha P2 de persistencia da anamnese e uma ressalva de
preservacao de cargas mistas legado/v2. Treinador na cadencia ainda esta ausente.
Esta rodada foi uma auditoria: nenhum codigo funcional, dado de aluno, mensagem,
migration ou deploy foi alterado. Somente este relatorio e o checklist foram atualizados.

Baseline auditado: ed9d3ef, checkout sett-load-save-release-20260928.
Frontend em producao: 6aba54b136a13844f5f64b5e, https://www.settapp.com.br.
HTML e nove chunks de Agenda, Dashboard, tema, pre-cadastro, interessados,
perfil, portal, templates e editor coincidiram byte a byte com o build local.
Isso comprova publicacao do codigo, nao execucao completa em uma sessao real.

## Confirmados com evidencia atual

- Assinatura: switch ON/OFF publicado, backend whatsapp-manager v87 conferido
  na release anterior. Recebimento em telefone real ainda nao confirmado.
- Salvamento: migrations 20260928065519 e 20260928074406 presentes no banco;
  usuario confirmou o salvamento. Testes nao equivalem a validar todo cronometro.
- Biblioteca da empresa e global: migration 20260923113000 aplicada;
  consulta atual encontrou zero referencias invalidas nos templates existentes.
- Leitura dos alunos da mesma empresa: migration 20260922110000 aplicada;
  students SELECT usa can_read_staff_student e a funcao viva verifica empresa
  e equipe, sem exigir carteira atribuida. Isso nao amplia acesso entre empresas
  nem concede automaticamente permissao de editar todos os alunos.
- Anamnese interciclos manual: migration 20260921133000 aplicada; submit vivo
  reconhece intercycle_manual_link_ready. Edge intercycle-anamnesis v6 e seu
  helper coincidem com os arquivos locais. O limite do dia 29 continua somente
  no reagendamento/envio automatico, nao na geracao manual do link.
- Editor v2: painel semanal unico, tipos de serie por semana, cadencia padrao
  2020 e copia para multiplas semanas presentes no codigo publicado.
- Prescricoes antigas homogeneas: gates mantem legado/v1; nenhuma migracao
  automatica foi feita nesta auditoria. Ressalva de cargas mistas abaixo.
- Portal: WarmupGuide, WhySafetyCard e WorkoutHeader nao sao renderizados;
  botao pessoal de tema presente. Nao se afirma eliminacao desses componentes
  de todo o projeto nem validacao de todas as combinacoes de tema no telefone.
- Conversas: FAB inferior direito condicionado a permissoes. Animacao da
  auditoria confinada em container 56x56 com overflow-hidden.
- Agenda: filtro Todos/Meus implementado e aplicado aos eventos por identidade
  do treinador (AdminAgenda.tsx:200 e 268; helper agendaOwnership).
- Anamnese: edicao manual e Notas implementadas; campos principais priorizados
  e popovers do chat/editor com area rolavel. A persistencia integral nao esta
  aprovada devido ao campo omitido descrito abaixo.
- Dashboard: filtros Pendentes/Atrasadas em renovacao e troca de treino,
  aniversarios como companheiro de cadencia, e renovacao abre chat em rascunho
  via studentChat.ts:89. Trainer recebe dashboard read-only e nao tem o botao
  Renovar agora; a leitura geral nao foi confundida com permissao de escrita.
- Motor: ai-prescribe-workout v99 ativa; engine, longitudinalRules, volumeRules
  e weeklyPeriodization coincidem byte a byte com o checkout auditado.
  Suite de 91 testes aprovada: ordem, semanas executaveis, W/Normal/F,
  seis sessoes com extra, teto 21, reducao de corrida, EVA e progressao entre ciclos.
  A aprovacao tecnica nao substitui revisao da ficha no perfil de teste indicado.

## Problemas encontrados no editor semanal

1. Descanso zero: WorkoutBuilder.tsx:233 usa Number(current.rest_seconds) ||
   parseRestSeconds(exercise.rest). O valor explicito 0 retorna ao descanso-base.
   Pendente de correcao e teste de regressao, ainda sem patch ou deploy.
2. Series retas: WorkoutBuilder.tsx:235 usa current.method ?? exercise.method.
   method:null da semana pode recuperar um metodo-base, como dropset.
   Pendente de distinguir ausencia de propriedade de null intencional e testar.
3. Carga mista: weeklyStrengthPeriodization.ts:129 ativa modo semanal se qualquer
   exercicio e v2; serializer WorkoutBuilder.tsx:415 aplica o modo a todos.
   Ocorrencia em dados reais nao comprovada. Auditar e testar antes de prometer
   preservacao irrestrita de qualquer combinacao antiga/nova.

## Problema encontrado na edicao da anamnese

- P2: o editor aceita alterar has_kitchen, mas o mapper de UPDATE canonico em
  preRegistrationData.ts:36 omite esse campo. Reproducao sintetica perdeu o
  campo, enquanto objetivo e notas permaneceram. Corrigir e testar persistencia
  e releitura antes de declarar todos os campos editaveis integralmente.
- O teste de PreRegistrationDetails usa onSave mockado e nao cobre esse mapper;
  portanto sua aprovacao nao prova que todos os valores foram gravados no banco.

## Validacoes desta rodada

- Raiz: 38/38 testes de biblioteca, interciclos e salvamento.
- Raiz: 91/91 testes de engine, progressao longitudinal e compute budget.
- Raiz: 13/13 testes de editor de anamnese, popover, dashboard trainer e chat.
- Raiz: teste de agendaOwnership reexecutado e aprovado.
- Revisor independente: 81/81 testes focados em semanas, tema, portal e contratos;
  os dois problemas P2 foram reproduzidos separadamente, apesar da suite verde.
- Banco: somente consultas de metadados, definicoes e contagens agregadas;
  nenhum dado pessoal exportado, nenhum envio ou submissao real.

## Pendencias acumuladas e proximas acoes

- Templates multimidia (aguardando): coluna attachments ausente no banco e
  migration 20260928120000 nao aplicada. Integrar WIP com assinatura publicada,
  concluir gate e publicar a migration revisada, backend e frontend.
- Editor semanal P2 e carga mista (aguardando): regressao, patch isolado,
  revisao independente e nova verificacao antes de publicar.
- Recebimento da assinatura (aguardando): confirmar telefone de teste autorizado.
- Anamnese has_kitchen (aguardando): corrigir mapper, testar persistencia e
  releitura; esta auditoria nao implementou ou publicou a correcao.
- Cadencia com treinador atribuido, Matheus (aguardando): ausente no componente
  ContactCadenceCard e no contrato usado. Atualizar contact_cadence e snapshot,
  renderizar o responsavel e testar ambos os caminhos.
- Manual tecnico BN, Bruna (bloqueado): obter/validar o conteudo operacional.
- Taisa ABCDE, aviso, feedback e visibilidade (aguardando): confirmar ficha e
  destinatario; nao houve prescricao ou mensagem nesta rodada.
- Videos faltantes (bloqueado): receber gravacoes, vincular e conferir.
- Motor no perfil de teste e renovacoes reais (aguardando): conferir ficha e
  continuidade longitudinal, preservando prescricoes antigas.
- Matriz integral professor/aluno desktop/mobile e cronometro (aguardando):
  testar finalizacao, recuperacao e sessoes reais; salvamento confirmado e parcial.
- Git/migrations historicas e hardening (aguardando): reconciliar sem db push
  indiscriminado; completar SQL multiconexao e retencao de recibos.
- WhatsApp idempotencia duravel e uploads orfaos (aguardando): reconciliar envios
  incertos e implementar limpeza baseada em referencias/retencao.
- Pedidos antigos de senha, estrelas Athletic Club, ciclos/matriculas, agenda,
  links, layouts e permissoes permanecem no historico. Nao foram todos reauditados
  nesta rodada; conferir por item antes de certificar o app inteiro.

Metodo: ATENA, revisao independente e Skill 121 - Debugger Sistematico.
