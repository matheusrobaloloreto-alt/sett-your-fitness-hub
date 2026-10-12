# BN Content no SETT - 2026-10-12

## Pedido E Causa

Disponibilizar a criacao e a edicao do BN Content para qualquer usuario com
perfil Master no SETT, sem depender do computador do Matheus.

O painel antigo hospedava somente o acervo privado. O botao do editor abria
`http://127.0.0.1:8787/`, isto e, o computador de quem clicava. O servidor Python
local nao estava publicado permanentemente. Expor esse servidor ou manter um
tunel temporario nao resolveria autenticacao, persistencia e edicao simultanea.

Publicacao autorizada pelo usuario apos os testes. Nenhuma assinatura nova foi
criada; geracao usa a conta Gemini existente.

## Implementacao

- Studio incorporado a `/master/bn-content`, com abas Studio, Acervo e Calendario.
- Criacao manual e geracao/revisao de texto, edicao de slides, legenda e hashtags.
- Geracao de fundos por slide, salvos em Storage privado e associados ao post.
- Rascunhos compartilhados entre Masters, com reabertura e controle de versao.
- Conflito de edicao retorna 409 e preserva a edicao local, sem sobrescrita.
- Aprovacao exige confirmacao positiva do servidor; nao publica em redes sociais.
- Exportacao das artes PNG, legenda TXT e especificacao JSON em um unico ZIP,
  evitando bloqueio de downloads multiplos do Chrome. Usa `fflate@0.8.3`, que ja
  existia transitivamente, promovido a dependencia direta e carregado sob demanda.
- Calendario compartilhado persistido, de uma a seis semanas.
- Acervo privado anterior mantido sem alterar seus objetos ou politicas.
- Chave Gemini somente na edge function; nenhum secret no frontend ou no Git.
- Auth.getUser e papel Master verificados antes de dados, service client ou custos.
- RLS, RPCs restritas e Storage privado; quotas atomicas de 30 textos e 10 imagens
  por Master por hora UTC, inclusive tentativas com falha no provedor.
- Service worker atualizado para `sett-cache-v9`.

O renderer web utiliza a doutrina visual L1-L4 e a logo canonica. Utiliza fontes
web disponiveis (Arial/Georgia), nao promete identidade pixel a pixel com o
renderer Pillow/macOS. O acervo antigo continua sendo arquivo visual, nao foi
convertido automaticamente em rascunhos editaveis. Renderizacao de PNG nao e
geracao de video nem publicacao automatica no Instagram.

## Validacao Local

- TypeScript e lint dos arquivos alterados: aprovados.
- Testes focados frontend/renderer/ZIP: 47 aprovados na reexecucao serial final.
- Backend Deno: 42 aprovados, reexecutados pelo root.
- Migration real no PGlite: 70 verificacoes aprovadas, reexecutadas pelo root.
- QA independente: 42 verificacoes aprovadas em 390x844 e 1440x1000.
- PNGs 1080x1350 e 1080x1920: pixels nao vazios e texto dentro dos limites.
- Contraste do post selecionado corrigido e retestado.
- Revisao independente de diff/seguranca: sem P1/P2 remanescente no escopo local.
- Build final com ZIP e gate de performance: aprovados; scripts iniciais 847274 bytes.
- Suite completa isolada antes do patch ZIP: 201 arquivos aprovados, 1482 testes
  aprovados e 7 ignorados.
- Lint do codigo-fonte: zero erros e 43 avisos preexistentes. Excluidos `output/**`
  e `test-results/**`, que contem artefatos gerados e dependencias de fixtures.
- Verificacao autenticada remota: geracao de texto real, salvamento v1,
  geracao de uma imagem, associacao e salvamento v2, reload e reabertura aprovados.
- PNG real baixado pelo Chrome: 1080x1350, imagem e texto inspecionados visualmente.
- Acesso anonimo a funcao: HTTP 401. URL publica da imagem privada: HTTP 400,
  sem bytes da imagem. Bucket privado e objeto nao vazio conferidos no banco.
- Exportacao em lote: Chrome bloqueou os arquivos depois do primeiro PNG;
  patch de download unico aprovado pelo QA independente local e publicado.
  46 checks em Chromium (390x844 e 1440x1000): exatamente um
  download por exportacao, seis ZIPs abertos, 18 PNGs decodificados, dimensoes,
  pixels, CRC, legenda e JSON conferidos; falha de asset produz zero downloads.
- Acervo ao vivo: 19 posts anteriores visiveis na sessao Master de producao.
- Reteste real apos deploy ZIP: Chrome baixou um unico arquivo de 2263049 bytes,
  contendo os seis PNGs, legenda TXT e JSON. `unzip -t` aprovou todos os oito
  arquivos. Nenhuma permissao adicional para downloads multiplos foi concedida.
- Calendario real de uma semana e uma publicacao gerado, salvo e reaberto apos
  reload. Conteudo tecnico permanece interno, sem publicacao social.
- Screenshot de producao: `output/bn-content-production-20261012.jpg`.
- Uma rodada de testes ficou suspensa pelo ambiente e expirou no canal do worker;
  a reexecucao serial final concluiu os 47 testes, sem falhas de assercao.

Testes com fixtures nao comprovam login real nem geracao remota. Evidencias
locais ficam em `output/bn-content-cloud-qa/`, fora do commit e do deploy.

## Publicacao E Rollback

Worktree: `sett-load-save-release-20260928`; branch
`codex/sett-load-save-release-20260928`; baseline
`782d4bb270a0c1f619496d9ea82c142c78f16619`.

Destino: Supabase `zshrcgbyhzxpnlccssyz` e Netlify
`9a061d2e-ee2c-444b-aa69-fe262caf0246`, dominio `www.settapp.com.br`.

Estado final: cloud publicada e fluxo autenticado validado em producao.
Migration `20261012074421_bn_content_studio_cloud` aplicada; edge
`bn-content-studio` ACTIVE v1 com `verify_jwt=true`, mais auth e papel no handler.
Commit inicial de produto `7df72e4`; correcao ZIP `0869701`, ambos enviados para
a branch remota. Netlify final de producao `6acc97ce0b9573ae13c2bfa1`, estado
`ready` e dominio confirmado, titulo `SETT BN Content cloud ZIP 0869701`.
Deploy inicial cloud `6acc90875073340c18b4648c` preservado no historico.
Deploy anterior para rollback: `6ac926a677f56442466e1e2f`.

Rollback: restaurar o frontend anterior; desabilitar somente a geracao nova se
necessario. Preservar as tabelas e o bucket novos para recuperacao. Nao apagar
conteudo, acervo, matriculas ou treinos para reverter esta entrega.

## Limites E Pendencias

- Validacao no dispositivo da socia depende do acesso dela; nao simular essa prova.
- Conexao de automacao com Chrome recuperada; ZIP, acervo e calendario conferidos
  ao vivo. A revisao de texto foi coberta nos testes automatizados, nao foi
  repetida contra o provedor em producao.
- Copia de rascunho com imagens vinculadas nao e oferecida, pois as imagens possuem
  namespace privado por post. A exportacao da edicao continua disponivel.
- Geracao depende da disponibilidade e do saldo da conta Gemini existente;
  edicao e salvamento manuais nao dependem do provedor.
- Manual tecnico, videos e demais itens explicitamente retirados pelo usuario
  nao foram reabertos nesta entrega. A entrega anterior de matriculas/Leads esta
  documentada em `ENTREGA-MATRICULAS-LEADS-2026-10-09.md`.

Skills aplicadas: ATENA, 121 Debugger Sistematico, 128 Acessibilidade Web e
Supabase; QA separado da implementacao.
