# SETT/BN — plano seguro de curadoria de alvos, metadata e vídeos

**Data:** 2026-08-17  
**Estado:** planejamento local/versionado; nenhum `INSERT`, `UPDATE`, `DELETE`, migration, deploy ou bulk update foi executado.

## Veredito

Os dados atuais não autorizam correção automática. Embora 926/926 exercícios estejam ligados ao motor, 716 têm apenas um alvo, 489 não possuem contraindicações nem tags de dor e 179 compartilham IDs de YouTube. Esses números são filas de auditoria, não prova de erro em cada linha.

A próxima entrega deve ser uma curadoria offline reconciliada por `exercise_id`, com decisão humana explícita. Somente um manifesto aprovado, validado e auditado poderá alimentar uma futura aplicação em staging. Produção continua fora do escopo.

## 1. Reconciliar a base antes de revisar conteúdo

O pipeline de curadoria v1 já possui pacotes para 749 exercícios (215 originais + delta de 534), mas parte da documentação nasceu quando o catálogo tinha 447 itens. A auditoria mais recente mede 926 exercícios e 926 linhas de metadata. Portanto, não se deve tratar os pacotes antigos como cobertura atual sem reconciliação.

Primeira etapa, exclusivamente read-only:

1. gerar snapshot sanitizado do catálogo atual, alvos, metadata e referências de vídeo;
2. registrar contagens e SHA-256 dos arquivos, sem alunos, prescrições ou outra PII;
3. comparar por `exercise_id` os 749 itens já empacotados com os 926 atuais;
4. classificar cada linha como `unchanged`, `catalog_changed`, `new`, `missing_from_live` ou `duplicate_id_conflict`;
5. invalidar sugestão antiga cujo nome, target, metadata ou mídia tenha mudado;
6. gerar um único índice mestre v2, sem sobrescrever os artefatos v1.

Critério de saída: 926/926 IDs classificados e zero divergência silenciosa. A diferença nominal de 177 itens é apenas uma expectativa aritmética; o total real de novos/alterados deve vir do diff por ID.

## 2. Modelo único de revisão offline

Cada exercício terá uma linha mestre com três trilhas independentes:

- `targets_review_status`: alvos musculares e coeficientes;
- `safety_review_status`: contraindicações, pain tags, regressões e substitutos;
- `media_review_status`: vídeo, variação demonstrada e playback.

Estados permitidos: `needs_review`, `approved`, `rejected`, `needs_more_info`. Nenhuma trilha herda aprovação das outras. Um vídeo correto não aprova targets; targets corretos não aprovam segurança.

Campos protegidos: `exercise_id`, nome e snapshot de origem. Campos revisáveis devem registrar revisor, data UTC, motivo e evidência. `ready_for_upsert` só pode ser verdadeiro para uma trilha `approved` e validada.

## 3. Trilha A — 716 exercícios com alvo único

### Regras técnicas

- preservar exatamente um alvo primário por exercício;
- primário usa coeficiente `1`;
- secundários usam coeficiente explícito entre `0` e `1`;
- `0,5` pode ser usado como heurística versionada para secundário somente após aprovação técnica, nunca como inferência automática em massa;
- não derivar pesos específicos de EMG isolada, nome do exercício ou anatomia intuitiva;
- não dividir LOAD externo entre músculos;
- não somar simultaneamente grupo pai, filho e alias para a mesma ocorrência;
- categorias funcionais como `Performance`, `Mobilidade` e `Estabilidade` não devem ocupar silenciosamente o mesmo eixo de grupamentos anatômicos.

### P0 técnico

Inspecionar primeiro as inconsistências já identificadas:

- `Rosca Scott Barra`: targets incompatíveis com flexão de cotovelo;
- `Remada Alta Barra`: ausência/inconsistência de deltoide lateral e trapézio;
- `Crucifixo na Máquina`: contribuição de tríceps potencialmente indevida;
- `Kettlebell swing`: único alvo funcional `Performance`;
- `Mobilidade Sapinho` e `Prancha com pés no TRX`: categoria funcional no eixo muscular;
- `Pulldown barra/corda`: bíceps possivelmente excessivo se a execução for de braços estendidos;
- `Flexão de braço`: inconsistência interna entre variante comum e fechada;
- `Graviton Pronado`, `Serrote Banco` e `Step-up`: targets potencialmente incompletos.

Esses itens exigem inspeção do vídeo/execução e revisão biomecânica independente. Nome parecido não basta.

### Priorização do restante

- **P1:** compostos, exercícios de maior uso e movimentos com grande impacto no total semanal;
- **P2:** demais multiarticulares e acessórios com secundários biomecanicamente relevantes;
- **P3:** isolados, mobilidade, estabilidade e itens de baixa utilização.

Uso deve ser calculado por leitura agregada e sanitizada; não incluir nomes de alunos. Se a métrica de uso não estiver disponível, o item não sobe de prioridade por suposição.

