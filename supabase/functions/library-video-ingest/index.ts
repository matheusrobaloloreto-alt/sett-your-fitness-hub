// Ingestão de vídeos próprios na biblioteca de exercícios.
// Usada pelo pipeline scripts/video-ingest.mjs (vídeos gravados pelos modelos → app).
// Auth: segredo compartilhado (x-webhook-secret) — nunca expõe a service role fora daqui.
//
// Ações:
//   {action:"list"}                              → biblioteca (id, nome, grupo, equipamento, status do vídeo)
//   {action:"sign", path}                        → signed upload URL no bucket exercises-videos
//   {action:"commit", items:[{id, video_path, thumbnail_url?}]} → aponta o exercício para o vídeo próprio
//   {action:"coverage"}                          → resumo de cobertura (quantos já têm vídeo próprio)
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "exercises-videos";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const secret = Deno.env.get("VIDEO_INGEST_SECRET") || "";
  const supplied = req.headers.get("x-webhook-secret") || "";
  if (!secret || supplied !== secret) return json({ error: "forbidden" }, 403);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const action = body?.action;

  if (action === "list") {
    const all: any[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from("exercise_library")
        .select("id, name, muscle_group, equipment, video_path, video_url, youtube_video_id, thumbnail_url")
        .order("muscle_group").order("name")
        .range(from, from + PAGE - 1);
      if (error) return json({ error: error.message }, 500);
      all.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return json({ total: all.length, items: all });
  }

  if (action === "coverage") {
    const { data, error } = await admin.from("exercise_library").select("video_path, video_url, youtube_video_id");
    if (error) return json({ error: error.message }, 500);
    const rows = data || [];
    return json({
      total: rows.length,
      proprio: rows.filter((r: any) => r.video_path).length,
      mfit: rows.filter((r: any) => !r.video_path && (r.video_url || "").includes("cloudfront")).length,
      youtube: rows.filter((r: any) => !r.video_path && !(r.video_url || "").includes("cloudfront") && r.youtube_video_id).length,
      sem_video: rows.filter((r: any) => !r.video_path && !r.video_url && !r.youtube_video_id).length,
    });
  }

  if (action === "sign") {
    const path = String(body?.path || "");
    if (!path || path.includes("..") || path.startsWith("/")) return json({ error: "path inválido" }, 400);
    // upsert: regravação do mesmo exercício substitui o arquivo anterior
    await admin.storage.from(BUCKET).remove([path]).catch(() => {});
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) return json({ error: error.message }, 500);
    return json({ signedUrl: data.signedUrl, token: data.token, path: data.path });
  }

  if (action === "commit") {
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return json({ error: "items vazio" }, 400);
    const results: any[] = [];
    for (const it of items) {
      if (!it?.id || !it?.video_path) { results.push({ id: it?.id, ok: false, error: "id/video_path" }); continue; }
      // Vídeo próprio vira a fonte única: zera YouTube para a capa/player nunca divergirem.
      const { error } = await admin
        .from("exercise_library")
        .update({
          video_path: it.video_path,
          thumbnail_url: it.thumbnail_url ?? null,
          video_url: null,
          youtube_video_id: null,
        })
        .eq("id", it.id);
      results.push({ id: it.id, ok: !error, error: error?.message });
    }
    return json({ updated: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok), results });
  }

  return json({ error: "ação desconhecida" }, 400);
});
