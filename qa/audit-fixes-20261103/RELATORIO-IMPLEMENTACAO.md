# SETT — correções da auditoria e regressão integrada

Data: 03/11/2026. Status: publicado em produção; validação autenticada pós-publicação concluída nas telas descritas abaixo. Fonte publicada: `1158e137062dd612c10f98726828295790b7dc3b`.

## Escopo e fronteira
A auditoria original distingue defeitos, diferenças legítimas de população e alegações não confirmadas. O plano aprovado é `docs/superpowers/plans/2026-11-03-sett-correcoes-auditoria-e-seletor.md`. A autorização posterior do usuário permite publicar antes da validação visual, que será retomada depois; testes automatizados e revisão independente continuam obrigatórios.

## Alterações publicadas

| Apontamentos | Correção ou decisão preservada |
|---|---|
| Seletor/player da investigação lateral | Botões reais separados para adicionar/assistir, destino por chave estável, confirmação somente após adição, metadados YouTube preservados e chaves locais removidas da persistência. Vídeo nativo para arquivos, embeds reconhecidos, erro/retry/link externo e descarte de respostas obsoletas. Assinatura Storage continua autorizada; não há fallback público após negativa. |
| 1/11 | Financeiro local separado da projeção externa; estados parciais/erro; datas qualificadas por origem; prevenção de dupla contagem preservada. Ações manuais invalidadas na troca de contexto, lock de preflight e ACK estrito. Nenhuma cobrança, nota ou reconciliação real executada para testar. |
| 2/3/12/30 | Carteira/equipe distinguem loading, falha e vazio; enriquecimento opcional não segura lista base. Coordenador aplica empresa/ator/papel e descarta leituras/ACKs antigos. Carteira total e treinadores têm denominadores explícitos. Não se força igualdade entre populações diferentes. |
| 4/28 | Plano escolhido e contrato vigente identificados separadamente; metadado ausente não vira ausência de contrato. Busca normaliza consulta e nome sem mudar o dado salvo. |
| 5/29 | Análise separa conclusão de sessões, volume e distribuição por snapshots históricos. Volume prescrito resolve a semana vigente preservando legado. Comparações só aparecem com bases verificadamente compatíveis; sem remapear histórico pelo índice atual de exercício. |
| 6/7 | Governança identifica titular legado como pendente, sem promovê-lo automaticamente. Inicialização restrita ao próprio titular já admin/membro, com CAS, auditoria e tratamento de pedidos vencidos. Identificação humana substitui UUID completo. DDL validada em staging e aplicada em produção com ACLs preservadas. |
| 8 | Banner de instalação e Conversas reservam espaço coordenado; banner se oculta durante chat aberto. Sem limpar dados locais do aluno. |
| 9/10/31/34 | Revisado do feedback de ciclo exige confirmação da gravação e preserva pendência na falha. Datas distinguem ocorrências legítimas. Alerta de envio incerto só após leitura confirmada com ocorrências. Acesso de diagnóstico é explicitado; nenhum reenvio ou nova permissão automática. |
| 13/14/15 | Histórico/substituído tem rótulo próprio; avaliação funcional, registro manual e anexo são fontes distintas. Bloqueio de nova prescrição explica elegibilidade comercial sem esconder histórico nem alterar matrícula. |
| 16/17/20/21/22/23/24/32 | Rótulos, acentos de apresentação, datas, códigos de planos/layouts e loading do master/acervo. Taxonomia canônica, slugs e JSON de defaults mantêm compatibilidade; acentos não alteram chaves de cálculo. Posts de títulos iguais não são apagados. |
| 18/25/26/27 | Nomes acessíveis para ações; links de Configurações explícitos; aba do aluno na URL com voltar/avançar; rota desconhecida pública oferece início. Host SPA e deep links preservados. Não foi criada uma página geral de detalhe de exercício. |
| 19/33/35 | Não há autorização para preencher catálogo ou interpretar PDF como avaliação apenas pelo nome. Os globais tinham referência de mídia na auditoria, sem certificação de todos os links. Seções vazias/rota individual inválida não justificam criar dados ou abrir acesso por slug. |

## Regressão adicional recebida durante integração
A investigação lateral confirmou matrícula sem plano vinculado interrompendo o carregamento administrativo e continuidade do aluno bloqueada antes da aplicação da política de vencimento. Integração local concluída, incluindo barreiras de cancelamento/inativação e comparação dos50 perfis:27→41, zero perdas ou trocas nos27 ciclos anteriores. A rota alternativa de consulta também foi alinhada ao reader estrito de política por ator real; sem criar planos, contratos ou prescrições. Nomes e detalhes permanecem no relatório local restrito da investigação lateral, fora do Git.

