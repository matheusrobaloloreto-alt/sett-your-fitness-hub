# Edição em massa por treino e semana — 27/11/2026

Publicado em produção com autorização explícita do Matheus.

- Fonte: branch `codex/bulk-prescription-week-20261127`, commit `0656ac1`.
- Base preservada: `7e384516` (inclui o release BN Content `852b6019`).
- Deploy anterior: `6b095276b1926d7fc7752724`.
- Deploy publicado: `6b0956bed8cd7bba16fa03f4`.
- https://app.netlify.com/projects/bn-performance-webapp-matheus/deploys/6b0956bed8cd7bba16fa03f4

## Comportamento

O botão Edição em massa altera séries, repetições e descanso somente nos exercícios do treino e semana selecionados. Campos vazios são preservados; descanso zero é aceito. As alterações ficam no rascunho e seguem o salvamento existente. Sem alteração de banco ou Edge Functions. Prescrições sem semanas independentes não recebem edição em massa semanal.

## Evidência

- 46 testes em 5 arquivos passaram, incluindo salvamento com isolamento entre treinos e semanas.
- TypeScript, lint dos arquivos novos, build e verificação de performance passaram.
- Conferência autenticada em produção: diálogo abre no desktop e mobile (390×844), troca para semana 3 e cancelar. Nenhuma prescrição real foi salva no teste.
- HTML, service worker v21 e bundle WorkoutBuilder publicados conferidos byte a byte com o artefato validado.

## Próximas publicações

Esta mudança está publicada e preservada na branch acima. A main remota não foi alterada. Incorporar os commits de edição em massa e SW nas próximas integrações antes de reconstruir/publicar, para não regredir a funcionalidade. Não reaplicar commits de pagamentos internacionais ou cadência de outra frente: eles foram excluídos deste release.
