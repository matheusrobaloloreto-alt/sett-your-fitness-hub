import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";

import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Trash2, Play, Globe, Building2, Upload, Loader2, Dumbbell } from "lucide-react";
import { exerciseThumb } from "@/lib/exerciseCover";
import { useMaster } from "@/contexts/MasterContext";
import { buildExerciseTargetPayload, replaceExerciseMuscleTargets } from "@/lib/exerciseTargetConfig";
import { resolveExerciseUploadScope } from "@/lib/exerciseUploadScope";

interface Exercise {
  id: string;
  name: string;
  description: string | null;
  muscle_group: string;
  category: string | null;
  youtube_video_id?: string | null;
  video_url: string | null;
  video_path: string | null;
  thumbnail_url: string | null;
  is_global: boolean;
  company_id: string | null;
  created_by: string;
}

interface MuscleGroup {
  id: string;
  name: string;
}

interface MuscleTarget {
  muscle_group_id: string;
  role: string;
  volume_percentage: number;
}

type MfitImportExercise = {
  name: string;
  description: string | null;
  muscle_group: string;
  category: string | null;
  equipment: string | null;
  difficulty: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  source_id: string | null;
};

const useMuscleGroups = (effectiveCompanyId: string | null | undefined) => {
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  useEffect(() => {
    const load = async () => {
      const { data } = await (supabase as any).from("muscle_groups").select("id, name").order("name");
      setGroups((data as MuscleGroup[]) || []);
    };
    load();
  }, [effectiveCompanyId]);
  return groups;
};

const MUSCLE_GROUP_NAMES_FALLBACK = [
  "Quadríceps", "Glúteo", "Posterior de Coxa", "Adutores", "Panturrilha",
  "Peitoral", "Dorsal", "Deltoide Lateral", "Deltoide Anterior", "Deltoide Posterior",
  "Bíceps", "Tríceps", "Antebraço", "Abdominais", "Lombar / Eretores",
];

const EXERCISES_PER_PAGE = 80;

