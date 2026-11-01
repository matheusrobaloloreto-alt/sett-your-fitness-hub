# Freeze final — sem novas edições de fonte/testes

Base: 61ab2c848982feb89a741d258b48596b5b58d4b6.
Manifesto canônico: worker-portal-freeze.sha256 (quatro arquivos). Este snapshot substitui ce8dd00a/113900a3. Os arquivos do hook permanecem b881367a/13ba7714.

## O que foi confirmado

- Setter já era independente de coverage.hasCurrentWorkout. Nenhuma mudança nele foi necessária.
- Projeção real coverage.hasCurrentWorkout=true + etapa materializada mais recente vencida: keep permite, hide bloqueia (sonda QA passou em ambos).
- C1 atual materializado com delivery_status=pending vence C99 histórico (sonda QA passou); nenhum fallback novo sem prova foi adicionado.
- Finding P1 reproduzido: hide escondia a ação de finalizar sessão existente. Correção restrita: botão no aviso somente para sessão ativa resolvida, próprio aluno/empresa, fonte não limpa/substituída/futura, sem estudante inativo e sem barreira de limpeza selecionada. O início de nova sessão permanece bloqueado. Reusa pipeline existente de save + finish, sem alteração de logs/datas/matrícula.

## Recibos — não confundir snapshots

1. worker-portal-tests.txt: 66/66 passaram ANTES da correção da ação de finalizar. Preservado como evidência histórica; não é recibo integral do snapshot final.
2. worker-portal-semantic-probe-red.txt: finding P1 em RED, 4 passaram / 1 falhou.
3. worker-portal-semantic-probe-results.txt: 5/5 passaram APÓS a correção (keep/hide com cobertura true, C1/C99, cobertura em cache e presença da ação de finalizar).
4. /tmp/sett-policy-resolved-finish.txt: 1 teste focado passou (41 não selecionados), efetivamente invocando finishSession sem novo start/abandon.
5. Quatro testes adicionais no reads.test para sessão ativa com fonte cleared/archived/foreign/cancelled foram adicionados mas NÃO reexecutados após a ordem da raiz de concluir sem novas baterias. Validação final desses testes pertence à regressão independente da raiz. Não se declara 71 verdes.
6. ESLint focado sem erros, três warnings pré-existentes no portal; diff check limpo. Nenhum build/TSC global/browser executado pelo worker.

## Limites e integração

Gate por RPC get_company_workout_expiry_policy({_company_id}), sem default cliente. Infra/RPC ausente, resposta inválida, cache em refetch/pausa offline e troca de tenant não liberam continuidade. Default de ausência legítima pertence ao RPC do Pauli. Sem mudanças em cobertura global/financeiro/prescriptionSchedule neste escopo.

A raiz informou native staging UI hide save v12 / restore keep v13 aprovados; esse resultado é da raiz, não validação independente deste worker. Confirmar integração final do save com evento company-product-settings-changed/detail.companyId ou invalidação do prefixo company-experience-policy/empresa. Nenhuma autorização/deploy/commit/push/migração/escrita de dados foi executada pelo worker.

Não haverá novas edições de runtime ou testes após este manifesto sem nova coordenação da raiz.
