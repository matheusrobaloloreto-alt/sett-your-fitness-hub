import { selectStudentPrescriptionEnrollment } from "@/lib/studentEnrollmentContinuity";
import { useStudentPrescriptionPolicy } from "@/hooks/useStudentPrescriptionPolicy";
import { useQuery } from "@tanstack/react-query";
import { PublishedPrescriptionHistory, PublishedWorkoutDetails } from "@/components/student/PublishedPrescriptionHistory";
import { useEffect, useState, useCallback, useMemo, useRef, Fragment, Suspense, lazy } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AthleticClubProvider, AthleticClubStar } from "@/components/AthleticClubStar";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Dumbbell, Play, Clock, CheckCircle2, Circle, Loader2, LogOut, Save, CalendarDays, History, BarChart3, ArrowLeft, LockKeyhole } from "lucide-react";
import { format, parseISO, differenceInDays, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useWorkoutSession, type SessionSummary } from "@/hooks/useWorkoutSession";
import { WorkoutTimer } from "@/components/student/WorkoutTimer";
import { WorkoutSummary } from "@/components/student/WorkoutSummary";
import { ExerciseCard } from "@/components/student/ExerciseCard";
import { groupWorkoutExercises, WORKOUT_METHODS, type MethodId } from "@/lib/workoutMethods";
import { StudentMethodGroup } from "@/components/student/StudentMethodGroup";
import { PeriodizationBanner } from "@/components/student/PeriodizationBanner";
import { CheckinCard } from "@/components/student/CheckinCard";
import { PushBanner } from "@/components/student/PushBanner";
import { ExerciseVideoPlayer } from "@/components/student/ExerciseVideoPlayer";
import { useExerciseVideo } from "@/hooks/useExerciseVideo";
import { loadPublishedPrescriptions } from "@/lib/studentPrescriptionHistory";
import { loadStudentTrainingHistory, WORKOUT_LOG_COLUMNS } from "@/lib/studentTrainingHistory";
import { useRestTimer } from "@/components/student/RestTimer";
import { useWakeLock } from "@/hooks/useWakeLock";
import { WeeklyBar } from "@/components/student/WeeklyBar";
import { AnnouncementsBell } from "@/components/student/AnnouncementsBell";
import { StudentHome } from "@/components/student/StudentHome";
import { StudentHistory } from "@/components/student/StudentHistory";
import { StudentPortalNavigation, studentSpring, type StudentPrimaryView } from "@/components/student/StudentPortalNavigation";
import { useTheme } from "@/contexts/ThemeContext";
import bnMark from "@/assets/bn-mark-transparent.png";
import "./student-linen.css";
import { PersonalThemeIconToggle } from "@/components/PersonalThemeToggle";
import { businessDateYmd } from "@/lib/businessDate";
import { PlatformAdSlot } from "@/components/PlatformAdSlot";
import { WeeklyGoalEditor } from "@/components/student/WeeklyGoalEditor";
import { hasIndividualWeeklyPrescription, resolveActiveWorkoutInCycles, resolveWorkoutForCycleWeek, type ResolvedWeekContext, type StoredWeeklyExercisePrescription } from "@/lib/weeklyStrengthPeriodization";
import { currentWeekIndex } from "@/lib/periodization";
import { StudentWeekSelector } from "@/components/student/StudentWeekSelector";
import { collectTrainedDates, collectTrainedDaysForWeek, mergeTrainingLogsForDisplay, upsertCompletedWorkoutSession } from "@/lib/studentWeek";
import { readStudentCardioSports, readStudentNutritionPlan } from "@/components/student/studentPlanReads";

import { CycleFeedbackBanner } from "@/components/student/CycleFeedbackBanner";
import {usePublishedInstrumentState} from '@/hooks/usePublishedInstrument';
import VersionedFormFields from '@/components/VersionedFormFields';
import {validateFormAnswers} from '@/lib/formDefinitions';
import { calculateStreak } from "@/lib/streakCalculator";
import type { Gender } from "@/components/student/BodyMeasurements";
import { Megaphone, Activity } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { filterMaterializedWorkouts, orderWorkoutsByPrescription } from "@/lib/workoutPresence";
import { canonicalizeWorkoutLogBatchRows } from "@/lib/workoutLogBatch";
import {
  inferExtraSetsFromPersistedLogs,
  mergeWorkoutDraftLogs,
  readWorkoutUiDraft,
  reconcileWorkoutLogBatchResponse,
  discardConflictedWorkoutLogDeletions,
  removeAndRenumberWorkoutSet,
  resolveWorkoutResumeTarget,
  workoutUiDraftKey,
  workoutLogTombstoneKey,
  writeWorkoutUiDraft,
  type MutableWorkoutSetLog,
  type PersistedWorkoutSetIdentity,
  type WorkoutExerciseSetDefinition,
} from "@/lib/workoutDraft";
import { emitBenitoProductEvent } from "@/lib/benitoProductEvents";
import { resolveWorkoutSelectionAfterReload } from "@/lib/studentWorkoutReload";
import { selectPreferredVisibleCycle, selectStudentWorkoutCycleWindow, selectStudentDigitalContinuity } from "@/lib/prescriptionSchedule";
import { recordAppPerformanceSample } from "@/lib/appPerformanceTelemetry";
import { projectPrescriptionCoverage } from "@/lib/prescriptionCoverage";
import { createWorkoutLogSaveQueue, saveWorkoutLogBatchIfCurrent, type WorkoutLogSaveResult } from "@/lib/workoutLogPersistence";
import { normalizeSetType } from "@/lib/setTypes";
import { isWorkoutLogAwaitingConfirmation, shouldSaveWorkoutLog, workoutLogForDate } from "@/lib/workoutLogRequest";

const StatsCharts = lazy(() => import("@/components/student/StatsCharts").then((module) => ({ default: module.StatsCharts })));
const VolumeInsights = lazy(() => import("@/components/student/VolumeInsights").then((module) => ({ default: module.VolumeInsights })));
const NutritionPlanView = lazy(() => import("@/components/student/NutritionPlanView").then((module) => ({ default: module.NutritionPlanView })));
const CardioPlanView = lazy(() => import("@/components/student/CardioPlanView").then((module) => ({ default: module.CardioPlanView })));
const WearableIntegrations = lazy(() => import("@/components/student/WearableIntegrations").then((module) => ({ default: module.WearableIntegrations })));
const StudentCalendar = lazy(() => import("@/components/student/StudentCalendar").then((module) => ({ default: module.StudentCalendar })));
const AchievementsPanel = lazy(() => import("@/components/student/AchievementsPanel").then((module) => ({ default: module.AchievementsPanel })));
const MonthlyLeaderboard = lazy(() => import("@/components/student/MonthlyLeaderboard").then((module) => ({ default: module.MonthlyLeaderboard })));
const ExternalActivitiesList = lazy(() => import("@/components/student/ExternalActivitiesList").then((module) => ({ default: module.ExternalActivitiesList })));
const AnnouncementsFeed = lazy(() => import("@/components/student/AnnouncementsFeed").then((module) => ({ default: module.AnnouncementsFeed })));
const BodyMeasurements = lazy(() => import("@/components/student/BodyMeasurements").then((module) => ({ default: module.BodyMeasurements })));


type ActiveView = StudentPrimaryView | "stats" | "calendario" | "atividades" | "avisos" | "medidas" | "integracoes";
const MAX_EXTRA_SETS = 5;
const STALE_ACTIVE_SESSION_MESSAGE = "Há uma sessão ativa que não está mais na sua ficha. Encerre essa sessão antes de iniciar outro treino.";

// Exportado somente para o teste integrado do fluxo de conclusão.
// eslint-disable-next-line react-refresh/only-export-components
export async function runStudentPortalWorkoutCompletion<TSession>({
  saveCurrentLogs,
  finishSession,
  onCompleted,
}: {
  saveCurrentLogs: () => Promise<WorkoutLogSaveResult>;
  finishSession: () => Promise<TSession | null>;
  onCompleted: (session: TSession) => void;
}): Promise<
  | { status: "save_failed"; reason: Extract<WorkoutLogSaveResult, { ok: false }>["reason"] }
  | { status: "finish_failed" }
  | { status: "completed"; session: TSession }
> {
  let saveResult = await saveCurrentLogs();
  // Finalizar is the most sensitive moment of the flow. The log RPC is
  // idempotent, so one extra attempt absorbs a transient 4G/Wi-Fi failure
  // without duplicating series or moving the session forward prematurely.
  if (saveResult.ok === false && saveResult.reason === "rpc_error") {
    await new Promise((resolve) => setTimeout(resolve, 350));
    saveResult = await saveCurrentLogs();
  }
  if (saveResult.ok === false) return { status: "save_failed", reason: saveResult.reason };
  const session = await finishSession();
  if (!session) return { status: "finish_failed" };
  onCompleted(session);
  return { status: "completed", session };
}


interface WorkoutExercise {
  exercise_id: string;
  exercise_name: string;
  muscle_group: string;
  video_url: string | null;
  video_path: string | null;
  group_id?: string | null;
  method?: string | null;
  method_seconds?: number | null;
  sets: string;
  reps: string;
  rest: string;
  notes: string;
  tempo?: string | null;
  rir?: string | null;
  weekly_instruction?: string | null;
  weekly_prescription?: StoredWeeklyExercisePrescription[];
  set_types?: string[];
  youtube_video_id?: string | null;
  thumbnail_url?: string | null;
}

interface WorkoutData {
  id: string;
  title: string;
  description: string | null;
  exercises: WorkoutExercise[];
  day_of_week: number | null;
  sort_order?: number | null;
  weekly_context?: ResolvedWeekContext;
}

interface Cycle {
  id: string;
  enrollment_id?: string | null;
  student_id?: string | null;
  company_id?: string | null;
  cycle_number: number;
  start_date: string;
  end_date: string;
  status: string;
  superseded_by_cycle_id?: string | null;
  objective?: string | null;
  duration_weeks?: number | null;
  delivery_status?: string | null;
  prescription_cleared_at?: string | null;
  workouts: WorkoutData[];
}

interface WorkoutLog {
  id?: string;
  workout_id: string;
  exercise_index: number;
  set_number: number;
  weight: number;
  reps_done: number;
  session_date?: string;
  set_type?: string;
  rpe?: number;
  completed?: boolean;
  revision?: number;
  updated_at?: string;
  created_at?: string;
  client_updated_at?: string;
  dirty?: boolean;
  deleted?: boolean;
  deleted_from_client_updated_at?: string | null;
  renumbered_at?: string;
}

// Shared with the React integration test for in-flight deletion and reopening.
// eslint-disable-next-line react-refresh/only-export-components
export function useStudentPortalExtraSetReconciliation({
  selectedWorkout,
  persistedLogs,
  draftLogs,
  draftReady,
  todayStr,
  setExtraSets,
  extraSetsWorkoutRef,
  extraSetsByWorkoutRef,
}: {
  selectedWorkout: { id: string; exercises: WorkoutExerciseSetDefinition[] } | null;
  persistedLogs: PersistedWorkoutSetIdentity[];
  draftLogs: Record<string, MutableWorkoutSetLog>;
  draftReady: boolean;
  todayStr: string;
  setExtraSets: Dispatch<SetStateAction<Record<number, number>>>;
  extraSetsWorkoutRef: MutableRefObject<string | null>;
  extraSetsByWorkoutRef: MutableRefObject<Record<string, Record<number, number>>>;
}) {
  useEffect(() => {
    if (!selectedWorkout || !draftReady) return;
    const workoutId = selectedWorkout.id;
    // Pending tombstones hide old ACKs only in the UI projection. Keep the
    // authoritative rows intact so a rejected deletion can restore its count.
    const allLogs = mergeTrainingLogsForDisplay<MutableWorkoutSetLog & PersistedWorkoutSetIdentity>(
      persistedLogs,
      Object.entries(draftLogs).filter(([key, log]) => {
        const tombstone = draftLogs[workoutLogTombstoneKey(key)];
        // Reload may retain a server copy beside its pending tombstone. It is
        // not the shifted insert, and must not undo that tombstone in the view.
        return !(tombstone?.deleted === true && log.id && log.id === tombstone.id);
      }).map(([, log]) => ({ ...log, session_date: log.session_date ?? todayStr })),
      todayStr,
    );
    const inferred = inferExtraSetsFromPersistedLogs(allLogs, workoutId, selectedWorkout.exercises, todayStr);
    setExtraSets(current => {
      const previousWorkoutId = extraSetsWorkoutRef.current;
      if (previousWorkoutId && previousWorkoutId !== workoutId) {
        extraSetsByWorkoutRef.current[previousWorkoutId] = current;
      }
      const cached = extraSetsByWorkoutRef.current[workoutId]
        ?? (previousWorkoutId === workoutId ? current : {});
      const merged = { ...inferred };
      for (const [index, count] of Object.entries(cached)) {
        const exerciseIndex = Number(index);
        merged[exerciseIndex] = Math.min(MAX_EXTRA_SETS, Math.max(merged[exerciseIndex] || 0, count));
      }
      extraSetsWorkoutRef.current = workoutId;
      extraSetsByWorkoutRef.current[workoutId] = merged;
      const currentKeys = Object.keys(current);
      const mergedKeys = Object.keys(merged);
      if (currentKeys.length === mergedKeys.length
        && mergedKeys.every(key => current[Number(key)] === merged[Number(key)])) return current;
      return merged;
    });
  }, [persistedLogs, draftLogs, draftReady, selectedWorkout, todayStr, setExtraSets, extraSetsWorkoutRef, extraSetsByWorkoutRef]);
}

