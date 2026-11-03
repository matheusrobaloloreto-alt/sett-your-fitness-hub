# SETT — Plano de ação das correções confirmadas e do seletor de exercícios

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os problemas sustentados pela auditoria de 03/11 e a seleção/reprodução de exercícios identificada na aba do navegador interno, preservando acesso, prescrições, histórico, comunicação e financeiro.

**Architecture:** Mudanças pequenas por domínio, reutilizando as regras e helpers existentes. Primeiro corrigir apresentação, controle de estado e escolha de mídia sem mudar os contratos de salvamento; mudanças de banco ou conciliação de registros entram em etapas separadas, somente quando a evidência exigir.

**Tech Stack:** React 18, TypeScript, Vite, React Router, TanStack Query, componentes Radix/shadcn, Supabase Auth/Postgres/Storage/Edge Functions e Netlify/PWA.

**Spec:** `/Users/macbookpro/Documents/Codex/2026-11-03/sett-audit/RELATORIO-VALIDACAO-35-APONTAMENTOS.md`; esclarecimento do usuário nesta conversa sobre o seletor e a janela VÍDEO. Os relatórios de 29/10 são contexto de regressão, não o bug indicado na aba interna.

**Data e estágio:** 03/11/2026. Documento de planejamento local. Nenhuma correção deste plano foi implementada, testada como candidata, commitada ou publicada nesta rodada.

## Resumo executivo

A primeira entrega será o seletor/player: hoje é possível assistir sem adicionar e, em um estado inválido de aba, receber confirmação sem alteração. Em seguida virão escopo de empresa, falsos vazios, apresentação de planos, análise de treino e carregamento financeiro. Titularidade, avaliações e polimento serão lotes separados.

Não é honesto garantir risco zero. A proteção consiste em reproduzir o problema, limitar a alteração, testar o caminho corrigido e os caminhos vizinhos, revisar independentemente e publicar somente o candidato validado. Uma falha em um lote não autoriza contornar validações nem impede avançar nos lotes independentes. Uma falha de isolamento de empresa, perda de dados ou destinatário incorreto bloqueia a publicação afetada.

## Global Constraints

- Workspace de referência: `/Users/macbookpro/Documents/Codex/2026-10-30/sett-joint-fix`; HEAD documental observado `d85e551`, fonte publicada `129059f`. Reconfirmar ambos antes da execução; não trabalhar sobre um HEAD presumido.
- Preservar WIP já existente, especialmente QA e checkouts antigos compartilhados. Um executor por arquivo; integrações serializadas. Não criar novos chats de usuário nem novas infraestruturas para este trabalho.
- Manter matrículas. Não renovar contratos, renumerar ciclos, reativar `superseded`, copiar treinos para novos períodos nem alterar datas para resolver uma inconsistência visual.
- Preservar a configuração por empresa de treino vencido: manter até o próximo ou ocultar ao vencer. Prescrições antigas continuam no modelo antigo; mudanças de métricas semanais não são retroativas. Manter a compatibilidade do backend: preferência de vencimento em coluna dedicada, sem inserir chave desconhecida no JSON legado de configurações.
- Preservar salvamento atômico, versões antigas, exportação individual/plano completo, adicionar/substituir biblioteca, séries extras, cargas, sessão aberta e controle de concorrência.
- Não remover validação de contato, autorização por tenant nem suspensão de reenvio incerto. Não gerar/resetar senhas ao simplesmente abrir ou copiar acesso.
- Não alterar classificação/valores de pagamento, regras de assinatura, cron, instância WhatsApp, credenciais ou consentimentos para limpar uma tela.
- Sem upgrade de dependências ou refatoração ampla. Testes novos devem verificar comportamentos relevantes; correção puramente textual não exige teste que apenas repita uma string.
- Esta solicitação autoriza elaborar o plano. Implementação e publicação são etapas futuras; não executar reparos de dados ou deploy a partir deste documento sozinho.

## Review Focus

1. Troca de empresa/aluno enquanto uma resposta antiga ainda está chegando: nenhum dado da seleção anterior pode preencher a atual.
2. Troca/remoção de treino durante seleção ou vídeo: adicionar sempre ao destino exibido e válido, sem alterar A ao escolher B.
3. Offline, permissão negada e erro de provedor: preservar rascunho/sessão e apresentar indisponibilidade, nunca sucesso ou zero confiável.
4. Treino legado, histórico substituído e política de vencimento: consulta e edição não podem mudar visibilidade, IDs, fases ou datas silenciosamente.
5. Repetição/concorrência: clique duplo, StrictMode, reload e tentativa repetida não podem duplicar exercícios, cobranças, envios ou reparos.

---

## Fase 0 — Preparar uma base verificável

