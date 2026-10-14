# Acesso da equipe aos alunos e prescricoes - 2026-10-14

## Pedido e causa confirmada

Matheus pediu para liberar a equipe em relacao aos alunos e prescricoes.
O escopo e treinador, coordenador, administrador e Master. Alunos continuam
restritos aos proprios dados. Equipes nao recebem acesso a outras empresas;
o Master mantem a autorizacao global preexistente.

Consulta da definicao viva confirmou a divergencia: `can_read_staff_student`
ja permitia consultar toda a empresa, mas `can_manage_staff_student` ainda
exigia atribuicao direta ou vinculo do treinador na matricula. O RPC
`replace_cycle_workout_revision` usa esse segundo helper e retornava
`workout_revision_forbidden`, traduzido no aviso mostrado pelo usuario.

## Implementacao

- Helper de gestao passa a exigir autenticacao, papel de equipe, vinculo com a
  empresa e correspondencia exata aluno/empresa, sem exigir carteira.
- RLS e RPCs existentes de alunos, matriculas, ciclos, anamneses e prescricoes
  que usam o helper herdam a regra sem remover suas demais validacoes.
- Troca atomica de professor adota a mesma regra; mantem destino da propria
  empresa, bloqueio concorrente e atualizacao das matriculas operacionais.
- Gravacoes diretas em alunos e matriculas tambem validam o destino como equipe
  da propria empresa. Referencias historicas inalteradas nao sao reescritas.
- Validacao de atribuicao ocorre depois dos gatilhos que preenchem o professor
  automaticamente, inclusive quando uma alteracao de outro campo preenche o ID.
- Diretorio restrito devolve somente nome, ID e papeis da equipe da empresa,
  sem abrir leitura irrestrita de `user_roles` para os treinadores.
- Seletores inline usam o mesmo RPC atomico com compare-and-swap. Matriculas
  historicas preservam o professor original.
- Botoes e handlers de Alunos, Carteira e perfil alinhados ao escopo da equipe.
- Atribuicao do professor, filtro meus, historico e controle de versoes mantidos.
- Fluxo de criacao de acesso do aluno recebe verificacao server-side da empresa.
- Reconciliacao de contas impede reaproveitar login global por email, mover
  vinculo entre empresas ou redefinir senha de conta de profissional/Master.
- Mensagem de acesso negado nao recomenda mais trocar o professor responsavel.
- Service worker v10. Nenhuma permissao de financeiro, equipe ou Master ampliada.

## Validacao e publicacao

Validacao local concluida para o escopo de acesso; publicacao em andamento.
Nao considerar este checkpoint como confirmacao de producao.
Baseline `d517a69`, worktree `sett-load-save-release-20260928`, branch
`codex/sett-load-save-release-20260928`.

Backend canonico: `zshrcgbyhzxpnlccssyz`.
Site Netlify: `9a061d2e-ee2c-444b-aa69-fe262caf0246`.
Deploy anterior confirmado: `6acc97ce0b9573ae13c2bfa1`.

Primeira rodada completa: 204 arquivos Vitest, 1518 testes aprovados e 7 ignorados.
Reteste final do escopo: 6 arquivos, 78 testes aprovados, incluindo as telas de
equipe, CAS, diretorio, historico, escopo Master e o cleanup de tipos dos testes BN.
Contrato PostgreSQL/PGlite final: 200/200 aprovados, incluindo a comparacao
financeira antes/depois. Testes Deno de identidade e acesso: 98/98 aprovados.
`tsc --noEmit -p tsconfig.app.json`: aprovado no codigo final.
Build e gate de bundle aprovados; scripts iniciais 847274 bytes.
Lint focado: zero erros, um aviso preexistente de dependencia de useEffect.
Revisao independente: sem P1/P2 remanescente no diff final.

A rodada ampla sob contencao foi interrompida apos falha no benchmark do motor.
O benchmark tambem falhou isoladamente: mediana CPU 953,287 ms, teto 500 ms.
Causa ainda nao confirmada. Motor, teste e manifests de dependencias estao
identicos ao HEAD anterior (`git diff --exit-code` conferido); a carga do host
chegou a mais de 400. Isso sugere influencia do ambiente, nao prova a causa.
Excecao de release documentada e revisada independentemente: nao bloquear a
correcao de autorizacao por esse teste fora do escopo. Nao alterar o teto,
nao classificar o benchmark como aprovado e nao publicar o motor nesta entrega.
Pendencia: repetir em ambiente sem contencao e investigar se permanecer acima
do limite (aguardando). Nenhuma garantia geral de desempenho foi inferida.

O contrato do banco inicialmente detectou uma atribuicao direta a conta de aluno;
a revisao independente tambem detectou preenchimento por trigger apos a validacao,
diretorio de professores oculto por RLS e fluxos antigos de credenciais.
Esses achados foram tratados como bloqueios reais do release, nao ignorados.

## Rollback

As tres definicoes anteriores foram capturadas diretamente do
banco antes da alteracao em
`rollback-company-staff-student-management-2026-10-14.sql`.
Aplicar como migration compensatoria apenas se necessario. Restaurar o deploy
anterior do frontend. Nenhum aluno, matricula ou treino precisa ser apagado.
O rollback tambem restaura as politicas financeiras anteriores. Manter as
correcoes de seguranca de identidade das Edges; nao restaurar o reaproveitamento
inseguro de contas globais por email.

Auth e Postgres nao formam uma unica transacao: uma falha apos criar uma conta
nova pode exigir reconciliacao manual. Erros nao devolvem credenciais como sucesso.

Skill usada: ATENA e 121 Debugger Sistematico (Causa Raiz), com implementacao,
contrato de banco e revisao independente em responsabilidades separadas.
Referencia de RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
