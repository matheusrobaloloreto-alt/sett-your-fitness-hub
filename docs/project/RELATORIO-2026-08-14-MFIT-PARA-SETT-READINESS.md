# MFIT → SETT/BN — relatório sanitizado de prontidão

**Data:** 2026-08-14

**Escopo desta entrega:** preparar a migração das **fichas/prescrições ativas já montadas** no MFIT para alunos ativos da BN Performance Training. O histórico de sessões concluídas é uma etapa separada e não entra nesta primeira carga.

**Modo executado:** somente leitura e testes locais. Nenhum `--apply`, INSERT remoto, migration, deploy ou push foi executado.

## Decisão executiva

**NO-GO para aplicar dados agora.** O migrador está localmente pronto para receber as fontes e sua suíte está verde, mas não existe export MFIT no workspace e não havia navegador conectado para obter a fonte autenticada. Sem os clientes e as fichas ativas do MFIT, não é possível medir matches, cobertura real da biblioteca ou produzir um dry-run real.

## Escopo SETT/BN confirmado (snapshot sanitizado e read-only)

- Projeto canônico: `zshrcgbyhzxpnlccssyz` (`Bn-app`).
- Empresa: `dad65c62-e700-4ae9-930a-43b18357c171`, **BN Performance Training**, slug `bn-performance-training`, ativa.
- Contrato vivo de aluno ativo: `students.status IN ('active', 'awaiting_renewal')`.
- Contrato vivo de matrícula operacional: `enrollments.status IN ('active', 'awaiting_training', 'awaiting_renewal')`.
- Elegibilidade para esta migração: o aluno precisa satisfazer **os dois** contratos e pertencer à empresa BN.

Contagens do snapshot:

| Métrica | Total |
|---|---:|
| Alunos na empresa | 69 |
| Alunos com status ativo | 53 |
| Matrículas operacionais ativas | 61 |
| Alunos elegíveis (interseção aluno + matrícula) | **48** |
| Ativos sem matrícula operacional | 5 |
| Matrículas ativas cujo aluno não está ativo | 9 |
| Ciclos da empresa | 328 |
| Treinos materializados na tabela `workouts` | 50 |
| Exercícios visíveis (globais + BN) | 926 |
| Nomes normalizados ambíguos no catálogo | 7 |

As contagens são voláteis e devem ser refeitas imediatamente antes do dry-run. Nenhum nome, telefone, e-mail ou UUID de aluno foi persistido neste relatório.

## Regras implementadas no migrador

1. **Tenant explícito:** a execução exige `--company-id`; alunos e matrículas de outra empresa são recusados.
2. **Atividade fail-closed:** somente aluno ativo da BN e matrícula operacional ativa entram.
3. **Matching determinístico:** telefone normalizado → e-mail normalizado → nome exato normalizado e único. Telefone/e-mail contraditórios, duplicidade ou ambiguidade bloqueiam; não existe fuzzy match.
4. **Somente prescrição:** fichas ativas/atribuídas são normalizadas; status desconhecido ou inativo falha fechado. Histórico concluído não é misturado.
5. **Fidelidade:** preserva sessões e ordem; exercícios; séries, repetições, cargas, descanso, cadência, observações, métodos, grupos/bi-sets, alternativas e mídia no JSON canônico. A projeção normalizada mantém os campos suportados pelo schema.
6. **Biblioteca:** o lote inteiro exige 100% de correspondência determinística no catálogo global/BN. Ausência ou nome ambíguo bloqueia todo o lote. O migrador não cria nem altera exercícios.
7. **Append-only:** somente inserts com IDs determinísticos; não há chamadas de update/delete. Treino SETT materializado não é sobrescrito. Ciclo vazio só é reutilizado quando há um único alvo inequivocamente compatível.
8. **Idempotência:** marcador e IDs determinísticos permitem segunda execução sem nova mutação. Estados parciais conhecidos podem completar apenas os inserts determinísticos ausentes; divergência bloqueia.
9. **Privacidade:** o relatório operacional usa referências anônimas e não inclui PII.

## Checklist de modelagem — skill ATENA nº 127

Banco: PostgreSQL/Supabase. O migrador não cria schema.

Cardinalidades usadas:

- `companies 1:N students` e `companies 1:N enrollments`;
- `students 1:N enrollments`;
- `enrollments 1:N training_cycles`;
- `training_cycles 1:N workouts`;
- `workouts 1:N workout_exercises` quando a projeção normalizada está disponível;
- `exercise_library 1:N workout_exercises`;
- exercícios globais têm `is_global=true`; exercícios privados precisam do `company_id` correto.

Integridade observada/esperada:

- FKs: matrícula→aluno/empresa, ciclo→matrícula/empresa, treino→ciclo/empresa e exercício normalizado→treino/biblioteca.
- O banco possui trigger de ownership do ciclo, que sincroniza aluno e empresa a partir da matrícula.
- O migrador valida ownership novamente antes de materializar e bloqueia colisões de IDs ou conteúdo.
- IDs de ciclo, treino e espelho normalizado são determinísticos; isso funciona como chave de idempotência da carga.
- Não foi adicionada migration nem índice. Antes da aplicação, confirmar no banco vivo constraints/índices para as queries por `enrollments.student_id`, `training_cycles.enrollment_id`, `workouts.cycle_id` e catálogo por `(company_id/is_global, name)`. Índice novo só deve ser proposto após `EXPLAIN` do dry-run, não por garantia.

Risco estrutural remanescente: a tabela normalizada é uma projeção complementar; o app atual também usa `workouts.exercises` em JSON. A carga preserva ambos quando a tabela normalizada está disponível e bloqueia divergência entre as duas representações.

## Validações locais

- `node --test scripts/mfit-active-workouts-migration.test.mjs`: **23/23 testes aprovados**.
- O falso positivo antigo foi corrigido: o teste de zero update/delete agora inspeciona somente o adaptador de banco, portanto `createHash(...).update(...)` não é confundido com mutação remota.
- Cobertos em teste: dry-run sem escrita, PII ausente, tenant/atividade, contradição de identidade, status desconhecido, cobertura 100%, ausência no catálogo, reuso de exercício, append-only, idempotência, reparo parcial, ciclos concorrentes, mídia, protocolo por série, bi-sets e alternativas.

## Inputs ainda necessários

Manter os arquivos com PII somente em diretório temporário local, fora do Git:

1. Export SETT dos alunos da BN com `id`, `company_id`, `status`, nome, telefone/WhatsApp e e-mail.
2. Export MFIT de clientes com ID MFIT, nome, telefone e e-mail.
3. Export MFIT das **fichas ativas atribuídas**, contendo vínculo do cliente, status, datas, sessões e todos os detalhes de exercício.
4. Amostra/documentação do formato MFIT se os nomes de campos diferirem dos formatos já suportados.
5. Credencial read-only/canal autenticado disponível no momento da extração. O migrador não lê `.env` automaticamente e não grava secrets.

## Plano seguro para a próxima etapa

1. Extrair as três fontes em modo read-only e armazená-las fora do repositório.
2. Executar o migrador sem `--apply`, gerando relatório sanitizado.
3. Exigir: 48 elegíveis recontados, zero contradições/ambiguidades, cobertura de catálogo 100% e zero conflitos com treino SETT existente. Ausência de ficha MFIT é reportada, não fabricada.
4. Rodar o mesmo dry-run novamente e comparar relatório/IDs para comprovar determinismo.
5. Antes de qualquer aplicação: backup consistente de `students`, `enrollments`, `training_cycles`, `workouts`, `workout_exercises` e `exercise_library`, além de registrar o hash dos arquivos-fonte.
6. Aplicar somente após autorização explícita, em lotes pequenos (sugestão: 5 alunos), validando após cada lote no app e no banco.
7. Critérios de parada: qualquer coverage abaixo de 100%, match contraditório, mais de um ciclo vazio candidato, ciclo materializado concorrente, ownership divergente ou diferença entre JSON e projeção normalizada.
8. Rollback operacional: identificar exclusivamente IDs/marcadores determinísticos da carga e restaurar a partir do backup. O migrador não oferece delete automático; rollback é ação separada, revisada e explicitamente autorizada.

## Resultado atual

- **Código:** pronto para dry-run com fontes reais.
- **Dados SETT:** empresa e contrato de elegibilidade confirmados de forma sanitizada.
- **Dados MFIT:** indisponíveis neste workspace.
- **Dry-run real:** não executado.
- **Aplicação:** bloqueada corretamente.