**Responsáveis:** ATENA integra; executor por domínio; QA independente revisa o diff e reexecuta verificações. Nenhum QA aprova a própria implementação.

- [ ] Revalidar branch, HEAD, WIP, HTML/assets publicados, backend canônico e migrações já aplicadas; registrar fonte e horário das evidências.
- [ ] Registrar baseline de TypeScript, lint, testes por domínio e build. Separar falhas preexistentes de regressões sem apagar testes ou aumentar timeouts indiscriminadamente.
- [ ] Reproduzir cada defeito operacional em fixture sintética na versão atual. Falha não reproduzida fica como investigação, não reparo de dados por suposição.
- [ ] Guardar evidências sem tokens, senhas, conversas ou dados clínicos de alunos. Fixtures devem usar identidades sintéticas.

**Aceite:** um único candidato e lista de arquivos de cada lote; verificações reproduzíveis; divergências preexistentes documentadas. Browser indisponível bloqueia o gate de UI, mas não o diagnóstico e os testes locais dos outros lotes.

## Fase 1 — Seletor de exercícios e reprodução de vídeo (prioridade alta)

### Tarefa 1.1 — Separar ações e garantir o destino da adição

**Evidências atuais:** `src/pages/admin/WorkoutBuilder.tsx:958–986,1508–1509,2817–2859`. O cartão adiciona; o play aninhado intercepta o clique. `currentWorkout` pode mostrar o primeiro treino enquanto a mutação usa um índice inválido e o toast é emitido incondicionalmente. Isso é distinto de falha de salvamento remoto. O vídeo fornecido pelo usuário não foi reproduzido por esta rodada; o caminho de código foi conferido.

**Arquivos:** modificar `src/pages/admin/WorkoutBuilder.tsx`; criar `src/lib/workoutSelection.ts`, `src/lib/workoutSelection.test.ts` e `src/pages/admin/WorkoutBuilder.selection.test.tsx`; manter `WorkoutBuilderRecovery.test.tsx` como regressão.

**Interface proposta:** `resolveWorkoutTarget(workouts: ReadonlyArray<{ clientKey: string }>, activeKey: string): { key: string; index: number } | null`. Cada treino terá identidade estável de UI: ID persistido quando existir, UUID de rascunho criado uma única vez quando novo. A chave acompanha edição/reordenação e não é recalculada por índice/render. Usar a mesma resolução de identidade para leitura, abas e mutação. Se a chave sumir, solicitar seleção; não trocar silenciosamente para A. A chave é somente de UI e deve ser removida/excluída explicitamente da serialização de banco e biblioteca, com teste de payload.

- [ ] Reproduzir em teste: aba inválida, play, duplo clique e troca A/B; demonstrar a falha antes da correção.
- [ ] Substituir ação aninhada por dois botões irmãos reais e acessíveis: “Adicionar ao treino” e “Assistir”. Assistir não altera exercícios; adicionar não abre player nem salva remotamente.
- [ ] Aplicar validação de identidade ao estado atual no momento da adição, não apenas de faixa numérica. Abrir em B e remover/reordenar A deve continuar em B ou bloquear explicitamente, nunca atingir outro treino por mudança de índice. Desabilitar ação sem destino válido e durante save; impedir duplicidade por ID dentro do treino conforme a regra já usada pelo seletor, sem remover exercícios legados repetidos.
- [ ] Emitir confirmação, badge e contador somente quando o exercício constar no destino confirmado. Não disparar efeitos/toasts dentro de updater de estado sujeito a reexecução do StrictMode.
- [ ] Testar ausência de destino, A/B/C, remover aba, repetição rápida e alteração da biblioteca sem perda de rascunho.

**Aceite:** clicar Assistir mantém a contagem; Adicionar aumenta exatamente um no treino selecionado; erro não gera toast de sucesso; treinos vizinhos permanecem idênticos.

### Tarefa 1.2 — Selecionar player adequado e nunca mostrar apenas modal vazio

**Evidências atuais:** `WorkoutBuilder.tsx:1475–1506,2933–2963`: caminho Storage usa video; URLs genéricas vão para iframe; não há tratamento completo de erro. Há helper/player no aluno (`src/lib/exerciseVideoPlayer.ts`, `src/components/student/ExerciseVideoPlayer.tsx`), mas reutilizá-lo sem revisão não resolve todos os erros e pode mudar o aluno desnecessariamente.

**Arquivos:** criar `src/lib/exerciseMediaSource.ts`, `src/lib/exerciseMediaSource.test.ts`, `src/components/admin/ExercisePreviewPlayer.tsx` e seu teste; adaptar somente o preview do WorkoutBuilder inicialmente. Reutilizar helpers seguros existentes; não substituir todos os players do app de uma vez.

