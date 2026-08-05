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
- Apos a importacao, o cardapio separa fonte do documento, orientacoes gerais e refeicoes antes de renderizar o conteudo.
- As refeicoes importadas seguem a mesma hierarquia visual dos cards nutricionais gerados pelo app: cabecalho, horario, descricao, opcoes e observacoes.
- Alternativas curtas aparecem como opcoes escaneaveis; quantidades, substituicoes e instrucoes longas ficam em blocos de leitura, sem transformar paragrafos em etiquetas.
- Separadores como `ou`, titulos em caixa alta e unidades do PDF sao normalizados sem alterar as quantidades prescritas pelo nutricionista.
- A logo mantem proporcao, nao estica e possui fallback para a marca padrao quando nao existe arquivo valido.

## Mobile

- O nome do assistente pode quebrar linha sem sobrepor o botao de fechar.
- O envio do PDF continua acessivel e o texto do arquivo pode quebrar linha dentro do container.
- Cards de refeicao mantem largura fluida e leitura vertical.
- A logo usa `object-fit: contain` para preservar o enquadramento em espacos compactos.

## Estados e seguranca

- PDF textual: conteudo e extraido localmente e enviado ao motor deterministico de refeicoes.
- O parser reconhece cabecalhos com e sem acento e preserva ate 10 refeicoes e 32 itens por refeicao.
- O app nao inventa calorias ou macronutrientes para cardapios externos; exibe somente as informacoes efetivamente encontradas no documento.
- PDF escaneado ou sem camada de texto: o app explica a limitacao e oferece colar o texto, sem inventar refeicoes.
- Limites: 12 MB e 30 paginas.
- Erro de leitura: mensagem acionavel e nenhum plano parcial e salvo.
- A RPC de identidade retorna somente nome do assistente e nome da consultoria; dados privados da configuracao de IA nao sao expostos ao aluno.

## Verificacao

- Configuracao publica da BN confirmada como `BNITO` no backend canonico.
- Bundle de producao confirmado com `get_company_ai_identity`, `Enviar PDF do cardapio` e `save_external_plan`.
- Bundle de producao sem referencia ao projeto Supabase desativado.
- Conta tecnica isolada criada com nutricao e nutricionista habilitados; nenhum plano financeiro e nenhum dado de aluno real foram alterados.
- Suite: 302 testes aprovados, TypeScript, Deno check e build aprovados.

## Risco residual

- A automacao visual do Chrome ficou indisponivel durante a captura final. Os contratos, o parser, o bundle publicado e o fluxo autenticado foram verificados; a conta tecnica abaixo permite a conferencia visual manual imediata em producao.