## Evidências finais
- CI integral do commit publicado: **329 arquivos passaram, 3 ignorados; 2781 testes passaram, 10 ignorados**. Static gates e build passaram. [Execução](https://github.com/matheusrobaloloreto-alt/sett-your-fitness-hub/actions/runs/41666171755).
- TypeScript real (`tsc -b`) e lint integrais: exit 0; lint com 42 avisos e nenhum erro. Build de produção congelado, sem mudanças de fonte durante geração.
- Staging nativo: 13 verificações Governance v1 e 20 v2; Auth/REST, CAS, replay, auditoria e ACLs. Persistência A/B/C com exercícios empresa/global e métricas relidas; conflitos e escrita de outra empresa rejeitados. Assinatura Storage confirmada na fixture.
- Duas migrações de governança aplicadas em produção; definições coincidem com staging. ACLs, proprietário das funções e contagens de titularidade preservados. Nenhum proprietário legado promovido automaticamente.
- Frontend: deploy `6aea026196cbdb408153a28a`, SW `sett-cache-v17`. **256/256 hashes servidos** conferidos com artefato local. App: https://www.settapp.com.br.
- Navegador interno autenticado: bundle atual confirmado; dashboard 36 ativos; Carteira 77 perfis/36 ativos; Equipe quatro membros, dois treinadores. Financeiro carregou registros e qualificou previsão/data desconhecida sem afirmar liquidação. Governança exibiu titular legado pendente e identificação humana.
- Consulta publicada de dois casos antes afetados confirmou treinos A/B/C: continuidade vencida mantida até substituição e matrícula sem plano de catálogo. Perfil administrativo carregou e aba Programa atualizou URL para `?tab=program`.
- Biblioteca do editor: botões Adicionar/Assistir separados; Assistir abriu embed YouTube correto e não alterou a contagem de oito exercícios. Retorno ao editor sem salvar. Reprodução audiovisual completa de todos os provedores/dispositivos NÃO certificada.
- Comparação dos 50 perfis operacionais: candidatos digitais **27→41**, sem perda ou troca dos 27 originais; 100 barreiras de cancelamento/inativação e 50 probes de tenant. Não foi login de cada aluno nem execução de treino real.
- Três arquivos/10 testes condicionais ignorados no CI: governança possui execução específica local/nativa; harness SQL opt-in da metodologia não foi executado nesta rodada. Baseline inicial e primeiro CI falharam; resultados finais acima substituem o gate, sem apagar o histórico do diagnóstico.
- Não houve mensagem a aluno, cobrança, nota fiscal, alteração de contrato, treino ou titularidade real durante QA. Evidências técnicas detalhadas em `output/sett-audit-fixes-20261103.private/` (ignorado pelo Git).

## Fila acumulada
- ✅ Auditoria dos 35 relatos e plano, diferenciando defeitos de populações legítimas e hipóteses.
- ✅ Implementação, revisão independente, regressão integral, build e ensaios nativos.
- ✅ Migrações e frontend publicados; artefatos remotos conferidos.
- ✅ Validação autenticada de Carteira, Equipe, Financeiro, Governança, perfil, consulta de treinos e abertura do player.
- ❌ Reprodução integral em dispositivos reais e todos os links de mídia (aguardando): abertura/classificação verificadas, mas não equivalem a reprodução audiovisual completa. Próximo passo: matriz controlada de provedores/dispositivos, sem alterar fichas reais.
- ❌ Conteúdo inexistente em registros antigos (aguardando): cinco perfis literalmente ativos sem matrícula/treino/histórico digital exigem classificação legado/teste ou primeira prescrição. Há um caso em renovação com histórico exclusivamente externo. Nomes estão somente no relatório local restrito, fora do Git; não inventar planos para zerar indicador.
- ❌ Acabamentos residuais (aguardando): cópia antiga de legado no cartão inline do Master e alguns rótulos legados/decimais ainda aparecem em superfícies secundárias. Não são erro de bundle nem perda de treino; consolidar apresentação sem alterar chaves canônicas.

## Achado adicional de servidor, separado do lote
A leitura independente de `start_workout_session` e seus triggers confirmou autorização por dono/empresa, mas não confirmou barreira server-side para status inativo/cancelado, prescrição removida/substituída ou preferência hide. O frontend mantém essas barreiras. Este comportamento preexistente não foi alterado neste lote.

❌ Guard de novo início no servidor (aguardando): implementar em alteração específica, preservando sessão já aberta, conclusão, replay idempotente e retomada; exigir testes SQL/transacionais e GoTrue antes de publicar. Não executar cancelamentos ou reescrever sessões para demonstrar a hipótese. A compatibilidade do keep por data vencida com o servidor atual foi confirmada em leitura, não por execução em aluno real.

Pagamentos externos não foram certificados por reconciliação real; vídeos do catálogo não foram todos reproduzidos. Casos não comprovados não foram tratados como perda de dados. Pendências descartadas anteriormente pelo usuário não são reabertas por este relatório.
