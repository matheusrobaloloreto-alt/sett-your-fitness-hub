# SETT — correção conjunta de chat e consulta de prescrições

Data: 30/10/2026. Estado: implementada e validada localmente com serviços de homologação. **Sem publicação em produção.**

## Resultado

1. O chat mantém a conversa e o rascunho durante a revalidação das permissões ao retornar à janela. O envio fica bloqueado até a validação terminar; erro tem opção de tentar novamente. Revogação efetiva de acesso, logout e troca de empresa continuam encerrando o conteúdo protegido. Arquivos escolhidos durante a espera podem ser retomados explicitamente. Destinatário e rascunho são conferidos novamente depois da espera, inclusive no envio protegido de acesso.
2. O aluno pode abrir **Consultar prescrições publicadas** e ler prescrições anteriores, separadamente da elegibilidade para executar o treino atual. A consulta mostra exercícios, métricas semanais, tipos de série e cadência. Não permite iniciar sessão, registrar cargas ou alterar o histórico. Matrícula vencida, ciclo vazio e renovação não são automaticamente alterados.

## Diagnóstico relacionado

O fechamento do chat estava associado à desmontagem do componente durante uma consulta temporária de permissões. No portal, novas condições de matrícula/ciclo ocultavam prescrições que continuavam armazenadas. A investigação dos casos reais foi somente de leitura; não houve exclusão, renovação ou ativação automática de treinos.

## Validação executada

- Regressão: **291/291 testes em 31 arquivos**.
- QA independente: **105/105 verificações de testes**, incluindo três testes adversariais. Há sobreposição com a bateria acima; não somar os números como testes distintos.
- Dois testes adversariais inicialmente encontraram cancelamento incorreto de envio protegido durante espera. O defeito foi corrigido e os mesmos testes passaram sem enfraquecer suas asserções.
- TypeScript e build aprovados; JavaScript inicial: 864.119 bytes, abaixo do limite de 875.000. Artefato com 268 arquivos e nenhuma credencial privilegiada detectada na varredura.
- Os 14 arquivos de fonte/teste da alteração foram congelados por SHA-256 e conferidos pelo QA e pela integração.
- Auth e REST reais de homologação: o aluno sintético acessou sua prescrição; outra empresa não conseguiu lê-la, inclusive por consulta direta ao treino.
- Navegador: treino atual continuou visível; a prescrição histórica abriu com exercícios e métricas, sem botões de execução ou gravação.
- Navegador: seletores reais de imagem, vídeo e áudio; três uploads no Storage retornaram 200. A conversa permaneceu aberta. O envio ao provedor foi deliberadamente desativado no ambiente de teste (503 controlado), e os três objetos temporários foram removidos e sua ausência confirmada por nova leitura. **Nenhuma mensagem externa enviada.**
- Retorno entre abas preservou o chat, mas não gerou consulta observável de permissões nesse navegador. O evento de foco e seus cenários de espera, falha e revogação foram exercitados nos testes de integração.

## Ambiente e limites

Preview local: http://127.0.0.1:57830 — usa dados sintéticos de homologação; envios externos e gravações operacionais bloqueados. Não substitui teste de entrega real pelo WhatsApp.

Somente na homologação, duas colunas nullable que já existem em produção foram alinhadas, sem backfill nem alteração das linhas existentes. Uma prescrição sintética histórica foi criada para o teste. Nenhuma alteração de schema, credencial, matrícula, prescrição, mensagem ou implantação em produção nesta execução. Backend, migrations e lockfile não foram alterados no candidato.

A cobertura não certifica todas as combinações de aparelho e rede. Não foram identificadas regressões nos fluxos testados; não é possível garantir risco zero.

## Checklist acumulado desta correção conjunta

- ✅ Diagnóstico dos dois relatos e relatório consolidado.
- ✅ Correção do ciclo de vida do chat, revalidação e proteção de destinatário.
- ✅ Consulta das prescrições históricas sem liberar treino vencido como atual.
- ✅ Testes, revisão independente, build e validação nativa em homologação.
- ❌ Publicação em produção (aguardando): candidato validado, ainda sem deploy. Próximo passo: publicar o pacote aprovado e verificar o comportamento em produção.
- ❌ Entrega real de mídia pelo provedor (aguardando): bloqueada intencionalmente nesta homologação. Próximo passo: teste controlado com destinatário autorizado após publicação.
- ❌ Conferência no dispositivo das alunas afetadas (aguardando): não houve login em contas reais. Próximo passo: confirmar a consulta após publicação; eventual renovação ou nova prescrição segue decisão do professor.
