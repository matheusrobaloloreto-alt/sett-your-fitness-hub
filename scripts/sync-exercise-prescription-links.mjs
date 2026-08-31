import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

function loadDotenv(path) {
  if (!fs.existsSync(path)) return;
  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (process.env[key]) continue;
    process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
  }
}

loadDotenv(".env.local");
loadDotenv(".env");

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.BN_SYNC_EMAIL;
const password = process.env.BN_SYNC_PASSWORD;

if (!url || !key) {
  throw new Error("Missing VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY.");
}

if (!email || !password) {
  throw new Error("Missing BN_SYNC_EMAIL/BN_SYNC_PASSWORD.");
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError || !authData.user) {
  throw new Error(`Auth failed: ${authError?.message || "no user"}`);
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compact(items) {
  return [...new Set(items.filter(Boolean))];
}

const anatomicalGroupAliases = new Map(Object.entries({
  peito: "Peitoral",
  peitoral: "Peitoral",
  peitorais: "Peitoral",
  costas: "Dorsal",
  dorsal: "Dorsal",
  dorsais: "Dorsal",
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
  braquiorradial: "Braquiorradial",
  abdomen: "Abdominais",
  abdominal: "Abdominais",
  abdominais: "Abdominais",
  trapezio: "Trapézio",
  "trapezio inferior": "Trapézio Inferior",
  lombar: "Lombar / Eretores",
  "lombar eretores": "Lombar / Eretores",
  eretores: "Lombar / Eretores",
  gluteo: "Glúteo",
  gluteos: "Glúteo",
  quadriceps: "Quadríceps",
  "reto femoral": "Reto Femoral",
  posterior: "Posterior de Coxa",
  posteriores: "Posterior de Coxa",
  "posterior de coxa": "Posterior de Coxa",
  isquiotibiais: "Posterior de Coxa",
  adutor: "Adutores",
  adutores: "Adutores",
  "adutor magno": "Adutor Magno",
  abdutor: "Abdutores",
  abdutores: "Abdutores",
  panturrilha: "Panturrilha",
  panturrilhas: "Panturrilha",
  "tibial anterior": "Tibial Anterior",
  "flexores de quadril": "Flexores de Quadril",
  iliopsoas: "Flexores de Quadril",
  manguito: "Manguito",
  "manguito rotador": "Manguito",
  serratil: "Serrátil",
  "serratil anterior": "Serrátil",
}));

function canonicalAnatomicalGroup(value) {
  return anatomicalGroupAliases.get(normalize(value)) || null;
}

function inferMuscleGroup(exercise) {
  const text = normalize(`${exercise.name} ${exercise.description || ""} ${exercise.muscle_group || ""}`);
  const explicit = canonicalAnatomicalGroup(exercise.muscle_group);

  if (explicit) return explicit;

  if (/abdomen|abdominal|prancha|pallof|bird dog|perdigueiro|anti rotacao/.test(text)) return "Abdominais";
  if (/glute|quadril|abducao|ponte|elevacao pelvica|hip thrust|mini band/.test(text)) return "Glúteo";
  if (/posterior|isquio|flexao de joelho|stiff|deadlift|terra|hamstring/.test(text)) return "Posterior de Coxa";
  if (/quadriceps|agach|squat|leg press|afundo|passada|lunge|step|bulgar|knee drive|front squat/.test(text)) return "Quadríceps";
  if (/panturrilha|calf|tornozelo|ankle|tibial/.test(text)) return "Panturrilha";
  if (/adutor|aducao|copenhagen/.test(text)) return "Adutores";
  if (/peito|peitoral|supino|flexao|push up|crucifixo|chest/.test(text)) return "Peitoral";
  if (/costas|dorsal|remada|puxada|pull|row|yt|y t/.test(text)) return "Dorsal";
  if (/ombro|shoulder|deltoide|face pull|manguito|rotacao externa|halo|push press|overhead/.test(text)) return "Deltoide Posterior";
  if (/biceps|rosca/.test(text)) return "Bíceps";
  if (/triceps|paralela|frances|testa/.test(text)) return "Tríceps";
  if (/lombar|eretor|superman|extensao da coluna/.test(text)) return "Lombar / Eretores";
  // Categorias de filtro nunca podem virar muscle_group. Sem pista anatômica,
  // deixe o item para revisão em vez de poluir alvos/volume futuros.
  if (/cardio|corrida|esteira|bike|bicicleta|pedal|natacao/.test(text)) return null;
  if (/mobilidade|along|liberacao|rolinho/.test(text)) return null;
  if (/fisio|fisioterapia|controle motor|estabilidade|propriocepcao/.test(text)) return null;
  if (/performance|plio|jump|hops|bound|drop|shuffle|wall drill|snatch|swing/.test(text)) return null;
  if (/pilates|swan dive|musculacao/.test(text)) return null;

  return null;
}

function inferEquipment(exercise) {
  const text = normalize(`${exercise.name} ${exercise.description || ""} ${exercise.muscle_group || ""}`);
  if (/mini band|elastico|band/.test(text)) return "elástico";
  if (/polia|cabo/.test(text)) return "cabo";
  if (/halter|dumbbell|db/.test(text)) return "halteres";
  if (/barra|barbell|smith/.test(text)) return "barra";
  if (/maquina|leg press|banco romano/.test(text)) return "máquina";
  if (/medball|medicine ball/.test(text)) return "med ball";
  if (/kettlebell|kb/.test(text)) return "kettlebell";
  if (/parede|wall|solo|prancha|mobilidade|along|liberacao|jump|hops|bound|drop/.test(text)) return "livre";
  return exercise.equipment || "livre";
}

function inferMetadata(exercise) {
  const text = normalize(`${exercise.name} ${exercise.description || ""} ${exercise.muscle_group || ""}`);
  const contraindications = [];
  const painTags = [];
  const regressions = [];
  const progressions = [];

  if (/jump|salto|plio|drop|bound|hops|shuffle|snatch|swing/.test(text)) {
    contraindications.push("dor_joelho_aguda", "dor_lombar_aguda", "fase_inicial_retorno_lesao");
    painTags.push("joelho", "lombar", "tornozelo");
    regressions.push("Trocar por padrão sem impacto e reduzir amplitude.");
    progressions.push("Progredir altura, velocidade ou complexidade apenas com aterrissagem estável.");
  }
  if (/agach|squat|afundo|passada|lunge|bulgar|leg press|step/.test(text)) {
    contraindications.push("dor_joelho_aguda");
    painTags.push("joelho", "valgo_dinamico");
    regressions.push("Reduzir amplitude, usar apoio e manter dor <= 3.");
    progressions.push("Aumentar amplitude antes de carga.");
  }
  if (/terra|deadlift|stiff|good morning|swing|hip hinge/.test(text)) {
    contraindications.push("dor_lombar_aguda", "butt_wink_severo");
    painTags.push("lombar");
    regressions.push("Reduzir carga axial e trocar por ponte/hip thrust se houver dor.");
    progressions.push("Progredir carga somente com coluna neutra.");
  }
  if (/overhead|push press|desenvolvimento|snatch|halo|ombro|shoulder|face pull|rotacao externa/.test(text)) {
    contraindications.push("dor_ombro_aguda");
    painTags.push("ombro", "cifose_protracao");
    regressions.push("Preferir pegada neutra, menor amplitude e controle escapular.");
    progressions.push("Progredir amplitude antes de carga acima da cabeça.");
  }
  if (/mobilidade|along|liberacao|fisio|rolinho/.test(text)) {
    painTags.push("mobilidade", "retorno_gradual");
    regressions.push("Diminuir pressão/amplitude e respirar sem dor.");
    progressions.push("Aumentar tempo sob controle ou amplitude ativa.");
  }

  if (regressions.length === 0) regressions.push("Reduzir carga/amplitude e manter dor <= 3.");
  if (progressions.length === 0) progressions.push("Progredir repetições antes da carga mantendo técnica.");

  return {
    contraindications: compact(contraindications),
    regressions: compact(regressions),
    progressions: compact(progressions),
    equivalent_substitutes: [],
    pain_limitation_tags: compact(painTags),
    notes: "Sincronizado automaticamente para uso no BN Prescription Engine.",
  };
}

async function fetchAll(table, columns) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

const [exercises, muscleGroups, existingTargets, existingMetadata] = await Promise.all([
  fetchAll("exercise_library", "id,name,description,muscle_group,muscle_group_id,equipment,difficulty,is_global,company_id"),
  fetchAll("muscle_groups", "id,name"),
  fetchAll("exercise_muscle_targets", "exercise_id,muscle_group_id,role,volume_percentage,is_primary"),
  fetchAll("exercise_metadata", "exercise_id"),
]);

const groupByName = new Map(muscleGroups.map((group) => [normalize(group.name), group]));
const hasTarget = new Set(existingTargets.map((target) => target.exercise_id));
const hasMetadata = new Set(existingMetadata.map((meta) => meta.exercise_id));

let updatedLibrary = 0;
let insertedTargets = 0;
let insertedMetadata = 0;
const unresolvedGroups = [];

for (const exercise of exercises) {
  const groupName = inferMuscleGroup(exercise);
  const group = groupName ? groupByName.get(normalize(groupName)) : null;
  if (!group) {
    unresolvedGroups.push({ id: exercise.id, name: exercise.name, groupName, current: exercise.muscle_group });
    continue;
  }

  const libraryPatch = {};
  if (!exercise.muscle_group || normalize(exercise.muscle_group) === "geral" || normalize(exercise.muscle_group) === "outros") {
    libraryPatch.muscle_group = group.name;
  }
  if (!exercise.muscle_group_id) libraryPatch.muscle_group_id = group.id;
  if (!exercise.equipment) libraryPatch.equipment = inferEquipment(exercise);
  if (!exercise.difficulty) libraryPatch.difficulty = /jump|plio|snatch|swing|drop|bound/i.test(exercise.name) ? "advanced" : "intermediate";

  if (Object.keys(libraryPatch).length > 0) {
    const { error } = await supabase.from("exercise_library").update(libraryPatch).eq("id", exercise.id);
    if (error) throw new Error(`exercise_library ${exercise.name}: ${error.message}`);
    updatedLibrary += 1;
  }

  if (!hasTarget.has(exercise.id)) {
    const { error } = await supabase.from("exercise_muscle_targets").insert({
      exercise_id: exercise.id,
      muscle_group_id: group.id,
      role: "primary",
      volume_percentage: 100,
      is_primary: true,
    });
    if (error) throw new Error(`exercise_muscle_targets ${exercise.name}: ${error.message}`);
    insertedTargets += 1;
  }

  if (!hasMetadata.has(exercise.id)) {
    const { error } = await supabase.from("exercise_metadata").insert({
      exercise_id: exercise.id,
      ...inferMetadata(exercise),
    });
    if (error) throw new Error(`exercise_metadata ${exercise.name}: ${error.message}`);
    insertedMetadata += 1;
  }
}

const mfitExercises = exercises.filter((exercise) => String(exercise.description || "").includes("Importado do MFIT"));
const result = {
  user: authData.user.email,
  total_exercises_seen: exercises.length,
  mfit_exercises_seen: mfitExercises.length,
  updated_library_rows: updatedLibrary,
  inserted_targets: insertedTargets,
  inserted_metadata: insertedMetadata,
  unresolved_groups: unresolvedGroups.slice(0, 20),
  unresolved_count: unresolvedGroups.length,
};

console.log(JSON.stringify(result, null, 2));
