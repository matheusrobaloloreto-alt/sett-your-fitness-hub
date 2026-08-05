# QA de design - BNITO e importacao de dieta

Data: 2026-08-05

## Escopo

- Assistente do aluno respeita a identidade configurada por empresa.
- A BN Performance Training exibe `BNITO`; `Setty` permanece apenas como fallback quando a empresa nao possui configuracao.
- Aluno que informou acompanhamento com nutricionista pode importar um cardapio em PDF na area de Nutricao.
- A logo configurada pela empresa e usada na navegacao, com normalizacao de tamanho e remocao conservadora de fundo uniforme.

## Desktop

- O modal do assistente usa o nome retornado pela configuracao da empresa no titulo, missao, lembrete, contexto e apresentacao.
- O botao `Enviar PDF do cardapio` fica junto ao estado do plano nutricional externo, sem competir com a navegacao principal.
- Durante a leitura do PDF, o botao comunica processamento e impede envios duplicados.
- Apos a importacao, as refeicoes seguem o mesmo padrao visual dos cards nutricionais existentes.
- A logo mantem proporcao, nao estica e possui fallback para a marca padrao quando nao existe arquivo valido.

## Mobile

- O nome do assistente pode quebrar linha sem sobrepor o botao de fechar.
- O envio do PDF continua acessivel e o texto do arquivo pode quebrar linha dentro do container.
- Cards de refeicao mantem largura fluida e leitura vertical.
- A logo usa `object-fit: contain` para preservar o enquadramento em espacos compactos.

## Estados e seguranca

- PDF textual: conteudo e extraido localmente e enviado ao motor deterministico de refeicoes.
- PDF escaneado ou sem camada de texto: o app explica a limitacao e oferece colar o texto, sem inventar refeicoes.
- Limites: 12 MB e 30 paginas.
- Erro de leitura: mensagem acionavel e nenhum plano parcial e salvo.
- A RPC de identidade retorna somente nome do assistente e nome da consultoria; dados privados da configuracao de IA nao sao expostos ao aluno.

## Verificacao

- Configuracao publica da BN confirmada como `BNITO` no backend canonico.
- Bundle de producao confirmado com `get_company_ai_identity`, `Enviar PDF do cardapio` e `save_external_plan`.
- Bundle de producao sem referencia ao projeto Supabase desativado.
- Conta tecnica isolada criada com nutricao e nutricionista habilitados; nenhum plano financeiro e nenhum dado de aluno real foram alterados.
- Suite: 297 testes aprovados, TypeScript e build aprovados.

## Risco residual

- A automacao visual do Chrome ficou instavel durante a captura final. Os contratos, o bundle publicado e o fluxo autenticado foram verificados; a conta tecnica abaixo permite a conferencia visual manual imediata em producao.
