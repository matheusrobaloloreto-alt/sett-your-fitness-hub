import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../src/hooks/useAuth";
import StudentWorkout from "../src/pages/student/StudentWorkout";
import "../src/index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <MemoryRouter initialEntries={["/workout/student-renewal-qa"]}>
        <Routes>
          <Route path="/workout/:studentId" element={<StudentWorkout />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  </QueryClientProvider>,
);
