import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ActiveSession {
  id: string;
  workoutId: string;
  startedAt: number; // timestamp ms
  elapsedSeconds: number;
}

interface SessionSummary {
  id: string;
  durationSeconds: number;
  totalVolume: number;
  totalSetsCompleted: number;
  totalSetsPrescribed: number;
  exercisesSummary: ExerciseSummaryItem[];
}

export interface ExerciseSummaryItem {
  name: string;
  muscleGroup: string;
  sets: { weight: number; reps: number }[];
  maxWeight: number;
  volume: number;
  isPR: boolean;
}

const STORAGE_KEY = (studentId: string) => `sett_active_session_${studentId}`;

export function useWorkoutSession(studentId: string | null, companyId: string | null) {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Restore from localStorage
  useEffect(() => {
    if (!studentId) return;
    const stored = localStorage.getItem(STORAGE_KEY(studentId));
    if (stored) {
      try {
        const parsed: ActiveSession = JSON.parse(stored);
        setActiveSession(parsed);
        const now = Date.now();
        const newElapsed = Math.floor((now - parsed.startedAt) / 1000);
        setElapsed(newElapsed);
      } catch { /* ignore */ }
    }
  }, [studentId]);

  // Timer tick
  useEffect(() => {
    if (activeSession) {
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        setElapsed(Math.floor((now - activeSession.startedAt) / 1000));
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeSession]);

  const startSession = useCallback(async (workoutId: string) => {
    if (!studentId) return;
    const now = Date.now();
    
    const { data, error } = await supabase
      .from("workout_sessions")
      .insert({
        student_id: studentId,
        workout_id: workoutId,
        company_id: companyId,
        started_at: new Date(now).toISOString(),
        status: "in_progress",
      })
      .select("id")
      .single();

    if (error || !data) return;

    const session: ActiveSession = {
      id: data.id,
      workoutId,
      startedAt: now,
      elapsedSeconds: 0,
    };
    setActiveSession(session);
    setElapsed(0);
    localStorage.setItem(STORAGE_KEY(studentId), JSON.stringify(session));
  }, [studentId, companyId]);

  const finishSession = useCallback(async (
    logs: Record<string, { weight: number; reps_done: number; workout_id: string; exercise_index: number; set_number: number; set_type?: string; rpe?: number; completed?: boolean }>,
    exercises: { exercise_name: string; muscle_group: string; sets: string }[],
    previousBestWeights: Record<string, number>
  ) => {
    if (!activeSession || !studentId) return null;

    const now = Date.now();
    const durationSeconds = Math.floor((now - activeSession.startedAt) / 1000);

    // Calculate summary
    const exercisesSummary: ExerciseSummaryItem[] = exercises.map((ex, idx) => {
      const numSets = parseInt(ex.sets) || 3;
      const sets: { weight: number; reps: number }[] = [];
      let maxWeight = 0;
      let volume = 0;

      for (let s = 1; s <= numSets; s++) {
        const key = `${activeSession.workoutId}-${idx}-${s}`;
        const log = logs[key];
        const w = log?.weight || 0;
        const r = log?.reps_done || 0;
        sets.push({ weight: w, reps: r });
        if (w > maxWeight) maxWeight = w;
        volume += w * r;
      }

      const prevBest = previousBestWeights[`ex-${idx}`] || 0;
      const isPR = maxWeight > prevBest && maxWeight > 0;

      return {
        name: ex.exercise_name,
        muscleGroup: ex.muscle_group,
        sets,
        maxWeight,
        volume,
        isPR,
      };
    });

    const totalVolume = exercisesSummary.reduce((sum, ex) => sum + ex.volume, 0);
    const totalSetsCompleted = exercisesSummary.reduce((sum, ex) => sum + ex.sets.filter(s => s.weight > 0 || s.reps > 0).length, 0);
    const totalSetsPrescribed = exercises.reduce((sum, ex) => sum + (parseInt(ex.sets) || 3), 0);

    await supabase
      .from("workout_sessions")
      .update({
        completed_at: new Date(now).toISOString(),
        duration_seconds: durationSeconds,
        total_volume: totalVolume,
        total_sets_completed: totalSetsCompleted,
        total_sets_prescribed: totalSetsPrescribed,
        status: "completed",
        exercises_summary: exercisesSummary as any,
      })
      .eq("id", activeSession.id);

    // Gamification: award XP and check achievements (best-effort, non-blocking failures)
    try {
      await supabase.rpc("award_xp", {
        _student_id: studentId,
        _event_type: "workout",
        _xp_amount: 50,
        _source_id: activeSession.id,
        _notes: null,
      });
      await supabase.rpc("check_and_unlock_achievements", { _student_id: studentId });
    } catch (e) {
      console.warn("XP/achievements grant failed", e);
    }

    const result: SessionSummary = {
      id: activeSession.id,
      durationSeconds,
      totalVolume,
      totalSetsCompleted,
      totalSetsPrescribed,
      exercisesSummary,
    };

    setSummary(result);
    setActiveSession(null);
    setElapsed(0);
    localStorage.removeItem(STORAGE_KEY(studentId));

    return result;
  }, [activeSession, studentId]);


  const abandonSession = useCallback(async () => {
    if (!activeSession || !studentId) return;

    await supabase
      .from("workout_sessions")
      .update({ status: "abandoned", completed_at: new Date().toISOString() })
      .eq("id", activeSession.id);

    setActiveSession(null);
    setElapsed(0);
    localStorage.removeItem(STORAGE_KEY(studentId));
  }, [activeSession, studentId]);

  const clearSummary = useCallback(() => setSummary(null), []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return {
    activeSession,
    elapsed,
    summary,
    startSession,
    finishSession,
    abandonSession,
    clearSummary,
    formatTime,
    isActive: !!activeSession,
  };
}
