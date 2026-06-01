import { useEffect, useState, useCallback, useMemo } from "react";
import { Trash2, UserPlus, Shield, KeyRound, Plus, Eye, EyeOff, Pencil, Users, BarChart3, CalendarPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { useManageRolePermissions, type PermissionModule } from "@/hooks/useRolePermissions";
import { format, subMonths, startOfMonth, endOfMonth, parse, addMonths, isAfter, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Textarea } from "@/components/ui/textarea";

interface TeamMember {
  user_id: string;
  full_name: string | null;
  email?: string;
  roles: string[];
}

interface ProfileOption {
  user_id: string;
  full_name: string | null;
}

interface TrainerPerformance {
  user_id: string;
  full_name: string;
  role: string;
  activeStudents: number;
  sessionsByMonth: Record<string, number>; // "YYYY-MM" -> count
  totalSessions: number;
  students: { id: string; full_name: string }[];
}

const ALL_ROLES = ["admin", "coordinator", "trainer"] as const;
type Role = typeof ALL_ROLES[number];

const PERMISSION_MODULES: { key: PermissionModule; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "registration", label: "Cadastro" },
  { key: "anamnesis", label: "Anamnese" },
  { key: "students", label: "Alunos" },
  { key: "agenda", label: "Agenda" },
  { key: "exercises", label: "Exercícios" },
  { key: "plans", label: "Planos" },
  { key: "financial", label: "Financeiro" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "appearance", label: "Aparência" },
  { key: "team", label: "Equipe" },
];

const PERMISSION_ROLES = [
  { key: "coordinator", label: "Coordenador" },
  { key: "trainer", label: "Treinador" },
];

