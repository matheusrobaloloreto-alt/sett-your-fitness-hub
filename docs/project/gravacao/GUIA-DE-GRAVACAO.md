# Guia de Gravação — Vídeos da Biblioteca BN

**Para os 3 modelos.** São 926 exercícios divididos em 3 listas (~309 cada), já agrupadas por
**estação da academia** — grave tudo de uma estação antes de trocar, é o que faz render.

---

## Como funciona (é só isso)

Abra no celular a sua página — **`gravacao-modelo-N.html`**. Para cada exercício:

1. **Toque na imagem** para ver como se faz (o vídeo abre ali mesmo).
2. **Toque em 🎥 Gravar** — a câmera abre sozinha.
3. Grave, confirme. **O vídeo sobe automaticamente**, já ligado ao exercício certo.

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
node scripts/video-ingest.mjs --staging
```

Busca tudo que os celulares enviaram, comprime, gera as capas, publica no app e limpa a área de
triagem. Antes disso, `--staging --dry-run` mostra o QA sem enviar nada. E a qualquer momento:

```bash
node scripts/video-ingest.mjs --status
```

mostra a cobertura e o que ainda falta gravar.

### Como funciona por dentro
- A página usa a **câmera nativa** (`capture="environment"`), então sai na qualidade do aparelho,
  com estabilização e tudo mais — melhor do que gravar dentro do navegador.
- O upload vai para uma **área de triagem** (`_staging/`) com o código no nome. A página carrega um
  **token que só assina upload nessa pasta** e não toca no banco: mesmo que o arquivo HTML vaze, o
  pior caso é lixo numa pasta que você revisa antes de publicar. O segredo de admin nunca sai daqui.
- Cada envio vira `<codigo>__<modelo>__<timestamp>`, então **regravar nunca sobrescreve** o take
  anterior no envio — na publicação vence o mais recente.
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
`python3 scripts/gerar-material-gravacao.py` — preserva os códigos já existentes e só numera
exercício novo no fim. **Nunca renumere**: os modelos gravam vinculados a esses códigos.
