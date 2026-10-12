import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createPortProbe } from "node:net";
import { createServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import { chromium } from "playwright";

// This fixture never imports the real Supabase browser client or reads env files.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "output/bn-content-cloud-qa");
await mkdir(out, { recursive: true });
const report = { synthetic_only: true, production_authentication_verified: false, started_at: new Date().toISOString(), checks: [], defects: [], screenshots: [], exports: [], blocked_network: [] };
const clone = value => structuredClone(value);
const pid = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-10-12T07:00:00.000Z";
const baseSpec = {
  format: "carrossel", aesthetic: "l1_educativo", topic: "QA sintético: avaliação e treino", audience: "misto",
  slides: [
    { role: "capa", title: "Avaliação antes do treino", subtitle: "Conteúdo sintético para QA independente", image_scene: "Synthetic blue and red geometric test scene" },
    { role: "conteudo", title: "Uma ideia por slide", body: "O planejamento respeita o objetivo e a rotina.", bullets: ["Dados sintéticos", "Revisão antes de aprovar"] },
    { role: "cta", title: "Revise seu planejamento", body: "Um próximo passo claro.", image_scene: "" },
  ], caption: "Legenda sintética, sem dados pessoais.", hashtags: ["#QA", "#BN"],
};
const makePost = (spec = baseSpec) => ({ id: pid, brief: "Briefing sintético independente", spec: clone(spec), status: "draft", version: 1, created_at: timestamp, updated_at: timestamp });
const settings = {
  aesthetics: [
    { key: "l1_educativo", label: "L1 Educativo", formats: ["carrossel"] },
    { key: "l2_storytelling", label: "L2 História", formats: ["storytelling"] },
    { key: "l3_aviso", label: "L3 Aviso", formats: ["aviso"] },
    { key: "l4_evento_poster", label: "L4 Cartaz", formats: ["evento"] },
    { key: "l4_evento_teaser", label: "L4 Teaser", formats: ["evento"] },
    { key: "navy", label: "Navy", formats: ["post", "story", "reels"] },
  ], objectives: [{ key: "autoridade", label: "Autoridade" }],
  formats: [
    { key: "qa_carrossel", name: "Carrossel educativo", format_type: "carrossel" },
    { key: "qa_story", name: "Story", format_type: "story" },
    { key: "qa_reels", name: "Reels", format_type: "reels" },
  ], pillars: ["Avaliação", "Planejamento"],
};
const sources = ["src/pages/master/MasterBnContent.tsx", ...["Editor", "Preview", "Calendar", "Archive"].map(name => `src/components/master/BnContentStudio${name}.tsx`), "src/lib/bnContentStudio.ts", "src/lib/bnContentRenderer.ts", "supabase/functions/_shared/bnContent.ts", "supabase/functions/bn-content-studio/handler.ts", "supabase/functions/bn-content-studio/index.ts", "supabase/functions/bn-content-studio/store.ts", "supabase/functions/bn-content-studio/provider.ts", "supabase/migrations/20261012074421_bn_content_studio_cloud.sql"];
async function hashes() {
  return Object.fromEntries(await Promise.all(sources.map(async file => [file, createHash("sha256").update(await readFile(path.join(root, file))).digest("hex")])));
}
report.head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
report.source_hashes_start = await hashes();
async function check(name, fn) {
  try { const evidence = await fn(); report.checks.push({ name, pass: true, evidence }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, pass: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
}
const clientId = "\0bn-qa-client";
const mockClient = `export const supabase = {
  functions: { async invoke(name, options) {
    if (name !== 'bn-content-studio') throw new Error('Unexpected fixture function');
    const response = await fetch('/__qa_api', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(options.body) });
    if (!response.ok) return {data:null,error:{context:response}};
    return {data:await response.json(),error:null};
  } },
  storage: { from() { return { async download() { return {data:new Blob([JSON.stringify({posts:[]})]),error:null}; }, async createSignedUrls() { return {data:[],error:null}; } }; } }
};`;
await writeFile(path.join(out, "fixture.html"), `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/output/bn-content-cloud-qa/fixture.tsx"></script></body></html>`);
await writeFile(path.join(out, "fixture.tsx"), `import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {Toaster} from 'sonner';
import MasterBnContent from '/src/pages/master/MasterBnContent.tsx';
import * as renderer from '/src/lib/bnContentRenderer.ts';
import '/src/index.css';
window.__qaRenderer=renderer;
createRoot(document.getElementById('root')).render(<MemoryRouter><MasterBnContent/><Toaster/></MemoryRouter>);
`);
const portProbe=createPortProbe();
await new Promise(resolve=>portProbe.listen(0,"127.0.0.1",resolve));
const fixturePort=portProbe.address().port;
await new Promise(resolve=>portProbe.close(resolve));
const server = await createServer({
  root, configFile: false, envDir: false, mode: "qa", cacheDir: path.join(out, "vite-cache"),
  plugins: [{ name: "bn-qa-client", resolveId(id) { if (id === clientId) return clientId; }, load(id) { if (id === clientId) return mockClient; } }, react()],
  resolve: { alias: [{ find: "@/integrations/supabase/client", replacement: clientId }, { find: "@", replacement: path.join(root, "src") }], dedupe: ["react", "react-dom"] },
  server: { host: "127.0.0.1", port: fixturePort, strictPort: true, hmr: false, watch: null },
});
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  report.fixture_origin = origin;
  console.log(`Fixture ${origin}/output/bn-content-cloud-qa/fixture.html`);

  const backend = await server.ssrLoadModule("/supabase/functions/bn-content-studio/handler.ts");
  const contract = await server.ssrLoadModule("/supabase/functions/_shared/bnContent.ts");
  const recursiveReorder = value => Array.isArray(value) ? value.map(recursiveReorder) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, recursiveReorder(value[key])])) : value;
  function backendFixture({ master = true, authenticated = true, quota = true, reorder = false } = {}) {
    const calls = [];
    let saved;
    const store = {
      posts: async () => [], calendars: async () => [], approvedExamples: async () => [], post: async () => makePost(),
      save: async (actor, input) => { calls.push("save"); saved = { ...makePost(), id: input.id || pid, brief: input.brief, spec: reorder ? recursiveReorder(input.spec) : clone(input.spec), status: input.status, version: input.id ? input.expected_version + 1 : 1 }; return saved; },
      calendar: async (_actor, calendar) => ({ id: pid, calendar, created_at: timestamp }),
      quota: async () => { calls.push("quota"); return quota; }, signedAssets: async () => ({}), upload: async () => { calls.push("upload"); },
    };
    return { calls, get saved() { return saved; }, handler: backend.createBnContentHandler({
      authenticate: async () => { calls.push("authenticate"); return authenticated ? { id: actorId, master } : null; },
      store: () => { calls.push("store"); return store; }, capabilities: () => ({text:true,images:true}),
      text: async () => { calls.push("provider"); return clone(baseSpec); }, image: async () => { calls.push("provider"); throw new Error("No fixture image needed"); }, uuid: () => pid,
    }) };
  }
  const req = (body, headers = {}) => new Request("https://fixture.invalid/bn-content-studio", { method: "POST", headers: { authorization: "Bearer synthetic-qa-master", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  await check("backend: missing bearer fails before auth/store", async () => {
    const f = backendFixture(); const request = req({action:"bootstrap"}); request.headers.delete("authorization");
    assert.equal((await f.handler(request)).status, 401); assert.deepEqual(f.calls, []);
  });
  await check("backend: rejected identity and nonmaster never create privileged store", async () => {
    for (const [options, status] of [[{authenticated:false},401],[{master:false},403]]) {
      const f = backendFixture(options); assert.equal((await f.handler(req({action:"bootstrap"}))).status,status); assert.deepEqual(f.calls,["authenticate"]);
    }
  });
  await check("backend: exhausted quota prevents provider invocation", async () => {
    const f = backendFixture({quota:false}); const response = await f.handler(req({action:"revise",spec:baseSpec,instruction:"Synthetic revision"}));
    assert.equal(response.status,429); assert.equal(f.calls.includes("provider"),false);
  });
  await check("backend: invalid save rejected before store", async () => {
    const f = backendFixture(); const response = await f.handler(req({action:"save",brief:"QA",spec:baseSpec,status:"draft",id:pid}));
    assert.equal(response.status,400); assert.equal(f.calls.includes("store"),false);
  });
  await check("backend: semantically identical JSONB reordered save succeeds", async () => {
    const f = backendFixture({reorder:true}); const response = await f.handler(req({action:"save",brief:"QA",spec:baseSpec,status:"draft"}));
    const evidence = {status:response.status,body:await response.json(),store_saved:!!f.saved,semantically_equal:!!f.saved && JSON.stringify(recursiveReorder(f.saved.spec)) === JSON.stringify(recursiveReorder(baseSpec))};
    await writeFile(path.join(out,"backend-jsonb-order.json"),JSON.stringify(evidence,null,2));
    assert.equal(response.status,200,JSON.stringify(evidence)); return evidence;
  });
  await check("backend: new post rejects another post's private background", async () => {
    const spec = clone(baseSpec); spec.slides[0].background_path = `studio/${pid}/assets/${actorId}.png`;
    const f = backendFixture(); const response = await f.handler(req({action:"save",brief:"QA copy",spec,status:"draft"}));
    const evidence={status:response.status,body:await response.json()}; await writeFile(path.join(out,"backend-copy-image.json"),JSON.stringify(evidence,null,2));
    assert.equal(response.status,400,JSON.stringify(evidence)); assert.equal(f.calls.includes("save"),false); return evidence;
  });
  const migration = await readFile(path.join(root,sources.at(-1)),"utf8");
  await check("migration static: CAS, master RPCs, RLS, privileges and private storage", async () => {
    for(const pattern of [/where id=p_id and version=p_expected_version/,/version=version\+1/,/errcode = '40001'/,/on conflict \(user_id,kind,hour_start\) do update/,/used < cap/,/revoke all on function public.bn_content_studio_save/,/for select to authenticated using \(public.has_role/,/as restrictive/,/'bn-content-studio',false/]) assert.match(migration,pattern);
    return "Source review only; no live Postgres execution or production auth tested.";
  });
  await check("migration: independent rerun of isolated PGlite contract",async()=>{
    const modulePath=path.join(out,"qa-runtime/node_modules/@electric-sql/pglite/dist/index.js");
    const log=execFileSync(process.execPath,[path.join(root,"scripts/bn-content-pglite-contract.mjs")],{cwd:root,env:{...process.env,PGLITE_MODULE_PATH:modulePath},encoding:"utf8",timeout:60000});
    await writeFile(path.join(out,"pglite-contract.log"),log);return JSON.parse(log.trim());
  });

  browser = await chromium.launch({headless:true});
  for (const viewport of [{width:390,height:844},{width:1440,height:1000}]) {
    const label=`${viewport.width}x${viewport.height}`;
    const context=await browser.newContext({viewport,acceptDownloads:true,serviceWorkers:"block"});
    context.setDefaultTimeout(10000);
    context.setDefaultNavigationTimeout(60000);
    const page=await context.newPage();
    const state={posts:[makePost()],calendars:[],calls:[],nextError:null,capabilities:{text:true,images:true},nextId:3,assets:{},assetPng:null};
    page.on("dialog",dialog=>dialog.accept());
    const pageErrors=[]; page.on("pageerror",error=>pageErrors.push(error.message));
    await context.route("**/*",async route=>{
      const request=route.request(); const url=new URL(request.url());
      if(url.origin === "https://bn-qa-assets.invalid" && state.assetPng) return route.fulfill({contentType:"image/png",body:state.assetPng,headers:{"Access-Control-Allow-Origin":"*"}});
      if(url.origin !== origin) { report.blocked_network.push({viewport:label,origin:url.origin,path:url.pathname}); return route.abort(); }
      if(url.pathname !== "/__qa_api") return route.continue();
      const input=request.postDataJSON(); state.calls.push(clone(input));
      if(state.nextError) { const error=state.nextError; state.nextError=null; return route.fulfill({status:error.status,json:error.body}); }
      if(input.action === "bootstrap") return route.fulfill({json:{posts:clone(state.posts),calendars:clone(state.calendars),settings,assets:state.assets,capabilities:state.capabilities}});
      if(input.action === "save") {
        if(!contract.validateBnContentSpec(input.spec) || !input.brief?.trim()) return route.fulfill({status:400,json:{error:"invalid_request"}});
        if(input.status === "approved" && !contract.isUsableBnContentSpec(input.spec)) return route.fulfill({status:400,json:{error:"invalid_request"}});
        if(input.spec.slides.some(slide=>slide.background_path && (!input.id || !slide.background_path.startsWith(`studio/${input.id}/assets/`)))) return route.fulfill({status:400,json:{error:"invalid_request"}});
        let post=state.posts.find(p=>p.id===input.id);
        if(input.id && (!post || post.version!==input.expected_version)) return route.fulfill({status:409,json:{error:"version_conflict"}});
        post={...makePost(),id:input.id || `${String(state.nextId++).padStart(8,"0")}-3333-4333-8333-333333333333`,brief:input.brief,spec:clone(input.spec),status:input.status,version:post ? post.version+1 : 1};
        state.posts=[post,...state.posts.filter(p=>p.id!==post.id)]; return route.fulfill({json:{post}});
      }
      if(input.action === "generate") {
        const aesthetic=settings.aesthetics.find(item=>item.key===input.aesthetic);
        if(!aesthetic || aesthetic.formats && !aesthetic.formats.includes(input.format)) return route.fulfill({status:400,json:{error:"invalid_request"}});
        return route.fulfill({json:{spec:{...clone(baseSpec),format:input.format,aesthetic:input.aesthetic}}});
      }
      if(input.action === "revise") return route.fulfill({json:{spec:{...input.spec,caption:"Legenda revisada sintética"}}});
      if(input.action === "calendar") {
        if(input.weeks>6) return route.fulfill({status:400,json:{error:"invalid_request"}});
        const calendar={id:pid,created_at:timestamp,calendar:{weeks:Array.from({length:input.weeks},(_,week)=>({week:week+1,items:Array.from({length:input.posts_per_week},(_,day)=>({day:["Seg","Ter","Qua","Qui","Sex","Sab","Dom"][day],topic:"QA sintético",bucket:"atracao",objetivo:"autoridade",format_key:"qa_carrossel",format_name:"Carrossel educativo",aesthetic:"l1_educativo",layout_id:"L1",pillar:"Avaliação",hook:"Exemplo sintético"}))}))}};
        state.calendars=[calendar,...state.calendars]; return route.fulfill({json:{calendar}});
      }
      if(input.action === "image") {
        const assetPath=`studio/${input.post_id}/assets/${actorId}.png`;
        const signedUrl=`https://bn-qa-assets.invalid/${assetPath}?fixture=synthetic`;
        state.assets[assetPath]=signedUrl;return route.fulfill({json:{path:assetPath,signedUrl}});
      }
      return route.fulfill({status:400,json:{error:"unsupported_fixture_action"}});
    });
    await page.goto(`${origin}/output/bn-content-cloud-qa/fixture.html`,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>!!window.__qaRenderer,null,{timeout:60000});
    state.assetPng=Buffer.from(await page.evaluate(()=>{
      const canvas=document.createElement("canvas");canvas.width=128;canvas.height=160;const ctx=canvas.getContext("2d");
      ctx.fillStyle="#ff4040";ctx.fillRect(0,0,64,160);ctx.fillStyle="#40ff80";ctx.fillRect(64,0,64,160);
      return canvas.toDataURL("image/png").split(",")[1];
    }),"base64");
    await writeFile(path.join(out,`${label}-synthetic-background.png`),state.assetPng);
    await check(`${label}: Canvas PNG dimensions, pixels and copy bounds`,async()=>{
      const results=await page.evaluate(async spec=>{
        const renderer=window.__qaRenderer;
        const canvasProto=CanvasRenderingContext2D.prototype;
        const original=canvasProto.fillText;
        let draws=[];
        canvasProto.fillText=function(text,x,y,...args){ const m=this.measureText(text); draws.push({text,x,y,right:x+m.width,bottom:y+(m.actualBoundingBoxDescent||0),font:this.font,width:this.canvas.width,height:this.canvas.height}); return original.call(this,text,x,y,...args); };
        const cases=[];
        try{
          for(const [format,aesthetic,index] of [["carrossel","l1_educativo",0],["carrossel","l1_educativo",1],["story","navy",0],["reels","navy",0],["storytelling","l2_storytelling",0],["aviso","l3_aviso",0],["evento","l4_evento_poster",0],["evento","l4_evento_teaser",2]]){
            draws=[]; const blob=await renderer.renderBnContentSlide({...spec,format,aesthetic},index); const bitmap=await createImageBitmap(blob);
            const canvas=document.createElement("canvas"); canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext("2d");ctx.drawImage(bitmap,0,0);
            const bytes=ctx.getImageData(0,0,canvas.width,canvas.height).data;const colors=new Set();let nonOpaque=0;
            for(let i=0;i<bytes.length;i+=4*149){colors.add(`${bytes[i]},${bytes[i+1]},${bytes[i+2]}`);if(bytes[i+3]!==255)nonOpaque++;}
            const overflow=draws.filter(d=>d.x<0 || d.right>d.width+1 || d.y<0 || d.bottom>d.height);
            const reader=new FileReader();const data=await new Promise(resolve=>{reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});
            cases.push({format,aesthetic,index,width:bitmap.width,height:bitmap.height,bytes:blob.size,colors:colors.size,nonOpaque,overflow,drawCount:draws.length,data});
          }
          const long=structuredClone(spec);long.slides[0].title="AVALIAÇÃO".repeat(25);draws=[];
          await renderer.renderBnContentSlide(long,0);cases.push({longWord:true,overflow:draws.filter(d=>d.x<0||d.right>d.width+1||d.bottom>d.height)});
          const huge=structuredClone(spec);huge.slides[1].body="Conteúdo extenso sintético. ".repeat(2000);let rejected=false;
          try{await renderer.renderBnContentSlide(huge,1);}catch(error){rejected=/não cabe/.test(error.message);}cases.push({oversizedRejected:rejected});
          return cases;
        }finally{canvasProto.fillText=original;}
      },baseSpec);
      for(const [i,item] of results.entries()){
        if(item.data){const name=`${label}-${item.format}-${item.aesthetic}-${item.index}.png`;await writeFile(path.join(out,name),Buffer.from(item.data.split(",")[1],"base64"));delete item.data;report.exports.push({file:name,...item});assert.equal(item.width,1080);assert.equal(item.height,["story","reels"].includes(item.format)?1920:1350);assert.ok(item.colors>12);assert.equal(item.nonOpaque,0);}
        assert.equal(item.overflow?.length||0,0,`Canvas text overflow case ${i}`);
        if("oversizedRejected" in item)assert.equal(item.oversizedRejected,true);
      }
      return results;
    });
    async function screenshot(name){const filename=`${label}-${name}.png`;await page.screenshot({path:path.join(out,filename),fullPage:true});report.screenshots.push(filename);}
    await check(`${label}: Studio renders real editor and no horizontal overflow`,async()=>{
      await page.getByRole("region",{name:"Editor de conteúdo"}).waitFor({timeout:15000});
      await page.locator('img[alt^="Slide "]').first().waitFor();
      const dimensions=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
      await screenshot("studio-initial");assert.ok(dimensions.scroll<=viewport.width+1,JSON.stringify(dimensions));assert.equal(pageErrors.length,0,pageErrors.join("\n"));return dimensions;
    });
    if(await page.getByRole("region",{name:"Editor de conteúdo"}).count()){
      await check(`${label}: open, edit, save and reload draft`,async()=>{
        await page.getByText(baseSpec.topic,{exact:true}).first().click();
        const topic=`QA salvo ${label}`;await page.getByLabel("Tema",{exact:true}).fill(topic);
        await page.getByRole("button",{name:"Salvar",exact:true}).click();
        await page.waitForFunction(value=>document.querySelector('input') && document.body.textContent.includes(value),topic);
        await page.waitForTimeout(250);
        const saved=state.posts.find(p=>p.spec.topic===topic);assert.ok(saved,"Fixture must have received and persisted save");
        await page.reload({waitUntil:"networkidle"});
        await page.getByText(topic,{exact:true}).first().click();
        assert.equal(await page.getByLabel("Tema",{exact:true}).inputValue(),topic);
        assert.ok(state.calls.some(c=>c.action==="save"&&c.id===pid&&c.expected_version===1));await screenshot("saved-reopened");return {version:saved.version};
      });
      await check(`${label}: stale version conflict preserves local edits and remote version`,async()=>{
        const local=`Edição local preservada ${label}`;const post=state.posts.find(p=>p.id===pid);post.version++;post.spec.topic=`Outro Master ${label}`;
        await page.getByLabel("Tema",{exact:true}).fill(local);await page.getByRole("button",{name:"Salvar",exact:true}).click();
        await page.getByText(/Outro Master alterou este post/).waitFor();
        assert.equal(await page.getByLabel("Tema",{exact:true}).inputValue(),local);assert.equal(state.posts.find(p=>p.id===pid).spec.topic,`Outro Master ${label}`);
        await screenshot("save-conflict");return {local_preserved:true,remote_not_overwritten:true};
      });
      await check(`${label}: selected shared post contrast is readable`,async()=>{
        const evidence=await page.getByRole("complementary",{name:"Posts compartilhados"}).evaluate(aside=>{
          const button=[...aside.querySelectorAll("button")].find(el=>el.className.includes("bg-accent"));const text=button?.querySelector("p");
          if(!button||!text)return {missing:true};
          const fg=getComputedStyle(text).color,bg=getComputedStyle(button).backgroundColor;
          const lum=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
          return {foreground:fg,background:bg,ratio:(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05)};
        });
        assert.ok(evidence.ratio>=4.5,JSON.stringify(evidence));return evidence;
      });
      await check(`${label}: save conflict as separate new draft`,async()=>{
        const count=state.posts.length;await page.getByRole("button",{name:/Salvar como novo rascunho/}).click();
        await page.waitForTimeout(300);assert.equal(state.posts.length,count+1);assert.notEqual(state.posts[0].id,pid);assert.match(state.posts[0].spec.topic,/Edição local preservada/);
      });
      await check(`${label}: export button downloads actual PNG`,async()=>{
        const pending=page.waitForEvent("download",{timeout:15000});await page.getByRole("button",{name:"Exportar conteúdo",exact:true}).click();const download=await pending;
        assert.match(download.suggestedFilename(),/\.png$/);const filename=`${label}-ui-${download.suggestedFilename().replace(/[^a-zA-Z0-9._-]/g,"_")}`;await download.saveAs(path.join(out,filename));
        const png=await readFile(path.join(out,filename));assert.equal(png.subarray(0,8).toString("hex"),"89504e470d0a1a0a");return {file:filename,bytes:png.length};
      });
      await check(`${label}: API authorization errors sanitized, draft retained`,async()=>{
        const local=await page.getByLabel("Tema",{exact:true}).inputValue();state.nextError={status:403,body:{error:"synthetic raw internal URL https://private.invalid"}};
        await page.getByRole("button",{name:"Salvar",exact:true}).click();await page.getByText(/somente para Masters autorizados/).waitFor();
        assert.equal(await page.getByLabel("Tema",{exact:true}).inputValue(),local);assert.equal((await page.textContent("body")).includes("private.invalid"),false);
      });
      await check(`${label}: edit topics with trailing newline saves`,async()=>{
        await page.getByLabel(/^Tópicos/).fill("Ponto sintético\n");const before=state.posts[0].version;
        await page.getByRole("button",{name:"Salvar",exact:true}).click();await page.waitForTimeout(300);
        await screenshot("topics-trailing-newline");assert.equal(state.posts[0].version,before+1,"Trailing newline was sent as an empty bullet rejected by backend contract");
      });
      await page.getByLabel(/^Tópicos/).fill("Ponto sintético");
      await page.getByRole("button",{name:"Salvar",exact:true}).click();await page.waitForTimeout(300);
      await check(`${label}: generated private background persists and exports`,async()=>{
        await page.getByRole("button",{name:"Gerar imagem",exact:true}).click();await page.waitForTimeout(500);
        assert.ok(state.posts[0].spec.slides[0].background_path,"Generated background should be saved with CAS");
        await page.waitForFunction(()=>[...document.images].some(image=>image.alt.startsWith("Slide ")&&image.complete&&image.naturalWidth===1080));
        await screenshot("with-private-background");
        const pending=page.waitForEvent("download");await page.getByRole("button",{name:"Exportar conteúdo",exact:true}).click();const download=await pending;
        const filename=`${label}-private-background-export.png`;await download.saveAs(path.join(out,filename));
        const png=await readFile(path.join(out,filename));assert.equal(png.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
        assert.ok(png.length>10000);return {file:filename,bytes:png.length};
      });
      await check(`${label}: image-bearing draft cannot offer unsupported copy`,async()=>{
        const copies=page.getByRole("button",{name:/Salvar como novo rascunho|Salvar cópia/});
        await screenshot("copy-private-background");
        for(const button of await copies.all())assert.ok(await button.isDisabled(),"UI offers unsupported new copy of an existing private image");
      });
      await check(`${label}: manual creation, generation, revision and approval`,async()=>{
        await page.getByRole("button",{name:"Novo rascunho",exact:true}).click();
        await page.getByLabel("Tema",{exact:true}).fill("Novo conteúdo sintético");await page.getByLabel("Público",{exact:true}).fill("misto");
        await page.getByLabel(/^Briefing/).fill("Criar exemplo sintético sem pessoas reais");
        await page.getByRole("button",{name:"Gerar conteúdo",exact:true}).click();await page.waitForTimeout(300);
        assert.equal(await page.getByLabel("Título do slide",{exact:true}).inputValue(),baseSpec.slides[0].title);
        await page.getByLabel(/^Revisão/).fill("Revisar somente a legenda sintética");await page.getByRole("button",{name:"Revisar",exact:true}).click();await page.waitForTimeout(300);
        assert.equal(await page.getByLabel(/^Legenda/).inputValue(),"Legenda revisada sintética");
        await page.getByRole("button",{name:"Aprovar",exact:true}).click();await page.waitForTimeout(300);assert.equal(state.posts[0].status,"approved");
      });
      await check(`${label}: changing to story keeps a valid generation style`,async()=>{
        await page.getByLabel(/^Formato/).selectOption("qa_story");await page.getByRole("button",{name:"Gerar conteúdo",exact:true}).click();await page.waitForTimeout(300);
        const call=state.calls.findLast(c=>c.action==="generate");const aesthetic=settings.aesthetics.find(a=>a.key===call.aesthetic);
        await screenshot("story-format-generation");assert.ok(!aesthetic.formats || aesthetic.formats.includes(call.format),JSON.stringify({format:call.format,aesthetic:call.aesthetic}));
      });
      await check(`${label}: quota error preserves draft and sanitized message`,async()=>{
        const value=await page.getByLabel("Título do slide",{exact:true}).inputValue();state.nextError={status:429,body:{error:"provider private failure"}};
        await page.getByRole("button",{name:"Gerar conteúdo",exact:true}).click();await page.getByText(/Limite de geração atingido/).waitFor();assert.equal(await page.getByLabel("Título do slide",{exact:true}).inputValue(),value);
      });
      await check(`${label}: calendar UI respects backend maximum of 6 weeks`,async()=>{
        await page.getByRole("tab",{name:"Calendário",exact:true}).click();await page.getByLabel("Semanas",{exact:true}).fill("7");
        await screenshot("calendar-seven-weeks");assert.ok(await page.getByRole("button",{name:"Gerar calendário",exact:true}).isDisabled(),"UI permits 7..12 weeks, backend accepts only 1..6");
      });
      await check(`${label}: calendar generates, persists, downloads and fits viewport`,async()=>{
        await page.getByLabel("Semanas",{exact:true}).fill("4");await page.getByRole("button",{name:"Gerar calendário",exact:true}).click();await page.waitForTimeout(300);
        assert.equal(state.calendars.length,1);const pending=page.waitForEvent("download");await page.getByRole("button",{name:"Baixar calendário",exact:true}).click();const download=await pending;
        await download.saveAs(path.join(out,`${label}-calendar.json`));await screenshot("calendar");assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      });
    }
    await writeFile(path.join(out,`${label}-fixture-calls.json`),JSON.stringify(state.calls,null,2));
    report.checks.push({name:`${label}: browser uncaught errors`,pass:pageErrors.length===0,evidence:pageErrors});
    await context.close();
  }
} catch(error) {
  report.fatal={message:error.message,stack:error.stack};console.error(error.message);
} finally {
  await browser?.close();await server.close();
  report.source_hashes_end=await hashes();report.source_changed_during_run=sources.filter(file=>report.source_hashes_start[file]!==report.source_hashes_end[file]);
  report.finished_at=new Date().toISOString();report.passed=report.checks.filter(c=>c.pass).length;report.failed=report.checks.filter(c=>!c.pass).length;
  await writeFile(path.join(out,"report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,fatal:report.fatal?.message,source_changed:report.source_changed_during_run,report:path.join(out,"report.json")}));
  if(report.failed||report.fatal)process.exitCode=1;
}
