import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Trophy } from "lucide-react";
import { StudentHome } from "../src/components/student/StudentHome";
import "../src/index.css";

function Fixture() {
  const [destination, setDestination] = useState("home");
  return (
    <main className="mx-auto min-h-screen max-w-md bg-background p-4">
      <p data-destination={destination} className="sr-only">{destination}</p>
      <StudentHome
        studentName="Aluno Sintético"
        enrollmentInfo={{ plan_name: "Plano teste", start_date: "2026-08-01", end_date: "2026-12-01" }}
        overallProgress={24}
        selectedCycle={{
          id: "cycle-synthetic",
          cycle_number: 2,
          start_date: "2026-08-18",
          end_date: "2026-09-28",
          status: "active",
          workouts: [{ id: "workout-b", title: "Treino B", day_of_week: new Date().getDay() }],
        }}
        cycleProgress={30}
        workoutCount={3}
        weeklySessionCount={2}
        trainedDays={new Set([1, 3])}
        currentDayOfWeek={new Date().getDay()}
        totalSessions={12}
        weeklyGoal={3}
        streak={4}
        leaderboard={(
          <section aria-label="Ranking do mês" className="rounded-xl border border-border bg-card p-4">
            <p className="text-eyebrow flex items-center gap-2"><Trophy className="h-4 w-4 text-yellow-500" /> Ranking de agosto</p>
            <p className="mt-2 text-sm font-semibold">#4 · Você · 320 XP</p>
          </section>
        )}
        hasCorrida
        hasNatacao
        hasCiclismo
        hasNutrition
        onNavigate={(view) => setDestination(view)}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