**Interface proposta:** `classifyExerciseMediaUrl(value: string): { kind: 'youtube' | 'vimeo' | 'direct'; src: string } | { kind: 'external' | 'unavailable'; src?: string }`. Classificar hostname real de YouTube/Vimeo e tipo conhecido de arquivo/MIME quando disponível; não usar substring de host nem confiar apenas no campo de origem. URL sem classificação confiável oferece link externo validado, não iframe arbitrário.

- [ ] Cobrir MP4/WebM direto, URL com query assinada, YouTube watch/shorts/youtu.be, Vimeo, Storage público/privado, campo vazio e protocolo inválido.
- [ ] Preservar preferência da demonstração própria e coerência com a capa; ID do YouTube fica como fallback quando não existe mídia própria escolhida.
- [ ] Resolver Storage com as permissões existentes: se privado, URL assinada autorizada e temporária; nunca tornar bucket/objeto público. Não registrar URLs assinadas em logs públicos.
- [ ] Aceitar HTTPS nas fontes de produção; rejeitar javascript/data/file e downgrade HTTP. Blob temporário só se criado pelo próprio app para uma prévia autorizada, com ciclo de vida controlado. Validar hostname real e origem/contexto do objeto antes de resolver Storage; conhecer um path não concede acesso. Assinatura não vai para payload de treino, banco ou cache compartilhado; revalidar empresa/usuário ao concluir resolução.
- [ ] Usar video para arquivo direto; iframe somente para embed de fornecedor reconhecido. Oferecer loading, erro, tentar novamente e abrir origem segura externamente com `noopener noreferrer`.
- [ ] Tratar `onError` de mídia nativa. Para iframe cross-origin, não declarar reprodução confirmada pelo simples `load`; manter alternativa externa visível e, se necessário, usar evento suportado pelo fornecedor.
- [ ] Após 10 segundos sem sinal útil de prontidão, encerrar o spinner exclusivo e mostrar “A demonstração está demorando para carregar”, com alternativa externa e retry manual; isso não afirma falha definitiva nem reprodução. Limpar timers ao fechar/trocar e aceitar resposta tardia somente da geração/exercício atual. Testar ausência de eventos e chegada tardia. Preview não deve alterar a ficha, salvar ou começar busca/geração paga automaticamente.

**Aceite:** fonte compatível abre no elemento adequado; fonte inválida/inacessível tem mensagem útil; nenhuma falha de vídeo impede adicionar um exercício válido. Teclado e toque acionam os mesmos botões.

### Tarefa 1.3 — Validar a prescrição inteira após a mudança local

- [ ] Em staging sintético, adicionar exercícios diferentes em A/B/C, assistir, fechar biblioteca, editar métricas, salvar e reabrir.
- [ ] Conferir persistência por readback: IDs, ordem, quantidades, séries, repetição, descanso, notas, cadência e semanas iguais ao rascunho confirmado.
- [ ] Repetir com prescrição antiga e nova; biblioteca adicionar/substituir, exportação individual/plano completo e conflito de versão.
- [ ] Simular falha no save: rascunho preservado, sem sucesso prematuro nem duplicação no retry.

**Aceite:** a correção de interação não muda o protocolo de salvamento. Nenhum envio, cobrança ou treino de aluno real é necessário para este teste.

## Fase 2 — Escopo de empresa e listas confiáveis

### Tarefa 2.1 — Corrigir escopo do coordenador e explicitar denominadores (item 12)

**Arquivos:** `src/pages/coordinator/CoordinatorDashboard.tsx`, `src/pages/admin/AdminDashboard.tsx`; criar teste de escopo do coordenador. Usar contexto de empresa já adotado por `StudentsManager`/`Portfolio`, sem criar nova camada de permissão.

- [ ] Testar master no contexto BN com um aluno de outra empresa; tela não mistura a outra empresa. Testar coordenador comum e ausência de empresa.
- [ ] Aplicar filtro explícito de empresa a alunos, planos e diretório necessários; habilitar leitura somente após contexto validado; descartar respostas antigas na troca.
- [ ] Rotular os contadores com sua população. Manter distinção entre alunos, interessados, leads não convertidos, colaboradores e papel trainer; não somar essas populações como se fossem iguais.

**Aceite:** empresa A não recebe dados de B; 77/73 pode continuar existindo com explicação correta; 4 colaboradores e 2 trainers não são artificialmente igualados. RLS continua intacta.

### Tarefa 2.2 — Carteira e Equipe: distinguir vazio, carga e falha (itens 2/3)

**Arquivos:** `src/pages/admin/Portfolio.tsx`, `src/pages/admin/TeamManager.tsx`; novos testes de carga/escopo dessas telas.

