export const WARMUP_VIDEO_MATCHES: Record<string, string[]> = {
  "rotação de ombros": ["CARs de ombro"],
  "agachamento livre": ["Agachamento livre (air squat)"],
  "afundo dinâmico": ["Afundo (peso corporal)"],
  "mobilidade de tornozelo": ["Mobilidade de Tornozelo"],
  "bom-dia sem carga": ["Bom dia"],
  "ponte de glúteo": ["Ponte de glúteo"],
  "círculos de braço": ["CARs de ombro"],
  "band pull-apart": ["Band pull-apart"],
  "elevação lateral leve": ["Elevação Lateral Halteres"],
  "gato-camelo": ["Cat-camel (gato-camelo)"],
  "caminhada com elástico lateral": ["Caminhada lateral com mini band"],
  "abdução em pé": ["Abdução de quadril em pé com banda"],
  "dead bug": ["Dead bug de ativação"],
  "prancha": ["Prancha frontal"],
  "flexão lenta de braços": ["Flexão de braço"],
};

export const WARMUP_VIDEO_LIBRARY_NAMES = [...new Set(Object.values(WARMUP_VIDEO_MATCHES).flat())];
