import { Bike, Dumbbell, Footprints, House, Utensils, Waves } from "lucide-react";
import { motion } from "framer-motion";

const destinations = [
  { view: "home", label: "Início", Icon: House },
  { view: "treino", label: "Treino", Icon: Dumbbell },
  { view: "corrida", label: "Corrida", Icon: Footprints },
  { view: "ciclismo", label: "Ciclismo", Icon: Bike },
  { view: "natacao", label: "Natação", Icon: Waves },
  { view: "nutricao", label: "Nutri", Icon: Utensils },
] as const;

export type StudentPrimaryView = (typeof destinations)[number]["view"];

export const studentSpring = { type: "spring", mass: 1, stiffness: 310, damping: 31 } as const;

export function StudentPortalNavigation({
  activeView,
  onNavigate,
  reducedMotion,
}: {
  activeView: string;
  onNavigate: (view: StudentPrimaryView) => void;
  reducedMotion: boolean;
}) {
  return (
    <nav className="student-linen-dock student-linen-glass" aria-label="Navegação do aluno">
      {destinations.map(({ view, label, Icon }) => (
        <motion.button
          key={view}
          type="button"
          aria-current={activeView === view ? "page" : undefined}
          onClick={() => onNavigate(view)}
          whileTap={reducedMotion ? undefined : { scale: 0.93 }}
          transition={studentSpring}
        >
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </motion.button>
      ))}
    </nav>
  );
}
