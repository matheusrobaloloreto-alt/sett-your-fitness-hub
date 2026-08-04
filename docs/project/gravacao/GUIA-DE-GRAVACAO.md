# Guia de Gravação — Vídeos da Biblioteca BN

**Para os 3 modelos.** São 926 exercícios divididos em 3 listas (~309 cada). Cada lista já vem
agrupada por **estação da academia** — grave tudo de uma estação antes de trocar, é o que faz a
gravação render.

---

## ⚠️ A regra que faz tudo funcionar: o nome do arquivo

Cada linha da sua planilha tem uma coluna **`arquivo_final`**. O vídeo daquele exercício precisa ter
**exatamente aquele nome**:

```
001-mergulho-em-banco.mp4
```

**O número de 3 dígitos no começo é o que importa** — é ele que liga o vídeo ao exercício certo no
app. O resto do nome é só para humano conferir. Se o número estiver certo, está certo.

- ✅ `047-supino-reto-barra.mp4`
- ✅ `047-supino reto barra.MOV` (extensão e maiúsculas não importam)
- ❌ `IMG_4823.mov` (não dá para saber que exercício é)
- ❌ `supino.mp4` (sem número — vai depender de adivinhação)

> **Dica:** renomeie **na hora**, logo depois de gravar cada exercício. Deixar 300 vídeos para
> renomear no fim é onde tudo se perde.

---

## Como gravar

| Item | Como fazer |
|---|---|
| **Celular** | Na **vertical** (em pé). É como o aluno vai ver no app. |
| **Qualidade** | 1080p, 30fps. Não precisa 4K — o app comprime mesmo. |
| **Duração** | **8 a 15 segundos.** 2 ou 3 repetições completas e bem feitas. |
| **Enquadramento** | Corpo inteiro, ou o suficiente para ver a articulação que trabalha. Sem cortar pé/cabeça no movimento. |
| **Ângulo** | O que mostra melhor a execução: geralmente 45° ou de lado. Agachamento/terra = de lado. Remada/puxada = 45°. |
| **Câmera** | **Parada** (apoiada ou tripé). Nada de câmera na mão seguindo o movimento. |
| **Fundo** | O mais limpo possível. Evite gente passando atrás. |
| **Luz** | De frente ou de cima. Evite gravar contra a janela (fica silhueta). |
| **Roupa** | Que deixe ver as articulações. Sem roupa larga demais. |

### Não precisa se preocupar com:
- **Áudio** — o app remove o som de todos os vídeos. Pode conversar à vontade durante a gravação.
- **Edição** — não corte, não coloque música, não coloque texto. Manda cru.
- **Capa/thumbnail** — o app gera sozinho, a partir do próprio vídeo.

### Execução
Faça o movimento **como o exercício deve ser feito** — é isso que o aluno vai copiar. Amplitude
completa, ritmo controlado, sem pressa. Se errar no meio, grave de novo (é mais rápido que corrigir
depois).

---

## Onde entregar

Jogue todos os vídeos na pasta do **Google Drive** combinada. Pode ser tudo na mesma pasta ou uma
subpasta por modelo — o sistema acha de qualquer jeito, desde que **o nome do arquivo esteja certo**.

Não precisa avisar quando terminar um bloco: dá para importar em partes, quantas vezes for preciso.
Se um vídeo for regravado depois, é só subir de novo com o mesmo nome que ele **substitui** o antigo.

---

## Para o Matheus — como importar

1. A pasta do Drive precisa estar compartilhada como **"qualquer pessoa com o link"** (leitura).
2. Me manda o link. Eu listo, baixo, comprimo, gero as capas, subo e ligo cada vídeo ao exercício.
3. Recebe o relatório: quantos entraram, quais ficaram ambíguos e quais não bateram com nada.

Por dentro (`scripts/video-ingest.mjs`):

```bash
node scripts/video-ingest.mjs --dir ~/Downloads/videos-bn --dry-run
```

- **Casamento**: pelo número do arquivo; sem número, tenta por similaridade de nome — e só aceita se
  a melhor opção for claramente melhor que a segunda. Na dúvida, **não aplica**: entra no relatório
  como ambíguo para decisão humana.
- **Compressão**: 720p, sem áudio, `faststart` (toca sem baixar o vídeo inteiro). ~1–2 MB por vídeo.
- **Capa**: quadro tirado a 1/3 do vídeo, quando o movimento já está acontecendo.
- **No banco**: grava `video_path` + `thumbnail_url` e **zera o YouTube** — vídeo próprio vira a
  fonte única, então capa e player nunca mais divergem.
- **Regravação**: subir de novo com o mesmo nome substitui o arquivo anterior no storage.
- É **retomável**: rodar de novo pula o que já baixou e já subiu.
