/* eslint-disable react-refresh/only-export-components */
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { Toaster } from "../src/components/ui/toaster";
import { AuthProvider } from "../src/hooks/useAuth";
import { MasterProvider } from "../src/contexts/MasterContext";
import AdminDashboard from "../src/pages/admin/AdminDashboard";
import CoordinatorDashboard from "../src/pages/coordinator/CoordinatorDashboard";
import TrainerDashboard from "../src/pages/trainer/TrainerDashboard";
import { supabase } from "../src/integrations/supabase/client";
import { MASTER_COMPANY_STORAGE_KEY } from "../src/lib/masterCompanyContext";
import "../src/index.css";

const params = new URLSearchParams(window.location.search);
const role = params.get("role") || "trainer";
const scenario = params.get("scenario") || "normal";
const theme = params.get("theme") || "light";

if (theme === "dark") document.documentElement.classList.add("dark");

const companyId = "20000000-0000-4000-8000-000000000001";
const otherCompanyId = "20000000-0000-4000-8000-000000000002";
const userId = role === "admin"
  ? "10000000-0000-4000-8000-000000000002"
  : role === "coordinator"
  ? "10000000-0000-4000-8000-000000000003"
  : role === "master"
  ? "10000000-0000-4000-8000-000000000005"
  : "10000000-0000-4000-8000-000000000001";
