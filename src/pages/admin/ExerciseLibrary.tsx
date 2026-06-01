import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Trash2, Play, Globe, Building2, Upload, Loader2 } from "lucide-react";
import { useMaster } from "@/contexts/MasterContext";

interface Exercise {
  id: string;
  name: string;
  description: string | null;
  muscle_group: string;
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

export default function ExerciseLibrary() {
  const { user, role, companyId } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;
  const muscleGroups = useMuscleGroups(effectiveCompanyId);
  const MUSCLE_GROUPS = muscleGroups.length > 0 ? muscleGroups.map((g) => g.name) : MUSCLE_GROUP_NAMES_FALLBACK;
  const { toast } = useToast();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [videoModal, setVideoModal] = useState<{ type: "path" | "url"; value: string } | null>(null);
  const [form, setForm] = useState({
    name: "", description: "", muscle_group: "geral",
    video_url: "", is_global: false,
  });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Muscle targets state
  const [primaryMuscleIds, setPrimaryMuscleIds] = useState<string[]>([]);
  const [secondaryMuscleIds, setSecondaryMuscleIds] = useState<string[]>([]);

  // Map exercise_id -> targets (with effective % considering company override)
  const [targetsByExercise, setTargetsByExercise] = useState<Record<string, MuscleTarget[]>>({});
  // Per-company volume overrides for the editing exercise: muscle_group_id -> volume_percentage
  const [companyVolumes, setCompanyVolumes] = useState<Record<string, number>>({});

  const isMaster = role === "master";

  useEffect(() => { loadExercises(); }, [effectiveCompanyId]);

  const loadExercises = async () => {
    const { data, error } = await supabase
      .from("exercise_library")
      .select("*")
      .order("muscle_group")
      .order("name");
    if (error) console.error(error);
    const list = (data as Exercise[]) || [];
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
    let overrides: Record<string, Record<string, number>> = {};
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
  };

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
    await (supabase as any).from("exercise_muscle_targets").delete().eq("exercise_id", exerciseId);
    
    const inserts: any[] = [];
    primaryMuscleIds.forEach(mgId => {
      inserts.push({
        exercise_id: exerciseId,
        muscle_group_id: mgId,
        role: "primary",
        volume_percentage: 100,
      });
    });
    secondaryMuscleIds.forEach(mgId => {
      if (!primaryMuscleIds.includes(mgId)) {
        inserts.push({
          exercise_id: exerciseId,
          muscle_group_id: mgId,
          role: "secondary",
          volume_percentage: 50,
        });
      }
    });
    if (inserts.length > 0) {
      await (supabase as any).from("exercise_muscle_targets").insert(inserts);
    }
  };

  const handleSave = async () => {
    if (!form.name) return;
    setUploading(true);

    let videoPath: string | null = editing?.video_path || null;

    if (videoFile) {
      const uploadCompanyId = (isMaster && form.is_global) ? "global" : (effectiveCompanyId || companyId || "unknown");
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
      is_global: isMaster ? form.is_global : false,
      company_id: (isMaster && form.is_global) ? null : (effectiveCompanyId || companyId),
      created_by: user!.id,
    };

    let exerciseId: string | null = null;

    if (editing) {
      const { error } = await supabase.from("exercise_library").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); setUploading(false); return; }
      exerciseId = editing.id;
      toast({ title: "Exercício atualizado!" });
    } else {
      const { data, error } = await supabase.from("exercise_library").insert(payload).select("id").single();
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); setUploading(false); return; }
      exerciseId = data.id;
      toast({ title: "Exercício criado!" });
    }

    // Save muscle targets
    if (exerciseId) {
      await saveMuscleTargets(exerciseId);
      await saveCompanyVolumes(exerciseId);
    }

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
      await (supabase as any)
        .from("company_exercise_volumes")
        .upsert(rows, { onConflict: "company_id,exercise_id,muscle_group_id" });
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

  const resetForm = () => {
    setOpen(false);
    setEditing(null);
    setVideoFile(null);
    setPrimaryMuscleIds([]);
    setSecondaryMuscleIds([]);
    setCompanyVolumes({});
    setForm({ name: "", description: "", muscle_group: "geral", video_url: "", is_global: false });
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

  const openVideoForExercise = (ex: Exercise) => {
    if (ex.video_path) {
      setVideoModal({ type: "path", value: getStoragePublicUrl(ex.video_path) });
    } else if (ex.video_url) {
      setVideoModal({ type: "url", value: ex.video_url });
    }
  };

  const filtered = exercises.filter((ex) => {
    const matchSearch = ex.name.toLowerCase().includes(search.toLowerCase());
    const matchGroup = filterGroup === "all" || ex.muscle_group === filterGroup;
    return matchSearch && matchGroup;
  });

  const grouped = filtered.reduce<Record<string, Exercise[]>>((acc, ex) => {
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

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl text-primary">BIBLIOTECA DE EXERCÍCIOS</h1>
            <p className="text-muted-foreground font-sans">
              {isMaster ? "Gerencie a biblioteca global e de empresas" : "Gerencie os exercícios da sua empresa"}
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />Novo Exercício
          </Button>
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

        {/* Exercise grid grouped by muscle group */}
        {Object.keys(grouped).length === 0 && (
          <p className="text-center text-muted-foreground font-sans py-12">Nenhum exercício encontrado</p>
        )}
        {Object.entries(grouped).map(([group, exs]) => (
          <div key={group}>
            <h2 className="text-lg text-primary capitalize mb-3">{group}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
              {exs.map((ex) => (
                <Card key={ex.id} className="bg-card border-border group">
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
                    {(ex.video_path || ex.video_url) && (
                      <Button
                        variant="outline" size="sm"
                        className="w-full text-xs"
                        onClick={() => openVideoForExercise(ex)}
                      >
                        <Play className="h-3.5 w-3.5 mr-1" />Ver Vídeo
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); else setOpen(true); }}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary">{editing ? "EDITAR EXERCÍCIO" : "NOVO EXERCÍCIO"}</DialogTitle>
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
                <Label className="font-sans text-sm font-semibold">Distribuição de Carga (Volume)</Label>
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
                  checked={form.is_global}
                  onChange={(e) => setForm({ ...form, is_global: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                  id="is_global"
                />
                <Label htmlFor="is_global" className="font-sans">Exercício Global (visível para todas as empresas)</Label>
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
    </AppLayout>
  );
}
