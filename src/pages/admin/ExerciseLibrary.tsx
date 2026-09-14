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
import { Checkbox } from "@/components/ui/checkbox";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";

import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Trash2, Play, Globe, Building2, Upload, Loader2, Dumbbell } from "lucide-react";
import { EXERCISE_CATEGORIES, exerciseThumb, normalizedExerciseCategories, normalizedExerciseLibraryGroup } from "@/lib/exerciseCover";
import { canonicalCategorySlug, canonicalMuscleSlug, categoryLabel, muscleLabel, MUSCLE_GROUP_OPTIONS, normalizeExerciseTargets } from "@/lib/exerciseTaxonomy";
import { useMaster } from "@/contexts/MasterContext";
import { buildExerciseTargetPayload, replaceExerciseMuscleTargets } from "@/lib/exerciseTargetConfig";
import { resolveExerciseUploadScope } from "@/lib/exerciseUploadScope";

interface Exercise {
  id: string;
  name: string;
  description: string | null;
  muscle_group: string;
  category: string | null;
  categories?: string[] | null;
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
  role: string | null;
  volume_percentage: number | null;
  is_primary?: boolean | null;
}

type MfitImportExercise = {
  name: string;
  description: string | null;
  muscle_group: string | null;
  category: string | null;
  categories: string[];
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

const EXERCISES_PER_PAGE = 80;
const SUPABASE_PAGE_SIZE = 1000;
const SUPABASE_IN_CHUNK = 500;

async function fetchAllPages<T>(queryFactory: () => any, pageSize = SUPABASE_PAGE_SIZE): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data || []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function fetchExerciseTargets(exerciseIds: string[]): Promise<Array<MuscleTarget & { exercise_id: string }>> {
  const targets: Array<MuscleTarget & { exercise_id: string }> = [];
  for (let index = 0; index < exerciseIds.length; index += SUPABASE_IN_CHUNK) {
    const chunk = exerciseIds.slice(index, index + SUPABASE_IN_CHUNK);
    targets.push(...await fetchAllPages<Array<MuscleTarget & { exercise_id: string }>[number]>(() => (supabase as any)
      .from("exercise_muscle_targets")
      .select("exercise_id, muscle_group_id, role, is_primary, volume_percentage")
      .in("exercise_id", chunk)
      .order("exercise_id")
      .order("muscle_group_id")));
  }
  return targets;
}

export default function ExerciseLibrary() {
  const { user, role, companyId } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;
  const isMaster = role === "master";
  const muscleGroups = useMuscleGroups(effectiveCompanyId);
  const anatomicalMuscleOptions = useMemo(() => {
    const bySlug = new Map<string, MuscleGroup & { label: string; exact: boolean }>();
    for (const group of muscleGroups) {
      const slug = canonicalMuscleSlug(group.name);
      if (!slug) continue;
      const label = muscleLabel(slug) || group.name;
      const exact = group.name === label;
      const current = bySlug.get(slug);
      if (!current || (exact && !current.exact)) {
        bySlug.set(slug, { ...group, label, exact });
      }
    }
    return MUSCLE_GROUP_OPTIONS.flatMap((option) => {
      const group = bySlug.get(option.slug);
      return group ? [group] : [];
    });
  }, [muscleGroups]);
  const { toast } = useToast();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState("all");
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(EXERCISES_PER_PAGE);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [videoModal, setVideoModal] = useState<{ type: "path" | "url"; value: string } | null>(null);
  const [form, setForm] = useState({
    name: "", description: "", muscle_group: "",
    categories: [] as string[],
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

  // Map exercise_id -> explicit anatomical targets. Company overrides are historical only.
  const [targetsByExercise, setTargetsByExercise] = useState<Record<string, MuscleTarget[]>>({});
  const loadExercises = useCallback(async () => {
    try {
      const data = await fetchAllPages<Exercise>(() => supabase
        .from("exercise_library")
        .select("*")
        .order("muscle_group")
        .order("name")
        .order("id"));
      const list = (data as Exercise[]).map((exercise) => ({
        ...exercise,
        youtube_video_id: exercise.youtube_video_id ?? null,
      }));
      setExercises(list);

      const ids = list.map((e) => e.id);
      if (ids.length === 0) {
        setTargetsByExercise({});
        return;
      }
      const targets = await fetchExerciseTargets(ids);
      const map: Record<string, MuscleTarget[]> = {};
      targets.forEach((t) => {
        const target: MuscleTarget = {
          muscle_group_id: t.muscle_group_id,
          role: t.role,
          is_primary: t.is_primary,
          volume_percentage: Number(t.volume_percentage),
        };
        if (!map[t.exercise_id]) map[t.exercise_id] = [];
        map[t.exercise_id].push(target);
      });
      setTargetsByExercise(map);
    } catch (error) {
      console.error(error);
    }
  }, [effectiveCompanyId]);

  useEffect(() => { void loadExercises(); }, [loadExercises]);

  const getStoragePublicUrl = (path: string) => {
    const { data } = supabase.storage.from("exercises-videos").getPublicUrl(path);
    return data.publicUrl;
  };

  const loadMuscleTargets = async (exerciseId: string) => {
    const { data } = await (supabase as any)
      .from("exercise_muscle_targets")
      .select("muscle_group_id, role, is_primary, volume_percentage")
      .eq("exercise_id", exerciseId)
      .order("muscle_group_id");
    const targets = (data as MuscleTarget[]) || [];
    const primaries = targets.filter(t => t.role === "primary" || t.is_primary === true);
    const secondaries = targets.filter(t => t.role === "secondary" || t.is_primary === false);
    setPrimaryMuscleIds(primaries.map(p => p.muscle_group_id));
    setSecondaryMuscleIds(secondaries.map(s => s.muscle_group_id));
  };

  const handleSave = async () => {
    if (!form.name) return;
    let targetPayload;
    try {
      targetPayload = buildExerciseTargetPayload(primaryMuscleIds, secondaryMuscleIds);
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

    const primaryMuscleName = muscleGroups.find((group) => group.id === primaryMuscleIds[0])?.name;
    const legacyMuscleGroup = muscleLabel(form.muscle_group) || muscleLabel(primaryMuscleName);
    const payload: any = {
      name: form.name,
      description: form.description || null,
      muscle_group: legacyMuscleGroup,
      category: form.categories[0] || null,
      categories: form.categories,
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
        await replaceExerciseMuscleTargets(supabase as any, exerciseId, targetPayload);
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

  const openEdit = async (ex: Exercise) => {
    setEditing(ex);
    setForm({
      name: ex.name, description: ex.description || "",
      muscle_group: canonicalMuscleSlug(ex.muscle_group) || "",
      categories: normalizedExerciseCategories(ex),
      video_url: ex.video_url || "",
      is_global: ex.is_global,
    });
    setVideoFile(null);
    await loadMuscleTargets(ex.id);
    setOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", muscle_group: "", categories: [], video_url: "", is_global: isMaster });
    setVideoFile(null);
    setPrimaryMuscleIds([]);
    setSecondaryMuscleIds([]);
    setOpen(true);
  };

  const resetForm = () => {
    setOpen(false);
    setEditing(null);
    setVideoFile(null);
    setPrimaryMuscleIds([]);
    setSecondaryMuscleIds([]);
    setForm({ name: "", description: "", muscle_group: "", categories: [], video_url: "", is_global: isMaster });
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
  }, [search, filterGroup, categoryFilters, effectiveCompanyId]);

  const filtered = useMemo(() => exercises.filter((ex) => {
    const matchSearch = ex.name.toLowerCase().includes(search.toLowerCase());
    const matchGroup = filterGroup === "all" || normalizedExerciseLibraryGroup(ex) === filterGroup;
    const exCategories = normalizedExerciseCategories(ex);
    const matchCategory = categoryFilters.length === 0 || exCategories.some((category) => categoryFilters.includes(category));
    return matchSearch && matchGroup && matchCategory;
  }), [categoryFilters, exercises, filterGroup, search]);

  const visibleExercises = filtered.slice(0, visibleCount);
  const grouped = visibleExercises.reduce<Record<string, Exercise[]>>((acc, ex) => {
    const g = normalizedExerciseLibraryGroup(ex) || "Sem grupo principal";
    if (!acc[g]) acc[g] = [];
    acc[g].push(ex);
    return acc;
  }, {});

  const FILTER_GROUPS = useMemo(() => Array.from(new Set(
    exercises.map((exercise) => normalizedExerciseLibraryGroup(exercise)).filter((group): group is string => Boolean(group)),
  )).sort((a, b) => a.localeCompare(b, "pt-BR")), [exercises]);

  const allSelectedIds = [...primaryMuscleIds, ...secondaryMuscleIds];
  const toggleCategoryFilter = (categoryId: string) => {
    setCategoryFilters((current) => (
      current.includes(categoryId)
        ? current.filter((item) => item !== categoryId)
        : [...current, categoryId]
    ));
  };
  const toggleFormCategory = (categoryId: string) => {
    setForm((current) => ({
      ...current,
      categories: current.categories.includes(categoryId)
        ? current.categories.filter((item) => item !== categoryId)
        : [...current.categories, categoryId],
    }));
  };
  const muscleNameById = (muscleGroupId: string) => {
    const raw = muscleGroups.find((m) => m.id === muscleGroupId)?.name;
    return muscleLabel(raw) || raw || "—";
  };
  const normalizedTargetsForExercise = (exerciseId: string) => normalizeExerciseTargets(
    (targetsByExercise[exerciseId] || []).map((target) => ({
      ...target,
      muscle_group_name: muscleGroups.find((group) => group.id === target.muscle_group_id)?.name,
    })),
  ).filter((target) => target.muscle_group_id);
  const selectedLegacyMuscleGroups = allSelectedIds
    .map((id) => muscleGroups.find((group) => group.id === id))
    .filter((group): group is MuscleGroup => Boolean(group && !canonicalMuscleSlug(group.name)));
  const selectableMuscleGroups = (currentId: string) => {
    const current = muscleGroups.find((group) => group.id === currentId);
    const currentOption = current ? [{ ...current, label: `${current.name} (fora da taxonomia — remova)`, legacy: !canonicalMuscleSlug(current.name) }] : [];
    const options = anatomicalMuscleOptions
      .filter((group) => group.id === currentId || !allSelectedIds.includes(group.id))
      .map((group) => ({ ...group, legacy: false }));
    return [
      ...currentOption.filter((group) => !options.some((option) => option.id === group.id)),
      ...options,
    ];
  };

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
    return muscleLabel(value);
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
    const description = normalizeText(row.description ?? row.descricao ?? row.obs ?? row.instructions);
    const rawCategory = normalizeText(row.category ?? row.categoria ?? row.exerciseCategory?.name ?? row.exerciseCategory?.id);
    const categories = normalizedExerciseCategories({
      category: rawCategory,
      categories: [],
      name,
      description,
      muscle_group: normalizeText(rawGroup),
    });
    const poster = normalizeText(row.urlPoster ?? row.url_poster ?? row.thumbnail_url ?? row.poster);
    return {
      name,
      description: description || null,
      muscle_group: normalizeMfitGroup(rawGroup),
      category: categories[0] || canonicalCategorySlug(rawCategory) || null,
      categories,
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
        category: ex.category,
        categories: ex.categories,
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
        const update: Record<string, string | string[] | null> = {
          description: buildMfitDescription(importRow, existing.description || ""),
        };
        if (importRow.video_url && !existing.video_url && !existing.video_path) update.video_url = importRow.video_url;
        if (importRow.thumbnail_url && !existing.thumbnail_url) update.thumbnail_url = importRow.thumbnail_url;
        if (importRow.muscle_group && ["", "geral", "outros"].includes((existing.muscle_group || "").toLowerCase())) {
          update.muscle_group = importRow.muscle_group;
        }
        if (importRow.categories.length > 0) {
          const existingCategories = normalizedExerciseCategories(existing);
          const mergedCategories = Array.from(new Set([...existingCategories, ...importRow.categories]));
          if (mergedCategories.join("|") !== existingCategories.join("|")) {
            update.category = mergedCategories[0] || null;
            update.categories = mergedCategories;
          }
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
                context="Cadastro de exercicios, categorias, videos e alvos anatomicos primarios/secundarios usados pela prescricao."
                question="Como devo cadastrar categorias e alvos musculares para a prescricao ficar mais precisa?"
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
        <div className="space-y-3">
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
              {FILTER_GROUPS.map((g) => (
                <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setCategoryFilters([])}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${categoryFilters.length === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
            >
              Todas categorias
            </button>
            {EXERCISE_CATEGORIES.map((category) => {
              const active = categoryFilters.includes(category.id);
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => toggleCategoryFilter(category.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                >
                  {category.label}
                </button>
              );
            })}
          </div>
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
                context={`Grupo muscular/categoria da biblioteca: ${group}. Ajuda para organizar exercicios, categorias, foco primario/secundario e prescricao.`}
                question={`Como devo usar os exercicios de ${group} na prescricao e nos filtros da biblioteca?`}
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
                      {ex.muscle_group && (
                        <Badge variant="outline" className="capitalize text-xs">{muscleLabel(ex.muscle_group) || ex.muscle_group}</Badge>
                      )}
                      {normalizedExerciseCategories(ex).map((category) => (
                        <Badge key={category} variant="outline" className="text-xs">
                          {categoryLabel(category) || category}
                        </Badge>
                      ))}
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
                    {normalizedTargetsForExercise(ex.id).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {normalizedTargetsForExercise(ex.id)
                          .sort((a, b) => (a.role === b.role ? 0 : a.role === "primary" ? -1 : 1))
                          .map((target) => {
                            const isPrimary = target.role === "primary";
                            return (
                              <Badge
                                key={target.muscle_slug}
                                variant={isPrimary ? "default" : "outline"}
                                className="text-[10px] font-sans"
                              >
                                {isPrimary ? "P" : "S"} · {target.muscle_label} · {isPrimary ? 100 : 50}%
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
                        <p className="text-xs text-muted-foreground font-sans">
                          {[ex.muscle_group, ...(ex.categories || []).map((item) => categoryLabel(item) || item)]
                            .filter(Boolean)
                            .join(" · ") || "sem taxonomia"}
                        </p>
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
                context="Formulario de exercicio: nome, categorias, video e musculos primarios/secundarios."
                question="Me ajuda a definir as categorias e os alvos primarios/secundarios deste exercicio?"
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
              <Label className="font-sans">Grupo principal</Label>
              <Select value={form.muscle_group || "none"} onValueChange={(v) => setForm({ ...form, muscle_group: v === "none" ? "" : v })}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem grupo principal</SelectItem>
                  {MUSCLE_GROUP_OPTIONS.map((group) => (
                    <SelectItem key={group.slug} value={group.slug}>{group.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-sans">Categorias</Label>
              <div className="flex flex-wrap gap-2 rounded-md border border-border bg-secondary/40 p-2">
                {EXERCISE_CATEGORIES.map((category) => {
                  const active = form.categories.includes(category.id);
                  return (
                    <label
                      key={category.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      <Checkbox
                        checked={active}
                        onCheckedChange={() => toggleFormCategory(category.id)}
                        className="h-3.5 w-3.5"
                      />
                      {category.label}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Muscle Target Configuration */}
            {muscleGroups.length > 0 && (
              <div className="space-y-3 p-3 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center gap-2">
                  <Label className="font-sans text-sm font-semibold">Distribuição de Carga (Volume)</Label>
                  <BnitoContextButton
                    label="distribuicao de carga do exercicio"
                    context="Define quais musculos recebem volume primario ou secundario no calculo semanal."
                    question="Quais musculos devem entrar como primarios e secundarios neste exercicio?"
                  />
                </div>
                <p className="text-xs text-muted-foreground font-sans">
                  Configure quais músculos este exercício trabalha para o cálculo de volume semanal.
                </p>
                {selectedLegacyMuscleGroups.length > 0 && (
                  <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300 font-sans">
                    Há alvo salvo fora da taxonomia anatômica de volume. Remova ou substitua antes de salvar para não transformar categoria em músculo.
                  </p>
                )}
                
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
                              {selectableMuscleGroups(mgId)
                                .map(mg => (
                                  <SelectItem key={mg.id} value={mg.id}>{mg.label}{mg.legacy ? " (legado)" : ""}</SelectItem>
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
                              {selectableMuscleGroups(mgId)
                                .map(mg => (
                                  <SelectItem key={mg.id} value={mg.id}>{mg.label}{mg.legacy ? " (legado)" : ""}</SelectItem>
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
