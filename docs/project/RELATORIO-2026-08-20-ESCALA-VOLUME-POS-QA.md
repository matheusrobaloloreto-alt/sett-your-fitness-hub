# RELATORIO - 2026-08-20 - Escala de volume pos-QA

## Veredito

A divergencia `1`/`0.5` versus `100`/`50` e divida historica de formato, nao um erro atual do calculo de volume. As tres superficies que calculam volume normalizam as duas escalas para a mesma fracao. Novas escritas pela interface usam a escala canonica percentual: `100` para alvo primario e `50` para alvo secundario.

Isso resolve a duvida de contrato levantada pela QA independente. Nao resolve a pendencia biomecanica: um coeficiente pode estar matematicamente bem normalizado e continuar sem evidencia suficiente para representar a contribuicao real de um exercicio.

## Evidencia no codigo

- `supabase/migrations/20260814233000_fix_multitarget_weekly_volume.sql`: `get_weekly_volume` interpreta `0..1` como fracao e `>1..100` como percentual.
- `supabase/functions/_shared/prescription/volumeRules.ts`: `targetVolumeFactor` aplica o mesmo contrato no motor de prescricao.
- `src/lib/volumeStats.ts`: `normalizeTargetWeight` aplica o mesmo contrato no frontend/estatisticas.
- `src/lib/exerciseTargetConfig.ts`: novas configuracoes sao persistidas como `100`/`50`.

O snapshot de curadoria mantem os valores brutos (`1`/`0.5` ou `100`/`50`) de proposito, para preservar proveniencia e permitir auditoria. Um manifesto futuro deve escrever somente a escala canonica percentual.

## Validacao focada

- Deno: `volumeRules.test.ts` — 5/5 testes aprovados.
- Vitest: `volumeStats.test.ts` + `exerciseTargetConfig.test.ts` — 19/19 testes aprovados.
- Casos equivalentes cobertos: `1 == 100 == 1.0` e `0.5 == 50 == 0.5` apos normalizacao.

## Riscos remanescentes

1. O valor bruto exato `1` e interpretado como fracao integral, nao como 1%. Essa convencao e necessaria para compatibilidade com os dados historicos e novas escritas nao usam `1` para representar 1%.
2. As constraints atuais aceitam toda a faixa `0..100`; portanto elas nao impedem nova mistura de escala por clientes externos. Escritas normais devem passar pelos helpers/RPCs canonicos.
3. Nao se deve reescrever dados historicos em massa sem backup, contagem antes/depois e QA independente. A normalizacao de leitura ja evita impacto funcional enquanto a curadoria avanca.
4. A regra de escala nao valida a plausibilidade biomecanica de `50%`, `20%` ou qualquer outro coeficiente.

## Decisao operacional

- Curadoria e novos manifests: usar apenas `100`/`50` ou outro percentual inteiro/decimal explicitamente revisado.
- Snapshot bruto: preservar a escala original para auditoria.
- Upsert: continua bloqueado ate a revisao anatomica, de seguranca e de coeficientes de cada lote.
- Padronizacao historica: tratar como migracao de higiene separada, reversivel e auditavel; nao e pre-requisito para a exatidao do calculo atual.
