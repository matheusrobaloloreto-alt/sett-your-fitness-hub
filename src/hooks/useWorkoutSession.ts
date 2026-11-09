import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { awardCompanyXp } from '@/lib/gamification';
import { toast } from 'sonner';
import { calculateSessionMetrics, type SessionLog, type ExerciseSummaryItem } from '@/lib/sessions/metrics';
export type { ExerciseSummaryItem } from '@/lib/sessions/metrics';

interface ActiveSession {
  id: string;
  workoutId: string;
  startedAt: number; // timestamp ms
  companyId?: string;
  sessionDate?: string;
  elapsedSeconds: number;
}

export interface SessionSummary {
  id: string;
  workoutId: string;
  completedAt: string;
  durationSeconds: number;
  totalVolume: number;
  totalSetsCompleted: number;
  totalSetsPrescribed: number;
  totalExtraSetsCompleted?: number;
  exercisesSummary: ExerciseSummaryItem[];
}

export type SessionOperationResult<T> = {ok:true; value:T} | {ok:false; reason:'busy'|'context'|'conflict'|'unavailable'|'storage'|'invalid_metrics'|'duplicate_open_sessions'};

interface WorkoutSessionOptions {
  discoverRemote?: boolean;
}

function readSessionDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const date = new Date(value);
  if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value) return value;
}

const STORAGE_KEY = (studentId: string) => `sett_active_session_${studentId}`;

function clearStoredSession(studentId:string,expectedId:string) {
  try {
    const raw=localStorage.getItem(STORAGE_KEY(studentId));
    if(raw && JSON.parse(raw).id===expectedId) localStorage.removeItem(STORAGE_KEY(studentId));
  } catch { /* An acknowledged remote transition does not authorize deleting another session. */ }
}

