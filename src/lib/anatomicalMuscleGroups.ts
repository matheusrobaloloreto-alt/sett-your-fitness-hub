const normalizeGroup = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const ANATOMICAL_GROUPS: Record<string, string> = {
  peito: "Peitoral",
  peitoral: "Peitoral",
  peitorais: "Peitoral",
  costas: "Dorsal",
  dorsal: "Dorsal",
  dorsais: "Dorsal",
  latissimo: "Dorsal",
  latissimos: "Dorsal",
  ombro: "Ombro",
  ombros: "Ombro",
  deltoide: "Ombro",
  deltoides: "Ombro",
  "deltoide anterior": "Deltoide Anterior",
  "deltoide lateral": "Deltoide Lateral",
  "deltoide posterior": "Deltoide Posterior",
  biceps: "Bíceps",
  triceps: "Tríceps",
  antebraco: "Antebraço",
  antebracos: "Antebraço",
  braquiorradial: "Braquiorradial",
  abdomen: "Abdominais",
  abdominal: "Abdominais",
  abdominais: "Abdominais",
  trapezio: "Trapézio",
  trapezios: "Trapézio",
  "trapezio inferior": "Trapézio Inferior",
  lombar: "Lombar / Eretores",
  "lombar eretores": "Lombar / Eretores",
  eretores: "Lombar / Eretores",
  "eretores da espinha": "Lombar / Eretores",
  gluteo: "Glúteo",
  gluteos: "Glúteo",
  "gluteo maximo": "Glúteo",
  "gluteo medio": "Glúteo",
  "gluteo minimo": "Glúteo",
  quadriceps: "Quadríceps",
  "reto femoral": "Reto Femoral",
  "posterior de coxa": "Posterior de Coxa",
  posterior: "Posterior de Coxa",
  posteriores: "Posterior de Coxa",
  isquiotibiais: "Posterior de Coxa",
  hamstring: "Posterior de Coxa",
  hamstrings: "Posterior de Coxa",
  adutor: "Adutores",
  adutores: "Adutores",
  "adutor magno": "Adutor Magno",
  abdutor: "Abdutores",
  abdutores: "Abdutores",
  panturrilha: "Panturrilha",
  panturrilhas: "Panturrilha",
  gastrocnemio: "Panturrilha",
  gastrocnemios: "Panturrilha",
  soleo: "Panturrilha",
  "tibial anterior": "Tibial Anterior",
  "flexores de quadril": "Flexores de Quadril",
  iliopsoas: "Flexores de Quadril",
  manguito: "Manguito",
  "manguito rotador": "Manguito",
  serratil: "Serrátil",
  "serratil anterior": "Serrátil",
};

/**
 * Retorna um rótulo anatômico canônico ou null para categorias funcionais.
 * A allowlist falha fechada para impedir que filtros gravados em muscle_group
 * (core, mobilidade, performance etc.) contaminem os gráficos de volume.
 */
export function canonicalAnatomicalMuscleGroup(value: unknown): string | null {
  const key = normalizeGroup(value);
  return key ? ANATOMICAL_GROUPS[key] ?? null : null;
}

export function isAnatomicalMuscleGroup(value: unknown): boolean {
  return canonicalAnatomicalMuscleGroup(value) !== null;
}
