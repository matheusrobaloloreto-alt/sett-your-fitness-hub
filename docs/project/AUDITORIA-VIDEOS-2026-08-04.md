# Auditoria de Vídeos da Biblioteca — 2026-08-04

**Contexto:** Matheus reportou vídeo-aulas no lugar de demonstrações. Auditados os 782 exercícios cujo vídeo que toca é do YouTube (resolvidos automaticamente por NOME no passado). Os 144 do MFIT (.mp4 cloudfront) são os vídeos corretos e ficaram fora.

## Método
- Título/canal real de cada vídeo via oEmbed (edge temporária read-only `tmp-audit-videos` no BN — já APAGADA).
- Duração real via YouTube Data API (edge temporária `tmp-yt-meta` no projeto femme, ~90 unidades de quota — já APAGADA).
- Heurística nome↔título com sinônimos PT/EN + detecção de padrão vídeo-aula + corte por duração (>6min = aula).

## Resultado da auditoria (782)
| Classe | Qtde | Ação |
|---|---|---|
| OK (título confere, curto) | 639 | mantidos |
| REVISAR (match parcial/borderline) | 69 | mantidos, lista abaixo |
| ERRADO (título sem relação) | 22 | corrigidos |
| VÍDEO-AULA (>6min) | 24 | corrigidos |
| INDISPONÍVEL (removido/privado no YT) | 28 | corrigidos |

## Correção aplicada (74 exercícios)
- **68 re-resolvidos** com critério RIGOROSO: busca YouTube `videoDuration=short` pt-BR, aceito só se duração 5–240s E título casa com o nome (score ≥0.5, ou ≥0.34 com 2+ termos); padrão de aula no título só passa com score ≥0.7. `thumbnail_url`/`video_url` antigos zerados (capa vem do vídeo novo).
- **6 sem substituto confiável → ficaram SEM vídeo** (doutrina: melhor sem vídeo que vídeo errado): Hops reativos unipodais · Largada resistida com banda · Aterrissagem rotacional e estabiliza · Along. Coluna Rotação · Fisio Joelho: salto em profundidade · Fisio Tornozelo: panturrilha joelho fletido (sóleo).
- Backup pré-correção das 74 linhas: `docs/project/data/backup-videos-2026-08-04.json` (rollback = restaurar yt/vu/th).

## Estado final da biblioteca (926)
144 MFIT (.mp4 próprio) · 755 YouTube verificado · 6 sem vídeo · ~21 via link YouTube direto (auditados).


## Lista REVISAR (69) — match parcial; trocar manualmente se estiver ruim

