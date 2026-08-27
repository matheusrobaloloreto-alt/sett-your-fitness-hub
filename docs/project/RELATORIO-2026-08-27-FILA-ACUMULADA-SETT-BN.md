# SETT/BN — relatório acumulado de execução em 2026-08-27

## Veredito

A maior parte da fila funcional está integrada e ativa em produção. Nesta rodada foram fechados o contato duplicado, a identidade dos destinatários das imagens de erro, o limite de upload de mídia, o upload retomável de vídeo e a reconciliação MFIT atualizada em 2026-08-27. A fila não está integralmente encerrada: OAuth real de Strava/Polar, oito planos MFIT sem identidade confiável, três cadastros sem telefone e a gravação da biblioteca própria ainda dependem de gates externos ou de novos dados.

## Lista acumulada

| Pedido | Estado real | Evidência e próximo passo |
|---|---|---|
| Estética, índice e cabeçalho do app do aluno | ✅ Produção | Ordem Treino, Corrida, Ciclismo, Natação, Dicas nutricionais, Estatísticas, Calendário e Integrações; Histórico removido do índice; Avisos/Sair compactos. |
| RIR em linguagem compreensível | ✅ Produção | Superfícies e PDFs do aluno usam explicação leiga; Studio técnico preservado. |
| Benito sem círculo, maior/nítido e drag estável | ✅ Produção | Estado do drag persiste, respeita viewport/safe-area e cobre cancelamento/perda de ponteiro. A regressão de redimensionamento durante a animação foi corrigida pelo transform efetivamente renderizado; gate Playwright 2/2 do Benito e 4/4 do fluxo móvel. |
| Ranking, emojis e design compacto | ✅ Produção | Ranking restaurado e layout compacto publicado. |
| Check do treino não sumir nem trocar A/B | ✅ Produção | Seleção e progresso sobrevivem collapse, avanço e reload; contratos de concorrência e idempotência verdes. |
| Preparar-se para o treino com vídeos corretos do aquecimento | ✅ Produção | Checklist resolve apenas exercícios permitidos do aquecimento e não reutiliza o primeiro circuito. |
| Circuitos, bi-sets e demais métodos em menu suspenso | ✅ Produção | Grupos reconhecidos usam accordion acessível e preservam estado dos cards. |
| Anamnese e novo pré-cadastro integrados | ✅ Produção | Rotas públicas ativas, grade semanal com dias fixos e resolutor do Studio atualizado. Link: `https://www.settapp.com.br/cadastro/bn-performance-training`. |
| Corrida, ciclismo e natação editáveis após prescrição | ✅ Produção | Editor autenticado e Edge `update-running-plan-draft` ativa. |
| Motor usar biblioteca, reduzir repetição e aplicar metodologias | ✅ Produção | Biblioteca-only, aliases auditados, métodos avançados e bloqueios por nível/dor/deload testados; Edge `ai-prescribe-workout` ativa. |
| Tipos de série W/N/F e remoção do drop duplicado | ✅ Produção | Tipos e métodos persistidos pelo motor; drop continua apenas no mecanismo técnico próprio. |
| Observações e mudança a cada duas semanas | ✅ Produção | Blocos 1–2, 3–4 e 5–6 e progressão longitudinal chegam ao plano sem ultrapassar caps. |
| Vídeos próprios gravados já no app | ✅ Produção, lote atual | 51 exercícios têm `video_path` próprio. Os 54 objetos na triagem são 51 códigos já publicados mais 3 takes duplicados; não existe gravação nova pendente nesse lote. |
| Biblioteca própria completa | ❌ (aguardando) | 875 itens do roteiro ainda não têm vídeo próprio. Próximo passo: continuar gravação e ingestão por lotes com dry-run e QA. |
| Migração MFIT dos alunos ativos | ✅ Produção, recorte com identidade confirmada | 87 planos elegíveis tratados; lote de importação: 3 planos, 9 treinos, 66 ocorrências e 3 exercícios exatos. A captura autenticada de 2026-08-27 auditou 264 clientes ativos e, no recorte seguro de 42 clientes, 87 planos e 308 sessões. Cinco mudanças de carga em dois treinos foram aplicadas por compare-and-swap e verificadas por dois pós-audits; 0 mudança inesperada. |
| MFIT sem identidade confiável | ❌ (bloqueado) | Oito planos de dois clientes só casam por nome; o MFIT não possui e-mail nem WhatsApp nesses cadastros. Outros 192 planos pertencem a pessoas sem correspondência no recorte ativo do SETT. Próximo passo: obter evidência independente de identidade e vínculo ativo antes de qualquer aplicação. |
| Contato duplicado e feedback de treino | ✅ Produção | Conversa duplicada consolidada preservando 223 mensagens; RPC de reparo foi removida após uso. Hoje existem 0 alunos com múltiplas conversas vinculadas. |
| Erro de destinatário internacional da imagem anterior | ✅ Produção | Causa: número `+1` tratado como brasileiro. Normalizador internacional publicado; cadastro alinhado após backup e 27 mensagens recebidas do provedor como evidência; nenhuma mensagem foi enviada no reparo. |
| Erro “destinatário salvo diverge do telefone” da captura mais recente | ✅ Produção, verificação sem envio | A captura é anterior ao deploy atual. Hoje o cadastro e a única conversa vinculada normalizam para o mesmo telefone; o resolvedor de produção retorna `ok`, com 45 mensagens e 44 registros do provedor como trilha independente. A revisão assistida continua fail-closed quando houver divergência real. Nenhuma mensagem foi enviada no teste. |
| Follow-up de clientes antigos | ✅ Infraestrutura; ❌ canário externo (bloqueado) | Instância conectada; 51/54 conversas vinculadas passam a verificação; 3 alunos não têm telefone. Próximo passo: preencher esses três cadastros e autorizar um destinatário interno para canário real. |
| Erro de upload e vídeos longos | ✅ Produção; ❌ entrega real (bloqueado) | A captura é anterior ao deploy atual. Bucket privado em 512 MB, TUS retomável em blocos de 6 MB e vídeo acima de 64 MB enviado como documento. Canário de 7 MB armazenou, conferiu tamanho e foi apagado; cinco testes de política/upload estão verdes. Envio real depende de destinatário autorizado. |
| Desempenho aluno/professor | ✅ Produção e amostra autenticada; ❌ p75 de campo (aguardando) | O detalhe do aluno levava 2,44–3,12 s antes da correção. Em produção, aluno/matrícula iniciam juntos, o cabeçalho aparece antes dos ciclos e o enriquecimento opcional de vídeos não bloqueia a ficha. Depois do deploy, três cargas aquecidas mostraram o cabeçalho em 677–827 ms e o treino completo em 960–1.148 ms; a carga fria ficou em 2.671/2.916 ms. No painel de conversas do treinador, três cargas autenticadas ficaram em 1.292–1.728 ms. A troca rápida de aluno invalida requisições antigas e nunca mistura fichas. Próximo passo: coletar p75 real de uso, sem bloquear a correção já publicada. |
| Strava e Polar | ❌ (bloqueado) | OAuth, criptografia, leases, refresh, revoke e disconnect estão no código/Edge, mas não há secrets ativos. As credenciais mostradas em imagem ficaram expostas e devem ser rotacionadas antes de configuração e E2E. |

