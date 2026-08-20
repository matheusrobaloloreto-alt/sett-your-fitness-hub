# SETT/BN — início auditável da revisão biomecânica P0

**Data:** 2026-08-20

## Veredito

A fila P0 passou de 13 para 16 itens porque o reconciliador anterior deixava três configurações multi-target fora da trilha técnica quando elas não tinham lacuna de segurança: `Remada Alta Barra`, `Step Up Halteres` e `Step Up Smith`. O gerador foi corrigido para que toda inconsistência P0 entre na revisão de targets, independentemente da quantidade atual de alvos.

Foi concluída uma primeira passagem técnica nos 16 itens. Nenhuma linha foi aprovada e nenhum coeficiente foi criado. Os achados principais são:

- configuração claramente inconsistente: `Rosca Scott Barra` e `Remada Alta Barra`;
- configuração parcial/suspeita: `Crucifixo na Máquina`, `Pulldown barra` e `Pulldown Corda`;
- alvos únicos possivelmente incompletos: flexão, graviton, serrote e quatro variantes de step-up/afundo;
- conflito de taxonomia funcional × muscular: `Kettlebell swing`, `Mobilidade Sapinho` e `Prancha com pés no TRX`;
- configuração plausível, mas coeficiente ainda não aprovado: `Step Up Halteres` e `Step Up Smith`.

O arquivo `library-curation-v2-p0-biomechanics-review.csv` registra, para cada exercício, o veredito sobre a configuração atual, a evidência ainda necessária e mantém `ready_for_upsert=false`.

## Próximo gate

Inspeção visual das 16 demonstrações e segundo revisor técnico independente. Só depois podem ser propostos papéis e coeficientes. `Rosca Scott Barra` deve permanecer bloqueada no motor de volume até a configuração corrigida passar por esse gate.