| Exercício | Vídeo atual (título) | Dur | Score |
|---|---|---|---|
| Fisio Tendão patelar: HSR cadeira extensora (3s/ | Jumper’s Knee: Putting the “Heavy” in Heavy Slow Resistance  | 143s | 0.12 |
| Fisio Posterior: terra romeno unipodal lento (HS | Dumbbell Single Leg RDL | 25s | 0.14 |
| Drop to stick (queda da caixa e estabiliza) | How To: Depth Jump / Performance Training Drill | 105s | 0.17 |
| Med ball side throw na parede (lateral) | Medball Rotational Throw | 7s | 0.17 |
| Fisio Tornozelo: heel drop excêntrico (Alfredson | Alfredson Protocol - Gastrocnemius | 19s | 0.17 |
| Fisio Joelho: agachamento declinado unipodal len | Dicas para aplicar o agachamento correto | 102s | 0.17 |
| Fisio Posterior: leg curl deslizante (slider) | Sliding Hamstring Curl | 15s | 0.17 |
| Wall drive isométrico (posição de aceleração) | Sprint Speed Drill- Leaning Wall Acceleration Series | 95s | 0.2 |
| Saltos reativos contínuos (repeated hops) | Repeat Pogo Jumps | 5s | 0.2 |
| Hurdle hops reativos (rebote rápido) | Athletics - Sprint training. Plyometrics - reactive Hurdle j | 5s | 0.2 |
| Apoio unipodal (single-leg stance) | Equilíbrio unipodal em pé | 20s | 0.2 |
| Fisio Quadril: ponte de glúteo isométrica | O certo e errado de cada exercício para evitar lesões - Pont | 16s | 0.2 |
| Cross Over Medial Banco 90 | Como fazer o Crossover (Aprenda em 1 Minuto) | 66s | 0.2 |
| Cross Over Polia Alta 3 Porções | Como fazer o Crossover (Aprenda em 1 Minuto) | 66s | 0.2 |
| Apoio em tandem (pé-ante-pé) | Exercise 19: Stepping - Semi-Tandem | 155s | 0.2 |
| Fisio Tornozelo: panturrilha excêntrica no step | How To Do Eccentric Calf Raises - Kinetic U Exercise Series | 80s | 0.2 |
| Extensão de Quadril em Diagonal Polia | Abdução diagonal no cross - Consultoria on-line Lari Takehan | 32s | 0.25 |
| Extensora com Alongamento Entre Séries | NÃO faça mais CADEIRA EXTENSORA! #treino #musculacao #hipert | 20s | 0.25 |
| Abdução de Quadril no Banco com Caneleira | Glúteo CANELEIRA / Aprenda se vale a pena fazer! | 253s | 0.25 |
| Pogo reativo com mini band | Banded Pogo Jumps | 6s | 0.25 |
| Remada com Peito no Banco Pronada | 4 Piores ERROS de Iniciantes ao fazer REMADA MÁQUINA | 237s | 0.25 |
| Snap down (desaceleração rápida) | Snap Downs | 7s | 0.25 |
| Tuck jumps contínuos reativos | Tuck Jump - Execução do Exercício | 8s | 0.25 |
| Bound reativo com banda no quadril | Traçao no quadril com band: extensores do quadril | 23s | 0.25 |
| Remada Cavalinho Unilateral Neutra | 4 Piores ERROS de Iniciantes ao fazer REMADA MÁQUINA | 237s | 0.25 |
| Med ball slam frontal | How to Properly Perform Medicine Ball Slams (Exercise Demons | 19s | 0.25 |
| Sapinho Banco com Minband (Frog) | Glúteo Sapinho com Isometria | 50s | 0.25 |
| Broad jump para salto vertical | How To Do Broad Jumps | 8s | 0.25 |
| Split jump (afundo saltado) | VOCÊ SABIA DESSA DIFERENÇA ENTRE OS TIPOS DE AFUNDO? | 14s | 0.25 |
| Fisio Ombro: serratus punch | 3 Exercises To Strengthen Your Serratus | 32s | 0.25 |
| Remada Cavalinho Unilateral Pronada | 4 Piores ERROS de Iniciantes ao fazer REMADA MÁQUINA | 237s | 0.25 |
| Fisio Cotovelo: extensão de punho excêntrica (ep | Dica do Dia #21 - Epicondilite #dor #fisioterapia #mtc #libe | 60s | 0.29 |
| Fisio Cotovelo: flexão de punho excêntrica (epic | 4 exercícios para cotovelo de tenista (EPICONDILALGIA LATERA | 25s | 0.29 |
| Fisio Tornozelo: hop and stick (resposta a carga | Single Leg Linear Hop + Stick | 11s | 0.29 |
| Biset Cross Over + Supino Banco 90 | Crucifixo no Crossover sentado no banco | 16s | 0.33 |
| Hurdle hops frontais | Hurdle jumps | 6s | 0.33 |
| Wall drive 3 contatos | Wall based sprint technique (double exchange) | 5s | 0.33 |
| RDL B-Stance Barra | Barbell B stance Romanian Deadlift | 25s | 0.33 |
| A-bounds (skip saltado) | A-Skip | 69s | 0.33 |
| Aterrissagem lateral e estabiliza | LATERAL HOP COUNTERMOVEMENT TO STABILIZE | 67s | 0.33 |
| Med ball arremesso reverso acima da cabeça | ARREMESSO DE MEDICINE BALL | 12s | 0.33 |
| Rack Pulls Smith | Rack Pull | 12s | 0.33 |
| Slam ball rotacional | Rotational Medball Slam | 9s | 0.33 |
| Triset Panturrilha com Rotação | PANTURRILHA SENTADO (EXECUÇÃO CORRETA) | 11s | 0.33 |
| Fisio Joelho: cadeira extensora lenta (HSR) | EXECUÇÃO CORRETA NA CADEIRA EXTENSORA (START ACADEMIA) | 142s | 0.33 |
| Along. Hiperextensão Rolinho | Rolinho abdominal • Aprenda a EXECUTAR #sixpack #abs #lowbod | 31s | 0.33 |
| Battle rope (ondas) | Training Guide for X1 Ropeless Battle Ropes | 90s | 0.33 |
| Scissor jumps (tesoura) | Scissor Jump | 10s | 0.33 |
| Apoio unipodal no bosu | Propriocepção no Bosu #shorts | 8s | 0.33 |
| Airplane (avião - quadril) | Avião + Joelhada - Guia de Treinos por Bea e Cazula | 13s | 0.33 |
| Concha (clamshell) com banda | Banded Clamshell #howtoexercise #clamshell #warmupexercise | 14s | 0.33 |
| Scapular push-up (push-up plus) | Scap Push ups | 17s | 0.33 |
| Chop meio-ajoelhado (tall/half kneeling) | Chop ajoelhado na polia baixa | 20s | 0.33 |
| Fisio Joelho: agachamento isométrico (carga está | Agachamento Isométrico na Parede | 17s | 0.33 |
| Fisio Quadril: abdução isométrica de glúteo médi | Por que o glúteo médio demora para fortalecer após a ATQ? -  | 111s | 0.33 |
| Agachamento Búlgaro com Step | BÚLGARO SEM ERRO: PASSO A PASSO PARA EXECUTAR CERTO! | 21s | 0.33 |
| Agachamento Búlgaro Inclinado | BÚLGARO SEM ERRO: PASSO A PASSO PARA EXECUTAR CERTO! | 21s | 0.33 |
| Cross Over Medial | Laércio Refundini Ensina uma TÉCNICA NO CROSSOVER #musculaçã | 53s | 0.33 |
| Fisio Ombro: Prone Y-T-W-L | Prone Y T W | 31s | 0.33 |
| Fisio Ombro: deslizamento na parede (wall slide) | Wall Slides | 29s | 0.33 |
| Fisio Cervical: chin tuck (retração cervical) | 34. Chin Tuck | 16s | 0.33 |
| Bounding (passadas saltadas) | Bounding (Running Drill) | 18s | 0.33 |
| Cross Over Supinado | Como fazer o Crossover (Aprenda em 1 Minuto) | 66s | 0.33 |
| Afundo (peso corporal) | 🦵🏼TENHA UM AFUNDO PERFEITO EM 6 PASSOS #academia #laercioref | 47s | 0.33 |
| Fisio Punho: wrist roller (enrolar carga) | How to use The Wrist Roller for Stronger Wrists and Forearms | 95s | 0.33 |
| Prancha Empurrar / Puxar | KB Plank Saw | 11s | 0.33 |
| Retração escapular na parede | Fortalecimento escapular com Minibands!  😃 | 37s | 0.33 |
| Extensão de Quadril Banco Romano com Flexão | Como GANHAR BUMBUM e FORTALECER LOMBAR no Banco Romano | 205s | 0.4 |
| Supino Inclinado Smith com Dead Stop | Supino no Smith com Repetições Forçadas e Negativas | 227s | 0.4 |

*Gerado pela ATENA (Claude) — edges temporárias removidas dos dois projetos.*