const trainerId = "10000000-0000-4000-8000-000000000001";
const otherTrainerId = "10000000-0000-4000-8000-000000000004";

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const baseRows: Record<string, any[]> = {
  company_members: [
    { company_id: companyId, user_id: trainerId },
    { company_id: companyId, user_id: "10000000-0000-4000-8000-000000000002" },
    { company_id: companyId, user_id: "10000000-0000-4000-8000-000000000003" },
    { company_id: companyId, user_id: otherTrainerId },
    { company_id: otherCompanyId, user_id: "10000000-0000-4000-8000-000000000099" },
  ],
  companies: [
    { id: companyId, name: "BN QA", tier: "standard", slug: "bn-qa" },
    { id: otherCompanyId, name: "Outro Tenant", tier: "standard", slug: "outro-tenant" },
  ],
  user_roles: [
    { user_id: trainerId, role: "trainer" },
    { user_id: "10000000-0000-4000-8000-000000000002", role: "admin" },
    { user_id: "10000000-0000-4000-8000-000000000003", role: "coordinator" },
    { user_id: otherTrainerId, role: "trainer" },
    { user_id: "10000000-0000-4000-8000-000000000005", role: "master" },
  ],
  profiles: [
    { user_id: trainerId, full_name: "Treinadora QA" },
    { user_id: otherTrainerId, full_name: "Treinador Empresa" },
  ],
  students: [
    {
      id: "student-active-a",
      company_id: companyId,
      full_name: "Ana Ativa",
      name: "Ana Ativa",
      email: "ana@example.test",
      phone: "11999990001",
      whatsapp: "11999990001",
      status: "active",
      assigned_trainer_id: trainerId,
      birth_date: "1990-09-14",
      created_at: "2026-09-01T12:00:00.000Z",
      sales_stage: "active_onboarding",
      fiscal_completed_at: null,
      payment_link_sent_at: null,
      activated_at: null,
      assessment_due_at: null,
      onboarding_instructions_sent_at: null,
      height_cm: null,
      weight_kg: null,
      selected_plan_id: "plan-standard",
    },
    {
      id: "student-active-b",
      company_id: companyId,
      full_name: "Bruno Ativo",
      name: "Bruno Ativo",
      email: "bruno@example.test",
      phone: "11999990002",
      whatsapp: "11999990002",
      status: "active",
      assigned_trainer_id: otherTrainerId,
      birth_date: "1992-09-21",
      created_at: "2026-08-20T12:00:00.000Z",
      sales_stage: null,
      fiscal_completed_at: "2026-08-20T12:00:00.000Z",
      payment_link_sent_at: "2026-08-20T12:00:00.000Z",
      activated_at: "2026-08-21T12:00:00.000Z",
      assessment_due_at: null,
      onboarding_instructions_sent_at: "2026-08-21T12:00:00.000Z",
      height_cm: 180,
      weight_kg: 82,
      selected_plan_id: "plan-standard",
    },
    {
      id: "student-pending",
      company_id: companyId,
      full_name: "Carla Pendente",
      name: "Carla Pendente",
      email: "carla@example.test",
      phone: "11999990003",
      whatsapp: "11999990003",
      status: "pending",
      assigned_trainer_id: null,
      birth_date: "1994-10-10",
      created_at: "2026-09-12T12:00:00.000Z",
      sales_stage: "payment_pending",
      fiscal_completed_at: null,
      payment_link_sent_at: null,
      activated_at: null,
      assessment_due_at: null,
      onboarding_instructions_sent_at: null,
      height_cm: null,
      weight_kg: null,
      selected_plan_id: null,
    },
    {
      id: "student-renewal",
      company_id: companyId,
      full_name: "Duda Renovação",
      name: "Duda Renovação",
      email: "duda@example.test",
      phone: "11999990004",
      whatsapp: "11999990004",
      status: "awaiting_renewal",
      assigned_trainer_id: otherTrainerId,
      birth_date: "1996-09-30",
      created_at: "2026-07-01T12:00:00.000Z",
      sales_stage: null,
      fiscal_completed_at: "2026-07-01T12:00:00.000Z",
      payment_link_sent_at: "2026-07-01T12:00:00.000Z",
      activated_at: "2026-07-02T12:00:00.000Z",
      assessment_due_at: null,
      onboarding_instructions_sent_at: "2026-07-02T12:00:00.000Z",
      height_cm: 165,
      weight_kg: 60,
      selected_plan_id: "plan-standard",
    },
    {
      id: "student-inactive",
      company_id: companyId,
      full_name: "Eva Inativa",
      name: "Eva Inativa",
      email: "eva@example.test",
      phone: "11999990005",
      whatsapp: "11999990005",
      status: "inactive",
      assigned_trainer_id: null,
      birth_date: "1991-01-01",
      created_at: "2026-06-01T12:00:00.000Z",
      sales_stage: null,
      fiscal_completed_at: null,
      payment_link_sent_at: null,
      activated_at: null,
      assessment_due_at: null,
      onboarding_instructions_sent_at: null,
      height_cm: null,
      weight_kg: null,
      selected_plan_id: null,
    },
    {
      id: "student-other-tenant",
      company_id: otherCompanyId,
      full_name: "Outro Tenant",
      name: "Outro Tenant",
      status: "active",
      assigned_trainer_id: "10000000-0000-4000-8000-000000000099",
      birth_date: "1990-09-14",
      created_at: "2026-09-01T12:00:00.000Z",
    },
  ],
  leads: [
    { id: "lead-1", company_id: companyId, full_name: "Lead Um", stage: "interested", converted_to_student_id: null },
    { id: "lead-2", company_id: companyId, full_name: "Lead Dois", stage: "contacted", converted_to_student_id: null },
    { id: "lead-other", company_id: otherCompanyId, full_name: "Lead Outro", stage: "interested", converted_to_student_id: null },
  ],
  plans: [
    { id: "plan-standard", company_id: companyId, name: "Plano Performance", duration_weeks: 6, duration_days: 42, is_active: true, plan_kind: "standard" },
    { id: "plan-elite", company_id: companyId, name: "Plano Elite", duration_weeks: 8, duration_days: 56, is_active: true, plan_kind: "standard" },
    { id: "plan-influencer", company_id: companyId, name: "Influencer", duration_weeks: 4, duration_days: 28, is_active: true, plan_kind: "influencer" },
  ],
  enrollments: [
    {
      id: "enroll-active-a",
      company_id: companyId,
      student_id: "student-active-a",
      trainer_id: trainerId,
      plan_id: "plan-standard",
      start_date: "2026-08-01",
      end_date: "2026-09-18",
      training_start_date: "2026-08-08",
      status: "active",
      payment_status: "paid",
      students: { full_name: "Ana Ativa", status: "active", assigned_trainer_id: trainerId },
      plans: { name: "Plano Performance", duration_weeks: 6 },
    },
    {
      id: "enroll-active-b",
      company_id: companyId,
      student_id: "student-active-b",
      trainer_id: otherTrainerId,
      plan_id: "plan-elite",
      start_date: "2026-08-05",
      end_date: "2026-09-19",
      training_start_date: "2026-08-09",
      status: "active",
      payment_status: "paid",
      students: { full_name: "Bruno Ativo", status: "active", assigned_trainer_id: otherTrainerId },
      plans: { name: "Plano Elite", duration_weeks: 8 },
    },
    {
      id: "enroll-renewal",
      company_id: companyId,
      student_id: "student-renewal",
      trainer_id: otherTrainerId,
      plan_id: "plan-standard",
      start_date: "2026-07-01",
      end_date: "2026-09-10",
      training_start_date: "2026-07-08",
      status: "awaiting_renewal",
      payment_status: "overdue",
      students: { full_name: "Duda Renovação", status: "awaiting_renewal", assigned_trainer_id: otherTrainerId },
      plans: { name: "Plano Performance", duration_weeks: 6 },
    },
    {
      id: "enroll-other",
      company_id: otherCompanyId,
      student_id: "student-other-tenant",
      trainer_id: "10000000-0000-4000-8000-000000000099",
      plan_id: "plan-standard",
      start_date: "2026-08-01",
      end_date: "2026-09-18",
      training_start_date: "2026-08-08",
      status: "active",
      payment_status: "paid",
      students: { full_name: "Outro Tenant", status: "active", assigned_trainer_id: "10000000-0000-4000-8000-000000000099" },
      plans: { name: "Plano Outro", duration_weeks: 6 },
    },
  ],
  training_cycles: [
    { id: "cycle-active-a", company_id: companyId, enrollment_id: "enroll-active-a", student_id: "student-active-a", cycle_number: 2, status: "active", start_date: "2026-08-08", end_date: "2026-09-16", prescribed_offline_at: null },
    { id: "cycle-next-a", company_id: companyId, enrollment_id: "enroll-active-a", student_id: "student-active-a", cycle_number: 3, status: "planned", start_date: "2026-09-17", end_date: "2026-10-28", prescribed_offline_at: "2026-09-01T12:00:00.000Z" },
    { id: "cycle-active-b", company_id: companyId, enrollment_id: "enroll-active-b", student_id: "student-active-b", cycle_number: 1, status: "active", start_date: "2026-08-09", end_date: "2026-09-17", prescribed_offline_at: null },
    { id: "cycle-superseded", company_id: companyId, enrollment_id: "enroll-active-b", student_id: "student-active-b", cycle_number: 1, status: "superseded", start_date: "2026-08-01", end_date: "2026-09-01", prescribed_offline_at: null },
    { id: "cycle-other", company_id: otherCompanyId, enrollment_id: "enroll-other", student_id: "student-other-tenant", cycle_number: 1, status: "active", start_date: "2026-08-08", end_date: "2026-09-16", prescribed_offline_at: null },
  ],
  workouts: [
    { id: "workout-a", company_id: companyId, cycle_id: "cycle-active-a", exercises: [{ exercise_name: "Agachamento" }], superseded_at: null },
    { id: "workout-next", company_id: companyId, cycle_id: "cycle-next-a", exercises: [{ exercise_name: "Supino" }], superseded_at: null },
    { id: "workout-old", company_id: companyId, cycle_id: "cycle-superseded", exercises: [{ exercise_name: "Removido" }], superseded_at: "2026-09-01T12:00:00.000Z" },
  ],
  prescription_bundles: [
    {
      id: "bundle-1",
      company_id: companyId,
      student_id: "student-active-a",
      created_at: "2026-09-14T09:00:00.000Z",
      status: "active",
      has_strength: true,
      has_cardio: false,
      has_nutrition: false,
      has_swimming: false,
      has_cycling: false,
      strength_plan_id: "strength-1",
      running_plan_id: null,
      nutrition_plan_id: null,
    },
  ],
  prescription_bundle_items: [
    { id: "bundle-item-1", company_id: companyId, bundle_id: "bundle-1", modality: "musculacao", entity_type: "ai_strength_plan", entity_id: "strength-1" },
  ],
  admin_alerts: [
    {
      id: "alert-company",
      company_id: companyId,
      type: "billing",
      severity: "warning",
      title: "Conferir renovação de Duda",
      message: "Contrato vencido aguardando decisão.",
      action_url: null,
      created_at: "2026-09-14T10:00:00.000Z",
      target_role: null,
      target_user_id: null,
      student_id: "student-renewal",
      resolved_at: null,
    },
  ],
  whatsapp_chats: [],
  payments: [],
  workout_sessions: [],
  student_body_limitations: [],
  workout_feedback: [],
  cycle_feedback: [
    {
      id: "feedback-1",
      company_id: companyId,
      student_id: "student-active-b",
      nps: 6,
      wants_adjustment: true,
      adjustment_notes: "Reduzir volume no próximo ciclo.",
      created_at: "2026-09-13T12:00:00.000Z",
      applied: false,
    },
  ],
  student_anamneses: [],
  functional_assessments: [],
};