Critério de aprovação: movimento, implemento, pegada/largura, apoio, postura, lateralidade e configuração da máquina conferidos; taxonomia canônica escolhida; coeficientes justificados; soma não usada como falsa medida de estímulo.

## 4. Trilha B — 489 lacunas de segurança

Ausência de tags não significa automaticamente que um exercício precise de contraindicação. A revisão deve distinguir:

- `unknown`: ainda não revisado;
- `explicit_none`: revisado e nenhuma tag se aplica;
- `has_metadata`: conteúdo aprovado;
- `needs_more_info`: execução/variação insuficiente para decidir.

Prioridade:

- **P1:** overhead carregado, carga axial/hinge, joelho profundo/carregado, pliometria/impacto e movimentos com múltiplas regiões de risco;
- **P2:** compostos moderados e padrões essenciais que precisam de alternativas seguras;
- **P3:** isolados e acessórios.

Regras existentes do Review Board continuam válidas: IA não aprova clinicamente; exercício e substitutos precisam existir; conflitos e mudanças de padrão exigem justificativa; linguagem não pode diagnosticar. O estado vivo de 926 linhas de metadata substitui a premissa antiga de `exercise_metadata = 0`, que deve ser tratada como histórica.

## 5. Trilha C — 72 clusters / 179 exercícios com vídeo duplicado

Revisar 100% dos 72 clusters. Para cada exercício afetado, conferir:

- título completo e variação correta;
- movimento, equipamento, pegada, apoio e lateralidade;
- se o compartilhamento é legítimo ou mascara vídeo incorreto;
- carregamento, play, mute, seek, retorno após suspensão e navegação móvel;
- origem efetivamente usada pela UI (`youtube_video_id`, URL direta ou fallback).

Estados adicionais do cluster: `legitimate_shared_demo`, `incorrect_duplicate`, `playback_failure`, `needs_recording`. Não substituir IDs em massa por similaridade nominal. Depois dos duplicados, fazer amostra estratificada dos demais 144 MP4 CloudFront, 21 URLs diretas YouTube e IDs únicos.

## 6. Artefatos a produzir

Sem alterar os arquivos v1, gerar:

1. `library-curation-v2-catalog-snapshot.json` — snapshot sanitizado + hashes;
2. `library-curation-v2-reconciliation.csv` — diff dos 926 IDs;
3. `library-curation-v2-p0-review.csv` — inconsistências graves;
4. `library-curation-v2-p1|p2|p3-review.csv` — fila única com as três trilhas;
5. `library-curation-v2-video-clusters.csv` — 72 clusters e 179 exercícios;
6. relatórios dos validadores e manifests aprovados separados por trilha;
7. SQL `noop` somente para inspeção, gerado exclusivamente de manifestos aprovados.

O pipeline existente deve ser reutilizado para estados, return guard, validação e geração de approved manifest. Antes de qualquer implementação, os scripts precisam ser avaliados porque hoje foram desenhados principalmente para `exercise_metadata`; targets e mídia exigem schemas e builders separados para impedir escrita cruzada.

## 7. Gates antes de qualquer escrita remota

- [ ] snapshot atual reconciliado 926/926 por ID;
- [ ] 100% do P0 revisado por biomecânica independente;
- [ ] todas as linhas do lote com decisão humana e evidência;
- [ ] nenhum `needs_review`/`needs_more_info` no manifesto a aplicar;
- [ ] validator e return guard sem erro;
- [ ] diff antes/depois aprovado;
- [ ] backup imutável das tabelas e linhas-alvo, com hash;
- [ ] SQL revisado e executado primeiro em staging com rollback;
- [ ] reauditoria de targets, metadata, mídia e cálculos aprovada;
- [ ] testes de motor/UI e QA independente verdes;
- [ ] autorização explícita separada para produção.

Falha em qualquer gate mantém `NO-GO`. Aplicar o lote MFIT também continua proibido enquanto o catálogo não atingir 100% de cobertura determinística e QA verde.

## 8. Ordem recomendada

1. reconciliar 926 atuais × 749 pacotes antigos;
2. revisar P0 de targets e os 72 clusters de vídeo em paralelo, ambos offline;
3. revisar P1 de targets e metadata;
4. produzir approved manifests e SQL `noop` por trilha;
5. executar QA independente dos artefatos;
6. somente então avaliar backup e staging, mediante nova autorização operacional;
7. P2 e P3 repetem o mesmo ciclo, sem bulk update único.

## Estado final desta etapa

- Plano local: **PREPARADO**.
- Dados remotos: **INALTERADOS**.
- Bulk update: **NÃO AUTORIZADO / NÃO EXECUTADO**.
- Migration/deploy: **NÃO EXECUTADOS**.
- Próxima ação: construir o reconciliador offline v2 e os pacotes P0, preservando o pipeline v1.
