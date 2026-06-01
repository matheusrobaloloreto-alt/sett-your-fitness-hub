import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Clock, Dumbbell, TrendingUp, CheckCircle2, Share2, MessageCircle } from "lucide-react";
import type { ExerciseSummaryItem } from "@/hooks/useWorkoutSession";

interface WorkoutSummaryProps {
  open: boolean;
  onClose: () => void;
  durationSeconds: number;
  totalVolume: number;
  totalSetsCompleted: number;
  totalSetsPrescribed: number;
  exercises: ExerciseSummaryItem[];
  formatTime: (s: number) => string;
  whatsappNumber?: string | null;
}

export function WorkoutSummary({
  open, onClose, durationSeconds, totalVolume, totalSetsCompleted, totalSetsPrescribed, exercises, formatTime, whatsappNumber
}: WorkoutSummaryProps) {
  const prs = exercises.filter(e => e.isPR);

  const shareText = () => {
    const lines = [
      `🏋️ Treino concluído!`,
      `⏱ Duração: ${formatTime(durationSeconds)}`,
      `📊 Volume: ${totalVolume.toLocaleString("pt-BR")}kg`,
      `✅ Séries: ${totalSetsCompleted}/${totalSetsPrescribed}`,
      prs.length > 0 ? `🏆 ${prs.length} PR(s): ${prs.map(p => `${p.name} (${p.maxWeight}kg)`).join(", ")}` : "",
      `\n#SetTraining`,
    ].filter(Boolean).join("\n");

    if (navigator.share) {
      navigator.share({ text: lines }).catch(() => {});
    } else {
      navigator.clipboard.writeText(lines);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-primary text-xl" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            TREINO CONCLUÍDO! 💪
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <Clock className="h-5 w-5 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold font-mono text-foreground">{formatTime(durationSeconds)}</p>
              <p className="text-[10px] text-muted-foreground font-sans uppercase">Duração</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <Dumbbell className="h-5 w-5 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold font-mono text-foreground">{totalVolume.toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-muted-foreground font-sans uppercase">Volume (kg)</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <CheckCircle2 className="h-5 w-5 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold font-mono text-foreground">{totalSetsCompleted}/{totalSetsPrescribed}</p>
              <p className="text-[10px] text-muted-foreground font-sans uppercase">Séries</p>
            </div>
          </div>

          {/* PRs */}
          {prs.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-sans font-semibold text-yellow-500">
                  {prs.length} Novo{prs.length > 1 ? "s" : ""} PR{prs.length > 1 ? "s" : ""}!
                </span>
              </div>
              {prs.map((pr, i) => (
                <div key={i} className="flex items-center justify-between text-xs font-sans">
                  <span className="text-foreground">{pr.name}</span>
                  <Badge variant="outline" className="border-yellow-500/50 text-yellow-500 text-[10px]">
                    {pr.maxWeight}kg
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {/* Exercise list */}
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {exercises.map((ex, i) => (
              <div key={i} className="flex items-center justify-between text-xs font-sans py-1 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2">
                  {ex.isPR && <TrendingUp className="h-3 w-3 text-yellow-500" />}
                  <span className="text-foreground">{ex.name}</span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>{ex.maxWeight}kg máx</span>
                  <span>{ex.volume.toLocaleString("pt-BR")}kg vol</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={shareText} variant="outline" className="w-full font-sans gap-2">
            <Share2 className="h-4 w-4" />
            Compartilhar
          </Button>
          {whatsappNumber && (
            <Button
              onClick={() => {
                const feedbackText = [
                  `💬 Feedback do treino`,
                  `⏱ Duração: ${formatTime(durationSeconds)}`,
                  `📊 Volume: ${totalVolume.toLocaleString("pt-BR")}kg`,
                  `✅ Séries: ${totalSetsCompleted}/${totalSetsPrescribed}`,
                  prs.length > 0 ? `🏆 ${prs.length} PR(s)!` : "",
                ].filter(Boolean).join("\n");
                window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(feedbackText)}`, "_blank");
              }}
              className="w-full font-sans gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white"
            >
              <MessageCircle className="h-4 w-4" />
              Enviar Feedback
            </Button>
          )}
          <Button onClick={onClose} className="w-full font-sans">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