const mutableLog = { writes: [] as string[], reads: [] as string[] };

function rowsForTable(table: string): any[] {
  if (scenario === "empty" && !["company_members", "user_roles", "profiles", "plans"].includes(table)) return [];
  const rows = baseRows[table] || [];
  return rows.filter((row) => !("company_id" in row) || row.company_id === companyId);
}

function daysLeft(endDate: string) {
  return Math.ceil((new Date(`${endDate}T00:00:00.000Z`).getTime() - new Date("2026-09-14T00:00:00.000Z").getTime()) / 86_400_000);
}

function trainerNameMap() {
  return Object.fromEntries(rowsForTable("profiles").map((profile) => [profile.user_id, profile.full_name]));
}

function buildCompanyDashboardSnapshot(requestedCompanyId: string) {
  const students = rowsForTable("students");
  const leads = rowsForTable("leads");
  const enrollments = rowsForTable("enrollments");
  const cycles = rowsForTable("training_cycles");
  const trainerMap = trainerNameMap();
  const companyMemberIds = rowsForTable("company_members").map((member) => member.user_id);
  const trainers = rowsForTable("user_roles").filter((row) => row.role === "trainer" && companyMemberIds.includes(row.user_id)).length;
  const planCounts = enrollments.reduce((acc, enrollment) => {
    const name = enrollment.plans?.name || "Sem plano";
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const expiringContracts = enrollments
    .filter((enrollment) => ["active", "awaiting_renewal"].includes(enrollment.status) && enrollment.end_date <= "2026-09-21")
    .map((enrollment) => ({
      id: enrollment.id,
      student_id: enrollment.student_id,
      end_date: enrollment.end_date,
      trainer_id: enrollment.trainer_id,
      payment_status: enrollment.payment_status,
      students: { full_name: enrollment.students?.full_name || "Aluno", status: enrollment.students?.status || null },
      plans: enrollment.plans ? { name: enrollment.plans.name } : null,
    }));
  const cycleCountdowns = cycles
    .filter((cycle) => cycle.status === "active" && cycle.end_date <= "2026-09-21")
    .map((cycle) => {
      const enrollment = enrollments.find((row) => row.id === cycle.enrollment_id);
      const nextCycle = cycles.find((candidate) => candidate.enrollment_id === cycle.enrollment_id && candidate.cycle_number === cycle.cycle_number + 1);
      return {
        student_name: enrollment?.students?.full_name || "Aluno",
        student_id: cycle.student_id,
        cycle_number: cycle.cycle_number,
        end_date: cycle.end_date,
        days_left: daysLeft(cycle.end_date),
        trainer_id: enrollment?.trainer_id || null,
        next_cycle_id: nextCycle?.id || null,
        next_cycle_number: nextCycle?.cycle_number || null,
        next_start_date: nextCycle?.start_date || null,
        next_ready: Boolean(nextCycle?.prescribed_offline_at),
      };
    });

  return {
    version: 1,
    companyId: requestedCompanyId,
    asOfDate: "2026-09-14",
    stats: {
      totalStudents: students.filter((student) => student.status === "active").length,
      interestedStudents: leads.filter((lead) => !lead.converted_to_student_id && ["interested", "contacted"].includes(lead.stage)).length,
      pendingStudents: students.filter((student) => student.status === "pending").length,
      awaitingRenewalStudents: students.filter((student) => student.status === "awaiting_renewal").length,
      inactiveStudents: students.filter((student) => student.status === "inactive").length,
      trainers,
    },
    planChart: Object.entries(planCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    expiringContracts,
    cycleCountdowns,
    trainerMap,
    renewals: {
      expiringContracts: enrollments
        .filter((enrollment) => ["active", "awaiting_renewal"].includes(enrollment.status) && enrollment.end_date <= "2026-10-14")
        .map((enrollment) => ({
          id: enrollment.id,
          student_id: enrollment.student_id,
          end_date: enrollment.end_date,
          trainer_id: enrollment.trainer_id,
          payment_status: enrollment.payment_status,
          students: { full_name: enrollment.students?.full_name || "Aluno", status: enrollment.students?.status || null },
          plans: enrollment.plans ? { name: enrollment.plans.name } : null,
        })),
      awaitingRenewal: enrollments
        .filter((enrollment) => enrollment.status === "awaiting_renewal")
        .map((enrollment) => ({
          id: enrollment.id,
          student_id: enrollment.student_id,
          end_date: enrollment.end_date,
          trainer_id: enrollment.trainer_id,
          payment_status: enrollment.payment_status,
          students: { full_name: enrollment.students?.full_name || "Aluno", status: enrollment.students?.status || null },
          plans: enrollment.plans ? { name: enrollment.plans.name } : null,
        })),
      cycleCountdowns,
      trainerMap,
    },
    alerts: {
      pendingActions: rowsForTable("admin_alerts").map(({ id, type, severity, title, message, created_at, student_id }) => ({ id, type, severity, title, message, created_at, student_id })),
      birthdays: students
        .filter((student) => String(student.birth_date || "").slice(5, 7) === "09")
        .map((student) => ({ full_name: student.full_name, student_id: student.id, day: Number(String(student.birth_date).slice(8, 10)), isToday: String(student.birth_date).slice(5, 10) === "09-14" })),
      missingWorkouts: cycleCountdowns
        .filter((cycle) => cycle.student_id === "student-active-b")
        .map((cycle) => ({ ...cycle, cycle_id: "cycle-active-b", start_date: "2026-08-09", trainer_name: trainerMap[cycle.trainer_id || ""] || null })),
      awaitingTrainer: students.filter((student) => student.status === "pending" && !student.assigned_trainer_id).map((student) => ({ student_name: student.full_name, student_id: student.id })),
      awaitingTrainingDate: [],
      missingEnrollment: students.filter((student) => student.status === "pending").map((student) => ({ student_name: student.full_name, student_id: student.id })),
      incompleteBilling: students.filter((student) => student.status === "awaiting_renewal").map((student) => ({ student_name: student.full_name, student_id: student.id, missing: ["pagamento"] })),
      recentStudents: students.map((student) => ({
        student_name: student.full_name,
        student_id: student.id,
        status: student.status,
        created_at: student.created_at,
        sales_stage: student.sales_stage || null,
        fiscal_completed_at: student.fiscal_completed_at || null,
        payment_link_sent_at: student.payment_link_sent_at || null,
        activated_at: student.activated_at || null,
        assessment_due_at: student.assessment_due_at || null,
        onboarding_instructions_sent_at: student.onboarding_instructions_sent_at || null,
      })),
    },
    monthlyPrescriptions: rowsForTable("prescription_bundles").map((bundle) => ({
      id: bundle.id,
      student_id: bundle.student_id,
      name: students.find((student) => student.id === bundle.student_id)?.full_name || "Aluno",
      created_at: bundle.created_at,
      completedBadges: { strength: true, cardio: false, swimming: false, cycling: false, nutrition: false },
    })),
    pendingFeedback: rowsForTable("cycle_feedback").map((feedback) => ({
      id: feedback.id,
      student_id: feedback.student_id,
      name: students.find((student) => student.id === feedback.student_id)?.full_name || "Aluno",
      nps: feedback.nps,
      wants_adjustment: feedback.wants_adjustment,
      adjustment_notes: feedback.adjustment_notes,
      created_at: feedback.created_at,
    })),
    contactCadence: scenario === "empty" ? [] : [{
      chat_id: "chat-1",
      kind: "student",
      student_id: "student-active-b",
      student_name: "Bruno Ativo",
      lead_id: null,
      lead_name: null,
      student_status: "active",
      hours_since: 96,
      last_inbound_at: "2026-09-10T12:00:00.000Z",
    }],
    cohortFeedback: scenario === "empty" ? [] : [{ bucket: "Detratores", alunos: 1, media_nps: 6, pct_ajuste: 100 }],
    atRiskStudents: scenario === "empty" ? [] : [{
      id: "student-active-b",
      name: "Bruno Ativo",
      status: "risco",
      reasons: ["Sem treinar há 8d"],
      pain: null,
      tone: "red",
    }],
  };
}

class SupabaseQueryBuilder {
  private filters: Array<{ type: string; column: string; value: any; operator?: string }> = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private rowLimit: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private wantsSingle = false;
  private wantsMaybeSingle = false;
  private wantsCount = false;
  private headOnly = false;

  constructor(private table: string) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    this.wantsCount = Boolean(options?.count);
    this.headOnly = Boolean(options?.head);
    return this;
  }

  eq(column: string, value: any) { this.filters.push({ type: "eq", column, value }); return this; }
  neq(column: string, value: any) { this.filters.push({ type: "neq", column, value }); return this; }
  is(column: string, value: any) { this.filters.push({ type: "is", column, value }); return this; }
  in(column: string, value: any[]) { this.filters.push({ type: "in", column, value }); return this; }
  lte(column: string, value: any) { this.filters.push({ type: "lte", column, value }); return this; }
  gte(column: string, value: any) { this.filters.push({ type: "gte", column, value }); return this; }
  lt(column: string, value: any) { this.filters.push({ type: "lt", column, value }); return this; }
  gt(column: string, value: any) { this.filters.push({ type: "gt", column, value }); return this; }
  not(column: string, operator: string, value: any) { this.filters.push({ type: "not", column, value, operator }); return this; }
  or() { return this; }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }
  limit(value: number) { this.rowLimit = value; return this; }
  range(from: number, to: number) { this.rangeFrom = from; this.rangeTo = to; return this; }

  maybeSingle() { this.wantsMaybeSingle = true; return this.execute(); }
  single() { this.wantsSingle = true; return this.execute(); }
  insert() { mutableLog.writes.push(`${this.table}:insert`); return Promise.resolve({ data: null, error: null }); }
  update() { mutableLog.writes.push(`${this.table}:update`); return this; }
  upsert() { mutableLog.writes.push(`${this.table}:upsert`); return Promise.resolve({ data: null, error: null }); }
  delete() { mutableLog.writes.push(`${this.table}:delete`); return this; }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    mutableLog.reads.push(this.table);
    if (scenario === "error" && this.table === "students" && this.headOnly) {
      return { data: null, count: null, error: { message: "fixture dashboard error" } };
    }
    const rows = this.applyQuery(rowsForTable(this.table));
    if (this.wantsSingle || this.wantsMaybeSingle) return { data: rows[0] ?? null, error: null };
    return { data: this.headOnly ? null : rows, count: this.wantsCount || this.headOnly ? rows.length : null, error: null };
  }

  private applyQuery(rows: any[]) {
    let result = rows.filter((row) => this.filters.every((filter) => {
      const value = row[filter.column];
      if (filter.type === "eq") return value === filter.value;
      if (filter.type === "neq") return value !== filter.value;
      if (filter.type === "is") return value === filter.value;
      if (filter.type === "in") return Array.isArray(filter.value) && filter.value.includes(value);
      if (filter.type === "lte") return String(value) <= String(filter.value);
      if (filter.type === "gte") return String(value) >= String(filter.value);
      if (filter.type === "lt") return String(value) < String(filter.value);
      if (filter.type === "gt") return String(value) > String(filter.value);
      if (filter.type === "not" && filter.operator === "is") return value !== filter.value;
      return true;
    }));

    for (const order of this.orders) {
      result = [...result].sort((a, b) => {
        const av = a[order.column] ?? 0;
        const bv = b[order.column] ?? 0;
        if (av === bv) return 0;
        return (av < bv ? -1 : 1) * (order.ascending ? 1 : -1);
      });
    }
    if (this.rangeFrom !== null && this.rangeTo !== null) result = result.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.rowLimit !== null) result = result.slice(0, this.rowLimit);
    return deepClone(result);
  }
}

