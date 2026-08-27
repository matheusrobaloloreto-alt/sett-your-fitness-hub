# SETT/BN — relatório acumulado de execução em 2026-08-27

## Veredito

A maior parte da fila funcional está integrada e ativa em produção. Nesta rodada foram fechados o contato duplicado, o destinatário internacional da imagem de erro, o limite de upload de mídia, o upload retomável de vídeo e a nova reconciliação MFIT. A fila não está integralmente encerrada: OAuth real de Strava/Polar, oito planos MFIT sem identidade confiável, três cadastros sem telefone e a gravação da biblioteca própria ainda dependem de gates externos ou de novos dados.

## Lista acumulada

| Pedido | Estado real | Evidência e próximo passo |
|---|---|---|
| Estética, índice e cabeçalho do app do aluno | ✅ Produção | Ordem Treino, Corrida, Ciclismo, Natação, Dicas nutricionais, Estatísticas, Calendário e Integrações; Histórico removido do índice; Avisos/Sair compactos. |
| RIR em linguagem compreensível | ✅ Produção | Superfícies e PDFs do aluno usam explicação leiga; Studio técnico preservado. |
| Benito sem círculo, maior/nítido e drag estável | ✅ Produção | Estado do drag persiste, respeita viewport/safe-area e cobre cancelamento/perda de ponteiro. Testes de Benito verdes. |
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
| Migração MFIT dos alunos ativos | ✅ Produção, recorte disponível | 87 planos elegíveis tratados; lote novo: 3 planos, 9 treinos, 66 ocorrências e 3 exercícios exatos. Pós-audit global determinístico. |
| MFIT atualizado até o estado de hoje | ❌ (bloqueado) | A captura da origem é de 2026-08-26. Oito planos de dois clientes só casam por nome e não podem ser aplicados com segurança. Próximo passo: nova captura e confirmação de telefone/e-mail. |
| Contato duplicado e feedback de treino | ✅ Produção | Conversa duplicada consolidada preservando 223 mensagens; RPC de reparo foi removida após uso. Hoje existem 0 alunos com múltiplas conversas vinculadas. |
| Erro de destinatário da aluna da imagem 1 | ✅ Produção | Causa: número `+1` tratado como brasileiro. Normalizador internacional publicado; cadastro alinhado após backup e 27 mensagens recebidas do provedor como evidência; nenhuma mensagem foi enviada no reparo. |
| Follow-up de clientes antigos | ✅ Infraestrutura; ❌ canário externo (bloqueado) | Instância conectada; 51/54 conversas vinculadas passam a verificação; 3 alunos não têm telefone. Próximo passo: preencher esses três cadastros e autorizar um destinatário interno para canário real. |
| Erro de upload e vídeos longos | ✅ Produção; ❌ entrega real (bloqueado) | Bucket em 512 MB, TUS retomável acima de 6 MB, vídeo acima de 64 MB vira documento. Canário de 7 MB armazenou, conferiu tamanho e foi apagado. Envio real depende de destinatário autorizado. |
| Desempenho aluno/professor | ✅ Otimizações em produção; ❌ medição autenticada (aguardando) | Sessão e troca de usuário protegidas contra corrida, portal inicial reduzido, anúncios compartilhados e rotas pesadas separadas. Gate: 651 testes, TypeScript, build e limite de bundle aprovados. Próximo passo: medir p75 em sessão real de aluno e treinador. |
| Strava e Polar | ❌ (bloqueado) | OAuth, criptografia, leases, refresh, revoke e disconnect estão no código/Edge, mas não há secrets ativos. As credenciais mostradas em imagem ficaram expostas e devem ser rotacionadas antes de configuração e E2E. |

## Estágios

| Camada | Estado |
|---|---|
| Local | Suíte completa: 97 arquivos e 651 testes; TypeScript, build e gate de bundle aprovados. |
| Último commit de código | `11df2a959a3b19a80869149e8e2b82c0a8f0c5a4`. |
| Integração | Branch de release e `origin/main` alinhados no mesmo commit. |
| Frontend produção | `www.settapp.com.br` serve o bundle com upload retomável, revisão de destinatário e otimizações recentes. |
| Edge produção | `whatsapp-manager` v61, `whatsapp-webhook` v55, `process-automation-sessions` v31 e `student-workout-feedback` v37 ativas com identidade internacional. |
| Banco produção | Limite de mídia 512 MB; reparos de conversa e cadastro aplicados com backup e auditoria; migrações alinhadas até `20260827133000`. |

## O que não fazer

- Não importar os oito planos MFIT por nome apenas.
- Não reutilizar os secrets de Strava/Polar expostos nas capturas.
- Não chamar upload em Storage de prova de entrega no WhatsApp; o canário do provedor precisa de destinatário autorizado.
- Não apagar os originais da triagem privada antes de uma política explícita de retenção/rollback.
