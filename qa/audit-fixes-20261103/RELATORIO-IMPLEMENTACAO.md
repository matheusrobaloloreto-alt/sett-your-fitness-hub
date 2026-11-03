# SETT — correções da auditoria e regressão integrada

Data: 03/11/2026. Status: candidato em validação; sem publicação desta rodada até este checkpoint.

## Escopo e fronteira
A auditoria original distingue defeitos, diferenças legítimas de população e alegações não confirmadas. O plano aprovado é `docs/superpowers/plans/2026-11-03-sett-correcoes-auditoria-e-seletor.md`. A autorização posterior do usuário permite publicar antes da validação visual, que será retomada depois; testes automatizados e revisão independente continuam obrigatórios.

## Alterações implementadas localmente

| Apontamentos | Correção ou decisão preservada |
|---|---|
| Seletor/player da investigação lateral | Botões reais separados para adicionar/assistir, destino por chave estável, confirmação somente após adição, metadados YouTube preservados e chaves locais removidas da persistência. Vídeo nativo para arquivos, embeds reconhecidos, erro/retry/link externo e descarte de respostas obsoletas. Assinatura Storage continua autorizada; não há fallback público após negativa. |
| 1/11 | Financeiro local separado da projeção externa; estados parciais/erro; datas qualificadas por origem; prevenção de dupla contagem preservada. Ações manuais invalidadas na troca de contexto, lock de preflight e ACK estrito. Nenhuma cobrança, nota ou reconciliação real executada para testar. |
| 2/3/12/30 | Carteira/equipe distinguem loading, falha e vazio; enriquecimento opcional não segura lista base. Coordenador aplica empresa/ator/papel e descarta leituras/ACKs antigos. Carteira total e treinadores têm denominadores explícitos. Não se força igualdade entre populações diferentes. |
| 4/28 | Plano escolhido e contrato vigente identificados separadamente; metadado ausente não vira ausência de contrato. Busca normaliza consulta e nome sem mudar o dado salvo. |
| 5/29 | Análise separa conclusão de sessões, volume e distribuição por snapshots históricos. Volume prescrito resolve a semana vigente preservando legado. Comparações só aparecem com bases verificadamente compatíveis; sem remapear histórico pelo índice atual de exercício. |
| 6/7 | Governança identifica titular legado como pendente, sem promovê-lo automaticamente. Inicialização restrita ao próprio titular já admin/membro, com CAS, auditoria e tratamento de pedidos vencidos. Identificação humana substitui UUID completo. DDL validada em staging; produção pendente. |
| 8 | Banner de instalação e Conversas reservam espaço coordenado; banner se oculta durante chat aberto. Sem limpar dados locais do aluno. |
| 9/10/31/34 | Revisado do feedback de ciclo exige confirmação da gravação e preserva pendência na falha. Datas distinguem ocorrências legítimas. Alerta de envio incerto só após leitura confirmada com ocorrências. Acesso de diagnóstico é explicitado; nenhum reenvio ou nova permissão automática. |
| 13/14/15 | Histórico/substituído tem rótulo próprio; avaliação funcional, registro manual e anexo são fontes distintas. Bloqueio de nova prescrição explica elegibilidade comercial sem esconder histórico nem alterar matrícula. |
| 16/17/20/21/22/23/24/32 | Rótulos, acentos de apresentação, datas, códigos de planos/layouts e loading do master/acervo. Taxonomia canônica, slugs e JSON de defaults mantêm compatibilidade; acentos não alteram chaves de cálculo. Posts de títulos iguais não são apagados. |
| 18/25/26/27 | Nomes acessíveis para ações; links de Configurações explícitos; aba do aluno na URL com voltar/avançar; rota desconhecida pública oferece início. Host SPA e deep links preservados. Não foi criada uma página geral de detalhe de exercício. |
| 19/33/35 | Não há autorização para preencher catálogo ou interpretar PDF como avaliação apenas pelo nome. Os globais tinham referência de mídia na auditoria, sem certificação de todos os links. Seções vazias/rota individual inválida não justificam criar dados ou abrir acesso por slug. |