- [ ] Reproduzir falha de consulta, empresa não selecionada e resposta demorada; nenhum deles mostra zero ou “Nenhum membro” como resultado final confiável.
- [ ] Liberar lista base de colaboradores antes do enriquecimento opcional de conta/e-mail; se o enriquecimento falhar, não inferir conta bloqueada/inexistente.
- [ ] Mostrar erro recuperável e seleção de professor explícita na Carteira; conservar barreira de escopo e descarte de resposta atrasada.

**Aceite:** “Todos” da BN não permanece zero após sucesso com registros; erro não causa reimportação/duplicação de alunos; professor sem carteira pode ter zero legítimo.

## Fase 3 — Planos, treino e registros do aluno

### Tarefa 3.1 — Plano escolhido versus contrato vigente (item 4)

**Arquivos:** `src/pages/admin/StudentsManager.tsx`; testes de gestão de alunos. Reutilizar o seletor canônico de matrícula existente, depois de testar suas regras; não escolher arbitrariamente a primeira linha do banco.

- [ ] Fixture Aldylayne: selecionado Influenciador(a), matrícula semestral ativa; fixture ALEX: anual concluída e semestral ativa.
- [ ] Apresentar “Plano escolhido no cadastro” no controle existente e “Plano contratado vigente” no badge. Se for necessário alterar contrato, conduzir ao fluxo explícito de matrícula; não alterar o contrato ao editar intenção de cadastro.
- [ ] Cobrir matrícula ausente, futura, concluída e múltiplos históricos sem sobrescrever dados para alinhar textos.

**Aceite:** dois valores diferentes têm significado claro e fonte identificável; editar o cadastro não cria/cancela/renova matrícula ou cobrança.

### Tarefa 3.2 — Análise de treino coerente (item 5)

**Arquivos:** `src/components/trainer/WorkoutAnalysis.tsx`, testes novos do componente; helpers atuais `volumeStats`, `workoutVolume`, `prescriptionSchedule` apenas se necessários e cobertos por regressão.

- [ ] Reproduzir sessão concluída com volume, sem logs musculares, sessão sem carga e troca de aluno/período sem resultado.
- [ ] Usar a mesma janela temporal declarada para resumos e distribuição. Logs de sessão histórica não são descartados apenas porque o treino atual foi substituído; manter origem e janela explícitas. Atribuir cada log ao exercício da versão/snapshot executado, nunca ao array atual usando apenas `exercise_index`. Se não houver correspondência histórica confiável, preservar o resumo e sinalizar distribuição indisponível em vez de inventar vínculo.
- [ ] Separar métricas: “Conclusão das sessões iniciadas” não deve se chamar adesão à frequência prescrita. Calcular adesão à meta somente se denominador confiável estiver disponível; sem meta, mostrar ausência de informação.
- [ ] Redefinir todos os estados juntos em vazio/erro/troca; não conservar tonelagem do aluno anterior. Usar mensagem “Sem dados para distribuição muscular” quando há resumo de sessões sem esse detalhamento.

**Aceite:** 100% de conclusão pode coexistir com zero de carga externa sem alegar perda; sessão com volume não recebe mensagem global de ausência de treino. Não regravar logs nem pontos para corrigir apresentação.

### Tarefa 3.3 — Ciclos, avaliações e motivos de bloqueio (itens 13/14/15/33)

**Arquivos:** `src/pages/admin/StudentDetail.tsx`, `src/components/admin/ManualPrescriptionPanel.tsx`; testes de seleção de matrícula e abas do aluno. Conferir caminho exato do painel antes de editar.

- [ ] Mostrar estados explícitos de ciclo: concluído, ativo, pendente/futuro, substituído/histórico; datas passadas não viram “Futuro” por fallback de texto.
- [ ] Manter ordem cronológica e número legado; não renumerar C18 como C5 nem modificar fase do motor.
- [ ] Mostrar registros de `student_evaluations`, `functional_assessments` e arquivos com origem/tipo/data distintos. Não fabricar avaliação clínica pelo nome de PDF nem converter anexo automaticamente em achado estruturado.
- [ ] Explicar falta de matrícula elegível separadamente de ausência de histórico. Preservar consulta a treino antigo e política configurável de vencimento; não reativar contrato expirado.
- [ ] Para Acesso, Financeiro, Linha do tempo e Dados pessoais, reproduzir o relato antes de mudar componentes. Explicar se recolhido, carregando, sem registros ou erro; não preencher cartões com valores inventados.

**Aceite:** histórico continua acessível; nenhuma alteração em matrículas, vigências, treinos ou avaliações clínicas apenas para corrigir a tela.