export default function ExerciseLibrary() {
  const { user, role, companyId } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;
  const isMaster = role === "master";
  const muscleGroups = useMuscleGroups(effectiveCompanyId);
  const MUSCLE_GROUPS = muscleGroups.length > 0 ? muscleGroups.map((g) => g.name) : MUSCLE_GROUP_NAMES_FALLBACK;
  const { toast } = useToast();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState("all");
  const [visibleCount, setVisibleCount] = useState(EXERCISES_PER_PAGE);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [videoModal, setVideoModal] = useState<{ type: "path" | "url"; value: string } | null>(null);
  const [form, setForm] = useState({
    name: "", description: "", muscle_group: "geral",
    video_url: "", is_global: isMaster,
  });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importingMfit, setImportingMfit] = useState(false);
  const [mfitImportFileName, setMfitImportFileName] = useState("");
  const [mfitImportPreview, setMfitImportPreview] = useState<MfitImportExercise[]>([]);
  // Upload rápido/inline de vídeo por exercício (sem abrir o formulário de edição).
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const quickInputRef = useRef<HTMLInputElement>(null);
  const quickExRef = useRef<Exercise | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Muscle targets state
  const [primaryMuscleIds, setPrimaryMuscleIds] = useState<string[]>([]);
  const [secondaryMuscleIds, setSecondaryMuscleIds] = useState<string[]>([]);

  // Map exercise_id -> targets (with effective % considering company override)
  const [targetsByExercise, setTargetsByExercise] = useState<Record<string, MuscleTarget[]>>({});
  // Per-company volume overrides for the editing exercise: muscle_group_id -> volume_percentage
  const [companyVolumes, setCompanyVolumes] = useState<Record<string, number>>({});

  const loadExercises = useCallback(async () => {
    const { data, error } = await supabase
      .from("exercise_library")
      .select("*")
      .order("muscle_group")
      .order("name");
    if (error) console.error(error);
    const list = ((data || []) as unknown as Exercise[]).map((exercise) => ({
      ...exercise,
      youtube_video_id: exercise.youtube_video_id ?? null,
    }));
    setExercises(list);

    // Load muscle targets for all exercises in one query
    const ids = list.map((e) => e.id);
    if (ids.length === 0) {
      setTargetsByExercise({});
      return;
    }
    const { data: targets } = await (supabase as any)
      .from("exercise_muscle_targets")
      .select("exercise_id, muscle_group_id, role, volume_percentage")
      .in("exercise_id", ids);

    // Apply company overrides if scoped to a company
    const overrides: Record<string, Record<string, number>> = {};
    if (effectiveCompanyId) {
      const { data: ovs } = await (supabase as any)
        .from("company_exercise_volumes")
        .select("exercise_id, muscle_group_id, volume_percentage")
        .eq("company_id", effectiveCompanyId)
        .in("exercise_id", ids);
      (ovs || []).forEach((o: any) => {
        if (!overrides[o.exercise_id]) overrides[o.exercise_id] = {};
        overrides[o.exercise_id][o.muscle_group_id] = Number(o.volume_percentage);
      });
    }

    const map: Record<string, MuscleTarget[]> = {};
    (targets || []).forEach((t: any) => {
      const ov = overrides[t.exercise_id]?.[t.muscle_group_id];
      const eff: MuscleTarget = {
        muscle_group_id: t.muscle_group_id,
        role: t.role,
        volume_percentage: ov != null ? ov : Number(t.volume_percentage),
      };
      if (!map[t.exercise_id]) map[t.exercise_id] = [];
      map[t.exercise_id].push(eff);
    });
    setTargetsByExercise(map);
  }, [effectiveCompanyId]);

  useEffect(() => { void loadExercises(); }, [loadExercises]);

  const getStoragePublicUrl = (path: string) => {
    const { data } = supabase.storage.from("exercises-videos").getPublicUrl(path);
    return data.publicUrl;
  };

  const loadMuscleTargets = async (exerciseId: string) => {
    const { data } = await (supabase as any)
      .from("exercise_muscle_targets")
      .select("muscle_group_id, role, volume_percentage")
      .eq("exercise_id", exerciseId);
    const targets = (data as MuscleTarget[]) || [];
    const primaries = targets.filter(t => t.role === "primary");
    const secondaries = targets.filter(t => t.role === "secondary");
    setPrimaryMuscleIds(primaries.map(p => p.muscle_group_id));
    setSecondaryMuscleIds(secondaries.map(s => s.muscle_group_id));
  };

  const saveMuscleTargets = async (exerciseId: string) => {
    const targets = buildExerciseTargetPayload(primaryMuscleIds, secondaryMuscleIds);
    await replaceExerciseMuscleTargets(supabase as any, exerciseId, targets);
  };

  const handleSave = async () => {
    if (!form.name) return;
    try {
      buildExerciseTargetPayload(primaryMuscleIds, secondaryMuscleIds);
    } catch (error) {
      toast({
        title: "Configuração muscular incompleta",
        description: error instanceof Error ? error.message : "Selecione os alvos musculares.",
        variant: "destructive",
      });
      return;
    }
    let uploadScope;
    try {
      uploadScope = resolveExerciseUploadScope({
        isMaster,
        isEditing: Boolean(editing),
        existingIsGlobal: editing?.is_global === true,
        effectiveCompanyId,
        companyId,
      });
    } catch (error) {
      toast({
        title: "Empresa não identificada",
        description: error instanceof Error ? error.message : "Selecione uma empresa antes de salvar.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);

    let videoPath: string | null = editing?.video_path || null;

    if (videoFile) {
      const uploadCompanyId = uploadScope.storage_scope;
      const ext = videoFile.name.split(".").pop() || "mp4";
      const filePath = `${uploadCompanyId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("exercises-videos")
        .upload(filePath, videoFile);

      if (uploadError) {
        toast({ title: "Erro no upload", description: uploadError.message, variant: "destructive" });
        setUploading(false);
        return;
      }
      videoPath = filePath;
    }

    const payload: any = {
      name: form.name,
      description: form.description || null,
      muscle_group: form.muscle_group,
      video_url: form.video_url || null,
      video_path: videoPath,
      is_global: uploadScope.is_global,
      company_id: uploadScope.company_id,
      created_by: user!.id,
    };

    let exerciseId: string | null = null;

    if (editing) {
      const { error } = await supabase.from("exercise_library").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); setUploading(false); return; }
      exerciseId = editing.id;
    } else {
      const { data, error } = await supabase.from("exercise_library").insert(payload).select("id").single();
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); setUploading(false); return; }
      exerciseId = data.id;
    }

    // Save muscle targets
    try {
      if (exerciseId) {
        await saveMuscleTargets(exerciseId);
        await saveCompanyVolumes(exerciseId);
      }
    } catch (error) {
      toast({
        title: "Exercício salvo, mas a configuração muscular falhou",
        description: error instanceof Error ? error.message : "Revise os alvos e tente novamente.",
        variant: "destructive",
      });
      setUploading(false);
      return;
    }

    toast({ title: editing ? "Exercício atualizado!" : "Exercício criado!" });
    setUploading(false);
    resetForm();
    loadExercises();
  };

  const handleDelete = async (id: string) => {
    const exercise = exercises.find(e => e.id === id);
    if (exercise?.video_path) {
      await supabase.storage.from("exercises-videos").remove([exercise.video_path]);
    }
    const { error } = await supabase.from("exercise_library").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Exercício excluído" });
    loadExercises();
  };

  const loadCompanyVolumes = async (exerciseId: string) => {
    if (!effectiveCompanyId) { setCompanyVolumes({}); return; }
    const { data } = await (supabase as any)
      .from("company_exercise_volumes")
      .select("muscle_group_id, volume_percentage")
      .eq("company_id", effectiveCompanyId)
      .eq("exercise_id", exerciseId);
    const map: Record<string, number> = {};
    (data || []).forEach((row: any) => { map[row.muscle_group_id] = Number(row.volume_percentage); });
    setCompanyVolumes(map);
  };

  const saveCompanyVolumes = async (exerciseId: string) => {
    if (!effectiveCompanyId) return;
    const rows = Object.entries(companyVolumes)
      .filter(([mgId]) => allSelectedIds.includes(mgId))
      .map(([mgId, pct]) => ({
        company_id: effectiveCompanyId,
        exercise_id: exerciseId,
        muscle_group_id: mgId,
        role: primaryMuscleIds.includes(mgId) ? "primary" : "secondary",
        volume_percentage: pct,
      }));
    if (rows.length > 0) {
      const { error } = await (supabase as any)
        .from("company_exercise_volumes")
        .upsert(rows, { onConflict: "company_id,exercise_id,muscle_group_id" });
      if (error) throw new Error(error.message || "Falha ao salvar percentuais da empresa.");
    }
  };

  const openEdit = async (ex: Exercise) => {
    setEditing(ex);
    setForm({
      name: ex.name, description: ex.description || "",
      muscle_group: ex.muscle_group, video_url: ex.video_url || "",
      is_global: ex.is_global,
    });
    setVideoFile(null);
    await loadMuscleTargets(ex.id);
    await loadCompanyVolumes(ex.id);
    setOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", muscle_group: "geral", video_url: "", is_global: isMaster });
    setVideoFile(null);
    setOpen(true);
  };

  const resetForm = () => {
    setOpen(false);
    setEditing(null);
    setVideoFile(null);
    setPrimaryMuscleIds([]);
    setSecondaryMuscleIds([]);
    setCompanyVolumes({});
    setForm({ name: "", description: "", muscle_group: "geral", video_url: "", is_global: isMaster });
  };

  const getEmbedUrl = (url: string) => {
    if (url.includes("youtube.com/watch")) {
      const vid = new URL(url).searchParams.get("v");
      return vid ? `https://www.youtube.com/embed/${vid}` : url;
    }
    if (url.includes("youtu.be/")) {
      const vid = url.split("youtu.be/")[1]?.split("?")[0];
      return vid ? `https://www.youtube.com/embed/${vid}` : url;
    }
    if (url.includes("vimeo.com/")) {
      const vid = url.split("vimeo.com/")[1]?.split("?")[0];
      return vid ? `https://player.vimeo.com/video/${vid}` : url;
    }
    return url;
  };

  const triggerQuickUpload = (ex: Exercise) => {
    quickExRef.current = ex;
    quickInputRef.current?.click();
  };

  const onQuickUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const ex = quickExRef.current;
    e.target.value = "";
    if (!file || !ex) return;
    setUploadingId(ex.id);
    try {
      const quickUploadScope = resolveExerciseUploadScope({
        isMaster,
        isEditing: true,
        existingIsGlobal: ex.is_global,
        effectiveCompanyId: ex.company_id || effectiveCompanyId,
        companyId,
      });
      const uploadCompanyId = quickUploadScope.storage_scope;
      const ext = file.name.split(".").pop() || "mp4";
      const filePath = `${uploadCompanyId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("exercises-videos").upload(filePath, file);
      if (upErr) { toast({ title: "Erro no upload", description: upErr.message, variant: "destructive" }); return; }
      const { error: updErr } = await supabase.from("exercise_library").update({ video_path: filePath }).eq("id", ex.id);
      if (updErr) { toast({ title: "Erro", description: updErr.message, variant: "destructive" }); return; }
      if (ex.video_path) { try { await supabase.storage.from("exercises-videos").remove([ex.video_path]); } catch { /* ignore */ } }
      toast({ title: "Vídeo enviado!", description: ex.name });
      loadExercises();
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err?.message || "Tente novamente", variant: "destructive" });
    } finally {
      setUploadingId(null);
    }
  };

  const openVideoForExercise = (ex: Exercise) => {
    if (ex.video_path) {
      setVideoModal({ type: "path", value: getStoragePublicUrl(ex.video_path) });
    } else if (ex.video_url) {
      setVideoModal({ type: "url", value: ex.video_url });
    } else if (ex.youtube_video_id) {
      setVideoModal({ type: "url", value: `https://www.youtube.com/watch?v=${ex.youtube_video_id}` });
    }
  };

  useEffect(() => {
    setVisibleCount(EXERCISES_PER_PAGE);
  }, [search, filterGroup, effectiveCompanyId]);

  const filtered = useMemo(() => exercises.filter((ex) => {
    const matchSearch = ex.name.toLowerCase().includes(search.toLowerCase());
    const matchGroup = filterGroup === "all" || ex.muscle_group === filterGroup;
    return matchSearch && matchGroup;
  }), [exercises, filterGroup, search]);

  const visibleExercises = filtered.slice(0, visibleCount);
  const grouped = visibleExercises.reduce<Record<string, Exercise[]>>((acc, ex) => {
    const g = ex.muscle_group;
    if (!acc[g]) acc[g] = [];
    acc[g].push(ex);
    return acc;
  }, {});

  const allSelectedIds = [...primaryMuscleIds, ...secondaryMuscleIds];

  const updateSlot = (list: string[], setList: (v: string[]) => void, index: number, value: string) => {
    const next = [...list];
    if (value === "none") {
      next.splice(index, 1);
    } else {
      next[index] = value;
    }
    setList(next);
  };

  const addSlot = (list: string[], setList: (v: string[]) => void) => {
    setList([...list, ""]);
  };

  const removeSlot = (list: string[], setList: (v: string[]) => void, index: number) => {
    setList(list.filter((_, i) => i !== index));
  };

  const normalizeText = (value: unknown) => String(value ?? "").trim();

  const normalizeMfitGroup = (value: unknown) => {
    const raw = normalizeText(value).toLowerCase();
    const map: Record<string, string> = {
      abd: "Abdominais",
      abdomen: "Abdominais",
      abdominal: "Abdominais",
      abs: "Abdominais",
      biceps: "Bíceps",
      bíceps: "Bíceps",
      triceps: "Tríceps",
      tríceps: "Tríceps",
      chest: "Peitoral",
      peito: "Peitoral",
      dorsal: "Dorsal",
      back: "Dorsal",
      costas: "Dorsal",
      shoulder: "Ombros",
      ombro: "Ombros",
      ombros: "Ombros",
      inferiores: "Quadríceps",
      inf: "Quadríceps",
      quadriceps: "Quadríceps",
      quadríceps: "Quadríceps",
      gluteo: "Glúteo",
      glúteo: "Glúteo",
      posterior: "Posterior de Coxa",
      hamstrings: "Posterior de Coxa",
      panturrilha: "Panturrilha",
      calf: "Panturrilha",
      calves: "Panturrilha",
      mobilidade: "Mobilidade",
      mobility: "Mobilidade",
      alongamento: "Alongamento",
      stretching: "Alongamento",
      funcional: "Funcional",
      functional: "Funcional",
      elastico: "Elástico",
      elástico: "Elástico",
      resistance_band: "Elástico",
      outros: "geral",
      other: "geral",
    };
    return map[raw] || normalizeText(value) || "geral";
  };

  const parseCsvRows = (text: string) => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (char === '"' && quoted && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (field || row.length) rows.push([...row, field]);
        row = [];
        field = "";
        if (char === "\r" && next === "\n") i += 1;
      } else {
        field += char;
      }
    }
    if (field || row.length) rows.push([...row, field]);
    if (rows.length < 2) return [];
    const headers = rows[0].map((h) => h.trim());
    return rows.slice(1).map((values) => headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = values[index] ?? "";
      return acc;
    }, {}));
  };

  const mfitMediaToUrl = (row: any) => {
    const url = normalizeText(row.urlMedia ?? row.url_media ?? row.video_url ?? row.videoUrl ?? row.media ?? row.url);
    const mediaType = Number(row.mediaType ?? row.media_type ?? row.tipoMidia ?? -1);
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    if (mediaType === 0 || /^[a-zA-Z0-9_-]{8,}$/.test(url)) return `https://www.youtube.com/watch?v=${url}`;
    return url;
  };

  const normalizeMfitRow = (row: any): MfitImportExercise | null => {
    const name = normalizeText(row.name ?? row.nome ?? row.exercise ?? row.exercicio ?? row.exercise_name);
    if (!name) return null;
    const rawGroup = row.group ?? row.grupo ?? row.exerciseGroup?.nome ?? row.exerciseGroup?.id ?? row.muscle_group ?? row.category;
    const poster = normalizeText(row.urlPoster ?? row.url_poster ?? row.thumbnail_url ?? row.poster);
    return {
      name,
      description: normalizeText(row.description ?? row.descricao ?? row.obs ?? row.instructions) || null,
      muscle_group: normalizeMfitGroup(rawGroup),
      category: normalizeText(row.category ?? row.categoria ?? row.exerciseCategory?.name ?? row.exerciseCategory?.id) || null,
      equipment: normalizeText(row.equipment ?? row.equipamento) || null,
      difficulty: normalizeText(row.difficulty ?? row.nivel) || null,
      video_url: mfitMediaToUrl(row),
      thumbnail_url: poster || null,
      source_id: normalizeText(row.id ?? row.objectID ?? row.exercise_id) || null,
    };
  };

  const collectMfitRows = (payload: any): any[] => {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    const candidates = [
      payload.exercises,
      payload.exercicios,
      payload.items,
      payload.data,
      payload.results,
      payload.payload,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
      if (candidate && typeof candidate === "object") {
        const nested = collectMfitRows(candidate);
        if (nested.length) return nested;
      }
    }
    return [];
  };

  const parseMfitFile = async (file: File) => {
    const text = await file.text();
    const rawRows = file.name.toLowerCase().endsWith(".csv")
      ? parseCsvRows(text)
      : collectMfitRows(JSON.parse(text));
    const normalized = rawRows
      .map(normalizeMfitRow)
      .filter((row): row is MfitImportExercise => Boolean(row));
    const unique = Array.from(new Map(normalized.map((row) => [row.name.toLowerCase(), row])).values());
    setMfitImportFileName(file.name);
    setMfitImportPreview(unique);
  };

  const buildMfitDescription = (ex: MfitImportExercise, currentDescription = "") => {
    const base = currentDescription
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("Categoria MFIT:") && !line.startsWith("ID MFIT:"))
      .join("\n");
    const hasCategory = base.includes("Categoria MFIT:");
    const hasSourceId = base.includes("ID MFIT:");
    return [
      base || ex.description || "Importado do MFIT.",
      ex.category && !hasCategory ? `Categoria MFIT: ${ex.category}` : null,
      ex.source_id && !hasSourceId ? `ID MFIT: ${ex.source_id}` : null,
    ].filter(Boolean).join("\n");
  };

  const handleMfitFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await parseMfitFile(file);
      setImportOpen(true);
    } catch (err: any) {
      toast({
        title: "Arquivo MFIT inválido",
        description: err?.message || "Use um JSON ou CSV exportado da biblioteca do MFIT.",
        variant: "destructive",
      });
    }
  };

  const importMfitExercises = async () => {
    if (mfitImportPreview.length === 0) return;
    setImportingMfit(true);
    try {
      const existingByName = new Map(exercises.map((ex) => [ex.name.trim().toLowerCase(), ex]));
      const rows = mfitImportPreview.filter((ex) => !existingByName.has(ex.name.trim().toLowerCase()));
      const duplicates = mfitImportPreview
        .map((ex) => ({ importRow: ex, existing: existingByName.get(ex.name.trim().toLowerCase()) }))
        .filter((item): item is { importRow: MfitImportExercise; existing: Exercise } => Boolean(item.existing));

      const payload = rows.map((ex) => ({
        name: ex.name,
        description: buildMfitDescription(ex),
        muscle_group: ex.muscle_group,
        equipment: ex.equipment,
        difficulty: ex.difficulty || "intermediate",
        video_url: ex.video_url,
        thumbnail_url: ex.thumbnail_url,
        is_global: isMaster,
        company_id: isMaster ? null : (effectiveCompanyId || companyId),
        created_by: user!.id,
      }));

      if (payload.length > 0) {
        const { error } = await (supabase as any).from("exercise_library").insert(payload);
        if (error) throw error;
      }

      let updated = 0;
      for (const { importRow, existing } of duplicates) {
        const update: Record<string, string | null> = {
          description: buildMfitDescription(importRow, existing.description || ""),
        };
        if (importRow.video_url && !existing.video_url && !existing.video_path) update.video_url = importRow.video_url;
        if (importRow.thumbnail_url && !existing.thumbnail_url) update.thumbnail_url = importRow.thumbnail_url;
        if (importRow.muscle_group && ["", "geral", "outros"].includes((existing.muscle_group || "").toLowerCase())) {
          update.muscle_group = importRow.muscle_group;
        }
        if (Object.keys(update).length > 1 || update.description !== (existing.description || "")) {
          const { error } = await (supabase as any).from("exercise_library").update(update).eq("id", existing.id);
          if (error) throw error;
          updated += 1;
        }
      }

      if (rows.length === 0 && updated === 0) {
        toast({ title: "Nada novo para importar", description: "Todos os exercícios desse arquivo já estão sincronizados." });
        return;
      }
      toast({
        title: "Exercícios importados",
        description: `${rows.length} novo(s) e ${updated} exercício(s) sincronizado(s) com vídeos do MFIT.`,
      });
      setImportOpen(false);
      setMfitImportPreview([]);
      setMfitImportFileName("");
      loadExercises();
    } catch (err: any) {
      toast({ title: "Erro ao importar MFIT", description: err?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setImportingMfit(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-4xl text-primary">BIBLIOTECA DE EXERCÍCIOS</h1>
              <BnitoContextButton
                label="biblioteca de exercicios"
                context="Cadastro de exercicios, grupos musculares, videos e distribuicao de volume usada pela prescricao."
                question="Como devo cadastrar exercicios e volume muscular para a prescricao ficar mais precisa?"
              />
            </div>
            <p className="text-muted-foreground font-sans">
              {isMaster ? "Gerencie a biblioteca global e de empresas" : "Gerencie os exercícios da sua empresa"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />Importar MFIT
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />Novo Exercício
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar exercícios..."
              className="pl-10 bg-secondary border-border"
            />
          </div>
          <Select value={filterGroup} onValueChange={setFilterGroup}>
            <SelectTrigger className="w-48 bg-secondary border-border">
              <SelectValue placeholder="Grupo muscular" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os grupos</SelectItem>
              {MUSCLE_GROUPS.map((g) => (
                <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground font-mono-data">
          Exibindo {Math.min(visibleCount, filtered.length)} de {filtered.length} exercício(s)
        </p>

        {/* Exercise grid grouped by muscle group */}
        {Object.keys(grouped).length === 0 && (
          <p className="text-center text-muted-foreground font-sans py-12">Nenhum exercício encontrado</p>
        )}
        {Object.entries(grouped).map(([group, exs]) => (
          <div key={group}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-lg text-primary capitalize">{group}</h2>
              <BnitoContextButton
                label={`grupo muscular ${group}`}
                context={`Grupo muscular/categoria da biblioteca: ${group}. Ajuda para organizar exercicios, foco primario/secundario e prescricao.`}
                question={`Como devo usar os exercicios de ${group} na prescricao e no controle de volume?`}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
              {exs.map((ex) => (
                <Card key={ex.id} className="bg-card border-border group overflow-hidden">
                  {/* Capa do exercício (vídeo) */}
                  <div className="relative aspect-video w-full bg-secondary">
                    {exerciseThumb(ex) ? (
                      <img src={exerciseThumb(ex)!} alt={ex.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center"><Dumbbell className="h-7 w-7 text-muted-foreground/40" /></div>
                    )}
                    {(ex.video_path || ex.video_url || exerciseThumb(ex)) && (
                      <button type="button" onClick={() => openVideoForExercise(ex)} className="absolute inset-0 flex items-center justify-center bg-black/0 transition hover:bg-black/30">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100"><Play className="h-4 w-4" /></span>
                      </button>
                    )}
                  </div>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground font-sans font-medium truncate">{ex.name}</p>
                        {ex.description && (
                          <p className="text-xs text-muted-foreground font-sans line-clamp-2">{ex.description}</p>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(ex)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(ex.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="capitalize text-xs">{ex.muscle_group}</Badge>
                      {ex.is_global && (
                        <Badge variant="secondary" className="text-xs">
                          <Globe className="h-3 w-3 mr-1" />Global
                        </Badge>
                      )}
                      {!ex.is_global && ex.company_id && (
                        <Badge variant="secondary" className="text-xs">
                          <Building2 className="h-3 w-3 mr-1" />Empresa
                        </Badge>
                      )}
                    </div>
                    {(targetsByExercise[ex.id]?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {targetsByExercise[ex.id]
                          .slice()
                          .sort((a, b) => (a.role === b.role ? 0 : a.role === "primary" ? -1 : 1))
                          .map((t, i) => {
                            const mgName = muscleGroups.find((m) => m.id === t.muscle_group_id)?.name || "—";
                            const isPrimary = t.role === "primary";
                            return (
                              <Badge
                                key={`${t.muscle_group_id}-${i}`}
                                variant={isPrimary ? "default" : "outline"}
                                className="text-[10px] font-sans"
                              >
                                {isPrimary ? "P" : "S"} · {mgName} · {Math.round(t.volume_percentage)}%
                              </Badge>
                            );
                          })}
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      {(ex.video_path || ex.video_url) && (
                        <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => openVideoForExercise(ex)}>
                          <Play className="h-3.5 w-3.5 mr-1" />Ver Vídeo
                        </Button>
                      )}
                      <Button
                        variant="outline" size="sm" className="flex-1 text-xs"
                        disabled={uploadingId === ex.id}
                        onClick={() => triggerQuickUpload(ex)}
                      >
                        {uploadingId === ex.id
                          ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Enviando…</>
                          : <><Upload className="h-3.5 w-3.5 mr-1" />{(ex.video_path || ex.video_url) ? "Trocar vídeo" : "Subir vídeo"}</>}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
        {visibleCount < filtered.length && (
          <div className="flex justify-center pb-4">
            <Button variant="outline" onClick={() => setVisibleCount((count) => count + EXERCISES_PER_PAGE)}>
              Carregar mais exercícios
            </Button>
          </div>
        )}
      </div>

      {/* Input escondido do upload rápido/inline de vídeo por exercício */}
      <input ref={quickInputRef} type="file" accept="video/*" className="hidden" onChange={onQuickUploadChange} />

      {/* MFIT Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar exercícios do MFIT</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-dashed border-border p-4">
              <Label htmlFor="mfit-import-file" className="font-sans font-medium">Arquivo JSON ou CSV exportado do MFIT</Label>
              <Input
                id="mfit-import-file"
                type="file"
                accept=".json,.csv,application/json,text/csv"
                onChange={handleMfitFileChange}
                className="mt-2 bg-secondary border-border"
              />
              <p className="mt-2 text-xs text-muted-foreground font-sans">
                Campos aceitos: name/nome, urlMedia/url_media/video_url, urlPoster/url_poster, group/grupo, category/categoria e description/descricao.
              </p>
            </div>
            {mfitImportPreview.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-sans text-muted-foreground">
                    {mfitImportPreview.length} exercício(s) lido(s) de {mfitImportFileName || "arquivo MFIT"}.
                  </p>
                  <Button onClick={importMfitExercises} disabled={importingMfit}>
                    {importingMfit ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando...</> : "Adicionar à biblioteca"}
                  </Button>
                </div>
                <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                  {mfitImportPreview.slice(0, 80).map((ex) => (
                    <div key={`${ex.name}-${ex.source_id || ""}`} className="flex items-center justify-between gap-3 border-b border-border last:border-b-0 p-3">
                      <div className="min-w-0">
                        <p className="truncate font-sans font-medium text-sm">{ex.name}</p>
                        <p className="text-xs text-muted-foreground font-sans">{ex.muscle_group}{ex.category ? ` · ${ex.category}` : ""}</p>
                      </div>
                      <Badge variant={ex.video_url ? "default" : "outline"} className="shrink-0 text-xs">
                        {ex.video_url ? "com vídeo" : "sem vídeo"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); else setOpen(true); }}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              {editing ? "EDITAR EXERCÍCIO" : "NOVO EXERCÍCIO"}
              <BnitoContextButton
                label="cadastro de exercicio"
                context="Formulario de exercicio: nome, categoria, video, musculos primarios/secundarios e percentual de volume."
                question="Me ajuda a definir grupo muscular, musculos primarios/secundarios e percentual de volume deste exercicio?"
                className="ml-auto"
              />
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-sans">Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Agachamento Livre" className="bg-secondary border-border" />
            </div>
            <div className="space-y-2">
              <Label className="font-sans">Grupo Muscular (categoria)</Label>
              <Select value={form.muscle_group} onValueChange={(v) => setForm({ ...form, muscle_group: v })}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MUSCLE_GROUPS.map((g) => (
                    <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Muscle Target Configuration */}
            {muscleGroups.length > 0 && (
              <div className="space-y-3 p-3 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center gap-2">
                  <Label className="font-sans text-sm font-semibold">Distribuição de Carga (Volume)</Label>
                  <BnitoContextButton
                    label="distribuicao de carga do exercicio"
                    context="Define quais musculos recebem volume primario/secundario e qual percentual entra no calculo semanal."
                    question="Qual percentual de volume faz sentido para os musculos primarios e secundarios deste exercicio?"
                  />
                </div>
                <p className="text-xs text-muted-foreground font-sans">
                  Configure quais músculos este exercício trabalha para o cálculo de volume semanal.
                </p>
                
                <div className="grid grid-cols-2 gap-4">
                  {/* Primary muscles (100%) */}
                  <div className="space-y-2">
                    <Label className="font-sans text-xs font-semibold">Primários (100%)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {primaryMuscleIds.map((mgId, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <Select
                            value={mgId || "none"}
                            onValueChange={(v) => updateSlot(primaryMuscleIds, setPrimaryMuscleIds, idx, v)}
                          >
                            <SelectTrigger className="bg-secondary border-border h-8 text-xs">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Remover</SelectItem>
                              {muscleGroups
                                .filter(mg => mg.id === mgId || !allSelectedIds.includes(mg.id))
                                .map(mg => (
                                  <SelectItem key={mg.id} value={mg.id}>{mg.name}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button" variant="ghost" size="icon"
                            className="h-6 w-6 flex-shrink-0"
                            onClick={() => removeSlot(primaryMuscleIds, setPrimaryMuscleIds, idx)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button" variant="outline" size="sm"
                      className="text-xs h-7"
                      onClick={() => addSlot(primaryMuscleIds, setPrimaryMuscleIds)}
                    >
                      <Plus className="h-3 w-3 mr-1" />Adicionar
                    </Button>
                  </div>

                  {/* Secondary muscles (50%) */}
                  <div className="space-y-2">
                    <Label className="font-sans text-xs font-semibold">Secundários (50%)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {secondaryMuscleIds.map((mgId, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <Select
                            value={mgId || "none"}
                            onValueChange={(v) => updateSlot(secondaryMuscleIds, setSecondaryMuscleIds, idx, v)}
                          >
                            <SelectTrigger className="bg-secondary border-border h-8 text-xs">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Remover</SelectItem>
                              {muscleGroups
                                .filter(mg => mg.id === mgId || !allSelectedIds.includes(mg.id))
                                .map(mg => (
                                  <SelectItem key={mg.id} value={mg.id}>{mg.name}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button" variant="ghost" size="icon"
                            className="h-6 w-6 flex-shrink-0"
                            onClick={() => removeSlot(secondaryMuscleIds, setSecondaryMuscleIds, idx)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button" variant="outline" size="sm"
                      className="text-xs h-7"
                      onClick={() => addSlot(secondaryMuscleIds, setSecondaryMuscleIds)}
                    >
                      <Plus className="h-3 w-3 mr-1" />Adicionar
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Per-company volume override (only when editing and scoped to a company) */}
            {editing && effectiveCompanyId && allSelectedIds.length > 0 && (
              <div className="space-y-2 p-3 rounded-lg bg-secondary/50 border border-border">
                <Label className="font-sans text-sm font-semibold">Volume desta empresa (%)</Label>
                <p className="text-xs text-muted-foreground font-sans">
                  Personalize o percentual de volume contado para esta empresa. Em branco usa o padrão (100% primário / 50% secundário).
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {allSelectedIds.map((mgId) => {
                    const mg = muscleGroups.find((m) => m.id === mgId);
                    const isPrimary = primaryMuscleIds.includes(mgId);
                    const def = isPrimary ? 100 : 50;
                    return (
                      <div key={mgId} className="flex items-center gap-2">
                        <Label className="text-xs flex-1 truncate font-sans">
                          <span className="text-muted-foreground mr-1">{isPrimary ? "P" : "S"}</span>
                          {mg?.name || "—"}
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          max={200}
                          step={1}
                          value={companyVolumes[mgId] ?? ""}
                          placeholder={String(def)}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCompanyVolumes((prev) => {
                              const next = { ...prev };
                              if (v === "") delete next[mgId];
                              else next[mgId] = Number(v);
                              return next;
                            });
                          }}
                          className="bg-secondary border-border h-8 w-20 text-xs"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Video upload */}
            <div className="space-y-2">
              <Label className="font-sans">Upload de Vídeo</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-shrink-0"
                >
                  <Upload className="h-4 w-4 mr-2" />Selecionar Arquivo
                </Button>
                <span className="text-xs text-muted-foreground font-sans truncate">
                  {videoFile ? videoFile.name : editing?.video_path ? "Vídeo já salvo" : "Nenhum arquivo selecionado"}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-sans">URL do Vídeo (YouTube / Vimeo)</Label>
              <Input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="https://youtube.com/watch?v=..." className="bg-secondary border-border" />
              <p className="text-xs text-muted-foreground font-sans">O vídeo enviado por upload tem prioridade sobre a URL externa.</p>
            </div>

            <div className="space-y-2">
              <Label className="font-sans">Descrição</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Instruções de execução..." className="bg-secondary border-border" />
            </div>
            {isMaster && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editing ? editing.is_global : true}
                  disabled
                  className="h-4 w-4 rounded border-border"
                  id="is_global"
                />
                <Label htmlFor="is_global" className="font-sans">
                  {editing?.is_global === false
                    ? "Exercício privado existente (não será promovido automaticamente)"
                    : "Base Global (visível para todas as empresas)"}
                </Label>
              </div>
            )}
            <Button onClick={handleSave} className="w-full" disabled={uploading}>
              {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</> : editing ? "Salvar" : "Criar Exercício"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Video Modal */}
      <Dialog open={!!videoModal} onOpenChange={() => setVideoModal(null)}>
        <DialogContent className="bg-card border-border max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-primary">VÍDEO DO EXERCÍCIO</DialogTitle>
          </DialogHeader>
          {videoModal && (
            <div className="aspect-video w-full">
              {videoModal.type === "path" ? (
                <video
                  src={videoModal.value}
                  controls
                  className="w-full h-full rounded-md"
                />
              ) : (
                <iframe
                  src={getEmbedUrl(videoModal.value)}
                  className="w-full h-full rounded-md"
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