const session = {
  access_token: "fixture-access-token",
  refresh_token: "fixture-refresh-token",
  expires_in: 3600,
  token_type: "bearer",
  user: {
    id: userId,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-09-14T12:00:00.000Z",
  },
};

(supabase as any).auth = {
  getSession: async () => ({ data: { session }, error: null }),
  onAuthStateChange: (callback: any) => {
    window.setTimeout(() => callback("SIGNED_IN", session), 0);
    return { data: { subscription: { unsubscribe: () => {} } } };
  },
  signOut: async () => ({ error: null }),
};

Object.defineProperty(supabase, "from", {
  configurable: true,
  value: (table: string) => new SupabaseQueryBuilder(table),
});
Object.defineProperty(supabase, "rpc", {
  configurable: true,
  value: (name: string, params?: any) => {
    if (name === "get_user_role") return Promise.resolve({ data: role, error: null });
    if (name === "has_staff_permission") return Promise.resolve({ data: false, error: null });
    if (name === "get_company_dashboard_snapshot") {
      if (scenario === "error") return Promise.resolve({ data: null, error: { message: "fixture dashboard error" } });
      const response = {
        data: params?._company_id === companyId ? buildCompanyDashboardSnapshot(params._company_id) : null,
        error: params?._company_id === companyId ? null : { message: "tenant denied" },
      };
      return scenario === "loading"
        ? new Promise((resolve) => window.setTimeout(() => resolve(response), 1_200))
        : Promise.resolve(response);
    }
    if (name === "contact_cadence") {
      return Promise.resolve({
        data: params?._company_id === companyId ? [{
          chat_id: "chat-1",
          kind: "student",
          student_id: "student-active-b",
          student_name: "Bruno Ativo",
          lead_id: null,
          lead_name: null,
          student_status: "active",
          hours_since: 96,
          last_inbound_at: "2026-09-10T12:00:00.000Z",
        }] : [],
        error: null,
      });
    }
    if (name === "cohort_feedback_summary") {
      return Promise.resolve({
        data: params?._company_id === companyId ? [{ bucket: "Detratores", alunos: 1, media_nps: 6, pct_ajuste: 100 }] : [],
        error: null,
      });
    }
    if (name === "get_company_ai_identity") {
      return { maybeSingle: async () => ({ data: { assistant_name: "Bnito QA" }, error: null }) };
    }
    return Promise.resolve({ data: null, error: null });
  },
});
Object.defineProperty(supabase, "functions", {
  configurable: true,
  value: {
    invoke: async () => ({ data: { response: "fixture" }, error: null }),
  },
});
Object.defineProperty(supabase, "storage", {
  configurable: true,
  value: {
    from: () => ({
      getPublicUrl: () => ({ data: { publicUrl: "" } }),
      upload: async () => ({ data: null, error: null }),
    }),
  },
});

