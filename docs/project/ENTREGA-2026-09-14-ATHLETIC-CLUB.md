# Athletic Club: estrela de identificacao

Baseline: `d55ba4b`, worktree `sett-hotfix-a-b-integration-20260914`.

## Regra

- Estrela dourada acessivel com legenda Athletic Club ao lado do nome, sem modificar `full_name` ou qualquer registro do aluno.
- Derivacao pelos planos Athletic Club (Iniciante, Semestral, Anual e futuras variantes com esse prefixo), usando a mesma selecao de matricula vigente do portal e da prescricao.
- Historico cancelado/substituido nao concede estrela. Matriculas em preparacao e renovacao seguem a regra canonica existente; BN PRO nao recebe a marca.
- Consulta agrupada e paginada por empresa, protegida pelas politicas existentes. Cache separado por usuario/empresa, atualizacao via realtime e consulta de seguranca a cada 60 segundos enquanto a tela estiver aberta.
- Sem migracao, escrita no banco, alteracao de contrato ou envio de mensagem.

## Superficies

Carteira, Alunos, perfil/Visao 360, prescricao, esteira, conversas e dashboard/alertas do professor; nome e saudacao no portal do aluno. Contatos sem vinculo de aluno nao recebem estrela.

## Verificacao

- Consulta de producao confirmou os tres planos e tres matriculas canonicas Athletic Club (duas ativas, uma aguardando renovacao), sem exportar identidades pessoais.
- Revisao independente da logica e do provider: aprovada; testes de variantes, matricula canonica, historico e isolamento de empresa/usuario.
- Suite de navegador com componentes reais e dados simulados: 11 testes aprovados, incluindo entrada/saida automatica da estrela ao trocar de plano e ausencia de escritas de aluno.
- TypeScript do app, build canonico e verificacoes focadas aprovados. Avisos de dependencias de hooks preexistentes permanecem fora do escopo.
- Validacao de navegador nao equivale a sessao autenticada de producao em aparelho fisico.

## Publicacao

Aguardando promocao do build final. Rollback anterior: Netlify `6aa7f6ecdc90f80ead2b7e7d`.

## Fila anterior

As pendencias anteriores permanecem no relatorio `ENTREGA-2026-09-14-BIBLIOTECA-MOBILE.md`: gravacoes de videos, reconciliacao historica, classificacao muscular incompleta e confirmacao de contatos/recebimento real de recuperacao. Esta entrega nao encerra esses itens.
