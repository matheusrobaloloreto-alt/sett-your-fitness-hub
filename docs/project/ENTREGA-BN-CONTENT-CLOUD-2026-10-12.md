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
- Exportacao PNG, legenda TXT e especificacao JSON, com limites de texto sem corte.
- Calendario compartilhado persistido, de uma a seis semanas.
- Acervo privado anterior mantido sem alterar seus objetos ou politicas.
- Chave Gemini somente na edge function; nenhum secret no frontend ou no Git.
- Auth.getUser e papel Master verificados antes de dados, service client ou custos.
- RLS, RPCs restritas e Storage privado; quotas atomicas de 30 textos e 10 imagens
  por Master por hora UTC, inclusive tentativas com falha no provedor.
- Service worker atualizado para `sett-cache-v8`.

O renderer web utiliza a doutrina visual L1-L4 e a logo canonica. Utiliza fontes
web disponiveis (Arial/Georgia), nao promete identidade pixel a pixel com o
renderer Pillow/macOS. O acervo antigo continua sendo arquivo visual, nao foi
convertido automaticamente em rascunhos editaveis. Renderizacao de PNG nao e
geracao de video nem publicacao automatica no Instagram.

## Validacao Local

- TypeScript e lint dos arquivos alterados: aprovados.
- Testes focados frontend/renderer: 41 aprovados.
- Backend Deno: 42 aprovados, reexecutados pelo root.
- Migration real no PGlite: 70 verificacoes aprovadas, reexecutadas pelo root.
- QA independente: 42 verificacoes aprovadas em 390x844 e 1440x1000.
- PNGs 1080x1350 e 1080x1920: pixels nao vazios e texto dentro dos limites.
- Contraste do post selecionado corrigido e retestado.
- Revisao independente de diff/seguranca: sem P1/P2 remanescente no escopo local.
- Build final e gate de performance: aprovados; scripts iniciais 847237 bytes.
- Suite completa isolada: 201 arquivos aprovados, 1482 testes aprovados e 7 ignorados.
- Lint do codigo-fonte: zero erros e 43 avisos preexistentes. Excluidos `output/**`
  e `test-results/**`, que contem artefatos gerados e dependencias de fixtures.
- Verificacao autenticada remota: em conclusao.

Testes com fixtures nao comprovam login real nem geracao remota. Evidencias
locais ficam em `output/bn-content-cloud-qa/`, fora do commit e do deploy.

## Publicacao E Rollback

Worktree: `sett-load-save-release-20260928`; branch
`codex/sett-load-save-release-20260928`; baseline
`782d4bb270a0c1f619496d9ea82c142c78f16619`.

Destino: Supabase `zshrcgbyhzxpnlccssyz` e Netlify
`9a061d2e-ee2c-444b-aa69-fe262caf0246`, dominio `www.settapp.com.br`.

Estado neste checkpoint: gates locais encerrados, migration
`20261012074421_bn_content_studio_cloud` aplicada e funcao nova publicada.
Interface e fluxo autenticado remoto em conclusao. Deploy anterior confirmado:
`6ac926a677f56442466e1e2f`.

Rollback: restaurar o frontend anterior; desabilitar somente a geracao nova se
necessario. Preservar as tabelas e o bucket novos para recuperacao. Nao apagar
conteudo, acervo, matriculas ou treinos para reverter esta entrega.

## Limites E Pendencias

- Validacao no dispositivo da socia depende do acesso dela; nao simular essa prova.
- Copia de rascunho com imagens vinculadas nao e oferecida, pois as imagens possuem
  namespace privado por post. A exportacao da edicao continua disponivel.
- Geracao depende da disponibilidade e do saldo da conta Gemini existente;
  edicao e salvamento manuais nao dependem do provedor.
- Manual tecnico, videos e demais itens explicitamente retirados pelo usuario
  nao foram reabertos nesta entrega. A entrega anterior de matriculas/Leads esta
  documentada em `ENTREGA-MATRICULAS-LEADS-2026-10-09.md`.

Skills aplicadas: ATENA, 121 Debugger Sistematico, 128 Acessibilidade Web e
Supabase; QA separado da implementacao.