## Fase 4 — Financeiro sem bloquear toda a tela

### Tarefa 4.1 — Independência das leituras e conceitos claros (itens 1/11)

**Arquivos:** `src/pages/admin/FinancialDashboard.tsx`, `FinancialDashboard.test.tsx`, `src/lib/financialProjection.ts` e testes existentes se a apresentação precisar de ajuste. Backend `asaas-integration` fica fora do primeiro patch.

- [ ] Teste com consulta local concluída e snapshot externo ainda pendente: dados locais identificados como locais aparecem; indicadores que dependem de conciliação ficam carregando/parciais, nunca completos por engano.
- [ ] Separar estados local/projeção por empresa; cancelar ou ignorar respostas atrasadas; preservar dados coerentes somente dentro da mesma empresa.
- [ ] Nomear vencimento, criação, confirmação, recebimento e previsão conforme a origem real. Na projeção, `creditDate || clientPaymentDate || paymentDate` não significa sempre liquidação bancária: manter proveniência e qualificação do fallback ou ausência. Não inferir recebimento pela data de vencimento nem marcar confirmado como atrasado só por `paid_at` ausente. Dado local anterior à atualização fica marcado como pendente/desatualizado se houver espera ou erro.
- [ ] Conferir cálculo e atualização de faturamento sem somar parcela duas vezes. “Linha somente no provedor” permanece indicada até reconciliação real.

**Aceite:** orçamento de 25s externo não bloqueia a primeira apresentação local; nenhum valor incompleto é mostrado como consolidado; filtros/totalizadores permanecem coerentes com a fonte.

### Tarefa 4.2 — Conciliação pontual, se necessária, em lote separado

- [ ] Comparar amostras locais com endpoints de leitura do Asaas, sem chamar ações de sync que gravam implicitamente; registrar IDs privados, estado e timestamps sem credenciais.
- [ ] Só propor materialização/reparo se a diferença for comprovada. Exigir chave externa única/idempotência, prévia das linhas afetadas, backup, transação e readback.
- [ ] Cache ou concorrência limitada no backend somente se a medição indicar necessidade após a tarefa 4.1; testar limite do provedor e validade do snapshot.

**Aceite:** zero cobrança criada, cancelada ou reenviada para fins de teste; parcelas futuras não são alteradas por parecerem estranhas. Esta etapa não certifica dívida real usando apenas o snapshot local.

## Fase 5 — Governança e comunicação sem relaxar proteção

### Tarefa 5.1 — Titularidade e identificação humana (itens 6/7)

**Arquivos:** `src/pages/admin/CompanyGovernance.tsx`, `src/lib/companyGovernance.ts`, testes UI/SQL; migração nova apenas se indispensável, criada via CLI e revisada contra função viva.

- [ ] Conferir `owner_id` versus `owner_user_id`, vínculo da conta, regras de transferência e demais consumidores. Não usar fallback de exibição como autorização.
- [ ] Preparar inicialização restrita somente para empresa sem titular canônico, com identidade efetivamente confirmada; divergência entre titulares exige resolução explícita. Não promover automaticamente todos os admins.
- [ ] Manter autorização, comparação de versão, transação e auditoria. Nomes substituem UUIDs visíveis sem mudar os valores internos.

**Aceite:** titular correto aparece, e usuário de outra empresa não transfere ou reivindica propriedade. Se a identidade não estiver confirmada, mostrar titularidade pendente e seguir os outros lotes, sem inventar dono.

### Tarefa 5.2 — Alertas e feedbacks corretamente contextualizados (itens 9/10/31/34)

**Arquivos:** `src/pages/admin/WhatsAppAutomation.tsx`, seus testes; `PendingFeedbackCard.tsx`, `StudentWorkoutFeedbackCard.tsx` e `CompanyOperatorConsole.tsx` somente conforme reprodução.

- [ ] Não mostrar “resultado de envio incerto” antes de leitura bem-sucedida com ocorrências. Diferenciar carregamento, falha de inspeção, zero ocorrências e caso incerto real; zero não significa entrega comprovada de todas as mensagens.
- [ ] Preservar suspensão/revisão de envios incertos. Não testar por reenvio a alunos e não automatizar retry de uma mensagem cujo resultado é desconhecido.
- [ ] Confirmar bloco/modo do feedback: o de ciclo já tem Revisado fora do modo read-only. Não apagar feedbacks de Júlia/ALEX; dar contexto de data/sessão.
- [ ] Se a dispensa realmente faltar no fluxo operacional de treino, definir resolução auditável separada de resposta; só então criar campo/RPC com autorização e CAS. Não marcar respondido sem resposta.
- [ ] Identificar Switch como acesso temporário ao diagnóstico, com estado/validade legíveis. Não ativar acesso para preencher visualmente a célula.

