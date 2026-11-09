import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Trophy } from "lucide-react";
import { addWeeks, format, subDays } from "date-fns";
import { StudentHome } from "../src/components/student/StudentHome";
import "../src/index.css";

function Fixture() {
  const [destination, setDestination] = useState("home");
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const today = new Date();
  const cycleStart = subDays(today, 8);
  return (
    <main className="mx-auto min-h-screen max-w-md bg-background p-4">
      <p data-destination={destination} data-workout-id={workoutId} className="sr-only">{destination}</p>
      <StudentHome
        studentName="Marina Sintética"
        enrollmentInfo={{ plan_name: "Plano teste", start_date: "2026-08-01", end_date: "2026-12-01" }}
        overallProgress={24}
        selectedCycle={{
          id: "cycle-synthetic",
          cycle_number: 3,
          start_date: format(cycleStart, "yyyy-MM-dd"),
          end_date: format(addWeeks(cycleStart, 4), "yyyy-MM-dd"),
          status: "active",
          duration_weeks: 4,
          workouts: [{ id: "workout-a", title: "Treino A · Força", day_of_week: today.getDay() }],
        }}
        cycleProgress={29}
        weeklySessionCount={2}
        trainedDays={new Set([1, 3])}
        currentDayOfWeek={today.getDay()}
        totalSessions={12}
        weeklyGoal={3}
        streak={4}
        goalEditor={<button type="button" onClick={() => setDestination("editar-meta")}>Editar meta</button>}
        leaderboard={(
          <section aria-label="Ranking do mês" className="rounded-xl border border-border bg-card p-4">
            <p className="text-eyebrow flex items-center gap-2"><Trophy className="h-4 w-4 text-yellow-500" /> Ranking de agosto</p>
            <p className="mt-2 text-sm font-semibold">#4 · Você · 320 XP</p>
          </section>
        )}
        onNavigate={(view, nextWorkoutId) => {
          setDestination(view);
          setWorkoutId(nextWorkoutId ?? null);
        }}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