export default function TeamManager() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [availableUsers, setAvailableUsers] = useState<ProfileOption[]>([]);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [newRole, setNewRole] = useState("");
  const [loading, setLoading] = useState(false);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [passwordUserId, setPasswordUserId] = useState("");
  const [passwordUserName, setPasswordUserName] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);

  const [editUserId, setEditUserId] = useState("");
  const [editUserName, setEditUserName] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([]);

  // Performance tab
  const [trainerPerformance, setTrainerPerformance] = useState<TrainerPerformance[]>([]);
  const [perfLoading, setPerfLoading] = useState(false);
  // Default: last 3 months range
  const _now = new Date();
  const [startMonth, setStartMonth] = useState<string>(format(subMonths(_now, 2), "yyyy-MM"));
  const [endMonthState, setEndMonthState] = useState<string>(format(_now, "yyyy-MM"));

  // Manual session dialog
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTrainer, setManualTrainer] = useState<TrainerPerformance | null>(null);
  const [manualStudentId, setManualStudentId] = useState("");
  const [manualDate, setManualDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [manualNotes, setManualNotes] = useState("");
  const [manualSaving, setManualSaving] = useState(false);

  // Trainer history dialog
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyStudentId, setHistoryStudentId] = useState("");
  const [historyRows, setHistoryRows] = useState<Array<{ id: string; trainer_id: string | null; assigned_at: string; unassigned_at: string | null }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [allCompanyTrainers, setAllCompanyTrainers] = useState<Array<{ user_id: string; full_name: string }>>([]);
  const [allCompanyStudents, setAllCompanyStudents] = useState<Array<{ id: string; full_name: string }>>([]);

  const { toast } = useToast();
  const { companyId, role } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;
  const { isEnabled, togglePermission, loading: permLoading } = useManageRolePermissions(effectiveCompanyId);

  useEffect(() => {
    if (effectiveCompanyId) loadTeam();
  }, [effectiveCompanyId]);

  const loadTeam = async () => {
    if (!effectiveCompanyId) return;

    // Get company members first for isolation
    const { data: companyMembers } = await supabase
      .from("company_members")
      .select("user_id")
      .eq("company_id", effectiveCompanyId);

    if (!companyMembers || companyMembers.length === 0) {
      setMembers([]);
      setAvailableUsers([]);
      return;
    }

    const companyUserIds = companyMembers.map((m) => m.user_id);

    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", companyUserIds);

    if (!roles) return;

    const userIds = [...new Set(roles.map((r) => r.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", userIds);

    const grouped: Record<string, TeamMember> = {};
    const excludeUserIds = new Set<string>();
    
    // Build a map of all roles per user
    const rolesByUser = new Map<string, string[]>();
    for (const r of roles) {
      if (!rolesByUser.has(r.user_id)) rolesByUser.set(r.user_id, []);
      rolesByUser.get(r.user_id)!.push(r.role);
    }
    
    // Exclude masters and users with ONLY the student role
    for (const [uid, userRoles] of rolesByUser) {
      if (userRoles.includes("master")) excludeUserIds.add(uid);
      if (userRoles.length === 1 && userRoles[0] === "student") excludeUserIds.add(uid);
    }

    for (const r of roles) {
      if (excludeUserIds.has(r.user_id)) continue;
      if (r.role === "student") continue; // don't show student badge for team members
      if (!grouped[r.user_id]) {
        grouped[r.user_id] = {
          user_id: r.user_id,
          full_name: profiles?.find((p) => p.user_id === r.user_id)?.full_name || "Sem nome",
          roles: [],
        };
      }
      grouped[r.user_id].roles.push(r.role);
    }
    const membersList = Object.values(grouped);

    // Fetch emails via edge function
    if (membersList.length > 0) {
      try {
        const { data: emailData } = await supabase.functions.invoke("manage-team-member", {
          body: { action: "list-emails", user_ids: membersList.map((m) => m.user_id) },
        });
        if (emailData?.emails) {
          const emailMap = new Map(emailData.emails.map((e: any) => [e.user_id, e.email]));
          membersList.forEach((m) => {
            m.email = (emailMap.get(m.user_id) as string) || undefined;
          });
        }
      } catch (e) {
        console.error("Failed to fetch emails", e);
      }
    }

    setMembers(membersList);

    // Available users: only from this company
    const { data: companyProfiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", companyUserIds);

    if (companyProfiles) setAvailableUsers(companyProfiles);
  };

  // Compute months in selected range
  const performanceMonths = useMemo(() => {
    const months: { key: string; label: string; start: string; end: string }[] = [];
    let start = parse(startMonth, "yyyy-MM", new Date());
    const end = parse(endMonthState, "yyyy-MM", new Date());
    if (isAfter(start, end)) return months;
    // cap to 24 months
    let i = 0;
    while (!isAfter(start, end) && i < 24) {
      months.push({
        key: format(start, "yyyy-MM"),
        label: format(start, "MMM/yy", { locale: ptBR }),
        start: startOfMonth(start).toISOString(),
        end: endOfMonth(start).toISOString(),
      });
      start = addMonths(start, 1);
      i++;
    }
    return months;
  }, [startMonth, endMonthState]);

  const loadPerformance = useCallback(async () => {
    if (!effectiveCompanyId) return;
    setPerfLoading(true);

    const { data: companyMembers } = await supabase
      .from("company_members")
      .select("user_id")
      .eq("company_id", effectiveCompanyId);

    if (!companyMembers || companyMembers.length === 0) {
      setTrainerPerformance([]);
      setPerfLoading(false);
      return;
    }

    const companyUserIds = companyMembers.map((m) => m.user_id);

    const { data: memberRoles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["trainer", "coordinator", "admin"])
      .in("user_id", companyUserIds);

    if (!memberRoles || memberRoles.length === 0) {
      setTrainerPerformance([]);
      setPerfLoading(false);
      return;
    }

    const roleMap = new Map<string, string>();
    for (const r of memberRoles) {
      if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, r.role);
    }
    const trainerIds = [...roleMap.keys()];

    if (performanceMonths.length === 0) {
      setTrainerPerformance([]);
      setPerfLoading(false);
      return;
    }

    const rangeStart = performanceMonths[0].start;
    const rangeEnd = performanceMonths[performanceMonths.length - 1].end;

    const [profilesRes, studentsRes, historyRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name").in("user_id", trainerIds),
      supabase.from("students").select("id, full_name, assigned_trainer_id")
        .eq("company_id", effectiveCompanyId),
      supabase.from("trainer_assignments_history")
        .select("student_id, trainer_id, assigned_at, unassigned_at")
        .eq("company_id", effectiveCompanyId),
    ]);

    const profiles = profilesRes.data || [];
    const students = studentsRes.data || [];
    const history = historyRes.data || [];
    const studentIds = students.map((s) => s.id);

    // Helper: who was the trainer of `studentId` at instant `date`?
    const trainerAt = (studentId: string, date: Date): string | null => {
      const t = date.getTime();
      // Find a history entry covering this date
      const match = history.find((h) => {
        if (h.student_id !== studentId) return false;
        const startT = new Date(h.assigned_at).getTime();
        const endT = h.unassigned_at ? new Date(h.unassigned_at).getTime() : Infinity;
        return t >= startT && t <= endT;
      });
      if (match) return match.trainer_id;
      // Fallback: current assigned trainer
      const s = students.find((x) => x.id === studentId);
      return s?.assigned_trainer_id || null;
    };

    // 1) Manual/off-app completed sessions (workout_id is null)
    let manualSessions: { student_id: string; completed_at: string | null }[] = [];
    let prescribedCycles: { cycle_id: string; student_id: string; start_date: string }[] = [];

    if (studentIds.length > 0) {
      const { data: sessRes } = await supabase
        .from("workout_sessions")
        .select("student_id, completed_at, workout_id")
        .eq("status", "completed")
        .is("workout_id", null)
        .in("student_id", studentIds)
        .gte("completed_at", rangeStart)
        .lte("completed_at", rangeEnd);
      manualSessions = (sessRes || []).map((s) => ({ student_id: s.student_id, completed_at: s.completed_at }));

      const { data: enrolls } = await supabase
        .from("enrollments")
        .select("id, student_id")
        .in("student_id", studentIds);
      const enrollmentIds = (enrolls || []).map((e) => e.id);
      const enrollStudent = new Map((enrolls || []).map((e) => [e.id, e.student_id]));

      if (enrollmentIds.length > 0) {
        const { data: cycles } = await supabase
          .from("training_cycles")
          .select("id, enrollment_id, start_date")
          .in("enrollment_id", enrollmentIds)
          .gte("start_date", rangeStart.slice(0, 10))
          .lte("start_date", rangeEnd.slice(0, 10));

        const cycleIds = (cycles || []).map((c) => c.id);
        if (cycleIds.length > 0) {
          const { data: workouts } = await supabase
            .from("workouts")
            .select("cycle_id")
            .in("cycle_id", cycleIds);
          const cyclesWithWorkout = new Set((workouts || []).map((w) => w.cycle_id));
          prescribedCycles = (cycles || [])
            .filter((c) => cyclesWithWorkout.has(c.id))
            .map((c) => ({
              cycle_id: c.id,
              student_id: enrollStudent.get(c.enrollment_id) as string,
              start_date: c.start_date,
            }));
        }
      }
    }

    const performance: TrainerPerformance[] = trainerIds.map((tid) => {
      const profile = profiles.find((p) => p.user_id === tid);
      const trainerStudents = students.filter((s) => s.assigned_trainer_id === tid);

      const sessionsByMonth: Record<string, number> = {};
      for (const m of performanceMonths) sessionsByMonth[m.key] = 0;

      let total = 0;

      // Attribute prescribed cycles using historical trainer at cycle start_date
      for (const c of prescribedCycles) {
        const cycleDate = new Date(c.start_date);
        if (trainerAt(c.student_id, cycleDate) !== tid) continue;
        const key = format(cycleDate, "yyyy-MM");
        if (sessionsByMonth[key] !== undefined) {
          sessionsByMonth[key]++;
          total++;
        }
      }

      // Attribute manual sessions using historical trainer at completed_at
      for (const sess of manualSessions) {
        if (!sess.completed_at) continue;
        const sessDate = new Date(sess.completed_at);
        if (trainerAt(sess.student_id, sessDate) !== tid) continue;
        const key = format(sessDate, "yyyy-MM");
        if (sessionsByMonth[key] !== undefined) {
          sessionsByMonth[key]++;
          total++;
        }
      }

      return {
        user_id: tid,
        full_name: profile?.full_name || "Sem nome",
        role: roleMap.get(tid) || "trainer",
        activeStudents: trainerStudents.length,
        sessionsByMonth,
        totalSessions: total,
        students: trainerStudents.map((s) => ({ id: s.id, full_name: s.full_name })),
      };
    });

    // Cache for history dialog
    setAllCompanyTrainers(profiles.map((p) => ({ user_id: p.user_id, full_name: p.full_name || "Sem nome" })));
    setAllCompanyStudents(students.map((s) => ({ id: s.id, full_name: s.full_name })));

    setTrainerPerformance(performance);
    setPerfLoading(false);
  }, [effectiveCompanyId, performanceMonths]);

  const openManualDialog = (trainer: TrainerPerformance) => {
    setManualTrainer(trainer);
    setManualStudentId("");
    setManualDate(format(new Date(), "yyyy-MM-dd"));
    setManualNotes("");
    setManualOpen(true);
  };

  const handleSaveManualSession = async () => {
    if (!manualTrainer || !manualStudentId || !manualDate || !effectiveCompanyId) return;
    setManualSaving(true);
    const completedIso = new Date(manualDate + "T12:00:00").toISOString();
    const { error } = await supabase.from("workout_sessions").insert({
      student_id: manualStudentId,
      company_id: effectiveCompanyId,
      workout_id: null,
      status: "completed",
      started_at: completedIso,
      completed_at: completedIso,
      notes: manualNotes || null,
    });
    setManualSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Treino avulso registrado!" });
    setManualOpen(false);
    loadPerformance();
  };

  // ===== Trainer history adjustment =====
  const openHistoryDialog = () => {
    setHistoryStudentId("");
    setHistoryRows([]);
    setHistoryOpen(true);
  };

  const loadHistoryFor = async (studentId: string) => {
    setHistoryStudentId(studentId);
    if (!studentId) { setHistoryRows([]); return; }
    setHistoryLoading(true);
    const { data } = await supabase
      .from("trainer_assignments_history")
      .select("id, trainer_id, assigned_at, unassigned_at")
      .eq("student_id", studentId)
      .order("assigned_at", { ascending: true });
    setHistoryRows((data || []) as any);
    setHistoryLoading(false);
  };

  const updateHistoryRow = (id: string, patch: Partial<{ trainer_id: string | null; assigned_at: string; unassigned_at: string | null }>) => {
    setHistoryRows((rows) => rows.map((r) => r.id === id ? { ...r, ...patch } : r));
  };

  const saveHistoryRow = async (row: { id: string; trainer_id: string | null; assigned_at: string; unassigned_at: string | null }) => {
    const { error } = await supabase.from("trainer_assignments_history").update({
      trainer_id: row.trainer_id,
      assigned_at: row.assigned_at,
      unassigned_at: row.unassigned_at,
    }).eq("id", row.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Período atualizado" });
    loadPerformance();
  };

  const deleteHistoryRow = async (id: string) => {
    const { error } = await supabase.from("trainer_assignments_history").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setHistoryRows((rows) => rows.filter((r) => r.id !== id));
    toast({ title: "Período removido" });
    loadPerformance();
  };

  const addHistoryRow = async () => {
    if (!historyStudentId || !effectiveCompanyId) return;
    const { data, error } = await supabase.from("trainer_assignments_history").insert({
      student_id: historyStudentId,
      trainer_id: null,
      company_id: effectiveCompanyId,
      assigned_at: new Date().toISOString(),
    }).select("id, trainer_id, assigned_at, unassigned_at").single();
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setHistoryRows((rows) => [...rows, data as any]);
  };


  const handleAddRole = async () => {
    if (!userId || !newRole) return;
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole as Role });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Papel atribuído!" });
    setRoleDialogOpen(false);
    setUserId("");
    setNewRole("");
    loadTeam();
  };

  const handleRemoveRole = async (uid: string) => {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", uid);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Papéis removidos" });
    loadTeam();
  };

  const handleCreateMember = async () => {
    if (!newName || !newEmail || !newPassword || !newMemberRole) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("manage-team-member", {
      body: { action: "create", full_name: newName, email: newEmail, password: newPassword, role: newMemberRole, company_id: effectiveCompanyId },
    });
    setLoading(false);

    if (error || data?.error) {
      toast({ title: "Erro", description: data?.error || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Membro criado com sucesso!" });
    setCreateDialogOpen(false);
    setNewName(""); setNewEmail(""); setNewPassword(""); setNewMemberRole("");
    loadTeam();
  };

  const handleChangePassword = async () => {
    if (!passwordUserId || !resetPassword) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-team-member", {
        body: { action: "update-password", user_id: passwordUserId, new_password: resetPassword },
      });
      setLoading(false);

      if (error) {
        // Parse error body if available
        let errorMsg = error.message;
        try {
          const parsed = JSON.parse(error.context?.body || "{}");
          errorMsg = parsed.error || errorMsg;
        } catch {}
        toast({ title: "Erro", description: errorMsg, variant: "destructive" });
        return;
      }
      if (data?.error) {
        toast({ title: "Erro", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Senha alterada com sucesso!" });
      setPasswordDialogOpen(false);
      setResetPassword(""); setPasswordUserId("");
    } catch (e: any) {
      setLoading(false);
      toast({ title: "Erro", description: e.message || "Erro desconhecido", variant: "destructive" });
    }
  };

  const openPasswordDialog = (uid: string, name: string | null) => {
    setPasswordUserId(uid);
    setPasswordUserName(name || "Usuário");
    setResetPassword("");
    setShowResetPassword(false);
    setPasswordDialogOpen(true);
  };

  const openEditDialog = (member: TeamMember) => {
    setEditUserId(member.user_id);
    setEditUserName(member.full_name || "");
    setEditUserEmail(member.email || "");
    setEditRoles([...member.roles]);
    setEditDialogOpen(true);
  };

  const toggleEditRole = (role: string) => {
    setEditRoles((prev) => prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]);
  };

  const handleSaveEdit = async () => {
    if (!editUserId) return;
    setLoading(true);

    // Update name via profiles
    await supabase.from("profiles").update({ full_name: editUserName }).eq("user_id", editUserId);

    // Update email via edge function (skip if user not found in auth)
    if (editUserEmail) {
      const { data: emailData } = await supabase.functions.invoke("manage-team-member", {
        body: { action: "update-email", user_id: editUserId, email: editUserEmail },
      });
      if (emailData?.error && !emailData.error.includes("not found")) {
        toast({ title: "Erro ao atualizar email", description: emailData.error, variant: "destructive" });
      }
    }

    // Update roles
    const { data: currentRoles } = await supabase.from("user_roles").select("id, role").eq("user_id", editUserId);
    const currentRoleNames = currentRoles?.map((r) => r.role as string) || [];
    const rolesToAdd = editRoles.filter((r) => !currentRoleNames.includes(r));
    const rolesToRemove = currentRoles?.filter((r) => !editRoles.includes(r.role as string)) || [];

    for (const roleToRemove of rolesToRemove) {
      await supabase.from("user_roles").delete().eq("id", roleToRemove.id);
    }
    for (const roleToAdd of rolesToAdd) {
      await supabase.from("user_roles").insert({ user_id: editUserId, role: roleToAdd as Role });
    }
    setLoading(false);
    toast({ title: "Membro atualizado!" });
    setEditDialogOpen(false);
    loadTeam();
  };

  const handleTogglePermission = async (role: string, module: string) => {
    const current = isEnabled(role, module);
    const error = await togglePermission(role, module, !current);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const roleColors: Record<string, string> = {
    admin: "bg-primary/20 text-primary",
    coordinator: "bg-warning/20 text-warning",
    trainer: "bg-success/20 text-success",
    master: "bg-accent/20 text-accent-foreground",
  };

  const roleLabels: Record<string, string> = {
    admin: "Admin",
    coordinator: "Coordenador",
    trainer: "Treinador",
    master: "Master",
  };


  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl text-primary">EQUIPE</h1>
            <p className="text-muted-foreground font-sans">Gerencie membros e permissões da equipe</p>
          </div>
        </div>

        <Tabs defaultValue="team" className="w-full" onValueChange={(v) => { if (v === "performance") loadPerformance(); }}>
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="team">Equipe</TabsTrigger>
            <TabsTrigger value="permissions">Permissões</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          {/* ====== TAB: Equipe ====== */}
          <TabsContent value="team">
            <div className="space-y-4">
              <div className="flex gap-2 justify-end">
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { setNewName(""); setNewEmail(""); setNewPassword(""); setNewMemberRole(""); setShowPassword(false); }}>
                      <Plus className="h-4 w-4 mr-2" />Novo Membro
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-card border-border">
                    <DialogHeader>
                      <DialogTitle className="text-primary">NOVO MEMBRO</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="font-sans">Nome completo</Label>
                        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do membro" className="bg-secondary border-border" />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans">Email</Label>
                        <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@exemplo.com" className="bg-secondary border-border" />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans">Senha</Label>
                        <div className="relative">
                          <Input type={showPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="bg-secondary border-border pr-10" />
                          <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowPassword(!showPassword)}>
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans">Papel</Label>
                        <Select value={newMemberRole} onValueChange={setNewMemberRole}>
                          <SelectTrigger className="bg-secondary border-border">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="coordinator">Coordenador</SelectItem>
                            <SelectItem value="trainer">Treinador</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleCreateMember} className="w-full" disabled={loading || !newName || !newEmail || !newPassword || !newMemberRole}>
                        {loading ? "Criando..." : "Criar Membro"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" onClick={() => { setUserId(""); setNewRole(""); }}>
                      <UserPlus className="h-4 w-4 mr-2" />Atribuir Papel
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-card border-border">
                    <DialogHeader>
                      <DialogTitle className="text-primary">ATRIBUIR PAPEL</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="font-sans">Usuário</Label>
                        <Select value={userId} onValueChange={setUserId}>
                          <SelectTrigger className="bg-secondary border-border">
                            <SelectValue placeholder="Selecione um usuário" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableUsers.map((u) => (
                              <SelectItem key={u.user_id} value={u.user_id}>
                                {u.full_name || u.user_id.slice(0, 8) + "..."}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="font-sans">Papel</Label>
                        <Select value={newRole} onValueChange={setNewRole}>
                          <SelectTrigger className="bg-secondary border-border">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="coordinator">Coordenador</SelectItem>
                            <SelectItem value="trainer">Treinador</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleAddRole} className="w-full">Atribuir</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Change Password Dialog */}
              <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
                <DialogContent className="bg-card border-border">
                  <DialogHeader>
                    <DialogTitle className="text-primary">ALTERAR SENHA</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground font-sans">Alterar senha de: <strong className="text-foreground">{passwordUserName}</strong></p>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="font-sans">Nova senha</Label>
                      <div className="relative">
                        <Input type={showResetPassword ? "text" : "password"} value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="bg-secondary border-border pr-10" />
                        <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowResetPassword(!showResetPassword)}>
                          {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <Button onClick={handleChangePassword} className="w-full" disabled={loading || resetPassword.length < 6}>
                      {loading ? "Alterando..." : "Alterar Senha"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Edit Member Dialog */}
              <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="bg-card border-border">
                  <DialogHeader>
                    <DialogTitle className="text-primary">EDITAR MEMBRO</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="font-sans">Nome completo</Label>
                      <Input value={editUserName} onChange={(e) => setEditUserName(e.target.value)} placeholder="Nome do membro" className="bg-secondary border-border" />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Email</Label>
                      <Input type="email" value={editUserEmail} onChange={(e) => setEditUserEmail(e.target.value)} placeholder="email@exemplo.com" className="bg-secondary border-border" />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-sans">Papéis</Label>
                      <div className="space-y-3">
                        {ALL_ROLES.map((role) => (
                          <div key={role} className="flex items-center space-x-3">
                            <Checkbox
                              id={`role-${role}`}
                              checked={editRoles.includes(role)}
                              onCheckedChange={() => toggleEditRole(role)}
                            />
                            <label htmlFor={`role-${role}`} className="text-sm font-sans font-medium leading-none cursor-pointer">
                              {roleLabels[role]}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Button onClick={handleSaveEdit} className="w-full" disabled={loading || editRoles.length === 0}>
                      {loading ? "Salvando..." : "Salvar Alterações"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="space-y-3">
                {members.map((m) => (
                  <Card key={m.user_id} className="bg-card border-border">
                    <CardContent className="flex items-center justify-between pt-6">
                      <div className="flex items-center gap-3">
                        <Shield className="h-5 w-5 text-muted-foreground" />
                        <div>
                        <p className="text-foreground font-sans font-medium">{m.full_name}</p>
                          {m.email && <p className="text-muted-foreground text-xs font-sans">{m.email}</p>}
                          {!m.email && <p className="text-muted-foreground text-xs font-sans">{m.user_id.slice(0, 8)}...</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.roles.map((role) => (
                          <span key={role} className={`text-xs font-sans font-medium px-2 py-1 rounded capitalize ${roleColors[role] || ""}`}>
                            {roleLabels[role] || role}
                          </span>
                        ))}
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(m)} className="text-muted-foreground hover:text-foreground">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openPasswordDialog(m.user_id, m.full_name)} className="text-muted-foreground hover:text-foreground">
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveRole(m.user_id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {members.length === 0 && (
                  <p className="text-muted-foreground font-sans text-center py-12">Nenhum membro na equipe</p>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ====== TAB: Permissões ====== */}
          <TabsContent value="permissions">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground font-sans mb-6">
                  Defina quais módulos cada função pode acessar. Admins sempre têm acesso total.
                </p>
                {permLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 px-2 font-sans font-medium text-muted-foreground">Módulo</th>
                          {PERMISSION_ROLES.map((r) => (
                            <th key={r.key} className="text-center py-3 px-4 font-sans font-medium text-muted-foreground">{r.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {PERMISSION_MODULES.map((mod) => (
                          <tr key={mod.key} className="border-b border-border/50">
                            <td className="py-3 px-2 font-sans text-foreground">{mod.label}</td>
                            {PERMISSION_ROLES.map((r) => (
                              <td key={r.key} className="text-center py-3 px-4">
                                <Switch
                                  checked={isEnabled(r.key, mod.key)}
                                  onCheckedChange={() => handleTogglePermission(r.key, mod.key)}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ====== TAB: Performance ====== */}
          <TabsContent value="performance">
            <div className="space-y-4">
              <Card className="bg-card border-border">
                <CardContent className="pt-6 flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label className="font-sans text-xs">Mês inicial</Label>
                    <Input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} className="w-[160px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="font-sans text-xs">Mês final</Label>
                    <Input type="month" value={endMonthState} onChange={(e) => setEndMonthState(e.target.value)} className="w-[160px]" />
                  </div>
                  <Button onClick={loadPerformance} disabled={perfLoading}>
                    {perfLoading ? "Carregando..." : "Atualizar"}
                  </Button>
                  <Button variant="outline" onClick={openHistoryDialog}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Ajustar histórico
                  </Button>
                  <p className="text-xs text-muted-foreground font-sans ml-auto max-w-xs">
                    Conta treinos <strong>concluídos</strong> pelos alunos atribuídos a cada treinador.
                  </p>
                </CardContent>
              </Card>

              {perfLoading ? (
                <div className="flex justify-center py-12">
                  <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : trainerPerformance.length === 0 ? (
                <p className="text-muted-foreground font-sans text-center py-12">Nenhum membro encontrado nesta empresa</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {trainerPerformance.map((t) => (
                    <Card key={t.user_id} className="bg-card border-border">
                       <CardHeader className="pb-3">
                         <div className="flex items-center justify-between gap-2">
                           <div className="flex items-center gap-2 flex-wrap">
                             <CardTitle className="text-base font-sans flex items-center gap-2">
                               <Users className="h-4 w-4 text-muted-foreground" />
                               {t.full_name}
                             </CardTitle>
                             <span className={`text-xs font-sans font-medium px-2 py-0.5 rounded capitalize ${roleColors[t.role] || ""}`}>
                               {roleLabels[t.role] || t.role}
                             </span>
                             <Badge variant="default" className="gap-1">
                               {t.totalSessions} no período
                             </Badge>
                           </div>
                           <Badge variant="secondary" className="gap-1 shrink-0">
                             <Users className="h-3 w-3" />
                             {t.activeStudents}
                           </Badge>
                         </div>
                       </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-xs text-muted-foreground font-sans flex items-center gap-1">
                          <BarChart3 className="h-3 w-3" /> Ciclos prescritos + treinos avulsos por mês
                        </p>
                        <div className={`grid gap-2 ${performanceMonths.length <= 3 ? 'grid-cols-3' : performanceMonths.length <= 4 ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-6'}`}>
                          {performanceMonths.map((m) => (
                            <div key={m.key} className="text-center p-2 rounded-md bg-secondary/50">
                              <p className="text-xs text-muted-foreground font-sans capitalize">{m.label}</p>
                              <p className="text-lg font-bold text-foreground">{t.sessionsByMonth[m.key] || 0}</p>
                            </div>
                          ))}
                        </div>
                        <Button variant="outline" size="sm" className="w-full" onClick={() => openManualDialog(t)} disabled={t.students.length === 0}>
                          <CalendarPlus className="h-4 w-4 mr-2" />
                          Registrar treino avulso
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <Dialog open={manualOpen} onOpenChange={setManualOpen}>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-primary">REGISTRAR TREINO AVULSO</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {manualTrainer && (
                  <p className="text-sm text-muted-foreground font-sans">
                    Treinador: <strong className="text-foreground">{manualTrainer.full_name}</strong>
                  </p>
                )}
                <div className="space-y-2">
                  <Label className="font-sans">Aluno</Label>
                  <Select value={manualStudentId} onValueChange={setManualStudentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o aluno" />
                    </SelectTrigger>
                    <SelectContent>
                      {manualTrainer?.students.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-sans">Data do treino</Label>
                  <Input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans">Observação (opcional)</Label>
                  <Textarea value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} placeholder="Ex: treino presencial na academia" />
                </div>
                <Button onClick={handleSaveManualSession} className="w-full" disabled={manualSaving || !manualStudentId || !manualDate}>
                  {manualSaving ? "Salvando..." : "Registrar treino"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
            <DialogContent className="bg-card border-border max-w-3xl">
              <DialogHeader>
                <DialogTitle className="text-primary">AJUSTAR HISTÓRICO DE TREINADOR</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground font-sans">
                  Edite as datas em que cada treinador esteve responsável pelo aluno. A performance será recalculada automaticamente.
                </p>
                <div className="space-y-2">
                  <Label className="font-sans">Aluno</Label>
                  <Select value={historyStudentId} onValueChange={loadHistoryFor}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o aluno" />
                    </SelectTrigger>
                    <SelectContent>
                      {allCompanyStudents.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {historyStudentId && (
                  <>
                    {historyLoading ? (
                      <p className="text-sm text-muted-foreground">Carregando...</p>
                    ) : historyRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum registro de histórico para este aluno.</p>
                    ) : (
                      <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {historyRows.map((row) => (
                          <div key={row.id} className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2 items-end p-3 rounded-md border border-border">
                            <div className="space-y-1">
                              <Label className="font-sans text-xs">Treinador</Label>
                              <Select
                                value={row.trainer_id || ""}
                                onValueChange={(v) => updateHistoryRow(row.id, { trainer_id: v || null })}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Sem treinador" />
                                </SelectTrigger>
                                <SelectContent>
                                  {allCompanyTrainers.map((p) => (
                                    <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="font-sans text-xs">Início</Label>
                              <Input
                                type="date"
                                value={row.assigned_at ? row.assigned_at.slice(0, 10) : ""}
                                onChange={(e) => updateHistoryRow(row.id, { assigned_at: new Date(e.target.value + "T12:00:00").toISOString() })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="font-sans text-xs">Fim (vazio = atual)</Label>
                              <Input
                                type="date"
                                value={row.unassigned_at ? row.unassigned_at.slice(0, 10) : ""}
                                onChange={(e) => updateHistoryRow(row.id, { unassigned_at: e.target.value ? new Date(e.target.value + "T12:00:00").toISOString() : null })}
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => saveHistoryRow(row)}>Salvar</Button>
                              <Button size="sm" variant="destructive" onClick={() => deleteHistoryRow(row.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button variant="outline" size="sm" onClick={addHistoryRow}>
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar período
                    </Button>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </Tabs>
      </div>
    </AppLayout>
  );
}
