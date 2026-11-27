# BN Content — melhorias aprovadas em 27/11/2026

## Estado e limite de integração

Implementação local isolada em `codex/bn-content-feedback-release-20261127`, baseline `cbeb07d60f1a68603ba04cf65bf545c8838912df` (`codex/sett-international-checkout-20261125`). O `main` consultado nesta execução (`701a76b`) não continha o módulo BN Content. É necessário reconciliar a release com o destino de integração antes de abrir uma promoção; não transportar toda a release inadvertidamente para main.

Nenhum push, merge, migração remota ou deploy realizado. Nenhuma credencial nova foi necessária ou exibida. O trabalho do chat principal foi preservado.

## Checklist acumulado do escopo aprovado

- ✅ Três famílias selecionáveis antes de gerar: Editorial, Visual e Didático. A aprovação do Matheus abrange as três. Pranchas ilustram a direção; composição final usa o renderizador real, não as pranchas como imagem de saída.
- ✅ Fonte (Arial, Georgia ou títulos Georgia com corpo Arial), cores de fundo/letras/destaques e formatos 1080×1080, 1080×1350 e 1080×1920 editáveis.
- ✅ Controles globais e por slide de alinhamento, posição vertical, área da imagem, enquadramento e símbolos. Alternância de composição nos slides internos; CTA centralizado por padrão. Destaques continuam aceitando `==palavras==`, negrito e itálico.
- ✅ Upload inicial de capa PNG/JPEG e documentos de apoio; upload por slide e prints de referência. Imagens privadas com namespace por post e limites de tamanho. Documentos entram como texto editável no briefing, sem guardar uma cópia separada do documento.
- ✅ Até oito referências com nove checkboxes independentes por referência. Combinação apenas dos critérios escolhidos; conflitos e critérios não identificados bloqueiam a aplicação e mostram aviso.
- ✅ Importação de capa pública acessível de post/reel do Instagram. Links privados, outros sites, bloqueios do Instagram ou outras páginas do carrossel usam print. Fontes são aproximadas pelas famílias suportadas, não identificadas ou instaladas com precisão tipográfica.
- ✅ Geração de imagens pode acompanhar a criação do texto e pode ser repetida individualmente. Salva o rascunho antes de solicitar imagem e associa o resultado com controle de versão. Geração automática respeita slides sem área de imagem. Imagens também aparecem em slides claros e CTA.
- ✅ Falha de associação mantém a imagem gerada na edição local; conflito anterior ao pedido impede gasto com o provedor. Cliques repetidos na mesma tela são bloqueados durante a operação. Isso não equivale a idempotência distribuída entre dispositivos.
- ✅ Revisão textual preserva as configurações e imagens dos slides correspondentes por posição. Mudanças de quantidade/ordem de slides exigem conferência editorial antes de aprovar.
- ✅ Prévia e PNGs do ZIP usam o mesmo renderizador. Falhas de imagem ou texto sem espaço impedem ZIP parcial. Conteúdos antigos continuam válidos.
- ✅ Comparação do ACK de salvamento considera equivalência JSON, incluindo novas opções/referências quando o banco reordena suas chaves.
- ❌ Homologação hospedada (aguardando): aplicar a migração e publicar a função/frontend apenas em ambiente de teste aprovado; validar credencial real, cotas, geração com pixels reais do provedor, leitura multimodal de referência real e reabertura autenticada dos uploads. Os testes de integração locais usam provedor e banco simulados/isolados e não comprovam a conta real.
- ❌ Integração/publicação (aguardando): reconciliar a branch com o destino correto, revisão independente e aprovação da promoção. Não houve deploy nesta execução.

## Validação local

Os logs completos ficam em `output/bn-content-cloud-qa/` e `/tmp/bn-feedback-*.log` no checkout isolado. Apenas dados sintéticos nos testes.

