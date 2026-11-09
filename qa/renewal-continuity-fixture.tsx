import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SUPABASE_AUTH_STORAGE_KEY } from "../src/lib/supabaseAuthStorage";
import "../src/index.css";

async function mountFixture() {
  const session = sessionStorage.getItem("sett-renewal-qa-session");
  if (!session) throw new Error("The renewal QA fixture requires a synthetic session");
  localStorage.setItem(SUPABASE_AUTH_STORAGE_KEY, session);

  // The client initializes when these modules load. Seed its actual key first.
  const [{ AuthProvider }, { default: StudentWorkout }] = await Promise.all([
    import("../src/hooks/useAuth"),
    import("../src/pages/student/StudentWorkout"),
  ]);
  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/workout/student-renewal-qa"]}>
          <Routes>
            <Route path="/workout/:studentId" element={<StudentWorkout />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

void mountFixture();