**Aceite:** ausência de alerta decorre de leitura confirmada; fluxo ativo e entrega individual têm estados distintos; feedbacks legítimos e permissões permanecem preservados.

## Fase 6 — Usabilidade e apresentação, em pequenos patches

### Tarefa 6.1 — Navegação, busca e sobreposição (itens 8/18/25/26/27/28)

**Arquivos:** `StudentDetail.tsx`, `StudentsManager.tsx`, `Portfolio.tsx`, `InstallPrompt.tsx`, `WhatsAppChatPanel.tsx`, `ExerciseLibrary.tsx`, `NotFound.tsx`, `SettingsWorkspaceLinks.tsx`. Dividir por arquivo/owner; não editar StudentDetail em paralelo à fase 3.

- [ ] Sincronizar aba do aluno com query string/histórico, mantendo parâmetros e rascunho; testar link direto, Voltar e Avançar.
- [ ] Adicionar `src/lib/normalizeSearchText.ts` com `normalizeSearchText(value: string): string` para trim/lowercase/NFD/remoção de diacríticos; aplicar ao texto buscado e à consulta, preservando nomes exibidos. Testar “mária”/“maria”, “Taís”/“Tais”.
- [ ] Reproduzir sobreposição com banner e Conversas em 360px, 390px, tablet/desktop e safe area. Reservar espaço/deslocamento coordenado, sem apenas elevar z-index.
- [ ] Nomear ações de ícone por contexto e permitir teclado. Abertura geral de detalhes do cartão não entra como nova funcionalidade sem necessidade demonstrada.
- [ ] Explicitar links “Abrir Administração/Operação/Diagnóstico” e retorno. Em rota pública desconhecida, “Ir para início”; manter fallback SPA e links internos. HTTP 404 no host é decisão separada, não requisito deste lote.

**Aceite:** nenhum clique bloqueado no cenário reproduzido, navegação mantém contexto, busca consistente e ações acessíveis. Rota inválida não autoriza acesso nem revela dados.

### Tarefa 6.2 — Loading, rótulos e português (itens 16/17/20/21/22/23/24/29/30/32)

**Arquivos:** `MasterDashboard.tsx`, `PlatformProductSettings.tsx`, `CompanyAdmissionPolicy.tsx`, `FormDefinitionManager.tsx`, `OperationsDesigner.tsx`, `components/admin/operations/AgendaAvailabilityLayer.tsx`, `BnContentStudioCalendar.tsx`, `BnContentStudioArchive.tsx`, taxonomia de apresentação e contadores tocados.

- [ ] Mostrar loading/erro em vez de zero provisório no master/acervo. Acervo continua indicando carregamento; títulos iguais não são deduplicados sem comparar IDs/conteúdo.
- [ ] Mostrar nomes configurados de planos, rótulos de etapas/layouts e datas pt-BR; armazenar ISO/códigos como antes. Data civil não deve passar por conversão que mude o dia.
- [ ] Corrigir acentos e “Pesos livres” só na apresentação; preservar aliases/slugs e mensagens já personalizadas pela empresa.
- [ ] Aplicar pluralização e decimais por contexto; não arredondar contribuição muscular fracionada como se fosse série prescrita.
- [ ] Rotular contador de Performance como carteira total ou filtrar ativos conscientemente; hoje a coleção não filtra status. Separar alunos atribuídos de entregas.
- [ ] Explicar limite legado sem mudar assinatura, plano comercial ou direitos de empresa preservada.

**Aceite:** apresentação clara, valores e IDs de negócio inalterados. Testes de cálculo somente onde mudar cálculo; revisão visual para copy e rótulos, sem suíte que espelhe cada string.

## Itens condicionais que não viram reparos automáticos

| Apontamento | Decisão neste plano |
|---|---|
| 2/3/8/33: episódio visual não reproduzido | Corrigir tratamento demonstrado por código; reproduzir o cenário específico antes de atribuir causa definitiva. |
| 10: feedbacks supostamente duplicados | Preservar: sessões distintas comprovadas. |
| 11: confirmado com vencimento futuro | Preservar regra; conciliar conceitos/dados com provedor antes de qualquer escrita. |
| 12: todos os contadores devem coincidir | Não forçar igualdade entre populações distintas; corrigir escopo e rótulo. |
| 15: inativo com renovação histórica | Não reativar automaticamente; explicar estados e bloqueios. |
| 18: abrir detalhe geral do cartão | Melhoria opcional, não ação quebrada comprovada; fora do lote mínimo. |
| 19: global sem vídeo | Todos os globais tinham referência na consulta de 03/11; testar playback e resolver o player da fase 1 antes de preencher catálogo em massa. |
| 20: assinatura legada | Alterar apenas texto; revisão financeira comercial continua adiada por decisão anterior. |
| 24: títulos repetidos | Comparar IDs/conteúdo antes de declarar duplicidade; não excluir posts. |
| 25: SPA devolve 200 | Manter funcionamento de deep links; mudança no host só se houver requisito definido e teste de rotas públicas/privadas. |
| 26: links de Configurações mudam rota | Preservar desenho; melhorar orientação e retorno. |
| 31: Acesso aparentemente vazio | Switch existe; verificar contraste/estado sem conceder permissões. |
| 34: envio incerto | Preservar fail-closed anti-duplicidade; corrigir aviso prematuro, não liberar reenvio. |
| 35: slug na rota individual de anamnese | Procurar origem no app. Se não houver gerador incorreto, nenhuma mudança de acesso; não aceitar slug como autorização de anamnese pessoal. |

