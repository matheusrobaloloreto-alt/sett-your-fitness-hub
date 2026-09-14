# Tema pessoal, salvamento, taxonomia e Dashboard do treinador

Entrega local na branch `codex/sett-release-rc-20260826`, a partir de `262cfc7a55f7de253c08394a87b9ed3458de5fe9`. Este documento acompanha o código; o relatório acumulado do Release Guardian permanece sob sua responsabilidade.

O hotfix separado do bloqueio de salvamento por BNITO (base `c138200`, tarefa `01a09e92-e1b7-72b0-b2f3-d4ade0d1d3b7`) não foi incorporado. Há sobreposição potencial em `WorkoutBuilder.tsx`: esta entrega altera snapshot CAS, recarga confirmada e resolução de concorrência. O Guardian deve reconciliar esses trechos com o hotfix sem remover proteção contra versões desatualizadas nem reintroduzir snapshot derivado do rascunho.

## Comportamento entregue

- Tema claro/escuro por usuário neste dispositivo, com preferência do sistema quando ainda não existe escolha. A chave anônima é separada. O bootstrap mantém a preferência da sessão persistida enquanto a autenticação carrega. O controle do aluno fica junto de Avisos; o da equipe fica em Aparência. A escolha não grava configurações da empresa.
- A RPC de revisão de treino retorna IDs e timestamps confirmados. O editor mantém o snapshot carregado separado do rascunho, para que remoção de treino e substituição por template não simulem concorrência. Conflitos reais permitem carregar a versão salva ou salvar o rascunho contra a versão apresentada, preservando histórico.
- Oito categorias exclusivas para cadastro, busca e filtros: Core, Mobilidades, Funcionais, Base, Pesos Livre, Peso Corporal, Maquinas e Pliometria.
- Quinze grupos anatômicos, conferidos no pedido original: Abdômen, Quadríceps, Posterior de coxa, Glúteos, Adutores, Panturrilha, Deltoide Lateral, Deltoide Posterior, Deltoide Anterior, Antebraço, Biceps, Triceps, Dorsal, Trapezio e Peitoral.
- Primário contribui 1 série e secundário 0,5. Percentuais e overrides históricos permanecem armazenados, mas não governam cálculos novos. Aliases do mesmo grupo contribuem uma única vez por ocorrência de exercício, pelo papel de maior peso. Os três deltoides permanecem distintos. Carga externa em kg × repetições continua uma métrica separada.
- O catálogo e os alvos dos três caminhos de prescrição usam paginação. Um erro de página não vira catálogo parcialmente considerado completo.
- O treinador passa a usar os mesmos componentes do Dashboard da empresa, incluindo os painéis adicionais de coordenação, em modo de leitura. Uma RPC exclusiva do Dashboard entrega os campos necessários e a contagem correta de professores na empresa autorizada, preservando as permissões e concessões anteriores. O contrato SQL, as definições anteriores e os limites de rollback estão em [DASHBOARD-2026-09-14-CONTRATO-SQL.md](DASHBOARD-2026-09-14-CONTRATO-SQL.md).
- Durante loading ou erro da RPC, os cartões falham fechados: nenhuma consulta antiga é disparada como fallback. Alertas direcionados seguem a autorização do destinatário, e o modo treinador não oferece escrita nem navegação administrativa, inclusive nas análises expandidas.

## Limite da correção dos dados

A classificação remove categorias dos gráficos anatômicos e corrige a interpretação de pesos antigos como `1`, `20` ou `100`. Ela não consegue confirmar se o músculo cadastrado para um exercício está tecnicamente correto. O Guardian relatou, por exemplo, Rosca Scott associada a Dorsal primário em produção. Essa associação precisa de curadoria técnica; esta entrega não troca músculos a partir do nome do movimento.

A migration guarda os valores anteriores de categoria/categorias/muscle_group em `taxonomy_legacy_categories`. Percentuais, overrides e revisões históricas não são apagados. Alvos desconhecidos ou genéricos não recebem uma anatomia inventada.

## Ordem de aplicação pelo Release Guardian

Nenhuma etapa remota abaixo foi executada nesta tarefa.

1. Aplicar `20260914104500_return_workout_revision_rows.sql`.
2. Aplicar `20260914124000_exercise_taxonomy_contract.sql`.
3. Aplicar `20260914130000_fix_fixed_muscle_volume.sql`.
4. Capturar as definições de catálogo e políticas de staging e aplicar `20260914152000_trainer_company_dashboard_read_access.sql` somente após os gates de isolamento e preservação de escrita do Dashboard.
5. Publicar em staging as funções `ai-prescribe-workout`, `ai-validate-prescription` e `ai-coach-pack`, incluindo seus módulos compartilhados.
6. Publicar o frontend da mesma revisão em staging e validar contrato RPC, isolamento de empresa, filtro multicategoria, tema, salvamento sucessivo, remoção/template, resolução de conflito e Dashboard completo para treinador.

O Guardian controla o momento dessa integração. Não substituir o staging do hotfix isolado enquanto seu smoke estiver ativo; os hotfixes permanecem separados até a reconciliação explícita pelo responsável.

O rollout de consentimento semanal já existente na branch conserva seus próprios gates. Os tipos foram regenerados por leitura do projeto canônico; `src/integrations/supabase/database.ts` mantém o contrato das duas RPCs de consentimento da migration local ainda ausentes no schema de produção gerado. Remover essa extensão após o rollout e nova geração, sem editar manualmente `types.ts`.

## Validação reproduzível e rollback

Os canários PostgreSQL usam PGlite e apenas dados sintéticos:

```sh
PGLITE_MODULE_PATH=/caminho/para/pglite/dist/index.js node scripts/workout-revision-pglite-contract.mjs
PGLITE_MODULE_PATH=/caminho/para/pglite/dist/index.js node scripts/fixed-muscle-volume-pglite-contract.mjs
PGLITE_MODULE_PATH=/caminho/para/pglite/dist/index.js node scripts/trainer-company-dashboard-pglite-contract.mjs
```

A verificação TypeScript do aplicativo usa `tsc --noEmit -p tsconfig.app.json`; executar somente o `tsconfig.json` raiz não verifica todo o aplicativo. Os cenários Playwright usam localhost e backend simulado. Não comprovam implantação nem operação em produção.

Validação local final do Dashboard: canário PGlite com 39 negações esperadas; Vitest focado 17/17; Playwright 6/6 para admin/coordinator/trainer/master, dados completos, loading atrasado, vazio, erro, desktop claro e mobile escuro; zero escrita, navegação administrativa ou fallback proibido. Gates integrados: TypeScript aprovado, ESLint com zero erros e 42 avisos, build aprovado. A primeira suíte teve uma falha transitória financeira sob concorrência de CPU; o arquivo passou 10/10 isoladamente e a repetição integral terminou verde, com 370 suítes e 1.073/1.073 testes aprovados.

Rollback do frontend/funções por revisão anterior. As migrations preservam dados e acrescentam colunas; um rollback deve restaurar as definições anteriores das funções mantendo as colunas e snapshots de auditoria. Não apagar histórico nem executar reversão de dados em massa.
