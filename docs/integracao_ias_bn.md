# Integração IAs BN Performance Training

================================================================================
  INTEGRAÇÃO DAS EDGE FUNCTIONS — Context Passing entre IAs
  Adicionar estes blocos às edge functions existentes
================================================================================

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. ai-prescribe-workout — adicionar ao athleteContext
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No body da request, aceitar: running_days_context (opcional)
  { days_per_week: number, sport: string }

Adicionar ao final do athleteContext:

```
INTEGRAÇÃO COM CORRIDA (contexto recebido do UnifiedPrescriber):
${running_days_context
  ? `O atleta TAMBÉM tem ${running_days_context.days_per_week} dias/semana de ${running_days_context.sport}.
     REGRAS OBRIGATÓRIAS DE ANTI-INTERFERÊNCIA:
     1. NÃO agendar treino pesado de MMII (agachamento, terra, afundo) no mesmo dia nem no dia ANTERIOR a corridas longas
     2. Semanas de deload da musculação = semana 4 de cada bloco (deload sincronizado com a corrida)
     3. Volume de MMII reduzido em 20% vs atleta sem corrida
     4. Preferir RIR 2-3 em todos os exercícios (preservar recuperação aeróbica)
     5. Separar força de MMII por no mínimo 6h de qualquer corrida Z4/Z5`
  : 'Sem plano de corrida — prescrever sem restrições de anti-interferência'
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  2. ai-running-plan — adicionar ao athleteContext
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No body da request, aceitar: strength_plan_context (opcional)
  { days_per_week: number, workouts: Array<{ day: number, focus: string, has_heavy_legs: boolean }> }

Adicionar ao final do athleteContext:

```
INTEGRAÇÃO COM MUSCULAÇÃO (contexto recebido do plano de força já gerado):
${strength_plan_context
  ? `O atleta tem ${strength_plan_context.days_per_week} dias/semana de musculação.
     Dias com treino pesado de MMII: ${
       strength_plan_context.workouts
         .filter((w: any) => w.has_heavy_legs)
         .map((w: any) => `Dia ${w.day} (${w.focus})`)
         .join(', ') || 'não identificados'
     }
     REGRAS OBRIGATÓRIAS DE SINCRONIZAÇÃO:
     1. NÃO colocar corrida Z4/Z5 nos dias de treino pesado de MMII nem no dia seguinte
     2. Corrida Z1/Z2 pode ser feita no mesmo dia da musculação APENAS após o treino de força e com 6h de intervalo
     3. Semana de deload da corrida na mesma semana que o deload da musculação (semana 4)
     4. Preferir corridas longas Z2 nos dias de descanso da musculação
     5. Distribuição sugerida: [corrida] → [força MMII] → [descanso] → [corrida] → [força MMII+superior]`
  : 'Sem plano de musculação — prescrever sem restrições de sincronização'
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  3. ai-nutrition-plan — adicionar ao athleteContext
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No body da request, aceitar:
  strength_plan_context: { sessions_per_week, session_duration_min, estimated_weekly_kcal }
  running_plan_context:  { sport, model, volume_weekly_hours, estimated_weekly_kcal }

Substituir o bloco de athleteContext de treino por:

```
CARGA DE TREINO REAL (para cálculo preciso do GET):
${strength_plan_context
  ? `Musculação: ${strength_plan_context.sessions_per_week}x/semana, ${strength_plan_context.session_duration_min}min/sessão
     Custo estimado musculação: ~${strength_plan_context.estimated_weekly_kcal} kcal/semana`
  : 'Sem musculação'
}
${running_plan_context
  ? `${running_plan_context.sport}: modelo ${running_plan_context.model}, ~${running_plan_context.volume_weekly_hours}h/semana
     Custo estimado cardio: ~${running_plan_context.estimated_weekly_kcal} kcal/semana`
  : 'Sem cardio'
}

INSTRUÇÃO CRÍTICA: 
- Some os custos calóricos reais de TODOS os treinos para calcular o GET correto
- GET = TMB × fator_atividade_BASE + custo_musculacao_semanal/7 + custo_cardio_semanal/7
- Carb cycling: dias com TREINO DUPLO (força + corrida) = CHO máximo do perfil
- Dias só de musculação = CHO médio
- Dias só de corrida Z2 = CHO médio
- Dias de descanso = CHO mínimo (2-3g/kg)
- Se atleta tem corrida Z4/Z5 no mesmo dia que musculação intensa → CHO pré-treino obrigatório
```

================================================================================
  ROTA NO LOVABLE
  Adicionar em src/App.tsx ou no arquivo de rotas:
================================================================================

import UnifiedPrescriber from "@/pages/admin/UnifiedPrescriber";

// Na lista de rotas:
{ path: "/admin/prescricao", element: <UnifiedPrescriber /> }

// No menu sidebar (AdminLayout ou similar):
{ label: "Prescrição Integrada", path: "/admin/prescricao", icon: Sparkles }