## Regressão adicional recebida durante integração
A investigação lateral confirmou matrícula sem plano vinculado interrompendo o carregamento administrativo e continuidade do aluno bloqueada antes da aplicação da política de vencimento. Integração local concluída, incluindo barreiras de cancelamento/inativação e comparação dos50 perfis:27→41, zero perdas ou trocas nos27 ciclos anteriores. A rota alternativa de consulta também foi alinhada ao reader estrito de política por ator real; sem criar planos, contratos ou prescrições. Nomes e detalhes permanecem no relatório local restrito da investigação lateral, fora do Git.

## Evidências e limites atuais
- TypeScript e lint integrais passaram antes da integração lateral final; nova execução será registrada após freeze final. Lint: zero erros, 43 avisos existentes.
- Staging nativo: 13 verificações Governance v1 e20 v2; Auth/REST, CAS, replay, auditoria, permissões e ACLs. Persistência nativa A/B/C com catálogo local/global e métricas idênticas, conflito e escrita de outra empresa rejeitados. Storage assinou o objeto de vídeo sintético.
- Migrações receberam apenas limpeza de LF final após staging; equivalência de conteúdo foi revisada independentemente. Nenhuma DDL em produção nesta rodada até este checkpoint.
- Baseline local imutável:315 arquivos, 32 falharam/281 passaram/2 skipped;79 testes falharam/2499 passaram/9 skipped e um erro de worker. Host congestionado; não constitui suíte verde.
- Primeiro CI do candidato: build e static gates passaram; aplicação310 arquivos passaram/18 falharam/3 skipped;2672 testes passaram/43 falharam/10 skipped. Detectou regressão real de chaves de taxonomia e adapters/contratos desatualizados. Correções direcionadas executadas, sem reduzir a suíte; novo CI completo ainda pendente.
- Navegador interno indisponível na ferramenta. Preview anterior foi abortado pelo guard de alteração de fontes durante build e não ficou acessível. Nenhuma validação visual é inferida de HTTP, testes DOM ou registro de deploy.

## Fila acumulada
- ✅ Auditoria dos35 relatos e plano com itens reais versus condicionais.
- ✅ Implementação por owners, revisão cruzada e testes direcionados.
- ✅ Ensaios nativos de Auth/REST/Storage em fixtures de staging.
- ✅ Continuidade integrada localmente: comparação de não-regressão e revisão independente dos sete arquivos concluídas; rota alternativa aguarda QA final.
- ❌ CI completo final, novo build congelado e verificação estática (aguardando): dependem do freeze da integração.
- ❌ Migrações e frontend em produção (aguardando): publicar somente após gates técnicos. Autorização já existe.
- ❌ UI pós-publicação (bloqueado): ferramenta IAB indisponível; tentar novamente com endereço publicado, sem alegar reprodução audiovisual não observada.
- ❌ Conteúdo digital inexistente em alguns registros antigos (aguardando): confirmar legado/teste ou fornecer primeira prescrição; não é permitido inventar conteúdo profissional para zerar auditoria.

## Achado adicional de servidor, separado do lote
A leitura independente de `start_workout_session` e seus triggers confirmou autorização por dono/empresa, mas não confirmou barreira server-side para status inativo/cancelado, prescrição removida/substituída ou preferência hide. O frontend mantém essas barreiras. Este comportamento preexistente não foi alterado neste lote.

❌ Guard de novo início no servidor (aguardando): implementar em alteração específica, preservando sessão já aberta, conclusão, replay idempotente e retomada; exigir testes SQL/transacionais e GoTrue antes de publicar. Não executar cancelamentos ou reescrever sessões para demonstrar a hipótese. A compatibilidade do keep por data vencida com o servidor atual foi confirmada em leitura, não por execução em aluno real.

Pagamentos externos não foram certificados por reconciliação real; vídeos do catálogo não foram todos reproduzidos. Casos não comprovados não foram tratados como perda de dados. Pendências descartadas anteriormente pelo usuário não são reabertas por este relatório.