## Matriz de regressão por impacto e integração final

Cada lote executa as linhas que seu diff afeta e as invariantes de autorização/persistência pertinentes. A matriz transversal completa é gate do candidato integrado ao final, não requisito repetido para cada acento ou rótulo. Um bloqueio externo só impede os lotes dependentes dele.

| Área protegida | Cenários | Evidência exigida |
|---|---|---|
| Prescrição | Legado e semanal novo; A/B/C; copiar semanas; séries/cadência; biblioteca adicionar/substituir; exportar individual/plano; versões antigas | Testes existentes + staging salvar/reabrir e comparar conteúdo/IDs; nenhum contrato ou log alterado. |
| Portal do aluno | Treino vigente, antigo mantido, vencido oculto, próximo vazio, futuro, substituído, matrícula expirada, sessão já aberta | Ambas as preferências por empresa respeitadas; sem ressurreição de ciclo nem novo bloqueio de sessão permitida. |
| Sessões/cargas | Concluir, extras, reload, offline, retry, conflito, abandono | Logs e retomada preservados; sem duplicação ou sucesso antes de ACK. Correção de análise não regrava execução. |
| Auth e tenant | Admin, trainer, coordinator, master com empresa A/B, student, anônimo; troca durante request | Leitura/escrita conforme direitos existentes; nenhum cruzamento ou ampliação de permissão. |
| Contatos/login | Ambiguidade real, contato confirmado, chat divergente, rascunho vencido, aluno trocado | Proteções atuais continuam; abrir/copiar não gera senha nem envia mensagem. |
| WhatsApp | Assinatura on/off, templates multimídia, sequência, resposta/rascunho, resultado incerto | Não mudar instância/conexão; sem envio real no teste geral; teste controlado externo somente com destino e autorização específicos. |
| Financeiro | Local lento/erro; provedor lento/erro; parcelas futuras; estorno; registro só externo; troca empresa | Não criar cobrança; nenhum zero de falha; sem dupla contagem, status ou contrato reescrito. |
| Avaliações/formulários | Manual, funcional, PDF, vazio, erro, formulário customizado | Origem explícita, campos/respostas preservados; nenhuma conclusão clínica inventada. |
| BN Content/Configurações | Acervo e calendário, salvar/reler configuração, links, master exclusivo | Nenhuma mudança de integração, credencial, permissão ou conteúdo por correção de rótulo. |
| PWA/mobile | Versão anterior aberta, cache atualizado, offline, 360/390px, teclado/toque | Shell saudável e atualização coerente; sem apagar armazenamento de sessão/cargas para limpar cache. |

## Comandos e gate técnico

Executar no candidato congelado com ambiente de testes apropriado, nunca copiar credencial privilegiada para `VITE_*`.

