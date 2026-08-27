# Guia de Gravação — Vídeos da Biblioteca BN

**Para os 3 modelos.** São 924 exercícios vivos divididos em 3 listas (308, 309 e 307), já agrupadas por
**estação da academia** — grave tudo de uma estação antes de trocar, é o que faz render.

Os códigos históricos `355` e `396` permanecem como lacunas intencionais: os exercícios correspondentes
não existem mais na biblioteca viva, não aparecem em treino/template ativo e foram registrados em
`roteiro-retirados.json`. Nunca reutilize esses códigos para outro exercício.

---

## Como funciona (é só isso)

Abra no celular a sua página — **`gravacao-modelo-N.html`**. Para cada exercício:

1. **Entre com sua conta SETT autorizada.** A página não contém token ou segredo de upload.
2. **Toque na imagem** para ver como se faz (o vídeo abre ali mesmo).
3. **Toque em 🎥 Gravar** — a câmera abre sozinha.
4. Grave, confirme. **O vídeo sobe automaticamente**, já ligado ao exercício certo.

Pronto. Sem renomear arquivo, sem mandar por WhatsApp, sem subir em pasta nenhuma. O botão fica
**verde "✓ enviado"** e o exercício é marcado como gravado. A barra no topo mostra o progresso.

- **Deu erro no envio?** O botão fica vermelho — é só tocar nele de novo.
- **Não gostou do take?** Toque em Gravar de novo no mesmo exercício. A regravação substitui a
  anterior; vale sempre a última.
- **Fechou a página?** O progresso fica salvo no celular. Continue de onde parou.
- **Wi-Fi:** prefira gravar conectado no Wi-Fi. Os vídeos sobem um de cada vez para não travar.

---

## Como gravar

| Item | Como fazer |
|---|---|
| **Celular** | Na **vertical** (em pé). É como o aluno vai ver no app. |
| **Duração** | **8 a 15 segundos.** 2 ou 3 repetições completas e bem feitas. |
| **Enquadramento** | Corpo inteiro, ou o suficiente para ver a articulação que trabalha. Sem cortar pé/cabeça no movimento. |
| **Ângulo** | O que mostra melhor a execução. Agachamento/terra = de lado. Remada/puxada = 45°. |
| **Câmera** | **Parada** (apoiada ou tripé). Nada de câmera na mão seguindo o movimento. |
| **Fundo** | O mais limpo possível. Evite gente passando atrás. |
| **Luz** | De frente ou de cima. Evite gravar contra a janela (fica silhueta). |
| **Roupa** | Que deixe ver as articulações. Sem roupa larga demais. |

### Não precisa se preocupar com:
- **Áudio** — o app remove o som de todos os vídeos. Pode conversar durante a gravação.
- **Edição** — não corte, não coloque música nem texto. Manda cru.
- **Capa** — o app gera sozinho, a partir do próprio vídeo.

### Execução
Faça o movimento **como ele deve ser feito** — é isso que o aluno vai copiar. Amplitude completa,
ritmo controlado, sem pressa. Se errar no meio, grave de novo (mais rápido que corrigir depois).

---

## Para o Matheus

### Publicar o que os modelos gravaram

```bash
node scripts/video-ingest.mjs --staging --dry-run
```

Esse primeiro comando baixa os takes e mostra matching/QA **sem enviar nem apagar nada**. Corrija
qualquer item ilegível, ambíguo ou fora dos limites. Só depois da revisão humana execute:

```bash
node scripts/video-ingest.mjs --staging
```

Essa segunda execução comprime, gera as capas e publica no app. A triagem crua e a reserva de replay
de cada exercício só são removidas depois que o commit daquele exercício for confirmado no banco.
Falha parcial nunca limpa o take que falhou. A qualquer momento:

```bash
node scripts/video-ingest.mjs --status
```

mostra a cobertura e o que ainda falta gravar.

### Como funciona por dentro
- A página usa a **câmera nativa** (`capture="environment"`), então sai na qualidade do aparelho,
  com estabilização e tudo mais — melhor do que gravar dentro do navegador.
- A página usa a sessão Supabase do operador. O servidor só libera gravação para `master` ou para
  um usuário explicitamente allowlisted e ainda vinculado à empresa BN configurada.
- O upload vai para o bucket **privado** `exercise-video-staging`. MIME, tamanho (64 MB), origem,
  exercício, frequência e replay são validados antes da assinatura; a política do bucket confere
  o arquivo real. Nenhum segredo operacional entra no HTML.
- Cada envio vira `<codigo>__<hash-do-operador>__<request-id>`, então **regravar nunca sobrescreve** o take
  anterior no envio — na publicação vence o mais recente.
- Antes de emitir a URL, a edge cria uma reserva privada pelo request ID. Ela impede replay entre
  instâncias diferentes da Edge e também alimenta a cota persistente por operador.
- Só depois de publicado o arquivo sai da triagem. Se algo falhar, o take original continua lá.
- **Compressão**: 720p, sem áudio, `faststart`. ~1–2 MB por vídeo no app.
- **QA automático**: arquivo corrompido vira falha; vídeo curto demais, longo demais, de baixa
  resolução ou **com trecho congelado** entra no relatório de pendências.
- **No banco**: grava `video_path` + `thumbnail_url` e **zera o YouTube** — o vídeo próprio vira a
  fonte única, então capa e player nunca divergem.

### Ainda dá para importar por pasta
Se algum vídeo vier por fora (Drive, AirDrop, cartão), o caminho antigo continua valendo — basta o
arquivo começar com o código de 3 dígitos:

```bash
node scripts/video-ingest.mjs --dir ~/Downloads/videos-bn --dry-run
```

### Regerar as listas
`python3 scripts/gerar-material-gravacao.py` — preserva os códigos já existentes, só numera
exercício novo no fim e sincroniza as três páginas internas, as três páginas públicas com hash e a
allowlist versionada da edge. **Nunca renumere**: os modelos gravam vinculados a esses códigos.

Antes de publicar páginas que incluam um exercício novo, faça primeiro o deploy da edge com a
allowlist regenerada; até lá o servidor falha fechado para o novo código. O runbook completo de
deploy, rotação e rollback está em `HARDENING-SEGURANCA.md`.
