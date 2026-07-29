// Carteira — os alunos atribuídos a um colaborador + mini-CRM da carteira.
// Trainer/coordinator veem a PRÓPRIA carteira; admin/master escolhem o colaborador.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Briefcase, Loader2, MessageSquare, User, CalendarDays } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { cadenceTone, formatCadence } from "@/lib/contactCadence";

interface Collaborator { user_id: string; full_name: string; roles: string[] }
interface PortfolioStudent {
  id: string; full_name: string; status: string; whatsapp: string | null;
  cycle_end?: string | null; chat_id?: string | null; hours_since_contact?: number | null;
}

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo", pending: "Pendente", awaiting_renewal: "Renovação", inactive: "Inativo",
};
const STATUS_CLASS: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600",
  pending: "bg-amber-500/15 text-amber-600",
  awaiting_renewal: "bg-orange-500/15 text-orange-600",
  inactive: "bg-muted text-muted-foreground",
};
const CAD_CLASS: Record<string, string> = {
  ok: "bg-emerald-500/15 text-emerald-600",
  warn: "bg-amber-500/15 text-amber-600",
  late: "bg-destructive/15 text-destructive",
};

export default function Portfolio() {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.split("/")[1] || "admin";
  const { user, role, companyId } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id ?? null : null) : companyId ?? null;
  const canPickOthers = role === "admin" || role === "master";

  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [students, setStudents] = useState<PortfolioStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");

  // Colaboradores da empresa (para o seletor do admin/master).
  useEffect(() => {
    if (!effectiveCompanyId || !canPickOthers) return;
    (async () => {
      const { data: members } = await supabase.from("company_members").select("user_id").eq("company_id", effectiveCompanyId);
      const ids = (members || []).map((m) => m.user_id);
      if (!ids.length) { setCollaborators([]); return; }
      const [{ data: roles }, { data: profiles }] = await Promise.all([
        supabase.from("user_roles").select("user_id, role").in("user_id", ids),
        supabase.from("profiles").select("user_id, full_name").in("user_id", ids),
      ]);
      const nameMap = new Map((profiles || []).map((p) => [p.user_id, p.full_name || "Sem nome"]));
      const byUser = new Map<string, string[]>();
      (roles || []).forEach((r) => {
        if (["admin", "coordinator", "trainer"].includes(r.role)) {
          byUser.set(r.user_id, [...(byUser.get(r.user_id) || []), r.role]);
        }
      });
      setCollaborators([...byUser.entries()].map(([uid, rs]) => ({ user_id: uid, full_name: nameMap.get(uid) || uid.slice(0, 8), roles: rs }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name)));
    })();
  }, [effectiveCompanyId, canPickOthers]);

  // Seleção inicial: o próprio usuário.
  useEffect(() => { if (user?.id && !selectedId) setSelectedId(user.id); }, [user?.id, selectedId]);

  const load = useCallback(async () => {
    if (!effectiveCompanyId || !selectedId) { setStudents([]); setLoading(false); return; }
    setLoading(true);
    const { data: studs } = await supabase
      .from("students")
      .select("id, full_name, status, whatsapp")
      .eq("company_id", effectiveCompanyId)
      .eq("assigned_trainer_id", selectedId)
      .order("full_name");
    const list: PortfolioStudent[] = (studs || []) as any[];
    const ids = list.map((s) => s.id);
    if (ids.length) {
      const [{ data: cycles }, { data: chats }, cad] = await Promise.all([
        (supabase as any).from("training_cycles").select("student_id, end_date").in("student_id", ids).eq("status", "active"),
        (supabase as any).from("whatsapp_chats").select("id, student_id").in("student_id", ids),
        (supabase as any).rpc("contact_cadence", { _company_id: effectiveCompanyId }).then((r: any) => r, () => ({ data: null })),
      ]);
      const cycleMap = new Map<string, string>();
      (cycles || []).forEach((c: any) => {
        const cur = cycleMap.get(c.student_id);
        if (!cur || (c.end_date && c.end_date < cur)) cycleMap.set(c.student_id, c.end_date);
      });
      const chatMap = new Map<string, string>();
      (chats || []).forEach((c: any) => { if (c.student_id) chatMap.set(c.student_id, c.id); });
      const cadMap = new Map<string, number>();
      ((cad?.data || []) as any[]).forEach((r: any) => { if (r.student_id) cadMap.set(r.student_id, Number(r.hours_since)); });
      list.forEach((s) => {
        s.cycle_end = cycleMap.get(s.id) || null;
        s.chat_id = chatMap.get(s.id) || null;
        s.hours_since_contact = cadMap.has(s.id) ? cadMap.get(s.id)! : null;
      });
    }
    setStudents(list);
    setLoading(false);
  }, [effectiveCompanyId, selectedId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => students.filter((s) =>
    (statusFilter === "todos" || s.status === statusFilter) &&
    (!search.trim() || s.full_name.toLowerCase().includes(search.trim().toLowerCase()))
  ), [students, search, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: students.length };
    students.forEach((s) => { c[s.status] = (c[s.status] || 0) + 1; });
    return c;
  }, [students]);

  const selectedName = canPickOthers
    ? (collaborators.find((c) => c.user_id === selectedId)?.full_name || "você")
    : "sua";

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-primary">
          <Briefcase className="h-5 w-5" /> Carteira
        </h1>
        <Badge variant="outline" className="text-sm">{students.length} aluno(s)</Badge>
        {canPickOthers && (
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="ml-auto h-9 w-[240px]"><SelectValue placeholder="Escolher colaborador" /></SelectTrigger>
            <SelectContent>
              {user?.id && !collaborators.some((c) => c.user_id === user.id) && (
                <SelectItem value={user.id}>Minha carteira</SelectItem>
              )}
              {collaborators.map((c) => (
                <SelectItem key={c.user_id} value={c.user_id}>
                  {c.full_name} · {c.roles.map((r) => r === "trainer" ? "Treinador" : r === "coordinator" ? "Coordenador" : "Admin").join("/")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Mini-CRM: filtros por status + busca */}
      <div className="flex flex-wrap items-center gap-2">
        {["todos", "active", "pending", "awaiting_renewal", "inactive"].map((st) => (
          <button key={st} type="button" onClick={() => setStatusFilter(st)}
            className={cn("rounded-full border px-3 py-1 text-xs transition",
              statusFilter === st ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground")}>
            {st === "todos" ? "Todos" : STATUS_LABEL[st] || st} {counts[st] ? `(${counts[st]})` : "(0)"}
          </button>
        ))}
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar aluno..." className="ml-auto h-8 w-52" />
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground font-normal">
            Carteira de <span className="text-foreground font-medium">{selectedName}</span> — último contato via WhatsApp, ciclo e ações rápidas.
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {students.length === 0 ? "Nenhum aluno atribuído a este colaborador ainda." : "Nenhum aluno com esse filtro."}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((s) => {
                const days = s.cycle_end ? differenceInDays(parseISO(s.cycle_end), new Date()) : null;
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{s.full_name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <Badge className={cn("text-[10px]", STATUS_CLASS[s.status] || "bg-muted")}>{STATUS_LABEL[s.status] || s.status}</Badge>
                        {s.hours_since_contact != null && (
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-mono-data font-bold", CAD_CLASS[cadenceTone(s.hours_since_contact)])}>
                            sem resposta há {formatCadence(s.hours_since_contact)}
                          </span>
                        )}
                        {s.cycle_end && (
                          <span className={cn("flex items-center gap-1 text-[11px]", days != null && days <= 7 ? "text-orange-600" : "text-muted-foreground")}>
                            <CalendarDays className="h-3 w-3" /> ciclo até {format(parseISO(s.cycle_end), "dd/MM")}
                            {days != null && days >= 0 && days <= 7 ? ` (${days}d)` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <button type="button" title="Abrir perfil"
                      onClick={() => navigate(`/${routePrefix}/students/${s.id}`)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground">
                      <User className="h-4 w-4" />
                    </button>
                    {s.chat_id && (
                      <button type="button" title="Abrir conversa"
                        onClick={() => navigate(`/${routePrefix}/whatsapp-chat`, { state: { chatId: s.chat_id } })}
                        className="rounded p-1.5 text-primary hover:bg-muted/60">
                        <MessageSquare className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
