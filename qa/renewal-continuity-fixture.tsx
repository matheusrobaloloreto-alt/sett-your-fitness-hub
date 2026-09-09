import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StudentWorkout from "../src/pages/student/StudentWorkout";
import "../src/index.css";

createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={["/workout/student-renewal-qa"]}>
    <Routes>
      <Route path="/workout/:studentId" element={<StudentWorkout />} />
    </Routes>
  </MemoryRouter>,
);
