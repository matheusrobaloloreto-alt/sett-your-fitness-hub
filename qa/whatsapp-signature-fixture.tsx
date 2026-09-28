import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "../src/components/ui/sonner";
import "./teacher-mobile-fixture";

// Reuse the existing mocked app; add the production toast renderer it omits.
const toastHost = document.createElement("div");
document.body.appendChild(toastHost);
createRoot(toastHost).render(<Toaster />);