- Frontend: 70 testes em sete arquivos, incluindo conflitos, uploads, combinação seletiva, clique repetido e ACK JSONB reordenado.
- Edge/provider/referências: 48 testes Deno, incluindo autenticação master, caminho privado por post, limites de arquivos, envio multimodal e rejeição de destinos fora da allowlist.
- Banco isolado: contrato PGlite com 70 verificações; aplica também `20261127083152_bn_content_visual_options.sql`, aceita opções válidas e rejeita família inválida, além dos gates existentes de RLS/CAS/cota/storage.
- Navegador: 48 verificações aprovadas, zero falhas e fontes inalteradas durante o teste; roteiro local em Chrome a 390×844 e 1440×1000, incluindo editor real, três famílias, salvamento/reabertura, exportação PNG/ZIP, dimensões, limites do texto e ausência de overflow horizontal. APIs e autenticação simuladas.
- TypeScript (`tsc -p tsconfig.app.json --noEmit`), lint dos componentes/testes alterados, `git diff --check` e build completo aprovados. O build final passou também nos gates de backend, consentimento semanal e orçamento do bundle.

Revisão de diff feita pelo próprio executor. Não houve revisor externo ou subagente nesta conversa lateral; revisão independente continua no gate de integração.

## Ordem para homologar e rollback

1. Conferir branch/commit e divergência com main; separar somente os arquivos deste escopo na integração pretendida.
2. No ambiente de teste autorizado, aplicar a migração opcional de configuração visual. Sem excluir posts ou dados existentes.
3. Publicar `bn-content-studio` com os módulos compartilhados e o suporte a upload/referência.
4. Publicar o frontend correspondente e confirmar autenticação master e URLs assinadas.
5. Gerar um conteúdo sintético com cada família, testar imagem e print reais, salvar/reabrir e comparar ZIP/prévia.
6. Só promover após QA e autorização. Para rollback de runtime, restaurar frontend/função anteriores preservando a validação ampliada no banco: ela aceita conteúdo legado e evita invalidar posts novos. Não remover os campos novos dos posts nem executar migração destrutiva.

## Homologação e publicação autorizadas — 27/11/2026

Integração isolada refeita diretamente sobre a produção `5b357d57880d160d01d38b056e95374461e060d1` na branch `codex/bn-content-production-20261127`; apenas BN Content e a versão do cache do service worker foram incluídos. Checkout internacional e demais mudanças posteriores à produção foram excluídos.

- Testes na base de produção: 70 frontend, 50 Edge/provider/referências, 70 verificações PGlite; TypeScript e build aprovados.
- Staging real: três famílias com imagens geradas pelo provedor, upload privado, extração visual e reabertura autenticada do rascunho aprovados. A chave de teste tem o mesmo fingerprint da chave de BN Content já configurada em produção; não houve rotação de produção.
- Navegador hospedado real: 1440 e 390 px, login sintético master, salvar/recarregar/exportar ZIP aprovados; zero erros de página e sem overflow horizontal. Evidências locais em `output/bn-content-hosted-browser-report.json`.
- Corrigido conflito de versão que usava SQLSTATE 40001 e provocava retries infinitos no PostgREST hospedado; a nova migração usa PT409 e mantém a autorização master e o incremento atômico de versão. Ver [explicação oficial do Supabase](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).
- Conversão base64 de imagens trocada por Buffer para evitar expansão em arrays de caracteres. Referências sem texto omitem campos não observáveis; símbolos não importam descrições de objetos.
- CORS inclui somente os domínios explícitos de produção/homologação e seus previews válidos; origens desconhecidas continuam bloqueadas.
- Service worker passa de cache v19 para v20; mantém o fallback entre gerações existente.
- Antes da produção: dois posts, checksum `1efa47c740de27271dc12bd47c442f29`. Função remota e definição do validador foram respaldadas fora dos arquivos versionados. Corpo da RPC de produção conferido contra a base revisada antes da substituição.

Publicação ainda depende da conclusão dos passos remotos e da conferência final abaixo.