export default function StudentPortal() {
  const { user, signOut, companyId: authCompanyId } = useAuth();
  const userScope = `${user?.id ?? ""}:${authCompanyId ?? ""}`;
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const { settings: themeSettings } = useTheme();
  const reducedMotion = useReducedMotion() ?? false;

  useEffect(() => {
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  }, [activeView]);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [studentIsInactive, setStudentIsInactive] = useState(false);
  const [gender, setGender] = useState<Gender | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [coverage, setCoverage] = useState<ReturnType<typeof projectPrescriptionCoverage> | null>(null);
  const [digitalContinuation, setDigitalContinuation] = useState<{ cycleId: string; enrollmentEndDate: string } | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<Cycle | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState<number | null>(null);
  const { video: videoModal, openVideo: openVideoForExercise, closeVideo } = useExerciseVideo();
  // Feedback pós-treino — persiste no painel; WhatsApp é um canal adicional.
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackRating, setFeedbackRating] = useState<string | null>(null);
  const [feedbackWorkoutTitle, setFeedbackWorkoutTitle] = useState("");
  const [feedbackSessionId, setFeedbackSessionId] = useState<string | null>(null);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const {published:feedbackDefinition,loaded:feedbackDefinitionLoaded,error:feedbackDefinitionError}=usePublishedInstrumentState(companyId,'workout_feedback');
  const [feedbackInstrumentAnswers,setFeedbackInstrumentAnswers]=useState<Record<string,unknown>>({});
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadedUserScope, setLoadedUserScope] = useState<string | null>(null);
  const loadRequestId = useRef(0);
  const currentUserScope = useRef(userScope);
  currentUserScope.current = userScope;
  const dataUserScope = useRef<string | null>(null);
  const [expandedExercise, setExpandedExercise] = useState<number | null>(null);
  const [dailyLogs, setDailyLogs] = useState<Record<string, WorkoutLog>>({});
  const [priorSessionLogs, setPriorSessionLogs] = useState<Record<string, WorkoutLog>>({});
  const [logsRestoredKey, setLogsRestoredKey] = useState<string | null>(null);
  const dailyLogsRef = useRef<Record<string, WorkoutLog>>({});
  const priorSessionLogsRef = useRef<Record<string, WorkoutLog>>({});
  const workoutLogSaveQueueRef = useRef(createWorkoutLogSaveQueue());
  const [previousLogs, setPreviousLogs] = useState<Record<string, WorkoutLog>>({});
  const [savingLogs, setSavingLogs] = useState(false);
  const [finishingWorkout, setFinishingWorkout] = useState(false);
  const finishingWorkoutRef = useRef(false);
  const [enrollmentInfo, setEnrollmentInfo] = useState<{ plan_name: string; start_date: string; end_date: string } | null>(null);
  const [allLogs, setAllLogs] = useState<any[]>([]);
  const [extraSets, setExtraSets] = useState<Record<number, number>>({});
  const [workoutSessions, setWorkoutSessions] = useState<any[]>([]);
  const [workoutFeedbacks, setWorkoutFeedbacks] = useState<any[]>([]);
  const [weeklyGoal, setWeeklyGoal] = useState<number>(3);
  const [activeEnrollmentId, setActiveEnrollmentId] = useState<string | null>(null);
  // Prescrições por modalidade (abas condicionais): nutrição + esportes de cardio existentes.
  const [calendarWorkout, setCalendarWorkout] = useState<{ workoutId: string; date: string } | null>(null);
  const [preferredCyclePrescriptionCleared, setPreferredCyclePrescriptionCleared] = useState(false);

  const commitDailyLogs = useCallback((updater: (current: Record<string, WorkoutLog>) => Record<string, WorkoutLog>) => {
    const next = updater(dailyLogsRef.current);
    dailyLogsRef.current = next;
    setDailyLogs(next);
    return next;
  }, []);
  

  const todayStr = businessDateYmd();
  const dailyLogsBackupKey = studentId ? `sett_logs_${studentId}_${todayStr}` : null;
  const awaitingPrescription = !studentIsInactive && !(coverage?.reliable && selectedCycle && coverage.currentWorkoutCycleIds.includes(selectedCycle.id));
  const expiredContinuation = Boolean((selectedCycle?.end_date && selectedCycle.end_date < todayStr) || (digitalContinuation?.enrollmentEndDate && digitalContinuation.enrollmentEndDate < todayStr));
  const prescriptionPolicy = useStudentPrescriptionPolicy(
    loadedUserScope === userScope && !loadError && user?.id && studentId && companyId
      && (!authCompanyId || authCompanyId === companyId)
      ? { userId: user.id, studentId, companyId } : null,
  );
  const hasDigitalContinuity = Boolean((!expiredContinuation || prescriptionPolicy.allowContinuity) && !studentIsInactive && digitalContinuation && digitalContinuation.cycleId === selectedCycle?.id
    && selectedCycle?.workouts.length);
  const awaitingDigitalPrescription = awaitingPrescription || expiredContinuation;
  const workoutUnavailable = awaitingDigitalPrescription && !hasDigitalContinuity;
  const lastPublishedCycle = cycles.filter(cycle => cycle.workouts.length > 0 && cycle.end_date < todayStr)
    .sort((a, b) => b.end_date.localeCompare(a.end_date))[0];


  const portalReady = loadedUserScope === userScope && !loadError && Boolean(studentId && companyId)
    && (!authCompanyId || authCompanyId === companyId) && !studentIsInactive;
  const sectionScope = [userScope, studentId, companyId, todayStr] as const;
  const nutritionAvailability = useQuery({
    queryKey: ["student-portal-nutrition", ...sectionScope],
    enabled: portalReady,
    retry: false,
    queryFn: async () => {
      const [plans, anamnese] = await Promise.allSettled([
        readStudentNutritionPlan(studentId!, todayStr),
        supabase.from("student_anamneses").select("wants_nutrition, has_nutritionist").eq("student_id", studentId!).maybeSingle(),
      ]);
      if (plans.status === "fulfilled" && plans.value) return true;
      if (anamnese.status === "fulfilled" && !anamnese.value.error && anamnese.value.data?.wants_nutrition && anamnese.value.data?.has_nutritionist) return true;
      if (plans.status === "rejected" || anamnese.status === "rejected" || anamnese.value.error) {
        throw new Error("Disponibilidade do Nutri não confirmada");
      }
      return false;
    },
  });
  const cardioAvailability = useQuery({
    queryKey: ["student-portal-cardio", ...sectionScope],
    enabled: portalReady && !preferredCyclePrescriptionCleared,
    retry: false,
    queryFn: () => readStudentCardioSports(studentId!, todayStr),
  });
  const goalQuery = useQuery({
    queryKey: ["student-portal-goals", ...sectionScope],
    enabled: portalReady && activeView === "calendario",
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("student_goals")
        .select("id, target_date, title, kind, status, description, metric")
        .eq("student_id", studentId!).order("target_date");
      if (error) throw error;
      return data ?? [];
    },
  });
  const feedbackHistory = useQuery({
    queryKey: ["student-portal-feedback", ...sectionScope],
    enabled: portalReady && activeView === "calendario",
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("workout_feedback")
        .select("id, workout_session_id, notes, trainer_reply, trainer_replied_at, trainer_reply_author_name")
        .eq("student_id", studentId!).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  const mediaIds = useMemo(() => [...new Set(cycles.flatMap(cycle =>
    cycle.workouts.flatMap(workout => workout.exercises.map(exercise => exercise.exercise_id).filter(Boolean))
  ))].sort(), [cycles]);
  const exerciseMedia = useQuery({
    queryKey: ["student-portal-media", ...sectionScope, mediaIds],
    enabled: portalReady && activeView === "treino" && mediaIds.length > 0,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("exercise_library")
        .select("id, video_url, video_path, youtube_video_id, thumbnail_url").in("id", mediaIds);
      if (error) throw error;
      return new Map((data ?? []).map(row => [row.id, row]));
    },
  });
  const calendarSelection = calendarWorkout && resolveActiveWorkoutInCycles(cycles, calendarWorkout.workoutId);
  const historicalWorkout = useQuery({
    queryKey: ["student-portal-calendar-workout", ...sectionScope, calendarWorkout?.workoutId],
    enabled: portalReady && activeView === "calendario" && Boolean(calendarWorkout)
      && calendarSelection?.kind !== "resolved",
    retry: false,
    queryFn: async () => {
      const { prescriptions } = await loadPublishedPrescriptions(supabase, {
        userId: user!.id, studentId: studentId!, companyId: companyId!, today: todayStr,
      }, 0, undefined, calendarWorkout!.workoutId);
      for (const cycle of prescriptions) {
        const workout = cycle.workouts.find(item => item.id === calendarWorkout!.workoutId);
        if (workout) return { cycle, workout };
      }
      return null;
    },
  });
  const session = useWorkoutSession(studentId, companyId, { discoverRemote: portalReady });
  const activeSessionDate = session.activeSession?.sessionDate ?? todayStr;
  const isPriorDaySession = activeSessionDate !== todayStr;
  const activeSessionId = session.activeSession?.id;
  const activeSessionWorkoutId = session.activeSession?.workoutId;
  const sessionStartedAt = session.activeSession?.startedAt ?? 0;
  const sessionStartedOn = new Date(sessionStartedAt);
  const sessionDateUnverified = Boolean(activeSessionId && !session.activeSession?.sessionDate
    && (!Number.isFinite(sessionStartedOn.getTime()) || businessDateYmd(sessionStartedOn) !== todayStr));
  const sessionAlreadyCompleted = Boolean(isPriorDaySession && activeSessionWorkoutId && workoutSessions.some(row =>
    row.id !== activeSessionId && row.workout_id === activeSessionWorkoutId && row.session_date === activeSessionDate
    && row.status === "completed" && Date.parse(row.completed_at ?? "") > sessionStartedAt));
  const sessionNeedsReview = sessionAlreadyCompleted || sessionDateUnverified;
  const needsSessionLogRead = Boolean(portalReady && activeSessionId && (session.isRemoteSession || isPriorDaySession)
    && !sessionNeedsReview);
  const sessionLogScope = needsSessionLogRead ? `${userScope}:${activeSessionId}:${activeSessionDate}` : null;
  const [hydratedSessionLogScope, setHydratedSessionLogScope] = useState<string | null>(null);
  const resumedLogQuery = useQuery({
    queryKey: ["student-portal-resumed-logs", ...sectionScope, activeSessionId, activeSessionDate],
    enabled: needsSessionLogRead,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("workout_logs").select(WORKOUT_LOG_COLUMNS)
        .eq("student_id", studentId!).eq("workout_id", activeSessionWorkoutId!).eq("session_date", activeSessionDate);
      if (error || (data ?? []).some(row => row.workout_id !== activeSessionWorkoutId || row.session_date !== activeSessionDate)) {
        throw new Error("Séries da sessão não confirmadas");
      }
      return data ?? [];
    },
  });
  const priorBackupKey = studentId && isPriorDaySession && activeSessionId
    ? `sett_resumed_logs_${studentId}_${activeSessionId}_${activeSessionDate}` : null;
  const logsBackupKey = priorBackupKey ?? dailyLogsBackupKey;
  const logs = isPriorDaySession ? priorSessionLogs : dailyLogs;
  const logsRef = isPriorDaySession ? priorSessionLogsRef : dailyLogsRef;
  const commitPriorSessionLogs = useCallback((updater: (current: Record<string, WorkoutLog>) => Record<string, WorkoutLog>) => {
    const next = updater(priorSessionLogsRef.current);
    priorSessionLogsRef.current = next;
    setPriorSessionLogs(next);
    return next;
  }, []);
  const commitLogs = isPriorDaySession ? commitPriorSessionLogs : commitDailyLogs;
  const waitingForSessionLogs = Boolean(sessionLogScope && hydratedSessionLogScope !== sessionLogScope);
  const activeSessionWriteBlocked = sessionNeedsReview || waitingForSessionLogs;
  const currentSessionLogScope = useRef("");
  const writeScope = `${userScope}:${studentId ?? ""}:${activeSessionId ?? ""}:${activeSessionDate}`;
  currentSessionLogScope.current = writeScope;
  useEffect(() => {
    if (!sessionLogScope || !resumedLogQuery.data) return;
    const serverLogs = Object.fromEntries(resumedLogQuery.data.map(row => [
      `${row.workout_id}-${row.exercise_index}-${row.set_number}`, row,
    ]));
    const belongsToSession = (log: WorkoutLog) => log.workout_id === activeSessionWorkoutId
      && (!log.session_date || log.session_date === activeSessionDate);
    if (priorBackupKey) {
      let draft: Record<string, WorkoutLog> = {};
      try {
        const priorDayKey = `sett_logs_${studentId}_${activeSessionDate}`;
        const raw = localStorage.getItem(priorBackupKey) ?? localStorage.getItem(priorDayKey);
        if (raw) draft = Object.fromEntries(Object.entries(JSON.parse(raw) as Record<string, WorkoutLog>)
          .filter(([, log]) => belongsToSession(log)));
      } catch { /* An unreadable local backup cannot replace server data. */ }
      commitPriorSessionLogs(() => mergeWorkoutDraftLogs(serverLogs, draft));
    } else {
      commitDailyLogs(current => {
        const entries = Object.entries(current);
        const other = Object.fromEntries(entries.filter(([, log]) => !belongsToSession(log)));
        const draft = Object.fromEntries(entries.filter(([, log]) => belongsToSession(log)));
        return { ...other, ...mergeWorkoutDraftLogs(serverLogs, draft) };
      });
    }
    setHydratedSessionLogScope(sessionLogScope);
  }, [sessionLogScope, resumedLogQuery.data, activeSessionWorkoutId, activeSessionDate, priorBackupKey,
    studentId, commitDailyLogs, commitPriorSessionLogs]);

  const activeWorkoutResolution = useMemo(
    () => resolveActiveWorkoutInCycles(cycles, session.activeSession?.workoutId ?? null),
    [cycles, session.activeSession?.workoutId],
  );
  const hasUnresolvedActiveSession = session.isHydrated && activeWorkoutResolution.kind === "stale";
  const selectedWorkoutCycle = activeWorkoutResolution.kind === "resolved" ? activeWorkoutResolution.cycle : selectedCycle;
  const selectedWorkoutBase = hasUnresolvedActiveSession
    ? null
    : activeWorkoutResolution.kind === "resolved"
      ? activeWorkoutResolution.workout
      : selectedCycle?.workouts.find(w => w.id === selectedWorkoutId) || selectedCycle?.workouts[0] || null;
  const workoutDate = useMemo(() => isPriorDaySession ? parseISO(activeSessionDate) : undefined, [activeSessionDate, isPriorDaySession]);
  const currentCycleWeek = selectedWorkoutCycle
    ? currentWeekIndex(selectedWorkoutCycle.start_date, selectedWorkoutCycle.duration_weeks || 6, workoutDate) + 1
    : 1;
  const effectiveWeekStart = selectedWeekStart && selectedWeekStart <= (selectedWorkoutCycle?.duration_weeks || 6)
    ? selectedWeekStart
    : currentCycleWeek;
  const selectedWeek = effectiveWeekStart;
  const selectedWorkout = useMemo(
    () => resolveWorkoutForCycleWeek(
      selectedWorkoutBase,
      selectedWorkoutCycle?.start_date,
      selectedWorkoutCycle?.duration_weeks,
      workoutDate,
      selectedWeek,
    ),
    [selectedWorkoutBase, selectedWorkoutCycle?.start_date, selectedWorkoutCycle?.duration_weeks, workoutDate, selectedWeek],
  );
  const comparisonLogs = useMemo(() => {
    if (!isPriorDaySession) return previousLogs;
    const beforeSession: Record<string, WorkoutLog> = {};
    for (const log of allLogs) {
      if (!log.session_date || log.session_date >= activeSessionDate) continue;
      const key = `${log.workout_id}-${log.exercise_index}-${log.set_number}`;
      if ((beforeSession[key]?.session_date ?? "") < log.session_date) beforeSession[key] = log;
    }
    return beforeSession;
  }, [isPriorDaySession, previousLogs, allLogs, activeSessionDate]);
  const hasWeeklyPrescriptions = hasIndividualWeeklyPrescription(selectedWorkoutBase?.exercises);

  const displayedWorkoutCycleId = selectedWorkoutCycle?.id;
  useEffect(() => {
    if (!displayedWorkoutCycleId) return;
    setSelectedWeekStart(null);
  }, [displayedWorkoutCycleId, isPriorDaySession]);
  const startBlockedReason = hasUnresolvedActiveSession
    ? STALE_ACTIVE_SESSION_MESSAGE
    : session.activeSession?.workoutId && selectedWorkout && session.activeSession.workoutId !== selectedWorkout.id
      ? "Já existe uma sessão ativa de outro treino. Retome ou encerre essa sessão antes de iniciar outro treino."
      : null;
  const workoutUiDraftStorageKey = studentId ? workoutUiDraftKey(studentId, todayStr) : null;
  const workoutUiRestoredKeyRef = useRef<string | null>(null);
  const extraSetsWorkoutRef = useRef<string | null>(null);
  const extraSetsByWorkoutRef = useRef<Record<string, Record<number, number>>>({});
  const performanceStartedAt = useRef(0);
  const performanceCompanyId = useRef<string | null>(null);
  const recordedPerformanceMetrics = useRef(new Set<"shell_ready" | "content_ready">());

  // Mantém a tela acesa durante o treino (academia: evita destravar de mão suada).
  useWakeLock(session.isActive);

  // Restauração ordenada: espera a sessão local hidratar e resolve uma única
  // fonte. Sessão ativa vence rascunho antigo; o rascunho só complementa a UI
  // quando pertence ao mesmo treino iniciado.
  useEffect(() => {
    if (loading || !session.isHydrated || !workoutUiDraftStorageKey || cycles.length === 0) return;
    const activeWorkoutId = session.activeSession?.workoutId ?? null;
    const alreadyRestored = workoutUiRestoredKeyRef.current === workoutUiDraftStorageKey;
    if (alreadyRestored && !activeWorkoutId) return;
    const draft = readWorkoutUiDraft(localStorage, workoutUiDraftStorageKey);
    const target = resolveWorkoutResumeTarget(activeWorkoutId, draft);
    workoutUiRestoredKeyRef.current = workoutUiDraftStorageKey;
    if (!target) return;
    const cycle = cycles.find(item => item.id === target.cycleId && item.workouts.some(workout => workout.id === target.workoutId))
      || cycles.find(item => item.workouts.some(workout => workout.id === target.workoutId));
    if (!cycle) {
      if (target.source === "active_session") {
        setSelectedWorkoutId(null);
        setExpandedExercise(null);
        if (!session.isRemoteSession) setActiveView("treino");
      }
      return;
    }
    if (target.source === "draft" && cycle.id !== selectedCycle?.id) return;
    setSelectedWorkoutId(target.workoutId);
    setExpandedExercise(target.expandedExercise);
    extraSetsWorkoutRef.current = target.workoutId;
    extraSetsByWorkoutRef.current[target.workoutId] = target.extraSets;
    setExtraSets(target.extraSets);
    if (!session.isRemoteSession) setActiveView("treino");
  }, [cycles, loading, selectedCycle?.id, session.activeSession?.workoutId, session.isHydrated,
    session.isRemoteSession, workoutUiDraftStorageKey]);

  useEffect(() => {
    if (!session.isHydrated || workoutUiRestoredKeyRef.current !== workoutUiDraftStorageKey) return;
    if (!workoutUiDraftStorageKey || !selectedWorkoutId) return;
    try {
      writeWorkoutUiDraft(localStorage, workoutUiDraftStorageKey, {
        cycleId: selectedCycle?.id ?? null,
        workoutId: selectedWorkoutId,
        expandedExercise,
        activeView,
        extraSets,
      });
    } catch { /* quota/private mode */ }
  }, [activeView, expandedExercise, extraSets, selectedCycle?.id, selectedWorkoutId, session.isHydrated, workoutUiDraftStorageKey]);

  useStudentPortalExtraSetReconciliation({
    selectedWorkout,
    persistedLogs: allLogs,
    draftLogs: logs,
    draftReady: isPriorDaySession ? !waitingForSessionLogs : !!dailyLogsBackupKey && logsRestoredKey === dailyLogsBackupKey,
    todayStr: activeSessionDate,
    setExtraSets,
    extraSetsWorkoutRef,
    extraSetsByWorkoutRef,
  });

  const { activeRest, startRest, clearRest } = useRestTimer();

  const invalidateLoad = useCallback(() => { ++loadRequestId.current; }, []);
  useEffect(() => {
    if (user?.id) void loadStudentData();
    return invalidateLoad;
  }, [user?.id, authCompanyId, invalidateLoad]);

  const recordLoadPerformance = (metric: "shell_ready" | "content_ready") => {
    if (recordedPerformanceMetrics.current.has(metric)) return;
    recordedPerformanceMetrics.current.add(metric);
    void recordAppPerformanceSample({
      routeGroup: "student_workout",
      metric,
      durationMs: performance.now() - performanceStartedAt.current,
      companyId: performanceCompanyId.current,
    });
  };

  const loadStudentData = async () => {
    if (currentUserScope.current !== userScope) return;
    const requestId = ++loadRequestId.current;
    const userId = user?.id;
    if (!userId) return;
    const isStale = () => requestId !== loadRequestId.current || currentUserScope.current !== userScope;
    const read = async <T,>(query: T): Promise<Awaited<T>> => {
      const result = await query;
      if (isStale()) throw new Error("Obsolete portal request");
      if ((result as { error?: unknown }).error) throw new Error("Portal read unavailable");
      return result;
    };
    if (dataUserScope.current !== userScope) {
      dataUserScope.current = userScope;
      setStudentId(null); setCompanyId(null); setStudentName("");
      setCycles([]); setSelectedCycle(null); setSelectedWorkoutId(null);
      setEnrollmentInfo(null); setActiveEnrollmentId(null);
      setAllLogs([]); setWorkoutSessions([]); setWorkoutFeedbacks([]); setCalendarWorkout(null);
      commitDailyLogs(() => ({})); commitPriorSessionLogs(() => ({}));
      setHydratedSessionLogScope(null); setPreviousLogs({});
      setExtraSets({}); extraSetsWorkoutRef.current = null; extraSetsByWorkoutRef.current = {};
      setActiveView("home");
    }
    setLoadError(false);
    setCoverage(null);
    setDigitalContinuation(null);
    const businessToday = parseISO(todayStr);
    performanceStartedAt.current = performance.now();
    performanceCompanyId.current = null;
    recordedPerformanceMetrics.current.clear();
    setLoading(true);
    setContentLoading(true);
    setPreferredCyclePrescriptionCleared(false);
    try {
    const { data: student } = await read(supabase
      .from("students")
      .select("id, full_name, company_id, weekly_workout_goal, gender, status")
      .eq("user_id", userId)
      .maybeSingle());

    if (!student) {
      setStudentId(null); setCompanyId(null);
      setContentLoading(false);
      return;
    }
    performanceCompanyId.current = student.company_id;
    setStudentId(student.id);
    setStudentName(student.full_name);
    setCompanyId(student.company_id);
    const inactive = ["inactive", "cancelled", "archived"].includes((student as any).status);
    setStudentIsInactive(inactive);
    setGender((student as any).gender === "male" || (student as any).gender === "female" ? (student as any).gender : null);
    setWeeklyGoal((student as any).weekly_workout_goal || 3);
    // O conteúdo só fica disponível após confirmar todas as leituras.
    recordLoadPerformance("shell_ready");

    if (inactive) {
      setCycles([]);
      setSelectedCycle(null);
      setSelectedWorkoutId(null);
      setEnrollmentInfo(null);
      setActiveEnrollmentId(null);
      setContentLoading(false);
      recordLoadPerformance("content_ready");
      return;
    }

    const { data: enrollmentRows } = await read(supabase
      .from("enrollments")
      .select("id, student_id, company_id, start_date, end_date, training_start_date, plan_id, status, created_at, carried_over_cycle_id")
      .eq("student_id", student.id)
      .eq("company_id", student.company_id)
      .order("created_at", { ascending: false })
      .limit(1000));
    // Never infer continuity from a possibly truncated history.
    if ((enrollmentRows?.length ?? 0) >= 1000) throw new Error("Histórico de matrículas excede o limite de leitura segura.");
    const enrollment = selectStudentPrescriptionEnrollment((enrollmentRows || []) as any[], { today: businessToday, expectedStudentId: student.id, expectedCompanyId: student.company_id });
    if (!enrollment) {
      setActiveEnrollmentId(null); setEnrollmentInfo(null);
      setCycles([]); setSelectedCycle(null); setSelectedWorkoutId(null);
    }

    let planDurationDays = 42;
    let cycleDurationDays = 42;
    if (enrollment) {
      setActiveEnrollmentId(enrollment.id);
      // Nome do plano em query separada (sem o embed plans(name), que podia dar 400 por divergência de schema/FK
      // e derrubar TODA a carga do treino junto).
      let planName = "Plano";
      const planId = (enrollment as any).plan_id;
      if (planId) {
        const { data: planRow } = await read(supabase
          .from("plans")
          .select("name, duration_days, duration_weeks, cycle_duration_days")
          .eq("id", planId)
          .maybeSingle());
        if ((planRow as any)?.name) planName = (planRow as any).name;
        planDurationDays = Math.max(
          1,
          Number((planRow as any)?.duration_days)
            || Number((planRow as any)?.duration_weeks) * 7
            || 42,
        );
        cycleDurationDays = Math.max(1, Number((planRow as any)?.cycle_duration_days) || 42);
      }
      setEnrollmentInfo({
        plan_name: planName,
        start_date: enrollment.start_date,
        end_date: enrollment.end_date,
      });
    }

    // O portal nunca mistura ciclos de matrículas históricas. Se não existir
    // matrícula ativa, não há uma agenda corrente para exibir.
    if (enrollment) {
      // O cast mantém compatibilidade com o tipo local legado da tabela.
      const cycleSelect = "id, enrollment_id, student_id, company_id, cycle_number, start_date, end_date, status, superseded_by_cycle_id, objective, duration_weeks, delivery_status, superseded_at, prescription_cleared_at, prescribed_offline_at, prescribed_offline_by, prescribed_offline_note";
      const { data: cyclesData } = await read((supabase as any)
        .from("training_cycles")
        .select(cycleSelect)
        .eq("enrollment_id", enrollment.id)
        .eq("student_id", student.id)
        .eq("company_id", student.company_id)
        .order("cycle_number"));
      const carriedOverCycleId = (enrollment as any).carried_over_cycle_id;
      const { data: carriedOverCycle } = carriedOverCycleId
        ? await read((supabase as any)
          .from("training_cycles")
          .select(cycleSelect)
          .eq("id", carriedOverCycleId)
          .eq("student_id", student.id)
          .eq("company_id", student.company_id)
          .maybeSingle())
        : { data: null };

      if (!(cyclesData?.length || carriedOverCycle)) {
        setCoverage(projectPrescriptionCoverage({ enrollment, cycles: [], expectedStudentId: student.id,
          expectedCompanyId: student.company_id, today: todayStr, planDurationDays, cycleDurationDays }));
        setCycles([]); setSelectedCycle(null); setSelectedWorkoutId(null);
      }
      if ((cyclesData && cyclesData.length > 0) || carriedOverCycle) {
        const visibleCycles = (cyclesData || []).filter((cycle) => cycle.enrollment_id === enrollment.id && cycle.student_id === student.id && cycle.company_id === student.company_id && ["active", "completed", "pending"].includes(cycle.status) && !cycle.superseded_by_cycle_id && !cycle.superseded_at);
        const visibleCycleIds = new Set(visibleCycles.map((cycle) => cycle.id));
        if (
          carriedOverCycle
          && carriedOverCycle.id === carriedOverCycleId
          && carriedOverCycle.student_id === student.id
          && carriedOverCycle.company_id === student.company_id
          && !visibleCycleIds.has(carriedOverCycle.id)
          && ["active", "completed", "pending"].includes(carriedOverCycle.status)
          && !carriedOverCycle.superseded_at
          && !carriedOverCycle.superseded_by_cycle_id
        ) {
          visibleCycles.push(carriedOverCycle);
        }
        const workoutsData = visibleCycles.length > 0
          ? (await read(supabase
            .from("workouts")
            .select("id, name, title, description, exercises, cycle_id, day_of_week, sort_order, company_id, superseded_at, superseded_by_revision_id, student_profile_archive_event_id")
            .or(`company_id.eq.${student.company_id},company_id.is.null`)
            .is("student_profile_archive_event_id", null)
            .is("superseded_by_revision_id", null)
            .is("superseded_at", null)
            .in("cycle_id", visibleCycles.map(c => c.id)))).data
          : [];

        // Legacy null company is inherited only through a verified owned cycle.
        const allowedCycleIds = new Set(visibleCycles.map(cycle => cycle.id));
        const allMaterializedWorkouts = filterMaterializedWorkouts(workoutsData || []).filter(workout =>
          (workout.company_id === student.company_id || workout.company_id === null) && allowedCycleIds.has(workout.cycle_id)
          && !workout.superseded_at && !workout.superseded_by_revision_id && !workout.student_profile_archive_event_id);
        const workoutCycleIds = new Set(allMaterializedWorkouts.map((workout) => workout.cycle_id));
        const currentCoverage = projectPrescriptionCoverage({
          enrollment,
          cycles: visibleCycles.map(cycle => ({ ...cycle,
            has_usable_workouts: !cycle.prescription_cleared_at && workoutCycleIds.has(cycle.id) })),
          expectedStudentId: student.id, expectedCompanyId: student.company_id,
          today: todayStr, planDurationDays, cycleDurationDays,
        });
        setCoverage(currentCoverage);
        const { cycles: operationalCycles, preferredCycle } = selectStudentWorkoutCycleWindow(
          visibleCycles.filter(cycle => cycle.enrollment_id === enrollment.id).map((cycle) => ({ ...cycle, has_workouts: !cycle.prescription_cleared_at && workoutCycleIds.has(cycle.id) })),
          {
            carriedOverCycle: carriedOverCycle && visibleCycles.includes(carriedOverCycle)
              ? { ...carriedOverCycle, has_workouts: !carriedOverCycle.prescription_cleared_at && workoutCycleIds.has(carriedOverCycle.id) }
              : null,
            expectedStudentId: student.id,
            expectedCompanyId: student.company_id,
            planDurationDays,
            cycleDurationDays,
            today: businessToday,
            enrollment,
          },
        );
        // The workout window already validates carry-over eligibility. It can
        // provide execution continuity without covering the renewed schedule.
        const carriedOverContinuation = preferredCycle
          && preferredCycle.id === carriedOverCycleId
          && preferredCycle.enrollment_id !== enrollment.id
          ? preferredCycle : null;
        const continuation = selectStudentDigitalContinuity(
          (cyclesData || []).map(cycle => ({ ...cycle, has_usable_workouts: workoutCycleIds.has(cycle.id) })),
          { enrollment, expectedStudentId: student.id, expectedCompanyId: student.company_id, today: businessToday, allowExpiredEnrollment: true },
        ) ?? carriedOverContinuation;
        const schedulableCycles = continuation && !operationalCycles.some(cycle => cycle.id === continuation.id)
          ? [...operationalCycles, continuation] : operationalCycles;
        const schedulableCycleIds = new Set(schedulableCycles.map((cycle) => cycle.id));
        const materializedWorkouts = allMaterializedWorkouts.filter((workout) => schedulableCycleIds.has(workout.cycle_id));

        const enriched: Cycle[] = schedulableCycles.map(c => {
          const isFutureCycle = Boolean(c.start_date && c.start_date > businessDateYmd());
          const cycleWorkouts = c.prescription_cleared_at || isFutureCycle
            ? []
            : orderWorkoutsByPrescription(materializedWorkouts
              .filter(w => w.cycle_id === c.id)
              .map(w => ({
                id: w.id,
                title: w.title || w.name || "Treino",
                description: w.description,
                day_of_week: (w as any).day_of_week as number | null,
                sort_order: (w as any).sort_order as number | null,
                exercises: (w.exercises as unknown as WorkoutExercise[]) || [],
              })))
              .map((workout) => resolveWorkoutForCycleWeek(
                workout,
                c.start_date,
                (c as any).duration_weeks,
              ) || workout);
          return { ...c, workouts: cycleWorkouts };
        });
        setCycles(enriched);

        const today = businessToday;
        const chosenId = continuation?.id ?? preferredCycle?.id;
        const chosen = enriched.find((cycle) => cycle.id === chosenId) ?? selectPreferredVisibleCycle(
          enriched.map((cycle) => ({ ...cycle, has_workouts: !cycle.prescription_cleared_at && cycle.workouts.length > 0 })),
          today,
        );
        setPreferredCyclePrescriptionCleared(Boolean(chosen?.prescription_cleared_at));
        setSelectedCycle(chosen);
        if (continuation && chosen?.id === continuation.id && chosen.workouts.length) {
          setDigitalContinuation({ cycleId: chosen.id, enrollmentEndDate: enrollment.end_date });
        }
        // Marca como vista somente uma prescrição com conteúdo e vigência atual.
        if (currentCoverage.hasCurrentWorkout && chosen?.id && currentCoverage.currentWorkoutCycleIds.includes(chosen.id)
          && chosen.workouts.length > 0 && chosen.start_date <= todayStr
          && chosen.end_date >= todayStr && (chosen as any).delivery_status !== "viewed") {
          void (supabase as any).rpc("mark_training_cycle_viewed", { _cycle_id: chosen.id });
        }
        const todayDow = new Date().getDay();
        setSelectedWorkoutId((currentWorkoutId) => resolveWorkoutSelectionAfterReload(
          currentWorkoutId,
          chosen?.workouts ?? [],
          todayDow,
        ));

      }
    }
    const { logs: logsData, sessions: sessionsData } = await loadStudentTrainingHistory(
      supabase, student.id, student.company_id ? { companyId: student.company_id } : undefined,
    );
    if (isStale()) return;
    setWorkoutSessions(sessionsData);
    setAllLogs(logsData);
    const todayLogMap: Record<string, WorkoutLog> = {};
    const prevLogMap: Record<string, WorkoutLog> = {};
    const grouped: Record<string, WorkoutLog[]> = {};

    logsData.forEach((log) => {
      const key = `${log.workout_id}-${log.exercise_index}-${log.set_number}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(log);
    });

    Object.entries(grouped).forEach(([key, entries]) => {
      entries.sort((a, b) => (b.session_date || "").localeCompare(a.session_date || ""));
      const todayEntry = entries.find(e => e.session_date === todayStr);
      if (todayEntry) todayLogMap[key] = todayEntry;
      const prevEntry = entries.find(e => e.session_date !== todayStr);
      if (prevEntry) prevLogMap[key] = prevEntry;
    });

    // Keep pending local changes when reloading server revisions.
    commitDailyLogs((current) => mergeWorkoutDraftLogs(todayLogMap, current));
    setPreviousLogs(prevLogMap);
    setContentLoading(false);
    recordLoadPerformance("content_ready");
    } catch {
      if (isStale()) return;
      setLoadError(true);
      setContentLoading(false);
      toast({ title: "Erro ao carregar seus dados", description: "Use Tentar novamente para repetir a consulta.", variant: "destructive" });
    } finally {
      if (!isStale()) {
        setLoadedUserScope(userScope);
        setLoading(false);
      }
    }
  };

  const getLogKey = (workoutId: string, exIdx: number, setNum: number) =>
    `${workoutId}-${exIdx}-${setNum}`;

  const updateLog = (exIdx: number, setNum: number, field: string, value: number | string | boolean) => {
    if (!selectedWorkout || activeSessionWriteBlocked) return;
    const workoutId = selectedWorkout.id;
    const key = getLogKey(workoutId, exIdx, setNum);
    const editDate = activeSessionDate;
    commitLogs(prev => {
      const current = workoutLogForDate(prev[key] || {} as WorkoutLog, editDate);
      const next = {
        ...prev,
        [key]: {
          ...current,
          workout_id: workoutId,
          exercise_index: exIdx,
          set_number: setNum,
          weight: current.weight ?? null,
          reps_done: current.reps_done ?? null,
          set_type: normalizeSetType(
            current.set_type || selectedWorkout.exercises[exIdx]?.set_types?.[setNum - 1],
          ),
          [field]: value,
          client_updated_at: new Date().toISOString(),
          dirty: true,
        },
      };
      // iOS pode suspender a PWA antes de React executar um effect ou pagehide.
      // Grave cada edição imediatamente; o autosave remoto continua em paralelo.
      if (logsBackupKey) {
        try { localStorage.setItem(logsBackupKey, JSON.stringify(next)); } catch { /* quota/private mode */ }
      }
      return next;
    });
  };

  const getTotalSets = (exIdx: number) => {
    const baseSets = parseInt(selectedWorkout?.exercises[exIdx]?.sets || "3") || 3;
    return baseSets + (extraSets[exIdx] || 0);
  };

  const handleAddSet = (exIdx: number) => {
    if (!selectedWorkout) return;
    const workoutId = selectedWorkout.id;
    setExtraSets(prev => {
      const current = prev[exIdx] || 0;
      if (current >= MAX_EXTRA_SETS) {
        toast({
          title: "Limite de séries extras atingido",
          description: "Você pode adicionar até 5 séries além da prescrição.",
        });
        return prev;
      }
      const next = { ...prev, [exIdx]: current + 1 };
      extraSetsWorkoutRef.current = workoutId;
      extraSetsByWorkoutRef.current[workoutId] = next;
      return next;
    });
  };

  const handleRemoveSet = (exIdx: number, setNum: number) => {
    if (!selectedWorkout) return;
    const workoutId = selectedWorkout.id;
    const total = getTotalSets(exIdx);
    const baseSets = parseInt(selectedWorkout.exercises[exIdx]?.sets || "3") || 3;
    const currentExtra = extraSets[exIdx] || 0;
    if (total <= 1 || currentExtra <= 0 || setNum <= baseSets) return;

    commitLogs(prev => removeAndRenumberWorkoutSet(
      prev, workoutId, exIdx, setNum, total, new Date().toISOString(),
    ));

    setExtraSets(prev => {
      const next = { ...prev, [exIdx]: currentExtra - 1 };
      extraSetsWorkoutRef.current = workoutId;
      extraSetsByWorkoutRef.current[workoutId] = next;
      return next;
    });
  };

  const saveCurrentLogs = async (opts?: { silent?: boolean; notifyConflict?: boolean }) => {
    if (!selectedWorkout || !studentId || activeSessionWriteBlocked) return { ok: false, reason: "not_ready" } as const;
    const silent = opts?.silent === true;
    if (!silent) setSavingLogs(true);
    const workoutId = selectedWorkout.id;
    const requestedStudentId = studentId;
    const requestedDate = activeSessionDate;
    const requestedExercises = selectedWorkout.exercises;

    return workoutLogSaveQueueRef.current.run(async (): Promise<WorkoutLogSaveResult> => {
    try {
    if (currentSessionLogScope.current !== writeScope) return { ok: false, reason: "not_ready" };
    if (silent && Object.values(logsRef.current).some(log => isWorkoutLogAwaitingConfirmation(log, workoutId, requestedDate))) {
      return { ok: false, reason: "conflict" };
    }
    // Inclui séries marcadas como concluídas mesmo sem carga/reps (ex.: peso corporal, abdominal).
    // A leitura acontece somente quando chega a vez desta gravação, depois que
    // qualquer autosave anterior já atualizou as revisões em logsRef.
    const logsToSave = Object.values(logsRef.current)
      .filter(log => shouldSaveWorkoutLog(log, workoutId, requestedDate, !silent))
      .map(log => ({ ...log, session_date: log.session_date ?? requestedDate }));

    let hadError = false;
    // O índice identifica a série; base_revision impede que um autosave antigo
    // atualize essa série depois de outro aparelho já ter salvo uma revisão nova.
    const rows = logsToSave.map(log => ({
      student_id: requestedStudentId,
      workout_id: log.workout_id,
      exercise_index: log.exercise_index,
      set_number: log.set_number,
      session_date: log.session_date,
      weight: log.weight ?? 0,
      reps_done: log.reps_done ?? 0,
      set_type: normalizeSetType(
        log.set_type || requestedExercises[log.exercise_index]?.set_types?.[log.set_number - 1],
      ),
      rpe: log.rpe || null,
      completed: log.completed || false,
      base_revision: log.revision ?? null,
      client_updated_at: log.client_updated_at ?? null,
      deleted: log.deleted === true,
    }));
    const canonicalBatch = canonicalizeWorkoutLogBatchRows(rows);
    if (canonicalBatch.error) {
      console.error("Lote de séries rejeitado antes do envio:", canonicalBatch.error);
      if (!silent) {
        toast({ title: "As séries não foram salvas", description: "Recarregue o treino e tente novamente.", variant: "destructive" });
      }
      return { ok: false, reason: "validation_error" } as const;
    }
    const canonicalRows = canonicalBatch.rows;
    let failureReason: Extract<WorkoutLogSaveResult, { ok: false }>["reason"] | null = null;
    if (canonicalRows.length > 0) {
      // RPC com compare-and-swap por revisão: outro dispositivo não pode ser
      // sobrescrito por um autosave baseado numa versão antiga.
      const persistence = await saveWorkoutLogBatchIfCurrent({
        rows: canonicalRows,
        save: async () => {
          const response = await (supabase as any).rpc("save_workout_logs_if_current", { _rows: canonicalRows });
          return { data: response.data, error: response.error };
        },
      });
      if (currentSessionLogScope.current !== writeScope) return { ok: false, reason: "not_ready" };
      if (persistence.reason === "rpc_error") {
        hadError = true;
        failureReason = "rpc_error";
        console.error("Erro ao salvar carga.");
      }
      else {
        const result = persistence.data;
        const allSavedRows = (Array.isArray(result?.saved) ? result.saved : [])
          .filter((row: WorkoutLog | null) => !!row?.workout_id);
        const deletedRows = allSavedRows.filter((row: WorkoutLog) => row.deleted === true);
        const savedRows = allSavedRows.filter((row: WorkoutLog) => row.deleted !== true);
        const rawConflicts = Array.isArray(result?.conflicts) ? result.conflicts : [];
        const deletionConflict = rawConflicts.some((row: WorkoutLog & { requested_deleted?: boolean }) => row?.requested_deleted === true);
        const conflictRows = rawConflicts
          .filter((row: WorkoutLog | null) => !!row?.workout_id);
        if (persistence.reason === "conflict") { hadError = true; failureReason = "conflict"; }
        const authoritativeRows = [...savedRows, ...conflictRows] as WorkoutLog[];
        if (deletionConflict) {
          // Não permita que um reload imediato reaplique a transação local que
          // acabou de perder o CAS para uma edição mais nova de outro aparelho.
          const recovered = commitLogs(prev => discardConflictedWorkoutLogDeletions(prev, logsToSave, conflictRows));
          try {
            if (logsBackupKey) localStorage.setItem(logsBackupKey, JSON.stringify(recovered));
          } catch { /* quota/private mode */ }
          await loadStudentData();
        } else {
          commitLogs(prev => reconcileWorkoutLogBatchResponse(prev, logsToSave, allSavedRows, conflictRows));
          setAllLogs((prev) => {
            const keyOf = (r: any) => `${r.workout_id}|${r.exercise_index}|${r.set_number}|${r.session_date}`;
            const map = new Map((prev || []).map((r: any) => [keyOf(r), r]));
            for (const r of deletedRows) map.delete(keyOf(r));
            for (const r of authoritativeRows) map.set(keyOf(r), { ...(map.get(keyOf(r)) || {}), ...r });
            return Array.from(map.values());
          });
        }
        if (rawConflicts.length > 0 && silent && opts?.notifyConflict !== false) {
          toast({
            title: "Treino atualizado em outro dispositivo",
            description: "Mantivemos a versão mais recente para evitar perder progresso.",
          });
        }
      }
    }
    const outcome: WorkoutLogSaveResult = failureReason
      ? { ok: false, reason: failureReason }
      : { ok: true, reason: canonicalRows.length > 0 ? "saved" : "no_changes" };
    if (silent) return outcome; // autosave: sem toast para não poluir
    if (failureReason === "conflict") {
      toast({ title: "Treino atualizado em outro dispositivo", description: "Revise as séries atualizadas antes de salvar novamente.", variant: "destructive" });
    } else if (hadError) {
      toast({ title: "Algumas cargas não foram salvas", description: "Verifique sua conexão e tente novamente.", variant: "destructive" });
    } else {
      toast({ title: "Cargas salvas!" });
    }
    return outcome;
    } catch {
      if (!silent) {
        toast({ title: "Não foi possível confirmar as cargas", description: "Tente salvar novamente.", variant: "destructive" });
      }
      return { ok: false, reason: "rpc_error" };
    } finally {
      if (!silent) setSavingLogs(false);
    }
    });
  };

  // ---- Autosave + backup local dos logs do dia (resiliência a wifi ruim / reload) ----
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logsRestoredKeyRef = useRef<string | null>(null);

  // Backup local a cada mudança. Espera o restore deste aluno/dia para não
  // sobrescrever um rascunho offline com a versão antiga recém-lida do banco.
  useEffect(() => {
    if (isPriorDaySession ? waitingForSessionLogs : logsRestoredKeyRef.current !== dailyLogsBackupKey) return;
    if (!logsBackupKey || Object.keys(logs).length === 0) return;
    try { localStorage.setItem(logsBackupKey, JSON.stringify(logs)); } catch { /* quota */ }
  }, [logs, logsBackupKey, dailyLogsBackupKey, isPriorDaySession, waitingForSessionLogs]);

  // Restaura, uma vez após o load, entradas locais que o banco não trouxe (edições offline).
  useEffect(() => {
    if (loading || !dailyLogsBackupKey || logsRestoredKeyRef.current === dailyLogsBackupKey) return;
    logsRestoredKeyRef.current = dailyLogsBackupKey;
    try {
      const raw = localStorage.getItem(dailyLogsBackupKey);
      if (!raw) return;
      const local = JSON.parse(raw) as Record<string, WorkoutLog>;
      commitDailyLogs(prev => mergeWorkoutDraftLogs(prev, local));
    } catch { /* ignore */ }
    finally { setLogsRestoredKey(dailyLogsBackupKey); }
  }, [commitDailyLogs, loading, dailyLogsBackupKey]);

  // Autosave com debounce (silencioso) — o atleta não depende mais de lembrar de salvar.
  useEffect(() => {
    if (!studentId || !selectedWorkout || Object.keys(logs).length === 0) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => { void saveCurrentLogs({ silent: true }); }, 2000);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  }, [logs, studentId, selectedWorkout]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tenta salvar ao reconectar.
  useEffect(() => {
    const onOnline = () => { if (Object.keys(logs).length > 0) void saveCurrentLogs({ silent: true }); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [logs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Safari pode congelar a aba sem dar tempo ao debounce. Grave o rascunho
  // local imediatamente no pagehide/visibilitychange; o envio remoto retoma depois.
  useEffect(() => {
    const persistBeforeSuspend = (event: Event) => {
      if (document.visibilityState !== "hidden" && event?.type !== "pagehide") return;
      try {
        if (logsBackupKey && Object.keys(logs).length > 0) {
          localStorage.setItem(logsBackupKey, JSON.stringify(logs));
        }
        if (workoutUiDraftStorageKey && selectedWorkoutId) {
          writeWorkoutUiDraft(localStorage, workoutUiDraftStorageKey, {
            cycleId: selectedCycle?.id ?? null,
            workoutId: selectedWorkoutId,
            expandedExercise,
            activeView,
            extraSets,
          });
        }
      } catch { /* quota/private mode */ }
    };
    document.addEventListener("visibilitychange", persistBeforeSuspend);
    window.addEventListener("pagehide", persistBeforeSuspend);
    return () => {
      document.removeEventListener("visibilitychange", persistBeforeSuspend);
      window.removeEventListener("pagehide", persistBeforeSuspend);
    };
  }, [activeView, expandedExercise, extraSets, logs, logsBackupKey, selectedCycle?.id, selectedWorkoutId, workoutUiDraftStorageKey]);

  const getOverallProgress = () => {
    if (!enrollmentInfo || !enrollmentInfo.start_date || !enrollmentInfo.end_date) return 0;
    const today = new Date();
    const start = parseISO(enrollmentInfo.start_date);
    const end = parseISO(enrollmentInfo.end_date);
    const total = differenceInDays(end, start);
    if (total <= 0) return today >= end ? 100 : 0;
    const elapsed = differenceInDays(today, start);
    return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  };

  const getCycleProgress = (cycle: Cycle) => {
    if (!cycle?.start_date || !cycle?.end_date) return 0;
    const today = new Date();
    const start = parseISO(cycle.start_date);
    const end = parseISO(cycle.end_date);
    const total = differenceInDays(end, start);
    if (total <= 0) return today >= end ? 100 : 0;
    const elapsed = differenceInDays(today, start);
    return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  };

  const getWorkoutLabel = (index: number) => String.fromCharCode(65 + index);

  const handleStartSession = async () => {
    if (!selectedWorkout || session.isActive) return;
    if (workoutUnavailable) {
      toast({ title: "Aguardando prescrição", description: "Não há treino publicado para o período atual. Fale com sua equipe.", variant: "destructive" });
      return;
    }
    if (startBlockedReason) {
      emitBenitoProductEvent({ source: "student_workout", action: "start_blocked" });
      toast({ title: "Sessão ativa em andamento", description: startBlockedReason, variant: "destructive" });
      return;
    }
    const operationScope = userScope;
    const result = await session.startSession(selectedWorkout.id);
    if (currentUserScope.current !== operationScope) return;
    if (result?.ok === false && result.reason === "duplicate_open_sessions") {
      toast({
        title: "Há mais de uma sessão aberta",
        description: "Peça à sua equipe para revisar as sessões em aberto antes de iniciar outro treino.",
        variant: "destructive",
      });
      return;
    }
    if (result?.ok === false && result.reason === "conflict") {
      toast({ title: "Não foi possível abrir outra sessão", description: "Se houver um treino em andamento, retome a sessão nesta tela.", variant: "destructive" });
      return;
    }
    if (result?.ok !== true) {
      toast({ title: "Não foi possível iniciar o treino", description: "O início não foi confirmado. Tente novamente.", variant: "destructive" });
      return;
    }
    emitBenitoProductEvent({ source: "student_workout", action: "started" });
    toast({ title: "Treino iniciado!", description: "O cronômetro está rodando." });
  };

  const handleFinishSession = async () => {
    if (!selectedWorkout || finishingWorkoutRef.current || activeSessionWriteBlocked) return;
    finishingWorkoutRef.current = true;
    setFinishingWorkout(true);

    try {

    const previousBestWeights: Record<string, number> = {};
    const unknownPreviousExercises = new Set<number>();
    selectedWorkout.exercises.forEach((ex, idx) => {
      const exLogs = allLogs.filter((l: any) => l.workout_id === selectedWorkout.id && l.exercise_index === idx && l.session_date < activeSessionDate);
      const maxW = exLogs.filter((log: any) => log.completed === true)
        .reduce((max: number, log: any) => {
          const weight = Number(log.weight);
          return Number.isFinite(weight) ? Math.max(max, weight) : max;
        }, 0);
      previousBestWeights[`ex-${idx}`] = maxW;
      if (exLogs.some((log: any) => log.completed !== true && (Number(log.weight) > 0 || Number(log.reps_done) > 0))) {
        unknownPreviousExercises.add(idx);
      }
    });

    const completion = await runStudentPortalWorkoutCompletion<SessionSummary>({
      saveCurrentLogs: () => saveCurrentLogs({ silent: true, notifyConflict: false }),
      finishSession: () => session.finishSession(logsRef.current, selectedWorkout.exercises, previousBestWeights, unknownPreviousExercises),
      onCompleted: (finishedSession) => {
        setWorkoutSessions((current) => upsertCompletedWorkoutSession(current, finishedSession, activeSessionDate));
      },
    });
    if (completion.status === "save_failed") {
      emitBenitoProductEvent({ source: "student_workout", action: "complete_failed" });
      const failureDescription = completion.reason === "conflict"
        ? "As séries foram atualizadas em outro dispositivo. Recarregue o treino antes de finalizar."
        : completion.reason === "validation_error"
          ? "Encontramos dados antigos nesta ficha. Recarregue o treino e tente novamente."
          : "A sessão continua aberta. Confira a conexão e tente novamente.";
      toast({
        title: "Não foi possível salvar as séries",
        description: failureDescription,
        variant: "destructive",
      });
      return;
    }
    if (completion.status === "finish_failed") {
      emitBenitoProductEvent({ source: "student_workout", action: "complete_failed" });
      toast({
        title: "Não foi possível finalizar o treino",
        description: "Mantivemos esta sessão neste aparelho. Confira a conexão e tente novamente.",
        variant: "destructive",
      });
      return;
    }
    const finishedSession = completion.session;
    emitBenitoProductEvent({ source: "student_workout", action: "completed" });
    toast({ title: "Treino concluído! 🎉", description: "Mandou bem — orgulho do seu progresso. Bora pro próximo!" });

    // Abre o popup "Como foi o treino?" — o registro principal fica no app.
    setFeedbackWorkoutTitle(selectedWorkout.title);
    setFeedbackText("");
    setFeedbackRating(null);
    setFeedbackInstrumentAnswers({});
    setFeedbackSessionId(finishedSession.id);
    setFeedbackOpen(true);
    } finally {
      finishingWorkoutRef.current = false;
      setFinishingWorkout(false);
    }
  };

  const sendWorkoutFeedback = async () => {
    if (!studentId) return;
    if(!feedbackDefinitionLoaded||feedbackDefinitionError)return;
    if(feedbackDefinition){const invalid=validateFormAnswers(feedbackDefinition.definition,feedbackInstrumentAnswers);if(invalid.length){toast({title:'Revise o feedback',description:invalid.join(', '),variant:'destructive'});return;}}
    setSendingFeedback(true);
    try {
      const { data, error } = await supabase.functions.invoke("student-workout-feedback", {
        body: {
          student_id: studentId,
          reflection: feedbackText,
          perception: feedbackRating,
          workout_title: feedbackWorkoutTitle,
          workout_session_id: feedbackSessionId,
          ...(feedbackDefinition?{form_definition_id:feedbackDefinition.id,versioned_answers:feedbackInstrumentAnswers}:{}),
        },
      });
      if (error || !data?.ok || !data?.persisted) {
        throw new Error(error?.message || data?.error || "Não foi possível registrar o feedback.");
      }
      toast({
        title: "Feedback registrado",
        description: data.delivered
          ? "Registrado no app e enviado para a conversa da equipe."
          : "Registrado no painel da equipe para o seu treinador.",
      });
      if (data.feedback_id) {
        setWorkoutFeedbacks((current) => [
          {
            id: data.feedback_id,
            workout_session_id: feedbackSessionId,
            notes: [feedbackRating ? `Percepção: ${feedbackRating}` : null, feedbackText.trim() || null].filter(Boolean).join("\n") || null,
            trainer_reply: null,
            trainer_replied_at: null,
            trainer_reply_author_name: null,
          },
          ...current,
        ]);
      }
      emitBenitoProductEvent({ source: "student_feedback", action: "submitted" });
      setFeedbackOpen(false);
      setFeedbackSessionId(null);
    } catch (error) {
      emitBenitoProductEvent({ source: "student_feedback", action: "failed" });
      toast({
        title: "Não foi possível enviar o feedback",
        description: error instanceof Error ? error.message : "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setSendingFeedback(false);
    }
  };


  const handleAbandonSession = async () => {
    if (sessionNeedsReview) return;
    const operationScope = userScope;
    const result = await session.abandonSession();
    if (currentUserScope.current !== operationScope) return;
    if (result?.ok !== true) {
      toast({ title: "Não foi possível abandonar o treino", description: "O encerramento não foi confirmado. Sua sessão foi preservada; tente novamente.", variant: "destructive" });
      return;
    }
    toast({ title: "Treino abandonado" });
  };

  const getExerciseHistory = (workoutId: string, idx: number) => {
    const exLogs = allLogs.filter((l: any) => l.workout_id === workoutId && l.exercise_index === idx && l.session_date < activeSessionDate);
    const byDate: Record<string, { weight: number; reps_done: number; set_number: number }[]> = {};
    exLogs.forEach((l: any) => {
      if (!byDate[l.session_date]) byDate[l.session_date] = [];
      byDate[l.session_date].push({ weight: l.weight, reps_done: l.reps_done, set_number: l.set_number });
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 5)
      .map(([date, sets]) => ({ date, sets: sets.sort((a, b) => a.set_number - b.set_number) }));
  };

  // A2/Q5 — ponte de contexto pro BNITO: grava o treino/exercício aberto + melhor carga,
  // pra o assistente responder com base no que o aluno está fazendo agora (não genérico).
  useEffect(() => {
    try {
      if (!selectedWorkout) { sessionStorage.removeItem("sett-bnito-context"); return; }
      const ctx: any = { workout_title: selectedWorkout.title, objetivo_ciclo: selectedCycle?.objective || null };
      if (expandedExercise != null && selectedWorkout.exercises[expandedExercise]) {
        const ex = selectedWorkout.exercises[expandedExercise];
        const hist = getExerciseHistory(selectedWorkout.id, expandedExercise);
        const best = Math.max(0, ...hist.flatMap((h: any) => h.sets.map((s: any) => s.weight || 0)));
        ctx.exercicio_aberto = {
          nome: ex.exercise_name,
          grupo: ex.muscle_group,
          prescrito: `${getTotalSets(expandedExercise)}×${ex.reps}`,
          descanso: ex.rest,
          metodo: ex.method || null,
          obs: ex.notes || null,
          melhor_carga_kg: best > 0 ? best : null,
        };
      }
      sessionStorage.setItem("sett-bnito-context", JSON.stringify(ctx));
    } catch { /* noop */ }
  }, [selectedWorkout, expandedExercise, selectedCycle, logs]);

  // Computed values for Home — based on actual sessions, not day_of_week
  const displayLogs = useMemo(() => mergeTrainingLogsForDisplay(allLogs, Object.values(dailyLogs), todayStr), [allLogs, dailyLogs, todayStr]);
  const trainedDays = useMemo(() => collectTrainedDaysForWeek({
    now: new Date(`${todayStr}T12:00:00`),
    persistedLogs: displayLogs,
    completedSessions: workoutSessions,
  }), [displayLogs, todayStr, workoutSessions]);

  const weeklySessionCount = useMemo(() => trainedDays.size, [trainedDays]);


  const trainedDates = useMemo(() => collectTrainedDates(displayLogs, workoutSessions), [displayLogs, workoutSessions]);
  const totalSessions = trainedDates.size;
  const streak = useMemo(() => calculateStreak([...trainedDates], weeklyGoal), [trainedDates, weeklyGoal]);


  const handleNavigate = (view: ActiveView, workoutId?: string | null) => {
    if (studentIsInactive && ["treino", "nutricao", "corrida", "natacao", "ciclismo"].includes(view)) {
      toast({
        title: "Acesso aos treinos pausado",
        description: "Seu perfil continua disponível. Fale com sua equipe para reativar as prescrições.",
        variant: "destructive",
      });
      setActiveView("home");
      return;
    }
    if (view === "treino" && workoutId && !session.isActive) {
      setSelectedWorkoutId(workoutId);
      setExpandedExercise(null);
    }
    setActiveView(view);
  };

  const calendarDetail = calendarSelection?.kind === "resolved" ? calendarSelection : historicalWorkout.data;
  const handleCalendarSelectWorkout = (workoutId: string, historyDate?: string) => {
    if (studentIsInactive) return;
    if (historyDate) {
      setCalendarWorkout({ workoutId, date: historyDate });
      return;
    }
    if (!workoutUnavailable && !activeSessionWriteBlocked
      && (!session.isActive || activeSessionWorkoutId === workoutId)
      && selectedWorkoutCycle?.workouts.some(workout => workout.id === workoutId)) {
      handleNavigate("treino", workoutId);
    }
  };

  if (loading || loadedUserScope !== userScope) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError) {
    return <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6">
      <p>Não foi possível carregar seus dados. As informações estão indisponíveis.</p>
      <Button variant="outline" onClick={() => void loadStudentData()}>Tentar novamente</Button>
      <Button variant="ghost" onClick={signOut}>Sair</Button>
    </div>;
  }

  if (!studentId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground font-sans">Nenhum perfil de aluno vinculado à sua conta.</p>
          <Button variant="outline" onClick={signOut}><LogOut className="h-4 w-4 mr-2" />Sair</Button>
        </div>
      </div>
    );
  }

  const isSessionForCurrentWorkout = session.isActive && session.activeSession?.workoutId === selectedWorkout?.id;
  const canFinalizeHiddenSession = workoutUnavailable && expiredContinuation
    && !studentIsInactive && !preferredCyclePrescriptionCleared && isSessionForCurrentWorkout
    && activeWorkoutResolution.kind === "resolved"
    && activeWorkoutResolution.cycle.student_id === studentId
    && activeWorkoutResolution.cycle.company_id === companyId
    && !activeWorkoutResolution.cycle.prescription_cleared_at
    && !activeWorkoutResolution.cycle.superseded_by_cycle_id
    && activeWorkoutResolution.cycle.start_date <= todayStr;
  const prescriptionHistory = !studentIsInactive && user?.id && studentId && companyId ? <PublishedPrescriptionHistory key={`${user.id}:${studentId}:${companyId}`} userId={user.id} studentId={studentId} companyId={companyId} today={todayStr} /> : null;
  const currentPrescriptionUnderReview = hasDigitalContinuity && !expiredContinuation && coverage?.currentSlot?.state === "review";
  const pendingPrescriptionNotice = (
    <Card className="border-border bg-card">
      <CardContent className="space-y-3 p-5" role="status">
        <h2 className="font-semibold text-foreground">{currentPrescriptionUnderReview ? "Agenda em revisão" : coverage?.hasCurrentOfflinePrescription ? "Prescrição externa" : "Aguardando prescrição"}</h2>
        <p className="text-sm text-muted-foreground">{currentPrescriptionUnderReview ? "Há ciclos sobrepostos na agenda. Seu treino publicado segue disponível." : coverage?.hasCurrentOfflinePrescription ? "Sua equipe registrou uma prescrição externa ao aplicativo para este período. Consulte as orientações com sua equipe." : "Ainda não há treino publicado para o período atual. A existência de um ciclo na agenda não significa que o treino esteja pronto. Fale com sua equipe para acompanhar a prescrição."}</p>
        {expiredContinuation && prescriptionPolicy.loading && <p className="text-sm text-muted-foreground">Verificando a disponibilidade do seu último treino…</p>}
        {expiredContinuation && prescriptionPolicy.error && <div className="space-y-2" role="alert"><p className="text-sm">Não foi possível verificar a disponibilidade do seu último treino.</p><Button variant="outline" onClick={() => void prescriptionPolicy.retry()}>Verificar disponibilidade novamente</Button></div>}
        {hasDigitalContinuity && !currentPrescriptionUnderReview && <p className="text-sm font-medium">Seu último treino continua disponível até a próxima prescrição.</p>}
        {lastPublishedCycle && <p className="text-sm text-muted-foreground">Último treino publicado: ciclo {lastPublishedCycle.cycle_number}, válido até {format(parseISO(lastPublishedCycle.end_date), "dd/MM/yyyy")}.</p>}
        {prescriptionHistory}
        <Button variant="outline" onClick={() => setActiveView("calendario")}>Ver calendário e sessões</Button>
        {canFinalizeHiddenSession && !activeSessionWriteBlocked && <Button variant="outline" disabled={finishingWorkout} onClick={handleFinishSession}>Finalizar sessão em andamento</Button>}
        {session.isActive && !sessionNeedsReview && <Button variant="outline" onClick={handleAbandonSession}>Encerrar sessão ativa</Button>}
      </CardContent>
    </Card>
  );


  const hasCorrida = !preferredCyclePrescriptionCleared && cardioAvailability.data?.has("corrida");
  const hasNatacao = !preferredCyclePrescriptionCleared && cardioAvailability.data?.has("natacao");
  const hasCiclismo = !preferredCyclePrescriptionCleared && cardioAvailability.data?.has("ciclismo");

  const viewTitles: Record<ActiveView, string> = {
    home: "Meu treino",
    treino: "Treino",
    stats: "Estatísticas",
    calendario: "Calendário",
    atividades: "Atividades",
    avisos: "Avisos",
    medidas: "Medidas",
    nutricao: "Nutri",
    corrida: "Corrida",
    natacao: "Natação",
    ciclismo: "Ciclismo",
    integracoes: "Integrações",
  };


  const companyTheme = themeSettings?.company_id === companyId ? themeSettings : null;
  const isBn = companyId === "dad65c62-e700-4ae9-930a-43b18357c171"
    || /^bn performance training$/i.test(companyTheme?.platform_title?.trim() ?? "");
  const brandLogo = isBn ? bnMark : companyTheme?.logo_url;
  const emptyModality = (title: string) => (
    <Card className="border-border bg-card">
      <CardContent className="space-y-1 p-5" role="status">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">Quando sua equipe publicar uma prescrição, ela aparecerá aqui.</p>
      </CardContent>
    </Card>
  );

  const sectionError = (message: string, retry: () => unknown) => (
    <Card className="border-border bg-card">
      <CardContent className="flex flex-wrap items-center gap-3 p-4" role="alert">
        <p className="text-sm">{message}</p>
        <Button variant="outline" size="sm" onClick={() => void retry()}>Tentar novamente</Button>
      </CardContent>
    </Card>
  );
  const sessionReview = sessionNeedsReview ? (
    <Card className="border-amber-300 bg-card">
      <CardContent className="space-y-2 p-5" role="status">
        <h2 className="font-semibold">Sessão antiga em revisão</h2>
        <p className="text-sm">{sessionAlreadyCompleted
          ? "Já existe uma conclusão para a mesma ficha e data."
          : "A data original desta sessão não pôde ser confirmada."} Fale com sua equipe para revisar a sessão aberta e preservar as séries registradas.</p>
      </CardContent>
    </Card>
  ) : waitingForSessionLogs ? (
    resumedLogQuery.isError
      ? sectionError("Não foi possível carregar as séries do treino em andamento.", resumedLogQuery.refetch)
      : <p role="status" className="p-4 text-sm text-muted-foreground">Recuperando as séries do treino em andamento…</p>
  ) : null;
  const modalityContent = (query: typeof nutritionAvailability | typeof cardioAvailability, content: React.ReactNode) => {
    if (query.isError) return sectionError("Não foi possível carregar esta área.", query.refetch);
    if (query.isPending) return <p role="status" className="p-4 text-sm text-muted-foreground">Carregando esta área…</p>;
    return content;
  };
  const cardioContent = (content: React.ReactNode) =>
    preferredCyclePrescriptionCleared ? content : modalityContent(cardioAvailability, content);

  return (
    <AthleticClubProvider companyId={companyId}>
    <div className="student-linen min-h-dvh pt-2">
      <header className="student-linen-header student-linen-glass">
        {activeView !== "home" ? (
          <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-xl" onClick={() => handleNavigate("home")} aria-label="Voltar ao início" title="Voltar ao início">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        ) : brandLogo ? (
          <img src={brandLogo} alt={isBn ? "BN Performance Training" : companyTheme?.platform_title ?? "SETT"} className="h-11 w-11 shrink-0 object-contain" draggable={false} />
        ) : (
          <Dumbbell className="m-2.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[9px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">Portal do aluno</p>
          <h1 className="truncate text-[clamp(16px,4.5vw,22px)] font-bold leading-tight tracking-tight">{viewTitles[activeView]}</h1>
        </div>
        <div className="flex shrink-0 items-center">
          {companyId && <AnnouncementsBell studentId={studentId} companyId={companyId} />}
          <PersonalThemeIconToggle />
          <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl" onClick={signOut} aria-label="Sair" title="Sair">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="student-linen-main">
        {studentIsInactive && (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100" role="status">
            <div className="flex items-start gap-3">
              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Acesso aos treinos pausado</p>
                <p className="mt-1 text-sm opacity-85">Seu perfil continua disponível. Fale com sua equipe para reativar as prescrições.</p>
              </div>
            </div>
          </div>
        )}
        {/* Cycle renewal banner (above any view) */}
        {!studentIsInactive && studentId && companyId && enrollmentInfo && (
          <div className="mb-4">
            <CycleFeedbackBanner
              studentId={studentId}
              companyId={companyId}
              enrollmentId={activeEnrollmentId}
              enrollmentEndDate={enrollmentInfo.end_date}
              cycleId={selectedCycle?.id ?? null}
            />
          </div>
        )}

        <Suspense fallback={(
          <div className="flex min-h-40 items-center justify-center" role="status" aria-live="polite">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Carregando esta área…</span>
          </div>
        )}>
          <motion.div
            key={activeView}
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reducedMotion ? { duration: 0 } : studentSpring}
          >
        {/* HOME VIEW */}
        {activeView === "home" && (
          <div className="space-y-3">
          {contentLoading ? (
            <Card className="border-border bg-card">
              <CardContent className="flex min-h-40 items-center justify-center p-6" role="status" aria-live="polite">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Carregando seu treino…</span>
              </CardContent>
            </Card>
          ) : (
          <>
          {awaitingDigitalPrescription && pendingPrescriptionNotice}
          {session.isActive && (workoutUnavailable || !selectedCycle) && !studentIsInactive && (
            <Button onClick={() => handleNavigate("treino")}>Ver sessão em andamento</Button>
          )}
          <StudentHome
            nameBadge={<AthleticClubStar studentId={studentId} />}
            studentName={studentName}
            enrollmentInfo={enrollmentInfo}
            overallProgress={getOverallProgress()}
            selectedCycle={studentIsInactive || workoutUnavailable ? null : selectedWorkoutCycle}
            cycleProgress={selectedWorkoutCycle ? getCycleProgress(selectedWorkoutCycle) : 0}
            weeklySessionCount={weeklySessionCount}
            trainedDays={trainedDays}
            currentDayOfWeek={new Date().getDay()}
            totalSessions={totalSessions}
            weeklyGoal={weeklyGoal}
            streak={streak}
            activeWorkoutId={workoutUnavailable ? null : session.activeSession?.workoutId ?? null}
            goalEditor={studentId ? <WeeklyGoalEditor studentId={studentId} currentGoal={weeklyGoal} onSaved={setWeeklyGoal} /> : null}
            leaderboard={studentId ? <MonthlyLeaderboard companyId={companyId} /> : null}
            onNavigate={handleNavigate}
          />
          {!awaitingDigitalPrescription && prescriptionHistory}
          {user?.id && <PushBanner userId={user.id} companyId={companyId} />}
          <CheckinCard studentId={studentId} companyId={companyId} />
          <PlatformAdSlot audience="student" placement="dashboard_banner" companyId={companyId} />
          </>
          )}
          </div>
        )}

        {/* A barra é fixa. A disponibilidade continua seguindo a prescrição do aluno. */}
        {!studentIsInactive && activeView === "nutricao" && modalityContent(nutritionAvailability, nutritionAvailability.data ? <NutritionPlanView studentId={studentId} /> : emptyModality("Nenhuma dica nutricional publicada"))}
        {!studentIsInactive && activeView === "corrida" && cardioContent(hasCorrida ? <CardioPlanView studentId={studentId} sport="corrida" /> : emptyModality("Nenhum plano de corrida publicado"))}
        {!studentIsInactive && activeView === "natacao" && cardioContent(hasNatacao ? <CardioPlanView studentId={studentId} sport="natacao" /> : emptyModality("Nenhum plano de natação publicado"))}
        {!studentIsInactive && activeView === "ciclismo" && cardioContent(hasCiclismo ? <CardioPlanView studentId={studentId} sport="ciclismo" /> : emptyModality("Nenhum plano de ciclismo publicado"))}
        {activeView === "integracoes" && <WearableIntegrations />}


        {/* TREINO VIEW */}
        {activeView === "treino" && (
          <div className="space-y-6">
            {/* (seletor de ciclos removido — o ciclo atual já é mostrado abaixo) */}
            {(!selectedCycle || awaitingDigitalPrescription) && pendingPrescriptionNotice}
            {sessionReview}
            {selectedWorkoutCycle && !workoutUnavailable && !activeSessionWriteBlocked && (
              <div className="space-y-4">
                {exerciseMedia.isError && sectionError("Não foi possível carregar os vídeos da biblioteca.", exerciseMedia.refetch)}
                <Card className="bg-card border-border">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold tracking-tight text-foreground">Ciclo {selectedWorkoutCycle.cycle_number}</h2>
                      {selectedWorkoutCycle.start_date && selectedWorkoutCycle.end_date && (
                        <span className="text-xs text-muted-foreground font-sans">
                          {format(parseISO(selectedWorkoutCycle.start_date), "dd/MM", { locale: ptBR })} — {format(parseISO(selectedWorkoutCycle.end_date), "dd/MM", { locale: ptBR })}
                        </span>
                      )}
                    </div>
                    <Progress value={getCycleProgress(selectedCycle)} className="h-1.5" />
                  </CardContent>
                </Card>

                {hasUnresolvedActiveSession && (
                  <Card className="border-amber-300 bg-amber-50">
                    <CardContent className="space-y-3 p-5">
                      <Badge variant="outline" className="border-amber-300 text-amber-800">Sessão ativa</Badge>
                      <div className="space-y-1">
                        <h3 className="font-sans text-base font-semibold text-amber-950">Sessão ativa fora da ficha atual</h3>
                        <p className="font-sans text-sm leading-relaxed text-amber-900">
                          A sessão iniciada aponta para um treino que não está mais publicado na sua ficha. Para proteger seu histórico, o app não inicia outro treino por cima dela.
                        </p>
                      </div>
                      <Button variant="outline" className="w-full border-amber-300 bg-white/80 text-amber-900 hover:bg-white" onClick={handleAbandonSession}>
                        Encerrar sessão ativa
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {!hasUnresolvedActiveSession && (selectedWorkoutCycle.workouts.length > 0 ? (
                  <div className="space-y-3">
                    {selectedWorkout && hasWeeklyPrescriptions && (
                      <StudentWeekSelector
                        currentWeek={currentCycleWeek}
                        durationWeeks={selectedWorkoutCycle.duration_weeks}
                        selectedStartWeek={effectiveWeekStart}
                        hasWeeklyPrescriptions={hasWeeklyPrescriptions}
                        onChange={(week) => { setSelectedWeekStart(week); setExpandedExercise(null); }}
                        onBlocked={(message) => toast({ title: "Semana ainda não liberada", description: message, variant: "destructive" })}
                        compact
                      />
                    )}
                    {selectedWorkoutCycle.workouts.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {selectedWorkoutCycle.workouts.map((w, i) => (
                          <button
                            key={w.id}
                            type="button"
                            aria-pressed={selectedWorkout?.id === w.id}
                            disabled={session.isActive && selectedWorkout?.id !== w.id}
                            onClick={() => { setSelectedWorkoutId(w.id); setExpandedExercise(null); }}
                            className={`student-linen-control min-h-11 flex-1 whitespace-nowrap rounded-2xl px-4 py-2 text-sm font-medium transition-colors ${
                              selectedWorkout?.id === w.id
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                            }`}
                          >
                            Treino {getWorkoutLabel(i)}
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedWorkout && (
                      <>
                        <WorkoutTimer
                          isActive={isSessionForCurrentWorkout}
                          elapsed={session.elapsed}
                          formatTime={session.formatTime}
                          onStart={handleStartSession}
                          onFinish={handleFinishSession}
                          onAbandon={handleAbandonSession}
                          workoutTitle={selectedWorkout.title}
                          isFinishing={finishingWorkout}
                          startBlockedReason={startBlockedReason}
                          onResolveBlockedStart={() => setActiveView("treino")}
                        />

                        {/* A4 — resumo inline do treino em andamento (volume / séries / tempo) */}
                        {isSessionForCurrentWorkout && (() => {
                          const wId = selectedWorkout.id;
                          const setLogs = Object.values(logs).filter((l: any) => l.workout_id === wId);
                          const doneSets = setLogs.filter((l: any) => l.completed).length;
                          const totalPlanned = selectedWorkout.exercises.reduce((s, _e, i) => s + getTotalSets(i), 0);
                          const vol = setLogs.filter((l: any) => l.completed).reduce((s, l: any) => s + (Number(l.weight) || 0) * (Number(l.reps_done) || 0), 0);
                          return (
                            <div className="grid grid-cols-3 gap-2">
                              {([
                                ["Volume", vol >= 1000 ? `${(vol / 1000).toFixed(1)}t` : `${Math.round(vol)}kg`],
                                ["Séries", `${doneSets}/${totalPlanned}`],
                                ["Tempo", session.formatTime(session.elapsed)],
                              ] as const).map(([label, value]) => (
                                <div key={label} className="rounded-lg border border-border bg-card p-2 text-center">
                                  <p className="text-[10px] uppercase text-muted-foreground font-sans tracking-wide">{label}</p>
                                  <p className="text-sm font-mono-data font-semibold text-foreground">{value}</p>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <h3 className="min-w-0 break-words text-lg font-semibold leading-snug text-foreground font-sans">{selectedWorkout.title}</h3>
                          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0">
                            <Button size="sm" onClick={() => saveCurrentLogs()} disabled={savingLogs || finishingWorkout}>
                              <Save className="h-3.5 w-3.5 mr-1" />
                              {savingLogs ? "Salvando..." : "Salvar"}
                            </Button>
                          </div>
                        </div>

                        {(() => {
                          const workoutId = selectedWorkout.id;
                          const sessionDates = [...new Set(allLogs.filter(l => l.workout_id === workoutId).map(l => l.session_date))].sort();
                          const sessionCount = sessionDates.length;
                          const isNewSession = !sessionDates.includes(activeSessionDate);
                          const totalSessions = isNewSession ? sessionCount + 1 : sessionCount;
                          return (
                            <div className="flex items-center gap-3 flex-wrap">
                              <Badge variant="outline" className="gap-1.5 text-xs font-sans border-primary/30 text-primary">
                                <CalendarDays className="h-3 w-3" />
                                {format(parseISO(activeSessionDate), "dd/MM/yyyy")}
                              </Badge>
                              {sessionCount > 0 && (
                                <Badge variant="secondary" className="gap-1.5 text-xs font-sans">
                                  <History className="h-3 w-3" />
                                  {totalSessions}ª sessão
                                </Badge>
                              )}
                            </div>
                          );
                        })()}

                        <div className="space-y-2">
                          {(() => {
                            const workoutGroups = groupWorkoutExercises(selectedWorkout.exercises);
                            const firstGroupedKey = workoutGroups.find((group) => group.grouping)?.key;
                            let methodBlockNumber = 0;
                            return workoutGroups.map((grp) => {
                            const cards = grp.items.map(({ ex, idx }) => {
                              const media = exerciseMedia.data?.get(ex.exercise_id);
                              const exercise = media ? {
                                ...ex,
                                video_url: ex.video_url?.trim() || media.video_url,
                                video_path: ex.video_path?.trim() || media.video_path,
                                youtube_video_id: ex.youtube_video_id || media.youtube_video_id,
                                thumbnail_url: ex.thumbnail_url || media.thumbnail_url,
                              } : ex;
                              return <ExerciseCard
                              key={idx}
                              exercise={exercise}
                              index={idx}
                              workoutId={selectedWorkout.id}
                              isExpanded={expandedExercise === idx}
                              onToggle={() => setExpandedExercise(expandedExercise === idx ? null : idx)}
                              onVideoPlay={() => openVideoForExercise(exercise)}
                              logs={logs}
                              previousLogs={comparisonLogs}
                              onUpdateLog={updateLog}
                              exerciseHistory={getExerciseHistory(selectedWorkout.id, idx)}
                              isSessionActive={isSessionForCurrentWorkout}
                              activeRest={activeRest}
                              onSetComplete={startRest}
                              onRestComplete={clearRest}
                              totalSets={getTotalSets(idx)}
                              onAddSet={handleAddSet}
                              onRemoveSet={handleRemoveSet}
                            />;
                            });
                            if (grp.grouping) {
                              const meta = WORKOUT_METHODS[grp.method as MethodId];
                              const rounds = parseInt(String(grp.items[0]?.ex.sets ?? "")) || null;
                              const blockRest = grp.items[grp.items.length - 1]?.ex.rest;
                              const isCircuit = grp.method === "circuito";
                              methodBlockNumber += 1;
                              const groupInstruction = grp.items.find(({ ex }) => ex.weekly_instruction?.trim())?.ex.weekly_instruction || meta?.hint;
                              return (
                                <StudentMethodGroup
                                  key={grp.key}
                                  blockName={`Bloco ${methodBlockNumber}`}
                                  method={grp.method}
                                  instruction={groupInstruction}
                                  summary={isCircuit && rounds ? `×${rounds} voltas` : `${grp.items.length} exercícios em sequência`}
                                  defaultOpen={grp.key === firstGroupedKey}
                                  footer={blockRest ? (
                                    <div className="flex items-center gap-1.5 px-1 pb-0.5 text-[11px] text-muted-foreground">
                                      <Clock className="h-3 w-3" /> Descanso ao fim do bloco:
                                      <span className="font-medium text-foreground">{blockRest}</span>
                                    </div>
                                  ) : null}
                                >
                                  {cards}
                                </StudentMethodGroup>
                              );
                            }
                            return <Fragment key={grp.key}>{cards}</Fragment>;
                            });
                          })()}
                        </div>

                        <Button className="w-full" onClick={() => saveCurrentLogs()} disabled={savingLogs || finishingWorkout}>
                          <Save className="h-4 w-4 mr-2" />
                          {savingLogs ? "Salvando..." : "Salvar Todas as Cargas"}
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <Card className="bg-card border-border border-dashed">
                    <CardContent className="p-8 text-center">
                      <Clock className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground font-sans">Treino ainda não prescrito para este ciclo.</p>
                    </CardContent>
                  </Card>
                ))}

                <PeriodizationBanner
                  objective={selectedWorkoutCycle.objective}
                  durationWeeks={selectedWorkoutCycle.duration_weeks}
                  startDate={selectedWorkoutCycle.start_date}
                  endDate={selectedWorkoutCycle.end_date}
                  prescribedWeek={selectedWorkout?.weekly_context}
                />

                {trainedDays.size > 0 && (
                  <WeeklyBar
                    trainedDays={trainedDays}
                    currentDayOfWeek={new Date().getDay()}
                    weeklySessionCount={weeklySessionCount}
                    weeklyGoal={weeklyGoal}
                    streak={streak}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* STATS VIEW */}
        {activeView === "stats" && (
          <div className="space-y-4">
            {studentId && companyId && <VolumeInsights allLogs={allLogs} sessions={workoutSessions} studentId={studentId} companyId={companyId} todayStr={todayStr} />}
            {studentId && companyId && <StatsCharts studentId={studentId} companyId={companyId} allLogs={allLogs} sessions={workoutSessions} cycles={cycles} todayStr={todayStr} />}
            {studentId && totalSessions > 0 && (
              <AchievementsPanel studentId={studentId} />
            )}
          </div>
        )}

        {/* CALENDARIO VIEW */}
        {activeView === "calendario" && studentId && (
          <div className="space-y-6">
          {goalQuery.isError && sectionError("Não foi possível carregar as metas do calendário.", goalQuery.refetch)}
          <StudentCalendar
            allowHistoricalLookup={portalReady}
            workouts={cycles.flatMap(c => c.workouts)}
            availableWorkouts={studentIsInactive || workoutUnavailable || activeSessionWriteBlocked ? []
              : (selectedWorkoutCycle?.workouts ?? []).filter(workout => !session.isActive || workout.id === activeSessionWorkoutId)}
            trainedDays={trainedDays}
            currentDayOfWeek={new Date().getDay()}
            onSelectWorkout={handleCalendarSelectWorkout}
            allLogs={displayLogs}
            cycleStartDate={selectedCycle?.start_date}
            cycleEndDate={selectedCycle?.end_date}
            workoutSessions={workoutSessions}
            goals={goalQuery.data ?? []}
          />
          {calendarWorkout && portalReady && (
            <Dialog open onOpenChange={open => { if (!open) setCalendarWorkout(null); }}>
              <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{calendarDetail?.workout.title || "Ficha do treino"}</DialogTitle>
                  <DialogDescription>
                    {calendarDetail && `Ciclo ${calendarDetail.cycle.cycle_number} · `}
                    {format(parseISO(calendarWorkout.date), "dd/MM/yyyy")} · Somente consulta
                  </DialogDescription>
                </DialogHeader>
                {calendarDetail ? <PublishedWorkoutDetails workout={calendarDetail.workout} />
                  : historicalWorkout.isError ? sectionError("Não foi possível consultar esta ficha.", historicalWorkout.refetch)
                  : historicalWorkout.isPending ? <p role="status">Carregando a ficha…</p>
                  : <p>Esta ficha não está mais disponível para consulta.</p>}
              </DialogContent>
            </Dialog>
          )}
          {feedbackHistory.isError && sectionError("Não foi possível carregar os feedbacks do histórico.", feedbackHistory.refetch)}
          <StudentHistory
            allLogs={displayLogs}
            workouts={cycles.flatMap(c => c.workouts)}
            sessions={workoutSessions}
            feedbacks={[...(feedbackHistory.data ?? []), ...workoutFeedbacks.filter(item => !feedbackHistory.data?.some(row => row.id === item.id))]}
          />
          </div>
        )}

        {/* ATIVIDADES VIEW */}
        {activeView === "atividades" && studentId && companyId && (
          <ExternalActivitiesList studentId={studentId} companyId={companyId} />
        )}

        {/* AVISOS VIEW */}
        {activeView === "avisos" && studentId && companyId && (
          <AnnouncementsFeed studentId={studentId} companyId={companyId} />
        )}

        {/* MEDIDAS VIEW */}
        {activeView === "medidas" && studentId && companyId && (
          <BodyMeasurements
            studentId={studentId}
            companyId={companyId}
            gender={gender}
            onGenderChange={setGender}
          />
        )}
          </motion.div>
        </Suspense>
        <PlatformAdSlot audience="student" placement="footer" companyId={companyId} className="mt-8" />
      </main>
      <StudentPortalNavigation activeView={activeView} onNavigate={handleNavigate} reducedMotion={reducedMotion} />

      {/* Feedback pós-treino: app como fonte de verdade, WhatsApp apenas como aviso opcional. */}
      <Dialog open={feedbackOpen} onOpenChange={(o) => { if (!o) setFeedbackOpen(false); }}>
        <DialogContent className="bg-card border-border max-w-sm max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary">{feedbackDefinition?.definition.title??'Como foi o treino?'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Sua resposta fica registrada no painel da equipe. WhatsApp é só um aviso extra quando estiver conectado.</p>
            {!feedbackDefinitionLoaded?<p className="text-sm text-muted-foreground">Carregando formulario...</p>:feedbackDefinitionError?<p role="alert" className="text-sm text-destructive">{feedbackDefinitionError}</p>:feedbackDefinition?<VersionedFormFields definition={feedbackDefinition.definition} answers={feedbackInstrumentAnswers} onChange={(key,value)=>{setFeedbackInstrumentAnswers(a=>({...a,[key]:value}));if(key==='perception')setFeedbackRating(typeof value==='string'&&value?value:null);if(key==='reflection')setFeedbackText(String(value??''));}} />:<>
            <p className="text-sm font-medium text-foreground">Qual foi sua percepção geral?</p>
            <div className="flex gap-2">
              {[{ e: "😮‍💨", l: "Difícil" }, { e: "👍", l: "Bom" }, { e: "🔥", l: "Ótimo" }].map((o) => (
                <button
                  key={o.l} type="button" onClick={() => setFeedbackRating(o.l)}
                  className={cn(
                    "flex-1 rounded-lg border p-2 text-sm transition-colors",
                    feedbackRating === o.l ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <span className="block text-xl">{o.e}</span>{o.l}
                </button>
              ))}
            </div>
            <Textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="O que você quer que seu treinador saiba? (opcional)"
              className="min-h-[90px]"
            />
            </>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setFeedbackOpen(false)} disabled={sendingFeedback}>Pular</Button>
              <Button className="flex-1" onClick={sendWorkoutFeedback} disabled={sendingFeedback || !feedbackDefinitionLoaded || !!feedbackDefinitionError || (!feedbackRating && !feedbackText.trim())}>
                {sendingFeedback ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar ao treinador"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Video Modal */}
      <Dialog open={!!videoModal} onOpenChange={(open) => { if (!open) closeVideo(); }}>
        <DialogContent className="bg-card border-border max-w-lg sm:max-w-2xl p-2 sm:p-4">
          <DialogHeader>
            <DialogTitle className="pr-8 text-left text-base leading-snug text-primary break-words">
              {videoModal?.title || "Demonstração do exercício"}
            </DialogTitle>
          </DialogHeader>
          {videoModal && (
            <ExerciseVideoPlayer video={videoModal} />
          )}
        </DialogContent>
      </Dialog>

      {/* Workout Summary Modal */}
      {session.summary && (
        <WorkoutSummary
          open={!!session.summary}
          onClose={session.clearSummary}
          durationSeconds={session.summary.durationSeconds}
          totalVolume={session.summary.totalVolume}
          totalSetsCompleted={session.summary.totalSetsCompleted}
          totalSetsPrescribed={session.summary.totalSetsPrescribed}
          exercises={session.summary.exercisesSummary}
          formatTime={session.formatTime}
          onFeedback={() => setFeedbackOpen(true)}
        />
      )}

    </div>
    </AthleticClubProvider>
  );
}
