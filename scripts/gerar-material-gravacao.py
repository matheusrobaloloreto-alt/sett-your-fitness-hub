#!/usr/bin/env python3
"""
Gera o material de gravação da biblioteca: planilhas por modelo + páginas de consulta no celular.

    python3 scripts/gerar-material-gravacao.py

Lê a biblioteca pela edge library-video-ingest e escreve em docs/project/gravacao/:
  shot-list-modelo-{1,2,3}.csv · shot-list-completo.csv
  gravacao-modelo-{1,2,3}.html · codigo-para-exercicio.json

O código de 3 dígitos é a identidade do exercício no fluxo de gravação — se
codigo-para-exercicio.json já existe, os códigos dele são PRESERVADOS e só exercícios novos
recebem código no fim da fila. Nunca renumere: os modelos gravam com esses nomes de arquivo.
"""
import json, csv, re, html, unicodedata, os, subprocess
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
OUT = RAIZ / "docs/project/gravacao"
FN = "https://zshrcgbyhzxpnlccssyz.supabase.co/functions/v1/library-video-ingest"
ANON = "sb_publishable_8hCHHItU79APt0pt7NrZcw_OPHCUd_d"
MODELOS = 3

def slug(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", s).strip("-"))[:60]

def carregar_biblioteca():
    segredo = (Path.home() / ".bn-video-ingest-secret").read_text().strip()
    out = subprocess.run(["curl", "-s", "-m", "120", "-X", "POST", FN,
        "-H", f"Authorization: Bearer {ANON}", "-H", f"x-webhook-secret: {segredo}",
        "-H", "Content-Type: application/json", "-d", '{"action":"list"}'],
        capture_output=True, text=True, check=True).stdout
    return json.loads(out)["items"]

def estacao(eq, nome):
    """Onde o exercício é gravado — é por isso que se agrupa, não por grupo muscular."""
    e = (eq or "").strip().lower()
    m = {"barra": "Barra", "barra fixa": "Barra", "halteres": "Halteres", "halter": "Halteres",
         "peso livre": "Halteres", "cabo": "Cabo/Polia", "polia": "Cabo/Polia", "maquina": "Máquina",
         "máquina": "Máquina", "peso corporal": "Peso Corporal", "elastico": "Elástico/Band",
         "elástico": "Elástico/Band", "mini band": "Elástico/Band", "tera band": "Elástico/Band",
         "medicine ball": "Bola/Medicine", "slam ball": "Bola/Medicine", "bola": "Bola/Medicine",
         "kettlebell": "Kettlebell", "caixa": "Caixa/Pliometria", "barreira": "Caixa/Pliometria",
         "foam roll": "Mobilidade/Solo", "bastao": "Mobilidade/Solo", "bastão": "Mobilidade/Solo",
         "bosu": "Mobilidade/Solo", "trx": "TRX/Suspensão", "treno": "Corrida/Trenó", "trenó": "Corrida/Trenó"}
    if e in m: return m[e]
    if e in ("livre", "", "(sem equipamento)"):
        n = slug(nome)
        if any(k in n for k in ["mobilidade", "along", "foam", "cat-cow", "respira"]): return "Mobilidade/Solo"
        if any(k in n for k in ["prancha", "abdominal", "core", "hollow", "bird-dog", "ponte"]): return "Peso Corporal"
        if any(k in n for k in ["salto", "hop", "sprint", "drill", "pliome", "aterriss", "wall"]): return "Caixa/Pliometria"
        return "Livre/Funcional"
    return (eq or "Outros").strip().title()

def referencia(e):
    """Vídeo que o modelo assiste para saber a execução — o que está no app hoje."""
    vu = e.get("video_url") or ""
    if "cloudfront" in vu: return vu, "mp4", e.get("thumbnail_url") or ""
    yt = e.get("youtube_video_id")
    if not yt:
        m = re.search(r"(?:v=|youtu\.be/|embed/)([0-9A-Za-z_-]{11})", vu)
        yt = m.group(1) if m else None
    if yt: return f"https://youtu.be/{yt}", "yt", f"https://i.ytimg.com/vi/{yt}/mqdefault.jpg"
    return "", "", ""

def limpa(t, n=200):
    t = re.sub(r"\s+", " ", t or "").strip()
    return t[:n] + ("…" if len(t) > n else "")

CSS = """*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0D1B3E;color:#F2EFE9;-webkit-text-size-adjust:100%}
.wrap{max-width:720px;margin:0 auto}
header{position:sticky;top:0;z-index:20;background:#0D1B3E;border-bottom:1px solid #26365e;padding:12px 14px 10px}
h1{margin:0 0 2px;font-size:17px;letter-spacing:.3px}.sub{font-size:12px;color:#9fb0d4;margin-bottom:9px}
.bar{display:flex;gap:7px;flex-wrap:wrap}
input,select{background:#16254c;border:1px solid #2f4272;color:#F2EFE9;border-radius:9px;padding:9px 11px;font-size:15px;flex:1;min-width:130px}
.prog{height:5px;background:#16254c;border-radius:3px;margin-top:9px;overflow:hidden}.prog i{display:block;height:100%;background:#C9A227;width:0;transition:width .3s}
.progtxt{font-size:11px;color:#9fb0d4;margin-top:5px}
ul{list-style:none;margin:0;padding:8px 10px 60px}
li{background:#132348;border:1px solid #26365e;border-radius:12px;margin-bottom:9px;overflow:hidden}
li.ok{opacity:.5}li.ok .nome{text-decoration:line-through}
.row{display:flex;gap:10px;padding:10px;align-items:flex-start}
.thumb{width:104px;height:66px;border-radius:8px;background:#0a1330 center/cover;flex-shrink:0;cursor:pointer;border:none;padding:0;position:relative}
.thumb::after{content:'▶';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;text-shadow:0 2px 8px #000}
.info{flex:1;min-width:0}
.cod{font-size:10px;color:#C9A227;font-weight:700;letter-spacing:.6px}
.nome{font-size:14px;font-weight:600;margin:2px 0 4px;line-height:1.25}
.meta{font-size:11px;color:#9fb0d4;margin-bottom:6px}
.alta{background:#C9A22722;color:#E8C765;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:700;margin-left:5px}
.file{display:flex;gap:6px;align-items:center;background:#0a1330;border-radius:7px;padding:6px 8px}
.file code{font-size:10.5px;color:#8fd8a8;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,monospace}
button.cp{background:#2f4272;border:none;color:#F2EFE9;border-radius:6px;padding:5px 9px;font-size:11px;cursor:pointer;white-space:nowrap}
.done{display:flex;gap:7px;align-items:center;padding:0 10px 10px;font-size:12.5px;color:#9fb0d4;cursor:pointer}
.done input{flex:none;width:19px;height:19px;accent-color:#C9A227;min-width:0}
.rec{margin:0 10px 10px}
.rec button{width:100%;background:#C9A227;color:#0D1B3E;border:none;border-radius:9px;padding:11px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px}
.rec button:disabled{opacity:.55;cursor:default}
.rec.enviando button{background:#2f4272;color:#F2EFE9}
.rec.enviado button{background:#1e7a4a;color:#fff}
.rec.erro button{background:#8c2f2f;color:#fff}
.up{height:4px;background:#0a1330;border-radius:2px;margin-top:6px;overflow:hidden;display:none}
.rec.enviando .up{display:block}.up i{display:block;height:100%;background:#C9A227;width:0;transition:width .2s}
.dica{font-size:11px;color:#9fb0d4;background:#16254c;border-radius:8px;padding:8px 10px;margin:0 10px 9px;line-height:1.4}
.player{padding:0 10px 10px}.player:empty{padding:0}.player iframe,.player video{width:100%;aspect-ratio:16/9;border:0;border-radius:9px;background:#000}
.desc{font-size:11.5px;color:#b9c6e2;padding:0 10px 9px;line-height:1.4}
.empty{text-align:center;color:#9fb0d4;padding:36px 16px;font-size:13px}"""

JS = """const K='bn-grav-%(m)s',KS='bn-env-%(m)s',TOK='%(tok)s',FN='%(fn)s',ANON='%(anon)s';
let done=JSON.parse(localStorage.getItem(K)||'[]');
let enviados=JSON.parse(localStorage.getItem(KS)||'[]');
const items=[...document.querySelectorAll('li')];

// Fila de upload: um vídeo por vez. Na academia é 4G, e mandar 3 vídeos de 20MB em paralelo
// derruba os três. Sequencial chega mais rápido e falha menos.
const fila=[]; let ocupado=false;
function estado(li,cls,txt,pct){const r=li.querySelector('.rec');
 r.className='rec'+(cls?' '+cls:'');r.querySelector('b').textContent=txt;
 if(pct!=null)r.querySelector('.up i').style.width=pct+'%%';}
function marcarEnviado(li){const c=li.dataset.cod;
 if(!enviados.includes(c)){enviados.push(c);localStorage.setItem(KS,JSON.stringify(enviados));}
 if(!done.includes(c)){done.push(c);localStorage.setItem(K,JSON.stringify(done));}
 li.classList.add('ok');li.querySelector('.done input').checked=true;prog();}
async function processa(){
 if(ocupado||!fila.length)return; ocupado=true;
 const {li,file}=fila.shift(); const cod=li.dataset.cod;
 try{
  estado(li,'enviando','enviando... 0%%',0);
  const ext=(file.name.split('.').pop()||'mp4').toLowerCase();
  const r=await fetch(FN,{method:'POST',headers:{'Authorization':'Bearer '+ANON,'Content-Type':'application/json'},
    body:JSON.stringify({action:'sign-recording',token:TOK,codigo:cod,ext})});
  if(!r.ok)throw new Error('assinatura falhou');
  const {signedUrl}=await r.json();
  await new Promise((ok,err)=>{const x=new XMLHttpRequest();
   x.open('PUT',signedUrl);x.setRequestHeader('Content-Type',file.type||'video/mp4');
   x.upload.onprogress=e=>{if(e.lengthComputable)estado(li,'enviando','enviando... '+Math.round(e.loaded/e.total*100)+'%%',e.loaded/e.total*100);};
   x.onload=()=>x.status<300?ok():err(new Error('HTTP '+x.status));
   x.onerror=()=>err(new Error('sem conexão'));x.send(file);});
  estado(li,'enviado','✓ enviado — gravar de novo');marcarEnviado(li);
 }catch(e){estado(li,'erro','falhou: '+e.message+' — tocar p/ tentar de novo');}
 ocupado=false;processa();}
function prog(){const n=document.querySelectorAll('li.ok').length,t=items.length;
 document.querySelector('.prog i').style.width=(n/t*100)+'%%';
 document.querySelector('.progtxt').textContent=n+' de '+t+' gravados'+(n===t?' — acabou! 🎉':'');}
items.forEach(li=>{const c=li.dataset.cod;
 if(done.includes(c)){li.classList.add('ok');li.querySelector('.done input').checked=true;}
 if(enviados.includes(c))estado(li,'enviado','✓ enviado — gravar de novo');
 const inp=li.querySelector('.rec input'),btn=li.querySelector('.rec button');
 btn.addEventListener('click',()=>inp.click());
 inp.addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];
  if(!f)return; e.target.value='';
  estado(li,'enviando','na fila...',0);fila.push({li,file:f});processa();});
 li.querySelector('.done input').addEventListener('change',e=>{
   if(e.target.checked){li.classList.add('ok');if(!done.includes(c))done.push(c);}
   else{li.classList.remove('ok');done=done.filter(x=>x!==c);}
   localStorage.setItem(K,JSON.stringify(done));prog();});
 const cp=li.querySelector('.cp');
 cp&&cp.addEventListener('click',()=>{navigator.clipboard.writeText(cp.dataset.f)
   .then(()=>{const o=cp.textContent;cp.textContent='copiado!';setTimeout(()=>cp.textContent=o,1200);});});
 const th=li.querySelector('.thumb');
 th&&th.addEventListener('click',()=>{const p=li.querySelector('.player');
   if(p.dataset.on){p.innerHTML='';p.dataset.on='';return;}
   p.innerHTML=th.dataset.k==='yt'
     ?'<iframe src="https://www.youtube-nocookie.com/embed/'+th.dataset.v+'?autoplay=1" allow="autoplay" allowfullscreen></iframe>'
     :'<video src="'+th.dataset.v+'" controls autoplay muted playsinline></video>';
   p.dataset.on='1';});});
function filtra(){const q=document.getElementById('q').value.toLowerCase().trim();
 const es=document.getElementById('est').value;let vis=0;
 items.forEach(li=>{const v=(!q||li.dataset.busca.includes(q))&&(!es||li.dataset.est===es);
  li.style.display=v?'':'none';if(v)vis++;});
 document.querySelector('.empty').style.display=vis?'none':'block';}
document.getElementById('q').addEventListener('input',filtra);
document.getElementById('est').addEventListener('change',filtra);
prog();"""

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # Token de upload por modelo, gerado fora do repo. Sem ele a página vira só consulta.
    tok_path = Path.home() / ".bn-recording-tokens.json"
    tokens_por_modelo = {}
    if tok_path.exists():
        tokens_por_modelo = {v: k for k, v in json.loads(tok_path.read_text()).items()}
    else:
        print("  aviso: ~/.bn-recording-tokens.json nao encontrado — paginas sem o botao Gravar")
    lib = carregar_biblioteca()
    mapa_path = OUT / "codigo-para-exercicio.json"
    mapa = json.loads(mapa_path.read_text(encoding="utf-8")) if mapa_path.exists() else {}
    por_id = {v["id"]: k for k, v in mapa.items()}

    # Prioridade ALTA = vídeo atual frágil. Vem da auditoria de 2026-08-04 (vídeo era de outro
    # exercício, virou vídeo-aula, sumiu do YouTube, ou casou só parcialmente) somada a quem
    # não tem vídeo nenhum. São os que mais ganham com uma gravação própria.
    prio_path = OUT / "prioridade-alta.json"
    prioritarios = set(json.loads(prio_path.read_text(encoding="utf-8"))) if prio_path.exists() else set()

    frageis = set()
    linhas = []
    for e in lib:
        est = estacao(e.get("equipment"), e["name"])
        frag = e["id"] in prioritarios or not (e.get("video_path") or e.get("video_url") or e.get("youtube_video_id"))
        if frag: frageis.add(e["id"])
        linhas.append({"id": e["id"], "nome": e["name"], "grupo": e.get("muscle_group") or "",
                       "estacao": est, "fragil": frag, "ex": e})

    linhas.sort(key=lambda r: (r["estacao"], not r["fragil"], r["nome"].lower()))
    proximo = max((int(c) for c in mapa), default=0) + 1
    for r in linhas:
        if r["id"] in por_id:
            r["codigo"] = por_id[r["id"]]           # já gravado com esse número: não mexe
        else:
            r["codigo"] = f"{proximo:03d}"; proximo += 1
    linhas.sort(key=lambda r: r["codigo"])

    # Divide estações inteiras entre os modelos, sempre para quem tem menos.
    por_est = {}
    for r in linhas: por_est.setdefault(r["estacao"], []).append(r)
    baldes = {i: [] for i in range(1, MODELOS + 1)}
    for _, itens in sorted(por_est.items(), key=lambda kv: -len(kv[1])):
        baldes[min(baldes, key=lambda k: len(baldes[k]))].extend(itens)

    COLS = ["codigo", "arquivo_final", "nome_exercicio", "grupo_muscular", "estacao",
            "prioridade", "video_referencia", "como_executar"]

    def linha_csv(r):
        link, _, _ = referencia(r["ex"])
        return {"codigo": r["codigo"], "arquivo_final": f"{r['codigo']}-{slug(r['nome'])}.mp4",
                "nome_exercicio": r["nome"], "grupo_muscular": r["grupo"], "estacao": r["estacao"],
                "prioridade": "ALTA" if r["fragil"] else "normal", "video_referencia": link,
                "como_executar": limpa(r["ex"].get("description"))}

    for m in range(1, MODELOS + 1):
        itens = sorted(baldes[m], key=lambda r: (r["estacao"], not r["fragil"], r["nome"].lower()))
        with open(OUT / f"shot-list-modelo-{m}.csv", "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=COLS); w.writeheader()
            for r in itens: w.writerow(linha_csv(r))
        gerar_html(m, itens, tokens_por_modelo.get(f'modelo-{m}', ''))
        print(f"  modelo {m}: {len(itens)} exercícios")

    with open(OUT / "shot-list-completo.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=COLS + ["exercise_id"]); w.writeheader()
        for r in linhas: w.writerow({**linha_csv(r), "exercise_id": r["id"]})

    mapa_path.write_text(json.dumps({r["codigo"]: {"id": r["id"], "nome": r["nome"]} for r in linhas},
                                    ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  total: {len(linhas)} exercícios · {len(frageis)} sem vídeo (prioridade ALTA)")

def gerar_html(m, itens, token):
    ests = sorted({r["estacao"] for r in itens})
    li = []
    for r in itens:
        link, kind, thumb = referencia(r["ex"])
        v = (r["ex"].get("youtube_video_id") or "") if kind == "yt" else link
        arq = html.escape(f"{r['codigo']}-{slug(r['nome'])}.mp4")
        desc = limpa(r["ex"].get("description"))
        busca = html.escape(f"{r['codigo']} {r['nome']} {r['grupo']} {r['estacao']}".lower())
        capa = (f'<button class="thumb" data-k="{kind}" data-v="{html.escape(v)}" '
                f'style="background-image:url({html.escape(thumb)})"></button>') if link else '<div class="thumb"></div>'
        selo = '<span class="alta">ALTA</span>' if r["fragil"] else ""
        bloco_desc = f'<div class="desc">{html.escape(desc)}</div>' if desc else ""
        li.append(
            f'<li data-cod="{r["codigo"]}" data-est="{html.escape(r["estacao"])}" data-busca="{busca}">'
            f'<div class="row">{capa}<div class="info">'
            f'<div class="cod">{r["codigo"]}{selo}</div>'
            f'<div class="nome">{html.escape(r["nome"])}</div>'
            f'<div class="meta">{html.escape(r["grupo"])} · {html.escape(r["estacao"])}</div>'
            f'<div class="file"><code>{arq}</code><button class="cp" data-f="{arq}">copiar</button></div>'
            f'</div></div>{bloco_desc}'
            f'<div class="player"></div>'
            # capture="environment" abre a câmera traseira direto; o vídeo volta para a página
            # e sobe já vinculado ao código — ninguém precisa renomear nem achar o arquivo.
            f'<div class="rec"><input type="file" accept="video/*" capture="environment" hidden>'
            f'<button type="button"><b>🎥 Gravar</b></button><div class="up"><i></i></div></div>'
            f'<label class="done"><input type="checkbox"> já gravei este</label></li>')
    pag = (f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
           f'<meta name="viewport" content="width=device-width,initial-scale=1">'
           f'<meta name="robots" content="noindex,nofollow">'
           f'<title>Gravação BN — Modelo {m}</title><style>{CSS}</style></head><body><div class="wrap">'
           f'<header><h1>Gravação BN — Modelo {m}</h1>'
           f'<div class="sub">{len(itens)} exercícios · toque na imagem para ver como se faz</div>'
           f'<div class="bar"><input id="q" placeholder="Buscar exercício ou código..." autocomplete="off">'
           f'<select id="est"><option value="">Todas as estações</option>'
           f'{"".join(f"<option>{html.escape(x)}</option>" for x in ests)}</select></div>'
           f'<div class="prog"><i></i></div><div class="progtxt"></div></header>'
           f'<div class="dica">Toque em <b>🎥 Gravar</b> que a câmera abre. Ao confirmar o vídeo, ele '
           f'sobe sozinho já ligado ao exercício certo — você não precisa renomear nem enviar nada. '
           f'De preferência no Wi-Fi.</div>'
           f'<ul>{"".join(li)}</ul><div class="empty" style="display:none">Nada encontrado.</div>'
           f'</div><script>{JS % {"m": m, "tok": token, "fn": FN, "anon": ANON}}</script></body></html>')
    (OUT / f"gravacao-modelo-{m}.html").write_text(pag, encoding="utf-8")

if __name__ == "__main__":
    main()
