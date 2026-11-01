# Parecer independente DDL — somente staging, condicionado ao freeze

Migration: 20261101223102_company_expired_workout_behavior.sql
SHA256: a5d09feca803492dc82b35add8a252d44e13c0b263679cb9a8104f5fd65a9964

**Sem bloqueador de segurança/integridade identificado no DDL revisado. Apto ao gate técnico de aplicação SOMENTE em staging ifymocggowdlqqcxugko, depois do freeze da raiz. Não é aprovação de produção ou da feature completa.** Nenhuma migration foi aplicada remotamente por este QA.

## Revisão

- Colunas: duas colunas NOT NULL/CHECK com default keep. Não injeta a nova chave em settings/history.settings; não muda matrículas, datas, workouts ou logs. Adicionar default a histórico preexistente representa política anterior keep, sem reescrever JSON.
- Helper legado: move o save já instalado, preservando implementação/ownership do objeto e seus locks/CAS/validação. Revoga EXECUTE dos papéis públicos/cliente/service_role no helper e USAGE no schema privado. Wrapper SECURITY DEFINER precisa ter owner que consiga chamar esse helper; confirmar owners/ACL no staging real.
- Wrapper público: search_path vazio e objetos de aplicação qualificados. Remove somente a chave virtual antes do validador legado; campos desconhecidos restantes continuam sujeitos à allowlist antiga. Delegação autentica/autoriza/CAS antes de operar a política. Rejeição posterior lança erro e desfaz a escrita da chamada interna na mesma transação. Política e history.version atualizam a mesma versão; histórico ausente também causa rollback.
- Entitlement hasPrescription é exigido quando a política muda. Cliente antigo omitindo chave preserva o valor atual, inclusive hide e seu audit. Não usa ausência de campo como pedido de reset.
- Leitura mínima: RPC mínimo SECURITY DEFINER/search_path vazio. Autenticação e empresa existente obrigatórias; master/staff ou students.user_id da própria empresa autorizam leitura. Retorno de exatamente company_id/version/expired_workout_behavior. Só ausência real da linha recebe keep/version0; não reinterpreta linha invisível de SELECT cliente como ausência. Não concede SELECT do JSON ao aluno.
- EXECUTE novo somente authenticated; anon/PUBLIC/service_role revogados. Leitura não concede write. RLS e grants das tabelas seguem intactos; isto foi exercitado localmente.

## Evidência independente

`node qa/configurable-continuity-20261101/persistence-contract.mjs`: **12/12 PASS**, PGlite local descartável, sem rede/credenciais. Usa migrations reais base/metodologia/validador de sequências e DDL novo, com helpers de identidade/roles/feature sintéticos. Testa JSON exato preservado na migration; novo save hide fora do JSON; 61ab parser aceita envelope; audit da mesma versão; old save preserva hide; enums inválidos e feature denial revertem; CAS; foreign/student writes e private bypass negados; own student sem membership lê hide enquanto SELECT JSON retorna zero; outsider/foreign/anon negados; sem versões extras de auditoria nas falhas.

Limites: reconstrução local não replica todos os triggers comerciais/media nem comprova owners/ACL da instalação nativa. O teste de contrato do Pauli foi lido como evidência adicional, não incorporado como execução independente. Testes frontend completos ainda em andamento; não são condição cumprida por este parecer DDL isolado.

## Baseline nativo / rollback para a raiz

Antes: guardar definição/owner/ACL/config do save public atual, grants/RLS das tabelas e conteúdo JSON/version/history; verificar que settings_private.save com essa assinatura ainda não existe e que as colunas/RPC não foram parcialmente instalados. O ALTER SET SCHEMA deve mover exatamente a função nativa esperada, incluindo wrappers comerciais preexistentes, não reinstalar um core histórico.
Depois: comparar corpo do helper movido com o original (desconsiderando só cabeçalho/schema), confirmar search_path/owner/ACL de ambos novos RPCs, default/check das duas colunas e RLS/grants inalterados; testar com autenticação nativa aluno SEM membership, admin e tenant externo usando fixtures autorizadas. Conferir JSON/history.settings sem chave virtual, versão CAS e audit após save/reload na fixture.

Rollback operacional recomendado: frontend antigo primeiro, mantendo colunas/helper/wrapper/RPC compatíveis. Não dropar colunas com hide já salvo nem retornar ao helper antigo como API de gravação sem plano: isso perde política/audit. Falha de aplicação dentro de BEGIN/COMMIT reverte o DDL; a migration não é idempotente e não deve ser reaplicada às cegas. Não restaurar banco inteiro sobre escritas concorrentes.

Com JSON legado comprovadamente intacto, o risco de strict-normalizer de old edges/old browsers está eliminado pelo contrato de storage; não exige edge deploy para esta mudança. Revalidar se qualquer implementação posterior passar a persistir a chave virtual no JSON.

## Adição de segurança auditada durante a revisão

A versão de hash acima inclui capture_workout_expiry_policy_history, trigger BEFORE INSERT de histórico, SECURITY DEFINER/search_path vazio e EXECUTE revogado. Ele copia a política atual da empresa para a nova linha de auditoria, cobrindo callers SQL que ainda alcancem o OID da função movida. O wrapper então ajusta a política da MESMA versão quando há mudança explícita. Seleção da empresa é pelo company_id da linha auditada; não retorna dados ao cliente. Não amplia grants de tabela. Prova adicional do caller legado foi adicionada no fixture independente; resultado novo será anexado.

## Confirmação do hash revisado

Reexecução independente concluída sobre SHA256 a5d09feca803492dc82b35add8a252d44e13c0b263679cb9a8104f5fd65a9964: **12/12 PASS**, exit 0, em persistence-ddl-reviewed-results.txt (o próprio runner registra o hash carregado). Apto ao gate DDL de staging após freeze. Teste extra específico de caller SQL legado em preparação não muda esse resultado. Feature/frontend ainda não recebem gate final nesta nota; testes UI sofreram timeout de fixture em execução concorrente e estão sendo repetidos com tempo apropriado, sem mudar expectativas. Nenhuma operação hospedada realizada por este QA.