## Estágios

| Camada | Estado |
|---|---|
| Local | Suíte completa: 97 arquivos e 655 testes; TypeScript, lint, build e gate de bundle aprovados. |
| Último commit de código | `462cb83` (`perf(student): render workout shell early`), após `e75a645` (`fix(student): reduce workout load waterfall`). |
| Integração | Branch de release, sua branch remota e `origin/main` alinhadas em `462cb83`. |
| Frontend produção | Deploy Netlify `6a908510ff0f78e3ec05327f` pronto e publicado; `www.settapp.com.br` serve `assets/index-DyFYtT_l.js`. |
| Edge produção | `whatsapp-manager` v61, `whatsapp-webhook` v55, `process-automation-sessions` v31 e `student-workout-feedback` v37 ativas com identidade internacional. |
| Banco produção | Limite de mídia 512 MB; reparos de conversa e cadastro aplicados com backup e auditoria; migrações alinhadas até `20260827133000`. |

## O que não fazer

- Não importar os oito planos MFIT por nome apenas.
- Não reutilizar os secrets de Strava/Polar expostos nas capturas.
- Não chamar upload em Storage de prova de entrega no WhatsApp; o canário do provedor precisa de destinatário autorizado.
- Não apagar os originais da triagem privada antes de uma política explícita de retenção/rollback.
