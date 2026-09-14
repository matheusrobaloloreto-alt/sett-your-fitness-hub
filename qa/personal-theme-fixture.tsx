/* eslint-disable react-refresh/only-export-components */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Dumbbell, LogOut, Megaphone } from "lucide-react";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { Button } from "../src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../src/components/ui/card";
import { EditorialPageHeader } from "../src/components/EditorialPageHeader";
import {
  PersonalThemeIconToggleControl,
  PersonalThemeSegmentedControlView,
} from "../src/components/PersonalThemeToggle";
import {
  applyPlatformTheme,
  resolvePersonalThemeMode,
  storePersonalThemeMode,
  type PersonalThemeMode,
} from "../src/lib/personalTheme";
import "../src/index.css";

const settings = {
  primary_color: "#1D2D5C",
  background_color: "#FAFAF7",
  card_color: "#F2F0EA",
  text_color: "#0A0A0A",
};

function Fixture() {
  const [themeMode, setThemeModeState] = useState<PersonalThemeMode>(() => resolvePersonalThemeMode("student-theme-fixture"));

  const setThemeMode = (mode: PersonalThemeMode) => {
    storePersonalThemeMode(mode, "student-theme-fixture");
    setThemeModeState(mode);
  };

  useEffect(() => {
    applyPlatformTheme(settings, themeMode);
  }, [themeMode]);

  return (
    <TooltipProvider>
      <main className="min-h-screen bg-background text-foreground">
        <EditorialPageHeader
          compactMobile
          className="bg-card sm:px-6"
          innerClassName="mx-auto max-w-2xl"
          overline="Portal do aluno"
          title="MEU TREINO"
          titleClassName="text-xl text-primary sm:text-2xl"
          leading={<span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10"><Dumbbell className="h-5 w-5 text-primary" /></span>}
          context={<span className="text-foreground">Aluno Tema Pessoal</span>}
          actions={(
            <>
              <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Avisos" title="Avisos"><Megaphone className="h-4 w-4" /></Button>
              <PersonalThemeIconToggleControl themeMode={themeMode} setThemeMode={setThemeMode} />
              <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Sair" title="Sair"><LogOut className="h-4 w-4" /></Button>
            </>
          )}
        />

        <section className="mx-auto max-w-2xl space-y-4 px-4 py-5 sm:px-6">
          <Card className="student-action-surface border-primary">
            <CardContent className="p-5">
              <p className="font-mono-data text-[11px] uppercase tracking-[0.18em] text-primary-foreground/70">
                Treino de hoje
              </p>
              <h2 className="mt-1 font-display text-2xl text-primary-foreground">Treino A</h2>
              <p className="mt-2 text-sm text-primary-foreground/78">Força bem executada, descanso controlado e registro simples.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Tema pessoal</CardTitle>
            </CardHeader>
            <CardContent>
              <PersonalThemeSegmentedControlView themeMode={themeMode} setThemeMode={setThemeMode} className="w-full max-w-xs" />
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-sm font-semibold text-foreground">Estatísticas</p>
              <p className="text-xs text-muted-foreground">Volume e consistência</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-sm font-semibold text-foreground">Avisos</p>
              <p className="text-xs text-muted-foreground">Comunicação da equipe</p>
            </div>
          </div>
        </section>
      </main>
    </TooltipProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
