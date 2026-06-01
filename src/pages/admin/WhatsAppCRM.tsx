import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, User, MessageSquare, AlertTriangle, DollarSign,
  Plus, Trash2, Tag,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";

type CRMStudent = {
  id: string;
  full_name: string;
  status: string;
  category: string;
  whatsapp: string | null;
  chatId?: string;
  hasWorkout?: boolean;
  hasPendingPayment?: boolean;
};

type Category = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
};

type Label = {
  id: string;
  name: string;
  color: string;
};

export default function WhatsAppCRM() {
  const navigate = useNavigate();
  const { role, companyId } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();

  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;
  const applyCompanyFilter = useCallback((query: any) => {
    if (effectiveCompanyId) return query.eq("company_id", effectiveCompanyId);
    return query;
  }, [effectiveCompanyId]);

  const [students, setStudents] = useState<CRMStudent[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);

  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#6b7280");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#3b82f6");

  const loadCategories = useCallback(async () => {
    let query = supabase.from("student_categories").select("*");
    query = applyCompanyFilter(query);
    const { data } = await query.order("sort_order");
    if (data) setCategories(data as Category[]);
  }, [applyCompanyFilter]);

  const loadLabels = useCallback(async () => {
    let query = supabase.from("whatsapp_labels").select("*");
    query = applyCompanyFilter(query);
    const { data } = await query.order("name");
    if (data) setLabels(data as Label[]);
  }, [applyCompanyFilter]);

  const loadStudents = useCallback(async () => {
    let studentsQuery = supabase.from("students").select("*");
    studentsQuery = applyCompanyFilter(studentsQuery);
    const { data: studentsData } = await studentsQuery.order("full_name");
    if (!studentsData) return;

    let chatsQuery = supabase
      .from("whatsapp_chats")
      .select("id, student_id")
      .not("student_id", "is", null);
    chatsQuery = applyCompanyFilter(chatsQuery);
    const { data: chats } = await chatsQuery;

    const studentChatMap: Record<string, string> = {};
    for (const chat of chats || []) {
      if (chat.student_id) studentChatMap[chat.student_id] = chat.id;
    }

    const studentIds = studentsData.map((s) => s.id);
    let enrollmentsQuery = supabase
      .from("enrollments")
      .select("id, student_id, status")
      .in("student_id", studentIds)
      .eq("status", "active");
    if (effectiveCompanyId) enrollmentsQuery = enrollmentsQuery.eq("company_id", effectiveCompanyId);
    const { data: enrollments } = await enrollmentsQuery;

    const enrollmentIds = (enrollments || []).map((e) => e.id);
    let cyclesQuery = supabase
      .from("training_cycles")
      .select("id, enrollment_id")
      .in("enrollment_id", enrollmentIds)
      .eq("status", "active");
    if (effectiveCompanyId) cyclesQuery = cyclesQuery.eq("company_id", effectiveCompanyId);
    const { data: cycles } = enrollmentIds.length > 0 ? await cyclesQuery : { data: [] };

    const cycleIds = (cycles || []).map((c) => c.id);
    let workoutsQuery = supabase.from("workouts").select("id, cycle_id").in("cycle_id", cycleIds);
    if (effectiveCompanyId) workoutsQuery = workoutsQuery.eq("company_id", effectiveCompanyId);
    const { data: workouts } = cycleIds.length > 0 ? await workoutsQuery : { data: [] };

    let paymentsQuery = supabase
      .from("payments")
      .select("id, student_id, status")
      .in("student_id", studentIds)
      .not("status", "in", '("RECEIVED","CONFIRMED","RECEIVED_IN_CASH")');
    if (effectiveCompanyId) paymentsQuery = paymentsQuery.eq("company_id", effectiveCompanyId);
    const { data: payments } = await paymentsQuery;

    const workoutCycles = new Set((workouts || []).map((w) => w.cycle_id));
    const pendingPayStudents = new Set((payments || []).map((p) => p.student_id));

    const enriched: CRMStudent[] = studentsData.map((s) => {
      const enrollment = (enrollments || []).find((e) => e.student_id === s.id);
      const cycle = enrollment ? (cycles || []).find((c) => c.enrollment_id === enrollment.id) : null;
      const hasWorkout = cycle ? workoutCycles.has(cycle.id) : false;
      return {
        id: s.id,
        full_name: s.full_name,
        status: s.status,
        category: (s as any).category || "regular",
        whatsapp: s.whatsapp,
        chatId: studentChatMap[s.id],
        hasWorkout,
        hasPendingPayment: pendingPayStudents.has(s.id),
      };
    });

    setStudents(enriched);
  }, [applyCompanyFilter, effectiveCompanyId]);

  useEffect(() => { loadStudents(); loadCategories(); loadLabels(); }, [loadStudents, loadCategories, loadLabels]);

  const getCategoryColor = (catName: string) => {
    const cat = categories.find(c => c.name === catName);
    return cat?.color || "#6b7280";
  };

  const handleUpdateCategory = async (studentId: string, category: string) => {
    let query = supabase.from("students").update({ category } as any).eq("id", studentId);
    if (effectiveCompanyId) query = query.eq("company_id", effectiveCompanyId);
    await query;
    loadStudents();
    toast.success("Categoria atualizada");
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    if (!effectiveCompanyId) { toast.error("Selecione uma empresa para criar categoria"); return; }
    const nextOrder = categories.length;
    const { error } = await supabase.from("student_categories").insert({
      company_id: effectiveCompanyId,
      name: newCatName.trim().toLowerCase(),
      color: newCatColor,
      sort_order: nextOrder,
    } as any);
    if (error) { toast.error("Erro ao criar categoria"); return; }
    toast.success("Categoria criada");
    setNewCatName("");
    setNewCatColor("#6b7280");
    loadCategories();
  };

  const handleDeleteCategory = async (catId: string) => {
    let query = supabase.from("student_categories").delete().eq("id", catId);
    if (effectiveCompanyId) query = query.eq("company_id", effectiveCompanyId);
    await query;
    loadCategories();
    toast.success("Categoria removida");
  };

  const handleAddLabel = async () => {
    if (!newLabelName.trim()) return;
    if (!effectiveCompanyId) { toast.error("Selecione uma empresa para criar etiqueta"); return; }
    const { error } = await supabase.from("whatsapp_labels").insert({
      company_id: effectiveCompanyId,
      name: newLabelName.trim(),
      color: newLabelColor,
    } as any);
    if (error) { toast.error("Erro ao criar etiqueta"); return; }
    toast.success("Etiqueta criada");
    setNewLabelName("");
    setNewLabelColor("#3b82f6");
    loadLabels();
  };

  const handleDeleteLabel = async (labelId: string) => {
    let query = supabase.from("whatsapp_labels").delete().eq("id", labelId);
    if (effectiveCompanyId) query = query.eq("company_id", effectiveCompanyId);
    await query;
    loadLabels();
    toast.success("Etiqueta removida");
  };

  const filtered = students.filter((s) => {
    if (!s.full_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
    return true;
  });

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <div className="mb-3">
          <h1 className="text-xl sm:text-2xl font-bold text-primary tracking-wide">CRM WhatsApp</h1>
          <p className="text-muted-foreground font-sans text-xs sm:text-sm">Gestão de alunos, categorias e etiquetas</p>
        </div>

        <Tabs defaultValue="students" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full sm:w-fit mb-3 grid grid-cols-3 sm:flex">
            <TabsTrigger value="students" className="text-xs sm:text-sm">Alunos</TabsTrigger>
            <TabsTrigger value="categories" className="text-xs sm:text-sm">Categorias</TabsTrigger>
            <TabsTrigger value="labels" className="text-xs sm:text-sm">Etiquetas</TabsTrigger>
          </TabsList>

          {/* ── Students ── */}
          <TabsContent value="students" className="flex-1 min-h-0 mt-0">
            <div className="flex flex-col border border-border rounded-lg overflow-hidden bg-card h-full">
              <div className="p-2.5 sm:p-3 border-b border-border flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar aluno..." className="pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-[150px] h-9">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.name}>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="capitalize">{cat.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <ScrollArea className="flex-1">
                {filtered.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">Nenhum aluno encontrado</div>
                ) : (
                  <div className="divide-y divide-border">
                    {filtered.map((student) => (
                      <div
                        key={student.id}
                        className={cn("px-3 py-2 hover:bg-muted/50 transition-colors flex items-center gap-2.5", student.chatId && "cursor-pointer")}
                        onClick={() => { if (student.chatId) navigate("/admin/whatsapp-chat"); }}
                      >
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{student.full_name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <Select value={student.category} onValueChange={(val) => handleUpdateCategory(student.id, val)}>
                              <SelectTrigger
                                className="w-[85px] h-5 text-[10px] px-1.5 border-0"
                                style={{ backgroundColor: `${getCategoryColor(student.category)}20`, color: getCategoryColor(student.category) }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {categories.map(cat => (
                                  <SelectItem key={cat.id} value={cat.name}>
                                    <div className="flex items-center gap-1.5">
                                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                                      <span className="capitalize">{cat.name}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {!student.hasWorkout && student.status === "active" && (
                              <Badge variant="destructive" className="text-[10px] h-4 px-1">
                                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />S/ Treino
                              </Badge>
                            )}
                            {student.hasPendingPayment && (
                              <Badge className="text-[10px] h-4 px-1 bg-amber-500/90 text-white hover:bg-amber-500">
                                <DollarSign className="h-2.5 w-2.5 mr-0.5" />$
                              </Badge>
                            )}
                          </div>
                        </div>
                        {student.chatId ? (
                          <MessageSquare className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <MessageSquare className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          {/* ── Categories ── */}
          <TabsContent value="categories" className="flex-1 min-h-0 mt-0">
            <div className="flex flex-col border border-border rounded-lg overflow-hidden bg-card h-full">
              <div className="p-3 border-b border-border">
                <p className="text-sm font-medium text-foreground">Categorias de Alunos</p>
                <p className="text-xs text-muted-foreground mt-0.5">Gerencie as categorias para classificar seus alunos</p>
              </div>
              <ScrollArea className="flex-1 p-3">
                <div className="space-y-2.5 max-w-lg mx-auto">
                  {categories.map(cat => (
                    <div key={cat.id} className="flex items-center gap-3 p-2.5 border border-border rounded-lg bg-muted/30">
                      <input
                        type="color"
                        value={cat.color}
                        onChange={async (e) => {
                          let query = supabase.from("student_categories").update({ color: e.target.value } as any).eq("id", cat.id);
                          if (effectiveCompanyId) query = query.eq("company_id", effectiveCompanyId);
                          await query;
                          loadCategories();
                        }}
                        className="h-7 w-7 rounded cursor-pointer border-0 shrink-0"
                      />
                      <span className="flex-1 text-sm font-medium text-foreground capitalize">{cat.name}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDeleteCategory(cat.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 p-2.5 border border-dashed border-border rounded-lg">
                    <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)} className="h-7 w-7 rounded cursor-pointer border-0 shrink-0" />
                    <Input placeholder="Nova categoria" value={newCatName} onChange={e => setNewCatName(e.target.value)} className="flex-1 min-w-0 h-8" />
                    <Button size="sm" onClick={handleAddCategory} disabled={!newCatName.trim()} className="shrink-0 h-8">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          {/* ── Labels (Etiquetas) ── */}
          <TabsContent value="labels" className="flex-1 min-h-0 mt-0">
            <div className="flex flex-col border border-border rounded-lg overflow-hidden bg-card h-full">
              <div className="p-3 border-b border-border">
                <p className="text-sm font-medium text-foreground flex items-center gap-2"><Tag className="h-4 w-4" />Etiquetas de Conversa</p>
                <p className="text-xs text-muted-foreground mt-0.5">Crie etiquetas para organizar as conversas do WhatsApp. Você pode adicionar múltiplas etiquetas por conversa.</p>
              </div>
              <ScrollArea className="flex-1 p-3">
                <div className="space-y-2.5 max-w-lg mx-auto">
                  {labels.map(label => (
                    <div key={label.id} className="flex items-center gap-3 p-2.5 border border-border rounded-lg bg-muted/30">
                      <input
                        type="color"
                        value={label.color}
                        onChange={async (e) => {
                          let query = supabase.from("whatsapp_labels").update({ color: e.target.value } as any).eq("id", label.id);
                          if (effectiveCompanyId) query = query.eq("company_id", effectiveCompanyId);
                          await query;
                          loadLabels();
                        }}
                        className="h-7 w-7 rounded cursor-pointer border-0 shrink-0"
                      />
                      <span className="flex-1 text-sm font-medium text-foreground">{label.name}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDeleteLabel(label.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 p-2.5 border border-dashed border-border rounded-lg">
                    <input type="color" value={newLabelColor} onChange={e => setNewLabelColor(e.target.value)} className="h-7 w-7 rounded cursor-pointer border-0 shrink-0" />
                    <Input placeholder="Nova etiqueta" value={newLabelName} onChange={e => setNewLabelName(e.target.value)} className="flex-1 min-w-0 h-8" />
                    <Button size="sm" onClick={handleAddLabel} disabled={!newLabelName.trim()} className="shrink-0 h-8">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