1. Foco da fase 1: `npx vitest run src/lib/workoutSelection.test.ts src/lib/exerciseMediaSource.test.ts src/pages/admin/WorkoutBuilder.selection.test.tsx src/components/admin/ExercisePreviewPlayer.test.tsx src/pages/admin/WorkoutBuilderRecovery.test.tsx src/lib/workoutSaveValidation.test.ts src/lib/workoutLibraryRecovery.test.ts`. Os arquivos novos serão criados na implementação.
2. Rodar os testes existentes pertinentes de `prescriptionSchedule`, `workoutLogPersistence`, `financialProjection`, `FinancialDashboard`, `companyGovernance`, `companyGovernanceSql`, `StudentPortal.reads`, `StudentPortal.extraSets`, `useWorkoutSession`, `studentChat` e integrações afetadas; ajustar a lista ao diff real, não excluir testes que falhem.
3. Por lote, testes de impacto e checagens estáticas pertinentes. No candidato integrado: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` e verificador de alvo. Antes de `npm run verify:backend`, inspecionar `scripts/verify-canonical-backend.mjs` e confirmar ausência de ações remotas; o script atual identifica `SETT_DEPLOY_TARGET` (padrão production). Usar `SETT_DEPLOY_TARGET=staging` somente com artefato/ambiente staging, e production somente na inspeção estática do candidato de produção; isso não autoriza chamadas ou escrita em produção. Registrar saída/exit code, baseline e SHA do candidato. Não afirmar suíte verde se um teste só passou isolado após falhar no conjunto.
4. Revisor independente lê diff/integração; outro run reproduz testes essenciais. Falso verde por mock não substitui Auth/Storage/RLS nativos.
5. Staging com duas empresas sintéticas: vídeo, seleção, save/reabertura, permissões e dados financeiros simulados/controlados. Browser funcional é obrigatório para aprovar UI; sem ele, o gate permanece bloqueado.

## Estratégia de publicação e recuperação

- Publicar por lotes aprovados. Não juntar nova migração sensível, reconciliação financeira e player em uma mudança indivisível.
- Antes de release, registrar hash do frontend, backend compatível, migrações, flags/configurações e comportamento observado. Bump do SW somente junto ao artefato aprovado; não editar durante o build.
- Sem migração de banco nas correções de seleção, preview ou copy. Se titularidade/feedback exigir DDL, usar expansão compatível, validar grants/RLS e consumidores antigos antes do frontend; nada de remover coluna/função antiga nesta rodada.
- Reparo de dados, se necessário: prévia de contagem, snapshot restrito, predicado de empresa/ID/versão, número esperado de linhas e readback. Abortar em concorrência ou quantidade inesperada; não executar bulk cego.
- Em regressão, interromper promoção do lote e fazer release corretiva compatível. Preservar código anterior como referência para um novo build corrigido; não executar restore amplo de banco ou deploy antigo que reintroduza falha de segurança.
- Reversão de dados somente das linhas comprovadamente escritas pelo reparo e ainda na versão esperada. Nunca substituir o banco inteiro, apagar logs, reenviar mensagens ou desfazer operações legítimas posteriores.
- Pós-release autorizada: conferir artefatos servidos e versão SW; repetir leituras e os fluxos sintéticos/controlados. HTTP 200 e registro de deploy não bastam. Teste em aluno real não muda ficha, senha ou envio sem escopo explícito.

## Ordem e critérios de parada

1. Fase 0 e fase 1: corrigir seleção/player e comprovar salvar/reabrir.
2. Fase 2 e tarefas 3.1/3.2: escopo, listas, planos e análise; arquivos disjuntos podem avançar em paralelo.
3. Fase 4.1: financeiro local/projeção; conciliação 4.2 só com evidência.
4. Tarefas 3.3 e fase 5: histórico/avaliações/titularidade/comunicação, com integração serializada em StudentDetail.
5. Fase 6 e QA transversal. Pequenos patches visuais podem avançar sem esperar conciliação externa.

Se um provedor, navegador ou dado de titularidade bloquear um item, registrar responsável, motivo e evidência necessária e continuar em outro lote independente. Não declarar conclusão do item bloqueado; não publicar a parte que depende do gate ausente. Não prometer prazo de horas sem reproduções e baseline.

## Checklist acumulado desta entrega

- ✅ Auditoria dos 35 relatos consolidada com distinção de bug, interpretação e lacuna.
- ✅ Bug da aba do navegador interno identificado pelo esclarecimento do usuário e confrontado com o código atual.
- ✅ Plano integrado, escopo por fase, testes, proteção de funções vizinhas e recuperação definidos.
- ❌ Implementação (aguardando): esta entrega é o plano solicitado; próxima etapa é executar fase 0 e fase 1 no candidato isolado.
- ❌ Validação visual ponta a ponta (bloqueado): navegador interno retornou indisponível nesta sessão; restaurar acesso antes do gate visual, sem inventar confirmação.
- ❌ Publicação (aguardando): nenhum candidato implementado/testado nesta rodada; somente após gates e autorização de release aplicável.

Não se acrescentam aqui pendências descartadas anteriormente pelo usuário (treinador na cadência, manual BN/vídeos, Taisa e auditorias genéricas antigas). Os controles de segurança já existentes entram como regressão protegida, não como autorização para refazer todo o produto.

## Revisão independente do plano

Duas revisões independentes cobriram escopo/financeiro e seletor/player. Foram incorporados: destino por identidade estável; limite de espera sem falso diagnóstico de vídeo; correspondência histórica de exercícios; protocolos e autorização de Storage; proveniência de datas financeiras; e gates proporcionais por lote com integração transversal final. Esta aprovação é documental, não resultado de testes da futura implementação.
