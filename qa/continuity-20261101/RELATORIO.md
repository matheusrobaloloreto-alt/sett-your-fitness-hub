# Continuidade da última prescrição — 01/11/2026

## Regra e resultado implementado localmente

O último treino digital utilizável permanece disponível durante uma lacuna do próximo ciclo, dentro da matrícula elegível. Não há cópia de exercícios, alteração de datas, matrícula ou histórico. A agenda do professor continua apontando o próximo ciclo como pendente. Uma nova etapa materializada e iniciada assume a seleção; etapas futuras não vazam antecipadamente.

No caso Taís, C8 com A/B/C terminou25/10; C9 começou26/10 sem conteúdo; matrícula ativa até28/02/2027. O portal mantém C8 selecionável/executável durante a lacuna. A progressão fica limitada à última semana da ficha; não reinicia automaticamente.

## Proteções

- Propriedade do aluno/empresa, matrícula operacional e vigência comercial preservadas.
- Ciclos/treinos superseded, arquivados ou removidos explicitamente não voltam pelo fallback.
- Empate de datas entre duas materializações falha fechado em vez de escolher por número importado.
- Leitura falha ou resposta obsoleta não concede disponibilidade.
- Sessão ativa conserva workoutId original; nova seleção não reassocia logs.
- company_id nulo legado só pode ser lido através de ciclo previamente validado; empresa divergente continua bloqueada.
- Não marca ciclo antigo como publicação atual nem mascara lacuna na cobertura da agenda.

## Validação

- TypeScript app: exit0.
- Build canônico: exit0, fonte estável durante compilação, JavaScript inicial864.895 bytes dentro do limite875.000.
- Testes focados do executor/integração:56/56.
- QA independente final:33/33, hashes4/4 antes/depois, incluindo compatibilidade antes vermelha.
- Backend:11 checks SQL locais; definições e caso real consultados somente leitura. Não foi iniciada/finalizada sessão em produção.
- Consulta global de integridade:494 workouts materializados não arquivados, zero company_id nulo/divergente; teste legado foi preservado mesmo sem ocorrência atual.
- A regressão inicial durante edição teve316pass/1fail de sincronização do teste. O mesmo teste no freeze passou; execução completa final no freeze passou: **317/317 testes em32arquivos**, exit0.

## Limites e pendências

✅ Implementação e proteção do cenário Taís em código local.
✅ Matrículas, datas e histórico preservados; nenhuma gravação em produção.
❌ Publicação (aguardando): não houve deploy; o celular da Taís ainda não recebeu a mudança.
❌ Confirmação no dispositivo real (aguardando): após publicação; testes React com dependências mockadas não substituem isso.
❌ Matrícula vencida (aguardando): a continuidade aqui mantém a vigência comercial existente; não resolve o caso Maria Gabriela. Não foi concedida renovação automática.
❌ Demais exceções da auditoria (aguardando): sem qualquer treino materializado, clear explícito, superseded ou login ausente exigem tratamento próprio; não se fabrica conteúdo.

## Validação de navegador

Build atualizado em http://127.0.0.1:57831, com Auth/REST reais de homologação e conta sintética. Login e abertura do treino funcionaram; exercício e botão Iniciar Treino habilitado visíveis. Nenhuma sessão foi iniciada e nenhuma carga gravada por esse teste. Envios externos e escritas operacionais estão bloqueados no gateway. A reprodução de continuidade e troca para próximo treino foi validada pelos testes React/helper e QA; não atribuir ao navegador uma transição que não foi executada.