(window as any).__trainerDashboardFixture = {
  getWrites: () => [...mutableLog.writes],
  getReads: () => [...mutableLog.reads],
};

function FixtureApp() {
  if (role === "master") {
    localStorage.setItem(MASTER_COMPANY_STORAGE_KEY, JSON.stringify({ id: companyId, name: "BN QA", tier: "standard", slug: "bn-qa" }));
  } else {
    localStorage.removeItem(MASTER_COMPANY_STORAGE_KEY);
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const initialEntry = `/${role}${window.location.search}`;
  return (
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <MasterProvider>
              <MemoryRouter initialEntries={[initialEntry]}>
                <main className="min-h-screen bg-background p-4 text-foreground md:p-8">
                  <Routes>
                    <Route path="/admin" element={<AdminDashboard />} />
                    <Route path="/coordinator" element={<CoordinatorDashboard />} />
                    <Route path="/trainer" element={<TrainerDashboard />} />
                    <Route path="/master" element={<AdminDashboard />} />
                    <Route path="*" element={<Navigate to={`/${role}`} replace />} />
                  </Routes>
                </main>
              </MemoryRouter>
              <Toaster />
            </MasterProvider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </React.StrictMode>
  );
}

createRoot(document.getElementById("root")!).render(<FixtureApp />);