async function recoverPendingStart(
  studentId: string, companyId: string, workoutId: string, requestId: string, terminalId: string | null,
): Promise<{ active: ActiveSession | null } | null> {
  const { data, error } = await supabase.rpc("retire_terminal_workout_start", {
    _student_id: studentId, _company_id: companyId, _workout_id: workoutId,
    _request_id: requestId, _session_id: terminalId,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  if (data.state === "retired") return { active: null };
  const row = data.state === "active" ? data.session : null;
  if (!row || typeof row !== "object" || Array.isArray(row)
    || row.student_id !== studentId || row.company_id !== companyId || row.workout_id !== workoutId
    || typeof row.id !== "string" || typeof row.started_at !== "string") return null;
  const startedAt = Date.parse(row.started_at);
  if (!Number.isFinite(startedAt)) return null;
  const sessionDate = readSessionDate(row.session_date);
  return { active: { id: row.id, workoutId, companyId, startedAt, elapsedSeconds: 0, ...(sessionDate && { sessionDate }) } };
}

export function useWorkoutSession(
  studentId: string | null,
  companyId: string | null,
  { discoverRemote = false }: WorkoutSessionOptions = {},
) {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [remoteSessionId, setRemoteSessionId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const operationRef = useRef(false);
  const activeRef = useRef(activeSession);
  activeRef.current = activeSession;
  const context = `${studentId}:${companyId}`;
  const contextRef = useRef(context);
  contextRef.current = context;
  const finishingRef = useRef(false); // A9 — evita conceder XP em dobro (double-click / corrida com autosave).

  const discoveryVersion = useRef(0);
  const discoveryEnabledRef = useRef(discoverRemote);
  discoveryEnabledRef.current = discoverRemote;

  const discoverActiveSession = useCallback(async (duringStart = false) => {
    if (!discoverRemote || !discoveryEnabledRef.current || !studentId || !companyId
      || contextRef.current !== context || operationRef.current !== duringStart || activeRef.current) return;
    const version = ++discoveryVersion.current;
    const key = STORAGE_KEY(studentId);
    try {
      const stored = localStorage.getItem(key);
      const { data, error } = await supabase.from("workout_sessions")
        .select("id,student_id,company_id,workout_id,started_at,status,session_date")
        .eq("student_id", studentId)
        .eq("company_id", companyId)
        .eq("status", "in_progress")
        .limit(2);
      if (error || !Array.isArray(data) || data.length !== 1) return;
      const [row] = data;
      if (!row || row.student_id !== studentId || row.company_id !== companyId || row.status !== "in_progress"
        || typeof row.id !== "string" || !row.id.trim() || typeof row.workout_id !== "string" || !row.workout_id.trim()
        || typeof row.started_at !== "string") return;
      const startedAt = Date.parse(row.started_at);
      if (!Number.isFinite(startedAt)) return;
      if (version !== discoveryVersion.current || contextRef.current !== context || !discoveryEnabledRef.current
        || operationRef.current !== duringStart || activeRef.current || localStorage.getItem(key) !== stored
        || (stored && JSON.parse(stored)?.id !== row.id)) return;

      const sessionDate = readSessionDate(row.session_date);
      const discovered: ActiveSession = {
        id: row.id, workoutId: row.workout_id, companyId, startedAt, elapsedSeconds: 0,
        ...(sessionDate && { sessionDate }),
      };
      localStorage.setItem(key, JSON.stringify(discovered));
      activeRef.current = discovered;
      finishingRef.current = false;
      setRemoteSessionId(discovered.id);
      setActiveSession(discovered);
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    } catch { /* Preserve local state and pending requests when discovery is unavailable. */ }
  }, [studentId, companyId, context, discoverRemote]);

  useEffect(() => () => { discoveryVersion.current += 1; }, [context, discoverRemote]);

  // Restore from localStorage
  useEffect(() => {
    setIsHydrated(false);
    activeRef.current=null;
    setSummary(null);
    setRemoteSessionId(null);
    if (!studentId) {
      setActiveSession(null);
      setIsHydrated(true);
      return;
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY(studentId));
      if (stored) {
        const parsed: ActiveSession = JSON.parse(stored);
        if(parsed.companyId && parsed.companyId!==companyId) throw new Error('Different company');
        if (parsed.sessionDate !== undefined) parsed.sessionDate = readSessionDate(parsed.sessionDate);
        activeRef.current=parsed;
        setActiveSession(parsed);
        const now = Date.now();
        const newElapsed = Math.floor((now - parsed.startedAt) / 1000);
        setElapsed(newElapsed);
      } else {
        setActiveSession(null);
        setElapsed(0);
      }
    } catch {
      setActiveSession(null);
      setElapsed(0);
    } finally {
      setIsHydrated(true);
    }
  }, [studentId,companyId]);

  useEffect(()=>{
    const sync=(event:StorageEvent)=>{
      if(!studentId || event.key!==STORAGE_KEY(studentId))return;
      try {
        const session:ActiveSession|null=event.newValue ? JSON.parse(event.newValue) : null;
        if(!session && event.oldValue && JSON.parse(event.oldValue).id!==activeRef.current?.id)return;
        if(session?.companyId && session.companyId!==companyId)return;
        if (session && session.sessionDate !== undefined) session.sessionDate = readSessionDate(session.sessionDate);
        discoveryVersion.current += 1;
        activeRef.current=session;setActiveSession(session);setElapsed(session?Math.max(0,Math.floor((Date.now()-session.startedAt)/1000)):0);
      } catch { /* Corrupt cross-tab storage cannot acknowledge a transition. */ }
    };
    window.addEventListener('storage',sync);return ()=>window.removeEventListener('storage',sync);
  },[studentId,companyId]);

  useEffect(() => {
    if (!studentId || !companyId || (!activeSession && !discoverRemote)) return;
    let cancelled = false;
    const reconcileSession = async () => {
      if (!activeSession) {
        await discoverActiveSession();
        return;
      }
      const { id, workoutId } = activeSession;
      const version = discoveryVersion.current;
      const stale = () => cancelled || contextRef.current !== context || (discoverRemote
        && (version !== discoveryVersion.current || operationRef.current || activeRef.current?.id !== id));
      if (stale()) return;
      try {
        const { data, error } = await supabase.from("workout_sessions").select("id,status")
          .eq("id", id).eq("student_id", studentId).eq("company_id", companyId)
          .eq("workout_id", workoutId).maybeSingle();
        if (stale() || error || data?.id !== id
          || !["completed", "abandoned", "reconciled"].includes(data.status ?? "")) return;
        const pendingKey = `sett_session_start_${companyId}_${studentId}`;
        const storedPending = localStorage.getItem(pendingKey);
        const pending = storedPending ? JSON.parse(storedPending) : null;
        if (pending?.workoutId === workoutId && typeof pending.requestId === "string") {
          const recovered = await recoverPendingStart(studentId, companyId, workoutId, pending.requestId, id);
          if (stale() || !recovered || activeRef.current?.id !== id
            || localStorage.getItem(pendingKey) !== storedPending) return;
          if (recovered.active) {
            const current = localStorage.getItem(STORAGE_KEY(studentId));
            if (current && JSON.parse(current).id !== id) return;
            localStorage.setItem(STORAGE_KEY(studentId), JSON.stringify(recovered.active));
            activeRef.current = recovered.active;
            setActiveSession(recovered.active);
            setElapsed(Math.max(0, Math.floor((Date.now() - recovered.active.startedAt) / 1000)));
            finishingRef.current = false;
            localStorage.removeItem(pendingKey);
            return;
          }
          localStorage.removeItem(pendingKey);
        }
        clearStoredSession(studentId, id);
        if (contextRef.current === context && activeRef.current?.id === id) {
          activeRef.current = null;
          setActiveSession(null);
          setElapsed(0);
        }
      } catch { /* Keep the local session until a server response confirms the terminal state. */ }
    };
    const reconcileVisibleSession = () => {
      if (document.visibilityState === "visible") void reconcileSession();
    };
    void reconcileSession();
    window.addEventListener("focus", reconcileSession);
    if (discoverRemote) document.addEventListener("visibilitychange", reconcileVisibleSession);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", reconcileSession);
      if (discoverRemote) document.removeEventListener("visibilitychange", reconcileVisibleSession);
    };
  }, [activeSession, companyId, context, studentId, discoverRemote, discoverActiveSession]);

  // Timer tick
  useEffect(() => {
    if (activeSession) {
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        setElapsed(Math.max(0, Math.floor((now - activeSession.startedAt) / 1000)));
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeSession]);

  const startSession = useCallback(async (workoutId: string):Promise<SessionOperationResult<ActiveSession>> => {
    if (!studentId || !companyId) return {ok:false,reason:'context'};
    if(operationRef.current) return {ok:false,reason:'busy'};
    if(activeRef.current && activeRef.current.workoutId!==workoutId) return {ok:false,reason:'conflict'};
    operationRef.current=true;
    discoveryVersion.current += 1;
    const pendingKey=`sett_session_start_${companyId}_${studentId}`;
    let requestId:string;
    try {
      const stored=localStorage.getItem(pendingKey);
      let pending=stored ? JSON.parse(stored) : null;
      if (pending && pending.workoutId !== workoutId) {
        if (typeof pending.workoutId !== "string" || typeof pending.requestId !== "string") {
          operationRef.current=false;
          return {ok:false,reason:'storage'};
        }
        const recovered = await recoverPendingStart(studentId, companyId, pending.workoutId, pending.requestId, null);
        if (!recovered || contextRef.current !== context || localStorage.getItem(pendingKey) !== stored) {
          operationRef.current=false;
          return {ok:false,reason:'conflict'};
        }
        if (recovered.active) {
          const current = localStorage.getItem(STORAGE_KEY(studentId));
          if (!current || JSON.parse(current).id === recovered.active.id) {
            localStorage.setItem(STORAGE_KEY(studentId), JSON.stringify(recovered.active));
            activeRef.current = recovered.active;
            setActiveSession(recovered.active);
            setElapsed(Math.max(0, Math.floor((Date.now() - recovered.active.startedAt) / 1000)));
            finishingRef.current = false;
            localStorage.removeItem(pendingKey);
          }
          operationRef.current=false;
          return {ok:false,reason:'conflict'};
        }
        localStorage.removeItem(pendingKey);
        pending=null;
      }
      requestId=pending?.requestId || crypto.randomUUID();
      localStorage.setItem(pendingKey,JSON.stringify({requestId,workoutId}));
    } catch {operationRef.current=false;return {ok:false,reason:'storage'};}
    try {
      // New RPC is mandatory: no unsafe insert fallback when migration is absent.
      const {data,error}=await (supabase.rpc as unknown as (name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>)('start_workout_session',{_student_id:studentId,_company_id:companyId,_workout_id:workoutId,_request_id:requestId});
      if (error && typeof error === 'object' && 'code' in error && error.code === 'PT409'
        && 'message' in error && (error.message === 'session_legacy_ambiguous' || error.message === 'session_already_in_progress' || error.message === 'session_request_retired' || error.message === 'session_workout_no_longer_published')) {
        // These definitive refusals are raised after receipt lookup and before any insert.
        // An uncertain network result still retains the request ID for replay.
        const current = localStorage.getItem(pendingKey);
        if (current && JSON.parse(current).requestId === requestId) localStorage.removeItem(pendingKey);
        if (error.message === "session_already_in_progress") await discoverActiveSession(true);
        return { ok: false, reason: error.message === 'session_legacy_ambiguous' ? 'duplicate_open_sessions' : 'conflict' };
      }
      if(error || !data) return {ok:false,reason:error && typeof error==='object' && 'code' in error && error.code==='PT409' ? 'conflict' : 'unavailable'};
      const row=data as {id:string;workout_id:string;student_id:string;company_id:string;started_at:string;status:string;session_date?:unknown};
      if(row.student_id!==studentId || row.company_id!==companyId || row.workout_id!==workoutId) return {ok:false,reason:'conflict'};
      if(row.status!=='in_progress') {
        // A receipt remains bound forever. A terminal replay is a conflict,
        // never a new start; release only this acknowledged pending intent.
        if(row.status==='completed' || row.status==='abandoned' || row.status==='reconciled') localStorage.removeItem(pendingKey);
        return {ok:false,reason:'conflict'};
      }
      const startedAt=Date.parse(row.started_at);
      if(!row.id || !Number.isFinite(startedAt)) return {ok:false,reason:'unavailable'};
      const sessionDate = readSessionDate(row.session_date);
      const session:ActiveSession={id:row.id,workoutId,companyId,startedAt,elapsedSeconds:0,...(sessionDate && { sessionDate })};
      const existing=localStorage.getItem(STORAGE_KEY(studentId));
      if(existing && JSON.parse(existing).id!==session.id) return {ok:false,reason:'conflict'};
      localStorage.setItem(STORAGE_KEY(studentId),JSON.stringify(session));
      localStorage.removeItem(pendingKey);
      if(contextRef.current===context){activeRef.current=session;setActiveSession(session);setElapsed(Math.max(0,Math.floor((Date.now()-startedAt)/1000)));finishingRef.current=false;}
      return contextRef.current===context ? {ok:true,value:session} : {ok:false,reason:'context'};
    } catch {return {ok:false,reason:'unavailable'};}
    finally {operationRef.current=false;}
  }, [studentId,companyId,context,discoverActiveSession]);

  const finishSessionResult = useCallback(async (
    logs: Record<string, SessionLog>,
    exercises: { exercise_name: string; muscle_group: string; sets: string }[],
    previousBestWeights: Record<string, number>,
    unknownPreviousExercises: ReadonlySet<number> = new Set<number>()
  ):Promise<SessionOperationResult<SessionSummary>> => {
    if (!activeSession || !activeRef.current || activeSession.id!==activeRef.current.id || !studentId || !companyId) return {ok:false,reason:'context'};
    if(finishingRef.current || operationRef.current) return {ok:false,reason:'busy'};
    operationRef.current=true;
    discoveryVersion.current += 1;
    finishingRef.current = true; // A9 — trava reentrância: só um award_xp por sessão.

    try {
    const now = Date.now();
    const completedAt = new Date(now).toISOString();
    const durationSeconds = Math.max(0,Math.floor((now - activeSession.startedAt) / 1000));

    let metrics:ReturnType<typeof calculateSessionMetrics>;
    try {metrics=calculateSessionMetrics(activeSession.workoutId,logs,exercises,previousBestWeights,unknownPreviousExercises);}
    catch {return {ok:false,reason:'invalid_metrics'};}
    const {exercisesSummary,totalVolume,totalSetsCompleted,totalSetsPrescribed,totalExtraSetsCompleted}=metrics;

    const completionPayload = {
      completed_at: completedAt,
      duration_seconds: durationSeconds,
      total_volume: totalVolume,
      total_sets_completed: totalSetsCompleted,
      total_sets_prescribed: totalSetsPrescribed,
      status: "completed",
      exercises_summary: JSON.parse(JSON.stringify(exercisesSummary)),
    };
    let persistedResult:SessionSummary|null=null;
    let completedRow: { id: string } | null = null;
    let completionReason: 'conflict'|'unavailable'='conflict';
    for (let attempt = 0; attempt < 3 && !completedRow; attempt += 1) {
      const response = await supabase
        .from("workout_sessions")
        .update(completionPayload)
        .eq("id", activeSession.id)
        .eq("student_id", studentId)
        .eq("company_id", companyId)
        .eq("status", "in_progress")
        .select("id")
        .maybeSingle();
      if (!response.error && response.data?.id === activeSession.id) {
        completedRow = response.data;
        break;
      }
      completionReason=response.error && response.error.code!=='PT409' ? 'unavailable' : 'conflict';
      // A timeout can happen after Supabase committed the update. Confirm the
      // final state before trying again, avoiding a false error to the student.
      const confirmation = await supabase
        .from("workout_sessions")
        .select("*")
        .eq("id", activeSession.id)
        .eq("student_id", studentId)
        .eq("company_id", companyId)
        .eq("status", "completed")
        .maybeSingle();
      if (!confirmation.error && confirmation.data?.id === activeSession.id && confirmation.data.workout_id===activeSession.workoutId && confirmation.data.completed_at && Array.isArray(confirmation.data.exercises_summary)) {
        const row=confirmation.data;
        persistedResult={id:row.id,workoutId:activeSession.workoutId,completedAt:row.completed_at!,durationSeconds:row.duration_seconds??0,totalVolume:Number(row.total_volume??0),totalSetsCompleted:row.total_sets_completed??0,totalSetsPrescribed:row.total_sets_prescribed??0,exercisesSummary:row.exercises_summary as unknown as ExerciseSummaryItem[]};
        completedRow = row;
        break;
      }
      // Zero rows without a transport error is a real guarded-write conflict,
      // not a flaky connection. Keep the local session open for the student.
      if (!response.error) break;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }

    if (!completedRow || completedRow.id !== activeSession.id) {
      finishingRef.current = false;
      operationRef.current = false;
      return {ok:false,reason:completionReason};
    }

    const result: SessionSummary = persistedResult ?? {
      id: activeSession.id,
      workoutId: activeSession.workoutId,
      completedAt,
      durationSeconds,
      totalVolume,
      totalSetsCompleted,
      totalSetsPrescribed,
      totalExtraSetsCompleted,
      exercisesSummary,
    };

    if(contextRef.current!==context) return {ok:false,reason:'context'};
    setSummary(result);
    if(activeRef.current?.id===activeSession.id){
      activeRef.current=null;setActiveSession(null);setElapsed(0);
    }
    clearStoredSession(studentId,activeSession.id);

    finishingRef.current = false;
    operationRef.current = false;
    // Completion is already confirmed; gamification must not keep its timer open.
    if(result.totalSetsCompleted>0) void (async () => {
      try {
        await awardCompanyXp(studentId, 'workout', result.id);
        const { error } = await supabase.rpc("check_and_unlock_achievements", { _student_id: studentId });
        if (error) throw error;
      } catch (e) {
        console.warn("XP/achievements grant failed", e);
        toast.error('Treino salvo. Nao foi possivel atualizar os pontos agora.');
      }
    })();
    return {ok:true,value:result};
    } catch {return {ok:false,reason:'unavailable'};}
    finally {finishingRef.current=false;operationRef.current=false;}
  }, [activeSession, studentId,companyId,context]);


  // Compatibility adapter for existing Portal consumers. New integrations should
  // use finishSessionResult and distinguish conflicts, connectivity and invalid data.
  const finishSession=useCallback(async (...args:Parameters<typeof finishSessionResult>)=>{
    const result=await finishSessionResult(...args);return result.ok ? result.value : null;
  },[finishSessionResult]);

  const abandonSession = useCallback(async ():Promise<SessionOperationResult<{id:string}>> => {
    const session=activeRef.current;
    if(!session || !studentId || !companyId) return {ok:false,reason:'context'};
    if(operationRef.current) return {ok:false,reason:'busy'};
    operationRef.current=true;
    discoveryVersion.current += 1;
    try {
      let acknowledged=false;
      let failureReason:'conflict'|'unavailable'='conflict';
      try {
        const {data,error}=await supabase.from('workout_sessions').update({status:'abandoned',completed_at:new Date().toISOString()}).eq('id',session.id).eq('student_id',studentId).eq('company_id',companyId).eq('status','in_progress').select('id').maybeSingle();
        acknowledged=!error && data?.id===session.id;
        if(error) failureReason='unavailable';
      } catch {failureReason='unavailable';}
      if(!acknowledged) {
        // A lost ACK may hide an already committed transition. Read once; never
        // resend a terminal write or reinterpret a completion as abandonment.
        const {data,error}=await supabase.from('workout_sessions')
          .select('id,student_id,company_id,workout_id,status')
          .eq('id',session.id).eq('student_id',studentId)
          .eq('company_id',companyId).eq('workout_id',session.workoutId).maybeSingle();
        if(error) return {ok:false,reason:'unavailable'};
        if(!data) return {ok:false,reason:failureReason};
        if(data.id!==session.id || data.student_id!==studentId || data.company_id!==companyId || data.workout_id!==session.workoutId) return {ok:false,reason:'conflict'};
        if(data.status!=='abandoned') return {ok:false,reason:data.status==='completed'?'conflict':failureReason};
      }
      if(contextRef.current===context && activeRef.current?.id===session.id){activeRef.current=null;setActiveSession(null);setElapsed(0);}
      clearStoredSession(studentId,session.id);
      return contextRef.current===context ? {ok:true,value:{id:session.id}} : {ok:false,reason:'context'};
    } catch {return {ok:false,reason:'unavailable'};}
    finally {operationRef.current=false;}
  }, [studentId,companyId,context]);

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
    isHydrated,
    isRemoteSession: !!activeSession && remoteSessionId === activeSession.id,
    elapsed,
    summary,
    startSession,
    finishSession,
    finishSessionResult,
    abandonSession,
    clearSummary,
    formatTime,
    isActive: !!activeSession,
  };
}
