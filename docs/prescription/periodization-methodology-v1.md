# Periodização — Metodologia SETT / BN (v1)

> Origem: implementação frontend `src/lib/periodization.ts` + banner do aluno
> `src/components/student/PeriodizationBanner.tsx`. Este documento descreve o modelo de
> periodização da metodologia, **alinhado** ao que já existe no motor de prescrição
> (`supabase/functions/_shared/prescription/methodology.ts` → `PROGRESSION_BLOCKS`, `DELOAD_RULES`).
> Objetivo: o aluno SEMPRE sabe em que fase está, e todo ciclo é periodizado por objetivo + datas.

## 1. Dois eixos

A periodização tem dois eixos que aparecem juntos para o aluno:

### Microciclo (caráter da SEMANA)
| Tipo | O que é | RIR | Volume |
|---|---|---|---|
| **Ordinário** | Semana de carga normal e progressiva (adiciona carga/reps vs. semana anterior). | conforme o mesociclo | 100–110% |
| **Choque** | Semana de pico: intensidade alta, perto da falha. Estímulo mais forte do bloco. | 1–2 | ~115% |
| **Regenerativo** | Deload: volume e intensidade reduzidos para recuperar e supercompensar. | 4 | ~50% |

### Mesociclo (ênfase do BLOCO)
| Fase | Ênfase | RIR de referência |
|---|---|---|
| **Base** | Adaptação + técnica; construir base de volume (MEV). | 3–4 |
| **Acumulação** | Acúmulo de volume rumo ao máximo tolerável (MAV). | 2–3 |
| **Intensificação** | Mais intensidade/proximidade da falha; métodos avançados conforme nível. | ~2 |
| **Polimento** | Taper: reduz volume, mantém intensidade para "afiar" o desempenho. | 2–3 |

## 2. Como o plano é montado (determinístico)

Entrada: `objetivo` + `duração em semanas` (derivada das datas do ciclo se não houver `duration_weeks`).

1. **Deload (regenerativo):** blocos de 4 semanas em macrociclos longos (`N ≥ 8` ⇒ semanas 4, 8, …);
   em ciclos `4 ≤ N ≤ 6` ⇒ apenas a **última** semana. Ciclos `N ≤ 3` não têm deload.
2. **Choque:** a semana **imediatamente antes** de cada deload (quando há espaço, semana ≥ 2).
3. **Ordinário:** todas as demais semanas.
4. **Mesociclo por terços do macrociclo:** 1º terço = Base, 2º terço = Acumulação, último terço = Intensificação.
5. **Polimento:** se o objetivo for de performance (força, prova, maratona, triatlo, potência, atleta…),
   a última semana (deload) é reclassificada como **Polimento** (taper, vol ~65%, RIR 2–3).

### Exemplos
- **6 semanas (hipertrofia):** Base(1–2 ordinário) · Acumulação(3 ordinário, 4 ordinário) · Intensificação(5 **choque**, 6 **regenerativo**).
- **4 semanas:** Base(1–2 ordinário) · Intensificação(3 **choque**, 4 **regenerativo**).
- **8 semanas (força):** deloads em 4 e 8; choques em 3 e 7; semana 8 vira **Polimento**.

## 3. Alinhamento com o motor existente
- RIR por mesociclo bate com `PROGRESSION_BLOCKS` (base 3-4 / accumulation 2-3 / intensification 2).
- Deload (vol 50%, RIR 4) bate com `DELOAD_RULES`.
- O que o motor **ainda não nomeia** (e que o frontend já expõe ao aluno): os **tipos de microciclo**
  (ordinário/choque/regenerativo) e as **fases de mesociclo** (base/acumulação/intensificação/polimento).

## 4. Onde aparece para o aluno
- App do aluno → aba **Treino** → banner "Periodização": semana atual (X de N), mesociclo + microciclo,
  foco da fase, RIR alvo e % de volume; linha do tempo navegável (toca numa semana e vê a fase dela).
- Gerador de treinos (Biblioteca de Treinos): grava um resumo das fases na descrição do template;
  as semanas concretas aparecem ao aluno conforme as datas do ciclo enviado.

## 5. Próximos passos (motor de prescrição — outro chat)
Ver `docs/prescription/periodization-handoff-to-engine-chat.md`.
